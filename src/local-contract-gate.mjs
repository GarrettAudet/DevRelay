import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { assertVerifiedContractGenerationReceipt } from "./contract-generation-runtime.mjs";
import { promoteContractBaseline } from "./contract-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-contract-gate-commit.schema.json"),
  [read("module-result.schema.json"), read("local-requirements-gate-commit.schema.json")]);
const encoded = (ref, bytes) => ({ ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length });

// Preparation only. A genuine runtime receipt and the owning Gate are required
// on every call. This result does not publish an approved graph or advance state.
export async function prepareLocalContractGate({ replayReceipt, approvalRef, baselineRef, loadArtifact }) {
  assertVerifiedContractGenerationReceipt(replayReceipt);
  const approval = await loadArtifactContent(approvalRef, { load: loadArtifact });
  const baseline = await loadArtifactContent(baselineRef, { load: loadArtifact });
  const gate = await promoteContractBaseline({ replayReceipt, approval, baseline: baseline.value, baselineRef, baselineBytes: baseline.bytes,
    evidenceResolver: ref => loadArtifactBytes(ref, { load: loadArtifact }) });
  const bytes = Buffer.from(canonicalJson(gate.contractDisposition));
  const dispositionRef = { artifactId: gate.contractDisposition.dispositionId,
    schema: "https://devrelay.dev/artifacts/contract-disposition/v1", mediaType: "application/vnd.devrelay.contract-disposition+json",
    digest: sha256Digest(bytes), uri: `artifact://contract-gate/${gate.checkpointDigest.slice(7)}/disposition` };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalContractGateCommit", checkpointDigest: gate.checkpointDigest,
    approval: encoded(approvalRef, approval.bytes), baseline: encoded(baselineRef, baseline.bytes), disposition: encoded(dispositionRef, bytes),
    scope: "validated-contract-baseline", lifecycleComplete: false };
  const record = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validate(record)) throw new TypeError("contract Gate record violates its closed contract");
  return record;
}

export async function verifyLocalContractGate({ record, ...request }) {
  if (!validate(record)) throw new TypeError("stored contract Gate violates its closed contract");
  const expected = await prepareLocalContractGate({ ...request, approvalRef: record.approval.ref, baselineRef: record.baseline.ref });
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(record)) throw new TypeError("stored contract Gate differs from owning validation");
  return expected;
}
