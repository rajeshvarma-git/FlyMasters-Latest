// Deployed commit visibility (milestone 3.1).
//
// A green acceptance run against an unknown commit proves nothing, so a deployed environment has to be
// able to say what it is running. The resolver is a pure function over the environment, which is why
// this needs no deployment.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveBuildInfo } from "../server/lib/buildInfo.mjs";

const SHA = "2ed40d9f1b3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f";

test("Railway's variables are read, and the short form is the first seven characters", () => {
  const info = resolveBuildInfo({ RAILWAY_GIT_COMMIT_SHA: SHA, RAILWAY_GIT_BRANCH: "main", RAILWAY_ENVIRONMENT_NAME: "staging" });
  assert.equal(info.commit, SHA);
  assert.equal(info.short, "2ed40d9");
  assert.equal(info.branch, "main");
  assert.equal(info.environment, "staging");
});

test("other platforms' names work too, so the host can change", () => {
  for (const name of ["GIT_COMMIT_SHA", "GIT_COMMIT", "COMMIT_SHA", "SOURCE_VERSION", "VERCEL_GIT_COMMIT_SHA", "HEROKU_SLUG_COMMIT"]) {
    assert.equal(resolveBuildInfo({ [name]: SHA }).short, "2ed40d9", `${name} was ignored`);
  }
});

test("Railway's name wins when several are set, because that is the platform in use", () => {
  const info = resolveBuildInfo({ RAILWAY_GIT_COMMIT_SHA: SHA, GIT_COMMIT: "0000000000000000000000000000000000000000" });
  assert.equal(info.commit, SHA);
});

test("nothing configured reports null rather than a guess", () => {
  const info = resolveBuildInfo({});
  assert.equal(info.commit, null);
  assert.equal(info.short, null);
  assert.equal(info.branch, null);
  // An unknown commit is a fact worth surfacing: it means nobody can say what the host is running.
});

test("blank and whitespace-only values count as absent", () => {
  assert.equal(resolveBuildInfo({ RAILWAY_GIT_COMMIT_SHA: "   ", GIT_COMMIT: "" }).commit, null);
});

test("NODE_ENV stands in for the environment name when the platform gives none", () => {
  assert.equal(resolveBuildInfo({ NODE_ENV: "production" }).environment, "production");
});
