import { createHash, randomInt } from "crypto";
import dns from "dns";
import nodemailer from "nodemailer";
import { ensureSchema, getPool } from "./postgres";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSecret(value: string) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, "");
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

function generateCode() {
  return String(randomInt(100000, 999999));
}

function getEmailCredentials() {
  const user = normalizeEmail(process.env.GMAIL_USER || process.env.SMTP_USER || "");
  const pass = normalizeSecret(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "");
  return { user, pass };
}

function getResendApiKey() {
  return normalizeSecret(process.env.RESEND_API_KEY || "");
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
]);

function extractEmailFromFromHeader(from: string) {
  const match = from.match(/<([^>]+)>/);
  return normalizeEmail(match?.[1] || from);
}

function isPublicEmailDomain(email: string) {
  const domain = email.split("@")[1];
  return !domain || PUBLIC_EMAIL_DOMAINS.has(domain);
}

function getResendFromName() {
  return process.env.GMAIL_FROM_NAME || "Fly AI Pathfinder";
}

export function getResendFromAddress() {
  const configured = String(process.env.RESEND_FROM || "").trim();
  const fromName = getResendFromName();

  if (configured) {
    const email = extractEmailFromFromHeader(configured);
    if (email && !isPublicEmailDomain(email)) {
      return configured.includes("<") ? configured : `${fromName} <${email}>`;
    }
    if (email && isPublicEmailDomain(email)) {
      console.warn(
        `RESEND_FROM uses ${email}. Resend cannot send from Gmail/public addresses — using onboarding@resend.dev instead.`
      );
    }
  }

  return `${fromName} <onboarding@resend.dev>`;
}

export function getEmailProvider(): "resend" | "gmail-smtp" | "none" {
  if (getResendApiKey()) return "resend";
  const { user, pass } = getEmailCredentials();
  if (user && pass) return "gmail-smtp";
  return "none";
}

function mailNotConfiguredMessage() {
  return "Email is not configured. On Railway, set RESEND_API_KEY (recommended). For local dev you can use GMAIL_USER + GMAIL_APP_PASSWORD.";
}

export function isEmailConfigured() {
  return getEmailProvider() !== "none";
}

function classifyEmailError(error: any, provider: "resend" | "gmail-smtp") {
  const message = String(error?.message || "");
  const response = String(error?.response || "");
  const combined = `${message} ${response}`.toLowerCase();

  if (provider === "resend") {
    if (/invalid api key|unauthorized|401/i.test(combined)) {
      return "Invalid RESEND_API_KEY. Create one at resend.com/api-keys and add it to Railway.";
    }
    if (/domain|verify|not verified|from address/i.test(combined)) {
      return "RESEND_FROM cannot be a Gmail address. Use Fly AI Pathfinder <onboarding@resend.dev> for testing, or verify your own domain at resend.com/domains.";
    }
    return message || "Could not send email through Resend. Check RESEND_API_KEY and RESEND_FROM in Railway.";
  }

  if (/invalid login|authentication failed|username and password not accepted|535|534-5\.7\.9|eauth/i.test(combined)) {
    return "Gmail rejected the login. Use a Google App Password and set GMAIL_USER + GMAIL_APP_PASSWORD.";
  }
  if (/timeout|timed out|etimedout|econnrefused|enotfound|connect/i.test(combined)) {
    return "Gmail SMTP is blocked on Railway Free/Hobby plans. Use RESEND_API_KEY instead (see resend.com).";
  }
  return message || "Could not send verification email.";
}

async function sendViaResend(input: { to: string; subject: string; text: string; html: string }) {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.message || payload.error || `Resend request failed (${response.status})`) as Error & {
      response?: string;
    };
    err.response = JSON.stringify(payload);
    throw err;
  }
}

function getGmailTransportOptions(): Array<{
  label: string;
  options: nodemailer.TransportOptions;
}> {
  const { user, pass } = getEmailCredentials();
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const configuredPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const configuredSecure = process.env.SMTP_SECURE === "true";
  const ipv4Lookup = (hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
    dns.lookup(hostname, { family: 4 }, callback);
  };

  if (process.env.SMTP_HOST || configuredPort) {
    const port = configuredPort || 465;
    return [{
      label: `custom:${host}:${port}`,
      options: {
        host,
        port,
        secure: configuredSecure || port === 465,
        auth: { user, pass },
        requireTLS: !(configuredSecure || port === 465),
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
        dns: { lookup: ipv4Lookup },
      },
    }];
  }

  return [
    {
      label: "gmail:465",
      options: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
        dns: { lookup: ipv4Lookup },
      },
    },
    {
      label: "gmail:587",
      options: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user, pass },
        requireTLS: true,
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
        dns: { lookup: ipv4Lookup },
      },
    },
  ];
}

async function sendViaGmailSmtp(input: { to: string; subject: string; text: string; html: string }) {
  const { user, pass } = getEmailCredentials();
  if (!user || !pass) throw new Error("Gmail SMTP is not configured.");

  const fromName = process.env.GMAIL_FROM_NAME || "Fly AI Pathfinder";
  let lastError: any = null;

  for (const transport of getGmailTransportOptions()) {
    const mailer = nodemailer.createTransport(transport.options);
    try {
      await mailer.sendMail({
        from: `"${fromName}" <${user}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return;
    } catch (error) {
      lastError = error;
      console.error(`SMTP attempt failed (${transport.label}):`, error);
    }
  }

  throw lastError || new Error("Could not connect to Gmail SMTP.");
}

async function sendVerificationEmail(input: { to: string; subject: string; text: string; html: string }) {
  const provider = getEmailProvider();
  if (provider === "resend") {
    await sendViaResend(input);
    return;
  }
  if (provider === "gmail-smtp") {
    await sendViaGmailSmtp(input);
    return;
  }
  throw new Error(mailNotConfiguredMessage());
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string; provider?: string }> {
  const provider = getEmailProvider();
  if (provider === "none") {
    return { ok: false, error: "Email credentials are missing.", provider: "none" };
  }

  if (provider === "resend") {
    const apiKey = getResendApiKey();
    if (!/^re_[a-zA-Z0-9_]+/.test(apiKey)) {
      return { ok: false, provider: "resend", error: "Invalid RESEND_API_KEY format. It should start with re_" };
    }

    try {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) return { ok: true, provider: "resend" };

      const payload = await response.json().catch(() => ({}));
      const message = String(payload.message || payload.error || "");

      // Send-only API keys cannot list domains but can still send emails.
      if (/restricted to only send|sending access/i.test(message)) {
        return { ok: true, provider: "resend" };
      }

      return {
        ok: false,
        provider: "resend",
        error: message || "Invalid RESEND_API_KEY. Create one at resend.com/api-keys.",
      };
    } catch (error: any) {
      return { ok: false, provider: "resend", error: classifyEmailError(error, "resend") };
    }
  }

  try {
    for (const transport of getGmailTransportOptions()) {
      const mailer = nodemailer.createTransport(transport.options);
      try {
        await mailer.verify();
        return { ok: true, provider: "gmail-smtp" };
      } catch (error) {
        console.error(`SMTP verify failed (${transport.label}):`, error);
      }
    }
    return {
      ok: false,
      provider: "gmail-smtp",
      error: "Gmail SMTP is blocked on Railway Free/Hobby plans. Set RESEND_API_KEY instead.",
    };
  } catch (error: any) {
    return { ok: false, provider: "gmail-smtp", error: classifyEmailError(error, "gmail-smtp") };
  }
}

async function ensureVerificationTable() {
  await ensureSchema();
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS auth_signup_verifications (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function storeVerificationCode(email: string, code: string) {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await getPool().query(
    `INSERT INTO auth_signup_verifications (email, code_hash, expires_at, attempts, last_sent_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (email) DO UPDATE SET
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       last_sent_at = now()`,
    [email, hashCode(email, code), expiresAt]
  );
}

export async function sendSignupVerificationCode(
  emailInput: string
): Promise<{ ok: boolean; error?: string; status?: number; pendingVerification?: boolean; retryAfterSeconds?: number }> {
  await ensureVerificationTable();
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 };
  }

  if (!isEmailConfigured()) {
    return { ok: false, error: mailNotConfiguredMessage(), status: 503 };
  }

  const existing = await getPool().query("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [email]);
  if (existing.rows[0]) {
    return { ok: false, error: "An account with this email already exists. Please sign in.", status: 409 };
  }

  const prior = await getPool().query(
    "SELECT last_sent_at, expires_at FROM auth_signup_verifications WHERE email = $1 LIMIT 1",
    [email]
  );
  const priorRow = prior.rows[0];
  const lastSent = priorRow?.last_sent_at ? new Date(priorRow.last_sent_at).getTime() : 0;
  const codeStillValid = priorRow?.expires_at
    ? new Date(priorRow.expires_at).getTime() > Date.now()
    : false;

  if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
    if (codeStillValid) {
      return {
        ok: false,
        error: `A verification code was already sent. Check your inbox (and spam). You can resend in ${waitSec}s.`,
        status: 429,
        pendingVerification: true,
        retryAfterSeconds: waitSec,
      };
    }
    return { ok: false, error: `Please wait ${waitSec}s before requesting another code.`, status: 429, retryAfterSeconds: waitSec };
  }

  const code = generateCode();
  const subject = "Your Fly AI Pathfinder verification code";
  const text = `Your verification code is ${code}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1e40af;margin-bottom:8px">Verify your email</h2>
      <p style="color:#475569;margin-top:0">Use this code to finish creating your Fly AI Pathfinder account:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;padding:16px 0">${code}</div>
      <p style="color:#64748b;font-size:14px">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;

  try {
    await sendVerificationEmail({ to: email, subject, text, html });
    console.log(`Verification email sent to ${email} via ${getEmailProvider()}`);
  } catch (error: any) {
    console.error("Failed to send verification email:", error);
    const provider = getEmailProvider() === "resend" ? "resend" : "gmail-smtp";
    return { ok: false, error: classifyEmailError(error, provider), status: 503 };
  }

  await storeVerificationCode(email, code);
  return { ok: true };
}

export async function verifySignupCode(
  emailInput: string,
  codeInput: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  await ensureVerificationTable();
  const email = normalizeEmail(emailInput);
  const code = String(codeInput || "").trim();
  if (!email || !code) {
    return { ok: false, error: "Email and verification code are required.", status: 400 };
  }

  const row = await getPool().query(
    "SELECT code_hash, expires_at, attempts FROM auth_signup_verifications WHERE email = $1 LIMIT 1",
    [email]
  );
  const record = row.rows[0];
  if (!record) {
    return { ok: false, error: "No verification code found. Request a new code.", status: 400 };
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await getPool().query("DELETE FROM auth_signup_verifications WHERE email = $1", [email]);
    return { ok: false, error: "Verification code expired. Request a new code.", status: 400 };
  }

  if (Number(record.attempts) >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "Too many failed attempts. Request a new code.", status: 429 };
  }

  if (hashCode(email, code) !== record.code_hash) {
    await getPool().query(
      "UPDATE auth_signup_verifications SET attempts = attempts + 1 WHERE email = $1",
      [email]
    );
    return { ok: false, error: "Invalid verification code.", status: 400 };
  }

  return { ok: true };
}

export async function clearSignupVerification(emailInput: string) {
  await ensureVerificationTable();
  const email = normalizeEmail(emailInput);
  if (!email) return;
  await getPool().query("DELETE FROM auth_signup_verifications WHERE email = $1", [email]);
}
