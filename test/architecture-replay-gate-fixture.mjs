import { sha256Digest } from "../src/content-digest.mjs";

// Synthetic approval evidence for runtime/Gate tests, never owner acceptance.
export function architectureReplayGateRequest(checkpointReplay) {
  const candidateEntry = Object.values(checkpointReplay.loadedOutputs)[0][0];
  const candidate = candidateEntry.value;
  const bytesById = new Map();
  function add(artifactId, schema, mediaType, bytes) {
    bytesById.set(artifactId, bytes);
    return { artifactId, schema, mediaType, digest: sha256Digest(bytes),
      uri: `artifact://architecture-replay-gate/${artifactId}` };
  }
  function document(value, artifactId, name, category = "artifacts") {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    return { value, bytes, ref: add(artifactId,
      `https://devrelay.dev/${category}/${name}/v1`,
      `application/vnd.devrelay.${name}+json`, bytes) };
  }
  const gateReview = add("resume-gate-review",
    "https://devrelay.dev/evidence/architecture-gate-review/v1", "text/markdown",
    Buffer.from("Synthetic exact resumed architecture review.\n", "utf8"));
  const conformance = add("resume-structurizr-conformance",
    "https://devrelay.dev/evidence/structurizr-conformance-proof/v1",
    "application/vnd.devrelay.structurizr-conformance-proof+json",
    Buffer.from('{"status":"pass"}\n', "utf8"));
  const approval = document({
    apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureGateOwnerApproval",
    approvalId: "resume-owner-approval", authority: "project-owner", decision: "approve",
    policyVersion: "architecture-gate/0.1.0", candidate: candidateEntry.ref,
    gateReview, requiredEvidence: [conformance], repositoryRevision: "fixture-commit",
  }, "resume-owner-approval", "architecture-gate-owner-approval", "evidence");
  const sections = structuredClone(candidate.sections);
  for (const decision of sections.decisionRecords.content.decisions) {
    if (decision.status === "proposed") decision.status = "accepted";
  }
  const baseline = document({
    apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureBaseline",
    baselineId: "resume-approved-baseline", approvedDraft: candidateEntry.ref,
    requirementsBaseline: candidate.targetRequirementsBaseline ?? candidate.requirementsBaseline,
    projectOverviewBaseline: candidate.targetProjectOverviewBaseline ?? candidate.projectOverviewBaseline,
    projectContext: candidate.projectContext,
    ...(candidate.repositorySnapshot ? { repositorySnapshot: candidate.repositorySnapshot } : {}),
    sections, approvalPolicyVersion: approval.value.policyVersion,
    approvalEvidence: [gateReview, conformance, approval.ref], sourceRefs: candidate.sourceRefs,
  }, "resume-approved-baseline", "architecture-baseline");
  return {
    checkpointReplay, ownerApproval: approval.value, ownerApprovalBytes: approval.bytes,
    ownerApprovalRef: approval.ref, baseline: baseline.value, baselineBytes: baseline.bytes,
    baselineRef: baseline.ref,
    evidenceResolver: async ref => ({ ref, bytes: bytesById.get(ref.artifactId) }),
  };
}
