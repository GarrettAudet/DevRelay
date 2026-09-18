import { canonicalJsonDigest } from "./content-digest.mjs";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedContractGenerationReceipt } from "./contract-generation-runtime.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-contract-candidate-trace.schema.json"), [read("module-execution-record.schema.json")]);
function result(checkpointKey, executionCheckpointDigest, applicationProof) {
  const record = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalContractCandidateTrace", checkpointKey,
    executionCheckpointDigest, applicationProof, scope: "candidate-contract-trace", lifecycleComplete: false };
  if (!validate(record)) throw new TypeError("contract candidate trace violates its closed contract");
  return record;
}

// The intrinsic ContractGeneration runtime is the source of this execution
// identity. No downstream invocation or successful candidate is invented.
export async function createContractExecutionTraceContext({ replayReceipt, loadArtifact }) {
  const checkpoint = assertVerifiedContractGenerationReceipt(replayReceipt);
  if (checkpoint.outcome !== "generated" || !checkpoint.artifacts.candidate) throw new TypeError("contract candidate trace requires a verified generated checkpoint");
  const loadedInputs = {};
  for (const binding of checkpoint.inputBindings) loadedInputs[binding.role] = [await loadArtifactContent(binding.artifact, { load: loadArtifact })];
  const decode = entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"),
    ...(entry.value === undefined ? {} : { value: entry.value }) });
  const candidate = decode(checkpoint.artifacts.candidate);
  const port = checkpoint.operation === "establish-contracts" ? "contract-draft-set" : "contract-change-set-draft";
  const invocation = { invocationId: checkpoint.executionId,
    module: { id: "contract-generation", version: "0.1.0", operation: checkpoint.operation } };
  return { invocation, invocationFingerprint: checkpoint.executionFingerprint,
    moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: checkpoint.executionId,
      status: "completed", outcome: checkpoint.outcome, outputs: { [port]: [candidate.ref] },
      evidence: [
        { kind: "contract-generation/format-validation", subject: candidate.ref.artifactId, status: "pass", artifact: checkpoint.artifacts.validationSet.ref },
        { kind: "contract-generation/canonical-diff", subject: candidate.ref.artifactId, status: "pass", artifact: checkpoint.artifacts.canonicalDiff.ref },
      ], diagnostics: checkpoint.diagnostics },
    loadedInputs, loadedOutputs: { [port]: [candidate] },
    resolvedArtifacts: [...Object.values(checkpoint.artifacts), ...Object.values(checkpoint.nativeArtifacts)].filter(entry => entry?.ref).map(decode),
    resolveArtifact: async ref => ({ ref, bytes: await loadArtifact(ref) }) };
}

export async function publishLocalContractCandidateTrace({ storage, namespace, graph, ...request }) {
  const context = await createContractExecutionTraceContext(request);
  const checkpointKey = `contract-candidate-trace:${request.replayReceipt.checkpointDigest}`;
  const store = createLocalHostCheckpointStore({ storage, namespace });
  const saved = store.get(checkpointKey);
  const prepared = saved ? await graph.validatePrepared({ ...context, checkpoint: saved })
    : await graph.prepare({ ...context, baseGraph: graph.captureBase() });
  store.put(checkpointKey, prepared.checkpoint);
  let applicationProof;
  try { applicationProof = graph.assertApplied(prepared.updateRef); }
  catch (error) { if (error.code !== "TG_UPDATE_NOT_APPLIED") throw error; }
  if (!applicationProof) { await graph.mergePrepared(prepared); applicationProof = graph.assertApplied(prepared.updateRef); }
  return result(checkpointKey, request.replayReceipt.checkpointDigest, applicationProof);
}

export async function verifyLocalContractCandidateTrace({ storage, namespace, graph, record, ...request }) {
  if (!validate(record)) throw new TypeError("stored contract candidate trace violates its closed contract");
  const context = await createContractExecutionTraceContext(request);
  const checkpointKey = `contract-candidate-trace:${request.replayReceipt.checkpointDigest}`;
  const checkpoint = createLocalHostCheckpointStore({ storage, namespace }).get(checkpointKey);
  if (!checkpoint) throw new TypeError("contract candidate graph checkpoint is missing");
  const prepared = await graph.validatePrepared({ ...context, checkpoint });
  const expected = result(checkpointKey, request.replayReceipt.checkpointDigest, graph.assertApplied(prepared.updateRef));
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(record)) throw new TypeError("contract candidate graph proof drifted");
  return expected;
}
