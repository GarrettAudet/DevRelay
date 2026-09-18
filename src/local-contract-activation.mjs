import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalContractGate } from "./local-contract-gate.mjs";
import { validateContractGenerationArtifact } from "./contract-generation-artifact-validator.mjs";
import { createContractExecutionTraceContext } from "./local-contract-traceability.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { createContractsNotApplicableTraceContext } from "./local-contract-not-applicable.mjs";
import { assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
export const localContractHeadId = namespace => `contract-head:${canonicalJsonDigest({ namespace })}`;

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateHead = compileArtifactSchema(read("local-contract-head.schema.json"), [read("module-result.schema.json")]);
const validateActivation = compileArtifactSchema(read("local-contract-activation.schema.json"),
  [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`contract activation: ${message}`); };

export function assertLocalContractCurrentState({ storage, namespace, state }) {
  let head;
  try { head = storage.readRun(localContractHeadId(namespace)); }
  catch (error) { if (error.code === "DR4920") return; throw error; }
  if (!validateHead(head.state) || !same(head.state.state, state) || head.state.pendingCommit != null) fail("contract state is stale or activation needs recovery");
}

function activationResult(commitDigest, checkpointKey, applicationProof, target) {
  const result = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalContractActivation",
    gateCommitDigest: commitDigest, checkpointKey, applicationProof, state: target.state, storedState: target.storedState,
    scope: "approved-contract-state-activation", lifecycleComplete: false };
  if (!validateActivation(result)) fail("result violates its closed contract");
  return result;
}

async function prepare({ replayReceipt, record, loadArtifact }) {
  await verifyLocalContractGate({ replayReceipt, record, loadArtifact });
  const context = await createContractExecutionTraceContext({ replayReceipt, loadArtifact });
  const prior = context.loadedInputs["project-contract-state"][0];
  const bytesBaseline = Buffer.from(record.baseline.bytesBase64, "base64");
  const baseline = { ref: record.baseline.ref, bytes: bytesBaseline, value: JSON.parse(bytesBaseline) };
  const stateValue = { ...structuredClone(prior.value), stateId: `PCS-${record.commitDigest.slice(7).toUpperCase()}`,
    state: "baselined", contractBaseline: baseline.ref };
  validateContractGenerationArtifact(stateValue);
  const bytes = Buffer.from(canonicalJson(stateValue));
  const state = { artifactId: stateValue.stateId, schema: prior.ref.schema, mediaType: prior.ref.mediaType,
    digest: sha256Digest(bytes), uri: `artifact://contract-activation/${record.commitDigest.slice(7)}/state` };
  const storedState = { artifactId: state.artifactId, digest: state.digest, mediaType: state.mediaType, byteCount: bytes.length };
  return { priorState: prior.ref, state, storedState, bytes, request: { ...context,
    invocationFingerprint: canonicalJsonDigest({ executionFingerprint: context.invocationFingerprint, gateCommit: record.commitDigest }),
    loadedOutputs: { ...context.loadedOutputs, "contract-baseline": [baseline] },
    gate: { id: "contract-gate", outcome: "promoted", commitDigest: record.commitDigest, baseline: baseline.ref },
  } };
}

function publication(storage, id, commitDigest, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: commitDigest });
  if (!rows.length) return false;
  const expected = { id: commitDigest, kind: "ContractHeadAdvanced", commitDigest, state: target.state };
  if (rows.length !== 1 || !same(rows[0].transition, expected) || !same(rows[0].artifactRefs, [target.storedState])) fail("publication journal drifted");
  if (sha256Digest(storage.getArtifact(target.storedState)) !== target.state.digest) fail("published state bytes drifted");
  return true;
}

// Only the owning Gate can authorize this update. The host must explicitly
// configure its versioned activation contributor. No adapter is called here.
export async function activateLocalContractGate({ storage, namespace, graph, ...args }) {
  const target = await prepare(args);
  return activateTarget({ storage, namespace, graph, target, record: args.record });
}

async function activateTarget({ storage, namespace, graph, target, record }) {
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const checkpointKey = `contract-activation:${record.commitDigest}`;
  const saved = checkpoints.get(checkpointKey);
  const prepared = saved ? await graph.validatePrepared({ ...target.request, checkpoint: saved })
    : await graph.prepare({ ...target.request, baseGraph: graph.captureBase() });
  checkpoints.put(checkpointKey, prepared.checkpoint);
  const id = localContractHeadId(namespace);
  // A completed historical publication is observation-only. In particular,
  // do not acquire a lease and mutate updatedAt merely to replay its receipt.
  if (publication(storage, id, record.commitDigest, target)) {
    return activationResult(record.commitDigest, checkpointKey, graph.assertApplied(prepared.updateRef), target);
  }
  if (target.assertCurrent) target.assertCurrent();
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalContractHead", state: target.priorState, activationDigest: null, pendingCommit: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  if (!validateHead(head.state)) fail("head violates its contract");
  const lease = storage.acquireLease({ runId: id, owner: `contract-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
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
        transition: { kind: "ContractActivationReserved", commitDigest: record.commitDigest },
        nextState: { ...head.state, pendingCommit: record.commitDigest } });
    }
    const stored = storage.putArtifact({ ...target.storedState, bytes: target.bytes, expectedDigest: target.state.digest });
    if (!same(stored, target.storedState)) fail("stored state metadata drifted");
    if (!applicationProof) {
      await graph.mergePrepared(prepared);
      applicationProof = graph.assertApplied(prepared.updateRef);
    }
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: record.commitDigest, kind: "ContractHeadAdvanced", commitDigest: record.commitDigest, state: target.state },
      artifactRefs: [stored], nextState: { kind: "LocalContractHead", state: target.state, activationDigest: record.commitDigest, pendingCommit: null } });
    return activationResult(record.commitDigest, checkpointKey, applicationProof, target);
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalContractActivation({ storage, namespace, graph, ...args }) {
  const target = await prepare(args);
  return verifyTarget({ storage, namespace, graph, target, record: args.record });
}

async function verifyTarget({ storage, namespace, graph, target, record }) {
  const checkpointKey = `contract-activation:${record.commitDigest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(checkpointKey);
  if (!checkpoint) fail("prepared checkpoint is missing");
  const prepared = await graph.validatePrepared({ ...target.request, checkpoint });
  const applicationProof = graph.assertApplied(prepared.updateRef);
  if (!publication(storage, localContractHeadId(namespace), record.commitDigest, target)) fail("state publication is missing");
  return activationResult(record.commitDigest, checkpointKey, applicationProof, target);
}

async function prepareNotApplicable(args) {
  const context = await createContractsNotApplicableTraceContext(args);
  const prior = context.loadedInputs["project-contract-state"][0];
  const stateValue = { ...structuredClone(prior.value), stateId: `PCS-${args.commit.commitDigest.slice(7).toUpperCase()}` };
  validateContractGenerationArtifact(stateValue);
  const bytes = Buffer.from(canonicalJson(stateValue));
  const state = { artifactId: stateValue.stateId, schema: prior.ref.schema, mediaType: prior.ref.mediaType,
    digest: sha256Digest(bytes), uri: `artifact://contract-activation/${args.commit.commitDigest.slice(7)}/state` };
  return { priorState: prior.ref, state, bytes,
    storedState: { artifactId: state.artifactId, digest: state.digest, mediaType: state.mediaType, byteCount: bytes.length },
    request: context,
    assertCurrent: () => assertLocalArchitectureCurrentState({ storage: args.storage, namespace: args.namespace,
      state: args.planning.architectureActivation.state }) };
}

export async function activateLocalContractsNotApplicable(args) {
  const target = await prepareNotApplicable(args);
  return activateTarget({ storage: args.storage, namespace: args.namespace, graph: args.graph, target, record: args.commit });
}

export async function verifyLocalContractsNotApplicableActivation(args) {
  const target = await prepareNotApplicable(args);
  return verifyTarget({ storage: args.storage, namespace: args.namespace, graph: args.graph, target, record: args.commit });
}
