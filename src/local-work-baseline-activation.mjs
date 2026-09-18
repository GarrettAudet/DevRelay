import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalWorkBreakdownGate } from "./local-work-breakdown-gate.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { verifyWorkPredecessor, workHeadId } from "./local-work-breakdown-planning.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateHead = compileArtifactSchema(read("local-work-baseline-head.schema.json"), [read("module-result.schema.json")]);
const validateResult = compileArtifactSchema(read("local-work-baseline-activation.schema.json"), [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
export const localWorkBaselineHeadId = workHeadId;
const fail = message => { throw new TypeError(`work baseline activation: ${message}`); };

// Historical verification is not permission to start fresh downstream work.
// Downstream planning must also prove the exact current, fully published head.
export function assertLocalWorkBaselineCurrent({ storage, namespace, baseline }) {
  const head = storage.readRun(localWorkBaselineHeadId(namespace));
  if (!validateHead(head.state) || !same(head.state.baseline, baseline) || head.state.activationDigest === null) {
    fail("current baseline is missing, stale or substituted");
  }
  if (head.state.pendingCommit !== null) fail("pending work Gate needs recovery before progression");
  return head;
}

async function prepare(args) {
  await verifyLocalWorkBreakdownGate(args);
  const { checkpointReplay: replay, record, loadArtifact } = args;
  const bytes = Buffer.from(record.baseline.bytesBase64, "base64");
  const baseline = { ref: record.baseline.ref, bytes, value: JSON.parse(bytes) };
  const predecessor = await verifyWorkPredecessor({ ...args, currentWorkBreakdownBaseline: replay.loadedInputs["current-work-breakdown-baseline"]?.[0]?.ref });
  return { baseline, predecessor, prior: predecessor?.ref ?? null,
    stored: { artifactId: baseline.ref.artifactId, mediaType: baseline.ref.mediaType, digest: baseline.ref.digest, byteCount: bytes.length },
    request: { invocation: replay.invocation, invocationFingerprint: canonicalJsonDigest({ invocation: replay.invocation, gateCommit: record.commitDigest }),
      moduleResult: replay.moduleResult, loadedInputs: replay.loadedInputs,
      loadedOutputs: { ...replay.loadedOutputs, "work-breakdown-baseline": [baseline] },
      resolveArtifact: async ref => ({ ref, bytes: await loadArtifact(ref) }),
      gate: { id: "work-breakdown-gate", outcome: "promoted", commitDigest: record.commitDigest, baseline: baseline.ref, noWorkApprovals: record.noWorkApprovals } } };
}

function published(storage, id, digest, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: digest });
  if (!rows.length) return false;
  if (rows.length !== 1 || !same(rows[0].transition, { id: digest, kind: "WorkBaselineActivated", commitDigest: digest, baseline: target.baseline.ref }) ||
      !same(rows[0].artifactRefs, [target.stored]) || sha256Digest(storage.getArtifact(target.stored)) !== target.baseline.ref.digest) fail("publication journal or bytes drifted");
  return true;
}

function result(record, key, proof, target) {
  const value = { kind: "LocalWorkBaselineActivation", gateCommitDigest: record.commitDigest, checkpointKey: key,
    applicationProof: proof, baseline: target.baseline.ref, storedBaseline: target.stored, lifecycleComplete: false };
  if (!validateResult(value)) fail("result violates its contract");
  return value;
}

function assertPredecessorHead(head, target, digest) {
  if (!validateHead(head.state) || !same(head.state.baseline, target.prior) || head.state.activationDigest !== (target.predecessor?.activationDigest ?? null) ||
      (head.state.pendingCommit !== null && head.state.pendingCommit !== digest)) fail("prior baseline or pending Gate conflicts");
}

export async function activateLocalWorkBaseline({ storage, namespace, graph, boundary, ...args }) {
  const target = await prepare({ ...args, storage, namespace });
  const key = `work-baseline-activation:${args.record.commitDigest}`;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const id = localWorkBaselineHeadId(namespace);
  const digest = args.record.commitDigest;
  if (published(storage, id, digest, target)) return verifyLocalWorkBaselineActivation({ storage, namespace, graph, ...args });
  assertLocalWorkContextCurrent({ storage, namespace, boundary, state: args.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    if (target.prior) fail("prior baseline head is missing");
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalWorkBaselineHead", baseline: null, activationDigest: null, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  assertPredecessorHead(head, target, digest);
  const lease = storage.acquireLease({ runId: id, owner: `work-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    head = storage.readRun(id);
    if (published(storage, id, digest, target)) return verifyLocalWorkBaselineActivation({ storage, namespace, graph, ...args });
    assertPredecessorHead(head, target, digest);
    await verifyWorkPredecessor({ storage, namespace, loadArtifact: args.loadArtifact, currentWorkBreakdownBaseline: target.prior ?? undefined });
    assertLocalWorkContextCurrent({ storage, namespace, boundary, state: args.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
    const saved = checkpoints.get(key);
    const prepared = saved ? await graph.validatePrepared({ ...target.request, checkpoint: saved }) : await graph.prepare({ ...target.request, baseGraph: graph.captureBase() });
    checkpoints.put(key, prepared.checkpoint);
    let proof;
    try { proof = graph.assertApplied(prepared.updateRef); } catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
    if (published(storage, id, digest, target)) {
      if (!proof) fail("published baseline lacks its exact graph receipt");
      return result(args.record, key, proof, target);
    }
    if (head.state.pendingCommit === null) {
      if (proof) fail("graph applied without durable reservation");
      head = storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "WorkBaselineReserved", commitDigest: digest }, nextState: { ...head.state, pendingCommit: digest } });
    }
    const stored = storage.putArtifact({ ...target.stored, bytes: target.baseline.bytes, expectedDigest: target.baseline.ref.digest });
    if (!same(stored, target.stored)) fail("stored baseline metadata drifted");
    if (!proof) { await graph.mergePrepared(prepared); proof = graph.assertApplied(prepared.updateRef); }
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: digest, kind: "WorkBaselineActivated", commitDigest: digest, baseline: target.baseline.ref }, artifactRefs: [stored],
      nextState: { kind: "LocalWorkBaselineHead", baseline: target.baseline.ref, activationDigest: digest, pendingCommit: null } });
    return result(args.record, key, proof, target);
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalWorkBaselineActivation({ storage, namespace, graph, ...args }) {
  const target = await prepare({ ...args, storage, namespace });
  const key = `work-baseline-activation:${args.record.commitDigest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(key);
  if (!checkpoint) fail("prepared checkpoint missing");
  const prepared = await graph.validatePrepared({ ...target.request, checkpoint });
  const proof = graph.assertApplied(prepared.updateRef);
  if (!published(storage, localWorkBaselineHeadId(namespace), args.record.commitDigest, target)) fail("publication missing");
  return result(args.record, key, proof, target);
}
