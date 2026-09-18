import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { validateQualityContinuityArtifact } from "./quality-continuity-artifact-validator.mjs";
import { createQualityPolicyCandidate, promoteQualityPolicyBaseline } from "./quality-policy.mjs";

const schema = "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json";
const contract = JSON.parse(readFileSync(new URL("../contracts/quality-policy-artifacts.schema.json", import.meta.url)));
// Reuse the owning Gate's approval contract, not a second approval authority.
const approvalSchema = `${schema}#/oneOf/4/properties/approval`;
const validateApproval = compileArtifactSchema({ $ref: approvalSchema }, [contract]);
const validateRecord = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/local-quality-policy-gate.schema.json", import.meta.url))),
  [JSON.parse(readFileSync(new URL("../contracts/module-result.schema.json", import.meta.url)))]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`local quality Gate: ${message}`); };
const packed = loaded => ({ ref: loaded.ref, bytesBase64: loaded.bytes.toString("base64") });

// Preparation only: the caller must authenticate approval evidence and publish
// through a durable current-head transaction before dispatch. No writes here.
export async function prepareLocalQualityPolicyGate(request) {
  const allowed = ["candidateRef", "approvalRef", "previousBaselineRef", "loadArtifact"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) fail("undeclared input");
  const { candidateRef, approvalRef, previousBaselineRef = null, loadArtifact } = request;
  const load = async (ref, expectedSchema) => {
    if (ref?.schema !== expectedSchema || ref?.mediaType !== "application/json") fail("reference differs from owning contract");
    return loadArtifactContent(ref, { load: loadArtifact });
  };
  const candidate = await load(candidateRef, schema);
  validateQualityContinuityArtifact(candidate.value);
  if (candidate.value.kind !== "QualityPolicyCandidate" || candidate.ref.artifactId !== candidate.value.policyId) fail("exact policy candidate required");
  const expectedCandidate = createQualityPolicyCandidate(candidate.value);
  if (!same(expectedCandidate, candidate.value)) fail("candidate differs from canonical proposal");
  const approval = await load(approvalRef, approvalSchema);
  if (!validateApproval(approval.value)) fail("approval violates owning Gate contract");
  let previous = null;
  if (previousBaselineRef !== null) {
    previous = await load(previousBaselineRef, schema);
    validateQualityContinuityArtifact(previous.value);
    if (previous.value.kind !== "QualityPolicyBaseline" || previous.ref.artifactId !== previous.value.policyId ||
        previous.value.policyId !== candidate.value.policyId) fail("prior policy identity differs");
    const reconstructed = promoteQualityPolicyBaseline({ candidate: createQualityPolicyCandidate(previous.value), approval: previous.value.approval });
    if (!same(reconstructed, previous.value)) fail("prior policy differs from exact promotion");
    if (candidate.value.version === previous.value.version) fail("changed policy requires a new version");
  }
  if (candidate.value.previousBaselineDigest !== (previous?.value.baselineDigest ?? null)) fail("prior policy digest differs");
  const baselineValue = promoteQualityPolicyBaseline({ candidate: candidate.value, approval: approval.value });
  const bytes = Buffer.from(canonicalJson(baselineValue));
  const ref = { artifactId: baselineValue.policyId, schema, mediaType: "application/json", digest: sha256Digest(bytes),
    uri: `memory://quality-policy/${sha256Digest(bytes).slice(7)}.json` };
  const body = { kind: "LocalQualityPolicyGatePreparation", candidate: packed(candidate), approval: packed(approval),
    previousBaseline: previous ? packed(previous) : null, baseline: { ref, bytesBase64: bytes.toString("base64") },
    scope: "validated-policy-promotion", activatesPolicy: false };
  const result = { ...body, preparationDigest: canonicalJsonDigest(body) };
  if (!validateRecord(result)) fail("preparation violates closed contract");
  return result;
}

export async function verifyLocalQualityPolicyGate({ record, loadArtifact }) {
  if (!validateRecord(record)) fail("preparation violates closed contract");
  const expected = await prepareLocalQualityPolicyGate({ candidateRef: record.candidate.ref, approvalRef: record.approval.ref,
    previousBaselineRef: record.previousBaseline?.ref ?? null, loadArtifact });
  if (!same(expected, record)) fail("stored preparation differs from exact evidence");
  return expected;
}
