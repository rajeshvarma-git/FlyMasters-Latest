import { useEffect, useState } from 'react';
import { Badge } from '@student/components/ui/badge';
import { Button } from '@student/components/ui/button';
import { Calendar, ExternalLink, FileText, GraduationCap, Info, MapPin } from 'lucide-react';
import { AuthImage, openAssetInTab } from '@shared/components/AuthAsset';
import { formatDate, normalizeUniversityInfo, type UniversityInfo } from '@shared/universityInfo';
import { fetchUniversityInfo, studentToken, universityAssetUrl, type PublishedUniversity } from '@student/lib/universityInfoApi';

const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

function Block({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section data-testid={testId}>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Text({ label, value }: { label?: string; value: string }) {
  if (!value) return null;
  return (
    <p className="whitespace-pre-line break-words text-muted-foreground">
      {label ? <span className="font-medium text-foreground">{label}: </span> : null}
      {value}
    </p>
  );
}

/**
 * The published information for one university. It reads the same record the
 * admin portal manages (through an API that returns published copies only).
 * If nothing has been published there is a plain empty state; no text is ever
 * made up to fill a gap.
 */
export function UniversityInfoView({ universityId }: { universityId: string | null | undefined }) {
  const [state, setState] = useState<{ loading: boolean; error: string; data: PublishedUniversity | null }>({ loading: Boolean(universityId), error: '', data: null });

  useEffect(() => {
    let live = true;
    if (!universityId) { setState({ loading: false, error: '', data: null }); return; }
    setState({ loading: true, error: '', data: null });
    fetchUniversityInfo(universityId)
      .then((data) => { if (live) setState({ loading: false, error: '', data }); })
      .catch((error: Error) => { if (live) setState({ loading: false, error: error.message, data: null }); });
    return () => { live = false; };
  }, [universityId]);

  if (state.loading) {
    return <div className="flex justify-center py-6" aria-label="Loading university information"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }
  if (state.error) {
    return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid="university-info-error">{state.error}</p>;
  }
  const raw = state.data?.info;
  if (!universityId || !raw) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground" data-testid="university-info-empty">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Detailed information for this university has not been published yet. Please check back soon, or ask your counselor.</span>
      </p>
    );
  }

  const info: UniversityInfo = normalizeUniversityInfo(raw);
  const asset = (file: string) => universityAssetUrl(universityId, file);
  const where = [info.basic.campus_location, [info.basic.city, info.basic.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const images = [...info.branding.campus_images, ...info.branding.gallery];
  const feeLine = [info.fees.tuition, info.fees.currency, info.fees.period ? `per ${info.fees.period.replace(/^per\s+/i, '')}` : ''].filter(Boolean).join(' ');
  const hasAdmission = info.admission.academic || info.admission.english || info.admission.other;
  const webLinks = [
    info.links.website ? { label: 'Official website', url: info.links.website } : null,
    info.links.admissions_page ? { label: 'Admissions page', url: info.links.admissions_page } : null,
    ...info.links.other.map((link) => ({ label: link.label, url: link.url })),
  ].filter((link): link is { label: string; url: string } => Boolean(link && isWebUrl(link.url)));

  return (
    <div className="space-y-4 text-sm" data-testid="university-info">
      <div className="flex items-start gap-3">
        {info.branding.logo ? (
          <AuthImage url={asset(info.branding.logo.file)} getToken={studentToken} alt={info.branding.logo.caption || 'University logo'} className="h-14 w-14 shrink-0 rounded-md border bg-white object-contain" />
        ) : null}
        <div className="min-w-0">
          {info.basic.name ? <p className="text-base font-semibold">{info.basic.name}</p> : null}
          {where ? <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{where}</p> : null}
        </div>
      </div>

      {info.basic.overview ? (
        <Block title="Overview" testId="info-overview"><Text value={info.basic.overview} /></Block>
      ) : null}

      {images.length ? (
        <Block title="Campus and gallery" testId="info-images">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <figure key={`${image.file}-${index}`} className="w-44 shrink-0">
                <AuthImage url={asset(image.file)} getToken={studentToken} alt={image.caption || 'Campus image'} className="h-28 w-44 rounded-md border object-cover" />
                {image.caption ? <figcaption className="mt-1 text-xs text-muted-foreground">{image.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </Block>
      ) : null}

      {info.programs.length ? (
        <Block title="Programmes" testId="info-programs">
          <ul className="space-y-2">
            {info.programs.map((program, index) => (
              <li key={`${program.name}-${index}`} className="rounded-md border p-2.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <GraduationCap className="h-4 w-4 text-primary" />{program.name}
                  {program.degree_level ? <Badge variant="outline">{program.degree_level}</Badge> : null}
                  {program.duration ? <span className="text-xs font-normal text-muted-foreground">{program.duration}</span> : null}
                </p>
                <Text value={program.courses} label="Courses" />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {feeLine || info.fees.other_costs ? (
        <Block title="Fees" testId="info-fees">
          {feeLine ? <p className="font-medium">Tuition: {feeLine}</p> : null}
          <Text value={info.fees.other_costs} />
        </Block>
      ) : null}

      {hasAdmission ? (
        <Block title="Admission requirements" testId="info-admission">
          <Text label="Academic" value={info.admission.academic} />
          <Text label="English language" value={info.admission.english} />
          <Text label="Other" value={info.admission.other} />
        </Block>
      ) : null}

      {info.intakes.length || info.important_dates.length ? (
        <Block title="Intakes and deadlines" testId="info-intakes">
          <ul className="space-y-1">
            {info.intakes.map((intake, index) => (
              <li key={`${intake.period}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
                <Calendar className="h-3.5 w-3.5 self-center text-primary" />
                <span className="font-medium">{intake.period}</span>
                {intake.deadline ? <span className="text-muted-foreground">Apply by {formatDate(intake.deadline)}</span> : null}
                {intake.notes ? <span className="text-xs text-muted-foreground">({intake.notes})</span> : null}
              </li>
            ))}
            {info.important_dates.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
                <Calendar className="h-3.5 w-3.5 self-center text-primary" />
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground">{formatDate(item.date)}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {info.brochures.length || webLinks.length ? (
        <Block title="Brochures and official links" testId="info-links">
          <ul className="space-y-1.5">
            {info.brochures.map((brochure, index) => (
              <li key={`${brochure.label}-${index}`}>
                {brochure.file ? (
                  <Button variant="link" className="h-auto p-0" onClick={() => void openAssetInTab(asset(brochure.file as string), studentToken).catch(() => undefined)}>
                    <FileText className="mr-1 h-4 w-4" />{brochure.label} (PDF)
                  </Button>
                ) : isWebUrl(brochure.url) ? (
                  <a href={brochure.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                    <FileText className="h-4 w-4" />{brochure.label}
                  </a>
                ) : null}
              </li>
            ))}
            {webLinks.map((link, index) => (
              <li key={`${link.url}-${index}`}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                  <ExternalLink className="h-4 w-4" />{link.label}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}
