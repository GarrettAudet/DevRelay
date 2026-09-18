import { claimWorkAttempt, createWorkContinuityIndex } from "./work-continuity.mjs";
import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

// Desktop host claim boundary over the existing durable continuity store.
// Readiness, activated context, quality and worktree grants must be established
// by the caller's host composition first. This does not dispatch or integrate.
export function claimLocalWorkContinuity(request) {
  const allowed = ["store", "workFingerprint", "attemptId", "owner", "leaseExpiresAt", "now", "expectedHostVersion", "expectedIndexRevision"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) throw new TypeError("local continuity: undeclared claim input");
  const { store, workFingerprint, attemptId, owner, leaseExpiresAt, now, expectedHostVersion, expectedIndexRevision } = request;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(leaseExpiresAt) || leaseExpiresAt <= now) throw new TypeError("local continuity: a future bounded attempt lease is required");
  if (!store || store.runId !== `work-continuity/${workFingerprint?.material?.projectId}`) throw new TypeError("local continuity: exact project store required");
  const current = store.read();
  if (current.version !== expectedHostVersion || current.state.index.revision !== expectedIndexRevision) throw new TypeError("local continuity: stale claim version");
  // Fingerprint-only exclusion is insufficient: changing configuration, quality,
  // target revision or assignment must not bypass an unresolved work-item claim.
  // Expired and quarantined attempts remain unresolved until explicit recovery.
  const conflicting = current.state.index.records.find(record => record.workItemId === workFingerprint?.material?.workItem?.id &&
    ["prepared", "dispatched", "running", "quarantined"].includes(record.status));
  if (conflicting) throw new TypeError(`local continuity: work item requires recovery or completion of attempt ${conflicting.attemptId}`);
  const claim = claimWorkAttempt({ index: current.state.index, expectedRevision: expectedIndexRevision,
    workFingerprint, attemptId, owner, leaseExpiresAt, targetRevision: workFingerprint.material.targetRevision,
    qualityResolutionDigest: workFingerprint.material.qualityResolutionDigest });
  const committed = store.commit({ expectedHostVersion, expectedIndexRevision,
    transition: { kind: "LocalWorkClaimed", attemptId, fingerprint: workFingerprint.fingerprint, lease: claim.lease }, nextIndex: claim.index });
  return { lease: claim.lease, hostVersion: committed.version, indexRevision: committed.state.index.revision,
    indexDigest: committed.state.index.indexDigest };
}

// Read-only recovery of the original committed claim after a lost host response.
// It does not renew a lease or authorize task creation; changed/expired/advanced
// attempts require explicit reconciliation instead of being silently revived.
export function recoverLocalWorkContinuityClaim(request) {
  return inspectClaim(request, true);
}

// Verifies the original immutable claim, not current execution permission.
// No clock input is accepted: expiration cannot invalidate historical evidence.
export function verifyLocalWorkContinuityClaim(request) {
  return inspectClaim(request, false);
}

function inspectClaim(request, activeRecovery) {
  const allowed = ["storage", "store", "workFingerprint", "attemptId", "owner", "leaseExpiresAt", "expectedHostVersion", "expectedIndexRevision", ...(activeRecovery ? ["now"] : [])];
  const fail = message => { throw new TypeError(`local claim recovery: ${message}`); };
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) fail("undeclared input");
  const { storage, store, workFingerprint, attemptId, owner, leaseExpiresAt, now, expectedHostVersion, expectedIndexRevision } = request;
  if (!Number.isSafeInteger(leaseExpiresAt) || (activeRecovery && (!Number.isSafeInteger(now) || leaseExpiresAt <= now))) fail("expired or invalid lease requires reconciliation");
  if (!store || store.runId !== `work-continuity/${workFingerprint?.material?.projectId}` ||
      !Number.isSafeInteger(expectedHostVersion) || expectedHostVersion < 0 || !Number.isSafeInteger(expectedIndexRevision) || expectedIndexRevision < 0) fail("invalid project or original revision");
  const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
  const current = store.read();
  const readIndex = ref => {
    const bytes = storage.getArtifact(ref);
    const value = JSON.parse(bytes);
    const index = createWorkContinuityIndex({ records: value.records, revision: value.revision });
    if (!same(value, index) || bytes.toString("utf8") !== canonicalJson(index)) fail("stored index differs");
    return index;
  };
  let prior;
  if (expectedHostVersion === 0 && expectedIndexRevision === 0) prior = createWorkContinuityIndex();
  else {
    const rows = storage.readTransitionJournal(store.runId, { toVersion: expectedHostVersion });
    if (rows.length !== 1 || !rows[0].checkpointRef) fail("prior index evidence missing");
    prior = readIndex(rows[0].checkpointRef);
  }
  const claimed = claimWorkAttempt({ index: prior, expectedRevision: expectedIndexRevision, workFingerprint,
    attemptId, owner, leaseExpiresAt, targetRevision: workFingerprint.material.targetRevision,
    qualityResolutionDigest: workFingerprint.material.qualityResolutionDigest });
  const rows = storage.readTransitionJournal(store.runId, { toVersion: expectedHostVersion + 1 });
  const transition = { kind: "LocalWorkClaimed", attemptId, fingerprint: workFingerprint.fingerprint, lease: claimed.lease };
  if (rows.length !== 1 || rows[0].fromVersion !== expectedHostVersion || !same(rows[0].transition, transition) ||
      !rows[0].checkpointRef || !same(rows[0].artifactRefs, [rows[0].checkpointRef]) || !same(readIndex(rows[0].checkpointRef), claimed.index)) fail("exact original claim evidence missing or substituted");
  const expected = claimed.index.records.find(item => item.attemptId === attemptId);
  const observed = current.state.index.records.find(item => item.attemptId === attemptId);
  const identity = ({ status, receiptDigest, resultDigest, evidenceDigest, ...immutable }) => immutable;
  if (current.version < rows[0].toVersion || current.state.index.revision < claimed.index.revision ||
      !observed || !same(identity(observed), identity(expected)) ||
      (activeRecovery && !same(observed, expected))) fail("attempt advanced or differs; reconciliation required");
  return { lease: claimed.lease, hostVersion: rows[0].toVersion, indexRevision: claimed.index.revision, indexDigest: claimed.index.indexDigest };
}
