import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertLoadedJsonValueFidelity, normalizeRepositoryArtifactUris, repositoryArtifactUri } from "../../_support/repository-artifact-uri.mjs";

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
  contractDispositionObserverContributor,
  workBreakdownControlTraceabilityContributor,
  workBreakdownTraceabilityContributor,
} from "../../../src/work-breakdown-traceability-contributor.mjs";

const root = process.cwd();
const dogfoodRelative = "dogfood/work-item-verification/work-breakdown";
const outputRelative = `${dogfoodRelative}/scenario-wiv-portable-v3`;
const dogfoodDir = path.join(root, ...outputRelative.split("/"));
const finalRoot = repositoryArtifactUri(dogfoodRelative);
fs.mkdirSync(dogfoodDir, { recursive: true });

const API_VERSION = "devrelay.dev/v1alpha1";
// The restored pre-WIV graph was authored before business-scope observations
// were added to the requirements observer contract. Reuse that exact ownership
// generation for this replay instead of attempting to re-own its assertions.
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

const requirementsBytes = read("project/history/1.5.0/requirements-baseline.json");
const overviewBytes = read("project/history/1.5.0/project-overview-baseline.json");
const architectureBytes = read("dogfood/work-item-verification/architecture-design/architecture-baseline.json");
const repositoryBytes = read(
  "dogfood/work-item-verification/repository-snapshot.json",
);
// The dogfood invocation is content-bound to the approved pre-WIV baseline.
// Never infer that immutable input from mutable project head state.
const currentBaselineSourcePath =
  "project/history/work-breakdown/1.3.1/work-breakdown-baseline.json";
const currentBaselineBytes = read(currentBaselineSourcePath);
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const parentGraphBytes = read(
  "project/history/traceability/snapshots/093d92c0abb05bac94e682af9c72289a04620866d3842a217f97962d9296b2ed.json",
);
const parentTraceabilityUpdateBytes = read(
  "project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json",
);
const grandparentTraceabilityUpdateBytes = read(
  "project/history/traceability/updates/4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067.json",
);
const rootTraceabilityUpdateBytes = read(
  "project/history/traceability/updates/b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822.json",
);
const priorGraphBytes = read(
  "dogfood/work-execution/work-breakdown/traceability-graph-snapshot.json",
);
const priorTraceabilityUpdateBytes = read(
  "dogfood/work-execution/work-breakdown/traceability-update.json",
);
const priorExecutionRecord = load(
  "dogfood/work-execution/work-breakdown/module-execution-record.json",
);
const requirementsPromotionBytes = read(
  "dogfood/work-item-verification/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/work-item-verification/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/work-execution/work-breakdown/work-breakdown-gate-promotion-proof.json",
);
const contractDispositionBytes = read(
  "dogfood/work-item-verification/work-breakdown/context/contract-disposition.json",
);
const contractBaselineBytes = read(
  "dogfood/work-item-verification/work-breakdown/context/contract-baseline.json",
);
const contractPromotionBytes = read(
  "dogfood/work-item-verification/work-breakdown/context/contract-gate-promotion.json",
);


const requirements = JSON.parse(requirementsBytes);
const overview = JSON.parse(overviewBytes);
const architecture = JSON.parse(architectureBytes);
const repository = JSON.parse(repositoryBytes);
const currentBaseline = JSON.parse(currentBaselineBytes);
const capabilityCatalog = JSON.parse(capabilityCatalogBytes);
const priorGraph = JSON.parse(priorGraphBytes);
const parentGraph = JSON.parse(parentGraphBytes);
const parentTraceabilityUpdate = JSON.parse(parentTraceabilityUpdateBytes);
const grandparentTraceabilityUpdate = JSON.parse(
  grandparentTraceabilityUpdateBytes,
);
const rootTraceabilityUpdate = JSON.parse(rootTraceabilityUpdateBytes);
const priorTraceabilityUpdate = JSON.parse(priorTraceabilityUpdateBytes);
const requirementsPromotion = JSON.parse(requirementsPromotionBytes);
const architecturePromotion = JSON.parse(architecturePromotionBytes);
const priorWorkBreakdownProof = JSON.parse(priorWorkBreakdownProofBytes);
const contractDisposition = JSON.parse(contractDispositionBytes);
const contractBaseline = JSON.parse(contractBaselineBytes);
const contractPromotion = JSON.parse(contractPromotionBytes);

for (const [bytes, value] of [
  [requirementsBytes, requirements],
  [overviewBytes, overview],
  [architectureBytes, architecture],
  [repositoryBytes, repository],
  [currentBaselineBytes, currentBaseline],
  [capabilityCatalogBytes, capabilityCatalog],
  [contractDispositionBytes, contractDisposition],
  [contractBaselineBytes, contractBaseline],
  [contractPromotionBytes, contractPromotion],
]) {
  assertLoadedJsonValueFidelity(bytes, value);
}

const requirementsRef = normalizeRepositoryArtifactUris(architecture.requirementsBaseline);
const overviewRef = normalizeRepositoryArtifactUris(architecture.projectOverviewBaseline);
const repositoryRef = normalizeRepositoryArtifactUris(architecture.repositorySnapshot);
const historicalRequirementsRef = clone(architecture.requirementsBaseline);
const historicalOverviewRef = clone(architecture.projectOverviewBaseline);
const historicalRepositoryRef = clone(architecture.repositorySnapshot);
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
  repositoryArtifactUri("project/architecture-baseline.json"),
);
const currentBaselineRef = artifactRef(
  currentBaseline.baselineId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
  currentBaselineBytes,
  repositoryArtifactUri("project/work-breakdown-baseline.json"),
);
validateWorkBreakdownArtifact(currentBaseline, { ref: currentBaselineRef });

const baselineBindings = new Map(
  currentBaseline.inputBindings.map(({ role, artifact }) => [role, artifact]),
);
const capabilityCatalogRef = normalizeRepositoryArtifactUris(baselineBindings.get("capability-catalog"));
const historicalCapabilityCatalogRef = clone(baselineBindings.get("capability-catalog"));
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
  repositoryArtifactUri("dogfood/work-item-verification/requirements-gate-promotion-proof.json"),
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  repositoryArtifactUri("dogfood/work-item-verification/architecture-design/architecture-gate-promotion-proof.json"),
);
const priorWorkBreakdownProofRef = artifactRef(
  priorWorkBreakdownProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  repositoryArtifactUri("dogfood/work-execution/work-breakdown/work-breakdown-gate-promotion-proof.json"),
);

const contractDispositionRef = artifactRef(
  contractDisposition.dispositionId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
  contractDispositionBytes,
  repositoryArtifactUri("project/contract-disposition.json"),
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
  repositoryArtifactUri("dogfood/work-item-verification/contract-generation/contract-gate-promotion.json"),
);
assert.equal(contractBaseline.baselineId, "CB-DEVRELAY-004");
assert.equal(contractDisposition.dispositionId, "CD-DEVRELAY-004");
assert.equal(sha256Digest(contractBaselineBytes), contractPromotion.contractBaseline.digest);
assert.equal(sha256Digest(contractDispositionBytes), contractPromotion.contractDisposition.digest);
assert.equal(contractBaselineRef.artifactId, contractPromotion.contractBaseline.artifactId);
assert.equal(contractBaselineRef.digest, contractPromotion.contractBaseline.digest);
assert.equal(contractDispositionRef.artifactId, contractPromotion.contractDisposition.artifactId);
assert.equal(contractDispositionRef.digest, contractPromotion.contractDisposition.digest);

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-DEV-WIV-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-WIV-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 10);
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
assert.equal(priorAcceptanceIds.length, 43);
assert.equal(priorArchitectureIds.length, 42);
assert.equal(priorContractIds.length, 11);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();
const targetContractIds = contractBaseline.contracts
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-WIV-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 9);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, 20);

const priorGraphRef = clone(priorExecutionRecord.mergeReceipt.snapshotRef);
assert.equal(
  priorGraphRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorGraph), "utf8")),
);
const parentGraphRef = clone(priorGraph.parentGraph);
assert.equal(parentGraphRef.digest, sha256Digest(Buffer.from(canonicalJson(parentGraph), "utf8")));
const parentTraceabilityUpdateRef = clone(
  priorGraph.appliedUpdates.find(({ digest }) =>
    digest === sha256Digest(Buffer.from(canonicalJson(parentTraceabilityUpdate), "utf8"))),
);
assert.equal(parentTraceabilityUpdateRef.digest, sha256Digest(Buffer.from(canonicalJson(parentTraceabilityUpdate), "utf8")));
const grandparentTraceabilityUpdateRef = clone(
  priorGraph.appliedUpdates.find(({ digest }) =>
    digest === sha256Digest(Buffer.from(canonicalJson(grandparentTraceabilityUpdate), "utf8"))),
);
assert.equal(grandparentTraceabilityUpdateRef.digest, sha256Digest(Buffer.from(canonicalJson(grandparentTraceabilityUpdate), "utf8")));
const rootTraceabilityUpdateRef = clone(
  priorGraph.appliedUpdates.find(({ digest }) =>
    digest === sha256Digest(Buffer.from(canonicalJson(rootTraceabilityUpdate), "utf8"))),
);
assert.equal(rootTraceabilityUpdateRef.digest, sha256Digest(Buffer.from(canonicalJson(rootTraceabilityUpdate), "utf8")));
const priorTraceabilityUpdateRef = clone(
  priorExecutionRecord.traceabilityUpdateRef,
);
assert.equal(priorTraceabilityUpdateRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorTraceabilityUpdate), "utf8")));
const traceabilityRefs = priorGraph.nodes
  .filter(({ kind, state }) => kind === "work-item" && state === "active")
  .map(({ nodeId }) => ({ nodeId, artifact: priorGraphRef }))
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId, "en"));
assert.equal(traceabilityRefs.length, 10);

const packageReviewText = [
  "# ApprovedChangePackage review: WorkItemVerification",
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
  "The package authorizes retirement of the ten completed WorkExecution planning items, records their prior scope as already satisfied using exact release evidence, and adds planning work only for the approved WorkItemVerification delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-work-item-verification-v1",
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
  packageId: "ACP-WIV-001",
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
  stateId: "PWBS-WIV-BASELINED-001",
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
  "openspec-tasks-work-item-verification-v1",
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

const workItems = [
  workItem({
    id: "WI-WIV-CONTRACTS",
    objective: "Define the closed provider-neutral WorkItemVerification artifacts, module surface, and verifier port.",
    included: ["Define exact input binding, obligation, verifier binding and invocation, normalized evidence, Gate candidate, and traceability contracts.", "Forbid verifier-owned completion, integration, graph mutation, and workflow progression authority."],
    excluded: ["Executing implementation work, accepting verifier prose as evidence, or integrating a change."],
    deliverables: [["DEL-WIV-SCHEMAS", "Closed WorkItemVerification JSON schemas.", "JsonSchemaSet"], ["DEL-WIV-MODULE", "Versioned WorkItemVerification module definition and verifier port.", "ModuleDefinition"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-INPUTS-001", "AC-DEV-WIV-OUTCOMES-001"],
    architectureRefs: ["EL-WIV-MODULE", "EL-WIV-VERIFIER-PORT"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod: "Compile every schema and exercise positive, negative, unknown-field, forbidden-authority, and adapter-substitution fixtures.",
    successCriteria: "Only closed provider-neutral WorkItemVerification artifacts validate and the verifier port exposes no downstream authority.",
    evidenceKind: "work-item-verification/contract-tests",
  }),
  workItem({
    id: "WI-WIV-SUBJECT-OBLIGATIONS",
    objective: "Bind the exact verification subject and deterministically expand its approved verification plan into explicit obligations.",
    included: ["Validate version-pinned work item, change draft, execution evidence, baselines, repository snapshot, and verification plan.", "Expand every required check and evidence duty into a stable obligation identity."],
    excluded: ["Selecting a verifier, executing checks, or deciding the Gate outcome."],
    deliverables: [["DEL-WIV-SUBJECT-OBLIGATIONS", "Verification input guard and obligation expander.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-DETERMINISM-001", "AC-DEV-WIV-INPUTS-001", "AC-DEV-WIV-PLAN-001"],
    architectureRefs: ["EL-WIV-INPUT-GUARD", "EL-WIV-OBLIGATION-EXPANDER"],
    contractRefs: ["CT-IF-WIV-INPUT-BINDING", "CT-IF-WIV-OBLIGATION-SET"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-CONTRACTS", "after", "Input and obligation artifacts must conform to the canonical contracts.")],
    verificationMethod: "Exercise exact, missing, stale, mismatched, reordered, duplicate, and unauthorized input and obligation fixtures.",
    successCriteria: "Core produces one byte-stable complete obligation set bound to the exact approved verification subject.",
    evidenceKind: "work-item-verification/subject-obligation-tests",
  }),
  workItem({
    id: "WI-WIV-VERIFIER-BINDING",
    objective: "Select and validate independent verifier adapters against explicit capability, tool, grant, and producer-separation requirements.",
    included: ["Bind version-pinned test and review verifiers to covered obligations.", "Reject missing capability, excessive authority, stale configuration, producer conflicts, and incomplete obligation coverage."],
    excluded: ["Letting a verifier choose its own scope or approve its own implementation work."],
    deliverables: [["DEL-WIV-VERIFIER-BINDING", "Independent verifier binding validator and conformance fixtures.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-INDEPENDENCE-001", "AC-DEV-WIV-PLAN-001"],
    architectureRefs: ["EL-WIV-BINDING-VALIDATOR", "EL-WIV-VERIFIER-PORT"],
    contractRefs: ["CT-IF-WIV-VERIFIER-BINDING", "CT-IF-WIV-VERIFIER-INVOCATION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-CONTRACTS", "after", "Bindings use the canonical verifier contracts."), hint("WI-WIV-SUBJECT-OBLIGATIONS", "after", "Binding coverage is evaluated against the exact obligation set.")],
    verificationMethod: "Exercise independent, self-verifying, stale, under-capable, over-granted, missing-tool, partial-coverage, and substituted-verifier fixtures.",
    successCriteria: "Every obligation is assigned only to an exact eligible verifier binding independent of the change producer.",
    evidenceKind: "work-item-verification/verifier-binding-tests",
  }),
  workItem({
    id: "WI-WIV-ATTEMPT-CHECKPOINT",
    objective: "Persist immutable verification attempts and checkpoint exact native verifier output before normalization or policy evaluation.",
    included: ["Create one immutable attempt identity per real verifier invocation.", "Support interruption, failure, retry lineage, and zero-call replay without overwriting predecessor evidence."],
    excluded: ["Treating replay as a new invocation or allowing mutable evidence to reach the Gate."],
    deliverables: [["DEL-WIV-ATTEMPT-CHECKPOINT", "Verification attempt lifecycle and effect checkpoint controller.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-DETERMINISM-001", "AC-DEV-WIV-RETRY-001"],
    architectureRefs: ["EL-WIV-CHECKPOINT"],
    contractRefs: ["CT-IF-WIV-VERIFIER-INVOCATION"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-CONTRACTS", "after", "Attempt and invocation records must conform to canonical contracts.")],
    verificationMethod: "Exercise success, failure, interruption, retry, exact replay, changed-input, duplicate identity, and predecessor-drift fixtures.",
    successCriteria: "Every verifier effect has immutable evidence and exact retry performs zero verifier calls with byte-identical replay.",
    evidenceKind: "work-item-verification/attempt-checkpoint-tests",
  }),
  workItem({
    id: "WI-WIV-VERIFIER-ADAPTERS",
    objective: "Implement bounded test and review verifier adapters behind the common evidence-only verifier port.",
    included: ["Normalize machine test results and independent review findings without losing native evidence.", "Prove adapter substitution cannot alter Core-owned obligations, policy, Gate, or traceability authority."],
    excluded: ["Verifier-authored Gate decisions, graph operations, integration, or workflow progression."],
    deliverables: [["DEL-WIV-TEST-ADAPTER", "Test verifier adapter and conformance fixtures.", "ModulePlugin"], ["DEL-WIV-REVIEW-ADAPTER", "Independent review verifier adapter and conformance fixtures.", "ModulePlugin"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-INDEPENDENCE-001"],
    architectureRefs: ["EL-WIV-MODULE", "EL-WIV-VERIFIER-PORT", "EL-WIV-TEST-ADAPTER", "EL-WIV-REVIEW-ADAPTER"],
    contractRefs: ["CT-IF-WIV-VERIFIER-INVOCATION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-VERIFIER-BINDING", "after", "Adapters may run only through exact approved bindings."), hint("WI-WIV-ATTEMPT-CHECKPOINT", "after", "Native verifier effects require immutable checkpoints.")],
    verificationMethod: "Run equivalent pass, fail, malformed, partial, timeout, and substituted-adapter fixtures through both bindings.",
    successCriteria: "Replaceable verifiers return evidence only and canonical behavior remains provider-neutral.",
    evidenceKind: "work-item-verification/adapter-conformance",
  }),
  workItem({
    id: "WI-WIV-EVIDENCE-NORMALIZATION",
    objective: "Normalize checkpointed verifier output into subject-bound evidence with an explicit disposition for every obligation.",
    included: ["Preserve native artifacts and provenance.", "Reject missing, duplicate, contradictory, stale, unbound, or unverifiable evidence."],
    excluded: ["Inferring pass from prose, filenames, or incomplete evidence."],
    deliverables: [["DEL-WIV-EVIDENCE-NORMALIZATION", "Deterministic evidence normalizer and obligation coverage validator.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-DETERMINISM-001", "AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-PLAN-001"],
    architectureRefs: ["EL-WIV-CHECKPOINT", "EL-WIV-EVIDENCE-NORMALIZER"],
    contractRefs: ["CT-IF-WIV-EVIDENCE-NORMALIZATION", "CT-IF-WIV-OBLIGATION-SET"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-SUBJECT-OBLIGATIONS", "after", "Normalization must cover the exact obligation set."), hint("WI-WIV-ATTEMPT-CHECKPOINT", "after", "Normalization consumes only checkpoint-replayed native bytes."), hint("WI-WIV-VERIFIER-ADAPTERS", "after", "Adapter evidence shapes must be available for conformance.")],
    verificationMethod: "Exercise complete, missing, duplicate, contradictory, stale, forged, wrong-subject, reordered, and byte-stable replay evidence fixtures.",
    successCriteria: "Canonical evidence is complete, provenance-preserving, exact-subject-bound, and deterministic.",
    evidenceKind: "work-item-verification/evidence-normalization-tests",
  }),
  workItem({
    id: "WI-WIV-POLICY-GATE",
    objective: "Evaluate normalized evidence through deterministic policy and produce one closed WorkItemVerification Gate outcome.",
    included: ["Support pass, fix, diagnose, clarify, and block outcomes with machine-readable reasons.", "Prevent progression unless every mandatory obligation passes and independence and evidence rules hold."],
    excluded: ["Changing implementation, weakening approved criteria, or integrating a passing change."],
    deliverables: [["DEL-WIV-POLICY-GATE", "Policy evaluator, independent Gate, and outcome fixtures.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-GATE-001", "AC-DEV-WIV-OUTCOMES-001"],
    architectureRefs: ["EL-WIV-POLICY-EVALUATOR", "EL-WIV-GATE"],
    contractRefs: ["CT-IF-WIV-POLICY-EVALUATION", "CT-IF-WIV-GATE-CANDIDATE"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-EVIDENCE-NORMALIZATION", "after", "Policy evaluates only complete canonical evidence."), hint("WI-WIV-VERIFIER-BINDING", "after", "Gate validates exact verifier independence and authority.")],
    verificationMethod: "Exercise each closed outcome, mixed findings, missing mandatory evidence, self-verification, policy drift, and shuffled-input fixtures.",
    successCriteria: "Only evidence-complete independent verification can pass, with all other states routed to one explicit non-pass outcome.",
    evidenceKind: "work-item-verification/policy-gate-tests",
  }),
  workItem({
    id: "WI-WIV-TRACEABILITY",
    objective: "Derive candidate and approved forward-only verification relationships through trusted contributors.",
    included: ["Project candidate verification attempts and evidence without claiming success.", "After exact Gate approval, add AcceptanceCriterion verified-by Evidence and WorkItem verified-by Evidence relationships with atomic merge proof."],
    excluded: ["Adapter-authored graph operations, inverse edges, integration facts, or pass claims before Gate approval."],
    deliverables: [["DEL-WIV-TRACEABILITY", "Candidate and approved WorkItemVerification traceability contributors.", "TraceabilityContributor"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-TRACEABILITY-001"],
    architectureRefs: ["EL-WIV-CANDIDATE-TRACE", "EL-WIV-APPROVED-TRACE"],
    contractRefs: ["CT-IF-WIV-CANDIDATE-TRACEABILITY", "CT-IF-WIV-APPROVED-TRACEABILITY"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-EVIDENCE-NORMALIZATION", "after", "Candidate relationships derive from validated canonical evidence."), hint("WI-WIV-POLICY-GATE", "after", "Approved relationships require the exact passing Gate candidate.")],
    verificationMethod: "Derive, validate, atomically merge, replay, and query allowed forward edges while rejecting arbitrary, inverse, premature, and integration edges.",
    successCriteria: "Verification provenance is reproducible and factual success edges exist only after exact Gate approval.",
    evidenceKind: "work-item-verification/traceability-tests",
  }),
  workItem({
    id: "WI-WIV-VERIFICATION",
    objective: "Release-gate WorkItemVerification across contracts, obligations, independence, attempts, adapters, evidence, policy, Gate, traceability, and packaging.",
    included: ["Run focused and full regression, drift, replay, retry, authority, substitution, and package checks.", "Dogfood one completed WorkExecution change through the full verification path."],
    excluded: ["Integrating the verified change or treating fixture conformance as live provider conformance."],
    deliverables: [["DEL-WIV-RELEASE-EVIDENCE", "WorkItemVerification release verification evidence.", "VerificationEvidenceSet"]],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WIV-VERIFIER-ADAPTERS", "after", "Verifier substitution must be testable."), hint("WI-WIV-EVIDENCE-NORMALIZATION", "after", "Canonical evidence behavior must be complete."), hint("WI-WIV-POLICY-GATE", "after", "Closed outcomes and progression rules must be complete."), hint("WI-WIV-TRACEABILITY", "after", "Candidate and approved traceability must be complete.")],
    verificationMethod: "Run the canonical package gate, end-to-end dogfood verification, mutation tests, zero-call replay, adapter substitution, and independent contract review.",
    successCriteria: "All WorkItemVerification release gates pass deterministically while ChangeIntegration remains downstream.",
    evidenceKind: "work-item-verification/release-gate",
  }),
  workItem({
    id: "WI-WIV-DOCUMENTATION",
    objective: "Document WorkItemVerification inputs, obligations, verifier bindings, evidence, outcomes, retries, trust boundaries, and extension points.",
    included: ["Explain test and review adapters, independent verification, candidate versus approved traceability, and downstream ChangeIntegration.", "Provide operator examples for pass, fix, diagnose, clarify, block, retry, and resume."],
    excluded: ["Claiming that a verifier implements work or that passing verification automatically integrates a change."],
    deliverables: [["DEL-WIV-DOCUMENTATION", "WorkItemVerification operator, adapter, and IDE documentation.", "DocumentationSet"]],
    workType: "documentation-change",
    acceptanceCriterionRefs: ["AC-DEV-WIV-BOUNDARY-001", "AC-DEV-WIV-EVIDENCE-001", "AC-DEV-WIV-OUTCOMES-001", "AC-DEV-WIV-RETRY-001"],
    architectureRefs: ["EL-WIV-MODULE", "EL-WIV-TEST-ADAPTER", "EL-WIV-REVIEW-ADAPTER"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-WIV-VERIFICATION", "after", "Documentation must cite final verified behavior and exact artifact examples.")],
    verificationMethod: "Review documentation against approved requirements, architecture, contracts, release evidence, and actual verification handoffs.",
    successCriteria: "Operators can run and audit WorkItemVerification without confusing verification with implementation or integration.",
    evidenceKind: "work-item-verification/documentation-review",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));
assert.equal(workItems.length, 10);

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

const priorCompletionEvidence = [priorWorkBreakdownProofRef, repositoryRef];
const coverageDispositions = [
  ...currentBaseline.coverageDispositions.map(({ scopeKind, scopeRef }) => ({
    scopeKind,
    scopeRef,
    disposition: "already-satisfied",
    rationale:
      "The prior WorkExecution module work is present in the pinned repository snapshot and has an exact passing Gate promotion proof; it is historical completion evidence, not new WorkItemVerification work.",
    currentEvidence: clone(priorCompletionEvidence),
  })),
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
assert.equal(coverageDispositions.length, 128);

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
      "The prior WorkExecution deliverable is present in the pinned repository revision and has exact passing Gate evidence; retain its scope as already satisfied instead of carrying completed work into the WorkItemVerification plan.",
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
  changeSetId: "WBCS-WIV-001",
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
  read("dogfood/work-item-verification/candidate/ProjectOverview.md"),
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
        "Ten prior completed WorkExecution items are retired and their 96 scope dispositions are preserved as already satisfied with exact repository and Gate evidence.",
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
  "module-route-decision-work-item-verification-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-work-item-verification-v1",
  runId: "work-item-verification-dogfood-run-v1",
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
    "requirements-baseline": [historicalRequirementsRef],
    "project-overview-baseline": [historicalOverviewRef],
    "architecture-baseline": [architectureRef],
    "contract-disposition": [contractDispositionRef],
    "capability-catalog": [historicalCapabilityCatalogRef],
    "current-repository-snapshot": [historicalRepositoryRef],
    "current-work-breakdown-baseline": [currentBaselineRef],
    "approved-change-package": [approvedChangePackageRef],
  },
  options: {},
  config: {
    projectRoot: "C:/repos/DevRelay",
    planningOutputRoot:
      "C:/repos/DevRelay/dogfood/work-item-verification/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "work-item-verification",
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
        "C:/repos/DevRelay/dogfood/work-item-verification/work-breakdown",
    },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ],
};
const invocationBytes = writeJson("work-breakdown.invocation.json", invocation);

const effectCheckpoints = createCheckpointStore();
const traceabilityCheckpoints = createTraceabilityCheckpointStore();
const graphStore = createInMemoryTraceabilityStore();
graphStore.initialize(priorGraph.graphId, {
  ref: priorGraphRef,
  bytes: Buffer.from(canonicalJson(priorGraph), "utf8"),
  value: priorGraph,
});
const restoredPriorMerge = graphStore.commit({
  graphId: priorGraph.graphId,
  expectedHead: priorGraphRef,
  artifacts: [
    { ref: parentGraphRef, bytes: Buffer.from(canonicalJson(parentGraph), "utf8"), value: parentGraph },
    { ref: parentTraceabilityUpdateRef, bytes: Buffer.from(canonicalJson(parentTraceabilityUpdate), "utf8"), value: parentTraceabilityUpdate },
    { ref: grandparentTraceabilityUpdateRef, bytes: Buffer.from(canonicalJson(grandparentTraceabilityUpdate), "utf8"), value: grandparentTraceabilityUpdate },
    { ref: rootTraceabilityUpdateRef, bytes: Buffer.from(canonicalJson(rootTraceabilityUpdate), "utf8"), value: rootTraceabilityUpdate },
    { ref: priorTraceabilityUpdateRef, bytes: Buffer.from(canonicalJson(priorTraceabilityUpdate), "utf8"), value: priorTraceabilityUpdate },
  ],
  updateRef: priorTraceabilityUpdateRef,
  result: priorExecutionRecord.mergeReceipt,
});
assert.ok(restoredPriorMerge);

const graph = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store: graphStore,
  contributors: [
    replayRequirementsObserverContributor,
    architectureBaselineObserverContributor,
    contractDispositionObserverContributor,
    workBreakdownTraceabilityContributor,
    workBreakdownControlTraceabilityContributor,
  ],
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
  TRACEABILITY_VOCABULARY,
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

const evidenceByRef = new Map([
  [refKey(priorWorkBreakdownProofRef), priorWorkBreakdownProofBytes],
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
const activeWeWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-WIV-"),
);
const retiredPriorWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "retired" && stableId.startsWith("WI-WE-"),
);
assert.equal(activeWeWorkItems.length, workItems.length);
assert.equal(retiredPriorWorkItems.length, currentBaseline.workItems.length);
const objectivePath = queryTraceabilityGraph(snapshot, {
  start: {
    kind: "business-objective",
    stableId: "BO-DEV-QUALITY-001",
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
  "work-breakdown-runtime-proof-wda-v1",
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
];
const gateText = [
  "# WorkBreakdown Gate: WorkItemVerification",
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
  "- PASS: all 10 approved WorkItemVerification acceptance criteria, all 13 approved architecture elements, and all 9 approved contracts have reciprocal planned coverage.",
  "- PASS: all ten previously completed WorkExecution planning items are retired; their 96 scope dispositions are retained as already satisfied with exact repository and passing dogfood evidence.",
  "- PASS: every new WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one revision, retired stale candidate work and edges, and preserved a replayable atomic merge proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownChangeSetDraft and promote the resulting WorkBreakdownBaseline 1.4.0 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-work-item-verification-v1",
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-review/v1",
    mediaType: "text/markdown",
  },
  gateBytes,
  finalUri("work-breakdown-gate.md"),
);

const applied = applyWorkBreakdownChangeSet({
  baseline: currentBaseline,
  baselineRef: currentBaselineRef,
  changeSet: workBreakdownChangeSet,
});
const dispositionMap = new Map(
  currentBaseline.coverageDispositions.map((entry) => [
    `${entry.scopeKind}\u0000${entry.scopeRef}`,
    entry,
  ]),
);
for (const entry of workBreakdownChangeSet.coverageDispositions) {
  dispositionMap.set(`${entry.scopeKind}\u0000${entry.scopeRef}`, entry);
}
const promotedCoverage = [...dispositionMap.values()].sort((left, right) =>
  `${left.scopeKind}\u0000${left.scopeRef}`.localeCompare(
    `${right.scopeKind}\u0000${right.scopeRef}`,
    "en",
  ),
);
const workBreakdownBaseline = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownBaseline",
  baselineId: currentBaseline.baselineId,
  version: "1.4.0",
  approvedCandidate: workBreakdownChangeSetRef,
  inputBindings: clone(workBreakdownChangeSet.inputBindings),
  workItems: clone(applied.workItems),
  coverageDispositions: clone(promotedCoverage),
  approvalEvidence: [gateRef],
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
assert.equal(
  gatePromotion.commitPayload.baseline.bytesBase64,
  workBreakdownBaselineBytes.toString("base64"),
);

const promotionProof = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownGatePromotionProof",
  proofId: "work-breakdown-gate-promotion-work-item-verification-v1",
  status: "promoted",
  operation: gatePromotion.operation,
  candidate: workBreakdownChangeSetRef,
  previousWorkBreakdownBaseline: currentBaselineRef,
  promotedWorkBreakdownBaseline: workBreakdownBaselineRef,
  gateReview: gateRef,
  runtimeProof: runtimeProofRef,
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

const dogfoodProof = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownDogfoodProof",
  status: "pass",
  module: { id: "work-breakdown", version: "0.1.0" },
  operation: "decompose-change",
  plugin: invocation.plugin,
  adapterExecution: {
    mode: "bounded-fixture",
    nativeCapability: "tasks.md",
    liveCliInvoked: false,
  },
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
    workBreakdownBaseline: workBreakdownBaselineRef,
    traceabilityUpdate: executionRecord.traceabilityUpdateRef,
    traceabilityGraph: executionRecord.mergeReceipt.snapshotRef,
    gatePromotionProof: artifactRef(
      promotionProof.proofId,
      {
        schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
        mediaType: "application/json",
      },
      promotionProofBytes,
      finalUri("work-breakdown-gate-promotion-proof.json"),
    ),
  },
  assertions: {
    retiredPriorWorkItems: currentBaseline.workItems.length,
    newWorkItems: workItems.length,
    alreadySatisfiedCoverage: 22,
    plannedAcceptanceCoverage: targetAcceptanceIds.length,
    plannedArchitectureCoverage: targetArchitectureIds.length,
    graphRevisionBefore: priorGraph.revision,
    graphRevisionAfter: snapshot.revision,
    objectiveToWorkItemPathCount: objectivePath.paths.length,
    normalReplayAdapterCalls: adapterCalls.length - callsBeforeReplay,
    checkpointVerificationAdapterCalls:
      adapterCalls.length - callsBeforeCheckpointVerification,
  },
  evidence: {
    runtimeProofDigest: runtimeProofRef.digest,
    gateDigest: gateRef.digest,
    promotionProofDigest: sha256Digest(promotionProofBytes),
    moduleExecutionRecordDigest: sha256Digest(executionRecordBytes),
    traceabilityUpdateBytesDigest: sha256Digest(traceabilityUpdateBytes),
    traceabilitySnapshotBytesDigest: sha256Digest(traceabilitySnapshotBytes),
  },
  limitations: [
    "The checked-in tasks.md is a bounded OpenSpec adapter fixture; no live OpenSpec CLI was invoked.",
    "Dependency hints remain proposals and are not an authoritative DAG.",
    "WorkBreakdown did not assign a specialist, schedule, execute, build, or claim completion of any WorkItemVerification item.",
  ],
};
writeJson("work-breakdown-dogfood-proof.json", dogfoodProof);

console.log(
  JSON.stringify(
    {
      status: "WORK_BREAKDOWN_PROMOTED",
      operation: selectedRoute.selection.operation,
      plugin: invocation.plugin,
      candidate: workBreakdownChangeSetRef.digest,
      baseline: workBreakdownBaselineRef.digest,
      newWorkItems: workItems.length,
      retiredPriorWorkItems: currentBaseline.workItems.length,
      coverage: coverageDispositions.length,
      graphRevision: snapshot.revision,
      progressionAllowed: promotionProof.workDependencyAnalysisProgressionAllowed,
    },
    null,
    2,
  ),
);
