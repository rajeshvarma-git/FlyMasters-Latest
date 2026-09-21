export function displayName(first?: string, last?: string, fallback = "User") {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || fallback;
}

export function initials(first?: string, last?: string, email?: string) {
  const a = first?.[0] || email?.[0] || "U";
  const b = last?.[0] || "";
  return (a + b).toUpperCase();
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function isConvertedStudent(lead: { entity_type?: string; lead_status?: string }) {
  return lead.entity_type === "student" || lead.lead_status === "converted";
}

export function lastPhoneDigits(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-10);
}

export function samePhone(left?: string | null, right?: string | null) {
  const a = lastPhoneDigits(left);
  const b = lastPhoneDigits(right);
  return Boolean(a && b && a.length >= 10 && a === b);
}

export function leadPhone(lead: { phone?: string; whatsapp_number?: string }) {
  return lead.whatsapp_number || lead.phone || "";
}

/** Indian 10-digit local, or E.164 with country code (12+ digits, typically 91 + 10). */
export function hasSendableWhatsAppNumber(lead: { phone?: string; whatsapp_number?: string } | null) {
  if (!lead) return false;
  const digits = String(leadPhone(lead)).replace(/\D/g, "");
  return digits.length === 10 || digits.length >= 12;
}

export function isWhatsAppLead(lead: { lead_source?: string; whatsapp_number?: string }) {
  return lead.lead_source === "whatsapp" || Boolean(lead.whatsapp_number);
}

/** WhatsApp-created leads used to copy lead.id into user_id. That is not a student portal account. */
export function hasStudentPortalAccount(lead: { id?: string; user_id?: string }) {
  return Boolean(lead.user_id) && String(lead.user_id) !== String(lead.id || "");
}

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isSystemWhatsAppMessage(message: { kind?: string; staff_id?: string }) {
  return message.kind === "system" || String(message.staff_id || "") === "system";
}

export function isWhatsAppWindowOpen(
  messages: Array<{ direction?: string; kind?: string; staff_id?: string; created_at?: string }>,
) {
  const inbound = messages
    .filter((row) => row.direction === "inbound" && !isSystemWhatsAppMessage(row))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const last = inbound[inbound.length - 1];
  if (!last?.created_at) return false;
  return Date.now() - new Date(last.created_at).getTime() < WHATSAPP_WINDOW_MS;
}

export function daysSince(value?: string | null) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) → DD-MM-YYYY */
export function formatIndianDate(value?: string | null) {
  if (!value) return "";
  const iso = value.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** DD-MM-YYYY → ISO date (YYYY-MM-DD) for the API */
export function parseIndianDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Rewrite [YYYY-MM-DD] timestamps in call notes to DD-MM-YYYY */
export function formatNotesDates(notes: string) {
  return notes.replace(/\[(\d{4})-(\d{2})-(\d{2})\]/g, (_, y, m, d) => `[${d}-${m}-${y}]`);
}
