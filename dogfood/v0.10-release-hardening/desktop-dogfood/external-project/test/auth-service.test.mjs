import assert from "node:assert/strict";
import test from "node:test";

import { createAuthService } from "../src/auth-service.mjs";

test("valid credentials produce an authentic session that can be revoked", () => {
  const service = createAuthService({ users: [{ username: "ada", password: "correct" }] });
  const signedIn = service.signIn("ada", "correct");
  assert.equal(signedIn.ok, true);
  assert.deepEqual(service.authenticate(signedIn.token), { ok: true, username: "ada" });
  assert.equal(service.revoke(signedIn.token), true);
  assert.deepEqual(service.authenticate(signedIn.token), { ok: false, code: "INVALID_SESSION" });
});

test("unknown users and wrong passwords have an identical failure contract", () => {
  const service = createAuthService({ users: [{ username: "ada", password: "correct" }] });
  assert.deepEqual(service.signIn("ada", "wrong"), service.signIn("unknown", "wrong"));
  assert.deepEqual(service.signIn("ada", "wrong"), {
    ok: false,
    code: "INVALID_CREDENTIALS",
  });
});

test("expired sessions fail closed", () => {
  let clock = 1_000;
  const service = createAuthService({
    users: [{ username: "ada", password: "correct" }],
    sessionTtlMs: 10,
    now: () => clock,
  });
  const signedIn = service.signIn("ada", "correct");
  clock = 1_011;
  assert.deepEqual(service.authenticate(signedIn.token), { ok: false, code: "INVALID_SESSION" });
});

test("100 concurrent sign-ins complete below the approved 500ms p95 threshold", async () => {
  const service = createAuthService({ users: [{ username: "ada", password: "correct" }] });
  const durations = await Promise.all(
    Array.from({ length: 100 }, async () => {
      const started = performance.now();
      const result = service.signIn("ada", "correct");
      assert.equal(result.ok, true);
      return performance.now() - started;
    }),
  );
  durations.sort((a, b) => a - b);
  assert.ok(durations[94] < 500, `p95 ${durations[94]}ms exceeded 500ms`);
});
