import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedWorkDependencyReceipt } from "./work-dependency-runtime.mjs";
import { promoteWorkDependencyBaseline } from "./work-dependency-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-work-dependency-gate.schema.json"), [read("module-result.schema.json"), read("local-requirements-gate-commit.schema.json")]);
const encoded = loaded => ({ ref: loaded.ref, bytesBase64: loaded.bytes.toString("base64"), byteLength: loaded.bytes.length });

// Candidate commit only. The owning Gate validates exact runtime authority;
// activation and downstream progression require a separate durable transaction.
export async function prepareLocalWorkDependencyGate({ replayReceipt, baselineRef, approvalRef, loadArtifact }) {
  assertVerifiedWorkDependencyReceipt(replayReceipt);
  const baseline = await loadArtifactContent(baselineRef, { load: loadArtifact });
  const approval = await loadArtifactContent(approvalRef, { load: loadArtifact });
  const promotion = await promoteWorkDependencyBaseline({ replayReceipt, baseline: baseline.value, baselineRef, baselineBytes: baseline.bytes, approval,
    evidenceResolver: ref => loadArtifactBytes(ref, { load: loadArtifact }) });
  const body = { kind: "LocalWorkDependencyGateCommit", checkpointDigest: promotion.checkpointDigest, gateCommitDigest: promotion.commitDigest,
    baseline: encoded(baseline), approval: encoded(approval), scope: "validated-work-dependency-baseline", lifecycleComplete: false };
  const result = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validate(result)) throw new TypeError("dependency Gate commit violates its contract");
  return result;
}

export async function verifyLocalWorkDependencyGate({ record, ...request }) {
  if (!validate(record)) throw new TypeError("stored dependency Gate violates its contract");
  const expected = await prepareLocalWorkDependencyGate({ ...request, baselineRef: record.baseline.ref, approvalRef: record.approval.ref });
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(record)) throw new TypeError("dependency Gate differs from owning validation");
  return expected;
}
