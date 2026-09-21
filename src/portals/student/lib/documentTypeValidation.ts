export type DocumentMatchResult = { ok: true } | { ok: false; reason: string };

type DocumentKind =
  | 'resume'
  | 'sop'
  | 'lor'
  | 'photo'
  | 'passport'
  | 'aadhaar'
  | 'degree'
  | 'provisional'
  | 'marks'
  | 'english'
  | 'other';

const normalize = (value: string) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const hasAny = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

export function classifyDocumentSlot(documentType: string): DocumentKind {
  const type = normalize(documentType);

  if (/\b(resume|cv|curriculum)\b/.test(type)) return 'resume';
  if (/\b(sop|statement of purpose|motivation)\b/.test(type)) return 'sop';
  if (/\b(lor|recommendation)\b/.test(type)) return 'lor';
  if (/\b(photo|photograph|passport size)\b/.test(type)) return 'photo';
  if (/\b(aadhaar|aadhar|adhar)\b/.test(type)) return 'aadhaar';
  if (/\b(passport proof|passport copy|passport)\b/.test(type)) return 'passport';
  if (/\b(ielts|toefl|pte|duolingo|english test|gre|gmat|sat)\b/.test(type)) return 'english';
  if (/\b(provisional|pc)\b/.test(type)) return 'provisional';
  if (/\b(marksheet|marks memo|semwise|semester|consolidated|cmm|transcript|10th|12th)\b/.test(type)) {
    return 'marks';
  }
  if (/\b(original degree|degree certificate|\bod\b|graduation|convocation|diploma)\b/.test(type) || type.includes('original degree')) {
    return 'degree';
  }

  return 'other';
}

export function classifyFileName(fileName: string): DocumentKind | null {
  const name = normalize(String(fileName || "").replace(/\.[^.]+$/, ""));

  if (hasAny(name, [/\bresume\b/, /\bcv\b/, /\bcurriculum vitae\b/, /\bcurriculum\b/])) return 'resume';
  if (hasAny(name, [/\bsop\b/, /\bstatement of purpose\b/, /\bmotivation letter\b/])) return 'sop';
  if (hasAny(name, [/\blor\b/, /\bletter of recommendation\b/, /\brecommendation letter\b/])) return 'lor';
  if (hasAny(name, [/\bpassport size\b/, /\bpassport photo\b/, /\bphotograph\b/])) return 'photo';
  if (hasAny(name, [/\baadhaar\b/, /\baadhar\b/, /\badhar\b/])) return 'aadhaar';
  if (hasAny(name, [/\bpassport proof\b/, /\bpassport copy\b/, /\bpassport\b/])) return 'passport';
  if (hasAny(name, [/\bielts\b/, /\btoefl\b/, /\bpte\b/, /\bduolingo\b/, /\bgre\b/, /\bgmat\b/])) return 'english';
  if (hasAny(name, [/\bprovisional\b/, /\bpc\b/])) return 'provisional';
  if (hasAny(name, [/\bmarksheet\b/, /\bmarks memo\b/, /\bcmm\b/, /\bconsolidated\b/, /\btranscript\b/, /\bsemwise\b/])) {
    return 'marks';
  }
  if (hasAny(name, [/\boriginal degree\b/, /\bdegree certificate\b/, /\bgraduation\b/, /\bconvocation\b/, /\bdiploma\b/, /\bod\b/])) {
    return 'degree';
  }

  return null;
}

const SLOT_LABEL: Record<DocumentKind, string> = {
  resume: 'Resume / CV',
  sop: 'Statement of Purpose',
  lor: 'Letter of Recommendation',
  photo: 'Passport-size photo',
  passport: 'Passport proof',
  aadhaar: 'Aadhaar card proof',
  degree: 'Original Degree (OD)',
  provisional: 'Provisional Certificate',
  marks: 'Marks memo / transcript',
  english: 'English test score',
  other: 'this document',
};

export function validateDocumentFile(documentType: string, fileName: string, mimeType?: string): DocumentMatchResult {
  if (!documentType || !fileName) return { ok: true };
  const slot = classifyDocumentSlot(documentType);
  const detected = classifyFileName(fileName);
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(extension) || Boolean(mimeType?.startsWith('image/'));

  if (slot === 'photo' && !isImage) {
    return {
      ok: false,
      reason: 'Passport-size photo must be an image file (JPG or PNG), not a PDF or resume.',
    };
  }

  if (detected && detected !== slot && slot !== 'other') {
    return {
      ok: false,
      reason: `This file looks like a ${SLOT_LABEL[detected]}, not ${documentType}. Please upload the correct document.`,
    };
  }

  return { ok: true };
}
