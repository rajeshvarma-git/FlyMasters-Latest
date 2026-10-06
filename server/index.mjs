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
 *   routes/partner.mjs    /api/partner/*   (agents and freelancers)
 *   routes/finance.mjs    /api/finance/*   (accountants)
 *   routes/config.mjs     /api/config/*, /api/alerts/*   (CRM 2.6 and 2.6.1)
 *   routes/comms.mjs      /api/comms/*                   (CRM 2.7)
 */
import express from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";

import { ROOT, PORT, IS_PRODUCTION, assertBootConfig } from "./lib/env.mjs";
import { migrate } from "./lib/migrate.mjs";
import { preflight } from "./lib/preflight.mjs";
import { alignAssignedLeadBranches } from "./lib/branches.mjs";
import { pool } from "./lib/db.mjs";
import coreRoutes, { startUnassignedWatcher } from "./routes/core.mjs";
import counselorRoutes from "./routes/counselor.mjs";
import studentRoutes from "./routes/student.mjs";
import partnerRoutes from "./routes/partner.mjs";
import financeRoutes from "./routes/finance.mjs";
import configRoutes from "./routes/config.mjs";
import commsRoutes, { startCommsScheduler } from "./routes/comms.mjs";
import caseRoutes, { sweepVerifiedMerges, nudgeStalledIntakes } from "./routes/cases.mjs";
import knowledgeRoutes from "./routes/knowledge.mjs";

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
// Keep the raw bytes too: the WhatsApp webhook checks Meta's signature over
// them, and once express.json has read the stream it cannot be read again.
app.use(express.json({ limit: "20mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

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
app.use(partnerRoutes);
app.use(financeRoutes);
// config and comms mount before core so their namespaced paths are not caught
// by core's older catch-all handlers.
app.use(configRoutes);
app.use(commsRoutes);
// One student conversation: AI advisor -> telecaller -> counselor.
app.use(caseRoutes);
app.use(knowledgeRoutes);
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
  // /r/<CODE> referral links are client-side routes, so they fall through
  // to the SPA like any other page.
  //
  // The JS/CSS chunks above are safe to cache for a year — Vite hashes their
  // filenames, so a new build means new URLs. index.html is not: it is what
  // *names* those hashed chunks, so if a browser or proxy caches it, a
  // reopened tab can keep loading an old shell that still boots (old code,
  // old routes) while every other tab shows the new deploy — exactly the
  // "why is this tab still showing the old chat screens" confusion. Explicit
  // no-store here means every navigation always gets the current shell.
  app.get(/^(?!\/(api|__)).*/, (_req, res) => {
    res.set("Cache-Control", "no-store");
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
    await preflight();
  } catch (error) {
    console.error("Preflight failed:", error.message || error);
  }

  try {
    const moved = await alignAssignedLeadBranches();
    if (moved) console.log(`Moved ${moved} assigned lead(s) into their telecaller's branch`);
  } catch (error) {
    console.error("Lead branch repair failed:", error.message || error);
  }

  try {
    await sweepVerifiedMerges();
  } catch (error) {
    console.error("Verified-student merge sweep failed:", error.message || error);
  }

  try {
    // Students who stopped mid-questions get the same question again on WhatsApp (max 2 nudges).
    setInterval(() => { nudgeStalledIntakes().catch((e) => console.error("Intake nudge failed:", e?.message || e)); }, 30 * 60 * 1000).unref?.();
  } catch (error) {
    console.error("Intake nudge scheduler failed:", error.message || error);
  }

  try {
    startUnassignedWatcher();
  } catch (error) {
    console.error("Alert watcher failed to start:", error.message || error);
  }

  try {
    startCommsScheduler();
  } catch (error) {
    console.error("Communications scheduler failed to start:", error.message || error);
  }
}

start().catch((error) => {
  console.error("Platform failed to start:", error.message || error);
  process.exit(1);
});
