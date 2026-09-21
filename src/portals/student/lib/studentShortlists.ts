export function emailKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9]/g, "");
}

export function emailsMatch(left: unknown, right: unknown) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const keyA = emailKey(a);
  const keyB = emailKey(b);
  return Boolean(keyA && keyA === keyB && keyA.length >= 4);
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
