import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, MessageCircle, User } from "lucide-react";
import { useAdminStore } from "@admin/lib/store";
import {
  counselorLabel,
  displayName,
  formatWhen,
  initials,
  isConvertedStudent,
  isWhatsAppLead,
  studentOwns,
  telecallerLabel,
} from "@admin/lib/utils";
import { Badge } from "@admin/components/ui/Badge";
import { Card } from "@admin/components/ui/Card";

type Tab = "overview" | "telecaller" | "whatsapp";

function parseTab(value: string | null): Tab {
  if (value === "telecaller") return "telecaller";
  if (value === "whatsapp") return "whatsapp";
  return "overview";
}

function parseCalls(notes?: string | null) {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.+?)\]\s*(.*)$/);
      return {
        stamp: match ? match[1] : "Undated",
        text: match ? match[2] : line,
      };
    });
}

function whenLabel(value?: string | null) {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return "Today";
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function LeadDetail() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const store = useAdminStore();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));

  const from = searchParams.get("from");
  const backTo = from?.startsWith("telecaller/")
    ? `/telecallers/${from.slice("telecaller/".length)}`
    : from?.startsWith("counselor/")
      ? `/counselors/${from.slice("counselor/".length)}`
      : "/leads";
  const backLabel = from?.startsWith("telecaller/")
    ? "Back to telecaller"
    : from?.startsWith("counselor/")
      ? "Back to counselor"
      : "Back to leads";

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const selectTab = (key: Tab) => {
    setTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  const lead = store.leads.find((row) => row.id === id || row.user_id === id) || null;

  const telecallerMessages = useMemo(() => {
    if (!lead) return [];
    const threadIds = new Set(
      store.telecallerConversations
        .filter((row) => studentOwns(lead, row.student_id))
        .map((row) => row.id),
    );
    return store.telecallerMessages
      .filter((msg) => threadIds.has(msg.conversation_id))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }, [lead, store.telecallerConversations, store.telecallerMessages]);

  const whatsappConversation = useMemo(
    () => store.whatsappConversations.find((row) => String(row.lead_id) === String(lead?.id)) || null,
    [lead?.id, store.whatsappConversations],
  );

  const whatsappMessages = useMemo(
    () =>
      whatsappConversation
        ? store.whatsappMessages
            .filter((msg) => msg.conversation_id === whatsappConversation.id)
            .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
        : [],
    [store.whatsappMessages, whatsappConversation],
  );

  if (!lead) {
    return (
      <div>
        <Link to={backTo} className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <Card className="p-8 text-center text-sm text-slate-500">No lead found with this id.</Card>
      </div>
    );
  }

  if (isConvertedStudent(lead)) {
    const params = searchParams.toString();
    return <Navigate to={`/students/${lead.id}${params ? `?${params}` : ""}`} replace />;
  }

  const calls = parseCalls(lead.notes);
  const tabs: Array<{ key: Tab; label: string; count: number | null; icon: typeof User }> = [
    { key: "overview", label: "Overview", count: null, icon: User },
    { key: "telecaller", label: "Telecaller chat", count: telecallerMessages.length, icon: MessageCircle },
    { key: "whatsapp", label: "WhatsApp", count: whatsappMessages.length, icon: MessageCircle },
  ];

  return (
    <div>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-xl font-bold text-white">
            {initials(lead.first_name, lead.last_name, lead.email)}
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{displayName(lead.first_name, lead.last_name, lead.email)}</h1>
              <Badge value={lead.lead_status || "warm"} />
              {isWhatsAppLead(lead) && <Badge value="whatsapp" className="normal-case" />}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {lead.email} · {lead.phone || lead.whatsapp_number?.slice(-10) || "No phone"}
            </p>
            <p className="mt-3 text-xs text-slate-400">
              {(lead.preferred_countries || []).join(", ") || "No country"} · {lead.field_of_interest || "No field"} ·{" "}
              {lead.academic_score || "No score"} · source {(lead.lead_source || "manual").replace(/_/g, " ")}
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Telecaller</dt>
          <dd className="font-medium">
            {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)}
            {lead.assigned_telecaller_id && lead.assigned_telecaller_at && (
              <> · assigned {formatWhen(lead.assigned_telecaller_at)}</>
            )}
          </dd>
          <dt className="text-slate-500">Counselor</dt>
          <dd className="font-medium">{counselorLabel(store.counselors, lead.assigned_counselor_id)}</dd>
          <dt className="text-slate-500">Next follow-up</dt>
          <dd className="font-medium">
            {lead.next_follow_up_date ? lead.next_follow_up_date.slice(0, 10) : "Not set"}
          </dd>
          <dt className="text-slate-500">Last contact</dt>
          <dd className="font-medium">{whenLabel(lead.last_contact_date)}</dd>
        </dl>
      </Card>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
              tab === key ? "border-sky-500 text-navy-900" : "border-transparent text-slate-500 hover:text-navy-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count !== null && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  tab === key ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <div className="grid gap-4">
            <Card className="p-5">
              <p className="mb-4 font-bold">Call history</p>
              {calls.length === 0 ? (
                <p className="text-sm text-slate-500">No calls logged yet.</p>
              ) : (
                <div className="space-y-3">
                  {calls.map((entry, index) => (
                    <div key={`${entry.stamp}-${index}`} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <p className="text-xs text-slate-400">{entry.stamp}</p>
                      <p className="mt-1 text-sm text-slate-700">{entry.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {lead.notes && calls.length === 0 && (
              <Card className="p-5">
                <p className="mb-2 font-bold">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{lead.notes}</p>
              </Card>
            )}
          </div>
        )}

        {tab === "telecaller" &&
          (telecallerMessages.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              {lead.assigned_telecaller_id
                ? "No messages exchanged with the telecaller yet."
                : "No telecaller assigned, so there is no conversation."}
            </Card>
          ) : (
            <Card className="flex max-h-[62vh] flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
                <p className="text-sm font-semibold">
                  {lead.first_name} and {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)}
                </p>
                <span className="text-xs text-slate-500">
                  Last {whenLabel(telecallerMessages[telecallerMessages.length - 1]?.created_at)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
                {telecallerMessages.map((msg) => {
                  const fromStudent = studentOwns(lead, msg.sender_id);
                  return (
                    <div
                      key={msg.id}
                      className={`max-w-[76%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        fromStudent
                          ? "self-start rounded-bl-sm border border-slate-200 bg-white"
                          : "self-end rounded-br-sm bg-sky-600 text-white"
                      }`}
                    >
                      <p>{msg.message}</p>
                      {msg.created_at && (
                        <p className={`mt-1 text-[11px] ${fromStudent ? "text-slate-400" : "text-white/60"}`}>
                          {format(new Date(msg.created_at), "PP p")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-slate-200 bg-white p-3 text-xs text-slate-500">
                Admin view is read-only. The telecaller replies from the telecaller portal.
              </p>
            </Card>
          ))}

        {tab === "whatsapp" &&
          (whatsappMessages.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              {isWhatsAppLead(lead)
                ? "No WhatsApp messages yet."
                : "This lead has not contacted Fly Masters on WhatsApp yet."}
            </Card>
          ) : (
            <Card className="flex max-h-[62vh] flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
                <p className="text-sm font-semibold">
                  WhatsApp · {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)}
                </p>
                <span className="text-xs text-slate-500">
                  +{whatsappConversation?.phone_number?.slice(-10) || lead.phone}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
                {whatsappMessages.map((msg) => {
                  if (msg.kind === "system" || msg.staff_id === "system") return null;
                  const outbound = msg.direction === "outbound";
                  return (
                    <div
                      key={msg.id}
                      className={`max-w-[76%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        outbound
                          ? "self-end rounded-br-sm bg-emerald-600 text-white"
                          : "self-start rounded-bl-sm border border-slate-200 bg-white"
                      }`}
                    >
                      <p>{msg.body}</p>
                      {msg.created_at && (
                        <p className={`mt-1 text-[11px] ${outbound ? "text-emerald-100" : "text-slate-400"}`}>
                          {format(new Date(msg.created_at), "PP p")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-slate-200 bg-white p-3 text-xs text-slate-500">
                Admin view is read-only. The assigned telecaller replies on WhatsApp from their inbox.
              </p>
            </Card>
          ))}
      </div>
    </div>
  );
}
