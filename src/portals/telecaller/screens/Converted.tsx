import { CheckCircle2 } from "lucide-react";
import { useStore } from "@telecaller/lib/store";
import { displayName, formatIndianDate, isConvertedStudent } from "@telecaller/lib/utils";
import { Badge } from "@telecaller/components/ui/Badge";
import { Card } from "@telecaller/components/ui/Card";

export default function Converted() {
  const store = useStore();
  const converted = store.leads
    .filter((lead) => isConvertedStudent(lead))
    .sort((a, b) => String(b.conversion_date || "").localeCompare(String(a.conversion_date || "")));

  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = converted.filter((lead) => (lead.conversion_date || "").slice(0, 7) === month).length;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-sky-500" />
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Converted</h1>
          <p className="text-sm text-slate-600">
            Leads you turned into students. WhatsApp then moves to their counselor. {thisMonth} this month, {converted.length} in total.
          </p>
        </div>
      </div>
      <Card className="overflow-hidden">
        {converted.map((lead) => (
          <div
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{displayName(lead.first_name, lead.last_name, lead.email)}</p>
              <p className="truncate text-sm text-slate-500">
                {(lead.preferred_countries || []).join(", ") || "No country"} · {lead.field_of_interest || "No field"}
              </p>
              {lead.conversion_date && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Converted {formatIndianDate(lead.conversion_date)}
                </p>
              )}
            </div>
            <Badge value="converted" />
          </div>
        ))}
        {converted.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            No conversions yet. Qualify a lead in your queue and convert it.
          </p>
        )}
      </Card>
    </div>
  );
}
