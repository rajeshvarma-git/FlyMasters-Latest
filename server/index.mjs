/**
 * Fly Masters platform — single API process for every portal.
 *
 * Replaces three separate Express/Node services (admin, counselor, student) that
 * ran against one shared Postgres with three schema bootstraps, three auth
 * implementations and three JWT realms, plus a fourth frontend (telecaller) that
 * had no backend and pointed at the admin service by hostname.
 *
 * Route ownership after the merge:
 *   routes/core.mjs       /api/auth/*, /api/admin-side, /api/telecaller/*, /api/whatsapp/*
 *   routes/counselor.mjs  /api/counselor/*
 *   routes/student.mjs    /__auth, /__session, /__local_db, /__storage
 */
import express from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";

import { ROOT, PORT, IS_PRODUCTION, assertBootConfig } from "./lib/env.mjs";
import { migrate } from "./lib/migrate.mjs";
import { pool } from "./lib/db.mjs";
import coreRoutes, { startUnassignedWatcher } from "./routes/core.mjs";
import counselorRoutes from "./routes/counselor.mjs";
import studentRoutes from "./routes/student.mjs";

assertBootConfig();

const app = express();
app.set("trust proxy", 1);

// One origin now serves every portal, so CORS only matters for the mobile
// (Capacitor) build and any leftover split deployment during cutover.
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors(ALLOWED_ORIGINS.length ? { origin: ALLOWED_ORIGINS, credentials: true } : undefined));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "flymaster-platform", time: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message || "Database unreachable" });
  }
});

// The student handler claims only its own /__ paths, so it can run first.
app.use(studentRoutes);
app.use(coreRoutes);
app.use(counselorRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// One build, one static root, one SPA fallback — the merged frontend routes
// /admin, /counselor, /telecaller and /student on the client.
const distDir = path.join(ROOT, "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: IS_PRODUCTION ? "1y" : 0, index: false }));
  app.get(/^(?!\/(api|__)).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else if (IS_PRODUCTION) {
  console.warn("dist/ is missing — run `npm run build` before starting in production.");
}

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error?.message || error);
  if (!res.headersSent) res.status(500).json({ error: "Server error" });
});

async function start() {
  await new Promise((resolve) => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Fly Masters platform API on port ${PORT}`);
      resolve();
    });
  });

  try {
    const applied = await migrate();
    console.log(applied > 0 ? `Database migrated (${applied} new)` : "Database schema up to date");
  } catch (error) {
    console.error("Migration failed:", error.message || error);
    if (IS_PRODUCTION) process.exit(1);
  }

  try {
    startUnassignedWatcher();
  } catch (error) {
    console.error("Alert watcher failed to start:", error.message || error);
  }
}

start().catch((error) => {
  console.error("Platform failed to start:", error.message || error);
  process.exit(1);
});
