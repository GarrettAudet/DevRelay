import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { prepareLocalContractPlanning, verifyLocalContractPlanning } from "./local-contract-planning.mjs";
import { approveContractsNotApplicable } from "./contract-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-contract-not-applicable.schema.json"), [read("module-result.schema.json"), read("local-requirements-gate-commit.schema.json")]);
const decode = entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64"), value: JSON.parse(Buffer.from(entry.bytesBase64, "base64")) });

async function derive({ planning, approvalRef, ...request }, current) {
  const verified = current ? await prepareLocalContractPlanning(request) : await verifyLocalContractPlanning({ ...request, planning });
  if (canonicalJsonDigest(planning) !== canonicalJsonDigest(verified) || verified.route.kind !== "gate" || verified.route.branch !== "approve-not-applicable") throw new TypeError("not-applicable approval requires exact zero-intent planning");
  const approval = await loadArtifactContent(approvalRef, { load: request.loadArtifact });
  const gate = await approveContractsNotApplicable({ state: decode(planning.state), architecture: decode(request.record.baseline), approval,
    evidenceResolver: ref => loadArtifactBytes(ref, { load: request.loadArtifact }) });
  const bytes = Buffer.from(canonicalJson(gate.contractDisposition));
  const ref = { artifactId: gate.contractDisposition.dispositionId, schema: "https://devrelay.dev/artifacts/contract-disposition/v1",
    mediaType: "application/vnd.devrelay.contract-disposition+json", digest: sha256Digest(bytes), uri: `artifact://contract-not-applicable/${planning.planningDigest.slice(7)}/disposition` };
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalContractNotApplicableCommit", planningDigest: planning.planningDigest,
    approval: { ref: approvalRef, bytesBase64: approval.bytes.toString("base64"), byteLength: approval.bytes.length },
    disposition: { ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length }, scope: "validated-contract-not-applicable", lifecycleComplete: false };
  const commit = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validate(commit)) throw new TypeError("not-applicable commit violates its closed contract");
  return commit;
}

export async function prepareLocalContractsNotApplicable(request) { return derive(request, true); }
export async function verifyLocalContractsNotApplicable({ commit, ...request }) {
  if (!validate(commit)) throw new TypeError("stored not-applicable commit violates its closed contract");
  const expected = await derive({ ...request, approvalRef: commit.approval.ref }, false);
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(commit)) throw new TypeError("not-applicable commit differs from owning validation");
  return expected;
}

// This is an owning-Gate context, not an invented ContractGeneration execution.
// The architecture receipt and zero-intent planning are revalidated first.
export async function createContractsNotApplicableTraceContext({ commit, planning, ...request }) {
  await verifyLocalContractsNotApplicable({ ...request, planning, commit });
  const replay = request.checkpointReplay;
  const disposition = decode(commit.disposition);
  return {
    invocation: replay.invocation,
    invocationFingerprint: canonicalJsonDigest({ invocation: replay.invocation, gateCommit: commit.commitDigest }),
    moduleResult: replay.moduleResult,
    loadedInputs: { ...replay.loadedInputs, "project-contract-state": [decode(planning.state)] },
    loadedOutputs: { ...replay.loadedOutputs, "contract-disposition": [disposition] },
    resolveArtifact: async ref => ({ ref, bytes: await request.loadArtifact(ref) }),
    gate: { id: "contract-gate", outcome: "not-applicable", commitDigest: commit.commitDigest, disposition: disposition.ref },
  };
}
