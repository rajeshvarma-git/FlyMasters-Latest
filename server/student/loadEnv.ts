import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ENV_KEYS = [
  "DATABASE_URL",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "GMAIL_FROM_NAME",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "NODE_ENV",
  "PORT",
  "WHATSAPP_PROVIDER",
  "WHATSAPP_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_OTP_TEMPLATE_NAME",
  "WHATSAPP_OTP_TEMPLATE_LANGUAGE",
  "WHATSAPP_OTP_TEMPLATE_BUTTON",
  "WHATSAPP_OTP_BUTTON_TYPE",
  "WHATSAPP_API_VERSION",
];

export function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function applyLoadedEnv(env: Record<string, string>) {
  for (const key of ENV_KEYS) {
    if (env[key]) process.env[key] = env[key];
  }
}
