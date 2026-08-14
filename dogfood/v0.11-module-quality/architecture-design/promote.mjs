import fs from "node:fs";
import path from "node:path";

import { canonicalJsonDigest } from "../../../src/content-digest.mjs";
import { validateArchitectureGatePromotion } from "../../../src/architecture-gate.mjs";

const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const pointer = (ref) => ({
  artifactId: ref.artifactId,
  digest: ref.digest,
});

function readIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function promoteReleaseHardeningArchitecture(context) {
  const {
    root,
    dir,
    read,
    fileRef,
    artifactRef,
    sha256,
    writeJson,
    registry,
    invocation,
    artifacts,
    checkpoints,
    calls,
    callsBeforeReplay,
    checkpointValues,
    changeSet,
    changeSetRef,
    requirementsRef,
    projectOverviewRef,
    projectContextRef,
    repositorySnapshotRef,
    architectureBaseline,
    architectureBaselineRef,
    conformanceRef,
    conformanceBytes,
    proofBytes,
    gateBytes,
  } = context;

  const ownerApprovalBytes = read(
    "dogfood/v0.11-module-quality/architecture-design/architecture-gate-owner-approval-v2.json",
  );
  const ownerApproval = JSON.parse(ownerApprovalBytes);
  const ownerApprovalRef = fileRef(
    ownerApproval.approvalId,
    "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1",
    "application/vnd.devrelay.architecture-gate-owner-approval+json",
    "architecture-gate-owner-approval-v2.json",
    ownerApprovalBytes,
  );
  const gateReviewRef = fileRef(
    "architecture-gate-review-v0.11-module-quality-v2",
    "https://devrelay.dev/evidence/architecture-gate-review/v1",
    "text/markdown",
    "architecture-gate-candidate.md",
    gateBytes,
  );
  const executionProofRef = fileRef(
    "architecture-dogfood-execution-proof-v0.11-module-quality-v2",
    "https://devrelay.dev/evidence/architecture-dogfood-execution-proof/v1",
    "application/vnd.devrelay.architecture-dogfood-execution-proof+json",
    "runtime-execution-proof.json",
    proofBytes,
  );

  const checkpointReplay = await registry.verifyCheckpointedExecution(
    invocation,
    { artifacts, checkpoints },
  );
  if (calls.length !== callsBeforeReplay) {
    throw new Error("ArchitectureGate checkpoint verification invoked an adapter");
  }

  const promotedSections = structuredClone(changeSet.sections);
  for (const decision of promotedSections.decisionRecords.content.decisions) {
    if (decision.status === "proposed") decision.status = "accepted";
  }
  const promotedBaseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureBaseline",
    baselineId: "architecture-baseline-devrelay-v1-v0.11-module-quality-002",
    approvedDraft: changeSetRef,
    requirementsBaseline: requirementsRef,
    projectOverviewBaseline: projectOverviewRef,
    projectContext: projectContextRef,
    repositorySnapshot: repositorySnapshotRef,
    sections: promotedSections,
    approvalPolicyVersion: ownerApproval.policyVersion,
    approvalEvidence: [
      gateReviewRef,
      conformanceRef,
      executionProofRef,
      ownerApprovalRef,
    ],
    sourceRefs: structuredClone(changeSet.sourceRefs),
  };
  const promotedBaselineBytes = jsonBytes(promotedBaseline);
  const promotedBaselineRef = fileRef(
    promotedBaseline.baselineId,
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
    "architecture-baseline.json",
    promotedBaselineBytes,
  );
  const evidenceById = new Map([
    [gateReviewRef.artifactId, { ref: gateReviewRef, bytes: gateBytes }],
    [conformanceRef.artifactId, { ref: conformanceRef, bytes: conformanceBytes }],
    [executionProofRef.artifactId, {
      ref: executionProofRef,
      bytes: proofBytes,
    }],
  ]);
  const gatePromotion = await validateArchitectureGatePromotion({
    checkpointReplay,
    ownerApproval,
    ownerApprovalRef,
    ownerApprovalBytes,
    baseline: promotedBaseline,
    baselineRef: promotedBaselineRef,
    baselineBytes: promotedBaselineBytes,
    evidenceResolver: async (ref) => {
      const evidence = evidenceById.get(ref.artifactId);
      if (!evidence) throw new Error(`missing Gate evidence ${ref.artifactId}`);
      return evidence;
    },
  });

  const projectBaselineRef = {
    ...promotedBaselineRef,
    uri: "file:///C:/repos/DevRelay/project/architecture-baseline.json",
  };
  const promotedProjectState = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectArchitectureState",
    stateId: "project-architecture-state-devrelay-v0.11-module-quality-approved-v2",
    state: "baselined",
    projectLifecycle: "existing",
    projectContext: projectContextRef,
    requirementsBaseline: requirementsRef,
    repositorySnapshot: repositorySnapshotRef,
    architectureBaseline: projectBaselineRef,
    projectOverviewBaseline: projectOverviewRef,
  };
  const promotedProjectStateBytes = jsonBytes(promotedProjectState);
  const promotedProjectStateRef = artifactRef(
    promotedProjectState.stateId,
    "https://devrelay.dev/artifacts/project-architecture-state/v1",
    "application/vnd.devrelay.project-architecture-state+json",
    sha256(promotedProjectStateBytes),
    "file:///C:/repos/DevRelay/project/project-architecture-state.json",
  );
  const requiredContractInterfaces = promotedSections.interfaceIntent.content.interfaces
    .filter(({ contractGeneration }) => contractGeneration?.required === true)
    .map(({ id }) => id)
    .sort();
  const expectedRequiredInterfaces = [
    ...new Set([
      ...architectureBaseline.sections.interfaceIntent.content.interfaces
        .filter(({ contractGeneration }) => contractGeneration?.required === true)
        .map(({ id }) => id),
      "IF-MQ-EVIDENCE-SEAL",
      "IF-MQ-EXECUTION-RECEIPT",
      "IF-MQ-GODOT-MCP",
      "IF-MQ-GODOT-VERIFY",
      "IF-MQ-METRICS",
      "IF-MQ-PROVIDER-TOOLCHAIN",
      "IF-MQ-REQUIREMENTS-STRATEGY",
      "IF-MQ-TRACE-QUERY",
    ]),
  ].sort();
  if (
    JSON.stringify(requiredContractInterfaces) !==
    JSON.stringify(expectedRequiredInterfaces)
  ) {
    throw new Error("Approved architecture does not expose the exact required contract interface set");
  }

  const promotionId = "architecture-promotion-v0.11-module-quality-v2";
  const pendingPromotion = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitecturePromotionJournal",
    promotionId,
    state: "prepared",
    previous: {
      architectureBaseline: pointer(architectureBaselineRef),
    },
    next: {
      architectureBaseline: pointer(projectBaselineRef),
      projectArchitectureState: pointer(promotedProjectStateRef),
    },
    candidate: pointer(changeSetRef),
    approval: pointer(ownerApprovalRef),
  };

  const projectDir = path.join(root, "project");
  const historyDir = path.join(
    projectDir,
    "history",
    "architecture",
    architectureBaselineRef.artifactId,
  );
  fs.mkdirSync(historyDir, { recursive: true });
  const previousBaselineBytes = read(
    "project/history/architecture/architecture-baseline-devrelay-v1-v0.10-release-hardening-001/architecture-baseline.json",
  );
  if (sha256(previousBaselineBytes) !== architectureBaselineRef.digest) {
    throw new Error("Immutable previous architecture baseline digest changed");
  }
  fs.writeFileSync(
    path.join(historyDir, "architecture-baseline.json"),
    previousBaselineBytes,
  );
  const historyStatePath = path.join(historyDir, "project-architecture-state.json");
  if (!readIfPresent(historyStatePath)) {
    const currentStateBytes = readIfPresent(
      path.join(projectDir, "project-architecture-state.json"),
    );
    if (currentStateBytes) fs.writeFileSync(historyStatePath, currentStateBytes);
  }
  for (const journalName of [
    "architecture-promotion.pending.json",
    "architecture-promotion.commit.json",
  ]) {
    const historyJournalPath = path.join(historyDir, journalName);
    if (readIfPresent(historyJournalPath)) continue;
    const currentJournalBytes = readIfPresent(path.join(projectDir, journalName));
    if (currentJournalBytes) fs.writeFileSync(historyJournalPath, currentJournalBytes);
  }

  fs.writeFileSync(
    path.join(projectDir, "architecture-promotion.pending.json"),
    jsonBytes(pendingPromotion),
  );
  fs.writeFileSync(path.join(dir, "architecture-baseline.json"), promotedBaselineBytes);
  fs.writeFileSync(
    path.join(projectDir, "architecture-baseline.json"),
    Buffer.from(gatePromotion.commitPayload.baseline.bytesBase64, "base64"),
  );
  fs.writeFileSync(
    path.join(projectDir, "project-architecture-state.json"),
    promotedProjectStateBytes,
  );
  fs.writeFileSync(
    path.join(projectDir, `${ownerApproval.approvalId}.json`),
    ownerApprovalBytes,
  );

  const promotionProof = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureGatePromotionProof",
    proofId: promotionId,
    status: "pass",
    operation: gatePromotion.operation,
    candidate: pointer(changeSetRef),
    gateReview: pointer(gateReviewRef),
    conformanceProof: pointer(conformanceRef),
    executionProof: pointer(executionProofRef),
    ownerApproval: pointer(ownerApprovalRef),
    previousArchitectureBaseline: pointer(architectureBaselineRef),
    promotedArchitectureBaseline: pointer(projectBaselineRef),
    promotedProjectArchitectureState: pointer(promotedProjectStateRef),
    checkpointReplay: {
      producer: checkpointReplay.producer,
      checkpointCount: checkpointValues.size,
      adapterCallsOnVerification: 0,
    },
    commitPayloadDigest: canonicalJsonDigest(gatePromotion.commitPayload),
    requiredContractInterfaces,
    contractGenerationProgressionAllowed: true,
    workBreakdownProgressionAllowed: false,
  };
  const promotionProofBytes = writeJson(
    "architecture-gate-promotion-proof.json",
    promotionProof,
  );
  const promotionProofRef = fileRef(
    promotionProof.proofId,
    "https://devrelay.dev/evidence/architecture-gate-promotion-proof/v1",
    "application/vnd.devrelay.architecture-gate-promotion-proof+json",
    "architecture-gate-promotion-proof.json",
    promotionProofBytes,
  );
  const committedPromotion = {
    ...pendingPromotion,
    state: "committed",
    proof: pointer(promotionProofRef),
  };
  fs.writeFileSync(
    path.join(projectDir, "architecture-promotion.commit.json"),
    jsonBytes(committedPromotion),
  );
  fs.writeFileSync(
    path.join(projectDir, "architecture-promotion.pending.json"),
    jsonBytes(committedPromotion),
  );

  return {
    status: "ARCHITECTURE_GATE_PROMOTED",
    operation: "design-change",
    adapterCalls: calls,
    checkpointCount: checkpointValues.size,
    replayAdapterCalls: 0,
    architectureChangeSetDigest: changeSetRef.digest,
    architectureGateReviewDigest: sha256(gateBytes),
    structurizrConformanceProofDigest: conformanceRef.digest,
    ownerApprovalDigest: ownerApprovalRef.digest,
    architectureBaselineDigest: projectBaselineRef.digest,
    promotionProofDigest: promotionProofRef.digest,
    requiredContractInterfaces,
    contractGenerationProgressionAllowed: true,
    workBreakdownProgressionAllowed: false,
  };
}
