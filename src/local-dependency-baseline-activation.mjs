import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalWorkDependencyExecution } from "./local-work-dependency-execution.mjs";
import { verifyLocalWorkDependencyGate } from "./local-work-dependency-gate.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { dependencyHeadId, verifyDependencyPredecessor } from "./local-work-dependency-planning.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateHead = compileArtifactSchema(read("local-dependency-baseline-head.schema.json"), [read("module-result.schema.json")]);
const validateResult = compileArtifactSchema(read("local-dependency-baseline-activation.schema.json"), [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`dependency activation: ${message}`); };
export const localDependencyBaselineHeadId = dependencyHeadId;

export function assertLocalDependencyBaselineCurrent({ storage, namespace, baseline }) {
  const head = storage.readRun(localDependencyBaselineHeadId(namespace));
  if (!validateHead(head.state) || !same(head.state.baseline, baseline) || head.state.activationDigest === null) fail("current dependency baseline is missing, stale or substituted");
  if (head.state.pendingCommit !== null) fail("pending dependency Gate needs recovery before progression");
  return head;
}

async function prepare({ dependencyGate, ...request }) {
  const replayReceipt = await verifyLocalWorkDependencyExecution(request);
  await verifyLocalWorkDependencyGate({ replayReceipt, record: dependencyGate, loadArtifact: request.loadArtifact });
  const decode = entry => { const bytes = Buffer.from(entry.bytesBase64, "base64"); return { ref: entry.ref, bytes, value: JSON.parse(bytes) }; };
  const baseline = decode(dependencyGate.baseline);
  const work = decode(request.record.baseline);
  const replay = request.checkpointReplay;
  if (!same(work.ref, baseline.value.workBreakdownBaseline)) fail("approved work lineage differs");
  const prior = JSON.parse(Buffer.from(request.expectedState.bytes)).currentWorkDependencyBaseline;
  const predecessor = await verifyDependencyPredecessor({ ...request, currentWorkDependencyBaseline: prior });
  return { baseline, work, digest: dependencyGate.commitDigest, predecessor, prior: predecessor?.ref ?? null,
    stored: { artifactId: baseline.ref.artifactId, digest: baseline.ref.digest, mediaType: baseline.ref.mediaType, byteCount: baseline.bytes.length },
    graphRequest: { invocation: replay.invocation, moduleResult: replay.moduleResult,
      invocationFingerprint: canonicalJsonDigest({ invocation: replay.invocation, gateCommit: dependencyGate.commitDigest }),
      loadedInputs: replay.loadedInputs, loadedOutputs: { ...replay.loadedOutputs, "work-breakdown-baseline": [work], "work-dependency-baseline": [baseline] },
      resolveArtifact: async ref => ({ ref, bytes: await request.loadArtifact(ref) }),
      gate: { id: "work-dependency-gate", outcome: "promoted", commitDigest: dependencyGate.commitDigest, baseline: baseline.ref } } };
}

function publication(storage, id, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: target.digest });
  if (!rows.length) return false;
  if (rows.length !== 1 || !same(rows[0].transition, { id: target.digest, kind: "DependencyBaselineActivated", commitDigest: target.digest, baseline: target.baseline.ref }) ||
      !same(rows[0].artifactRefs, [target.stored]) || sha256Digest(storage.getArtifact(target.stored)) !== target.baseline.ref.digest) fail("publication journal or bytes drifted");
  return true;
}
function result(target, key, applicationProof) {
  const value = { kind: "LocalDependencyBaselineActivation", gateCommitDigest: target.digest, checkpointKey: key,
    applicationProof, baseline: target.baseline.ref, storedBaseline: target.stored, lifecycleComplete: false };
  if (!validateResult(value)) fail("result violates its contract");
  return value;
}

function assertPredecessorHead(head, target) {
  if (!validateHead(head.state) || !same(head.state.baseline, target.prior) ||
      head.state.activationDigest !== (target.predecessor?.activationDigest ?? null) ||
      (head.state.pendingCommit !== null && head.state.pendingCommit !== target.digest)) fail("prior baseline or pending Gate conflicts");
}

export async function activateLocalDependencyBaseline(request) {
  const { storage, namespace, graph } = request;
  const target = await prepare(request);
  const key = `dependency-baseline-activation:${target.digest}`;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const id = localDependencyBaselineHeadId(namespace);
  if (publication(storage, id, target)) return verifyLocalDependencyBaselineActivation(request);
  assertLocalWorkBaselineCurrent({ storage, namespace, baseline: target.work.ref });
  assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary, state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalDependencyBaselineHead", baseline: null, activationDigest: null, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  assertPredecessorHead(head, target);
  await verifyDependencyPredecessor({ ...request, currentWorkDependencyBaseline: target.prior ?? undefined });
  const saved = checkpoints.get(key);
  const prepared = saved ? await graph.validatePrepared({ ...target.graphRequest, checkpoint: saved }) : await graph.prepare({ ...target.graphRequest, baseGraph: graph.captureBase() });
  checkpoints.put(key, prepared.checkpoint);
  let proof;
  try { proof = graph.assertApplied(prepared.updateRef); } catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
  // The durable reservation spans graph work; a lease protects only a head transition.
  head = storage.readRun(id);
  const lease = storage.acquireLease({ runId: id, owner: `dependency-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    head = storage.readRun(id);
    if (publication(storage, id, target)) return verifyLocalDependencyBaselineActivation(request);
    assertPredecessorHead(head, target);
    assertLocalWorkBaselineCurrent({ storage, namespace, baseline: target.work.ref });
    assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary, state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
    if (head.state.pendingCommit === null) {
      if (proof) fail("graph applied without durable reservation");
      head = storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "DependencyBaselineReserved", commitDigest: target.digest }, nextState: { ...head.state, pendingCommit: target.digest } });
    }
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
  const stored = storage.putArtifact({ ...target.stored, bytes: target.baseline.bytes, expectedDigest: target.baseline.ref.digest });
  if (!same(stored, target.stored)) fail("stored baseline metadata drifted");
  if (!proof) { await graph.mergePrepared(prepared); proof = graph.assertApplied(prepared.updateRef); }
  head = storage.readRun(id);
  const publicationLease = storage.acquireLease({ runId: id, owner: `dependency-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    head = storage.readRun(id);
    if (publication(storage, id, target)) return verifyLocalDependencyBaselineActivation(request);
    assertPredecessorHead(head, target);
    if (head.state.pendingCommit !== target.digest) fail("publication requires the exact durable reservation");
    assertLocalWorkBaselineCurrent({ storage, namespace, baseline: target.work.ref });
    assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary, state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: publicationLease.token,
      transition: { id: target.digest, kind: "DependencyBaselineActivated", commitDigest: target.digest, baseline: target.baseline.ref }, artifactRefs: [stored],
      nextState: { kind: "LocalDependencyBaselineHead", baseline: target.baseline.ref, activationDigest: target.digest, pendingCommit: null } });
    return result(target, key, proof);
  } finally { storage.releaseLease({ runId: id, leaseToken: publicationLease.token }); }
}

export async function verifyLocalDependencyBaselineActivation(request) {
  const { storage, namespace, graph } = request;
  const target = await prepare(request);
  const key = `dependency-baseline-activation:${target.digest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(key);
  if (!checkpoint) fail("prepared checkpoint missing");
  const prepared = await graph.validatePrepared({ ...target.graphRequest, checkpoint });
  const proof = graph.assertApplied(prepared.updateRef);
  if (!publication(storage, localDependencyBaselineHeadId(namespace), target)) fail("publication missing");
  return result(target, key, proof);
}
