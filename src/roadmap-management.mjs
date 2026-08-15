import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const FACTORS = Object.freeze([
  "strategicAlignment",
  "userValue",
  "urgency",
  "riskReduction",
  "effort",
  "dependencies",
  "confidence",
]);

export class RoadmapManagementError extends Error {
  constructor(message, code = "DR5210") {
    super(`roadmap management failed: ${message}`);
    this.name = "RoadmapManagementError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new RoadmapManagementError(message, code);
};

const immutable = (value) => {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
};

const withDigest = (value) => immutable({ ...value, contentDigest: canonicalJsonDigest(value) });
const normalizedText = (value) => value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
const rounded = (value) => Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;

function validateFactors(value, label) {
  if (!value || typeof value !== "object") fail(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...FACTORS].sort())) {
    fail(`${label} must contain exactly ${FACTORS.join(", ")}`);
  }
  for (const factor of FACTORS) {
    if (!Number.isFinite(value[factor]) || value[factor] < 0 || value[factor] > 1) {
      fail(`${label}.${factor} must be between zero and one`);
    }
  }
}

export function createRoadmapPriorityPolicy({ policyId, weights }) {
  if (typeof policyId !== "string" || !policyId) fail("priority policy requires policyId");
  validateFactors(weights, "weights");
  const total = FACTORS.reduce((sum, factor) => sum + weights[factor], 0);
  if (!(total > 0)) fail("priority weights must have a positive total");
  const normalizedWeights = Object.fromEntries(
    FACTORS.map((factor) => [factor, rounded(weights[factor] / total)]),
  );
  const material = { policyId, factors: [...FACTORS], weights: normalizedWeights };
  return immutable({ ...material, policyDigest: canonicalJsonDigest(material) });
}

export function evaluateRoadmapPriority({ policy, factors }) {
  if (!policy?.weights || !policy?.policyId) fail("priority evaluation requires a closed policy");
  validateFactors(policy.weights, "policy.weights");
  validateFactors(factors, "factors");
  const contributions = Object.fromEntries(
    FACTORS.map((factor) => [factor, rounded(policy.weights[factor] * factors[factor])]),
  );
  const weightedScore = rounded(
    FACTORS.reduce((sum, factor) => sum + contributions[factor], 0),
  );
  const scoreMaterial = { policyId: policy.policyId, factors, contributions, weightedScore };
  return immutable({
    policyId: policy.policyId,
    factors: structuredClone(factors),
    weightedScore,
    scoreDigest: canonicalJsonDigest(scoreMaterial),
  });
}

export function createRoadmapNotInitialized(projectId) {
  if (typeof projectId !== "string" || !projectId) fail("RoadmapNotInitialized requires projectId");
  const value = withDigest({
    apiVersion: API_VERSION,
    kind: "RoadmapNotInitialized",
    projectId,
    disposition: "not-initialized",
    nextOperation: "establish-baseline",
    readOnlyInspectionAllowed: true,
  });
  return validateRoadmapArtifact(value);
}

export function createRoadmapIntakeCandidate({ candidateId, title, purpose, requirementsBaseline, contextBindings }) {
  const value = withDigest({
    apiVersion: API_VERSION,
    kind: "RoadmapIntakeCandidate",
    candidateId,
    confirmedNetNew: true,
    title: title?.normalize("NFC").trim(),
    purpose: purpose?.normalize("NFC").trim(),
    requirementsBaseline: structuredClone(requirementsBaseline),
    contextBindings: structuredClone(contextBindings).sort((a, b) => a.role.localeCompare(b.role, "en")),
  });
  return validateRoadmapArtifact(value);
}

function nativeDisposition({ candidate, currentInitiatives, comparison = {} }) {
  const exact = currentInitiatives.find(
    ({ title, purpose }) =>
      normalizedText(title) === normalizedText(candidate.title) ||
      normalizedText(purpose) === normalizedText(candidate.purpose),
  );
  if (exact) {
    return { recommendation: "merge", mergeTargetId: exact.id, rationale: `The candidate duplicates approved roadmap initiative ${exact.id}.` };
  }
  if (comparison.alreadyCovered === true) {
    return { recommendation: "discard", rationale: "Exact current requirements, architecture, contracts, work, or accepted evidence already cover the candidate purpose." };
  }
  if (comparison.blockingConflict === true || comparison.closureConfidence < 0.99) {
    return { recommendation: "defer", rationale: "The candidate has a blocking conflict or has not reached mandatory 0.99 requirements closure." };
  }
  return { recommendation: "keep", rationale: "The requirements-closed candidate is net-new, non-conflicting, and not already covered by exact current project state." };
}

function initiativeFromCandidate({ candidate, priority, disposition }) {
  const id = `RI-${canonicalJsonDigest({
    candidateId: candidate.candidateId,
    title: candidate.title,
    recommendation: disposition.recommendation,
    mergeTargetId: disposition.mergeTargetId ?? null,
  }).slice(7, 23).toUpperCase()}`;
  const status = { keep: "kept", defer: "deferred", merge: "merged", discard: "discarded" }[disposition.recommendation];
  return {
    id,
    title: candidate.title,
    purpose: candidate.purpose,
    status,
    recommendation: disposition.recommendation,
    rationale: disposition.rationale,
    priority,
    requirementsBaseline: structuredClone(candidate.requirementsBaseline),
    ...(disposition.mergeTargetId ? { mergeTargetId: disposition.mergeTargetId } : {}),
    sourceRefs: structuredClone(candidate.contextBindings),
  };
}

export function renderRoadmapMarkdown(baseline) {
  const initiatives = [...baseline.initiatives].sort((a, b) =>
    b.priority.weightedScore - a.priority.weightedScore || a.id.localeCompare(b.id, "en"),
  );
  const lines = [
    "# Roadmap",
    "",
    `Baseline: ${baseline.baselineId} ${baseline.version}`,
    "",
  ];
  if (initiatives.length === 0) lines.push("No approved roadmap initiatives.", "");
  for (const item of initiatives) {
    lines.push(
      `## ${item.title}`,
      "",
      `- ID: ${item.id}`,
      `- Status: ${item.status}`,
      `- Recommendation: ${item.recommendation}`,
      `- Priority: ${item.priority.weightedScore.toFixed(6)}`,
      `- Purpose: ${item.purpose}`,
      `- Rationale: ${item.rationale}`,
      ...(item.mergeTargetId ? [`- Merge target: ${item.mergeTargetId}`] : []),
      "",
    );
  }
  return `${lines.join("\n").normalize("NFC").replace(/\r\n?/gu, "\n").trimEnd()}\n`;
}

function buildDraft({ operation, currentBaseline, initiatives, priorityPolicyRef, sourceRefs }) {
  const material = {
    apiVersion: API_VERSION,
    kind: "RoadmapDraft",
    draftId: `RMD-${canonicalJsonDigest({ operation, initiatives }).slice(7, 23).toUpperCase()}`,
    operation,
    baseDisposition: currentBaseline ? "RoadmapBaseline" : "RoadmapNotInitialized",
    initiatives,
    priorityPolicy: structuredClone(priorityPolicyRef),
    sourceRefs: structuredClone(sourceRefs),
  };
  return validateRoadmapArtifact(withDigest(material));
}

function buildChangeSet({ operation, currentBaselineRef, draft, projection }) {
  const changes = draft.initiatives.map((initiative) => ({
    operation: currentBaselineRef ? "upsert" : "add",
    initiative,
  }));
  const material = {
    apiVersion: API_VERSION,
    kind: "RoadmapChangeSetDraft",
    changeSetId: `RMCS-${canonicalJsonDigest({ operation, changes }).slice(7, 23).toUpperCase()}`,
    operation,
    currentBaseline: currentBaselineRef ? structuredClone(currentBaselineRef) : null,
    changes,
    projection,
    sourceRefs: structuredClone(draft.sourceRefs),
  };
  return validateRoadmapArtifact(withDigest(material));
}

export function createRoadmapManagementRuntime({ proposer } = {}) {
  const configuredProposer = proposer ?? {
    id: "native-structured-roadmap-proposer",
    version: "0.1.0",
    propose: async (request) => request.nativeProposal,
  };
  return Object.freeze({
    async execute(request) {
      const allowed = new Set(["triage-candidate", "review-roadmap", "reprioritize"]);
      if (!allowed.has(request?.operation)) fail("operation is not supported");
      if (!request.priorityPolicy || !request.priorityPolicyRef) fail("closed priority policy and reference are required");
      const currentInitiatives = request.currentBaseline?.initiatives ?? [];
      let proposedInitiatives;
      if (request.operation === "triage-candidate") {
        validateRoadmapArtifact(request.intakeCandidate);
        const disposition = nativeDisposition({ candidate: request.intakeCandidate, currentInitiatives, comparison: request.comparison });
        const priority = evaluateRoadmapPriority({ policy: request.priorityPolicy, factors: request.factors });
        proposedInitiatives = [...currentInitiatives, initiativeFromCandidate({ candidate: request.intakeCandidate, priority, disposition })];
      } else {
        proposedInitiatives = currentInitiatives.map((initiative) => ({
          ...structuredClone(initiative),
          priority: evaluateRoadmapPriority({
            policy: request.priorityPolicy,
            factors: request.factorsByInitiative?.[initiative.id] ?? initiative.priority.factors,
          }),
        }));
      }
      proposedInitiatives.sort((a, b) => b.priority.weightedScore - a.priority.weightedScore || a.id.localeCompare(b.id, "en"));
      const nativeProposal = { operation: request.operation, initiatives: proposedInitiatives };
      const { checkpoints: _checkpoints, ...checkpointRequest } = request;
      const checkpointKey = `roadmap:${canonicalJsonDigest({ request: checkpointRequest, proposer: { id: configuredProposer.id, version: configuredProposer.version } })}`;
      const prior = await request.checkpoints?.get(checkpointKey);
      let proposal = prior?.proposal;
      let replayed = Boolean(prior);
      if (!proposal) {
        proposal = await configuredProposer.propose({ ...request, nativeProposal: immutable(nativeProposal) });
        const checkpoint = immutable({ checkpointKey, proposer: { id: configuredProposer.id, version: configuredProposer.version }, proposal, checkpointDigest: canonicalJsonDigest({ checkpointKey, proposal }) });
        await request.checkpoints?.put(checkpointKey, checkpoint);
      }
      if (!proposal || !Array.isArray(proposal.initiatives)) fail("proposer did not return initiatives");
      const draft = buildDraft({ operation: request.operation, currentBaseline: request.currentBaseline, initiatives: proposal.initiatives, priorityPolicyRef: request.priorityPolicyRef, sourceRefs: request.sourceRefs });
      const projectionBaseline = { baselineId: request.currentBaseline?.baselineId ?? "ROADMAP-PENDING", version: request.currentBaseline?.version ?? "0.1.0", initiatives: draft.initiatives };
      const changeSet = buildChangeSet({ operation: request.operation, currentBaselineRef: request.currentBaselineRef, draft, projection: renderRoadmapMarkdown(projectionBaseline) });
      return immutable({ outcome: "decomposed", replayed, proposer: { id: configuredProposer.id, version: configuredProposer.version }, draft, changeSet, checkpointKey });
    },
  });
}

export const ROADMAP_PRIORITY_FACTORS = FACTORS;
