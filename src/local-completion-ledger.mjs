import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { deriveLocalIntegrationCompletion } from "./local-integration-completion.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateWorkExecutionArtifact } from "./work-execution-artifact-validator.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url)));
const validate = compileArtifactSchema(read("local-completion-ledger.schema.json"),
  ["module-result.schema.json", "module-invocation.schema.json", "work-execution-artifacts.schema.json", "work-breakdown-artifacts.schema.json"].map(read));
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`completion ledger: ${message}`); };
const seal = (baselines, entries) => {
  const body = { kind: "LocalCompletionLedger", baselines, entries };
  return { ...body, ledgerDigest: canonicalJsonDigest(body) };
};
export const localCompletionLedgerId = (namespace, workBaseline) => {
  if (typeof namespace !== "string" || !namespace.length) fail("namespace required");
  return `completion-ledger:${canonicalJsonDigest({ namespace, workBaseline })}`;
};
function checked(state, baselines) {
  if (!validate(state) || !same(state, seal(state.baselines, state.entries)) || !same(state.baselines, baselines)) fail("state or exact baseline lineage differs");
  const ids = state.entries.map(entry => entry.fact.workItemId);
  if (new Set(ids).size !== ids.length) fail("duplicate integrated work item");
  return state;
}

// Explicit initialization only; reading an absent ledger never invents an empty
// history. The Desktop host must initialize before allowing any work execution
// and bind these baselines to its verified current activation heads. A baseline
// replacement requires a separate continuity/migration decision, not a reset.
export function initializeLocalCompletionLedger({ storage, namespace, baselines }) {
  const state = checked(seal(baselines, []), baselines);
  const runId = localCompletionLedgerId(namespace, baselines.workBreakdownBaseline);
  try {
    const existing = storage.readRun(runId);
    checked(existing.state, baselines);
    return existing;
  } catch (error) { if (error.code !== "DR4920") throw error; }
  try { return storage.initializeRun({ runId, state }); }
  catch (error) {
    if (error.code !== "DR4922") throw error;
    const existing = storage.readRun(runId);
    checked(existing.state, baselines);
    return existing;
  }
}

// verifyIntegration is the host's exact Core verifyCheckpointedExecution loader,
// never an agent-supplied receipt or a plain serialized object. Every entry is
// revalidated, including after restart, before the fact set is returned.
export async function readLocalCompletionLedger({ storage, namespace, baselines, verifyIntegration }) {
  if (typeof verifyIntegration !== "function") fail("Core replay verifier required");
  const runId = localCompletionLedgerId(namespace, baselines.workBreakdownBaseline);
  const head = storage.readRun(runId);
  const state = checked(head.state, baselines);
  const journal = storage.readTransitionJournal(runId);
  if (head.version !== state.entries.length || journal.length !== state.entries.length) fail("completion history is incomplete");
  for (let index = 0; index < state.entries.length; index++) {
    const entry = state.entries[index];
    const replay = assertVerifiedCheckpointReplayReceipt(await verifyIntegration(structuredClone(entry.invocation)));
    if (!same(replay.invocation, entry.invocation)) fail("replay invocation substituted");
    const fact = deriveLocalIntegrationCompletion({ checkpointReplay: replay, baselines, workItemRef: entry.workItemRef });
    if (!same(fact, entry.fact)) fail("completion differs from genuine integration replay");
    const row = journal[index];
    const expected = transition(state.baselines, state.entries.slice(0, index), entry);
    if (row.fromVersion !== index || row.toVersion !== index + 1 || !same(row.transition, expected)) fail("completion journal differs from exact append history");
  }
  const facts = state.entries.map(entry => entry.fact).sort((a, b) => a.workItemId < b.workItemId ? -1 : a.workItemId > b.workItemId ? 1 : 0);
  const factSet = { apiVersion: "devrelay.dev/v1alpha1", kind: "IntegratedCompletionFactSet", facts, factsDigest: canonicalJsonDigest(facts) };
  validateWorkExecutionArtifact(factSet);
  return { runId, version: head.version, state: structuredClone(state), factSet };
}
function transition(baselines, prior, entry) {
  return { kind: "IntegratedWorkRecorded", id: canonicalJsonDigest(entry),
    priorDigest: seal(baselines, prior).ledgerDigest, nextDigest: seal(baselines, [...prior, entry]).ledgerDigest, entry };
}

export async function appendLocalCompletion({ checkpointReplay, workItemRef, expectedVersion, ...request }) {
  const replay = assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  const fact = deriveLocalIntegrationCompletion({ checkpointReplay: replay, workItemRef, baselines: request.baselines });
  const entry = structuredClone({ invocation: replay.invocation, workItemRef, fact });
  const current = await readLocalCompletionLedger(request);
  const existing = current.state.entries.find(item => item.fact.workItemId === fact.workItemId);
  if (existing) {
    if (!same(existing, entry)) fail("work item already integrated by a different exact invocation");
    return { ...current, replayed: true };
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== current.version) fail("stale expected ledger version");
  // Prove the incoming receipt is recoverable by this host before publication.
  // Otherwise a genuine receipt from an unrelated registry could poison a ledger
  // that only discovers the missing checkpoint during its post-commit read.
  const recovered = assertVerifiedCheckpointReplayReceipt(await request.verifyIntegration(structuredClone(entry.invocation)));
  if (!same(recovered.invocation, entry.invocation) || !same(recovered.moduleResult, replay.moduleResult) ||
      !same(deriveLocalIntegrationCompletion({ checkpointReplay: recovered, workItemRef, baselines: request.baselines }), fact)) {
    fail("incoming completion is not recoverable from this host's exact checkpoint");
  }
  const { storage } = request;
  const lease = storage.acquireLease({ runId: current.runId, expectedVersion, owner: `completion:${process.pid}`, durationMilliseconds: 120000 });
  try {
    storage.commitTransition({ runId: current.runId, expectedVersion, leaseToken: lease.token,
      transition: transition(current.state.baselines, current.state.entries, entry),
      nextState: seal(current.state.baselines, [...current.state.entries, entry]) });
  } finally { storage.releaseLease({ runId: current.runId, leaseToken: lease.token }); }
  return { ...await readLocalCompletionLedger(request), replayed: false };
}
