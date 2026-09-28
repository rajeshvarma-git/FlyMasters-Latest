import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, GraduationCap, Headphones, MessageCircle, RefreshCw, Search, Send, User } from "lucide-react";

/**
 * Staff side of the one-student-one-conversation chat (server/routes/cases.mjs).
 * Used by both the telecaller and counselor portals: the left list is every
 * student assigned to you, the right side is that student's whole thread —
 * AI advisor, telecaller and counselor messages together — and your reply
 * lands in the same thread the student sees.
 */

type Role = "student" | "ai" | "telecaller" | "counselor" | "admin";

type Owner = { role: "ai" | "telecaller" | "counselor"; id: string | null; name: string };

type InboxItem = {
  lead_id: string;
  student_user_id: string;
  student_name: string;
  owner: Owner;
  last_message: { body: string; sender_role: Role; created_at: string } | null;
  last_message_at: string | null;
  unread: number;
};

type Message = {
  id: string;
  sender_role: Role;
  sender_name: string | null;
  body: string;
  channel: "app" | "whatsapp";
  created_at: string;
};

type Thread = {
  owner: Owner;
  student: { lead_id: string; name: string; email: string; phone: string };
  known: Record<string, string>;
  messages: Message[];
};

const LABEL: Record<string, string> = {
  student: "Student",
  ai: "AI Advisor",
  telecaller: "Telecaller",
  counselor: "Counselor",
  admin: "Fly Masters",
};

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = sessionStorage.getItem("fm_token") || "";
  const res = await fetch(`/api${path}`, {
    method: init?.method || "GET",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

function when(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function RoleIcon({ role, className = "h-3.5 w-3.5" }: { role: string; className?: string }) {
  if (role === "ai") return <Bot className={className} />;
  if (role === "telecaller") return <Headphones className={className} />;
  if (role === "counselor") return <GraduationCap className={className} />;
  return <User className={className} />;
}

export default function CaseInbox({ title = "Student Chat" }: { title?: string }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [listError, setListError] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const [params] = useSearchParams();
  const preselected = useRef(false);

  const loadList = useCallback(async () => {
    const data = await request<{ conversations: InboxItem[] }>("/case/inbox");
    setItems(data.conversations);
    setListError("");
  }, []);

  const loadThread = useCallback(async (leadId: string) => {
    const data = await request<Thread>(`/case/lead/${encodeURIComponent(leadId)}`);
    setThread(data);
    setThreadError("");
  }, []);

  useEffect(() => {
    loadList()
      .catch((e) => setListError(e instanceof Error ? e.message : "Could not load conversations"))
      .finally(() => setLoadingList(false));
  }, [loadList]);

  // Deep links from elsewhere in the portals: /chat?lead=<leadId> or /chat?student=<userId>.
  useEffect(() => {
    if (preselected.current || !items.length) return;
    const lead = params.get("lead");
    const student = params.get("student");
    const match = items.find((i) => (lead && i.lead_id === lead) || (student && i.student_user_id === student));
    preselected.current = true;
    if (match) setSelected(match.lead_id);
  }, [items, params]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadList().catch(() => {});
      if (selected) loadThread(selected).catch(() => {});
    }, 6000);
    return () => window.clearInterval(poll);
  }, [loadList, loadThread, selected]);

  useEffect(() => {
    if (!selected) return;
    setThread(null);
    lastCount.current = 0;
    loadThread(selected)
      .then(() => loadList().catch(() => {}))
      .catch((e) => setThreadError(e instanceof Error ? e.message : "Could not load the conversation"));
  }, [selected, loadThread, loadList]);

  useEffect(() => {
    const count = thread?.messages.length || 0;
    if (count !== lastCount.current) {
      lastCount.current = count;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.student_name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const send = async () => {
    const body = text.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      const { message } = await request<{ message: Message }>(`/case/lead/${encodeURIComponent(selected)}/messages`, {
        method: "POST",
        body: { message: body },
      });
      setText("");
      setThread((t) => (t ? { ...t, messages: [...t.messages, message] } : t));
      loadList().catch(() => {});
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : "Message not sent");
    } finally {
      setSending(false);
    }
  };

  const knownFacts = thread
    ? Object.entries(thread.known || {}).filter(([k, v]) => k !== "name" && String(v || "").trim())
    : [];

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-slate-500">One conversation per student — AI advisor, telecaller and counselor in the same thread.</p>
        </div>
        <button
          type="button"
          onClick={() => loadList().catch(() => {})}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-white">
        <aside className={`w-full shrink-0 border-r md:w-80 ${selected ? "hidden md:flex" : "flex"} flex-col`}>
          <div className="border-b p-2">
            <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search students"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList && <p className="p-4 text-sm text-slate-500">Loading…</p>}
            {listError && <p className="p-4 text-sm text-red-600">{listError}</p>}
            {!loadingList && !listError && filtered.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No students assigned to you yet.</p>
            )}
            {filtered.map((item) => (
              <button
                key={item.lead_id}
                type="button"
                onClick={() => setSelected(item.lead_id)}
                className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left hover:bg-slate-50 ${
                  selected === item.lead_id ? "bg-slate-100" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.student_name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{when(item.last_message_at)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">
                    {item.last_message
                      ? `${item.last_message.sender_role === "student" ? "" : LABEL[item.last_message.sender_role] + ": "}${item.last_message.body}`
                      : "No messages yet"}
                  </span>
                  {item.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{item.unread}</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <RoleIcon role={item.owner.role} className="h-3 w-3" />
                  {item.owner.role === "ai" ? "AI answering" : `${item.owner.name} (${LABEL[item.owner.role]})`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
              <MessageCircle className="h-10 w-10" />
              <p className="text-sm">Pick a student to open their conversation.</p>
            </div>
          )}

          {selected && (
            <>
              <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => setSelected(null)} className="mb-1 text-xs text-slate-500 md:hidden">
                    ← All students
                  </button>
                  <p className="truncate text-sm font-semibold">{thread?.student.name || "Loading…"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[thread?.student.phone, thread?.student.email].filter(Boolean).join(" · ")}
                  </p>
                  {knownFacts.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {knownFacts.map(([k, v]) => (
                        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                          {k}: {v}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                {thread && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    Now answering: {thread.owner.role === "ai" ? "AI Advisor" : `${thread.owner.name} (${LABEL[thread.owner.role]})`}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                {threadError && <p className="text-sm text-red-600">{threadError}</p>}
                {thread?.messages.map((m) => {
                  const student = m.sender_role === "student";
                  return (
                    <div key={m.id} className={`flex ${student ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          student
                            ? "rounded-bl-sm border bg-white"
                            : m.sender_role === "ai"
                              ? "rounded-br-sm border border-sky-100 bg-sky-50"
                              : "rounded-br-sm bg-emerald-600 text-white"
                        }`}
                      >
                        <p className={`mb-0.5 flex items-center gap-1 text-[11px] font-medium ${student || m.sender_role === "ai" ? "text-slate-500" : "text-emerald-50"}`}>
                          <RoleIcon role={m.sender_role} className="h-3 w-3" />
                          {student ? thread.student.name : m.sender_role === "ai" ? "AI Advisor" : `${m.sender_name || LABEL[m.sender_role]} · ${LABEL[m.sender_role]}`}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${student || m.sender_role === "ai" ? "text-slate-400" : "text-emerald-100"}`}>
                          {when(m.created_at)}
                          {m.channel === "whatsapp" ? " · WhatsApp" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Reply to the student…"
                  maxLength={2000}
                  disabled={sending || !thread}
                  className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim() || !thread}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
