import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@student/components/ui/dialog';
import { Badge } from '@student/components/ui/badge';
import { GraduationCap, Globe, MapPin } from 'lucide-react';
import type { ShortlistDetails } from '@student/lib/shortlistDecisions';
import { fieldOfStudy, keyFacts, locationLine, overview, programTitle } from '@student/lib/universityInfo';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: {
    id: string;
    university_name: string | null;
    course_name: string | null;
    location: string | null;
    estimated_fees?: number | null;
    application_deadline?: string | null;
    counselor_notes?: string | null;
  } | null;
  details: ShortlistDetails | null | undefined;
};

/**
 * View University: the real catalogue record behind a recommendation — the
 * university, the recommended programme, and the other programmes the same
 * university offers. Nothing is invented: if the catalogue has no record for
 * this entry, only what the counselor's recommendation itself holds is shown.
 */
export function UniversityDetailsDialog({ open, onOpenChange, row, details }: Props) {
  if (!row) return null;
  const uni = details?.university || null;
  const name = uni?.name || row.university_name || 'University';
  const where = locationLine(row, details);
  const recommended = details?.program?.id;
  const others = (details?.programs || []).filter((program) => program.id !== recommended);
  const facts = keyFacts(row, details);
  const about = overview(details);
  const field = fieldOfStudy(details);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="university-details">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            {where ? <><MapPin className="h-3.5 w-3.5" /> {where}</> : 'University details'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {about ? (
            <section>
              <h3 className="mb-1 font-semibold">Overview</h3>
              <p className="whitespace-pre-line text-muted-foreground">{about}</p>
            </section>
          ) : null}

          <section>
            <h3 className="mb-1 font-semibold">Recommended programme</h3>
            <p className="flex items-start gap-2">
              <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {programTitle(row, details) || 'Not specified'}
                {details?.program?.degree ? <Badge variant="outline" className="ml-2">{details.program.degree}</Badge> : null}
                {field ? <span className="block text-muted-foreground">{field}</span> : null}
              </span>
            </p>
            {row.counselor_notes ? (
              <p className="mt-2 rounded-md bg-muted/50 p-3"><span className="font-medium">Why your counselor suggests it: </span>{row.counselor_notes}</p>
            ) : null}
          </section>

          {facts.length ? (
            <section>
              <h3 className="mb-2 font-semibold">Costs, requirements and intake</h3>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{fact.label}</dt>
                    <dd className="whitespace-pre-line break-words">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {others.length ? (
            <section>
              <h3 className="mb-1 font-semibold">Other programmes at this university ({others.length})</h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 text-muted-foreground">
                {others.map((program) => (
                  <li key={program.id || program.program_name} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-foreground">{program.program_name}</span>
                    {program.degree ? <span className="text-xs">{program.degree}</span> : null}
                    {program.fee ? <span className="text-xs">· {program.fee}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!details?.university && !details?.program ? (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground">
              The full university profile is not available for this recommendation yet, so only what your counselor recorded is shown.
            </p>
          ) : null}

          {uni?.website_url && /^https?:\/\//i.test(uni.website_url) ? (
            <a href={uni.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
              <Globe className="h-4 w-4" /> University website
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
