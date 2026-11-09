// The two rules a Capacitor WebView forces on the staff portals.
//
// Neither needs a device: both are plain functions that take `native` as an argument, which is why
// they are written that way. The device still has to be tested, but these two are where a mobile
// build silently breaks, so they are pinned here.
//
// Background. Nothing in the app called initCapacitor, getApiBase or useNativeApp: the Capacitor
// packages were installed and the code was never wired up. Two consequences were waiting:
//
//   1. Relative requests. A WebView has no server origin, so fetch("/api/...") resolves against
//      capacitor://localhost or http://localhost and never reaches the backend.
//   2. sessionStorage. The operating system destroys the WebView when it reclaims the app, so a token
//      in sessionStorage disappears and the person is signed out whenever they switch apps.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The source is TypeScript, so the rules are read out of it rather than imported. Each is a small
// pure function; this evaluates exactly the function under test and nothing else.
function load(file, name) {
  const source = readFileSync(new URL(`../src/shared/lib/${file}`, import.meta.url), "utf8");
  const start = source.indexOf(`export function ${name}`);
  assert.ok(start > -1, `${name} not found in ${file}`);

  // Walk the parameter list first: a default like `onError = () => {}` contains braces of its own, so
  // the body starts at the first `{` AFTER the parameter list closes.
  const open = source.indexOf("(", start);
  let depth = 0;
  let afterParams = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") { depth -= 1; if (depth === 0) { afterParams = i + 1; break; } }
  }
  assert.ok(afterParams > -1, `could not read the parameters of ${name}`);

  depth = 0;
  let end = -1;
  for (let i = source.indexOf("{", afterParams); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > -1, `could not read the body of ${name}`);

  const body = source.slice(start, end)
    .replace("export function", "function")
    .replace(/:\s*Record<string,\s*string\s*\|\s*undefined>/g, "")
    .replace(/:\s*\{\s*sessionStorage:\s*Storage;\s*localStorage:\s*Storage\s*\}/g, "")
    .replace(/:\s*\(message:\s*string\)\s*=>\s*void/g, "")
    .replace(/\)\s*:\s*(string|boolean|Storage)\s*\{/, ") {")
    .replace(/:\s*(boolean|string|Storage)\b/g, "");
  // The function uses module-level consts (the env-var names, the trimmer). Carry the single-line
  // declarations that precede it, so the test runs the real values rather than copies of them.
  const prelude = source
    .slice(0, start)
    .split("\n")
    .filter((line) => /^(export )?const \w+ = .*;$/.test(line.trim()))
    .map((line) => line.replace(/^export /, "").replace(/ as const;$/, ";").replace(/:\s*unknown/g, ""))
    .join("\n");

  return new Function(`${prelude}\n${body}; return ${name};`)();
}

const resolveApiBase = load("apiBase.ts", "resolveApiBase");
const storageFor = load("tokenStore.ts", "storageFor");

test("on the web the base stays empty, so a relative /api request is unchanged", () => {
  assert.equal(resolveApiBase({}, false), "");
});

test("a configured base is used, with any trailing slash removed", () => {
  assert.equal(resolveApiBase({ VITE_API_BASE_URL: "https://api.example.com/" }, false), "https://api.example.com");
  assert.equal(resolveApiBase({ VITE_API_URL: "https://api.example.com" }, true), "https://api.example.com");
  assert.equal(resolveApiBase({ VITE_API_TARGET: "https://api.example.com" }, true), "https://api.example.com");
});

test("all three names that the portals have used are accepted, in order", () => {
  const env = { VITE_API_BASE_URL: "https://one.example", VITE_API_URL: "https://two.example", VITE_API_TARGET: "https://three.example" };
  assert.equal(resolveApiBase(env, true), "https://one.example", "the first name should win");
  assert.equal(resolveApiBase({ VITE_API_URL: "https://two.example", VITE_API_TARGET: "https://three.example" }, true), "https://two.example");
});

test("a native build with nothing configured reports the problem instead of guessing an emulator address", () => {
  const said = [];
  const base = resolveApiBase({}, true, (message) => said.push(message));
  assert.equal(base, "", "it must not invent a localhost URL that works only on an emulator");
  assert.equal(said.length, 1, "a native build with no backend URL must say so");
  assert.match(said[0], /native build/i);
  for (const name of ["VITE_API_BASE_URL", "VITE_API_URL", "VITE_API_TARGET"]) {
    assert.ok(said[0].includes(name), `the message should name ${name}`);
  }
});

test("a web build keeps quiet when nothing is configured, because same-origin is correct there", () => {
  const said = [];
  resolveApiBase({}, false, (message) => said.push(message));
  assert.deepEqual(said, []);
});

test("the token goes to localStorage on a device and sessionStorage in a browser", () => {
  const win = { sessionStorage: { name: "session" }, localStorage: { name: "local" } };
  assert.equal(storageFor(true, win).name, "local", "sessionStorage is emptied when the WebView is reclaimed");
  assert.equal(storageFor(false, win).name, "session", "a staff token should not outlive the tab on a shared machine");
});

test("every portal's API client goes through the shared base", () => {
  const clients = {
    "src/portals/admin/lib/api.ts": true,
    "src/portals/counselor/lib/api.ts": true,
    "src/portals/telecaller/lib/api.ts": true,
    "src/portals/partner/lib/api.ts": true,
  };
  for (const file of Object.keys(clients)) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /from "@shared\/lib\/apiBase"/, `${file} does not use the shared base`);
    assert.doesNotMatch(
      source, /fetch\(\s*[`"']\/api/,
      `${file} still builds a relative /api URL, which cannot reach the backend from a WebView`,
    );
  }
});

test("no emulator address survives anywhere: it is right on an emulator and wrong on a phone", () => {
  for (const file of ["src/portals/student/lib/apiBase.ts", "src/shared/lib/apiBase.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /10\.0\.2\.2|localhost:8087/, `${file} still falls back to an emulator address`);
  }
});

test("the student portal shares the one resolver instead of keeping its own", () => {
  const source = readFileSync(new URL("../src/portals/student/lib/apiBase.ts", import.meta.url), "utf8");
  assert.match(source, /from "@shared\/lib\/apiBase"/);
});

test("the native shell is actually started from the entry point", () => {
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /initNative\(\)/, "nothing starts the native shell, so the splash screen never hides");
});
