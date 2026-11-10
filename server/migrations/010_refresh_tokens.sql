-- Short-lived access tokens with rotating refresh tokens (milestone 1.3).
--
-- Staff sessions were a single JWT valid for seven days, with no way to revoke one: signing out only
-- cleared the browser, so a copied token kept working for a week. The access token is now minutes long
-- and a refresh token, stored here, is what grants a new one.
--
-- Only the SHA-256 of a refresh token is stored. The token itself is 32 random bytes and is shown once,
-- so a leaked database row cannot be replayed as a session.
--
-- `family_id` ties every token descended from one sign-in together. Rotation means each refresh token
-- is good for exactly one use; presenting a used one means two parties hold the same token, so the
-- whole family is revoked and that sign-in ends everywhere. This is standard refresh-token rotation
-- with reuse detection.
--
-- The student portal is NOT affected: it uses opaque server-side sessions in auth_sessions, which are
-- already revocable and expiry-checked on every request.
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id             TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  user_id        TEXT NOT NULL,
  family_id      TEXT NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON auth_refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON auth_refresh_tokens(expires_at);
