import type { IncomingMessage, ServerResponse } from "http";
import {
  deleteStorageFiles,
  ensureSchema,
  insertAuthUser,
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
} from "./studentAuth";
import { handleWhatsAppRequest, isWhatsAppConfigured, isWhatsAppPath } from "./whatsapp";

const API_PATHS = new Set(["/__local_db", "/__db_health", "/__auth", "/__session", "/__storage"]);
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
      if (body.action === "password") {
        const result = await updatePasswordForToken(body.token || readBearerToken(req), body.password);
        sendJson(res, result.error ? (result.status || 400) : 200, result.error ? { error: result.error } : { user: result.user });
        return;
      }
      if (body.action === "insert" && body.user) {
        await insertAuthUser(body.user);
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 400, { error: "Unknown auth action" });
      return;
    }

    if (url === "/__session" && req.method === "PUT") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url === "/__storage" && req.method === "GET") {
      const filePath = parsed.searchParams.get("path") || "";
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
      if (contentType.includes("application/json")) {
        const body = JSON.parse((await readBody(req)) || "{}");
        await writeStorageFile(body.path, body.dataUrl);
        sendJson(res, 200, { ok: true, path: body.path });
        return;
      }

      const filePath = parsed.searchParams.get("path") || "";
      if (!filePath) {
        sendJson(res, 400, { error: "path query parameter is required" });
        return;
      }

      const buffer = await readRawBody(req);
      const mime = contentType.split(";")[0]?.trim() || "application/octet-stream";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      await writeStorageFile(filePath, dataUrl);
      sendJson(res, 200, { ok: true, path: filePath });
      return;
    }

    if (url === "/__storage" && req.method === "DELETE") {
      const body = JSON.parse((await readBody(req)) || "{}");
      await deleteStorageFiles(body.paths || []);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url === "/__local_db" && req.method === "GET") {
      await ensureSchema();
      const table = parsed.searchParams.get("table") || undefined;
      const state = await readAppState({ table, includeStorage: false });
      sendJson(res, 200, table ? { rows: state.tables[table] || [] } : state);
      return;
    }

    if (url === "/__local_db" && req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAppState(JSON.parse(body || "{}"));
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (url === "/__local_db" && req.method === "PUT") {
      const body = await readBody(req);
      await writeAppState(JSON.parse(body || "{}"));
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    sendJson(res, 500, { error: error.message });
  }
}
