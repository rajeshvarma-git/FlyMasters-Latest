import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, CheckCircle2, MessageCircle, MessageSquare, PhoneCall, Trash2 } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore, useAdminStore } from "@admin/lib/store";
import { counselorLabel, displayName, initials, isConvertedStudent, studentOwns } from "@admin/lib/utils";
import { Badge } from "@admin/components/ui/Badge";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Select } from "@admin/components/ui/Field";
import ChatInboxPanel, { type InboxMessage, type InboxThread } from "@admin/components/ChatInboxPanel";
import WhatsAppThreads, { whatsAppThreadIdForLead } from "@admin/components/WhatsAppThreads";
import type { Lead } from "@admin/lib/types";

const STALE_DAYS = 2;
type Tab = "open" | "converted" | "calls" | "chats" | "whatsapp";
type LeadDetailTab = "overview" | "telecaller";

function leadDetailUrl(leadId: string, detailTab: LeadDetailTab, telecallerId: string) {
  const params = new URLSearchParams({ from: `telecaller/${telecallerId}` });
  if (detailTab === "telecaller") params.set("tab", "telecaller");
  return `/leads/${leadId}?${params.toString()}`;
}

function daysSince(value?: string | null) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

function whenLabel(value?: string | null) {
  const days = daysSince(value);
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/**
 * Call notes are appended to the lead as `[date] outcome — what was said`.
 * Chat messages live in telecaller_conversations / telecaller_messages.
 */
interface CallEntry {
  lead: Lead;
  stamp: string;
  text: string;
  sortKey: string;
}

function parseCalls(lead: Lead): CallEntry[] {
  if (!lead.notes) return [];
  return lead.notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.+?)\]\s*(.*)$/);
      const stamp = match ? match[1] : "";
      const text = match ? match[2] : line;
      const parsed = stamp ? new Date(stamp) : null;
      return {
        lead,
        stamp: stamp || "Undated",
        text,
        sortKey: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "",
      };
    });
}

function waitLabel(lead: Lead) {
  const today = new Date().toISOString().slice(0, 10);
  if (lead.next_follow_up_date) {
    const due = lead.next_follow_up_date.slice(0, 10);
    if (due < today) return { text: `Follow-up overdue since ${due}`, late: true };
    if (due === today) return { text: "Follow-up due today", late: true };
    return { text: `Follow-up ${due}`, late: false };
  }
  if (!lead.last_contact_date) {
    const d = daysSince(lead.created_at);
    return { text: d === null ? "Never called" : `Never called · ${d}d old`, late: (d ?? 0) >= STALE_DAYS };
  }
  const d = daysSince(lead.last_contact_date) ?? 0;
  return { text: d === 0 ? "Called today" : `Last called ${d}d ago`, late: d >= STALE_DAYS };
}

export default function TelecallerDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const store = useAdminStore();
  const [tab, setTab] = useState<Tab>("open");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedWhatsAppId, setSelectedWhatsAppId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [busyAction, setBusyAction] = useState<"transfer" | "remove" | null>(null);
  const [error, setError] = useState("");

  const telecaller = store.telecallers.find((row) => row.id === id) || null;

  const mine = useMemo(
    () => (telecaller ? store.leads.filter((lead) => lead.assigned_telecaller_id === telecaller.id) : []),
    [telecaller, store.leads],
  );

  const open = mine
    .filter((lead) => !isConvertedStudent(lead))
    .sort((a, b) => (waitLabel(b).late ? 1 : 0) - (waitLabel(a).late ? 1 : 0));
  const converted = mine
    .filter((lead) => isConvertedStudent(lead))
    .sort((a, b) => String(b.conversion_date || "").localeCompare(String(a.conversion_date || "")));

  const calls = useMemo(
    () =>
      mine
        .flatMap(parseCalls)
        .sort((a, b) => b.sortKey.localeCompare(a.sortKey)),
    [mine],
  );

  const chatThreads = useMemo(() => {
    if (!telecaller) return [];
    const convs = store.telecallerConversations.filter((row) => row.telecaller_id === telecaller.id);
    return convs
      .map((conv) => {
        const lead =
          store.leads.find((row) => studentOwns(row, conv.student_id)) ||
          null;
        const msgs = store.telecallerMessages
          .filter((msg) => msg.conversation_id === conv.id)
          .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
        return { conv, lead, msgs };
      })
      .sort((a, b) =>
        String(b.conv.last_message_at || "").localeCompare(String(a.conv.last_message_at || "")),
      );
  }, [telecaller, store.telecallerConversations, store.telecallerMessages, store.leads]);

  const chatCount = chatThreads.reduce((sum, row) => sum + row.msgs.length, 0);

  const whatsappConversations = useMemo(() => {
    if (!telecaller) return [];
    return store.whatsappConversations.filter(
      (row) => String(row.assigned_staff_id) === telecaller.id && row.staff_role === "telecaller",
    );
  }, [telecaller, store.whatsappConversations]);

  const whatsappCount = useMemo(
    () =>
      store.whatsappMessages.filter((msg) =>
        whatsappConversations.some((conv) => conv.id === msg.conversation_id),
      ).length,
    [store.whatsappMessages, whatsappConversations],
  );

  const openLeadChat = (lead: Lead) => {
    const wa = whatsappConversations.find((row) => String(row.lead_id) === String(lead.id));
    if (wa) {
      setSelectedWhatsAppId(wa.id);
      setTab("whatsapp");
      return;
    }
    if (lead.phone) {
      setSelectedWhatsAppId(whatsAppThreadIdForLead(lead.id));
      setTab("whatsapp");
      return;
    }
    const chat = chatThreads.find((row) => row.lead?.id === lead.id);
    setSelectedChatId(chat?.conv.id || null);
    setTab("chats");
  };

  const chatInboxThreads: InboxThread[] = chatThreads.map(({ conv, lead, msgs }) => ({
    id: conv.id,
    title: lead ? displayName(lead.first_name, lead.last_name, lead.email) : "Unknown lead",
    subtitle: lead?.phone || undefined,
    preview: msgs[msgs.length - 1]?.message || "No messages yet",
    lastAt: conv.last_message_at,
  }));

  const getChatMessages = (threadId: string): InboxMessage[] => {
    const row = chatThreads.find((item) => item.conv.id === threadId);
    if (!row) return [];
    return row.msgs.map((msg) => ({
      id: msg.id,
      text: msg.message,
      outbound: row.lead ? !studentOwns(row.lead, msg.sender_id) : true,
      createdAt: msg.created_at,
    }));
  };

  const activeChatThread = chatThreads.find((row) => row.conv.id === selectedChatId) || chatThreads[0] || null;

  const otherTelecallers = store.telecallers.filter(
    (row) => row.is_active !== false && row.id !== telecaller?.id,
  );

  const transferLeads = async () => {
    if (!telecaller) return;
    if (!transferTargetId) {
      setError("Choose a telecaller to transfer leads to.");
      return;
    }
    setBusyAction("transfer");
    setError("");
    try {
      const result = await api<{ count: number }>(`/telecallers/${telecaller.id}/transfer`, {
        method: "POST",
        body: { targetTelecallerId: transferTargetId },
      });
      setTransferTargetId("");
      await refreshStore();
      if (result.count === 0) {
        setError("No open leads were assigned to this telecaller.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer leads.");
    } finally {
      setBusyAction(null);
    }
  };

  const removeTelecaller = async () => {
    if (!telecaller) return;
    if (open.length > 0 && !transferTargetId) {
      setError(
        `This telecaller still has ${open.length} open lead(s). Pick someone to transfer them to before removing.`,
      );
      return;
    }
    const message =
      open.length > 0
        ? `Transfer ${open.length} open lead(s) to the selected telecaller and remove ${displayName(telecaller.first_name, telecaller.last_name, telecaller.email)}?`
        : `Remove ${displayName(telecaller.first_name, telecaller.last_name, telecaller.email)} from the telecaller list?`;
    if (!window.confirm(message)) return;

    setBusyAction("remove");
    setError("");
    try {
      await api(`/telecallers/${telecaller.id}/remove`, {
        method: "POST",
        body: transferTargetId ? { targetTelecallerId: transferTargetId } : {},
      });
      await refreshStore();
      navigate("/telecallers", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove telecaller.");
    } finally {
      setBusyAction(null);
    }
  };

  if (!telecaller) {
    return (
      <div>
        <Link to="/telecallers" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
          <ArrowLeft className="h-4 w-4" /> Back to telecallers
        </Link>
        <Card className="p-8 text-center text-sm text-slate-500">No telecaller found with this id.</Card>
      </div>
    );
  }

  const tabs: Array<{ key: Tab; label: string; count: number; icon: typeof PhoneCall }> = [
    { key: "open", label: "Open leads", count: open.length, icon: PhoneCall },
    { key: "converted", label: "Converted students", count: converted.length, icon: CheckCircle2 },
    { key: "chats", label: "Lead chats", count: chatCount, icon: MessageCircle },
    { key: "whatsapp", label: "WhatsApp", count: whatsappCount, icon: MessageCircle },
    { key: "calls", label: "Call history", count: calls.length, icon: MessageSquare },
  ];

  return (
    <div>
      <Link to="/telecallers" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
        <ArrowLeft className="h-4 w-4" /> Back to telecallers
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-xl font-bold text-white">
            {initials(telecaller.first_name, telecaller.last_name, telecaller.email)}
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">
                {displayName(telecaller.first_name, telecaller.last_name, telecaller.email)}
              </h1>
              <Badge value={telecaller.is_active === false ? "rejected" : "telecaller"} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {telecaller.email} · {telecaller.phone || "No phone"}
            </p>
            <p className="mt-3 text-xs text-slate-400">
              {mine.length} lead{mine.length === 1 ? "" : "s"} handled · {converted.length} converted ·{" "}
              {calls.length} call{calls.length === 1 ? "" : "s"} logged
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Transfer or remove telecaller</p>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Transfer moves all open leads, call notes, in-app chats, and WhatsApp threads to another telecaller so
              they keep full history. Remove deactivates this telecaller — if open leads are assigned, pick someone to
              transfer them to first.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px]">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Transfer open leads to</p>
            <Select value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}>
              <option value="">Choose telecaller</option>
              {otherTelecallers.map((row) => (
                <option key={row.id} value={row.id}>
                  {displayName(row.first_name, row.last_name, row.email)}
                  {row.phone ? ` · ${row.phone}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyAction !== null || !transferTargetId || open.length === 0}
            onClick={() => void transferLeads()}
          >
            <ArrowRightLeft className="h-4 w-4" />
            {busyAction === "transfer" ? "Transferring..." : "Transfer data"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busyAction !== null}
            onClick={() => void removeTelecaller()}
          >
            <Trash2 className="h-4 w-4" />
            {busyAction === "remove" ? "Removing..." : "Remove telecaller"}
          </Button>
        </div>
        {open.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {open.length} open lead{open.length === 1 ? "" : "s"} will move with chat and WhatsApp history when you
            transfer or remove. Converted students stay linked for reporting only.
          </p>
        )}
      </Card>

      {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
              tab === key ? "border-sky-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tab === key ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "open" &&
          (open.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No open leads. Assign some from Leads.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {open.map((lead) => {
                const wait = waitLabel(lead);
                return (
                  <div
                    key={lead.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => openLeadChat(lead)}
                      className="min-w-0 flex-1 text-left transition hover:opacity-80"
                    >
                      <p className="font-semibold text-sky-700 hover:underline">
                        {displayName(lead.first_name, lead.last_name, lead.email)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {lead.phone || "No phone"} · {(lead.preferred_countries || []).join(", ") || "No country"}
                      </p>
                      <p className={`mt-1 text-xs ${wait.late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                        {wait.text} · {parseCalls(lead).length} call{parseCalls(lead).length === 1 ? "" : "s"} logged
                        · Click to open chat
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Link
                        to={leadDetailUrl(lead.id, "overview", telecaller.id)}
                        className="text-xs font-semibold text-sky-600 hover:underline"
                      >
                        Profile
                      </Link>
                      <Badge value={lead.lead_status || "warm"} />
                    </div>
                  </div>
                );
              })}
            </Card>
          ))}

        {tab === "converted" &&
          (converted.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              They have not converted anyone yet.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {converted.map((student) => (
                <Link
                  key={student.id}
                  to={`/students/${student.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 transition last:border-b-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {displayName(student.first_name, student.last_name, student.email)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {(student.preferred_countries || []).join(", ") || "No country"} ·{" "}
                      {student.field_of_interest || "No field"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Converted {whenLabel(student.conversion_date)} · Counselor:{" "}
                      {counselorLabel(store.counselors, student.assigned_counselor_id)}
                    </p>
                  </div>
                  {!student.assigned_counselor_id && (
                    <Badge value="unassigned" className="normal-case">No counselor</Badge>
                  )}
                </Link>
              ))}
            </Card>
          ))}

        {tab === "calls" &&
          (calls.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No calls logged yet. Entries appear here when they log a call from the telecaller site.
            </Card>
          ) : (
            <>
              <Card className="mb-4 border-sky-100 bg-sky-50 p-4 text-xs text-slate-700">
                Phone call notes the telecaller logged after each call, newest first.
              </Card>
              <Card className="overflow-hidden">
                {calls.map((entry, index) => (
                  <div
                    key={`${entry.lead.id}-${index}`}
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                  >
                    <Link
                      to={leadDetailUrl(entry.lead.id, "overview", telecaller.id)}
                      className="min-w-0 flex-1 transition hover:opacity-80"
                    >
                      <p className="text-sm font-semibold text-sky-700 hover:underline">
                        {displayName(entry.lead.first_name, entry.lead.last_name, entry.lead.email)}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">{entry.text}</p>
                    </Link>
                    <span className="shrink-0 text-xs text-slate-400">{entry.stamp}</span>
                  </div>
                ))}
              </Card>
            </>
          ))}

        {tab === "whatsapp" && (
          <WhatsAppThreads
            conversations={whatsappConversations}
            messages={store.whatsappMessages}
            leads={store.leads}
            people={mine}
            profileUrl={(lead) =>
              lead ? leadDetailUrl(lead.id, "overview", telecaller.id) : "#"
            }
            emptyMessage="No assigned leads yet."
            selectedId={selectedWhatsAppId}
            onSelectId={setSelectedWhatsAppId}
          />
        )}

        {tab === "chats" && (
          <ChatInboxPanel
            threads={chatInboxThreads}
            getMessages={getChatMessages}
            selectedId={selectedChatId}
            onSelect={setSelectedChatId}
            emptyListMessage="No chat conversations yet. Messages appear here when the telecaller chats from the telecaller portal."
            footerNote="Admin view is read-only. The telecaller replies from the telecaller portal."
            headerNote="Click a lead name on the left to open their chat thread."
            profileHref={
              activeChatThread
                ? leadDetailUrl(activeChatThread.lead?.id || activeChatThread.conv.student_id, "telecaller", telecaller.id)
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
