import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/project-memory-artifacts.schema.json";
const validator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/project-memory-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export const PROJECT_MEMORY_ARTIFACT_CONTRACTS = Object.freeze({
  MemoryUpdateCandidate: Object.freeze({
    schema: "https://devrelay.dev/artifacts/memory-update-candidate/v1",
    mediaType: "application/vnd.devrelay.memory-update-candidate+json",
  }),
  ProjectMemoryBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-memory-baseline/v1",
    mediaType: "application/vnd.devrelay.project-memory-baseline+json",
  }),
  ProjectMemoryGateApproval: Object.freeze({
    schema: "https://devrelay.dev/evidence/project-memory-gate-approval/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-approval+json",
  }),
  ProjectMemoryGatePromotionProof: Object.freeze({
    schema: "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.project-memory-gate-promotion+json",
  }),
  MemoryProviderReceipt: Object.freeze({
    schema: "https://devrelay.dev/evidence/memory-provider-receipt/v1",
    mediaType: "application/vnd.devrelay.memory-provider-receipt+json",
  }),
  TraceabilityContextProjection: Object.freeze({
    schema: "https://devrelay.dev/artifacts/traceability-context-projection/v1",
    mediaType: "application/vnd.devrelay.traceability-context-projection+json",
  }),
  MemoryContextBundle: Object.freeze({
    schema: "https://devrelay.dev/artifacts/memory-context-bundle/v1",
    mediaType: "application/vnd.devrelay.memory-context-bundle+json",
  }),
  SessionConclusion: Object.freeze({
    schema: "https://devrelay.dev/artifacts/session-conclusion/v1",
    mediaType: "application/vnd.devrelay.session-conclusion+json",
  }),
  SynopsisProjectionReceipt: Object.freeze({
    schema: "https://devrelay.dev/evidence/synopsis-projection-receipt/v1",
    mediaType: "application/vnd.devrelay.synopsis-projection-receipt+json",
  }),
  ConcludeReceipt: Object.freeze({
    schema: "https://devrelay.dev/evidence/conclude-receipt/v1",
    mediaType: "application/vnd.devrelay.conclude-receipt+json",
  }),
  ProjectMemorySessionState: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-memory-session-state/v1",
    mediaType: "application/vnd.devrelay.project-memory-session-state+json",
  }),
});

const stableId = (value) =>
  ({
    MemoryUpdateCandidate: value.candidateId,
    ProjectMemoryBaseline: value.baselineId,
    ProjectMemoryGateApproval: value.approvalId,
    ProjectMemoryGatePromotionProof: value.proofId,
    MemoryProviderReceipt: value.receiptId,
    TraceabilityContextProjection: value.projectionId,
    MemoryContextBundle: value.bundleId,
    SessionConclusion: value.conclusionId,
    SynopsisProjectionReceipt: value.receiptId,
    ConcludeReceipt: value.receiptId,
    ProjectMemorySessionState: value.stateId,
  })[value.kind];

export class ProjectMemoryArtifactValidationError extends Error {
  constructor(message) {
    super(`project memory artifact is invalid: ${message}`);
    this.name = "ProjectMemoryArtifactValidationError";
    this.code = "DR5300";
  }
}

const fail = (message) => {
  throw new ProjectMemoryArtifactValidationError(message);
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

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function validateChange(change) {
  const hasTarget = typeof change.targetMemoryId === "string";
  const hasProposal = Boolean(change.proposedMemory);
  if (change.disposition === "add" && (!hasProposal || hasTarget)) {
    fail(`change ${change.changeId} add requires proposedMemory and forbids targetMemoryId`);
  }
  if (
    ["replace", "supersede"].includes(change.disposition) &&
    (!hasProposal || !hasTarget)
  ) {
    fail(`change ${change.changeId} ${change.disposition} requires targetMemoryId and proposedMemory`);
  }
  if (change.disposition === "retain" && (!hasTarget || hasProposal)) {
    fail(`change ${change.changeId} retain requires only targetMemoryId`);
  }
  if (
    change.disposition === "reject" &&
    (Number(hasTarget) + Number(hasProposal) !== 1)
  ) {
    fail(`change ${change.changeId} reject requires exactly one target or proposal`);
  }
}

function validateCandidate(value, context) {
  unique(value.changes, ({ changeId }) => changeId, "memory changes");
  for (const change of value.changes) validateChange(change);
  if (value.producerType === "worker" && !value.parentTaskId) {
    fail("worker memory candidate lacks parentTaskId");
  }
  if (value.producerType === "main" && value.parentTaskId) {
    fail("main memory candidate cannot declare parentTaskId");
  }
  if (context.currentBaselineRef && !sameRef(value.baseBaseline, context.currentBaselineRef)) {
    fail("memory candidate baseBaseline has drifted");
  }
  if (context.currentGraphCheckpoint && !sameRef(value.baseGraphCheckpoint, context.currentGraphCheckpoint)) {
    fail("memory candidate baseGraphCheckpoint has drifted");
  }
}

function validateBaseline(value) {
  unique(value.records, ({ id }) => id, "project memory records");
  const ids = new Set(value.records.map(({ id }) => id));
  for (const record of value.records) {
    for (const prior of record.supersedes ?? []) {
      if (!ids.has(prior)) fail(`memory record ${record.id} supersedes unknown ${prior}`);
      if (prior === record.id) fail(`memory record ${record.id} supersedes itself`);
    }
    if (record.status === "active" && record.authority === "validated-status") {
      if (record.domain && !["execution", "verification", "integration", "acceptance"].includes(record.domain)) {
        fail(`validated status record ${record.id} cannot activate qualitative domain ${record.domain}`);
      }
    }
  }
}

function validateApproval(value, context) {
  unique(value.decisions, ({ changeId }) => changeId, "memory approval decisions");
  if (!context.candidate) return;
  if (!sameRef(value.candidate, context.candidateRef)) {
    fail("memory approval does not bind the exact candidate");
  }
  if (!sameRef(value.baseBaseline, context.candidate.baseBaseline)) {
    fail("memory approval does not bind the candidate base baseline");
  }
  const expected = new Set(context.candidate.changes.map(({ changeId }) => changeId));
  const actual = new Set(value.decisions.map(({ changeId }) => changeId));
  if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
    fail("memory approval does not disposition every candidate change exactly once");
  }
}

function validateProviderReceipt(value) {
  unique(value.citations, ({ rank }) => rank, "provider citation ranks");
  const ranks = value.citations.map(({ rank }) => rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    fail("provider citation ranks must be contiguous from one");
  }
  if (
    value.operation === "retrieve" &&
    ["pass", "native-equivalent"].includes(value.outcome) &&
    value.citations.length === 0
  ) {
    fail("successful provider retrieval lacks citations");
  }
  if (value.outcome === "fail" && (value.diagnostics?.length ?? 0) === 0) {
    fail("failed provider receipt lacks diagnostics");
  }
}

function validateProjection(value) {
  unique(value.nodes, ({ id }) => id, "trace projection nodes");
  unique(value.edges, ({ id }) => id, "trace projection edges");
  const nodes = new Set(value.nodes.map(({ id }) => id));
  for (const edge of value.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      fail(`trace projection edge ${edge.id} references an omitted node`);
    }
  }
}

function validateContextBundle(value) {
  unique(value.items, ({ memoryId }) => memoryId, "context bundle items");
  for (let index = 1; index < value.items.length; index += 1) {
    const prior = value.items[index - 1];
    const current = value.items[index];
    if (current.authorityRank < prior.authorityRank) {
      fail("context bundle violates authority-before-recency ordering");
    }
    if (
      current.authorityRank === prior.authorityRank &&
      current.effectiveAt > prior.effectiveAt
    ) {
      fail("context bundle violates recency ordering within equal authority");
    }
  }
  if (value.freshness === "stale" && value.diagnostics.length === 0) {
    fail("stale context bundle lacks diagnostics");
  }
}

function validateConclusion(value) {
  if (value.producerType === "worker" && !value.parentTaskId) {
    fail("worker conclusion lacks parentTaskId");
  }
  if (value.producerType === "main" && value.parentTaskId) {
    fail("main conclusion cannot declare parentTaskId");
  }
  unique(value.pendingDecisions, (id) => id, "pending conclusion decisions");
}

function validateSynopsisReceipt(value, context) {
  unique(value.coverageIds, (id) => id, "synopsis coverage IDs");
  if (!context.baseline) return;
  const expected = context.baseline.records
    .filter(({ status }) => status === "active" || status === "retained")
    .map(({ id }) => id)
    .sort();
  const actual = [...value.coverageIds].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    fail("synopsis coverage does not include every active or retained memory record exactly once");
  }
}

function validateConcludeReceipt(value, context) {
  if (value.outcome === "blocked" && (value.diagnostics?.length ?? 0) === 0) {
    fail("blocked conclude receipt lacks diagnostics");
  }
  if (value.outcome === "concluded" && context.providerReceipt) {
    if (!sameRef(value.providerSyncReceipt, context.providerReceiptRef)) {
      fail("conclude receipt does not bind the exact provider synchronization receipt");
    }
    if (!["pass", "native-equivalent"].includes(context.providerReceipt.outcome)) {
      fail("conclude receipt claims completion without verified provider synchronization");
    }
  }
}

function validateSessionState(value) {
  if (value.status === "abandoned" && !value.abandonmentRationale) {
    fail("abandoned session state lacks rationale");
  }
  if (value.status !== "abandoned" && value.abandonmentRationale) {
    fail("non-abandoned session state contains abandonment rationale");
  }
}

export function withProjectMemoryContentDigest(value) {
  const { contentDigest: _contentDigest, ...material } = value;
  return Object.freeze({
    ...material,
    contentDigest: canonicalJsonDigest(material),
  });
}

export function validateProjectMemoryArtifact(value, context = {}) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const contract = PROJECT_MEMORY_ARTIFACT_CONTRACTS[value.kind];
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
  verifyContentDigest(value);
  if (value.kind === "MemoryUpdateCandidate") validateCandidate(value, context);
  if (value.kind === "ProjectMemoryBaseline") validateBaseline(value);
  if (value.kind === "ProjectMemoryGateApproval") validateApproval(value, context);
  if (value.kind === "MemoryProviderReceipt") validateProviderReceipt(value);
  if (value.kind === "TraceabilityContextProjection") validateProjection(value);
  if (value.kind === "MemoryContextBundle") validateContextBundle(value);
  if (value.kind === "SessionConclusion") validateConclusion(value);
  if (value.kind === "SynopsisProjectionReceipt") validateSynopsisReceipt(value, context);
  if (value.kind === "ConcludeReceipt") validateConcludeReceipt(value, context);
  if (value.kind === "ProjectMemorySessionState") validateSessionState(value);
  return value;
}
