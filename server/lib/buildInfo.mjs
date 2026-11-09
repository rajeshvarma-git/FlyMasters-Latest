// Which code is this, and which migrations has its database had?
//
// Milestone 3.1 asks for "deployed commit visibility". Until now a deployed environment reported
// nothing about itself: `/api/health` answered ok/service/time, so the only way to know what a host was
// running was to trust whoever deployed it. That is the question every acceptance run has to answer
// first — a green run against an unknown commit proves nothing.
//
// Platforms expose the commit under their own name, so several are accepted. Railway sets
// RAILWAY_GIT_COMMIT_SHA and RAILWAY_GIT_BRANCH; the others are here so this keeps working if the host
// changes. Nothing is read from the repository at runtime: a deployed container usually has no .git.
const COMMIT_ENV_NAMES = [
  "RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT_SHA", "GIT_COMMIT", "COMMIT_SHA",
  "SOURCE_VERSION", "VERCEL_GIT_COMMIT_SHA", "HEROKU_SLUG_COMMIT",
];
const BRANCH_ENV_NAMES = ["RAILWAY_GIT_BRANCH", "GIT_BRANCH", "VERCEL_GIT_COMMIT_REF", "BRANCH"];

const firstOf = (env, names) => {
  for (const name of names) {
    const value = String(env?.[name] ?? "").trim();
    if (value) return value;
  }
  return "";
};

/**
 * The pure rule, so it can be tested without a deployment.
 * `commit` is the full sha when the platform gives one, `short` the first 7 characters, and both are
 * null when nothing is configured — which is itself worth reporting, rather than guessing.
 */
export function resolveBuildInfo(env = {}) {
  const commit = firstOf(env, COMMIT_ENV_NAMES);
  const branch = firstOf(env, BRANCH_ENV_NAMES);
  return {
    commit: commit || null,
    short: commit ? commit.slice(0, 7) : null,
    branch: branch || null,
    environment: String(env?.RAILWAY_ENVIRONMENT_NAME || env?.NODE_ENV || "").trim() || null,
  };
}

/** What the database has had applied: the count and the newest name, which is the schema version. */
export async function appliedMigrations(pool) {
  try {
    const { rows } = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
    return { applied: rows.length, latest: rows.length ? rows[rows.length - 1].name : null };
  } catch {
    // A database that has never been migrated has no such table; say so rather than failing the route.
    return { applied: 0, latest: null };
  }
}
