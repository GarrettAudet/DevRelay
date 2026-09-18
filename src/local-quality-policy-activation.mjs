import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { verifyLocalQualityPolicyGate } from "./local-quality-policy-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url)));
const validateHead = compileArtifactSchema(read("local-quality-policy-head.schema.json"), [read("module-result.schema.json")]);
const validateResult = compileArtifactSchema(read("local-quality-policy-activation.schema.json"), [read("module-result.schema.json"), read("module-execution-record.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`quality policy activation: ${message}`); };
function result(value) {
  const output = { kind: "LocalQualityPolicyActivation", ...value };
  if (!validateResult(output)) fail("result violates contract");
  return output;
}
export const localQualityPolicyHeadId = namespace => `quality-policy-head:${canonicalJsonDigest({ namespace })}`;
const decode = entry => { const bytes = Buffer.from(entry.bytesBase64, "base64"); return { ref: entry.ref, bytes, value: JSON.parse(bytes) }; };

async function targetFor({ record, loadArtifact }) {
  await verifyLocalQualityPolicyGate({ record, loadArtifact });
  const baseline = decode(record.baseline);
  const inputs = { candidate: [decode(record.candidate)], approval: [decode(record.approval)],
    ...(record.previousBaseline ? { previous: [decode(record.previousBaseline)] } : {}) };
  const evidence = [...new Map([...Object.values(inputs).flat(), baseline].map(item =>
    [`${item.ref.artifactId}\u0000${item.ref.digest}`, item])).values()]
    .sort((a, b) => a.ref.artifactId.localeCompare(b.ref.artifactId, "en"));
  const storedEvidence = evidence.map(item => ({ artifactId: item.ref.artifactId, digest: item.ref.digest,
    mediaType: item.ref.mediaType, byteCount: item.bytes.length }));
  // This is the trusted Gate projection boundary, not an adapter invocation.
  const invocation = { invocationId: `quality-gate:${record.preparationDigest}`, module: { id: "quality-policy-gate", version: "0.1.0", operation: "promote-baseline" } };
  return { record, baseline, evidence, storedEvidence,
    graphRequest: { invocation, invocationFingerprint: canonicalJsonDigest(invocation),
      moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId,
        status: "completed", outcome: "promoted", outputs: {}, evidence: [], diagnostics: [] },
      loadedInputs: inputs, loadedOutputs: { baseline: [baseline] } } };
}

function published(storage, id, target) {
  const rows = storage.readTransitionJournal(id, { transitionId: target.record.preparationDigest });
  if (!rows.length) return false;
  if (rows.length !== 1 || !same(rows[0].transition, { id: target.record.preparationDigest, kind: "QualityPolicyActivated", baseline: target.baseline.ref }) ||
      !same(rows[0].artifactRefs, target.storedEvidence) ||
      target.storedEvidence.some(ref => sha256Digest(storage.getArtifact(ref)) !== ref.digest)) fail("publication evidence differs");
  return true;
}

export function assertLocalQualityPolicyCurrent({ storage, namespace, baseline }) {
  const head = storage.readRun(localQualityPolicyHeadId(namespace));
  if (!validateHead(head.state) || !same(head.state.baseline, baseline) || head.state.preparationDigest === null || head.state.pendingPreparation !== null) fail("current policy missing, stale or pending recovery");
  return head;
}

export async function activateLocalQualityPolicy(request) {
  const { storage, namespace, graph } = request;
  const target = await targetFor(request);
  const id = localQualityPolicyHeadId(namespace);
  const key = `quality-policy-activation:${target.record.preparationDigest}`;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace });
  const saved = checkpoints.get(key);
  const prepared = saved ? await graph.validatePrepared({ ...target.graphRequest, checkpoint: saved }) :
    await graph.prepare({ ...target.graphRequest, baseGraph: graph.captureBase() });
  checkpoints.put(key, prepared.checkpoint);
  const currentResult = () => result({ baseline: target.baseline.ref, preparationDigest: target.record.preparationDigest,
    checkpointKey: key, applicationProof: graph.assertApplied(prepared.updateRef), dispatchAuthorized: false });
  if (published(storage, id, target)) return currentResult();
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalQualityPolicyHead", baseline: null, preparationDigest: null, pendingPreparation: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  if (!validateHead(head.state)) fail("head violates contract");
  const lease = storage.acquireLease({ runId: id, owner: `quality-gate:${process.pid}`, expectedVersion: head.version, durationMilliseconds: 120000 });
  try {
    if (published(storage, id, target)) return currentResult();
    if (!same(head.state.baseline, target.record.previousBaseline?.ref ?? null) ||
        (head.state.pendingPreparation !== null && head.state.pendingPreparation !== target.record.preparationDigest)) fail("prior policy or pending preparation conflicts");
    let proof;
    try { proof = graph.assertApplied(prepared.updateRef); } catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
    if (head.state.pendingPreparation === null) {
      if (proof) fail("graph applied without durable reservation");
      head = storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
        transition: { kind: "QualityPolicyReserved", preparationDigest: target.record.preparationDigest },
        nextState: { ...head.state, pendingPreparation: target.record.preparationDigest } });
    }
    for (const [index, item] of target.evidence.entries()) {
      const stored = storage.putArtifact({ artifactId: item.ref.artifactId, mediaType: item.ref.mediaType,
        bytes: item.bytes, expectedDigest: item.ref.digest });
      if (!same(stored, target.storedEvidence[index])) fail("stored policy evidence metadata differs");
    }
    if (!proof) await graph.mergePrepared(prepared);
    const output = currentResult();
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: target.record.preparationDigest, kind: "QualityPolicyActivated", baseline: target.baseline.ref }, artifactRefs: target.storedEvidence,
      nextState: { kind: "LocalQualityPolicyHead", baseline: target.baseline.ref, preparationDigest: target.record.preparationDigest, pendingPreparation: null } });
    return output;
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalQualityPolicyActivation(request) {
  const { storage, namespace, graph } = request;
  const target = await targetFor(request);
  const checkpointKey = `quality-policy-activation:${target.record.preparationDigest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(checkpointKey);
  if (!checkpoint) fail("prepared graph checkpoint missing");
  const prepared = await graph.validatePrepared({ ...target.graphRequest, checkpoint });
  if (!published(storage, localQualityPolicyHeadId(namespace), target)) fail("publication missing");
  return result({ baseline: target.baseline.ref, preparationDigest: target.record.preparationDigest, checkpointKey,
    applicationProof: graph.assertApplied(prepared.updateRef), dispatchAuthorized: false });
}
