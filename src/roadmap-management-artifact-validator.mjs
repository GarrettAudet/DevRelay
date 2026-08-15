import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/roadmap-management-artifacts.schema.json";
const validator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/roadmap-management-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export const ROADMAP_ARTIFACT_CONTRACTS = Object.freeze({
  RoadmapIntakeCandidate: Object.freeze({ schema: "https://devrelay.dev/artifacts/roadmap-intake-candidate/v1", mediaType: "application/vnd.devrelay.roadmap-intake-candidate+json" }),
  RoadmapDraft: Object.freeze({ schema: "https://devrelay.dev/artifacts/roadmap-draft/v1", mediaType: "application/vnd.devrelay.roadmap-draft+json" }),
  RoadmapChangeSetDraft: Object.freeze({ schema: "https://devrelay.dev/artifacts/roadmap-change-set-draft/v1", mediaType: "application/vnd.devrelay.roadmap-change-set-draft+json" }),
  RoadmapBaseline: Object.freeze({ schema: "https://devrelay.dev/artifacts/roadmap-baseline/v1", mediaType: "application/vnd.devrelay.roadmap-baseline+json" }),
  RoadmapNotInitialized: Object.freeze({ schema: "https://devrelay.dev/artifacts/roadmap-not-initialized/v1", mediaType: "application/vnd.devrelay.roadmap-not-initialized+json" }),
  RoadmapGateApproval: Object.freeze({ schema: "https://devrelay.dev/evidence/roadmap-gate-approval/v1", mediaType: "application/vnd.devrelay.roadmap-gate-approval+json" }),
  RoadmapGatePromotionProof: Object.freeze({ schema: "https://devrelay.dev/evidence/roadmap-gate-promotion/v1", mediaType: "application/vnd.devrelay.roadmap-gate-promotion+json" }),
  SessionContextSnapshot: Object.freeze({ schema: "https://devrelay.dev/artifacts/session-context-snapshot/v1", mediaType: "application/vnd.devrelay.session-context-snapshot+json" }),
  SessionContextReceipt: Object.freeze({ schema: "https://devrelay.dev/evidence/session-context-receipt/v1", mediaType: "application/vnd.devrelay.session-context-receipt+json" }),
});

const stableId = (value) => ({
  RoadmapIntakeCandidate: value.candidateId,
  RoadmapDraft: value.draftId,
  RoadmapChangeSetDraft: value.changeSetId,
  RoadmapBaseline: value.baselineId,
  RoadmapNotInitialized: `roadmap-not-initialized-${value.projectId}`,
  RoadmapGateApproval: value.approvalId,
  RoadmapGatePromotionProof: value.proofId,
  SessionContextSnapshot: value.snapshotId,
  SessionContextReceipt: value.receiptId,
})[value.kind];

export class RoadmapArtifactValidationError extends Error {
  constructor(message) {
    super(`roadmap artifact is invalid: ${message}`);
    this.name = "RoadmapArtifactValidationError";
    this.code = "DR5200";
  }
}

const fail = (message) => {
  throw new RoadmapArtifactValidationError(message);
};

function unique(values, key, label) {
  const seen = new Set();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) fail(`${label} repeats ${identity}`);
    seen.add(identity);
  }
}

function verifyContentDigest(value) {
  const { contentDigest, ...material } = value;
  if (contentDigest !== canonicalJsonDigest(material)) {
    fail(`${value.kind} contentDigest does not bind canonical content`);
  }
}

export function validateRoadmapArtifact(value, context = {}) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const contract = ROADMAP_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`unsupported kind ${value.kind}`);
  if (context.ref) {
    if (
      context.ref.artifactId !== stableId(value) ||
      context.ref.schema !== contract.schema ||
      context.ref.mediaType !== contract.mediaType
    ) {
      fail(`${value.kind} ArtifactRef does not identify its published contract`);
    }
  }
  if ("contentDigest" in value) verifyContentDigest(value);
  if (Array.isArray(value.initiatives)) {
    unique(value.initiatives, ({ id }) => id, `${value.kind} initiatives`);
    for (const initiative of value.initiatives) {
      if (initiative.recommendation === "merge" && !initiative.mergeTargetId) {
        fail(`initiative ${initiative.id} recommends merge without mergeTargetId`);
      }
      if (initiative.recommendation !== "merge" && initiative.mergeTargetId) {
        fail(`initiative ${initiative.id} has mergeTargetId without merge recommendation`);
      }
    }
  }
  if (value.kind === "SessionContextSnapshot") {
    unique(value.bindings, ({ role }) => role, "session bindings");
    const required = ["project-overview", "project-overview-projection", "lifecycle-status"];
    const roles = new Set(value.bindings.map(({ role }) => role));
    for (const role of required) if (!roles.has(role)) fail(`session snapshot lacks ${role}`);
    if (value.roadmapDisposition === "initialized" && (!roles.has("roadmap") || !roles.has("roadmap-projection"))) {
      fail("initialized session snapshot lacks roadmap baseline or projection binding");
    }
    if (value.roadmapDisposition === "RoadmapNotInitialized" && (roles.has("roadmap") || roles.has("roadmap-projection"))) {
      fail("RoadmapNotInitialized snapshot contains roadmap context");
    }
  }
  if (value.kind === "SessionContextReceipt") {
    const passes = value.outcome === "pass" || value.outcome === "RoadmapNotInitialized";
    if (value.moduleExecutionAllowed !== passes) {
      fail("session receipt execution decision contradicts its outcome");
    }
    if (value.outcome === "pass" && value.roadmapDisposition !== "initialized") {
      fail("passing session receipt must bind initialized roadmap context");
    }
    if (value.outcome === "RoadmapNotInitialized" && value.roadmapDisposition !== "RoadmapNotInitialized") {
      fail("RoadmapNotInitialized receipt contradicts its roadmap disposition");
    }
    if (passes) {
      unique(value.validatedBindings, ({ role }) => role, "validated session bindings");
      const roles = new Set(value.validatedBindings.map(({ role }) => role));
      for (const role of ["project-overview", "project-overview-projection", "lifecycle-status"]) {
        if (!roles.has(role)) fail(`session receipt lacks validated ${role}`);
      }
      if (value.outcome === "pass" && (!roles.has("roadmap") || !roles.has("roadmap-projection"))) {
        fail("passing session receipt lacks validated roadmap baseline or projection");
      }
    }
    if (value.outcome === "fail" && (!value.diagnostics || value.diagnostics.length === 0)) {
      fail("failed session receipt lacks diagnostics");
    }
  }
  return value;
}
