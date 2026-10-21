import type { ShortlistDetails } from '@student/lib/shortlistDecisions';

/**
 * What can honestly be shown about the university behind a shortlist entry.
 * Every value comes from the shortlist row or from the catalogue record it
 * points to; a value that is not there is simply left out.
 */
export type InfoRow = { label: string; value: string };

type ShortlistLike = {
  course_name?: string | null;
  location?: string | null;
  estimated_fees?: number | string | null;
  application_deadline?: string | null;
  university_name?: string | null;
};

const text = (value: unknown) => (value == null ? '' : String(value).trim());

export function locationLine(row: ShortlistLike, details?: ShortlistDetails | null) {
  const uni = details?.university;
  const program = details?.program;
  const parts = [
    text(uni?.city) || text(program?.city),
    text(uni?.state_province) || text(program?.region),
    text(uni?.country) || text(program?.country),
  ].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : text(row.location);
}

export function programTitle(row: ShortlistLike, details?: ShortlistDetails | null) {
  return text(details?.program?.program_name) || text(row.course_name);
}

export function fieldOfStudy(details?: ShortlistDetails | null) {
  const program = details?.program;
  return [text(program?.course), text(program?.specialization)].filter(Boolean).join(' · ');
}

export function overview(details?: ShortlistDetails | null) {
  return text(details?.university?.description) || text(details?.program?.program_description);
}

export function tuition(row: ShortlistLike, details?: ShortlistDetails | null) {
  const fee = text(details?.program?.fee);
  if (fee) return fee;
  const estimated = Number(row.estimated_fees);
  return Number.isFinite(estimated) && estimated > 0 ? `Estimated ${estimated.toLocaleString()}` : '';
}

/** Key facts for the card, in a stable order. */
export function keyFacts(row: ShortlistLike, details?: ShortlistDetails | null): InfoRow[] {
  const program = details?.program;
  const uni = details?.university;
  const facts: InfoRow[] = [
    { label: 'Tuition fees', value: tuition(row, details) },
    { label: 'Duration', value: text(program?.duration) },
    { label: 'Language', value: text(program?.language) },
    { label: 'Application deadline', value: text(program?.deadline) || text(row.application_deadline) },
    { label: 'Admission requirements', value: text(program?.eligibility) },
    { label: 'Career outcomes', value: text(program?.career) },
    { label: 'Ranking', value: uni?.ranking ? `#${uni.ranking}` : '' },
    { label: 'Type', value: text(uni?.university_type) },
    { label: 'Established', value: uni?.established_year ? String(uni.established_year) : '' },
  ];
  return facts.filter((fact) => fact.value);
}
