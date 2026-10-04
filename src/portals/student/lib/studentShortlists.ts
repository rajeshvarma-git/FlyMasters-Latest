export function emailKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9]/g, "");
}

// Two addresses are the same person only if they are the same mailbox:
// exact match, except Gmail ignores dots and "+tags". (Matching on the part
// before "@" alone used to join different people across domains.)
export function sameMailbox(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0].replace(/\./g, "");
  return `${local}@${domain}`;
}

export function emailsMatch(left: unknown, right: unknown) {
  const a = sameMailbox(left);
  const b = sameMailbox(right);
  return Boolean(a && b && a === b);
}

export function collectStudentShortlistKeys(
  user: { id?: string; email?: string } | null | undefined,
  leads: Array<{ id?: string; user_id?: string; email?: string }> = []
) {
  const ids = new Set<string>();
  if (user?.id) ids.add(String(user.id));
  for (const lead of leads) {
    if (String(lead.user_id) === String(user?.id) || emailsMatch(lead.email, user?.email)) {
      if (lead.id) ids.add(String(lead.id));
      if (lead.user_id) ids.add(String(lead.user_id));
    }
  }
  return { ids, login: emailKey(user?.email) };
}

export function shortlistBelongsToStudent(
  row: any,
  user: { id?: string; email?: string } | null | undefined,
  keys: ReturnType<typeof collectStudentShortlistKeys>
) {
  if (!row || String(row.status || "recommended") === "draft") return false;
  if (keys.ids.has(String(row.student_id))) return true;
  if (emailsMatch(row.student_email, user?.email) || emailsMatch(row.email, user?.email)) return true;
  const rowKey = emailKey(row.student_email || row.email);
  return Boolean(keys.login && rowKey && rowKey.length >= 4 && rowKey === keys.login);
}
