import { readFileSync } from "node:fs";
import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { prepareArchitectureDiscoveryGate } from "./architecture-discovery-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const deps = [read("module-result.schema.json")];
const validateActivation = compileArtifactSchema(read("local-discovery-activation.schema.json"), deps);
const validateHead = compileArtifactSchema(read("local-architecture-head.schema.json"), deps);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`discovery activation: ${message}`); };
export const localArchitectureHeadId = namespace => `architecture-head:${canonicalJsonDigest({ namespace })}`;
const headId = localArchitectureHeadId;

async function prepare({ checkpointReplay, gate, loadArtifact }) {
  const verified = await prepareArchitectureDiscoveryGate({ checkpointReplay,
    interpretationRef: gate.interpretationRef, ownerApprovalRef: gate.ownerApprovalRef, loadArtifact });
  if (!same(verified, gate)) fail("stored Gate differs from owning validation");
  const bytes = Buffer.from(gate.nextState.utf8);
  const state = gate.nextState.ref;
  if (sha256Digest(bytes) !== state.digest || bytes.length !== gate.nextState.byteLength) fail("next state bytes drifted");
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalDiscoveryActivation",
    gateCommitDigest: gate.commitDigest, priorState: gate.priorState, state,
    storedState: { artifactId: state.artifactId, digest: state.digest, mediaType: state.mediaType, byteCount: bytes.length },
    scope: "observational-state-activation", lifecycleComplete: false };
  const activation = { ...body, activationDigest: canonicalJsonDigest(body) };
  if (!validateActivation(activation)) fail("activation violates its closed contract");
  return { activation, bytes };
}

function applied(storage, id, activation) {
  const rows = storage.readTransitionJournal(id, { transitionId: activation.activationDigest });
  if (rows.length === 0) return false;
  if (rows.length !== 1 || !same(rows[0].transition, { id: activation.activationDigest, kind: "DiscoveryStateActivated", activation }) ||
      !same(rows[0].artifactRefs, [activation.storedState])) fail("activation journal evidence drifted");
  const bytes = storage.getArtifact(activation.storedState);
  if (sha256Digest(bytes) !== activation.state.digest) fail("activated state bytes drifted");
  return true;
}

export function assertLocalArchitectureCurrentState({ storage, namespace, state }) {
  let head;
  try { head = storage.readRun(headId(namespace)); }
  catch (error) { if (error.code === "DR4920") return; throw error; }
  if (!validateHead(head.state) || !same(head.state.state, state)) fail("architecture state is stale or substituted");
  if (head.state.pendingCommit != null) fail("architecture Gate activation needs recovery before progression");
}

// Gate preparation is durably checkpointed by the host before this is called.
// The state bytes precede the atomic head/journal publication. Retry after either
// boundary revalidates the genuine Core receipt and never reruns discovery.
export async function activateLocalDiscoveryState({ storage, namespace, ...request }) {
  const { activation, bytes } = await prepare(request);
  const id = headId(namespace);
  if (applied(storage, id, activation)) return activation;
  let head;
  try { head = storage.readRun(id); }
  catch (error) {
    if (error.code !== "DR4920") throw error;
    try { head = storage.initializeRun({ runId: id, state: { kind: "LocalArchitectureHead", state: activation.priorState, activationDigest: null } }); }
    catch (race) { if (race.code !== "DR4922") throw race; head = storage.readRun(id); }
  }
  if (!validateHead(head.state)) fail("head violates its closed contract");
  const lease = storage.acquireLease({ runId: id, owner: `discovery-gate:${process.pid}`, expectedVersion: head.version });
  try {
    if (applied(storage, id, activation)) return activation;
    if (head.state.pendingCommit != null) fail("another architecture Gate activation needs recovery");
    if (!same(head.state.state, activation.priorState)) fail("another activation superseded the prior state");
    const stored = storage.putArtifact({ ...activation.storedState, bytes, expectedDigest: activation.state.digest });
    if (!same(stored, activation.storedState)) fail("stored state metadata drifted");
    storage.commitTransition({ runId: id, expectedVersion: head.version, leaseToken: lease.token,
      transition: { id: activation.activationDigest, kind: "DiscoveryStateActivated", activation },
      artifactRefs: [stored], nextState: { kind: "LocalArchitectureHead", state: activation.state, activationDigest: activation.activationDigest } });
    return activation;
  } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
}

export async function verifyLocalDiscoveryActivation({ storage, namespace, activation: saved, ...request }) {
  const { activation } = await prepare(request);
  if (!same(activation, saved) || !applied(storage, headId(namespace), activation)) fail("activation is missing or differs from its durable journal");
  return activation;
}
