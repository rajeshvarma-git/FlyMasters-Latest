/**
 * Student portal API.
 *
 * The student app was generated against a generic JSONB state store rather than
 * a REST API: /__local_db, /__auth, /__session, /__storage, plus its own
 * WhatsApp handler. It authenticated with opaque tokens in auth_sessions, which
 * is why a student login was a fourth, separate session realm.
 *
 * Rather than rewrite the student frontend during a consolidation, its handler
 * is mounted here unchanged so the merge is behaviour-preserving. Moving these
 * paths onto the shared JWT session is Phase 1 work, tracked in ROLLOUT.md.
 *
 * Run under tsx so the original TypeScript modules load without a build step.
 */
import express from "express";

const router = express.Router();

let handler = null;
let isApiPath = () => false;

try {
  const mod = await import("../student/httpApi.ts");
  handler = mod.handleApiRequest;
  isApiPath = mod.isApiPath;
} catch (error) {
  console.warn("Student API not mounted:", error?.message || error);
}

router.use((req, res, next) => {
  if (!handler) return next();
  // express strips the mount path; rebuild what the raw handler expects
  const pathname = req.originalUrl.split("?")[0];
  if (!isApiPath(pathname)) return next();
  handler(req, res).catch((error) => {
    console.error("Student API error:", error?.message || error);
    if (!res.headersSent) res.status(500).json({ error: "Student API failed" });
  });
});

export default router;
