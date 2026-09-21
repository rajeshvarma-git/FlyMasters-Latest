import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, MessageCircle, Phone, Smartphone, UserCheck } from "lucide-react";
import { api } from "@telecaller/lib/api";
import { refreshStore, useStore } from "@telecaller/lib/store";
import { displayName, formatNotesDates, hasStudentPortalAccount, isConvertedStudent, isWhatsAppLead } from "@telecaller/lib/utils";
import { IndianDateInput } from "@telecaller/components/ui/IndianDateInput";
import { Badge } from "@telecaller/components/ui/Badge";
import { Button } from "@telecaller/components/ui/Button";
import { Card } from "@telecaller/components/ui/Card";
import { Input, Label, Select, Textarea } from "@telecaller/components/ui/Field";

const OUTCOMES = [
  ["connected", "Spoke to them"],
  ["no_answer", "No answer"],
  ["busy", "Busy, call later"],
  ["callback", "Asked for callback"],
  ["wrong_number", "Wrong number"],
  ["not_interested", "Not interested"],
] as const;

export default function LeadWorkspace() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [outcome, setOutcome] = useState<string>("connected");

  const lead = store.leads.find((row) => row.id === id) || null;

  if (!lead) {
    return (
      <div>
        <Link to="/queue" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
          <ArrowLeft className="h-4 w-4" /> Back to my queue
        </Link>
        <Card className="p-8 text-center text-sm text-slate-500">
          This lead is not in your queue. It may have been reassigned to someone else.
        </Card>
      </div>
    );
  }

  const converted = isConvertedStudent(lead);
  const whatsappConversation = store.whatsappConversations.find((row) => String(row.lead_id) === String(lead.id));
  const canWhatsApp = Boolean(whatsappConversation || lead.phone || lead.whatsapp_number);
  const missing = [
    !(lead.preferred_countries || []).length && "preferred countries",
    !lead.field_of_interest && "field of interest",
    !lead.phone && !lead.whatsapp_number && "phone number",
  ].filter(Boolean) as string[];

  const flash = (message: string) => {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 2500);
  };

  const saveDetails = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/telecaller/leads/${lead.id}`, {
        method: "PATCH",
        body: {
          first_name: String(data.get("first_name") || ""),
          last_name: String(data.get("last_name") || ""),
          phone: String(data.get("phone") || ""),
          field_of_interest: String(data.get("field_of_interest") || ""),
          academic_score: String(data.get("academic_score") || ""),
          preferred_countries: String(data.get("preferred_countries") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      await refreshStore();
      flash("Details saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the details.");
    } finally {
      setBusy(false);
    }
  };

  const logCall = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api(`/telecaller/leads/${lead.id}/contact`, {
        method: "POST",
        body: {
          outcome,
          note: String(data.get("note") || ""),
          lead_status: String(data.get("lead_status") || ""),
          next_follow_up_date: String(data.get("next_follow_up_date") || "") || null,
        },
      });
      form.reset();
      await refreshStore();
      flash("Call logged");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the call.");
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    if (!window.confirm(`Convert ${displayName(lead.first_name, lead.last_name, lead.email)} to a student?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/telecaller/leads/${lead.id}/convert`, { method: "POST" });
      await refreshStore();
      navigate("/converted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this lead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/queue" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-sky-600">
        <ArrowLeft className="h-4 w-4" /> Back to my queue
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold sm:text-2xl">
                {displayName(lead.first_name, lead.last_name, lead.email)}
              </h1>
              <Badge value={converted ? "converted" : lead.lead_status || "warm"} />
              <Badge value={lead.lead_source || "manual"} />
              {isWhatsAppLead(lead) && lead.lead_source !== "whatsapp" && (
                <Badge value="whatsapp" className="normal-case">WhatsApp</Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {lead.phone || lead.whatsapp_number ? (
                <a href={`tel:${lead.phone || lead.whatsapp_number}`} className="flex items-center gap-1.5 font-semibold text-sky-700 hover:underline">
                  <Phone className="h-4 w-4" /> {lead.phone || lead.whatsapp_number}
                </a>
              ) : (
                <span className="font-medium text-rose-600">No phone number yet</span>
              )}
              {lead.email && !lead.email.includes("@lead.flymasters.local") && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 truncate text-slate-600 hover:underline">
                  <Mail className="h-4 w-4 shrink-0" /> {lead.email}
                </a>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {canWhatsApp && !converted && (
              <Link to={`/whatsapp?lead=${lead.id}`}>
                <Button variant="secondary">
                  <Smartphone className="h-4 w-4" /> WhatsApp
                </Button>
              </Link>
            )}
            {hasStudentPortalAccount(lead) && (
              <Link to={`/chat?lead=${lead.id}`}>
                <Button variant="secondary">
                  <MessageCircle className="h-4 w-4" /> Message
                </Button>
              </Link>
            )}
            {!converted && (
              <Button disabled={busy || missing.length > 0} onClick={() => void convert()}>
                <UserCheck className="h-4 w-4" /> Convert to student
              </Button>
            )}
          </div>
        </div>
        {!converted && missing.length > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Capture {missing.join(", ")} before you can convert.
          </p>
        )}
      </Card>

      {error && <Card className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
      {saved && <Card className="mt-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{saved}</Card>}

      {converted ? (
        <Card className="mt-4 p-8 text-center text-sm text-slate-500">
          Converted. You have left the WhatsApp chat. An admin now assigns their country counselor.
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="font-semibold">Log this call</p>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              Every call is recorded on the lead, so whoever picks it up next sees what happened.
            </p>
            <form onSubmit={(e) => void logCall(e)}>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OUTCOMES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOutcome(value)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                      outcome === value
                        ? "border-navy-900 bg-navy-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Set status</Label>
                  <Select name="lead_status" defaultValue={lead.lead_status || "warm"}>
                    <option value="hot">Hot — ready to convert</option>
                    <option value="warm">Warm — still deciding</option>
                    <option value="cold">Cold — not now</option>
                  </Select>
                </div>
                <div>
                  <Label>Next follow-up</Label>
                  <IndianDateInput
                    name="next_follow_up_date"
                    defaultValue={lead.next_follow_up_date}
                  />
                </div>
              </div>
              <div className="mt-3">
                <Label>What did they say?</Label>
                <Textarea name="note" placeholder="Budget, intake, concerns, objections..." />
              </div>
              <Button type="submit" className="mt-3 w-full sm:w-auto" disabled={busy}>
                Save call
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <p className="font-semibold">Capture their details</p>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              The counselor cannot start without countries, field of interest and a phone number.
            </p>
            <form onSubmit={(e) => void saveDetails(e)} className="grid gap-3 sm:grid-cols-2">
              <div><Label>First name</Label><Input name="first_name" defaultValue={lead.first_name || ""} /></div>
              <div><Label>Last name</Label><Input name="last_name" defaultValue={lead.last_name || ""} /></div>
              <div><Label>Phone</Label><Input name="phone" defaultValue={lead.phone || ""} /></div>
              <div>
                <Label>Academic score</Label>
                <Input name="academic_score" defaultValue={lead.academic_score || ""} placeholder="85%, 7.5 IELTS" />
              </div>
              <div className="sm:col-span-2">
                <Label>Field of interest</Label>
                <Input
                  name="field_of_interest"
                  defaultValue={lead.field_of_interest || ""}
                  placeholder="Data Science, Nursing..."
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Preferred countries</Label>
                <Input
                  name="preferred_countries"
                  defaultValue={(lead.preferred_countries || []).join(", ")}
                  placeholder="UK, Canada"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="secondary" className="w-full sm:w-auto" disabled={busy}>
                  Save details
                </Button>
              </div>
            </form>
          </Card>

          {lead.notes && (
            <Card className="p-5 lg:col-span-2">
              <p className="font-semibold">Call history</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-600">
                {formatNotesDates(lead.notes)}
              </pre>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
