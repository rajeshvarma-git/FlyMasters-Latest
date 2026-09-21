import crypto from "crypto";

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function detectDelimiter(headerLine) {
  const tabs = (headerLine.match(/\t/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return tabs >= commas ? "\t" : ",";
}

function splitLine(line, delimiter) {
  if (delimiter !== ",") {
    return line.split(delimiter).map(stripQuotes);
  }

  const cells = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i + 1] === quote) {
        current += ch;
        i += 1;
      } else if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ",") {
      cells.push(stripQuotes(current));
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(stripQuotes(current));
  return cells;
}

function normalizeHeader(value) {
  return stripQuotes(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = {
  country: "country",
  degree: "degree",
  course: "course",
  specialization: "specialization",
  name: "program_name",
  programname: "program_name",
  coursename: "program_name",
  uni: "university_name",
  university: "university_name",
  universityname: "university_name",
  loc: "location",
  location: "location",
  city: "city",
  duration: "duration",
  fee: "fee",
  tuition: "fee",
  lang: "language",
  language: "language",
  progdesc: "program_description",
  programdescription: "program_description",
  description: "program_description",
  eligcriteria: "eligibility",
  eligibility: "eligibility",
  career: "career",
  deadline: "deadline",
  ranking: "ranking",
  website: "website_url",
  websiteurl: "website_url",
  tieup: "is_tie_up",
  istieup: "is_tie_up",
};

export function parseCatalogCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) {
    throw new Error("The file is empty.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map(normalizeHeader);
  const mapped = headers.map((header) => HEADER_ALIASES[header] || header);
  const required = ["university_name", "program_name"];
  for (const key of required) {
    if (!mapped.includes(key)) {
      throw new Error(`Missing required column: ${key}. Found: ${headers.join(", ")}`);
    }
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i], delimiter);
    if (!cells.some((cell) => cell.trim())) continue;

    const record = {};
    mapped.forEach((key, index) => {
      record[key] = stripQuotes(cells[index] || "");
    });

    const universityName = String(record.university_name || "").trim();
    const programName = String(record.program_name || "").trim();
    if (!universityName || !programName) continue;

    const location = String(record.location || record.city || "").trim();
    const [cityPart, regionPart] = location.split(",").map((part) => part.trim());
    const country = String(record.country || "").trim();
    const city = String(record.city || cityPart || "").trim();

    rows.push({
      country,
      degree: String(record.degree || "").trim(),
      course: String(record.course || "").trim(),
      specialization: String(record.specialization || "").trim(),
      program_name: programName,
      university_name: universityName,
      location,
      city,
      region: regionPart || "",
      duration: String(record.duration || "").trim(),
      fee: String(record.fee || "").trim(),
      language: String(record.language || "").trim(),
      program_description: String(record.program_description || "").trim(),
      eligibility: String(record.eligibility || "").trim(),
      career: String(record.career || "").trim(),
      deadline: String(record.deadline || "").trim(),
      ranking: Number(record.ranking || 0) || 0,
      website_url: String(record.website_url || "").trim(),
      is_tie_up: ["yes", "true", "1", "y"].includes(String(record.is_tie_up || "").trim().toLowerCase()),
    });
  }

  if (!rows.length) {
    throw new Error("No valid program rows were found in the file.");
  }
  return rows;
}

export function catalogKeys(row) {
  const uniKey = `${row.country}|${row.university_name}`.toLowerCase();
  const programKey = `${uniKey}|${row.program_name}`.toLowerCase();
  return {
    universityId: `uni-${crypto.createHash("sha1").update(uniKey).digest("hex").slice(0, 12)}`,
    programId: `prog-${crypto.createHash("sha1").update(programKey).digest("hex").slice(0, 16)}`,
  };
}

export function buildCatalogRecords(rows, sourceFile = "") {
  const now = new Date().toISOString();
  const universities = new Map();
  const programs = [];

  for (const row of rows) {
    const { universityId, programId } = catalogKeys(row);
    if (!universities.has(universityId)) {
      universities.set(universityId, {
        id: universityId,
        name: row.university_name,
        country: row.country,
        city: row.city,
        ranking: row.ranking,
        website_url: row.website_url,
        is_tie_up: row.is_tie_up,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    } else {
      const existing = universities.get(universityId);
      if (!existing.city && row.city) existing.city = row.city;
      if (!existing.website_url && row.website_url) existing.website_url = row.website_url;
      if (!existing.ranking && row.ranking) existing.ranking = row.ranking;
    }

    programs.push({
      id: programId,
      university_id: universityId,
      university_name: row.university_name,
      program_name: row.program_name,
      country: row.country,
      degree: row.degree,
      course: row.course,
      specialization: row.specialization,
      location: row.location,
      city: row.city,
      region: row.region,
      duration: row.duration,
      fee: row.fee,
      language: row.language,
      program_description: row.program_description,
      eligibility: row.eligibility,
      career: row.career,
      deadline: row.deadline,
      source_file: sourceFile,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }

  return {
    universities: [...universities.values()],
    programs,
  };
}
