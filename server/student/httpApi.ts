import { isPublicMediaPath, allowedPublicMediaType } from "../../src/shared/publicMedia";
import type { IncomingMessage, ServerResponse } from "http";
import {
  getPool,
  deleteStorageFiles,
  ensureSchema,
  mutateAppState,
  pingPostgres,
  readAppState,
  readStorageFile,
  writeAppState,
  writeStorageFile,
} from "./postgres";
import {
  getEmailProvider,
  getResendFromAddress,
  isEmailConfigured,
  verifySmtpConnection,
} from "./emailVerification";
import {
  destroySession,
  getSessionByToken,
  readBearerToken,
  signInUser,
  signUpUser,
  updatePasswordForToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./studentAuth";
import { handleWhatsAppRequest, isWhatsAppConfigured, isWhatsAppPath } from "./whatsapp";
import { rowMatches } from "./postgres";
import { canUseFile, checkMutation, rowsForFilters, viewerFromRequest, visibleRows } from "./dataPolicy";

const API_PATHS = new Set(["/__local_db", "/__db_health", "/__auth", "/__session", "/__storage", "/__public_media"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function isApiPath(pathname: string) {
  return API_PATHS.has(pathname) || isWhatsAppPath(pathname);
}

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  /**
   * The student API was written as a standalone Node handler that read the
   * request stream itself. Since the merge it runs inside Express, and
   * express.json() drains that stream before this handler ever sees it — so
   * every POST sat here waiting for a "data" event that would never arrive,
   * and the browser gave up after three 15-second attempts with
   * "PostgreSQL request timed out". Nothing was ever wrong with Postgres.
   *
   * When Express has already parsed the body, use it. Raw uploads
   * (/__storage) arrive with a non-JSON content type, are left untouched by
   * express.json(), and still stream through the path below.
   */
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined && parsed !== null) {
    if (typeof parsed === "string") return Promise.resolve(parsed);
    if (Buffer.isBuffer(parsed)) return Promise.resolve(parsed.toString("utf8"));
    if (typeof parsed === "object") {
      // express.json() gives {} for an empty body; keep that distinguishable
      // from a body it actually parsed.
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length > 0) return Promise.resolve(JSON.stringify(parsed));
      if (!req.readable) return Promise.resolve("");
    }
  }

  // The stream was consumed by upstream middleware and there is nothing
  // parsed to fall back on — resolve empty rather than hang forever.
  if (!req.readable) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        reject(new Error(`Request body too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        reject(new Error(`Upload too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify(payload, (_key, value) => {
      if (typeof value === "bigint") return Number(value);
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const parsed = new URL(req.url || "/", "http://localhost");
  const url = parsed.pathname;

  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (url === "/__public_media" && req.method === "GET") {
      const path = parsed.searchParams.get("path") || "";
      if (!isPublicMediaPath(path)) { sendJson(res, 404, { error: "Media not found." }); return; }
      const dataUrl = await readStorageFile(path);
      const match = dataUrl?.match(/^data:(image\/(?:png|jpeg|gif|webp|avif)|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|mp4)|application\/pdf);base64,([a-zA-Z0-9+/=\s]+)$/);
      if (!match) { sendJson(res, 404, { error: "Media not found or unsupported format." }); return; }
      res.statusCode = 200;
      res.setHeader("Content-Type", match[1]);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(Buffer.from(match[2], "base64"));
      return;
    }

    if (url === "/__db_health") {
      await ensureSchema();
      const info = await pingPostgres();
      const state = await readAppState({ table: "document_checklists" });
      const emailConfigured = isEmailConfigured();
      const emailProvider = getEmailProvider();
      const smtp = emailConfigured ? await verifySmtpConnection() : { ok: false, error: "Email credentials are missing.", provider: "none" };
      sendJson(res, 200, {
        ok: true,
        ...info,
        emailConfigured,
        emailProvider,
        resendFrom: emailProvider === "resend" ? getResendFromAddress() : undefined,
        smtpOk: smtp.ok,
        smtpError: smtp.ok ? undefined : smtp.error,
        documentChecklists: (state.tables.document_checklists || []).length,
        whatsappConfigured: isWhatsAppConfigured(),
        whatsappProvider: process.env.WHATSAPP_PROVIDER || "meta",
      });
      return;
    }

    if (isWhatsAppPath(url)) {
      await handleWhatsAppRequest(req, res);
      return;
    }

    if (url === "/__auth" && req.method === "GET") {
      const session = await getSessionByToken(readBearerToken(req));
      sendJson(res, 200, { session });
      return;
    }

    if (url === "/__auth" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (body.action === "signin") {
        const result = await signInUser(body.email, body.password);
        sendJson(res, result.error ? (result.status || 401) : 200, result.error ? { error: result.error } : { session: result.session });
        return;
      }
      if (body.action === "signup") {
        const result = await signUpUser({
          email: body.email,
          password: body.password,
          user_metadata: body.user_metadata || body.data || {},
        });
        if (result.error) {
          sendJson(res, result.status || 400, { error: result.error });
          return;
        }
        sendJson(res, 200, { session: result.session });
        return;
      }
      if (body.action === "signout") {
        await destroySession(body.token || readBearerToken(req));
        sendJson(res, 200, { ok: true, session: null });
        return;
      }
      if (body.action === "reset_request") {
        const result = await requestPasswordReset(body.email, String(req.headers.host || ""));
        sendJson(res, result.error ? (result.status || 400) : 200, result.error ? { error: result.error } : { ok: true });
        return;
      }
      if (body.action === "reset_confirm") {
        const result = await resetPasswordWithToken(body.reset_token, body.password);
        sendJson(res, result.error ? (result.status || 400) : 200, result.error ? { error: result.error } : { ok: true });
        return;
      }
      if (body.action === "password") {
        const result = await updatePasswordForToken(body.token || readBearerToken(req), body.password);
        sendJson(res, result.error ? (result.status || 400) : 200, result.error ? { error: result.error } : { user: result.user });
        return;
      }
      // (A raw "insert auth user" action used to be here, open to anyone.
      // Accounts are created only through signup or Admin -> Users now.)
      sendJson(res, 400, { error: "Unknown auth action" });
      return;
    }

    if (url === "/__session" && req.method === "PUT") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url === "/__storage" && req.method === "GET") {
      if (parsed.searchParams.get("action") === "list") {
        const viewer = await viewerFromRequest(req);
        if (!viewer) { sendJson(res, 401, { error: "Sign in required." }); return; }
        const requested = parsed.searchParams.get("prefix") || "";
        const prefix = viewer.admin ? requested : `${viewer.userId}/${requested}`;
        const { rows } = await getPool().query(
          "SELECT path, length(data_url) AS encoded_size FROM app_storage WHERE starts_with(path, $1) ORDER BY path LIMIT 200",
          [prefix],
        );
        sendJson(res, 200, { files: rows.map((row) => ({ name: row.path, created_at: null, metadata: { size: Math.floor(Number(row.encoded_size) * 3 / 4) } })) });
        return;
      }

      const filePath = parsed.searchParams.get("path") || "";
      if (!(await canUseFile(await viewerFromRequest(req), filePath, "read"))) {
        sendJson(res, 403, { error: "You don't have access to this file." });
        return;
      }
      const dataUrl = await readStorageFile(filePath);
      if (!dataUrl) {
        sendJson(res, 404, { error: "File not found" });
        return;
      }
      sendJson(res, 200, { dataUrl });
      return;
    }

    if (url === "/__storage" && req.method === "PUT") {
      const contentType = String(req.headers["content-type"] || "");
      const viewer = await viewerFromRequest(req);
      if (contentType.includes("application/json")) {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (!(await canUseFile(viewer, String(body.path || ""), "write"))) {
          sendJson(res, 403, { error: "You can only upload to your own folder." });
          return;
        }
        if (isPublicMediaPath(String(body.path || "")) && !allowedPublicMediaType(String(body.dataUrl || "").match(/^data:([^;]+);base64,/)?.[1] || "")) {
          sendJson(res, 415, { error: "Unsupported public media format. Use PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, audio or PDF." }); return;
        }
        await writeStorageFile(body.path, body.dataUrl);
        sendJson(res, 200, { ok: true, path: body.path });
        return;
      }

      const filePath = parsed.searchParams.get("path") || "";
      if (!filePath) {
        sendJson(res, 400, { error: "path query parameter is required" });
        return;
      }
      if (!(await canUseFile(viewer, filePath, "write"))) {
        sendJson(res, 403, { error: "You can only upload to your own folder." });
        return;
      }

      const buffer = await readRawBody(req);
      const mime = contentType.split(";")[0]?.trim() || "application/octet-stream";
      if (isPublicMediaPath(filePath) && !allowedPublicMediaType(mime)) {
        sendJson(res, 415, { error: "Unsupported public media format." }); return;
      }
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      await writeStorageFile(filePath, dataUrl);
      sendJson(res, 200, { ok: true, path: filePath });
      return;
    }

    if (url === "/__storage" && req.method === "DELETE") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const viewer = await viewerFromRequest(req);
      const paths = (Array.isArray(body.paths) ? body.paths : []).map(String);
      for (const p of paths) {
        if (!(await canUseFile(viewer, p, "write"))) {
          sendJson(res, 403, { error: "You can only delete your own files." });
          return;
        }
      }
      await deleteStorageFiles(paths);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url === "/__local_db" && req.method === "GET") {
      await ensureSchema();
      const viewer = await viewerFromRequest(req);
      const table = parsed.searchParams.get("table") || undefined;
      if (!table) {
        // The whole database in one response (every table, every email):
        // admins only. The portal itself never asks for it.
        if (!viewer?.admin) {
          sendJson(res, 403, { error: "Not allowed." });
          return;
        }
        sendJson(res, 200, await readAppState({ includeStorage: false }));
        return;
      }
      const state = await readAppState({ table, includeStorage: false });
      const rows = await visibleRows(viewer, table, state.tables[table] || []);
      if (rows === null) {
        sendJson(res, viewer ? 403 : 401, { error: viewer ? "Not allowed." : "Sign in required." });
        return;
      }
      sendJson(res, 200, { rows });
      return;
    }

    if (url === "/__local_db" && req.method === "POST") {
      const mutation = JSON.parse((await readBody(req)) || "{}");
      const viewer = await viewerFromRequest(req);
      const table = String(mutation.table || "");
      let matching: any[] = [];
      if (mutation.action === "update" || mutation.action === "delete") {
        matching = await rowsForFilters(table, mutation.filters, rowMatches);
      } else if (mutation.action === "insert" || mutation.action === "upsert") {
        // Inserts overwrite on an existing id, and upserts on their conflict
        // key, so both are checked against the rows they would replace.
        const key = mutation.action === "upsert" ? String(mutation.upsertConflict || "id") : "id";
        const wanted = new Set((mutation.rows || []).map((r: any) => String(r?.[key] ?? "")).filter(Boolean));
        if (wanted.size) {
          matching = (await rowsForFilters(table, undefined, rowMatches)).filter((r) => wanted.has(String(r[key] ?? "")));
        }
      }
      const denied = await checkMutation(viewer, mutation, matching);
      if (denied) {
        sendJson(res, viewer ? 403 : 401, { error: denied });
        return;
      }
      const result = await mutateAppState(mutation);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (url === "/__local_db" && req.method === "PUT") {
      // Replaces the entire database. Only a super admin may, and the
      // portal never does.
      const viewer = await viewerFromRequest(req);
      if (viewer?.role !== "super_admin") {
        sendJson(res, 403, { error: "Not allowed." });
        return;
      }
      await writeAppState(JSON.parse((await readBody(req)) || "{}"));
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    sendJson(res, 500, { error: error.message });
  }
}
