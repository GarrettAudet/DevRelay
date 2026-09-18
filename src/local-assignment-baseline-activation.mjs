import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalSpecialistAssignmentExecution } from "./local-specialist-assignment-execution.mjs";
import { verifySpecialistAssignmentGateV3 } from "./specialist-assignment-gate-v3.mjs";
import { assertLocalDependencyBaselineCurrent } from "./local-dependency-baseline-activation.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";

import { loadAssignmentReplacementApproval, assertAssignmentPredecessorPublication } from "./local-assignment-replacement-approval.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateHead = compileArtifactSchema(read("local-assignment-baseline-head.schema.json"), [read("module-result.schema.json")]);
const validateResult = compileArtifactSchema(read("local-assignment-baseline-activation.schema.json"), [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`assignment activation: ${message}`); };
export const localAssignmentBaselineHeadId = namespace => `assignment-baseline-head:${canonicalJsonDigest({ namespace })}`;

export function assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline }) {
  const head = storage.readRun(localAssignmentBaselineHeadId(namespace));
  if (!validateHead(head.state) || !same(head.state.baseline, baseline) || head.state.activationDigest === null) fail("current assignment baseline is missing, stale or substituted");
  if (head.state.pendingCommit !== null) fail("pending assignment Gate needs recovery before progression");
  return head;
}

async function prepare({ assignmentGate, ...request }) {
  for (const key of ["prior", "priorBaseline", "priorActivationDigest", "replacementApproval"]) {
    if (Object.hasOwn(request, key)) fail("caller predecessor overrides are forbidden");
  }
  const replayReceipt = await verifyLocalSpecialistAssignmentExecution(request);
  await verifySpecialistAssignmentGateV3({ checkpointReplay: replayReceipt, record: assignmentGate,
    approvalRef: assignmentGate.approval.ref, loadArtifact: request.loadArtifact });
  const decode = entry => { const bytes = Buffer.from(entry.bytesBase64, "base64"); return { ref: entry.ref, bytes, value: JSON.parse(bytes) }; };
  const baseline = decode(assignmentGate.baseline);
  const work = decode(request.record.baseline);
  const draft = decode(replayReceipt.checkpoint.receipt.draft);
  const catalog = decode(replayReceipt.checkpoint.inputs["specialist-catalog"]);
  const dependency = replayReceipt.checkpoint.inputs["work-dependency-baseline"].ref;
  const replay = request.checkpointReplay;
  if (!same(replayReceipt.checkpoint.inputs["work-breakdown-baseline"].ref, work.ref)) fail("approved work lineage differs");
  const approval = decode(assignmentGate.approval).value;
  const replacement = await loadAssignmentReplacementApproval({ approval, replayReceipt, namespace: request.namespace,
    projectId: request.graph.captureBase().projectId, loadArtifact: request.loadArtifact });
  assertAssignmentPredecessorPublication({ storage: request.storage, headId: localAssignmentBaselineHeadId(request.namespace), replacement });
  return { baseline, work, dependency, digest: assignmentGate.commitDigest, replacement, prior: replacement?.value.priorBaseline ?? null,
    stored: { artifactId: baseline.ref.artifactId, digest: baseline.ref.digest, mediaType: baseline.ref.mediaType, byteCount: baseline.bytes.length },
    graphRequest: { invocation: replay.invocation, moduleResult: replay.moduleResult,
      invocationFingerprint: canonicalJsonDigest({ invocation: replay.invocation, gateCommit: assignmentGate.commitDigest }),
      loadedInputs: replay.loadedInputs, loadedOutputs: { ...replay.loadedOutputs, "work-breakdown-baseline": [work],
        "specialist-catalog": [catalog], "specialist-assignment-draft": [draft], "specialist-assignment-baseline": [baseline] },
      resolveArtifact: async ref => ({ ref, bytes: [baseline, work, draft, catalog].find(entry => same(entry.ref, ref))?.bytes ?? await request.loadArtifact(ref) }),
      gate: { id: "specialist-assignment-gate", version: "3.0.0", outcome: "promoted", commitDigest: assignmentGate.commitDigest, baseline: baseline.ref } } };
}

function publication(storage, id, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: target.digest });
  if (!rows.length) return false;
  if (rows.length !== 1 || !same(rows[0].transition, { id: target.digest, kind: "AssignmentBaselineActivated", commitDigest: target.digest, baseline: target.baseline.ref }) ||
      !same(rows[0].artifactRefs, [target.stored]) || sha256Digest(storage.getArtifact(target.stored)) !== target.baseline.ref.digest) fail("publication journal or bytes drifted");
  return true;
}
function result(target, key, applicationProof) {
  const value = { kind: "LocalAssignmentBaselineActivation", gateCommitDigest: target.digest, checkpointKey: key,
    applicationProof, baseline: target.baseline.ref, storedBaseline: target.stored, lifecycleComplete: false };
  if (!validateResult(value)) fail("result violates its contract");
  return value;
}

function assertPredecessorHead(head, target) {
  if (!validateHead(head.state) || !same(head.state.baseline, target.prior) ||
      head.state.activationDigest !== (target.replacement?.value.priorActivationDigest ?? null) ||
      (head.state.pendingCommit !== null && head.state.pendingCommit !== target.digest)) fail("prior baseline or pending Gate conflicts");
}

export async function activateLocalAssignmentBaseline(request) {
  const { storage, namespace, graph } = request;
  const target = await prepare(request);
  const key = `assignment-baseline-activation:${target.digest}`;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const id = localAssignmentBaselineHeadId(namespace);
  if (publication(storage, id, target)) return verifyLocalAssignmentBaselineActivation(request);
  assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: target.dependency });
  assertLocalWorkBaselineCurrent({ storage, namespace, baseline: target.work.ref });
  assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary, state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalAssignmentBaselineHead", baseline: null, activationDigest: null, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  assertPredecessorHead(head, target);
  const lease = storage.acquireLease({ runId: id, owner: `assignment-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    head = storage.readRun(id);
    if (publication(storage, id, target)) return verifyLocalAssignmentBaselineActivation(request);
    assertPredecessorHead(head, target);
    assertAssignmentPredecessorPublication({ storage, headId: id, replacement: target.replacement });
    // Recheck upstream authority after acquiring the publication lease.
    assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: target.dependency });
    assertLocalWorkBaselineCurrent({ storage, namespace, baseline: target.work.ref });
    assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary, state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
    if (target.replacement) {
      const { ref, bytes } = target.replacement;
      storage.putArtifact({ artifactId: ref.artifactId, digest: ref.digest, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
    }
    const saved = checkpoints.get(key);
    const prepared = saved ? await graph.validatePrepared({ ...target.graphRequest, checkpoint: saved }) : await graph.prepare({ ...target.graphRequest, baseGraph: graph.captureBase() });
    checkpoints.put(key, prepared.checkpoint);
    let proof;
    try { proof = graph.assertApplied(prepared.updateRef); } catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
    if (head.state.pendingCommit === null) {
      if (proof) fail("graph applied without durable reservation");
      head = storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "AssignmentBaselineReserved", commitDigest: target.digest }, nextState: { ...head.state, pendingCommit: target.digest } });
    }
    const stored = storage.putArtifact({ ...target.stored, bytes: target.baseline.bytes, expectedDigest: target.baseline.ref.digest });
    if (!same(stored, target.stored)) fail("stored baseline metadata drifted");
    if (!proof) { await graph.mergePrepared(prepared); proof = graph.assertApplied(prepared.updateRef); }
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: target.digest, kind: "AssignmentBaselineActivated", commitDigest: target.digest, baseline: target.baseline.ref }, artifactRefs: [stored],
      nextState: { kind: "LocalAssignmentBaselineHead", baseline: target.baseline.ref, activationDigest: target.digest, pendingCommit: null } });
    return result(target, key, proof);
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalAssignmentBaselineActivation(request) {
  const { storage, namespace, graph } = request;
  const target = await prepare(request);
  const key = `assignment-baseline-activation:${target.digest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(key);
  if (!checkpoint) fail("prepared checkpoint missing");
  const prepared = await graph.validatePrepared({ ...target.graphRequest, checkpoint });
  const proof = graph.assertApplied(prepared.updateRef);
  if (!publication(storage, localAssignmentBaselineHeadId(namespace), target)) fail("publication missing");
  return result(target, key, proof);
}
