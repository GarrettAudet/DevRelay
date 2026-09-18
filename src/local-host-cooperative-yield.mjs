import { setImmediate as yieldToEventLoop } from "node:timers/promises";

// Resolved promises only yield to microtasks, not to lease heartbeat timers.
// Bound consecutive host artifact-load work without changing any expiry rule.
// A single synchronous operation can still exceed its lease and must fail closed.
export function createLocalHostCooperativeYield({ intervalMilliseconds = 250,
  now = () => performance.now(), yieldToHost = yieldToEventLoop } = {}) {
  if (!Number.isFinite(intervalMilliseconds) || intervalMilliseconds <= 0 ||
      typeof now !== "function" || typeof yieldToHost !== "function") throw new TypeError("invalid cooperative yield configuration");
  let lastYield = now();
  let pending;
  return async function cooperate() {
    if (pending) return pending;
    const elapsed = now() - lastYield;
    // A host wall clock can be adjusted backwards; still let heartbeat timers
    // run instead of starving them until the old reading is reached again.
    if (elapsed >= 0 && elapsed < intervalMilliseconds) return;
    pending = Promise.resolve().then(yieldToHost).then(() => { lastYield = now(); });
    try { await pending; }
    finally { pending = undefined; }
  };
}
