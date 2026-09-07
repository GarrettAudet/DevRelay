import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

export class WorkContinuityError extends Error {
  constructor(message, code = "DR7200") {
    super(`work continuity: ${message}`);
    this.name = "WorkContinuityError";
    this.code = code;
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const fail = (message, code) => { throw new WorkContinuityError(message, code); };
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
const sorted = (values = []) => [...values].sort((a, b) => canonicalJsonDigest(a).localeCompare(canonicalJsonDigest(b)));

function normalizeFingerprintMaterial({ projectId, requirementsBaselineDigest, projectOverviewBaselineDigest, workItem, targetRevision, dependencyClosure = [], assignment, qualityResolutionDigest, inputs = [], implementationConfigurationDigest } = {}) {
  const required = { projectId, requirementsBaselineDigest, projectOverviewBaselineDigest, targetRevision, qualityResolutionDigest, implementationConfigurationDigest };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "string" || !value || (name.endsWith("Digest") && !DIGEST.test(value))) fail(`${name} is invalid`, "DR7201");
  }
  if (!workItem?.id || !assignment || typeof assignment !== "object" || Array.isArray(assignment) || !Object.keys(assignment).length) fail("workItem and assignment are required", "DR7201");
  if (!Array.isArray(dependencyClosure) || dependencyClosure.some((item) => !item || typeof item !== "object" || Array.isArray(item)) || !Array.isArray(inputs) || inputs.some((item) => !item || typeof item !== "object" || Array.isArray(item))) fail("dependencyClosure and inputs must contain artifacts", "DR7201");
  return {
    projectId,
    requirementsBaselineDigest,
    projectOverviewBaselineDigest,
    workItem: structuredClone(workItem),
    targetRevision,
    dependencyClosure: sorted(dependencyClosure),
    assignment: structuredClone(assignment),
    qualityResolutionDigest,
    inputs: sorted(inputs),
    implementationConfigurationDigest,
  };
}

export function createWorkFingerprintInput(input = {}) {
  const material = normalizeFingerprintMaterial(input);
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkFingerprintInput", material, inputDigest: canonicalJsonDigest(material) });
}

export function deriveWorkFingerprint(input = {}) {
  const material = input?.kind === "WorkFingerprintInput" ? structuredClone(input.material) : normalizeFingerprintMaterial(input);
  if (input?.kind === "WorkFingerprintInput" && input.inputDigest !== canonicalJsonDigest(material)) fail("work fingerprint input digest drifted", "DR7201");
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkFingerprint", material, fingerprint: canonicalJsonDigest(material) });
}

function validateFingerprint(workFingerprint) {
  if (!workFingerprint || workFingerprint.kind !== "WorkFingerprint" || !DIGEST.test(workFingerprint.fingerprint) || workFingerprint.fingerprint !== canonicalJsonDigest(workFingerprint.material)) fail("work fingerprint is invalid or drifted", "DR7203");
  normalizeFingerprintMaterial(workFingerprint.material);
  return workFingerprint;
}

function validateIndex(index) {
  if (!index || index.kind !== "WorkContinuityIndex" || !Number.isSafeInteger(index.revision) || index.revision < 0 || !Array.isArray(index.records)) fail("index is invalid", "DR7202");
  const attemptIds = new Set();
  for (const record of index.records) {
    if (!record || typeof record.attemptId !== "string" || !record.attemptId || attemptIds.has(record.attemptId) || typeof record.owner !== "string" || !record.owner || !DIGEST.test(record.fingerprint) || typeof record.workItemId !== "string" || !record.workItemId || typeof record.workItemType !== "string" || !record.workItemType || typeof record.targetRevision !== "string" || !record.targetRevision || !DIGEST.test(record.qualityResolutionDigest) || !Number.isSafeInteger(record.leaseExpiresAt) || !["prepared", "dispatched", "running", "completed", "failed", "quarantined"].includes(record.status) || ![record.receiptDigest, record.resultDigest, record.evidenceDigest].every((digest) => digest === null || DIGEST.test(digest)) || (record.status === "completed" && ![record.receiptDigest, record.resultDigest, record.evidenceDigest].every((digest) => DIGEST.test(digest))) || !(record.supersedesAttemptId === null || typeof record.supersedesAttemptId === "string")) fail("index record is invalid", "DR7202");
    attemptIds.add(record.attemptId);
  }
  const body = { revision: index.revision, records: index.records };
  if (index.indexDigest !== canonicalJsonDigest(body)) fail("index digest drifted", "DR7202");
  return index;
}
function buildIndex(revision, records) {
  const normalized = [...records].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint) || a.attemptId.localeCompare(b.attemptId));
  const body = { revision, records: normalized };
  const index = immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkContinuityIndex", ...body, indexDigest: canonicalJsonDigest(body) });
  validateIndex(index);
  return index;
}
export function createWorkContinuityIndex({ records = [], revision = 0 } = {}) {
  if (!Array.isArray(records) || !Number.isSafeInteger(revision) || revision < 0) fail("records or revision are invalid", "DR7202");
  return buildIndex(revision, records);
}

export function findExactWorkReuse({ index, workFingerprint, targetRevision, qualityResolutionDigest, verifiedArtifactDigests = [] } = {}) {
  validateIndex(index);
  validateFingerprint(workFingerprint);
  if (targetRevision !== workFingerprint.material.targetRevision || qualityResolutionDigest !== workFingerprint.material.qualityResolutionDigest) fail("reuse context does not match the work fingerprint", "DR7203");
  if (!Array.isArray(verifiedArtifactDigests) || verifiedArtifactDigests.some((digest) => !DIGEST.test(digest))) fail("verifiedArtifactDigests must contain exact verified digests", "DR7203");
  const verified = sorted([...new Set(verifiedArtifactDigests)]);
  const verifiedSet = new Set(verified);
  const record = [...index.records].reverse().find((item) => item.fingerprint === workFingerprint.fingerprint && item.status === "completed");
  const reusable = Boolean(record && record.targetRevision === targetRevision && record.qualityResolutionDigest === qualityResolutionDigest && [record.receiptDigest, record.resultDigest, record.evidenceDigest].every((digest) => verifiedSet.has(digest)));
  const body = {
    fingerprint: workFingerprint.fingerprint,
    targetRevision,
    qualityResolutionDigest,
    verifiedArtifactDigests: verified,
    decision: reusable ? "reuse-exact" : "execute",
    record: reusable ? structuredClone(record) : null,
    requiresOwnerReview: false,
    completionAuthority: false,
  };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkReuseDecision", ...body, decisionDigest: canonicalJsonDigest(body) });
}

export function findSimilarWorkCandidates({ index, workFingerprint, limit = 5 } = {}) {
  validateIndex(index);
  validateFingerprint(workFingerprint);
  if (!Number.isSafeInteger(limit) || limit < 0) fail("limit is invalid", "DR7203");
  const target = workFingerprint.material.workItem;
  const candidates = index.records.filter((record) => record.status === "completed" && record.fingerprint !== workFingerprint.fingerprint && (record.workItemType === target.type || record.workItemId === target.id)).slice(-limit).reverse().map((record) => ({ attemptId: record.attemptId, fingerprint: record.fingerprint, reason: record.workItemId === target.id ? "same-work-item-id" : "same-work-item-type" }));
  const body = { fingerprint: workFingerprint.fingerprint, candidates, requiresOwnerReview: candidates.length > 0, automaticReuseAllowed: false };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkSimilarityCandidates", ...body, candidateDigest: canonicalJsonDigest(body) });
}

export function claimWorkAttempt({ index, expectedRevision, workFingerprint, attemptId, owner, targetRevision, qualityResolutionDigest, leaseExpiresAt } = {}) {
  validateIndex(index);
  if (index.revision !== expectedRevision) fail("index compare-and-swap revision drifted", "DR7204");
  validateFingerprint(workFingerprint);
  if (targetRevision !== workFingerprint.material.targetRevision || qualityResolutionDigest !== workFingerprint.material.qualityResolutionDigest || typeof attemptId !== "string" || !attemptId || typeof owner !== "string" || !owner || !Number.isSafeInteger(leaseExpiresAt)) fail("claim is invalid", "DR7203");
  if (index.records.some((record) => record.attemptId === attemptId)) fail("attempt identity already exists", "DR7205");
  const active = index.records.find((record) => record.fingerprint === workFingerprint.fingerprint && ["prepared", "dispatched", "running"].includes(record.status));
  if (active) fail("matching work already has an uncertain or active attempt", "DR7206");
  const record = {
    attemptId,
    owner,
    fingerprint: workFingerprint.fingerprint,
    workItemId: workFingerprint.material.workItem.id,
    workItemType: workFingerprint.material.workItem.type ?? "unspecified",
    targetRevision,
    qualityResolutionDigest,
    leaseExpiresAt,
    status: "prepared",
    receiptDigest: null,
    resultDigest: null,
    evidenceDigest: null,
    supersedesAttemptId: null,
  };
  const nextIndex = buildIndex(index.revision + 1, [...index.records, record]);
  const leaseBody = { attemptId, owner, fingerprint: record.fingerprint, leaseExpiresAt, indexRevision: nextIndex.revision };
  return immutable({ index: nextIndex, lease: { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkContinuityLease", ...leaseBody, leaseDigest: canonicalJsonDigest(leaseBody) } });
}

export function transitionWorkAttempt({ index, expectedRevision, attemptId, fromStatus, toStatus, receiptDigest = null, resultDigest = null, evidenceDigest = null } = {}) {
  validateIndex(index);
  if (index.revision !== expectedRevision) fail("index compare-and-swap revision drifted", "DR7204");
  const allowed = { prepared: ["dispatched", "quarantined"], dispatched: ["running", "quarantined"], running: ["completed", "failed", "quarantined"] };
  const position = index.records.findIndex((record) => record.attemptId === attemptId);
  if (position < 0 || index.records[position].status !== fromStatus || !allowed[fromStatus]?.includes(toStatus)) fail("attempt transition is invalid", "DR7207");
  if (toStatus === "completed" && ![receiptDigest, resultDigest, evidenceDigest].every((digest) => DIGEST.test(digest))) fail("completion requires exact receipt, result, and evidence digests", "DR7207");
  const records = index.records.map((record, indexPosition) => indexPosition === position ? { ...record, status: toStatus, receiptDigest, resultDigest, evidenceDigest } : record);
  return buildIndex(index.revision + 1, records);
}

export function reconcileWorkContinuity({ index, now } = {}) {
  validateIndex(index);
  if (!Number.isSafeInteger(now)) fail("now is required", "DR7203");
  const items = index.records.filter(({ status }) => ["prepared", "dispatched", "running"].includes(status)).map((record) => ({ attemptId: record.attemptId, disposition: record.leaseExpiresAt <= now ? "reconciliation-required" : "active", repeatAllowed: false }));
  const body = { indexDigest: index.indexDigest, items, safeToDispatchFingerprints: [] };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "WorkContinuityReconciliation", ...body, reconciliationDigest: canonicalJsonDigest(body) });
}

export function createDurableWorkContinuityStore({ storage, projectId, owner = "work-continuity", leaseMilliseconds = 30_000 } = {}) {
  if (!storage || typeof storage.initializeRun !== "function" || typeof storage.commitTransition !== "function") fail("compatible LocalHostStorage is required", "DR7208");
  if (typeof projectId !== "string" || !projectId) fail("projectId is required", "DR7208");
  const runId = `work-continuity/${projectId}`;
  if (!storage.listRuns({ prefix: runId }).some((run) => run.runId === runId)) {
    storage.initializeRun({ runId, state: { kind: "WorkContinuityDurableState", index: createWorkContinuityIndex(), currentIndexRef: null } });
  }
  const read = () => {
    const run = storage.readRun(runId);
    if (run.state?.kind !== "WorkContinuityDurableState") fail("durable state kind is invalid", "DR7208");
    validateIndex(run.state.index);
    if (run.state.currentIndexRef) {
      const bytes = storage.getArtifact(run.state.currentIndexRef);
      if (bytes.toString("utf8") !== canonicalJson(run.state.index)) fail("durable index bytes drifted", "DR7208");
    }
    return run;
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DurableWorkContinuityStore",
    runId,
    read,
    commit({ expectedHostVersion, expectedIndexRevision, transition, nextIndex } = {}) {
      const current = read();
      if (current.version !== expectedHostVersion || current.state.index.revision !== expectedIndexRevision) fail("durable continuity version drifted", "DR7209");
      validateIndex(nextIndex);
      if (nextIndex.revision !== expectedIndexRevision + 1) fail("durable continuity transition must advance exactly one revision", "DR7209");
      const bytes = Buffer.from(canonicalJson(nextIndex), "utf8");
      const ref = storage.putArtifact({ artifactId: `WC-INDEX-${nextIndex.revision}-${nextIndex.indexDigest.slice(7, 23).toUpperCase()}`, bytes, mediaType: "application/vnd.devrelay.work-continuity-index+json", provenance: [{ projectId, transition: structuredClone(transition) }] });
      const lease = storage.acquireLease({ runId, owner, expectedVersion: expectedHostVersion, durationMilliseconds: leaseMilliseconds });
      try {
        return storage.commitTransition({ runId, expectedVersion: expectedHostVersion, leaseToken: lease.token, transition, nextState: { kind: "WorkContinuityDurableState", index: structuredClone(nextIndex), currentIndexRef: ref }, artifactRefs: [ref], checkpointRef: ref });
      } finally {
        try { storage.releaseLease({ runId, leaseToken: lease.token }); } catch {}
      }
    },
  });
}
