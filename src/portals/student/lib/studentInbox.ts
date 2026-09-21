import { supabase } from "@student/integrations/supabase/client";

export type StudentInboxItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
  source: "notifications" | "document_notifications";
};

export function mapInboxType(raw: string) {
  const type = String(raw || "").toLowerCase();
  if (["approval", "approved", "success", "upload_success"].includes(type)) return "success";
  if (["rejection", "rejected", "error"].includes(type)) return "error";
  if (["request", "warning"].includes(type)) return "warning";
  if (["chat", "message", "info"].includes(type)) return "info";
  return "info";
}

export function inboxActionUrl(raw: string, fallback?: string | null) {
  if (fallback) return fallback;
  const type = String(raw || "").toLowerCase();
  if (type.includes("chat") || type.includes("message")) return "/student/chat";
  if (type.includes("shortlist")) return "/student/shortlists";
  if (type.includes("application")) return "/student/applications";
  return "/student/documents";
}

function inboxFingerprint(item: Pick<StudentInboxItem, "title" | "message" | "created_at">) {
  const minute = item.created_at?.slice(0, 16) ?? "";
  return `${item.title.trim().toLowerCase()}|${item.message.trim().toLowerCase()}|${minute}`;
}

function dedupeInboxItems(items: StudentInboxItem[]): StudentInboxItem[] {
  const byFingerprint = new Map<string, StudentInboxItem>();

  for (const item of items) {
    const fp = inboxFingerprint(item);
    const existing = byFingerprint.get(fp);
    if (!existing) {
      byFingerprint.set(fp, item);
      continue;
    }

    const preferred =
      item.source === "notifications" && existing.source !== "notifications" ? item : existing;
    const other = preferred === item ? existing : item;
    byFingerprint.set(fp, {
      ...preferred,
      is_read: Boolean(preferred.is_read && other.is_read),
    });
  }

  return [...byFingerprint.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function notifyStudent(input: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  actionUrl?: string;
  documentId?: string | null;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const type = input.type || "info";
  const actionUrl = input.actionUrl || inboxActionUrl(type);

  await supabase.from("notifications").insert({
    id,
    user_id: input.userId,
    title: input.title,
    message: input.message,
    type,
    action_url: actionUrl,
    is_read: false,
    created_at: now,
  });

  if (input.documentId) {
    await supabase.from("document_notifications").insert({
      id,
      user_id: input.userId,
      title: input.title,
      message: input.message,
      notification_type: type,
      is_read: false,
      created_at: now,
      document_id: input.documentId,
    });
  }

  return id;
}

export async function loadStudentInbox(userId: string): Promise<StudentInboxItem[]> {
  const [{ data: inbox }, { data: documentNotes }] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", userId),
    supabase.from("document_notifications").select("*").eq("user_id", userId),
  ]);

  const merged = new Map<string, StudentInboxItem>();

  for (const item of inbox || []) {
    merged.set(item.id, {
      id: item.id,
      title: item.title || "Notification",
      message: item.message || "",
      type: mapInboxType(item.type),
      is_read: Boolean(item.is_read),
      action_url: inboxActionUrl(item.type, item.action_url),
      created_at: item.created_at || new Date().toISOString(),
      source: "notifications",
    });
  }

  for (const item of documentNotes || []) {
    const existing = merged.get(item.id);
    merged.set(item.id, {
      id: item.id,
      title: item.title || existing?.title || "Counselor update",
      message: item.message || existing?.message || "",
      type: mapInboxType(item.notification_type || item.type || existing?.type || "info"),
      is_read: Boolean(item.is_read ?? existing?.is_read),
      action_url: inboxActionUrl(item.notification_type, item.action_url || existing?.action_url),
      created_at: item.created_at || existing?.created_at || new Date().toISOString(),
      source: existing?.source || "document_notifications",
    });
  }

  return dedupeInboxItems([...merged.values()]);
}

export async function markInboxRead(ids: string[]) {
  if (!ids.length) return;
  await Promise.all([
    supabase.from("notifications").update({ is_read: true }).in("id", ids),
    supabase.from("document_notifications").update({ is_read: true }).in("id", ids),
  ]);
}
