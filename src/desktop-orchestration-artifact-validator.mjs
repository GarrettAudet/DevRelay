import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI = "https://devrelay.dev/contracts/desktop-orchestration-artifacts.schema.json";
const validator = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/desktop-orchestration-artifacts.schema.json", import.meta.url), "utf8")));

export class DesktopOrchestrationArtifactValidationError extends Error {
  constructor(message) {
    super(`desktop orchestration artifact is invalid: ${message}`);
    this.name = "DesktopOrchestrationArtifactValidationError";
    this.code = "DR6150";
  }
}

const fail = (message) => { throw new DesktopOrchestrationArtifactValidationError(message); };
const digestField = Object.freeze({
  DesktopOrchestrationPlan: "planDigest",
  DesktopProjectMemoryBootstrapReceipt: "receiptDigest",
  DesktopTaskPlan: "planDigest",
  DesktopTaskReceipt: "receiptDigest",
  DesktopOperatorSnapshot: "snapshotDigest",
  AdversarialReviewRequirement: "requirementDigest",
  DesktopReviewReceipt: "receiptDigest",
  DesktopMergeReadiness: "readinessDigest",
  DesktopOrchestrationRecovery: "recoveryDigest",
  DesktopSessionConclusionCandidate: "conclusionDigest",
  DesktopChangeIntegrationRecord: "integrationDigest",
});

export function validateDesktopOrchestrationArtifact(value) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const field = digestField[value.kind];
  if (field) {
    const { [field]: digest, ...material } = value;
    if (digest !== canonicalJsonDigest(material)) fail(`${field} does not bind canonical content`);
  }
  if (value.kind === "DesktopOrchestrationPlan") {
    const ids = new Set(value.workItems.map(({ id }) => id));
    if (ids.size !== value.workItems.length) fail("work item identities repeat");
    for (const item of value.workItems) for (const dependency of item.dependencies) if (!ids.has(dependency)) fail(`dependency ${dependency} is unresolved`);
  }
  if (value.kind === "DesktopTaskPlan") {
    if (value.worktreeLease.attemptId !== value.attemptId || value.worktreeLease.runId !== value.runId || value.worktreeLease.workItemId !== value.workItemId) fail("task plan and worktree lease identities disagree");
    if (value.worktreeLease.revision !== value.startingRevision) fail("task plan and worktree revision disagree");
    if (value.promptArtifact.digest !== value.promptDigest) fail("task plan prompt digest disagrees with its artifact");
    if (canonicalJsonDigest(value.memoryContext) !== value.memoryContextDigest) fail("task plan memory context drifted");
  }
  if (value.kind === "DesktopMergeReadiness") {
    if ((value.outcome === "merge-ready") !== (value.blockers.length === 0 && value.conflictDisposition === "none")) fail("merge readiness outcome contradicts its blockers");
  }
  if (value.kind === "DesktopReviewReceipt") {
    if (value.implementerTaskId === value.reviewerTaskId) fail("review receipt records self-review");
    if (value.adversarial !== true) fail("Desktop review receipt must record adversarial review");
  }
  if (value.kind === "DesktopOrchestrationRecovery") {
    if ((value.outcome === "recovered") !== (value.uncertainWorkItemIds.length === 0)) fail("recovery outcome contradicts uncertain work");
  }
  if (value.kind === "DesktopChangeIntegrationRecord") {
    if ((value.outcome === "integrated") !== (value.conflicts.length === 0)) fail("integration outcome contradicts conflicts");
  }
  return value;
}
