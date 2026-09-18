import assert from "node:assert/strict";
import test from "node:test";
import { createLocalHostCooperativeYield } from "../src/local-host-cooperative-yield.mjs";

test("cooperative yielding bounds a microtask chain and coalesces concurrent yields", async () => {
  let now = 0, calls = 0, release;
  const cooperate = createLocalHostCooperativeYield({ intervalMilliseconds: 10, now: () => now,
    yieldToHost: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  for (let index = 0; index < 100; index++) await cooperate();
  assert.equal(calls, 0);
  now = 10;
  const first = cooperate();
  const second = cooperate();
  await Promise.resolve();
  assert.equal(calls, 1);
  now = 12; release();
  await Promise.all([first, second]);
  now = 21; await cooperate(); assert.equal(calls, 1);
  now = 22; const third = cooperate(); await Promise.resolve();
  assert.equal(calls, 2); release(); await third;
});

test("failed yielding propagates and can be retried without granting lease authority", async () => {
  let now = 0, fail = true;
  const cooperate = createLocalHostCooperativeYield({ intervalMilliseconds: 1, now: () => now,
    yieldToHost: async () => { if (fail) throw new Error("scheduler failed"); } });
  now = 1;
  await assert.rejects(cooperate(), /scheduler failed/);
  fail = false; await cooperate();
  for (const intervalMilliseconds of [0, -1, Infinity, NaN]) assert.throws(() => createLocalHostCooperativeYield({ intervalMilliseconds }), /invalid/);
});

test("real event-loop timer runs during sustained asynchronous artifact-style work", async () => {
  let fired = false;
  const timer = setTimeout(() => { fired = true; }, 0);
  const cooperate = createLocalHostCooperativeYield({ intervalMilliseconds: 1 });
  const deadline = performance.now() + 2000;
  try {
    while (!fired && performance.now() < deadline) await cooperate();
    assert.equal(fired, true, "resolved promise continuations must not starve the host timer");
  } finally { clearTimeout(timer); }
});

test("a backwards host clock still yields once and resets the scheduling boundary", async () => {
  let now = 1000, calls = 0;
  const cooperate = createLocalHostCooperativeYield({ intervalMilliseconds: 10, now: () => now,
    yieldToHost: async () => { calls++; } });
  now = 900;
  await cooperate();
  assert.equal(calls, 1);
  now = 909; await cooperate(); assert.equal(calls, 1);
  now = 910; await cooperate(); assert.equal(calls, 2);
});
