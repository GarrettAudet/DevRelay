import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalArchitectureGate } from "./local-architecture-gate.mjs";
import { validateArchitectureArtifact } from "./architecture-artifact-validator.mjs";
import { localArchitectureHeadId } from "./local-discovery-activation.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateHead = compileArtifactSchema(read("local-architecture-head.schema.json"), [read("module-result.schema.json")]);
const validateActivation = compileArtifactSchema(read("local-architecture-activation.schema.json"),
  [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`architecture activation: ${message}`); };

function activationResult(commitDigest, checkpointKey, applicationProof, target) {
  const result = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalArchitectureActivation",
    gateCommitDigest: commitDigest, checkpointKey, applicationProof, state: target.state, storedState: target.storedState,
    scope: "approved-architecture-state-activation", lifecycleComplete: false };
  if (!validateActivation(result)) fail("result violates its closed contract");
  return result;
}

async function prepare({ checkpointReplay, record, loadArtifact }) {
  await verifyLocalArchitectureGate({ checkpointReplay, record, loadArtifact });
  const prior = checkpointReplay.loadedInputs["project-architecture-state"][0];
  const baselineBytes = Buffer.from(record.baseline.bytesBase64, "base64");
  const baseline = { ref: record.baseline.ref, bytes: baselineBytes, value: JSON.parse(baselineBytes) };
  const stateValue = { ...structuredClone(prior.value), stateId: `baselined-${record.commitDigest.slice(7)}`,
    state: "baselined", architectureBaseline: baseline.ref };
  validateArchitectureArtifact(stateValue);
  const bytes = Buffer.from(canonicalJson(stateValue));
  const state = { artifactId: stateValue.stateId, schema: prior.ref.schema, mediaType: prior.ref.mediaType,
    digest: sha256Digest(bytes), uri: `artifact://architecture-activation/${record.commitDigest.slice(7)}/state` };
  const storedState = { artifactId: state.artifactId, digest: state.digest, mediaType: state.mediaType, byteCount: bytes.length };
  return { priorState: prior.ref, state, storedState, bytes, request: {
    invocation: checkpointReplay.invocation,
    invocationFingerprint: canonicalJsonDigest({ invocation: checkpointReplay.invocation, gateCommit: record.commitDigest }),
    moduleResult: checkpointReplay.moduleResult, loadedInputs: checkpointReplay.loadedInputs,
    loadedOutputs: { ...checkpointReplay.loadedOutputs, "architecture-baseline": [baseline] },
    resolveArtifact: async ref => ({ ref, bytes: await loadArtifact(ref) }),
    gate: { id: "architecture-gate", outcome: "promoted", commitDigest: record.commitDigest, baseline: baseline.ref },
  } };
}

function publication(storage, id, commitDigest, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: commitDigest });
  if (!rows.length) return false;
  const expected = { id: commitDigest, kind: "ArchitectureHeadAdvanced", commitDigest, state: target.state };
  if (rows.length !== 1 || !same(rows[0].transition, expected) || !same(rows[0].artifactRefs, [target.storedState])) fail("publication journal drifted");
  if (sha256Digest(storage.getArtifact(target.storedState)) !== target.state.digest) fail("published state bytes drifted");
  return true;
}

// Only the owning Gate can authorize this update. The host must explicitly
// configure its versioned activation contributor. No adapter is called here.
export async function activateLocalArchitectureGate({ storage, namespace, graph, ...args }) {
  const target = await prepare(args);
  const { record } = args;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const checkpointKey = `architecture-activation:${record.commitDigest}`;
  const saved = checkpoints.get(checkpointKey);
  const prepared = saved ? await graph.validatePrepared({ ...target.request, checkpoint: saved })
    : await graph.prepare({ ...target.request, baseGraph: graph.captureBase() });
  checkpoints.put(checkpointKey, prepared.checkpoint);
  const id = localArchitectureHeadId(namespace);
  // A completed historical publication is observation-only. In particular,
  // do not acquire a lease and mutate updatedAt merely to replay its receipt.
  if (publication(storage, id, record.commitDigest, target)) {
    return activationResult(record.commitDigest, checkpointKey, graph.assertApplied(prepared.updateRef), target);
  }
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalArchitectureHead", state: target.priorState, activationDigest: null, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  if (!validateHead(head.state)) fail("head violates its contract");
  const lease = storage.acquireLease({ runId: id, owner: `architecture-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    let applicationProof;
    try { applicationProof = graph.assertApplied(prepared.updateRef); }
    catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
    if (publication(storage, id, record.commitDigest, target)) {
      if (!applicationProof) fail("published state lacks its exact graph receipt");
      return activationResult(record.commitDigest, checkpointKey, applicationProof, target);
    }
    if (!same(head.state.state, target.priorState) ||
        (head.state.pendingCommit != null && head.state.pendingCommit !== record.commitDigest)) fail("prior state or pending Gate conflicts");
    if (head.state.pendingCommit == null) {
      if (applicationProof) fail("graph was applied without a durable activation reservation");
      head = storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "ArchitectureActivationReserved", commitDigest: record.commitDigest },
        nextState: { ...head.state, pendingCommit: record.commitDigest } });
    }
    const stored = storage.putArtifact({ ...target.storedState, bytes: target.bytes, expectedDigest: target.state.digest });
    if (!same(stored, target.storedState)) fail("stored state metadata drifted");
    if (!applicationProof) {
      await graph.mergePrepared(prepared);
      applicationProof = graph.assertApplied(prepared.updateRef);
    }
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: record.commitDigest, kind: "ArchitectureHeadAdvanced", commitDigest: record.commitDigest, state: target.state },
      artifactRefs: [stored], nextState: { kind: "LocalArchitectureHead", state: target.state, activationDigest: record.commitDigest, pendingCommit: null } });
    return activationResult(record.commitDigest, checkpointKey, applicationProof, target);
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalArchitectureActivation({ storage, namespace, graph, ...args }) {
  const target = await prepare(args);
  const checkpointKey = `architecture-activation:${args.record.commitDigest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(checkpointKey);
  if (!checkpoint) fail("prepared checkpoint is missing");
  const prepared = await graph.validatePrepared({ ...target.request, checkpoint });
  const applicationProof = graph.assertApplied(prepared.updateRef);
  if (!publication(storage, localArchitectureHeadId(namespace), args.record.commitDigest, target)) fail("state publication is missing");
  return activationResult(args.record.commitDigest, checkpointKey, applicationProof, target);
}
