import { canonicalJsonDigest } from "./content-digest.mjs";
import { initializeLocalCompletionLedger } from "./local-completion-ledger.mjs";
import { deriveLocalWorkReadiness, assertLocalCompletionSnapshotCurrent } from "./local-work-readiness.mjs";

// Host-owned scheduling only. A missed deadline remains a failure, even if a
// later callback runs; renewing never reacquires or resurrects ownership.
export function createLocalHostLeaseKeeper({ storage, runId, owner, expectedVersion,
  scheduler = { setInterval, clearInterval } }) {
  if (typeof scheduler?.setInterval !== "function" || typeof scheduler?.clearInterval !== "function") {
    throw new TypeError("host lease requires an interval scheduler");
  }
  const durationMilliseconds = 120_000;
  const lease = storage.acquireLease({ runId, owner, expectedVersion, durationMilliseconds });
  let failure;
  let closed = false;
  const throwIfFailed = () => { if (failure) throw failure; };
  const assertCurrent = () => {
    throwIfFailed();
    if (closed) throw new TypeError("host lease is closed");
    try { storage.renewLease({ runId, leaseToken: lease.token, expectedVersion, durationMilliseconds }); }
    catch (error) { failure = error; throw error; }
  };
  let timer;
  try {
    timer = scheduler.setInterval(() => {
      if (closed || failure) return;
      try { assertCurrent(); } catch { /* The foreground boundary reports it. */ }
    }, 10_000);
    timer?.unref?.();
  } catch (error) {
    storage.releaseLease({ runId, leaseToken: lease.token });
    throw error;
  }
  return Object.freeze({ lease, assertCurrent, throwIfFailed, close() {
    if (closed) return;
    closed = true;
    scheduler.clearInterval(timer);
    try { storage.releaseLease({ runId, leaseToken: lease.token }); }
    catch (error) {
      // Lost ownership is expected during recovery; preserve the original
      // failure and leave a successor's lease untouched. Other errors matter.
      if (error.code !== "DR4924") throw error;
    }
  } });
}

// The caller first verifies current assignment activation and all upstream
// Gates. Recovery composes the same ledger/readiness validation as a fresh run.
export async function prepareLocalWorkQueue({ records, ...request }) {
  initializeLocalCompletionLedger(request);
  const readiness = await deriveLocalWorkReadiness(request);
  const workReadinessKey = `work-readiness:${readiness.readinessDigest}`;
  records.put(workReadinessKey, readiness);
  assertLocalWorkQueueCurrent({ ...request, records, readiness });
  return { readiness, workReadinessKey };
}

export function assertLocalWorkQueueCurrent({ storage, namespace, records, readiness }) {
  const saved = records.get(`work-readiness:${readiness.readinessDigest}`);
  if (!saved || canonicalJsonDigest(saved) !== canonicalJsonDigest(readiness)) {
    throw new TypeError("local work queue: saved readiness differs");
  }
  assertLocalCompletionSnapshotCurrent({ storage, namespace, ...readiness });
}
