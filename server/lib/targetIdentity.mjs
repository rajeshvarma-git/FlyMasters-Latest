// Which database an audit or plan was made from. The database name alone cannot tell staging from
// production (both may be called "postgres"), so the identity is host + port + database.
// Credentials are never part of it.
import { createHash } from "node:crypto";

export function targetIdentity({ url, database }) {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const port = u.port || "5432";
  const fingerprint = createHash("sha256").update(`${host}:${port}/${database}`).digest("hex").slice(0, 16);
  return { host, port, database, fingerprint };
}