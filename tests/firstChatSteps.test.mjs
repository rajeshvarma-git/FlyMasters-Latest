// The student's first chat: academic questions, then the optional branch, then the required WhatsApp number.

import test from "node:test";
import assert from "node:assert/strict";
import { ACADEMIC_STEPS, getActiveSteps, buildChatContext } from "../src/portals/student/lib/chatContext.ts";
import { validateChatStep } from "../src/portals/student/lib/chatValidation.ts";

const keys = (steps) => steps.map((s) => s.key);

test("a brand-new student is asked everything, branch second to last and WhatsApp last", () => {
  const steps = getActiveSteps({});
  assert.deepEqual(keys(steps), ["country", "qualification", "streamOrProgram", "academicScore", "budget", "branch", "whatsapp"]);
  assert.ok(steps.at(-1).finalReply, "the last question should hand over to the university results");
});

test("a returning student who already answered is not asked again", () => {
  const ctx = buildChatContext({ email: "a@x.test" }, {
    full_name: "A B", phone: "9876543210", whatsapp_number: "9876543210", branch_choice: "skipped",
    interested_countries: ["UK"], degree_level: "Bachelors", course_preferences: "Nursing", bachelors_score: "80%", study_budget: "20 lakhs",
  });
  assert.deepEqual(keys(getActiveSteps(ctx)), []);
});

test("someone who answered the academic questions but not branch or WhatsApp is asked only those two", () => {
  const ctx = buildChatContext({ email: "a@x.test" }, {
    interested_countries: ["UK"], degree_level: "Bachelors", course_preferences: "Nursing", bachelors_score: "80%", study_budget: "20 lakhs",
  });
  assert.deepEqual(keys(getActiveSteps(ctx)), ["branch", "whatsapp"]);
});

test("the budget answer leads into the branch question, and the branch answer into WhatsApp", () => {
  const byKey = Object.fromEntries(ACADEMIC_STEPS.map((s) => [s.key, s]));
  assert.match(byKey.budget.reply("20 lakhs"), /branch/i);
  assert.match(byKey.branch.reply("Ameerpet"), /Ameerpet/);
  assert.match(byKey.branch.reply("Ameerpet"), /WhatsApp/);
  assert.match(byKey.branch.reply("skipped"), /Head Office/);
});

test("the WhatsApp number is required and must be a real 10-digit mobile number", () => {
  assert.equal(validateChatStep("whatsapp", "").valid, false);
  assert.equal(validateChatStep("whatsapp", "abc").valid, false);
  assert.equal(validateChatStep("whatsapp", "12345").valid, false);
  assert.equal(validateChatStep("whatsapp", "5876543210").valid, false, "Indian mobiles start with 6-9");
  const ok = validateChatStep("whatsapp", "+91 98765 43210");
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, "9876543210");
});
