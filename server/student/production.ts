import { createServer } from "http";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { handleApiRequest, isApiPath } from "./httpApi";
import { ensureSchema } from "./postgres";
import { loadEnvFile } from "./loadEnv";

loadEnvFile();

const distDir = join(fileURLToPath(new URL(".", import.meta.url)), "../dist");
const port = Number(process.env.PORT || 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  let relativePath = decodeURIComponent(pathname);
  if (relativePath.endsWith("/")) relativePath += "index.html";
  if (relativePath === "/") relativePath = "/index.html";

  const filePath = join(distDir, relativePath);
  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  if (existsSync(filePath)) {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    if (relativePath.startsWith("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (relativePath === "/sw.js" || relativePath === "/index.html") {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    res.end(data);
    return;
  }

  const indexPath = join(distDir, "index.html");
  const indexHtml = await readFile(indexPath);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.end(indexHtml);
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
    if (isApiPath(pathname)) {
      await handleApiRequest(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Fly AI Pathfinder listening on 0.0.0.0:${port}`);
});

ensureSchema()
  .then(() => console.log("PostgreSQL schema and document defaults ready"))
  .catch((error) => console.error("Database initialization failed:", error));
