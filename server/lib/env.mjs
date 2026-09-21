// Single source of truth for configuration across every portal.
// Previously each portal had its own copy of this logic — and its own JWT secret,
// which is why admin / counselor / telecaller / student were four separate login realms.
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(idx + 1).trim();
  }
}
loadDotEnv();

export const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT);
export const IS_PRODUCTION = process.env.NODE_ENV === "production" || IS_RAILWAY;

function resolveDatabaseUrl() {
  const configured = String(process.env.DATABASE_URL || "").trim();
  if (configured) return configured;
  if (IS_PRODUCTION) return "";
  return "postgresql://flymasters:flymasters@127.0.0.1:5433/flymasters";
}

export const DATABASE_URL = resolveDatabaseUrl();
export const PORT = Number(process.env.PORT || process.env.API_PORT || 8788);

// No dev fallback in production. A weak default secret is how the old admin portal
// shipped its signing key inside railway.toml in a public repo.
export const JWT_SECRET = (() => {
  const value = String(process.env.JWT_SECRET || "").trim();
  if (value) return value;
  if (IS_PRODUCTION) {
    console.error("Refusing to start: JWT_SECRET must be set in production.");
    process.exit(1);
  }
  return "flymasters-local-dev-only-secret";
})();

export const ADMIN_SIGNUP_CODE = process.env.ADMIN_SIGNUP_CODE || "";
export const ADMIN_SIGNUP_OPEN = String(process.env.ADMIN_SIGNUP_OPEN || "").toLowerCase() === "true";
export const TELECALLER_SIGNUP_CODE = process.env.TELECALLER_SIGNUP_CODE || "";
export const COUNSELOR_SIGNUP_CODE = process.env.COUNSELOR_SIGNUP_CODE || "";
export const EMAIL_VERIFICATION_EXPIRY_MINUTES = Number(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || 10);

export const WHATSAPP = {
  verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || "",
  accessToken: process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_ACCESS_TOKEN || "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  otpTemplate: process.env.WHATSAPP_OTP_TEMPLATE_NAME || "",
  outreachTemplate: process.env.WHATSAPP_OUTREACH_TEMPLATE_NAME || "",
};

export function assertBootConfig() {
  if (!IS_PRODUCTION) return;
  if (!DATABASE_URL) {
    console.error("Refusing to start: DATABASE_URL must be set in production.");
    process.exit(1);
  }
  if (/127\.0\.0\.1|localhost/i.test(DATABASE_URL)) {
    console.error("Refusing to start: DATABASE_URL points to localhost.");
    process.exit(1);
  }
}
