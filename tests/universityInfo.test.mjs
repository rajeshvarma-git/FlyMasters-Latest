import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeInfo, emptyInfo, hasContent, assetFilesIn, safeUrl, parseUpload, sniffType,
  statusOf, studentView, infoHash, profileRecordId, MAX_IMAGE_BYTES,
} from "../server/lib/universityInfo.mjs";

const FILE = "0f8fad5b-d9cb-469f-a165-70867728950e.png";
const PDF = "1f8fad5b-d9cb-469f-a165-70867728950e.pdf";
const known = new Set([FILE, PDF]);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;

test("empty input yields an empty, valid info object", () => {
  const { info, errors } = sanitizeInfo(undefined);
  assert.deepEqual(errors, []);
  assert.deepEqual(info, emptyInfo());
  assert.equal(hasContent(info), false);
});

test("a full record is kept, unknown keys are dropped, text is trimmed", () => {
  const { info, errors } = sanitizeInfo({
    evil: "<script>", basic: { name: "  Test U  ", overview: "Hello", injected: 1 },
    branding: { logo: { file: FILE, caption: "Logo" }, campus_images: [{ file: FILE }], gallery: [] },
    programs: [{ name: "MSc Data", degree_level: "Masters", duration: "1 year", courses: "AI, ML" }],
    fees: { tuition: "20,000", currency: "gbp", period: "per year", other_costs: "Housing extra" },
    admission: { academic: "60%", english: "IELTS 6.5", other: "" },
    intakes: [{ period: "Fall 2027", deadline: "2027-03-01", notes: "" }],
    important_dates: [{ label: "Scholarship deadline", date: "2027-01-15" }],
    links: { website: "https://example.edu", admissions_page: "https://example.edu/apply", other: [{ label: "Housing", url: "https://example.edu/housing" }] },
    brochures: [{ label: "Prospectus", file: PDF }, { label: "Online", url: "https://example.edu/p.pdf" }],
  }, known);
  assert.deepEqual(errors, []);
  assert.equal(info.basic.name, "Test U");
  assert.equal("evil" in info, false);
  assert.equal("injected" in info.basic, false);
  assert.equal(info.fees.currency, "GBP");
  assert.equal(info.links.website, "https://example.edu/");
  assert.equal(hasContent(info), true);
  assert.deepEqual([...assetFilesIn(info)].sort(), [FILE, PDF].sort());
});

test("links: only http(s) without credentials are accepted", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.edu", "https://user:pw@example.edu", "example", "https://nodot", "//example.edu"]) {
    assert.equal(safeUrl(bad), null, bad);
  }
  assert.equal(safeUrl(""), "");
  assert.ok(safeUrl("http://example.edu/a?b=1"));
  const { errors } = sanitizeInfo({ links: { website: "javascript:alert(1)" } });
  assert.equal(errors[0].field, "links.website");
});

test("dates must be real calendar dates", () => {
  assert.equal(sanitizeInfo({ intakes: [{ period: "X", deadline: "2027-02-30" }] }).errors.length, 1);
  assert.equal(sanitizeInfo({ intakes: [{ period: "X", deadline: "01/03/2027" }] }).errors.length, 1);
  assert.equal(sanitizeInfo({ intakes: [{ period: "X", deadline: "2027-03-01" }] }).errors.length, 0);
});

test("rows with data but a missing required part are rejected, blank rows are dropped", () => {
  assert.equal(sanitizeInfo({ programs: [{ duration: "1 year" }] }).errors.length, 1);
  assert.equal(sanitizeInfo({ intakes: [{ notes: "x" }] }).errors.length, 1);
  assert.equal(sanitizeInfo({ important_dates: [{ label: "x" }] }).errors.length, 1);
  assert.equal(sanitizeInfo({ brochures: [{ label: "B" }] }).errors.length, 1);
  const { info, errors } = sanitizeInfo({ programs: [{}, { name: "" }], intakes: [{}], brochures: [{}] });
  assert.deepEqual(errors, []);
  assert.equal(info.programs.length, 0);
});

test("files can only be ones uploaded for this university, and of the right kind", () => {
  assert.equal(sanitizeInfo({ branding: { logo: { file: FILE } } }, new Set()).errors.length, 1);
  assert.equal(sanitizeInfo({ branding: { logo: { file: "../../etc/passwd" } } }, known).errors.length, 1);
  assert.equal(sanitizeInfo({ branding: { logo: { file: PDF } } }, known).errors.length, 1);
  assert.equal(sanitizeInfo({ brochures: [{ label: "B", file: FILE }] }, known).errors.length >= 1, true);
});

test("size and count limits", () => {
  assert.equal(sanitizeInfo({ basic: { overview: "x".repeat(5001) } }).errors.length, 1);
  assert.equal(sanitizeInfo({ programs: Array.from({ length: 101 }, (_, i) => ({ name: `P${i}` })) }).errors.length >= 1, true);
  assert.equal(sanitizeInfo({ fees: { currency: "dollars" } }).errors.length, 1);
  assert.equal(sanitizeInfo({ programs: [{ name: "P", degree_level: "Wizardry" }] }).errors.length, 1);
});

test("control characters are stripped", () => {
  assert.equal(sanitizeInfo({ basic: { name: "A\u0000B\u0007C" } }).info.basic.name, "ABC");
});

test("uploads: type comes from the content, not the label", () => {
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(parseUpload(dataUrl("image/png", PNG)).mime, "image/png");
  assert.ok(parseUpload(dataUrl("image/jpeg", PNG)).error, "PNG bytes labelled JPEG");
  assert.ok(parseUpload(dataUrl("image/svg+xml", Buffer.from("<svg onload=alert(1)/>"))).error, "SVG");
  assert.ok(parseUpload(dataUrl("text/html", Buffer.from("<script>alert(1)</script>"))).error, "HTML");
  assert.ok(parseUpload(dataUrl("image/png", Buffer.from("not an image"))).error, "garbage as png");
  assert.ok(parseUpload(dataUrl("application/pdf", Buffer.from("%PDF-1.7\n"))).mime === "application/pdf");
  assert.ok(parseUpload("data:image/png;base64,").error, "empty");
  assert.ok(parseUpload("hello").error, "not a data url");
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
  assert.ok(parseUpload(dataUrl("image/png", big)).error, "over the image limit");
});

test("status and the student view never leak a draft", () => {
  const draft = sanitizeInfo({ basic: { overview: "Secret draft" } }).info;
  assert.equal(statusOf(null), "none");
  assert.equal(statusOf({ draft }), "draft");
  const published = { draft, published: draft, published_hash: infoHash(draft) };
  assert.equal(statusOf(published), "published");
  const edited = { ...published, draft: { ...draft, basic: { ...draft.basic, overview: "New text" } } };
  assert.equal(statusOf(edited), "changed");
  // Draft only: students see nothing.
  assert.deepEqual(studentView({ draft }, { id: "u" }), { university: { id: "u" }, info: null });
  assert.equal(studentView(null, { id: "u" }).info, null);
  // Published + newer unpublished edits: students still see the published text.
  const view = studentView(edited, { id: "u" });
  assert.equal(view.info.basic.overview, "Secret draft");
  assert.equal("draft" in view, false);
  assert.equal(profileRecordId("uni-abc"), "uniinfo-uni-abc");
});
