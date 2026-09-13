import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateRequirementsGatePromotion } from "./requirements-gate.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateCommit = compileArtifactSchema(schema("local-requirements-gate-commit.schema.json"), [schema("module-result.schema.json")]);
const validateHead = compileArtifactSchema(schema("local-requirements-head.schema.json"), [schema("module-result.schema.json")]);

// The genuine in-process Core replay and owning Gate validate every call,
// including retries. A persisted JSON record is evidence, not Gate authority.
// One immutable checkpoint publishes both exact baseline byte strings together.
function prepareCommit(request) {
  const gateRequest = { ...request };
  const replay = assertVerifiedCheckpointReplayReceipt(gateRequest.checkpointReplay);
  const projectionBytes = Buffer.from(gateRequest.projectOverviewMarkdownBytes);
  gateRequest.projectOverviewMarkdownBytes = projectionBytes;
  const validated = validateRequirementsGatePromotion(gateRequest);
  const citedEvidence = validated.requirementsBaseline.approvalEvidence;
  if (!Array.isArray(request.approvalEvidence) || request.approvalEvidence.length !== citedEvidence.length) {
    throw new TypeError("Gate requires the exact complete approval evidence bytes");
  }
  const approvalEvidence = citedEvidence.map((pointer, index) => {
    const loaded = request.approvalEvidence[index];
    if (!loaded?.ref || loaded.ref.artifactId !== pointer.artifactId || loaded.ref.digest !== pointer.digest) {
      throw new TypeError("Gate approval evidence differs from the paired baseline citation");
    }
    if (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array)) {
      throw new TypeError("Gate approval evidence requires raw bytes");
    }
    const bytes = Buffer.from(loaded.bytes);
    if (bytes.length === 0 || sha256Digest(bytes) !== pointer.digest) {
      throw new TypeError("Gate approval evidence bytes drifted");
    }
    return { ref: structuredClone(loaded.ref), byteLength: bytes.length, bytesBase64: bytes.toString("base64") };
  });
  const invocation = replay.invocation;
  const key = `requirements-gate:${canonicalJsonDigest({
    runId: invocation.runId, nodeId: invocation.nodeId, invocationId: invocation.invocationId,
  })}`;
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "LocalRequirementsGateCommit",
    invocationDigest: canonicalJsonDigest(invocation),
    moduleResultDigest: canonicalJsonDigest(replay.moduleResult),
    commitPayload: validated.commitPayload,
    approvalEvidence,
    projectOverviewMarkdown: {
      digest: sha256Digest(projectionBytes),
      byteLength: projectionBytes.length,
      bytesBase64: projectionBytes.toString("base64"),
    },
    scope: "validated-requirements-pair",
    lifecycleComplete: false,
  };
  const record = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validateCommit(record)) throw new TypeError("Gate commit violates its closed contract");
  return { key, record };
}

// Reconstruct through the owning Gate, not through a digest-only assertion.
// This is deliberately read-only and requires a fresh genuine Core receipt.
export function verifyLocalRequirementsGate({ checkpointReplay, record } = {}) {
  assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  if (!validateCommit(record)) throw new TypeError("Gate commit violates its closed contract");
  const payload = record?.commitPayload;
  const decode = (entry) => {
    if (typeof entry?.bytesBase64 !== "string") throw new TypeError("Gate bytes are missing");
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength) {
      throw new TypeError("Gate bytes are not exact canonical base64");
    }
    return bytes;
  };
  const requirementsBytes = decode(payload?.requirementsBaseline);
  const overviewBytes = decode(payload?.projectOverviewBaseline);
  const { record: expected } = prepareCommit({
    checkpointReplay,
    requirementsBaseline: JSON.parse(requirementsBytes),
    requirementsBaselineRef: payload.requirementsBaseline.ref,
    requirementsBaselineBytes: requirementsBytes,
    projectOverviewBaseline: JSON.parse(overviewBytes),
    projectOverviewBaselineRef: payload.projectOverviewBaseline.ref,
    projectOverviewBaselineBytes: overviewBytes,
    projectOverviewMarkdownBytes: decode(record.projectOverviewMarkdown),
    approvalEvidence: record.approvalEvidence.map((entry) => ({ ref: entry.ref, bytes: decode(entry) })),
  });
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(record)) {
    throw new TypeError("Gate record differs from the exact validated commit");
  }
  return Object.freeze({ outcome: "verified", scope: expected.scope, commitDigest: expected.commitDigest, lifecycleComplete: false });
}

export function commitLocalRequirementsGate({ storage, namespace, request } = {}) {
  const { key, record } = prepareCommit(request);
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const existing = checkpoints.get(key);
  const committed = checkpoints.put(key, record);
  return Object.freeze({ committed, replayed: existing !== undefined });
}

function activationRequest({ checkpointReplay, record, resolveArtifact }) {
  verifyLocalRequirementsGate({ checkpointReplay, record });
  const loaded = (entry) => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"),
    value: JSON.parse(Buffer.from(entry.bytesBase64, "base64")) });
  const requirements = loaded(record.commitPayload.requirementsBaseline);
  const overview = loaded(record.commitPayload.projectOverviewBaseline);
  return {
    invocation: checkpointReplay.invocation,
    invocationFingerprint: canonicalJsonDigest({ invocation: checkpointReplay.invocation, gateCommit: record.commitDigest }),
    moduleResult: checkpointReplay.moduleResult,
    loadedInputs: checkpointReplay.loadedInputs,
    loadedOutputs: { ...checkpointReplay.loadedOutputs,
      "requirements-baseline": [requirements], "project-overview-baseline": [overview] },
    resolvedArtifacts: record.approvalEvidence.map((entry) => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64") })),
    resolveArtifact,
    gate: { id: "requirements-gate", outcome: "promoted", commitDigest: record.commitDigest,
      requirementsBaseline: requirements.ref, projectOverviewBaseline: overview.ref },
  };
}

const requirementsHeadId = (namespace, projectId) => `requirements-head:${canonicalJsonDigest({ namespace, projectId })}`;

export function assertLocalRequirementsCurrentPair({ storage, namespace, projectId, pair, required = false }) {
  let head;
  try { head = storage.readRun(requirementsHeadId(namespace, projectId)); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    if (required) throw new TypeError("the activated requirements head is missing");
    return;
  }
  if (!validateHead(head.state)) throw new TypeError("requirements head violates its closed contract");
  if (head.state.pendingCommit !== null || canonicalJsonDigest(head.state.pair) !== canonicalJsonDigest(pair)) {
    throw Object.assign(new TypeError("requirements context is stale or a Gate activation needs recovery"), { code: "DR4962", exitCode: 6 });
  }
}

export async function activateLocalRequirementsGate({ storage, namespace, graph, checkpointReplay, record, resolveArtifact }) {
  const request = activationRequest({ checkpointReplay, record, resolveArtifact });
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const key = `requirements-activation:${record.commitDigest}`;
  const existing = checkpoints.get(key);
  const prepared = existing
    ? await graph.validatePrepared({ ...request, checkpoint: existing })
    : await graph.prepare({ ...request, baseGraph: graph.captureBase() });
  // Persist exact prepared bytes before graph merge. A crash at either side
  // reuses and revalidates this checkpoint, never selecting a new graph base.
  checkpoints.put(key, prepared.checkpoint);
  const priorRequirements = checkpointReplay.loadedInputs["requirements-baseline"]?.[0]?.ref;
  const priorOverview = checkpointReplay.loadedInputs["project-overview-baseline"]?.[0]?.ref;
  const priorPair = priorRequirements ? { requirementsBaseline: priorRequirements, projectOverviewBaseline: priorOverview } : null;
  const targetPair = { requirementsBaseline: record.commitPayload.requirementsBaseline.ref,
    projectOverviewBaseline: record.commitPayload.projectOverviewBaseline.ref };
  const headId = requirementsHeadId(namespace, graph.projectId);
  let head;
  try { head = storage.readRun(headId); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: headId, state: { kind: "LocalRequirementsHead", pair: priorPair, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(headId); }
  }
  if (!validateHead(head.state)) throw new TypeError("requirements head violates its closed contract");
  const lease = storage.acquireLease({ runId: headId, owner: `requirements-gate:${process.pid}`, expectedVersion: head.version });
  try {
    let applicationProof;
    try { applicationProof = graph.assertApplied(prepared.updateRef); }
    catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
    // Historical exact replay is observation-only even after another pair has
    // advanced. A pending publication of this very commit still needs recovery.
    if (applicationProof && head.state.pendingCommit !== record.commitDigest) return Object.freeze({ checkpointKey: key, applicationProof });
    if ((head.state.pendingCommit !== null && head.state.pendingCommit !== record.commitDigest) ||
        canonicalJsonDigest(head.state.pair) !== canonicalJsonDigest(priorPair)) {
      throw new TypeError("requirements activation conflicts with the current pair or pending Gate");
    }
    if (head.state.pendingCommit === null) {
      head = storage.commitTransition({ runId: headId, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "RequirementsActivationReserved", commitDigest: record.commitDigest },
        nextState: { ...head.state, pendingCommit: record.commitDigest } });
    }
    if (!applicationProof) {
      await graph.mergePrepared(prepared);
      applicationProof = graph.assertApplied(prepared.updateRef);
    }
    storage.commitTransition({ runId: headId, expectedVersion: head.version, leaseToken: lease.token,
      transition: { kind: "RequirementsHeadAdvanced", commitDigest: record.commitDigest },
      nextState: { kind: "LocalRequirementsHead", pair: targetPair, pendingCommit: null } });
    return Object.freeze({ checkpointKey: key, applicationProof });
  } finally { storage.releaseLease({ runId: headId, leaseToken: lease.token }); }
}

export async function verifyLocalRequirementsActivation({ storage, namespace, graph, checkpointReplay, record, resolveArtifact }) {
  const request = activationRequest({ checkpointReplay, record, resolveArtifact });
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const key = `requirements-activation:${record.commitDigest}`;
  const checkpoint = checkpoints.get(key);
  if (!checkpoint) throw new TypeError("requirements activation checkpoint is missing");
  const prepared = await graph.validatePrepared({ ...request, checkpoint });
  return Object.freeze({ checkpointKey: key, applicationProof: graph.assertApplied(prepared.updateRef) });
}
