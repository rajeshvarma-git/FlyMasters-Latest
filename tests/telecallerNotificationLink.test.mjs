import test from "node:test";
import assert from "node:assert/strict";
import { telecallerHref } from "../src/portals/telecaller/lib/notificationLink.ts";

test("absolute /telecaller paths are made relative to the router base", () => {
  assert.equal(telecallerHref("/telecaller/queue"), "/queue");
  assert.equal(telecallerHref("/telecaller/chat?lead=abc"), "/chat?lead=abc");
  assert.equal(telecallerHref("/telecaller/leads/123"), "/leads/123");
});

test("links to screens that do not exist fall back to the queue", () => {
  assert.equal(telecallerHref("/telecaller/leads"), "/queue");
  assert.equal(telecallerHref("/leads"), "/queue");
  assert.equal(telecallerHref("/telecaller/unknown-page"), "/queue");
  assert.equal(telecallerHref(""), "/queue");
  assert.equal(telecallerHref(undefined), "/queue");
});

test("lead links and full URLs resolve inside the portal", () => {
  assert.equal(telecallerHref("/x?lead=77"), "/whatsapp?lead=77");
  assert.equal(telecallerHref("https://app.example.com/telecaller/converted"), "/converted");
  assert.equal(telecallerHref("/telecaller/whatsapp?lead=9"), "/whatsapp?lead=9");
});
