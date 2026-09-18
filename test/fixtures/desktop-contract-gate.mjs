import { canonicalJsonDigest } from "../../src/content-digest.mjs";

// Synthetic approval for host integration tests, never human release acceptance.
export function materializeContractGateSubmission(fx, execution) {
  const save = (id, value, schema, mediaType) => {
    const file = fx.json(`contract-gate/${id}.json`, value);
    return { path: file.path, ref: { artifactId: id, schema, mediaType, digest: file.digest, uri: `fixture://contract-gate/${id}` } };
  };
  const review = save("contract-review-fixture", { fixtureOnly: true, candidate: execution.candidateRef, decision: "approve" },
    "https://devrelay.dev/evidence/contract-gate-review/v1", "application/json");
  const approval = save("CGA-HOST-FIXTURE", { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGateApproval", approvalId: "CGA-HOST-FIXTURE",
    authority: "project-owner", decision: "approve", policyVersion: "contract-gate/0.1.0", candidate: execution.candidateRef,
    breakingChangeApproved: false, requiredEvidence: [review.ref] }, "https://devrelay.dev/evidence/contract-gate-approval/v1", "application/vnd.devrelay.contract-gate-approval+json");
  const baseline = save("CB-HOST-FIXTURE", { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractBaseline", baselineId: "CB-HOST-FIXTURE", version: "1.0.0",
    approvedCandidate: execution.candidateRef,
    architectureBaseline: execution.candidate.inputBindings.find(entry => entry.role === "architecture-baseline").artifact,
    projectOverviewBaseline: execution.candidate.inputBindings.find(entry => entry.role === "project-overview-baseline").artifact,
    contracts: execution.candidate.contracts, contractsDigest: canonicalJsonDigest(execution.candidate.contracts),
    approvalEvidence: [approval.ref], sourceRefs: execution.candidate.sourceRefs }, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json");
  return fx.json("contract-gate/submission.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopContractGateSubmission", approval, baseline, artifacts: [review] });
}
