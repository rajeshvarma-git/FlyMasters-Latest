import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ArrowRightLeft, FileText, MessageCircle, MessageSquare, PhoneCall, Trash2, Users } from "lucide-react";
import { api } from "@admin/lib/api";
import { refreshStore, useAdminStore } from "@admin/lib/store";
import { counselorOwns, displayName, initials, isConvertedStudent, studentOwns, telecallerLabel } from "@admin/lib/utils";
import { Badge } from "@admin/components/ui/Badge";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Select } from "@admin/components/ui/Field";
import ChatInboxPanel, { type InboxMessage, type InboxThread } from "@admin/components/ChatInboxPanel";
import WhatsAppThreads, { whatsAppThreadIdForLead } from "@admin/components/WhatsAppThreads";
import type { DocumentRow, Lead } from "@admin/lib/types";

const SILENT_DAYS = 7;
type Tab = "students" | "leads" | "conversations" | "lead_chats" | "whatsapp" | "calls" | "documents";

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
  if (!lead.last_contact_date) {
    const d = daysSince(lead.created_at);
    return { text: d === null ? "Never called" : `Never called · ${d}d old`, late: (d ?? 0) >= 2 };
  }
  const d = daysSince(lead.last_contact_date) ?? 0;
  return { text: d === 0 ? "Called today" : `Last called ${d}d ago`, late: d >= 2 };
}

function daysSince(value?: string | null) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

function whenLabel(value?: string | null) {
  const days = daysSince(value);
  if (days === null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function docProgress(docs: DocumentRow[]) {
  if (!docs.length) return 0;
  return Math.round((docs.filter((doc) => doc.status === "approved").length / docs.length) * 100);
}

function docBadge(status: string) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "uploaded" || status === "pending") return "uploaded";
  return "requested";
}

function leadDetailUrl(leadId: string, counselorId: string) {
  return `/leads/${leadId}?from=counselor/${counselorId}`;
}

function profileUrl(lead: Lead, counselorId: string) {
  return isConvertedStudent(lead) ? `/students/${lead.id}` : leadDetailUrl(lead.id, counselorId);
}

export default function CounselorDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const store = useAdminStore();
  const [tab, setTab] = useState<Tab>("students");
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [openLeadChatId, setOpenLeadChatId] = useState<string | null>(null);
  const [openWhatsAppId, setOpenWhatsAppId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"transfer" | "remove" | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [error, setError] = useState("");

  const counselor = store.counselors.find((row) => row.id === id || row.auth_user_id === id) || null;

  const students = useMemo(
    () =>
      counselor
        ? store.leads
            .filter(
              (lead) =>
                isConvertedStudent(lead) && counselorOwns(counselor, lead.assigned_counselor_id),
            )
            .sort((a, b) => String(b.conversion_date || "").localeCompare(String(a.conversion_date || "")))
        : [],
    [counselor, store.leads],
  );

  const leads = useMemo(
    () =>
      counselor
        ? store.leads
            .filter(
              (lead) =>
                !isConvertedStudent(lead) && counselorOwns(counselor, lead.assigned_counselor_id),
            )
            .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
        : [],
    [counselor, store.leads],
  );

  const assigned = useMemo(
    () => (counselor ? store.leads.filter((lead) => counselorOwns(counselor, lead.assigned_counselor_id)) : []),
    [counselor, store.leads],
  );

  const calls = useMemo(
    () => assigned.flatMap(parseCalls).sort((a, b) => b.sortKey.localeCompare(a.sortKey)),
    [assigned],
  );

  const leadChatThreads = useMemo(() => {
    if (!counselor) return [];
    return store.telecallerConversations
      .filter((conv) => assigned.some((lead) => studentOwns(lead, conv.student_id)))
      .map((conv) => {
        const lead = assigned.find((row) => studentOwns(row, conv.student_id)) || null;
        const msgs = store.telecallerMessages
          .filter((msg) => msg.conversation_id === conv.id)
          .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
        return { conv, lead, msgs };
      })
      .sort((a, b) => String(b.conv.last_message_at || "").localeCompare(String(a.conv.last_message_at || "")));
  }, [counselor, assigned, store.telecallerConversations, store.telecallerMessages]);

  const leadChatCount = leadChatThreads.reduce((sum, row) => sum + row.msgs.length, 0);

  const counselorStaffIds = useMemo(() => {
    if (!counselor) return new Set<string>();
    return new Set([counselor.id, counselor.auth_user_id].filter(Boolean).map(String));
  }, [counselor]);

  const whatsappConversations = useMemo(() => {
    if (!counselor) return [];
    return store.whatsappConversations.filter(
      (row) => row.staff_role === "counselor" && counselorStaffIds.has(String(row.assigned_staff_id)),
    );
  }, [counselor, counselorStaffIds, store.whatsappConversations]);

  const whatsappCount = useMemo(
    () =>
      store.whatsappMessages.filter((msg) =>
        whatsappConversations.some((conv) => conv.id === msg.conversation_id),
      ).length,
    [store.whatsappMessages, whatsappConversations],
  );

  const docsFor = (student: Lead) =>
    store.documents.filter((doc) => !doc.archived && studentOwns(student, doc.user_id));

  const messagesFor = (student: Lead) => {
    const threads = store.conversations.filter((row) => studentOwns(student, row.student_id));
    const ids = new Set(threads.map((row) => row.id));
    return store.messages
      .filter((msg) => ids.has(msg.conversation_id))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  };

  const lastMessageAt = (student: Lead) => {
    const all = messagesFor(student);
    return all.length ? all[all.length - 1].created_at : null;
  };

  const allDocs = students.flatMap(docsFor);
  const pendingDocs = allDocs.filter((doc) => doc.status === "uploaded" || doc.status === "pending");
  const withMessages = students.filter((student) => messagesFor(student).length);
  const longestSilence = students.reduce<number | null>((worst, student) => {
    const days = daysSince(lastMessageAt(student) || student.conversion_date);
    if (days === null) return worst;
    return worst === null || days > worst ? days : worst;
  }, null);

  if (!counselor) {
    return (
      <div>
        <Link to="/counselors" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
          <ArrowLeft className="h-4 w-4" /> Back to counselors
        </Link>
        <Card className="p-8 text-center text-sm text-slate-500">
          No counselor found with this id. They may have been removed.
        </Card>
      </div>
    );
  }

  const openStudent = students.find((row) => row.id === openStudentId) || students[0] || null;

  const openPersonChat = (person: Lead, preferInApp = false) => {
    const wa = whatsappConversations.find((row) => String(row.lead_id) === String(person.id));
    if (wa) {
      setOpenWhatsAppId(wa.id);
      setTab("whatsapp");
      return;
    }
    if (preferInApp || !person.phone) {
      if (isConvertedStudent(person)) {
        setOpenStudentId(person.id);
        setTab("conversations");
        return;
      }
      const chat = leadChatThreads.find((row) => row.lead?.id === person.id);
      setOpenLeadChatId(chat?.conv.id || null);
      setTab("lead_chats");
      return;
    }
    setOpenWhatsAppId(whatsAppThreadIdForLead(person.id));
    setTab("whatsapp");
  };

  const studentChatThreads: InboxThread[] = students.map((student) => {
    const all = messagesFor(student);
    const last = all[all.length - 1];
    return {
      id: student.id,
      title: displayName(student.first_name, student.last_name, student.email),
      subtitle: `${student.preferred_countries?.join(", ") || "No country"} · ${student.field_of_interest || "No field"}`,
      preview: last?.message || "No messages yet",
      lastAt: last?.created_at || null,
    };
  });

  const getStudentChatMessages = (studentId: string): InboxMessage[] => {
    const student = students.find((row) => row.id === studentId);
    if (!student) return [];
    return messagesFor(student).map((msg) => ({
      id: msg.id,
      text: msg.message,
      outbound: !studentOwns(student, msg.sender_id),
      createdAt: msg.created_at,
    }));
  };

  const leadChatInboxThreads: InboxThread[] = leadChatThreads.map(({ conv, lead, msgs }) => ({
    id: conv.id,
    title: lead ? displayName(lead.first_name, lead.last_name, lead.email) : "Unknown lead",
    subtitle: lead
      ? `${lead.phone || "No phone"} · Telecaller: ${telecallerLabel(store.telecallers, lead.assigned_telecaller_id)}`
      : undefined,
    preview: msgs[msgs.length - 1]?.message || "No messages yet",
    lastAt: conv.last_message_at,
  }));

  const getLeadChatMessages = (threadId: string): InboxMessage[] => {
    const row = leadChatThreads.find((item) => item.conv.id === threadId);
    if (!row) return [];
    return row.msgs.map((msg) => ({
      id: msg.id,
      text: msg.message,
      outbound: row.lead ? !studentOwns(row.lead, msg.sender_id) : true,
      createdAt: msg.created_at,
    }));
  };

  const activeLeadChat = leadChatThreads.find((row) => row.conv.id === openLeadChatId) || leadChatThreads[0] || null;

  const decide = async (docId: string, status: "approved" | "rejected") => {
    setBusyDocId(docId);
    setError("");
    try {
      await api(`/documents/${docId}`, { method: "PATCH", body: { status, comments: "" } });
      await refreshStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the document.");
    } finally {
      setBusyDocId(null);
    }
  };

  const openFile = async (docId: string) => {
    try {
      const file = await api<{ fileName: string; dataUrl: string }>(`/documents/${docId}/file`);
      const link = document.createElement("a");
      link.href = file.dataUrl;
      link.download = file.fileName || "document";
      link.target = "_blank";
      link.click();
    } catch {
      setError("Could not open this file.");
    }
  };

  const otherCounselors = store.counselors.filter(
    (row) => row.is_active !== false && row.id !== counselor.id && row.auth_user_id !== counselor.auth_user_id,
  );

  const transferStudents = async () => {
    if (!transferTargetId) {
      setError("Choose a counselor to transfer students to.");
      return;
    }
    setBusyAction("transfer");
    setError("");
    try {
      const result = await api<{ count: number }>(`/counselors/${counselor.id}/transfer`, {
        method: "POST",
        body: { targetCounselorId: transferTargetId },
      });
      setTransferTargetId("");
      await refreshStore();
      if (result.count === 0) {
        setError("No students were assigned to this counselor.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer students.");
    } finally {
      setBusyAction(null);
    }
  };

  const removeCounselor = async () => {
    if ((students.length > 0 || leads.length > 0) && !transferTargetId) {
      setError(
        `This counselor still has ${students.length} student(s) and ${leads.length} lead(s). Pick someone to transfer them to before removing.`,
      );
      return;
    }
    const total = students.length + leads.length;
    const message =
      total > 0
        ? `Transfer ${students.length} student(s) and ${leads.length} lead(s) to the selected counselor and remove ${displayName(counselor.first_name, counselor.last_name, counselor.email)}?`
        : `Remove ${displayName(counselor.first_name, counselor.last_name, counselor.email)} from the counselor list?`;
    if (!window.confirm(message)) return;

    setBusyAction("remove");
    setError("");
    try {
      await api(`/counselors/${counselor.id}/remove`, {
        method: "POST",
        body: transferTargetId ? { targetCounselorId: transferTargetId } : {},
      });
      await refreshStore();
      navigate("/counselors", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove counselor.");
    } finally {
      setBusyAction(null);
    }
  };

  const stats: Array<{ label: string; value: string | number; alert?: boolean }> = [
    { label: "Students", value: students.length },
    { label: "Leads", value: leads.length, alert: leads.length > 0 },
    { label: "Documents to review", value: pendingDocs.length, alert: pendingDocs.length > 0 },
    { label: "Approved documents", value: allDocs.filter((doc) => doc.status === "approved").length },
    {
      label: "Longest silence",
      value: longestSilence === null ? "—" : `${longestSilence} days`,
      alert: longestSilence !== null && longestSilence >= SILENT_DAYS,
    },
  ];

  const tabs: Array<{ key: Tab; label: string; count: number; icon: typeof Users }> = [
    { key: "students", label: "Students", count: students.length, icon: Users },
    { key: "leads", label: "Leads", count: leads.length, icon: PhoneCall },
    { key: "conversations", label: "Student chats", count: withMessages.length, icon: MessageCircle },
    { key: "lead_chats", label: "Lead chats", count: leadChatCount, icon: MessageSquare },
    { key: "whatsapp", label: "WhatsApp", count: whatsappCount, icon: MessageCircle },
    { key: "calls", label: "Call history", count: calls.length, icon: PhoneCall },
    { key: "documents", label: "Documents", count: allDocs.length, icon: FileText },
  ];

  return (
    <div>
      <Link to="/counselors" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
        <ArrowLeft className="h-4 w-4" /> Back to counselors
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-xl font-bold text-white">
            {initials(counselor.first_name, counselor.last_name, counselor.email)}
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">
                {displayName(counselor.first_name, counselor.last_name, counselor.email)}
              </h1>
              <Badge value={counselor.is_active ? "approved" : "rejected"} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {counselor.email} · {counselor.phone || "No phone on file"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {counselor.specializations?.length ? (
                counselor.specializations.map((country) => (
                  <span
                    key={country}
                    className="rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
                  >
                    {country}
                  </span>
                ))
              ) : (
                <Badge value="No country set" className="normal-case" />
              )}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {counselor.created_at ? `Joined ${format(new Date(counselor.created_at), "PP")} · ` : ""}
              {students.length} student{students.length === 1 ? "" : "s"} · {leads.length} lead
              {leads.length === 1 ? "" : "s"} · {withMessages.length} student chat
              {withMessages.length === 1 ? "" : "s"} · {calls.length} call{calls.length === 1 ? "" : "s"} logged
            </p>
            {counselor.bio && <p className="mt-3 text-sm text-slate-600">{counselor.bio}</p>}
          </div>
          <Link to="/counselors?tab=assign">
            <Button size="sm">Assign students</Button>
          </Link>
        </div>
      </Card>

      {!counselor.specializations?.length && (
        <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          No country is set for this counselor, so they will never appear as a country match when you assign students.
        </Card>
      )}

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Transfer or remove counselor</p>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Transfer moves all students, conversations, and shortlists to another counselor so they keep full history.
              Remove deactivates this counselor — if students are assigned, you must pick someone to transfer them to first.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px]">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Transfer students to</p>
            <Select value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}>
              <option value="">Choose counselor</option>
              {otherCounselors.map((row) => (
                <option key={row.id} value={row.id}>
                  {displayName(row.first_name, row.last_name, row.email)}
                  {row.specializations?.length ? ` · ${row.specializations.join(", ")}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyAction !== null || !transferTargetId || students.length === 0}
            onClick={() => void transferStudents()}
          >
            <ArrowRightLeft className="h-4 w-4" />
            {busyAction === "transfer" ? "Transferring..." : "Transfer data"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busyAction !== null}
            onClick={() => void removeCounselor()}
          >
            <Trash2 className="h-4 w-4" />
            {busyAction === "remove" ? "Removing..." : "Remove counselor"}
          </Button>
        </div>
        {(students.length > 0 || leads.length > 0) && (
          <p className="mt-3 text-xs text-slate-500">
            {students.length} student{students.length === 1 ? "" : "s"} and {leads.length} lead
            {leads.length === 1 ? "" : "s"} will move with their chat history when you transfer or remove.
          </p>
        )}
      </Card>

      {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className={`h-4 w-4 rounded-md ${stat.alert ? "bg-rose-100" : "bg-sky-100"}`} />
            <p className={`mt-2 text-2xl font-bold ${stat.alert ? "text-rose-600" : ""}`}>{stat.value}</p>
            <p className="text-sm text-slate-500">{stat.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
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
        {tab === "students" && (
          students.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No students assigned yet. Assign them from Counselor assignment.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-bold">Student</th>
                    <th className="px-4 py-3 font-bold">Countries</th>
                    <th className="px-4 py-3 font-bold">Documents</th>
                    <th className="px-4 py-3 font-bold">Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const docs = docsFor(student);
                    const progress = docProgress(docs);
                    const last = lastMessageAt(student);
                    const silent = daysSince(last || student.conversion_date) ?? 0;
                    return (
                      <tr
                        key={student.id}
                        className="cursor-pointer border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={() => openPersonChat(student)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold">
                            {displayName(student.first_name, student.last_name, student.email)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {student.email} · Converted by {telecallerLabel(store.telecallers, student.assigned_telecaller_id)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {student.preferred_countries?.join(", ") || "No country"}
                          <p className="text-xs text-slate-500">{student.field_of_interest || "No field"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                              <span
                                className={`block h-full rounded-full ${
                                  progress < 40 ? "bg-rose-500" : progress < 80 ? "bg-gold-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </span>
                            <span className="text-xs text-slate-600">{progress}%</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {docs.filter((doc) => doc.status === "uploaded" || doc.status === "pending").length} awaiting review
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {last ? (
                            <span className={`text-xs ${silent >= SILENT_DAYS ? "font-semibold text-rose-600" : "text-slate-600"}`}>
                              {whenLabel(last)}
                            </span>
                          ) : (
                            <Badge value="Never" className="normal-case" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )
        )}

        {tab === "leads" &&
          (leads.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No open leads assigned yet. Assign leads from Lead Alerts.
            </Card>
          ) : (
            <>
              <Card className="mb-4 border-sky-100 bg-sky-50 p-4 text-xs text-slate-700">
                Open leads stay here until the counselor converts them from the counselor portal. After conversion they
                move to the Students tab.
              </Card>
              <Card className="overflow-hidden">
              {leads.map((lead) => {
                const wait = waitLabel(lead);
                const callCount = parseCalls(lead).length;
                const chatCount = leadChatThreads.find((row) => row.lead?.id === lead.id)?.msgs.length ?? 0;
                return (
                  <div
                    key={lead.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => openPersonChat(lead)}
                      className="min-w-0 flex-1 text-left transition hover:opacity-80"
                    >
                      <p className="font-semibold text-sky-700 hover:underline">
                        {displayName(lead.first_name, lead.last_name, lead.email)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {lead.phone || "No phone"} · {(lead.preferred_countries || []).join(", ") || "No country"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Telecaller: {telecallerLabel(store.telecallers, lead.assigned_telecaller_id)} ·{" "}
                        {callCount} call{callCount === 1 ? "" : "s"} · {chatCount} chat message
                        {chatCount === 1 ? "" : "s"} · Click to open chat
                      </p>
                      <p className={`mt-0.5 text-xs ${wait.late ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                        {wait.text} · Signed up {whenLabel(lead.created_at) || "recently"}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Link
                        to={leadDetailUrl(lead.id, counselor.id)}
                        className="text-xs font-semibold text-sky-600 hover:underline"
                      >
                        Profile
                      </Link>
                      <Badge value={lead.lead_status || "hot"} />
                    </div>
                  </div>
                );
              })}
              </Card>
            </>
          ))}

        {tab === "calls" &&
          (calls.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No calls logged yet for assigned leads. Call notes appear when a telecaller logs a call.
            </Card>
          ) : (
            <>
              <Card className="mb-4 border-sky-100 bg-sky-50 p-4 text-xs text-slate-700">
                Phone call notes logged for this counselor&apos;s assigned leads, newest first.
              </Card>
              <Card className="overflow-hidden">
                {calls.map((entry, index) => (
                  <div
                    key={`${entry.lead.id}-${index}`}
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                  >
                    <Link to={profileUrl(entry.lead, counselor.id)} className="min-w-0 flex-1 transition hover:opacity-80">
                      <p className="text-sm font-semibold text-sky-700 hover:underline">
                        {displayName(entry.lead.first_name, entry.lead.last_name, entry.lead.email)}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">{entry.text}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Telecaller: {telecallerLabel(store.telecallers, entry.lead.assigned_telecaller_id)}
                      </p>
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
            people={assigned}
            profileUrl={(lead) => (lead ? profileUrl(lead, counselor.id) : "#")}
            emptyMessage="No assigned students or leads yet."
            selectedId={openWhatsAppId}
            onSelectId={setOpenWhatsAppId}
          />
        )}

        {tab === "lead_chats" && (
          <ChatInboxPanel
            threads={leadChatInboxThreads}
            getMessages={getLeadChatMessages}
            selectedId={openLeadChatId}
            onSelect={setOpenLeadChatId}
            emptyListMessage="No lead chat conversations yet. Messages appear when a telecaller chats with assigned leads."
            footerNote="Admin view is read-only. Telecallers and counselors reply from their portals."
            headerNote="Click a lead name on the left to open their chat thread."
            profileHref={activeLeadChat?.lead ? profileUrl(activeLeadChat.lead, counselor.id) : undefined}
          />
        )}

        {tab === "conversations" && (
          <ChatInboxPanel
            threads={studentChatThreads}
            getMessages={getStudentChatMessages}
            selectedId={openStudent?.id || openStudentId}
            onSelect={setOpenStudentId}
            emptyListMessage="No students, so no conversations yet."
            emptyThreadMessage="No messages exchanged yet."
            footerNote="Admin view is read-only. The counselor replies from the counselor portal."
            profileHref={openStudent ? `/students/${openStudent.id}` : undefined}
            headerExtra={
              openStudent ? (
                <Badge value={`${docProgress(docsFor(openStudent))}% documents`} className="normal-case" />
              ) : undefined
            }
            variant="counselor"
          />
        )}

        {tab === "documents" && (
          allDocs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No documents uploaded by this counselor&apos;s students yet.
            </Card>
          ) : (
            <div className="grid gap-3">
              {students.map((student) => {
                const docs = docsFor(student);
                if (!docs.length) return null;
                return (
                  <Card key={student.id} className="overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {displayName(student.first_name, student.last_name, student.email)} ·{" "}
                      {student.preferred_countries?.join(", ") || "No country"} · {docProgress(docs)}% approved
                    </div>
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{doc.document_type}</p>
                          <p className="text-xs text-slate-500">
                            {doc.file_name || "Not uploaded yet"}
                            {doc.created_at ? ` · ${whenLabel(doc.created_at)}` : ""}
                          </p>
                          {doc.admin_comments && <p className="mt-0.5 text-xs text-rose-600">{doc.admin_comments}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge value={docBadge(doc.status)} />
                          <Button size="sm" variant="secondary" onClick={() => void openFile(doc.id)}>
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyDocId === doc.id || doc.status === "approved"}
                            onClick={() => void decide(doc.id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyDocId === doc.id || doc.status === "rejected"}
                            onClick={() => void decide(doc.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}