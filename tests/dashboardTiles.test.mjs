// Every dashboard tile must open a view that shows the records it counted.
//
// Reported 19 Nov 2026: clicking "Leads" (5) and "Hot leads" (4) landed on the same page. Both tiles
// pointed at /leads, so the 4 hot leads opened the full list with nothing marking which were hot -
// and the default tab showed only leads with no counselor, so even the 5 was not what you got. Two
// more tiles had the same fault: "With a counselor" and "Converted this month" both went to the
// unfiltered student list.
//
// A tile is a question - "which 4?" - and the answer has to be on the page it opens.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Pulls the tile list out of the dashboard: label, the expression it counts, and where it links. */
function tiles() {
  const src = read("src/portals/admin/admin/Dashboard.tsx");
  const start = src.lastIndexOf("const stats = [");
  assert.ok(start > 0, "the dashboard no longer has a stats array");
  const block = src.slice(start, src.indexOf("];", start));
  const found = [...block.matchAll(/\{\s*label:\s*"([^"]+)",\s*value:\s*([^,]+),[^}]*to:\s*"([^"]+)"/g)]
    .map(([, label, value, to]) => ({ label, value: value.trim(), to }));
  assert.ok(found.length >= 6, `only ${found.length} tiles parsed`);
  return found;
}

test("no two tiles counting different things lead to the same place", () => {
  const byDestination = new Map();
  for (const tile of tiles()) {
    const sharing = byDestination.get(tile.to);
    if (sharing && sharing.value !== tile.value) {
      assert.fail(
        `"${sharing.label}" and "${tile.label}" both open ${tile.to} while counting different things `
        + `(${sharing.value} vs ${tile.value}): whichever you click, the number is not on the page you land on`,
      );
    }
    byDestination.set(tile.to, tile);
  }
});

test("the Leads tile opens the full lead list, and there is no separate Hot leads tile", () => {
  const all = tiles();
  const leads = all.find((t) => t.label === "Leads");
  assert.ok(leads, "the Leads tile is gone");
  // Hot leads is a filter of the same list, so a second tile for it read as a duplicate (reported 26 Nov 2026).
  assert.equal(all.find((t) => t.label === "Hot leads"), undefined, "a Hot leads tile is back beside Leads");
  assert.match(leads.to, /owner=all/, "the Leads tile opens a tab that hides leads it counted");
});

test("the student tiles open the student list narrowed to what they counted", () => {
  const all = tiles();
  const converted = all.find((t) => t.label === "Converted this month");
  const needs = all.find((t) => t.label === "Need counselor");
  assert.match(converted.to, /converted=month/);
  assert.match(needs.to, /view=assign/, "the long-standing assign view link was lost");
});

// ---- the screens have to understand what the tiles ask for -------------------------------------

test("the lead list reads both filters from the URL, and keeps them there", () => {
  const src = read("src/portals/admin/admin/Leads.tsx");
  const live = src.slice(src.lastIndexOf("export default function Leads()"));
  assert.match(src, /function parseStatus\(/, "the status filter cannot be set from a link");
  assert.match(live, /parseStatus\(searchParams\.get\("status"\)\)/, "the status filter ignores the URL");
  assert.match(live, /parseOwner\(searchParams\.get\("owner"\)\)/, "the owner filter ignores the URL");
  assert.match(live, /onChange=\{\(e\) => selectStatus\(e\.target\.value\)\}/,
    "changing the status drop-down no longer updates the URL, so the view cannot be linked to or shared");
  assert.match(src, /if \(value === "all"\) return "all";/, "the owner filter has no 'all' option for a link to use");
});

test("an unknown filter value falls back rather than showing an empty page", () => {
  const src = read("src/portals/admin/admin/Leads.tsx");
  assert.match(src, /STATUSES\.includes\(value\) \? value : "all"/,
    "a stale or mistyped ?status= would filter everything away with no explanation");
});

test("the student list reads its filters and says when it is showing a narrowed set", () => {
  const src = read("src/portals/admin/admin/Students.tsx");
  const live = src.slice(src.lastIndexOf("export default function Students()"));
  assert.match(live, /searchParams\.get\("counselor"\)/);
  assert.match(live, /searchParams\.get\("converted"\)/);
  // A filtered list that looks like the whole list is how someone concludes their students vanished.
  assert.match(live, /narrowed/, "nothing tells the person the list is filtered");
  assert.match(live, /Show all students/, "there is no way back to the full list");
});
