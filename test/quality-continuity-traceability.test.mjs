import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createProjectControlSnapshot } from "../src/project-control.mjs";
import { createQualityPolicyCandidate, promoteQualityPolicyBaseline } from "../src/quality-policy.mjs";
import { qualityContinuityApprovedTraceabilityContributor, qualityContinuityCandidateTraceabilityContributor } from "../src/quality-continuity-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

function loaded(value, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: { artifactId, digest: sha256Digest(bytes), schema: "https://devrelay.dev/contracts/project-control-artifacts.schema.json", mediaType: "application/json", uri: `memory://qc/${artifactId}` } };
}
const result = (invocationId, outcome) => ({ apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId, status: "completed", outcome, outputs: {}, evidence: [], diagnostics: [] });

test("trusted QC contributors project exact candidate and approved artifacts in separate append-only scopes", async () => {
  const graph = createTraceabilityGraphService({ graphId: "devrelay/qc-trace", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [qualityContinuityCandidateTraceabilityContributor, qualityContinuityApprovedTraceabilityContributor] });
  const source = loaded(createProjectControlSnapshot({ projectId: "devrelay", lifecycle: { phase: "verification" } }), "CONTROL-INPUT");
  const snapshot = loaded(createProjectControlSnapshot({ projectId: "devrelay", lifecycle: { phase: "acceptance" }, sourceRefs: [{ id: "CONTROL-INPUT", digest: source.ref.digest }] }), "CONTROL-OUTPUT");
  const candidateInvocation = { invocationId: "QC-CANDIDATE", module: { id: "project-control", version: "0.1.0", operation: "project-snapshot" } };
  const prepared = await graph.prepare({ projectId: "devrelay", invocation: candidateInvocation, invocationFingerprint: canonicalJsonDigest(candidateInvocation), moduleResult: result(candidateInvocation.invocationId, "snapshot-projected"), loadedInputs: { source: [source] }, loadedOutputs: { snapshot: [snapshot] }, baseGraph: graph.captureBase() });
  const candidateMerge = await graph.mergePrepared(prepared);
  assert.equal(candidateMerge.snapshot.edges.some(({ scope, authority, kind }) => scope === "quality-continuity/candidate" && authority === "candidate" && kind === "derived-from"), true);

  const candidate = createQualityPolicyCandidate({ policyId: "QP", version: "1.0.0", rules: [{ id: "R", obligations: [{ id: "O", lane: "test", evidenceKinds: ["test/pass"] }] }] });
  const baseline = loaded(promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "QualityPolicyGate", decision: "approve", candidateDigest: candidate.candidateDigest } }), "QUALITY-BASELINE");
  const approvedInvocation = { invocationId: "QC-APPROVED", module: { id: "quality-policy-gate", version: "0.1.0", operation: "promote-baseline" } };
  const approved = await graph.prepare({ projectId: "devrelay", invocation: approvedInvocation, invocationFingerprint: canonicalJsonDigest(approvedInvocation), moduleResult: result(approvedInvocation.invocationId, "promoted"), loadedOutputs: { baseline: [baseline] }, baseGraph: graph.captureBase() });
  const approvedMerge = await graph.mergePrepared(approved);
  assert.equal(approvedMerge.snapshot.nodes.some(({ attributes }) => attributes?.artifact?.artifactId === "QUALITY-BASELINE"), true);
});

test("QC contributors reject adapter-authored authority and byte drift", async () => {
  const snapshot = loaded(createProjectControlSnapshot({ projectId: "devrelay", lifecycle: { phase: "verification" } }), "CONTROL");
  assert.equal(qualityContinuityCandidateTraceabilityContributor.match({ invocation: { module: { id: "provider-adapter", version: "0.1.0", operation: "project-snapshot" } }, loadedOutputs: { snapshot: [snapshot] } }), false);
  const drifted = { ...snapshot, bytes: Buffer.from(`${canonicalJson(snapshot.value)} `, "utf8") };
  await assert.rejects(() => qualityContinuityCandidateTraceabilityContributor.project({ invocation: { module: { id: "project-control", version: "0.1.0", operation: "project-snapshot" } }, loadedOutputs: { snapshot: [drifted] } }), /bytes or digest drifted/u);
});
