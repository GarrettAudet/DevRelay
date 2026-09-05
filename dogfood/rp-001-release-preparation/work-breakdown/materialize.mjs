import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { architectureBaselineObserverContributor } from "../../../src/architecture-traceability-contributor.mjs";
import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";
import { validateModuleExecutionRecord } from "../../../src/module-execution-record-validator.mjs";
import { createModuleRegistry } from "../../../src/module-registry.mjs";
import { requirementsBaselineObserverContributor } from "../../../src/requirements-traceability-contributor.mjs";
import {
  TRACEABILITY_VOCABULARY,
  TRACEABILITY_VOCABULARY_V1_6,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
} from "../../../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
  queryTraceabilityGraph,
} from "../../../src/traceability-graph.mjs";
import {
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
  applyWorkBreakdownChangeSet,
  validateWorkBreakdownArtifact,
} from "../../../src/work-breakdown-artifact-validator.mjs";
import {
  validateWorkBreakdownGateCandidate,
  validateWorkBreakdownGatePromotion,
} from "../../../src/work-breakdown-gate.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../../../src/work-breakdown-runtime-contracts.mjs";
import {
  contractBaselineTraceabilityContributor,
  contractCandidateTraceabilityContributor,
} from "../../../src/contract-traceability-contributor.mjs";
import {
  contractDispositionObserverContributor,
  workBreakdownControlTraceabilityContributor,
  workBreakdownTraceabilityContributor,
} from "../../../src/work-breakdown-traceability-contributor.mjs";

const root = process.cwd();
const dogfoodRelative = "dogfood/rp-001-release-preparation/work-breakdown";
const dogfoodDir = path.join(root, ...dogfoodRelative.split("/"));
const finalRoot = `file:///C:/repos/DevRelay/${dogfoodRelative}`;
fs.mkdirSync(dogfoodDir, { recursive: true });

const API_VERSION = "devrelay.dev/v1alpha1";
// The current WorkBreakdown graph predates business-scope ownership in the
// requirements observer contract. Preserve that exact ownership generation
// for this lineage extension instead of attempting to re-own its assertions.
const replayRequirementsObserverContributor = Object.freeze({
  ...requirementsBaselineObserverContributor,
  ownership: Object.freeze({
    ...requirementsBaselineObserverContributor.ownership,
    nodeKinds: Object.freeze(
      requirementsBaselineObserverContributor.ownership.nodeKinds.filter(
        (kind) => kind !== "business-scope",
      ),
    ),
  }),
  async project(context) {
    const projection = await requirementsBaselineObserverContributor.project(context);
    return {
      ...projection,
      nodes: projection.nodes.filter(({ kind }) => kind !== "business-scope"),
      edges: projection.edges.filter(
        ({ source, target }) =>
          source.kind !== "business-scope" && target.kind !== "business-scope",
      ),
    };
  },
});
const REQUIREMENTS_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
  mediaType: "application/vnd.devrelay.requirements-baseline+json",
});
const OVERVIEW_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  mediaType: "application/vnd.devrelay.project-overview-baseline+json",
});
const ARCHITECTURE_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/architecture-baseline/v1",
  mediaType: "application/vnd.devrelay.architecture-baseline+json",
});
const REPOSITORY_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
  mediaType: "application/vnd.devrelay.repository-snapshot+json",
});
const ROUTE_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/module-route-decision/v1",
  mediaType: "application/vnd.devrelay.module-route-decision+json",
});
const NATIVE_TASKS_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/native/openspec/tasks/v1",
  mediaType: "text/markdown",
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")));
}

function load(relativePath) {
  return JSON.parse(read(relativePath));
}

function writeJson(name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dogfoodDir, name), bytes);
  return bytes;
}

function writeText(name, value) {
  const bytes = Buffer.from(value, "utf8");
  fs.writeFileSync(path.join(dogfoodDir, name), bytes);
  return bytes;
}

function finalUri(name) {
  return `${finalRoot}/${name}`;
}

function artifactRef(artifactId, contract, bytes, uri) {
  return {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest: sha256Digest(bytes),
    uri,
  };
}

function clone(value) {
  return structuredClone(value);
}

function refKey(ref) {
  return [ref.artifactId, ref.schema, ref.mediaType, ref.digest].join("\u0000");
}

function createCheckpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return values.has(key) ? clone(values.get(key)) : undefined;
      },
      async put(key, value) {
        values.set(key, clone(value));
        return clone(value);
      },
    },
  };
}

function createTraceabilityCheckpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return values.has(key) ? clone(values.get(key)) : undefined;
      },
      async putIfAbsent(key, value) {
        if (!values.has(key)) values.set(key, clone(value));
        return clone(values.get(key));
      },
    },
  };
}

const requirementsBytes = read("project/requirements-baseline.json");
const overviewBytes = read("project/project-overview-baseline.json");
const architectureBytes = read("project/architecture-baseline.json");
const repositoryBytes = read(
  "dogfood/rp-001-release-preparation/repository-snapshot.json",
);
const currentBaselineBytes = read("project/work-breakdown-baseline.json");
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const priorGraphBytes = read(
  "dogfood/rp-001-release-preparation/contract-generation/replay-v1/approved-traceability-graph-snapshot.json",
);
const priorGraphReceipt = load(
  "project/contract-gate-promotion.json",
);
const requirementsPromotionBytes = read(
  "dogfood/rp-001-release-preparation/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/rp-001-release-preparation/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/ep-001-environment-preparation/work-breakdown/work-breakdown-gate-promotion-proof.json",
);
const contractDispositionBytes = read("project/contract-disposition.json");
const contractBaselineBytes = read("project/contract-baseline.json");
const contractPromotionBytes = read(
  "dogfood/rp-001-release-preparation/contract-generation/replay-v1/contract-gate-promotion.json",
);
const contractCandidateBytes = read(
  "dogfood/rp-001-release-preparation/contract-generation/contract-change-set-draft.json",
);
const contractInvocation = load(
  "dogfood/rp-001-release-preparation/contract-generation/contract-generation.invocation.json",
);
const contractResult = load(
  "dogfood/rp-001-release-preparation/contract-generation/contract-generation.result.json",
);
const contractStateBytes = read(
  "dogfood/rp-001-release-preparation/contract-generation/project-contract-state.json",
);


const requirements = JSON.parse(requirementsBytes);
const overview = JSON.parse(overviewBytes);
const architecture = JSON.parse(architectureBytes);
const repository = JSON.parse(repositoryBytes);
const currentBaseline = JSON.parse(currentBaselineBytes);
const capabilityCatalog = JSON.parse(capabilityCatalogBytes);
const priorGraph = JSON.parse(priorGraphBytes);
const requirementsPromotion = JSON.parse(requirementsPromotionBytes);
const architecturePromotion = JSON.parse(architecturePromotionBytes);
const priorWorkBreakdownProof = JSON.parse(priorWorkBreakdownProofBytes);
const contractDisposition = JSON.parse(contractDispositionBytes);
const contractBaseline = JSON.parse(contractBaselineBytes);
const contractPromotion = JSON.parse(contractPromotionBytes);
const contractCandidate = JSON.parse(contractCandidateBytes);
const contractState = JSON.parse(contractStateBytes);

const requirementsRef = clone(architecture.requirementsBaseline);
const overviewRef = clone(architecture.projectOverviewBaseline);
const repositoryRef = clone(architecture.repositorySnapshot);
assert.equal(requirementsRef.digest, sha256Digest(requirementsBytes));
assert.equal(overviewRef.digest, sha256Digest(overviewBytes));
assert.equal(repositoryRef.digest, sha256Digest(repositoryBytes));
assert.equal(requirementsRef.artifactId, requirements.baselineId);
assert.equal(overviewRef.artifactId, overview.baselineId);
assert.deepEqual(
  { schema: requirementsRef.schema, mediaType: requirementsRef.mediaType },
  REQUIREMENTS_CONTRACT,
);
assert.deepEqual(
  { schema: overviewRef.schema, mediaType: overviewRef.mediaType },
  OVERVIEW_CONTRACT,
);
assert.deepEqual(
  { schema: repositoryRef.schema, mediaType: repositoryRef.mediaType },
  REPOSITORY_CONTRACT,
);

const architectureRef = artifactRef(
  architecture.baselineId,
  ARCHITECTURE_CONTRACT,
  architectureBytes,
  "file:///C:/repos/DevRelay/project/architecture-baseline.json",
);
const currentBaselineRef = artifactRef(
  currentBaseline.baselineId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
  currentBaselineBytes,
  "file:///C:/repos/DevRelay/project/work-breakdown-baseline.json",
);
validateWorkBreakdownArtifact(currentBaseline, { ref: currentBaselineRef });

const baselineBindings = new Map(
  currentBaseline.inputBindings.map(({ role, artifact }) => [role, artifact]),
);
const capabilityCatalogRef = clone(baselineBindings.get("capability-catalog"));
assert.equal(capabilityCatalogRef.digest, sha256Digest(capabilityCatalogBytes));
validateWorkBreakdownArtifact(capabilityCatalog, {
  ref: capabilityCatalogRef,
});

const requirementsPromotionRef = artifactRef(
  requirementsPromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/requirements-gate-promotion/v1",
    mediaType: "application/json",
  },
  requirementsPromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/rp-001-release-preparation/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/rp-001-release-preparation/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofRef = artifactRef(
  priorWorkBreakdownProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  "file:///C:/repos/DevRelay/dogfood/ep-001-environment-preparation/work-breakdown/work-breakdown-gate-promotion-proof.json",
);

const contractDispositionRef = artifactRef(
  contractDisposition.dispositionId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
  contractDispositionBytes,
  "file:///C:/repos/DevRelay/project/contract-disposition.json",
);
validateWorkBreakdownArtifact(contractDisposition, { ref: contractDispositionRef });
const contractBaselineRef = clone(contractDisposition.contractBaseline);
assert.equal(contractBaselineRef.digest, sha256Digest(contractBaselineBytes));
assert.equal(contractBaselineRef.artifactId, contractBaseline.baselineId);
const contractPromotionRef = artifactRef(
  contractPromotion.promotionId,
  {
    schema: "https://devrelay.dev/evidence/contract-gate-promotion/v1",
    mediaType: "application/json",
  },
  contractPromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/rp-001-release-preparation/contract-generation/replay-v1/contract-gate-promotion.json",
);

const priorRequirements = load("project/history/2.3.0/requirements-baseline.json");
const priorAcceptanceSet = new Set(priorRequirements.requirements.acceptanceCriteria.map(({ id }) => id));
const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => !priorAcceptanceSet.has(id))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-RP-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 25);
assert.equal(targetArchitectureIds.length, 13);

const priorAcceptanceIds = currentBaseline.coverageDispositions
  .filter(({ scopeKind }) => scopeKind === "acceptance-criterion")
  .map(({ scopeRef }) => scopeRef)
  .sort();
const priorArchitectureIds = currentBaseline.coverageDispositions
  .filter(({ scopeKind }) => scopeKind === "architecture")
  .map(({ scopeRef }) => scopeRef)
  .sort();
const priorContractIds = currentBaseline.coverageDispositions
  .filter(({ scopeKind }) => scopeKind === "contract")
  .map(({ scopeRef }) => scopeRef)
  .sort();
assert.ok(priorAcceptanceIds.length > 0);
assert.ok(priorArchitectureIds.length > 0);
assert.ok(priorContractIds.length > 0);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();
const targetContractIds = contractBaseline.contracts
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-RP-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 5);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, priorContractIds.length + 5);

const priorGraphRef = clone(priorGraphReceipt.approvedTraceabilityGraphSnapshot);
assert.equal(
  priorGraphRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorGraph), "utf8")),
);
const contractStateRef = clone(contractInvocation.inputs["project-contract-state"][0]);
const contractCandidateRef = clone(contractResult.outputs["contract-change-set-draft"][0]);
const contractArchitectureRef = clone(contractInvocation.inputs["architecture-baseline"][0]);
const contractOverviewRef = clone(contractInvocation.inputs["project-overview-baseline"][0]);
assert.equal(contractStateRef.digest, sha256Digest(contractStateBytes));
assert.equal(contractCandidateRef.digest, sha256Digest(contractCandidateBytes));
assert.equal(contractArchitectureRef.digest, sha256Digest(architectureBytes));
assert.equal(contractOverviewRef.digest, sha256Digest(overviewBytes));

// The ContractGate promotion created a three-update graph but the first two
// deterministic updates predated source-archival enforcement. Reconstruct
// those exact trusted updates from their pinned inputs and persist them before
// restoring the graph; never infer history from the snapshot alone.
const historyStore = createInMemoryTraceabilityStore();
const upstreamHistoryGraph = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store: historyStore,
  contributors: [
    requirementsBaselineObserverContributor,
    architectureBaselineObserverContributor,
  ],
});
const upstreamInvocation = {
  invocationId: "contract-promotion-upstream-seed",
  module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" },
};
const upstreamPrepared = await upstreamHistoryGraph.prepare({
  invocation: upstreamInvocation,
  invocationFingerprint: canonicalJsonDigest(upstreamInvocation),
  moduleResult: {
    invocationId: upstreamInvocation.invocationId,
    status: "completed",
    outcome: "decomposed",
    outputs: {},
    evidence: [],
    diagnostics: [],
  },
  loadedInputs: {
    "requirements-baseline": [{ value: requirements, bytes: requirementsBytes, ref: requirementsRef }],
    "project-overview-baseline": [{ value: overview, bytes: overviewBytes, ref: overviewRef }],
    "architecture-baseline": [{ value: architecture, bytes: architectureBytes, ref: contractArchitectureRef }],
  },
  loadedOutputs: {},
  baseGraph: upstreamHistoryGraph.captureBase(),
});
await upstreamHistoryGraph.mergePrepared(upstreamPrepared);
const historicalPromotionUpdateDigests = new Set(priorGraph.appliedUpdates.map(({ digest }) => digest));
assert.ok(historicalPromotionUpdateDigests.has(upstreamPrepared.updateRef.digest));
writeJson("source-traceability-update-upstream.json", upstreamPrepared.update);

const candidateHistoryGraph = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store: historyStore,
  contributors: [
    contractCandidateTraceabilityContributor,
    contractBaselineTraceabilityContributor,
  ],
});
const candidatePrepared = await candidateHistoryGraph.prepare({
  invocation: contractInvocation,
  invocationFingerprint: canonicalJsonDigest({ invocation: contractInvocation }),
  moduleResult: contractResult,
  loadedInputs: {
    "project-contract-state": [{ value: contractState, bytes: contractStateBytes, ref: contractStateRef }],
    "architecture-baseline": [{ value: architecture, bytes: architectureBytes, ref: contractArchitectureRef }],
    "project-overview-baseline": [{ value: overview, bytes: overviewBytes, ref: contractOverviewRef }],
  },
  loadedOutputs: {
    "contract-change-set-draft": [{ value: contractCandidate, bytes: contractCandidateBytes, ref: contractCandidateRef }],
  },
  baseGraph: candidateHistoryGraph.captureBase(),
});
await candidateHistoryGraph.mergePrepared(candidatePrepared);
assert.ok(historicalPromotionUpdateDigests.has(candidatePrepared.updateRef.digest));
assert.notEqual(candidatePrepared.updateRef.digest, upstreamPrepared.updateRef.digest);
writeJson("source-traceability-update-contract-candidate.json", candidatePrepared.update);
function sortedJsonFiles(rootPath) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(next);
    }
  }
  visit(rootPath);
  return files;
}
const priorUpdateSources = new Map();
const wantedPriorUpdates = new Set(priorGraph.appliedUpdates.map(({ digest }) => digest));
for (const searchRoot of [path.join(root, "dogfood"), path.join(root, "project", "history")]) {
  for (const sourcePath of sortedJsonFiles(searchRoot)) {
    let value;
    try { value = JSON.parse(fs.readFileSync(sourcePath)); } catch { continue; }
    if (value.kind !== "TraceabilityUpdate") continue;
    const digest = sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
    if (wantedPriorUpdates.has(digest) && !priorUpdateSources.has(digest)) {
      priorUpdateSources.set(digest, path.relative(root, sourcePath).replaceAll("\\", "/"));
    }
  }
}
const priorAppliedUpdateEntries = priorGraph.appliedUpdates.map((ref) => {
  const sourcePath = priorUpdateSources.get(ref.digest);
  assert.ok(sourcePath, `missing persisted source for ${ref.digest}`);
  const value = load(sourcePath);
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  assert.equal(sha256Digest(bytes), ref.digest);
  return { ref: clone(ref), bytes, value };
});

const relevantTraceabilityIds = new Set([
  "BO-DEV-ENVIRONMENT-READINESS-001",
  ...targetAcceptanceIds,
  ...targetArchitectureIds,
  ...targetContractIds,
]);
const traceabilityRefs = priorGraph.nodes
  .filter(({ stableId }) => relevantTraceabilityIds.has(stableId))
  .map(({ nodeId }) => ({ nodeId, artifact: priorGraphRef }))
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId, "en"));
assert.ok(traceabilityRefs.length >= 1 + targetAcceptanceIds.length + targetArchitectureIds.length + targetContractIds.length);

const packageReviewText = [
  "# ApprovedChangePackage review: RP-001 release preparation and verification",
  "",
  "Status: **pass**",
  "",
  `- Current WorkBreakdownBaseline: ${currentBaselineRef.digest}`,
  `- Target RequirementsBaseline: ${requirementsRef.digest}`,
  `- Target ProjectOverviewBaseline: ${overviewRef.digest}`,
  `- Target ArchitectureBaseline: ${architectureRef.digest}`,
  `- Target ContractDisposition: ${contractDispositionRef.digest}`,
  `- Repository revision: ${repository.revision}`,
  `- Repository tree: ${repository.treeDigest}`,
  `- Requirements approval: ${requirementsPromotionRef.digest}`,
  `- Architecture approval: ${architecturePromotionRef.digest}`,
  `- Prior WorkBreakdown completion evidence: ${priorWorkBreakdownProofRef.digest}`,
  `- Authorized acceptance criteria: ${authorizedAcceptanceIds.join(", ")}`,
  `- Authorized architecture elements: ${authorizedArchitectureIds.join(", ")}`,
  "",
  "The package authorizes retirement of the nine accepted EP-001 planning items, records their prior scope as already satisfied using exact acceptance and repository evidence, and adds planning work only for the approved RP-001 release preparation and verification delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-rp-001-v1",
  {
    schema: "https://devrelay.dev/evidence/approved-change-package-review/v1",
    mediaType: "text/markdown",
  },
  packageReviewBytes,
  finalUri("approved-change-package-review.md"),
);

const approvedChangePackage = {
  apiVersion: API_VERSION,
  kind: "ApprovedChangePackage",
  packageId: "ACP-RP-001",
  preChange: {
    requirementsBaseline: clone(baselineBindings.get("requirements-baseline")),
    projectOverviewBaseline: clone(
      baselineBindings.get("project-overview-baseline"),
    ),
    architectureBaseline: clone(baselineBindings.get("architecture-baseline")),
    contractDisposition: clone(baselineBindings.get("contract-disposition")),
  },
  target: {
    requirementsBaseline: requirementsRef,
    projectOverviewBaseline: overviewRef,
    architectureBaseline: architectureRef,
    contractDisposition: contractDispositionRef,
  },
  currentWorkBreakdownBaseline: currentBaselineRef,
  currentRepository: {
    artifact: repositoryRef,
    revision: repository.revision,
    treeDigest: repository.treeDigest,
  },
  approvedRequirementsChange: requirementsPromotionRef,
  approvedArchitectureChange: architecturePromotionRef,
  approvedContractChangeDisposition: contractPromotionRef,
  authorizedScope: {
    acceptanceCriteria: authorizedAcceptanceIds,
    architecture: authorizedArchitectureIds,
    contracts: authorizedContractIds,
  },
  traceabilityRefs,
  approvalEvidence: [packageReviewRef],
};
const approvedChangePackageBytes = writeJson(
  "approved-change-package.json",
  approvedChangePackage,
);
const approvedChangePackageRef = artifactRef(
  approvedChangePackage.packageId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedChangePackage,
  approvedChangePackageBytes,
  finalUri("approved-change-package.json"),
);
validateWorkBreakdownArtifact(approvedChangePackage, {
  ref: approvedChangePackageRef,
});

const projectState = {
  apiVersion: API_VERSION,
  kind: "ProjectWorkBreakdownState",
  stateId: "PWBS-RP-BASELINED-001",
  state: "baselined",
  requirementsBaseline: requirementsRef,
  projectOverviewBaseline: overviewRef,
  architectureBaseline: architectureRef,
  contractDisposition: contractDispositionRef,
  capabilityCatalog: capabilityCatalogRef,
  currentRepositorySnapshot: repositoryRef,
  currentWorkBreakdownBaseline: currentBaselineRef,
  approvedChangePackage: approvedChangePackageRef,
};
const projectStateBytes = writeJson(
  "project-work-breakdown-state.json",
  projectState,
);
const projectStateRef = artifactRef(
  projectState.stateId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ProjectWorkBreakdownState,
  projectStateBytes,
  finalUri("project-work-breakdown-state.json"),
);
validateWorkBreakdownArtifact(projectState, { ref: projectStateRef });

const tasksBytes = read(`${dogfoodRelative}/tasks.md`);
const tasksRef = artifactRef(
  "openspec-tasks-rp-001-v1",
  NATIVE_TASKS_CONTRACT,
  tasksBytes,
  finalUri("tasks.md"),
);

const acceptanceIndex = new Map(
  requirements.requirements.acceptanceCriteria.map(({ id }, index) => [id, index]),
);
const architectureIndex = new Map(
  architecture.sections.architectureModel.content.elements.map(({ id }, index) => [
    id,
    index,
  ]),
);

const contractIndex = new Map(
  contractDisposition.contractTargets.map(({ id }, index) => [id, index]),
);

function sourceRef(role, artifact, jsonPointer) {
  return { role, artifact: clone(artifact), jsonPointer };
}

function requirementSource(id) {
  const index = acceptanceIndex.get(id);
  assert.notEqual(index, undefined, `missing requirement ${id}`);
  return sourceRef(
    "requirements-baseline",
    requirementsRef,
    `/requirements/acceptanceCriteria/${index}`,
  );
}

function architectureSource(id) {
  const index = architectureIndex.get(id);
  assert.notEqual(index, undefined, `missing architecture element ${id}`);
  return sourceRef(
    "architecture-baseline",
    architectureRef,
    `/sections/architectureModel/content/elements/${index}`,
  );
}

function contractSource(id) {
  const index = contractIndex.get(id);
  assert.notEqual(index, undefined, `missing contract ${id}`);
  return sourceRef("contract-disposition", contractDispositionRef, `/contractTargets/${index}`);
}

function hint(workItemRef, relation, rationale) {
  return {
    "work-item-ref": workItemRef,
    relation,
    rationale,
    authority: "hint",
  };
}

function workItem({
  id,
  objective,
  included,
  excluded,
  deliverables,
  workType,
  acceptanceCriterionRefs,
  architectureRefs,
  contractRefs = [],
  capabilities,
  dependencyHints = [],
  verificationMethod,
  successCriteria,
  evidenceKind,
}) {
  return {
    id,
    objective,
    "bounded-scope": { included, excluded },
    deliverables: deliverables.map(([deliverableId, description, artifactKind]) => ({
      id: deliverableId,
      description,
      artifactKind,
    })),
    "work-type": workType,
    "acceptance-criterion-refs": [...acceptanceCriterionRefs].sort(),
    "architecture-refs": [...architectureRefs].sort(),
    "contract-refs": [...contractRefs].sort(),
    "required-capabilities": [...capabilities].sort(),
    "dependency-hints": dependencyHints,
    "verification-plan": {
      checks: [
        {
          id: `VC-${id.slice(3)}`,
          method: verificationMethod,
          successCriteria,
        },
      ],
    },
    "required-evidence": [{ kind: evidenceKind, description: successCriteria }],
    "source-refs": [
      ...acceptanceCriterionRefs.map(requirementSource),
      ...architectureRefs.map(architectureSource),
      ...contractRefs.map(contractSource),
      sourceRef(
        "approved-change-package",
        approvedChangePackageRef,
        "/authorizedScope",
      ),
    ],
  };
}

const workItemSpecs = load("dogfood/rp-001-release-preparation/work-breakdown/work-items.json");
const workItems = workItemSpecs.map((spec) =>
  workItem({
    ...spec,
    dependencyHints: spec.dependencyHints.map(({ workItemRef, relation, rationale }) => hint(workItemRef, relation, rationale)),
  }),
).sort((left, right) => left.id.localeCompare(right.id, "en"));
assert.equal(workItems.length, 9);

function plannedCoverage(scopeKind, scopeRef) {
  const field =
    scopeKind === "acceptance-criterion"
      ? "acceptance-criterion-refs"
      : scopeKind === "architecture"
        ? "architecture-refs"
        : "contract-refs";
  const workItemRefs = workItems
    .filter((item) => item[field].includes(scopeRef))
    .map(({ id }) => id)
    .sort();
  assert.ok(workItemRefs.length > 0, `${scopeKind} ${scopeRef} is uncovered`);
  return { scopeKind, scopeRef, disposition: "planned", workItemRefs };
}

const priorAcceptanceBytes = read("dogfood/ep-001-environment-preparation/final-acceptance/26-business-acceptance-record.json");
const priorAcceptanceValue = JSON.parse(priorAcceptanceBytes);
const priorAcceptanceRef = artifactRef(priorAcceptanceValue.recordId, { schema: "https://devrelay.dev/artifacts/business-acceptance-record/v1", mediaType: "application/json" }, priorAcceptanceBytes, "file:///C:/repos/DevRelay/dogfood/ep-001-environment-preparation/final-acceptance/26-business-acceptance-record.json");
const priorCompletionEvidence = [priorAcceptanceRef, repositoryRef];
const coverageDispositions = [
  ...currentBaseline.coverageDispositions.map(({ scopeKind, scopeRef }) => {
    if (
      false
    ) {
      return plannedCoverage(scopeKind, scopeRef);
    }
    return {
      scopeKind,
      scopeRef,
      disposition: "already-satisfied",
      rationale:
        "The prior EP-001 environment-preparation work is present in the pinned repository snapshot and has exact approved BusinessAcceptance evidence; it is historical completion evidence, not new RP-001 work.",
      currentEvidence: clone(priorCompletionEvidence),
    };
  }),
  ...targetAcceptanceIds.map((id) =>
    plannedCoverage("acceptance-criterion", id),
  ),
  ...targetArchitectureIds.map((id) => plannedCoverage("architecture", id)),
  ...targetContractIds.map((id) => plannedCoverage("contract", id)),
].sort((left, right) =>
  `${left.scopeKind}\u0000${left.scopeRef}`.localeCompare(
    `${right.scopeKind}\u0000${right.scopeRef}`,
    "en",
  ),
);
assert.equal(coverageDispositions.length, currentBaseline.coverageDispositions.length + targetAcceptanceIds.length + targetArchitectureIds.length + targetContractIds.length);

const inputBindings = [
  ["project-work-breakdown-state", projectStateRef],
  ["requirements-baseline", requirementsRef],
  ["project-overview-baseline", overviewRef],
  ["architecture-baseline", architectureRef],
  ["contract-disposition", contractDispositionRef],
  ["capability-catalog", capabilityCatalogRef],
  ["current-repository-snapshot", repositoryRef],
  ["current-work-breakdown-baseline", currentBaselineRef],
  ["approved-change-package", approvedChangePackageRef],
].map(([role, artifact]) => ({ role, artifact }));

const changes = [
  ...currentBaseline.workItems.map((item) => ({
    operation: "retire",
    workItemId: item.id,
    priorItemDigest: canonicalJsonDigest(item),
    rationale:
      "The prior EP-001 environment-preparation deliverable is present in the pinned repository revision and has exact BusinessAcceptance evidence; retain its scope as already satisfied instead of carrying completed work into the RP-001 plan.",
  })),
  ...workItems.map((item) => ({ operation: "add", workItem: item })),
].sort((left, right) =>
  (left.workItemId ?? left.workItem.id).localeCompare(
    right.workItemId ?? right.workItem.id,
    "en",
  ),
);

const workBreakdownChangeSet = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownChangeSetDraft",
  changeSetId: "WBCS-RP-001",
  operation: "decompose-change",
  currentBaseline: currentBaselineRef,
  inputBindings,
  changes,
  coverageDispositions,
  resultingWorkItemsDigest: `sha256:${"0".repeat(64)}`,
  nativeArtifacts: [tasksRef],
  sourceRefs: [
    sourceRef("project-work-breakdown-state", projectStateRef, "/state"),
    sourceRef("requirements-baseline", requirementsRef, "/requirements/purpose"),
    sourceRef("project-overview-baseline", overviewRef, "/overview/purpose"),
    sourceRef("architecture-baseline", architectureRef, "/sections/technicalDesign"),
    sourceRef("contract-disposition", contractDispositionRef, "/mode"),
    sourceRef("current-repository-snapshot", repositoryRef, "/revision"),
    sourceRef("current-work-breakdown-baseline", currentBaselineRef, "/workItems"),
    sourceRef("approved-change-package", approvedChangePackageRef, "/authorizedScope"),
  ],
};
workBreakdownChangeSet.resultingWorkItemsDigest = applyWorkBreakdownChangeSet({
  baseline: currentBaseline,
  baselineRef: currentBaselineRef,
  changeSet: workBreakdownChangeSet,
}).workItemsDigest;
const workBreakdownChangeSetBytes = writeJson(
  "work-breakdown-change-set-draft.json",
  workBreakdownChangeSet,
);
const workBreakdownChangeSetRef = artifactRef(
  workBreakdownChangeSet.changeSetId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownChangeSetDraft,
  workBreakdownChangeSetBytes,
  finalUri("work-breakdown-change-set-draft.json"),
);
validateWorkBreakdownArtifact(workBreakdownChangeSet, {
  ref: workBreakdownChangeSetRef,
});

const bytesByRef = new Map();
function register(ref, bytes) {
  assert.equal(sha256Digest(bytes), ref.digest, `invalid bytes for ${ref.artifactId}`);
  bytesByRef.set(refKey(ref), Buffer.from(bytes));
}

for (const [ref, bytes] of [
  [requirementsRef, requirementsBytes],
  [overviewRef, overviewBytes],
  [architectureRef, architectureBytes],
  [repositoryRef, repositoryBytes],
  [currentBaselineRef, currentBaselineBytes],
  [capabilityCatalogRef, capabilityCatalogBytes],
  [requirementsPromotionRef, requirementsPromotionBytes],
  [architecturePromotionRef, architecturePromotionBytes],
  [priorWorkBreakdownProofRef, priorWorkBreakdownProofBytes],
  [priorAcceptanceRef, priorAcceptanceBytes],
  [contractBaselineRef, contractBaselineBytes],
  [contractPromotionRef, contractPromotionBytes],
  [contractDispositionRef, contractDispositionBytes],
  [packageReviewRef, packageReviewBytes],
  [approvedChangePackageRef, approvedChangePackageBytes],
  [projectStateRef, projectStateBytes],
  [tasksRef, tasksBytes],
  [workBreakdownChangeSetRef, workBreakdownChangeSetBytes],
]) {
  register(ref, bytes);
}

register(priorGraphRef, Buffer.from(canonicalJson(priorGraph), "utf8"));
register(
  overview.renderedDocument.artifact,
  read("ProjectOverview.md"),
);
for (const entry of architecture.sections.nativeArtifacts.content.entries) {
  register(entry.artifact, read(entry.logicalPath));
}

const artifacts = {
  async load(ref) {
    const bytes = bytesByRef.get(refKey(ref));
    if (!bytes) throw new Error(`missing artifact ${ref.artifactId}`);
    return Buffer.from(bytes);
  },
};

const adapterCalls = [];
let adapterContextIsolated = false;
const resultFor = (invocationId) => ({
  apiVersion: API_VERSION,
  kind: "ModuleResult",
  invocationId,
  status: "completed",
  outcome: "decomposed",
  outputs: {
    "work-breakdown-change-set-draft": [workBreakdownChangeSetRef],
  },
  evidence: [
    {
      kind: "work-breakdown/contract-validation",
      subject: `work-breakdown-change-set:${workBreakdownChangeSet.changeSetId}`,
      status: "pass",
      artifact: workBreakdownChangeSetRef,
      summary:
        "The canonical change set passed closed-schema, approved-scope, lineage, coverage, capability, and source-reference validation.",
    },
    {
      kind: "work-breakdown/source-closure",
      subject: `work-breakdown-baseline:${currentBaseline.baselineId}`,
      status: "pass",
      artifact: workBreakdownChangeSetRef,
      summary:
        "Nine prior accepted EP-001 items are retired and their approved scope dispositions are preserved as already satisfied with exact repository and BusinessAcceptance evidence.",
    },
  ],
  diagnostics: [],
});

const registry = createModuleRegistry({
  modules: [load("examples/modules/work-breakdown.module.json")],
  plugins: [
    {
      definition: load("examples/plugins/openspec-tasks.plugin.json"),
      adapter: {
        async invoke(activeInvocation, adapterContext) {
          adapterCalls.push(activeInvocation.invocationId);
          adapterContextIsolated =
            !("traceabilityGraph" in adapterContext) &&
            !("traceabilityCheckpoints" in adapterContext);
          return resultFor(activeInvocation.invocationId);
        },
      },
    },
  ],
  artifactContracts: workBreakdownRuntimeArtifactContracts(),
});

const selectedRoute = await registry.selectOperation(
  { id: "work-breakdown", version: "0.1.0" },
  projectStateRef,
  { artifacts },
);
assert.equal(selectedRoute.selection.operation, "decompose-change");
assert.equal(selectedRoute.reasonCode, "WORK_BREAKDOWN_BASELINE_PRESENT");
const routeBytes = writeJson("module-route-decision.json", selectedRoute);
const routeRef = artifactRef(
  "module-route-decision-rp-001-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-rp-001-v1",
  runId: "rp-001-release-preparation-dogfood-run-v1",
  nodeId: "work-breakdown",
  module: {
    id: "work-breakdown",
    version: "0.1.0",
    operation: "decompose-change",
  },
  plugin: { id: "openspec-tasks", version: "0.1.0" },
  inputs: {
    "project-work-breakdown-state": [projectStateRef],
    "routing-decision": [routeRef],
    "requirements-baseline": [requirementsRef],
    "project-overview-baseline": [overviewRef],
    "architecture-baseline": [architectureRef],
    "contract-disposition": [contractDispositionRef],
    "capability-catalog": [capabilityCatalogRef],
    "current-repository-snapshot": [repositoryRef],
    "current-work-breakdown-baseline": [currentBaselineRef],
    "approved-change-package": [approvedChangePackageRef],
  },
  options: {},
  config: {
    projectRoot: "C:/repos/DevRelay",
    planningOutputRoot:
      "C:/repos/DevRelay/dogfood/rp-001-release-preparation/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "rp-001-release-preparation",
    schema: "devrelay-work-breakdown",
    artifact: "tasks.md",
    command: "/opsx:continue",
    bridge: "agent-command",
  },
  grants: [
    { kind: "filesystem.read", scope: "C:/repos/DevRelay" },
    {
      kind: "filesystem.write",
      scope:
        "C:/repos/DevRelay/dogfood/rp-001-release-preparation/work-breakdown",
    },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ],
};
const invocationBytes = writeJson("work-breakdown.invocation.json", invocation);

const effectCheckpoints = createCheckpointStore();
const traceabilityCheckpoints = createTraceabilityCheckpointStore();
const graphStore = createInMemoryTraceabilityStore();
graphStore.restore(
  priorGraph.graphId,
  [
    {
      ref: priorGraphRef,
      bytes: Buffer.from(canonicalJson(priorGraph), "utf8"),
      value: priorGraph,
    },
    ...priorAppliedUpdateEntries,
  ],
  priorGraphRef,
);
const graph = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store: graphStore,
  contributors: [
    requirementsBaselineObserverContributor,
    architectureBaselineObserverContributor,
    workBreakdownTraceabilityContributor,
    workBreakdownControlTraceabilityContributor,
  ],
  vocabulary: TRACEABILITY_VOCABULARY_V1_6,
});
const executionContext = {
  artifacts,
  checkpoints: effectCheckpoints.store,
  traceabilityGraph: graph,
  traceabilityCheckpoints: traceabilityCheckpoints.store,
  async createAdapterContext() {
    return {
      mode: "bounded-openspec-tasks-fixture",
      nativeArtifact: tasksRef,
      liveCliInvoked: false,
    };
  },
};

const executionRecord = await registry.executeWithTraceability(
  invocation,
  executionContext,
);
validateModuleExecutionRecord(executionRecord);
assert.deepEqual(executionRecord.moduleResult, resultFor(invocation.invocationId));
assert.equal(adapterCalls.length, 1);
assert.equal(adapterContextIsolated, true);
assert.equal(executionRecord.mergeReceipt.disposition, "merged");
assert.equal(executionRecord.mergeReceipt.snapshot.revision, priorGraph.revision + 1);
assert.deepEqual(
  executionRecord.mergeReceipt.snapshot.vocabulary,
  TRACEABILITY_VOCABULARY_V1_6,
);
validateTraceabilityUpdate(executionRecord.traceabilityUpdate);
validateTraceabilityGraphSnapshot(executionRecord.mergeReceipt.snapshot);

const callsBeforeReplay = adapterCalls.length;
const replayRecord = await registry.executeWithTraceability(
  invocation,
  executionContext,
);
assert.deepEqual(replayRecord, executionRecord);
assert.equal(adapterCalls.length, callsBeforeReplay);

const callsBeforeCheckpointVerification = adapterCalls.length;
const checkpointReplay = await registry.verifyCheckpointedExecution(
  invocation,
  { artifacts, checkpoints: effectCheckpoints.store },
);
assert.equal(checkpointReplay.kind, "VerifiedCheckpointReplayReceipt");
assert.equal(checkpointReplay.moduleResult.outcome, "decomposed");
assert.equal(adapterCalls.length, callsBeforeCheckpointVerification);
const checkpointReplayBytes = writeJson("checkpoint-replay-receipt.json", checkpointReplay);
const checkpointReplayRef = artifactRef(
  "work-breakdown-checkpoint-replay-rp-001-v1",
  {
    schema: "https://devrelay.dev/evidence/verified-checkpoint-replay/v1",
    mediaType: "application/json",
  },
  checkpointReplayBytes,
  finalUri("checkpoint-replay-receipt.json"),
);

const evidenceByRef = new Map([
  [refKey(priorWorkBreakdownProofRef), priorWorkBreakdownProofBytes],
  [refKey(priorAcceptanceRef), priorAcceptanceBytes],
  [refKey(repositoryRef), repositoryBytes],
]);
const evidenceResolver = async (ref) => {
  const bytes = evidenceByRef.get(refKey(ref));
  if (!bytes) throw new Error(`missing evidence ${ref.artifactId}`);
  assert.equal(sha256Digest(bytes), ref.digest);
  return { ref: clone(ref), bytes: Buffer.from(bytes) };
};
await validateWorkBreakdownGateCandidate({
  checkpointReplay,
  evidenceResolver,
  noWorkApprovals: [],
});

const snapshot = executionRecord.mergeReceipt.snapshot;
const activeRpWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-RP-"),
);
const activeEpWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-EP-"),
);
assert.equal(activeRpWorkItems.length, workItems.length);
assert.equal(activeEpWorkItems.length, 0);
const objectivePath = queryTraceabilityGraph(snapshot, {
  start: {
    kind: "business-objective",
    stableId: "BO-DEV-RELEASE-READINESS-001",
    authority: "approved",
    scope: "requirements/baseline",
  },
  direction: "outgoing",
  targetKinds: ["work-item"],
});
assert.ok(objectivePath.paths.length > 0);

const moduleResultBytes = writeJson(
  "work-breakdown.result.json",
  executionRecord.moduleResult,
);
const traceabilityUpdateBytes = writeJson(
  "traceability-update.json",
  executionRecord.traceabilityUpdate,
);
const traceabilitySnapshotBytes = writeJson(
  "traceability-graph-snapshot.json",
  snapshot,
);
const executionRecordBytes = writeJson(
  "module-execution-record.json",
  executionRecord,
);
const runtimeProof = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownRuntimeProof",
  status: "pass",
  selectedOperation: selectedRoute.selection.operation,
  selectedPlugin: invocation.plugin,
  adapterMode: "bounded-openspec-tasks-fixture",
  liveOpenSpecCliInvoked: false,
  adapterCalls: adapterCalls.length,
  replayAdapterCalls: adapterCalls.length - callsBeforeReplay,
  checkpointVerificationAdapterCalls:
    adapterCalls.length - callsBeforeCheckpointVerification,
  effectCheckpointCount: effectCheckpoints.values.size,
  traceabilityCheckpointCount: traceabilityCheckpoints.values.size,
  invocationDigest: sha256Digest(invocationBytes),
  moduleResultDigest: sha256Digest(moduleResultBytes),
  previousGraph: priorGraphRef,
  mergeProof: {
    executionId: executionRecord.invocationId,
    graphRevision: snapshot.revision,
    traceabilityUpdateDigest: executionRecord.traceabilityUpdateRef.digest,
    traceCheckpointKey: executionRecord.traceCheckpointKey,
    traceCheckpointDigest: executionRecord.traceCheckpointDigest,
    resultingGraph: executionRecord.mergeReceipt.snapshotRef,
    applicationReceipt: executionRecord.applicationProof.receiptRef,
    executionRecordDigest: executionRecord.recordDigest,
  },
};
const runtimeProofBytes = writeJson("runtime-execution-proof.json", runtimeProof);
const runtimeProofRef = artifactRef(
  "work-breakdown-runtime-proof-rp-001-v1",
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-runtime/v1",
    mediaType: "application/json",
  },
  runtimeProofBytes,
  finalUri("runtime-execution-proof.json"),
);

const gateBindings = [
  ["RequirementsBaseline", requirementsRef.digest],
  ["ProjectOverviewBaseline", overviewRef.digest],
  ["ArchitectureBaseline", architectureRef.digest],
  ["ContractDisposition", contractDispositionRef.digest],
  ["CurrentWorkBreakdownBaseline", currentBaselineRef.digest],
  ["RepositorySnapshot", repositoryRef.digest],
  ["ApprovedChangePackage", approvedChangePackageRef.digest],
  ["WorkBreakdownChangeSetDraft", workBreakdownChangeSetRef.digest],
  ["ModuleExecutionRecord", executionRecord.recordDigest],
  ["TraceabilityUpdate", executionRecord.traceabilityUpdateRef.digest],
  ["RuntimeProof", runtimeProofRef.digest],
  ["CheckpointReplay", checkpointReplayRef.digest],
];
const gateText = [
  "# WorkBreakdown Gate: RP-001 ReleasePreparation and ReleaseVerification",
  "",
  "Status: **pass**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Findings",
  "",
  "- PASS: Core selected `decompose-change` from the exact baselined project state; the model did not select the operation or plug-in.",
  "- PASS: the configured bounded `openspec-tasks@0.1.0` adapter returned one canonical WorkBreakdownChangeSetDraft and did not run implementation or build commands.",
  "- PASS: all 25 approved RP-001 acceptance criteria, all 13 approved architecture elements, and all 5 approved contracts have reciprocal planned coverage.",
  "- PASS: all 9 previously accepted EP-001 planning items are retired; their approved scope dispositions are retained as already satisfied with exact repository and BusinessAcceptance evidence.",
  "- PASS: every new WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one revision, retired stale candidate work and edges, and preserved a replayable atomic merge proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownChangeSetDraft and promote the resulting WorkBreakdownBaseline 2.4.0 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-rp-001-v1",
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-review/v1",
    mediaType: "text/markdown",
  },
  gateBytes,
  finalUri("work-breakdown-gate.md"),
);

const gateCandidate = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownGateCandidate",
  candidateId: "work-breakdown-gate-candidate-rp-001-v1",
  status: "awaiting-owner-approval",
  operation: selectedRoute.selection.operation,
  workBreakdownChangeSet: workBreakdownChangeSetRef,
  gateReview: gateRef,
  runtimeProof: runtimeProofRef,
  checkpointReplayReceipt: checkpointReplayRef,
  checkpointReplay: {
    invocationId: checkpointReplay.invocation.invocationId,
    producer: checkpointReplay.producer,
    outcome: checkpointReplay.moduleResult.outcome,
    adapterCallsDuringVerification: adapterCalls.length - callsBeforeCheckpointVerification,
  },
  traceabilityMerge: {
    previousGraph: priorGraphRef,
    resultingGraph: executionRecord.mergeReceipt.snapshotRef,
    update: executionRecord.traceabilityUpdateRef,
    recordDigest: executionRecord.recordDigest,
  },
  progressionAllowed: false,
  nextGate: "work-breakdown-gate",
};
const gateCandidateBytes = writeJson("work-breakdown-gate-candidate.json", gateCandidate);

const gateCandidateRef = artifactRef(
  gateCandidate.candidateId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-candidate/v1",
    mediaType: "application/json",
  },
  gateCandidateBytes,
  finalUri("work-breakdown-gate-candidate.json"),
);
process.stdout.write(`${JSON.stringify({
  outcome: "awaiting-owner-approval",
  operation: selectedRoute.selection.operation,
  plugin: invocation.plugin,
  workItems: workItems.length,
  targetCoverage: {
    acceptanceCriteria: targetAcceptanceIds.length,
    architectureElements: targetArchitectureIds.length,
    contracts: targetContractIds.length,
  },
  changeSetDigest: workBreakdownChangeSetRef.digest,
  gateReviewDigest: gateRef.digest,
  gateCandidateDigest: gateCandidateRef.digest,
  checkpointReplayDigest: checkpointReplayRef.digest,
  traceabilityUpdateDigest: executionRecord.traceabilityUpdateRef.digest,
}, null, 2)}\n`);


const ownerApprovalSourceBytes = read(
  `${dogfoodRelative}/work-breakdown-gate-owner-approval-source.md`,
);
const ownerApprovalSourceRef = artifactRef(
  "work-breakdown-gate-owner-approval-source-rp-001-v1",
  {
    schema: "https://devrelay.dev/evidence/owner-approval-source/v1",
    mediaType: "text/markdown",
  },
  ownerApprovalSourceBytes,
  finalUri("work-breakdown-gate-owner-approval-source.md"),
);
const ownerApproval = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownGateOwnerApproval",
  approvalId: "work-breakdown-gate-owner-approval-rp-001-v1",
  decision: "approved",
  approver: { type: "project-owner", id: "GarrettAudet" },
  approvedAt: "2026-08-21",
  scope: "exact-artifacts-only",
  gateCandidate: gateCandidateRef,
  workBreakdownChangeSet: workBreakdownChangeSetRef,
  gateReview: gateRef,
  checkpointReplayReceipt: checkpointReplayRef,
  approvalSource: ownerApprovalSourceRef,
};
const ownerApprovalBytes = writeJson(
  "work-breakdown-gate-owner-approval.json",
  ownerApproval,
);
const ownerApprovalRef = artifactRef(
  ownerApproval.approvalId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-owner-approval/v1",
    mediaType: "application/json",
  },
  ownerApprovalBytes,
  finalUri("work-breakdown-gate-owner-approval.json"),
);

const applied = applyWorkBreakdownChangeSet({
  baseline: currentBaseline,
  baselineRef: currentBaselineRef,
  changeSet: workBreakdownChangeSet,
});
const dispositionMap = new Map(
  currentBaseline.coverageDispositions.map((entry) => [
    `${entry.scopeKind}\\u0000${entry.scopeRef}`,
    entry,
  ]),
);
for (const entry of workBreakdownChangeSet.coverageDispositions) {
  dispositionMap.set(`${entry.scopeKind}\\u0000${entry.scopeRef}`, entry);
}
const promotedCoverage = [...dispositionMap.values()].sort((left, right) =>
  `${left.scopeKind}\\u0000${left.scopeRef}`.localeCompare(
    `${right.scopeKind}\\u0000${right.scopeRef}`,
    "en",
  ),
);
const workBreakdownBaseline = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownBaseline",
  baselineId: currentBaseline.baselineId,
  version: "2.4.0",
  approvedCandidate: workBreakdownChangeSetRef,
  inputBindings: clone(workBreakdownChangeSet.inputBindings),
  workItems: clone(applied.workItems),
  coverageDispositions: clone(promotedCoverage),
  approvalEvidence: [gateRef, ownerApprovalRef],
  sourceRefs: clone(workBreakdownChangeSet.sourceRefs),
};
const workBreakdownBaselineBytes = writeJson(
  "work-breakdown-baseline.json",
  workBreakdownBaseline,
);
const workBreakdownBaselineRef = artifactRef(
  workBreakdownBaseline.baselineId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
  workBreakdownBaselineBytes,
  finalUri("work-breakdown-baseline.json"),
);
validateWorkBreakdownArtifact(workBreakdownBaseline, {
  ref: workBreakdownBaselineRef,
});

const gatePromotion = await validateWorkBreakdownGatePromotion({
  checkpointReplay,
  baseline: workBreakdownBaseline,
  baselineRef: workBreakdownBaselineRef,
  baselineBytes: workBreakdownBaselineBytes,
  evidenceResolver,
  noWorkApprovals: [],
});
assert.equal(gatePromotion.operation, "decompose-change");
assert.deepEqual(gatePromotion.candidateRef, workBreakdownChangeSetRef);
assert.deepEqual(gatePromotion.baselineRef, workBreakdownBaselineRef);

const promotedProjectState = {
  ...clone(projectState),
  stateId: "PWBS-RP-001-PROMOTED-001",
  currentWorkBreakdownBaseline: workBreakdownBaselineRef,
};
const promotedProjectStateBytes = writeJson(
  "project-work-breakdown-state-promoted.json",
  promotedProjectState,
);
const promotedProjectStateRef = artifactRef(
  promotedProjectState.stateId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ProjectWorkBreakdownState,
  promotedProjectStateBytes,
  finalUri("project-work-breakdown-state-promoted.json"),
);
validateWorkBreakdownArtifact(promotedProjectState, {
  ref: promotedProjectStateRef,
});

const promotionProof = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownGatePromotionProof",
  proofId: "work-breakdown-gate-promotion-rp-001-v1",
  status: "promoted",
  operation: gatePromotion.operation,
  candidate: workBreakdownChangeSetRef,
  gateCandidate: gateCandidateRef,
  ownerApproval: ownerApprovalRef,
  previousWorkBreakdownBaseline: currentBaselineRef,
  promotedWorkBreakdownBaseline: workBreakdownBaselineRef,
  promotedProjectState: promotedProjectStateRef,
  gateReview: gateRef,
  runtimeProof: runtimeProofRef,
  checkpointReplayReceipt: checkpointReplayRef,
  checkpointReplay: {
    invocationId: checkpointReplay.invocation.invocationId,
    producer: checkpointReplay.producer,
    outcome: checkpointReplay.moduleResult.outcome,
    adapterCallsDuringVerification:
      adapterCalls.length - callsBeforeCheckpointVerification,
  },
  traceabilityMerge: {
    previousGraph: priorGraphRef,
    resultingGraph: executionRecord.mergeReceipt.snapshotRef,
    update: executionRecord.traceabilityUpdateRef,
    recordDigest: executionRecord.recordDigest,
  },
  commitPayloadDigest: canonicalJsonDigest(gatePromotion.commitPayload),
  workDependencyAnalysisProgressionAllowed: true,
};
const promotionProofBytes = writeJson(
  "work-breakdown-gate-promotion-proof.json",
  promotionProof,
);
const promotionProofRef = artifactRef(
  promotionProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  promotionProofBytes,
  finalUri("work-breakdown-gate-promotion-proof.json"),
);

const historyDir = path.join(
  root,
  "project",
  "history",
  "work-breakdown",
  currentBaseline.version,
);
fs.mkdirSync(historyDir, { recursive: true });
for (const [sourceName, targetName] of [
  ["project/work-breakdown-baseline.json", "work-breakdown-baseline.json"],
  ["project/project-work-breakdown-state.json", "project-work-breakdown-state.json"],
  ["project/work-breakdown-promotion.pending.json", "work-breakdown-promotion.pending.json"],
  ["project/work-breakdown-promotion.commit.json", "work-breakdown-promotion.commit.json"],
]) {
  const sourcePath = path.join(root, ...sourceName.split("/"));
  const targetPath = path.join(historyDir, targetName);
  if (!fs.existsSync(targetPath)) fs.copyFileSync(sourcePath, targetPath);
}

const pending = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownPromotionTransaction",
  transactionId: "work-breakdown-promotion-rp-001-v1",
  status: "prepared",
  candidate: workBreakdownChangeSetRef,
  gateCandidate: gateCandidateRef,
  ownerApproval: ownerApprovalRef,
  previousBaseline: currentBaselineRef,
  nextBaseline: workBreakdownBaselineRef,
  nextProjectState: promotedProjectStateRef,
  proof: promotionProofRef,
};
const pendingPath = path.join(
  root,
  "project",
  "work-breakdown-promotion.pending.json",
);
fs.writeFileSync(pendingPath, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
fs.writeFileSync(
  path.join(root, "project", "work-breakdown-baseline.json"),
  workBreakdownBaselineBytes,
);
fs.writeFileSync(
  path.join(root, "project", "project-work-breakdown-state.json"),
  promotedProjectStateBytes,
);
const committed = { ...pending, status: "committed" };
fs.writeFileSync(
  path.join(root, "project", "work-breakdown-promotion.commit.json"),
  `${JSON.stringify(committed, null, 2)}\n`,
  "utf8",
);
fs.writeFileSync(
  pendingPath,
  `${JSON.stringify(committed, null, 2)}\n`,
  "utf8",
);
writeJson("work-breakdown-dogfood-proof.json", {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownDogfoodProof",
  status: "pass-promoted",
  module: { id: "work-breakdown", version: "0.1.0" },
  operation: "decompose-change",
  plugin: invocation.plugin,
  adapterExecution: { mode: "bounded-fixture", nativeCapability: "tasks.md", liveCliInvoked: false },
  inputs: {
    requirementsBaseline: requirementsRef,
    projectOverviewBaseline: overviewRef,
    architectureBaseline: architectureRef,
    contractDisposition: contractDispositionRef,
    currentWorkBreakdownBaseline: currentBaselineRef,
    approvedChangePackage: approvedChangePackageRef,
    repositorySnapshot: repositoryRef,
  },
  outputs: {
    workBreakdownChangeSet: workBreakdownChangeSetRef,
    traceabilityUpdate: executionRecord.traceabilityUpdateRef,
    traceabilityGraph: executionRecord.mergeReceipt.snapshotRef,
    gateCandidate: gateCandidateRef,
    ownerApproval: ownerApprovalRef,
    workBreakdownBaseline: workBreakdownBaselineRef,
    promotionProof: promotionProofRef,
  },
  assertions: {
    retiredPriorWorkItems: currentBaseline.workItems.length,
    newWorkItems: workItems.length,
    alreadySatisfiedCoverage: currentBaseline.coverageDispositions.length,
    plannedAcceptanceCoverage: targetAcceptanceIds.length,
    plannedArchitectureCoverage: targetArchitectureIds.length,
    plannedContractCoverage: targetContractIds.length,
    graphRevisionBefore: priorGraph.revision,
    graphRevisionAfter: snapshot.revision,
    objectiveToWorkItemPathCount: objectivePath.paths.length,
    normalReplayAdapterCalls: adapterCalls.length - callsBeforeReplay,
    checkpointVerificationAdapterCalls: adapterCalls.length - callsBeforeCheckpointVerification,
  },
  evidence: {
    runtimeProofDigest: runtimeProofRef.digest,
    checkpointReplayDigest: checkpointReplayRef.digest,
    gateDigest: gateRef.digest,
    gateCandidateDigest: sha256Digest(gateCandidateBytes),
    moduleExecutionRecordDigest: sha256Digest(executionRecordBytes),
    traceabilityUpdateBytesDigest: sha256Digest(traceabilityUpdateBytes),
    traceabilitySnapshotBytesDigest: sha256Digest(traceabilitySnapshotBytes),
  },
  limitations: [
    "The checked-in tasks.md is a bounded OpenSpec adapter fixture; it supplies planning proposals only and carries no Core or Gate authority.",
    "Dependency hints remain proposals and are not an authoritative DAG.",
    "WorkBreakdown did not assign, schedule, execute, build, verify, integrate, release, publish, or claim completion of any RP-001 item.",
  ],
});

console.log(JSON.stringify({
  status: "WORK_BREAKDOWN_PROMOTED",
  operation: selectedRoute.selection.operation,
  plugin: invocation.plugin,
  candidate: workBreakdownChangeSetRef.digest,
  gateReview: gateRef.digest,
  gateCandidate: sha256Digest(gateCandidateBytes),
  terminalCheckpoint: checkpointReplayRef.digest,
  traceabilityUpdate: executionRecord.traceabilityUpdateRef.digest,
  moduleExecutionRecord: executionRecord.recordDigest,
  newWorkItems: workItems.length,
  retiredPriorWorkItems: currentBaseline.workItems.length,
  coverage: coverageDispositions.length,
  graphRevision: snapshot.revision,
  ownerApproval: ownerApprovalRef.digest,
  baseline: workBreakdownBaselineRef.digest,
  promotionProof: promotionProofRef.digest,
  progressionAllowed: true,
  nextModule: "work-dependency-analysis",
}, null, 2));
