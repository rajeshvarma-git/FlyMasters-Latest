import test from "node:test";
import assert from "node:assert/strict";
import { isLocalHost } from "../src/shared/localHost.ts";

test("preview is allowed only for this computer's own host names", () => {
  for (const ok of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"]) assert.equal(isLocalHost(ok), true, ok);
});

test("anything else, including look-alikes, LAN and public hosts, is refused", () => {
  for (const bad of ["", "localhost.evil.com", "evil-localhost", "127.0.0.1.nip.io", "0.0.0.0", "192.168.1.20", "10.0.0.5", "flymasters.example.com", "localhost:8080.evil.com", "::2", "127.0.0.2", "app.localhost"]) {
    assert.equal(isLocalHost(bad), false, bad);
  }
});
