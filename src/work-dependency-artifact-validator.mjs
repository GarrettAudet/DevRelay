import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/work-dependency-analysis-artifacts.schema.json";
const artifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL(
        "../contracts/work-dependency-analysis-artifacts.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

export const WORK_DEPENDENCY_ARTIFACT_CONTRACTS = Object.freeze({
  ProjectWorkDependencyState: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-work-dependency-state/v1",
    mediaType: "application/vnd.devrelay.project-work-dependency-state+json",
  }),
  ContextSliceSet: Object.freeze({
    schema: "https://devrelay.dev/artifacts/context-slice-set/v1",
    mediaType: "application/vnd.devrelay.context-slice-set+json",
  }),
  OpaPolicyBundle: Object.freeze({
    schema: "https://devrelay.dev/artifacts/opa-policy-bundle/v1",
    mediaType: "application/vnd.devrelay.opa-policy-bundle+json",
  }),
  WorkBreakdownAnalysisSnapshot: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-breakdown-analysis-snapshot/v1",
    mediaType:
      "application/vnd.devrelay.work-breakdown-analysis-snapshot+json",
  }),
  DependencyProposal: Object.freeze({
    schema: "https://devrelay.dev/artifacts/dependency-proposal/v1",
    mediaType: "application/vnd.devrelay.dependency-proposal+json",
  }),
  WorkDependencyGraphMechanicsResult: Object.freeze({
    schema:
      "https://devrelay.dev/artifacts/work-dependency-graph-mechanics-result/v1",
    mediaType:
      "application/vnd.devrelay.work-dependency-graph-mechanics-result+json",
  }),
  OpaPolicyDecisionSet: Object.freeze({
    schema: "https://devrelay.dev/artifacts/opa-policy-decision-set/v1",
    mediaType: "application/vnd.devrelay.opa-policy-decision-set+json",
  }),
  WorkDependencyConsistencyReview: Object.freeze({
    schema:
      "https://devrelay.dev/artifacts/work-dependency-consistency-review/v1",
    mediaType:
      "application/vnd.devrelay.work-dependency-consistency-review+json",
  }),
  WorkDependencyCandidate: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-dependency-candidate/v1",
    mediaType: "application/vnd.devrelay.work-dependency-candidate+json",
  }),
  WorkDependencyBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
    mediaType: "application/vnd.devrelay.work-dependency-baseline+json",
  }),
});

export class WorkDependencyArtifactValidationError extends Error {
  constructor(message) {
    super(`work dependency artifact is invalid: ${message}`);
    this.name = "WorkDependencyArtifactValidationError";
    this.code = "DR3040";
  }
}

function fail(message) {
  throw new WorkDependencyArtifactValidationError(message);
}

function stableId(value) {
  return {
    ProjectWorkDependencyState: value.stateId,
    ContextSliceSet: value.sliceSetId,
    OpaPolicyBundle: value.policyId,
    WorkBreakdownAnalysisSnapshot: value.snapshotId,
    DependencyProposal: value.proposalId,
    WorkDependencyConsistencyReview: value.reviewId,
    WorkDependencyCandidate: value.candidateId,
    WorkDependencyBaseline: value.baselineId,
  }[value.kind];
}

function unique(values, keyOf, label) {
  const seen = new Set();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) fail(`${label} repeats ${key}`);
    seen.add(key);
  }
}

function validateGraphDigest(value) {
  if (
    value.graphDigest !==
    canonicalJsonDigest({ nodes: value.nodes, edges: value.edges })
  ) {
    fail(`${value.kind} graphDigest does not bind its canonical graph`);
  }
}

function validateGraph(value) {
  validateGraphDigest(value);
  unique(value.nodes, (id) => id, `${value.kind} nodes`);
  unique(
    value.edges,
    (edge) => `${edge.prerequisiteId}\u0000${edge.dependentId}`,
    `${value.kind} edges`,
  );
}

function validateStaticDag(value) {
  validateGraph(value);
  const sortedNodes = [...value.nodes].sort();
  if (canonicalJsonDigest(sortedNodes) !== canonicalJsonDigest(value.nodes)) {
    fail(`${value.kind} nodes must use deterministic lexical order`);
  }
  const edgeKeys = value.edges.map(
    ({ prerequisiteId, dependentId, id }) =>
      `${prerequisiteId}\u0000${dependentId}\u0000${id}`,
  );
  if (canonicalJsonDigest([...edgeKeys].sort()) !== canonicalJsonDigest(edgeKeys)) {
    fail(`${value.kind} edges must use deterministic endpoint order`);
  }
  if (
    value.topologicalOrder.length !== value.nodes.length ||
    new Set(value.topologicalOrder).size !== value.nodes.length ||
    canonicalJsonDigest([...value.topologicalOrder].sort()) !==
      canonicalJsonDigest(sortedNodes)
  ) {
    fail(`${value.kind} topologicalOrder does not cover every node once`);
  }
  const positions = new Map(
    value.topologicalOrder.map((nodeId, position) => [nodeId, position]),
  );
  unique(value.edges, ({ id }) => id, `${value.kind} edge IDs`);
  for (const edge of value.edges) {
    if (
      !positions.has(edge.prerequisiteId) ||
      !positions.has(edge.dependentId) ||
      positions.get(edge.prerequisiteId) >= positions.get(edge.dependentId)
    ) {
      fail(`${value.kind} edge ${edge.id} violates its topological order`);
    }
  }
}

export function validateWorkDependencyArtifact(value, context = {}) {
  if (!artifactValidator(value)) {
    fail(`${validationDetail(artifactValidator)} (${CONTRACT_URI})`);
  }
  const contract = WORK_DEPENDENCY_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`unsupported kind ${value.kind}`);
  if (context.ref) {
    if (
      (stableId(value) !== undefined && context.ref.artifactId !== stableId(value)) ||
      context.ref.schema !== contract.schema ||
      context.ref.mediaType !== contract.mediaType
    ) {
      fail(`${value.kind} ArtifactRef does not identify its published contract`);
    }
  }
  switch (value.kind) {
    case "ContextSliceSet":
      unique(value.slices, ({ id }) => id, "context slices");
      break;
    case "WorkBreakdownAnalysisSnapshot":
      unique(value.workItemIds, (id) => id, "snapshot work items");
      unique(value.contextSlices, ({ id }) => id, "snapshot context slices");
      if (value.workItemsDigest !== canonicalJsonDigest(value.workItems)) {
        fail("snapshot workItemsDigest does not bind the full work-item snapshot");
      }
      break;
    case "DependencyProposal":
      unique(value.nodes, (id) => id, "proposal nodes");
      unique(value.hintDispositions, ({ hintId }) => hintId, "hint dispositions");
      break;
    case "WorkDependencyGraphMechanicsResult":
      validateGraphDigest(value);
      if (value.status === "valid") {
        validateStaticDag(value);
        if (value.diagnostics.length > 0 || value.cycleWitness.length > 0) {
          fail("valid graph mechanics result contains failure evidence");
        }
      } else if (
        value.diagnostics.length === 0 ||
        value.topologicalOrder.length > 0 ||
        value.generations.length > 0
      ) {
        fail("invalid graph mechanics result lacks closed failure evidence");
      }
      break;
    case "OpaPolicyDecisionSet":
      unique(value.edgeDecisions, ({ edgeId }) => edgeId, "OPA edge decisions");
      break;
    case "WorkDependencyConsistencyReview":
      if (value.advisory !== true) fail("consistency review must remain advisory");
      break;
    case "WorkDependencyCandidate":
      validateStaticDag(value);
      break;
    case "WorkDependencyBaseline":
      validateStaticDag(value);
      unique(
        value.approvalEvidence,
        ({ artifactId, digest }) => `${artifactId}\u0000${digest}`,
        "baseline approval evidence",
      );
      if (value.edges.some(({ policyDisposition }) => policyDisposition !== "allow")) {
        fail("WorkDependencyBaseline cannot contain a policy-denied edge");
      }
      break;
    default:
      break;
  }
  return value;
}

export function workDependencyRuntimeArtifactContracts() {
  return Object.entries(WORK_DEPENDENCY_ARTIFACT_CONTRACTS).map(
    ([kind, contract]) => ({
      schema: contract.schema,
      validate(value, context) {
        if (value.kind !== kind) fail(`expected ${kind}`);
        return validateWorkDependencyArtifact(value, context);
      },
    }),
  );
}
