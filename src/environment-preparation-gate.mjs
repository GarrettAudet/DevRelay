import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS,
  validateEnvironmentPreparationArtifact,
  withEnvironmentPreparationContentDigest,
} from "./environment-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";

export class EnvironmentPreparationGateError extends Error {
  constructor(message, code = "DR5430") {
    super(`environment preparation gate failed: ${message}`);
    this.name = "EnvironmentPreparationGateError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new EnvironmentPreparationGateError(message, code);
};
const ordered = (values, key) =>
  [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const sameRef = (left, right) =>
  left?.artifactId === right?.artifactId && left?.schema === right?.schema &&
  left?.mediaType === right?.mediaType && left?.digest === right?.digest;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function artifactId(value) {
  return value.profileSetId ?? value.inventoryId ?? value.planId ?? value.receiptId ??
    value.candidateId ?? value.baselineId ?? value.approvalId ?? value.proofId;
}

export function environmentPreparationArtifactRef(value) {
  const contract = ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS[value?.kind];
  if (!contract || !value?.contentDigest) fail("cannot reference an invalid environment artifact");
  const id = artifactId(value);
  return {
    artifactId: id,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest: value.contentDigest,
    uri: `memory://devrelay/environment-preparation/${encodeURIComponent(id)}/${value.contentDigest.slice(7)}.json`,
  };
}

function checksById(profileSet) {
  return new Map(profileSet.profiles.flatMap(({ checks }) => checks).map((check) => [check.id, check]));
}

function candidateOutcome({ checkResults, expectedEnvironmentFingerprint, inventoryFingerprint, unableToProceed }) {
  if (unableToProceed) return "unable-to-proceed";
  if (expectedEnvironmentFingerprint && expectedEnvironmentFingerprint !== inventoryFingerprint) return "baseline-drift";
  if (checkResults.some(({ required, status }) => required && status === "fail")) return "remediation-required";
  if (checkResults.some(({ required, status }) => required && status === "unknown")) return "needs-clarification";
  return "ready";
}

function diagnosticFor(outcome) {
  return {
    "unable-to-proceed": { code: "DR5431", severity: "error", message: "The environment inventory cannot establish required current facts." },
    "baseline-drift": { code: "DR5432", severity: "error", message: "The current environment fingerprint differs from the approved environment baseline." },
    "remediation-required": { code: "DR5433", severity: "error", message: "At least one required environment check failed and requires approved remediation." },
    "needs-clarification": { code: "DR5434", severity: "error", message: "At least one required environment check is unknown and requires clarification." },
  }[outcome];
}

export function buildEnvironmentVerificationCandidate({
  candidateId,
  operation,
  repository,
  upstreamBaselines,
  profileSet,
  profileSetRef = environmentPreparationArtifactRef(profileSet),
  inventory,
  inventoryRef = environmentPreparationArtifactRef(inventory),
  effectReceipts = [],
  frontierId,
  workItemIds,
  assignmentBaseline,
  executionAttemptId,
  evaluatedAt,
  expectedEnvironmentFingerprint,
  unableToProceed = false,
  sourceRefs,
} = {}) {
  validateEnvironmentPreparationArtifact(profileSet, { ref: profileSetRef });
  validateEnvironmentPreparationArtifact(inventory, { profileSet, ref: inventoryRef });
  if (!sameRef(inventory.profileSet, profileSetRef) || !sameRef(inventory.repository, repository)) {
    fail("inventory substitutes the exact profile set or repository");
  }
  if (!Array.isArray(workItemIds) || workItemIds.length === 0 || new Set(workItemIds).size !== workItemIds.length) {
    fail("candidate requires a unique non-empty ready frontier");
  }
  if (!Number.isFinite(Date.parse(evaluatedAt))) fail("evaluatedAt must be an exact timestamp");
  const definitions = checksById(profileSet);
  const checkResults = ordered(inventory.observations.map((observation) => {
    const definition = definitions.get(observation.checkId);
    if (!definition) fail(`inventory contains unknown check ${observation.checkId}`);
    const expired = observation.expiresAt && observation.expiresAt <= evaluatedAt;
    let status = observation.status;
    if (expired) status = definition.required ? "unknown" : "warning";
    else if (!definition.required && ["fail", "unknown"].includes(status)) status = "warning";
    return {
      checkId: observation.checkId,
      required: definition.required,
      status,
      evidence: observation.rawEvidence ? [structuredClone(observation.rawEvidence)] : [],
    };
  }), ({ checkId }) => checkId);
  const proposedOutcome = candidateOutcome({ checkResults, expectedEnvironmentFingerprint, inventoryFingerprint: inventory.fingerprint, unableToProceed });
  const diagnostics = [...inventory.diagnostics];
  if (proposedOutcome !== "ready") diagnostics.push(diagnosticFor(proposedOutcome));
  const fingerprint = canonicalJsonDigest({
    operation,
    repository,
    upstreamBaselines: ordered(upstreamBaselines, ({ artifactId }) => artifactId),
    profileSet: profileSetRef,
    inventory: inventoryRef,
    inventoryFingerprint: inventory.fingerprint,
    effectReceipts: ordered(effectReceipts.map((entry) => entry.ref ?? environmentPreparationArtifactRef(entry.value)), ({ artifactId }) => artifactId),
    frontierId,
    workItemIds: ordered(workItemIds, (value) => value),
    assignmentBaseline,
    executionAttemptId,
  });
  const candidate = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentVerificationCandidate",
    candidateId,
    operation,
    repository: structuredClone(repository),
    upstreamBaselines: ordered(upstreamBaselines, ({ artifactId }) => artifactId),
    profileSet: structuredClone(profileSetRef),
    inventory: structuredClone(inventoryRef),
    effectReceipts: ordered(effectReceipts.map((entry) => structuredClone(entry.ref ?? environmentPreparationArtifactRef(entry.value))), ({ artifactId }) => artifactId),
    frontierId,
    executionAttemptId,
    fingerprint,
    checks: checkResults,
    proposedOutcome,
    diagnostics,
    sourceRefs: ordered(sourceRefs, ({ role, jsonPointer = "" }) => `${role}:${jsonPointer}`),
  });
  return validateEnvironmentPreparationArtifact(candidate);
}

export function approveEnvironmentVerificationCandidate({ candidate, candidateRef = environmentPreparationArtifactRef(candidate), terminalCheckpointDigest, policyVersion } = {}) {
  validateEnvironmentPreparationArtifact(candidate, { ref: candidateRef });
  const approval = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentGateApproval",
    approvalId: `EP-GATE-${candidate.candidateId}`,
    authority: "devrelay-core",
    decision: candidate.proposedOutcome,
    candidate: structuredClone(candidateRef),
    terminalCheckpointDigest,
    policyVersion,
  });
  return validateEnvironmentPreparationArtifact(approval, { candidate, candidateRef });
}

function scopedFingerprints(profileSet, inventory) {
  const observations = new Map(inventory.observations.map((observation) => [observation.checkId, observation]));
  return Object.fromEntries(profileSet.profiles.map((profile) => [
    profile.id,
    canonicalJsonDigest({ profileId: profile.id, facts: profile.checks.map(({ id }) => observations.get(id)).map(({ checkId, status, sensitivity, value, present }) => ({ checkId, status, sensitivity, ...(sensitivity === "secret-presence" ? { present } : { value }) })) }),
  ]));
}

export function promoteEnvironmentGate({
  proofId,
  baselineId,
  baselineVersion,
  supersedes,
  candidate,
  candidateRef = environmentPreparationArtifactRef(candidate),
  approval,
  approvalRef = environmentPreparationArtifactRef(approval),
  profileSet,
  profileSetRef = environmentPreparationArtifactRef(profileSet),
  inventory,
  assignmentBaseline,
  workItemIds,
  issuedAt,
  expiresAt,
  policyVersion,
  graphCheckpoint,
  sourceRefs,
} = {}) {
  validateEnvironmentPreparationArtifact(candidate, { ref: candidateRef });
  validateEnvironmentPreparationArtifact(approval, { candidate, candidateRef, ref: approvalRef });
  validateEnvironmentPreparationArtifact(profileSet, { ref: profileSetRef });
  validateEnvironmentPreparationArtifact(inventory, { profileSet });
  if (candidate.proposedOutcome !== "ready" || approval.decision !== "ready") fail("only an exact ready Gate candidate can be promoted", "DR5435");
  const profileFingerprints = scopedFingerprints(profileSet, inventory);
  const hostProfile = profileSet.profiles.find(({ layer }) => layer === "devrelay-host");
  const targetFingerprints = Object.fromEntries(profileSet.profiles.filter(({ layer }) => layer === "project-target").map(({ id }) => [id, profileFingerprints[id]]));
  const baseline = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentBaseline",
    baselineId,
    version: baselineVersion,
    approvedCandidate: structuredClone(candidateRef),
    ...(supersedes ? { supersedes: structuredClone(supersedes) } : {}),
    profileSet: structuredClone(profileSetRef),
    policyVersion,
    hostFingerprint: profileFingerprints[hostProfile.id],
    targetFingerprints,
    approvalEvidence: [structuredClone(approvalRef)],
    sourceRefs: ordered(sourceRefs, ({ role, jsonPointer = "" }) => `${role}:${jsonPointer}`),
  });
  validateEnvironmentPreparationArtifact(baseline);
  const readiness = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentReadinessReceipt",
    receiptId: `EP-READINESS-${candidate.candidateId}`,
    candidate: structuredClone(candidateRef),
    gateApproval: structuredClone(approvalRef),
    repository: structuredClone(candidate.repository),
    profileSet: structuredClone(profileSetRef),
    frontierId: candidate.frontierId,
    workItemIds: ordered(workItemIds, (value) => value),
    assignmentBaseline: structuredClone(assignmentBaseline),
    executionAttemptId: candidate.executionAttemptId,
    fingerprint: candidate.fingerprint,
    issuedAt,
    expiresAt,
    singleUse: true,
    consumed: false,
  });
  validateEnvironmentPreparationArtifact(readiness, { candidate, candidateRef, approval, approvalRef });
  const baselineRef = environmentPreparationArtifactRef(baseline);
  const readinessRef = environmentPreparationArtifactRef(readiness);
  const proof = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentGatePromotionProof",
    proofId,
    status: "promoted",
    candidate: structuredClone(candidateRef),
    approval: structuredClone(approvalRef),
    environmentBaseline: baselineRef,
    readinessReceipt: readinessRef,
    graphCheckpoint: structuredClone(graphCheckpoint),
    checkpointDigest: canonicalJsonDigest({ candidate: candidateRef, approval: approvalRef, baseline: baselineRef, readiness: readinessRef, graphCheckpoint }),
  });
  validateEnvironmentPreparationArtifact(proof);
  return Object.freeze({ baseline, baselineRef, readiness, readinessRef, proof });
}

export function createInMemoryEnvironmentReadinessStore() {
  const entries = new Map();
  return Object.freeze({
    put(receipt) {
      validateEnvironmentPreparationArtifact(receipt);
      if (entries.has(receipt.receiptId)) fail(`readiness ${receipt.receiptId} already exists`, "DR5436");
      entries.set(receipt.receiptId, { receipt: structuredClone(receipt), consumed: false });
    },
    consume({ receiptId, repository, frontierId, workItemIds, assignmentBaseline, executionAttemptId, fingerprint, consumedAt }) {
      const entry = entries.get(receiptId);
      if (!entry) fail(`readiness ${receiptId} is unavailable`, "DR5436");
      if (entry.consumed) fail(`readiness ${receiptId} is already consumed`, "DR5436");
      const receipt = entry.receipt;
      if (consumedAt > receipt.expiresAt || consumedAt < receipt.issuedAt) fail("readiness receipt is expired or not yet valid", "DR5436");
      if (!sameRef(repository, receipt.repository) || frontierId !== receipt.frontierId || executionAttemptId !== receipt.executionAttemptId || fingerprint !== receipt.fingerprint || !sameRef(assignmentBaseline, receipt.assignmentBaseline) || !same(ordered(workItemIds, (value) => value), ordered(receipt.workItemIds, (value) => value))) {
        fail("readiness receipt does not bind the requested execution frontier", "DR5436");
      }
      entry.consumed = true;
      return Object.freeze({
        apiVersion: API,
        kind: "EnvironmentReadinessConsumptionProof",
        receipt: environmentPreparationArtifactRef(receipt),
        consumedAt,
        executionAttemptId,
        consumptionDigest: canonicalJsonDigest({ receipt: environmentPreparationArtifactRef(receipt), consumedAt, executionAttemptId }),
      });
    },
  });
}

export function createEnvironmentGateCheckpointController({ checkpoints } = {}) {
  if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.put !== "function") fail("Gate controller requires an immutable checkpoint store");
  return Object.freeze({
    async execute(request) {
      const fingerprint = canonicalJsonDigest(Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined)));
      const key = `environment-gate:${request.candidateId}`;
      const existing = await checkpoints.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail("Gate checkpoint fingerprint differs", "DR5437");
        return Object.freeze({ candidate: structuredClone(existing.candidate), replayed: true, evaluationCalls: 0, checkpointDigest: existing.checkpointDigest });
      }
      const candidate = buildEnvironmentVerificationCandidate(request);
      const checkpointDigest = canonicalJsonDigest({ fingerprint, candidate: environmentPreparationArtifactRef(candidate) });
      await checkpoints.put(key, { fingerprint, candidate, checkpointDigest });
      return Object.freeze({ candidate, replayed: false, evaluationCalls: 1, checkpointDigest });
    },
  });
}
