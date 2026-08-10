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
const dogfoodRelative = "dogfood/work-execution/work-breakdown";
const dogfoodDir = path.join(root, ...dogfoodRelative.split("/"));
const finalRoot = `file:///C:/repos/DevRelay/${dogfoodRelative}`;
fs.mkdirSync(dogfoodDir, { recursive: true });

const API_VERSION = "devrelay.dev/v1alpha1";
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
  "dogfood/work-execution/repository-snapshot.json",
);
const persistedWorkBreakdownBytes = read("project/work-breakdown-baseline.json");
const persistedWorkBreakdown = JSON.parse(persistedWorkBreakdownBytes);
const currentBaselineSourcePath =
  persistedWorkBreakdown.approvedCandidate?.artifactId === "WBCS-WE-001"
    ? "project/history/work-breakdown/1.2.0/work-breakdown-baseline.json"
    : "project/work-breakdown-baseline.json";
const currentBaselineBytes = read(currentBaselineSourcePath);
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const parentGraphBytes = read(
  "dogfood/work-dependency-analysis/work-breakdown/traceability-graph-snapshot.json",
);
const parentTraceabilityUpdateBytes = read(
  "dogfood/work-dependency-analysis/work-breakdown/traceability-update.json",
);
const rootTraceabilityUpdateBytes = read(
  "dogfood/work-breakdown/work-breakdown/traceability-update.json",
);
const priorGraphBytes = read(
  "dogfood/specialist-assignment/work-breakdown/traceability-graph-snapshot.json",
);
const priorTraceabilityUpdateBytes = read(
  "dogfood/specialist-assignment/work-breakdown/traceability-update.json",
);
const priorExecutionRecord = load(
  "dogfood/specialist-assignment/work-breakdown/module-execution-record.json",
);
const requirementsPromotionBytes = read(
  "dogfood/work-execution/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/work-execution/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/specialist-assignment/work-breakdown/work-breakdown-gate-promotion-proof.json",
);
const contractDispositionBytes = read("project/contract-disposition.json");
const contractBaselineBytes = read("project/contract-baseline.json");
const contractPromotionBytes = read(
  "dogfood/work-execution/contract-generation/contract-gate-promotion.json",
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
const rootTraceabilityUpdate = JSON.parse(rootTraceabilityUpdateBytes);
const priorTraceabilityUpdate = JSON.parse(priorTraceabilityUpdateBytes);
const requirementsPromotion = JSON.parse(requirementsPromotionBytes);
const architecturePromotion = JSON.parse(architecturePromotionBytes);
const priorWorkBreakdownProof = JSON.parse(priorWorkBreakdownProofBytes);
const contractDisposition = JSON.parse(contractDispositionBytes);
const contractBaseline = JSON.parse(contractBaselineBytes);
const contractPromotion = JSON.parse(contractPromotionBytes);

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
  "file:///C:/repos/DevRelay/dogfood/work-execution/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/work-execution/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofRef = artifactRef(
  priorWorkBreakdownProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  "file:///C:/repos/DevRelay/dogfood/specialist-assignment/work-breakdown/work-breakdown-gate-promotion-proof.json",
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
  "file:///C:/repos/DevRelay/dogfood/work-execution/contract-generation/contract-gate-promotion.json",
);

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-DEV-WE-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-WE-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 9);
assert.equal(targetArchitectureIds.length, 10);

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
assert.equal(priorAcceptanceIds.length, 34);
assert.equal(priorArchitectureIds.length, 32);
assert.equal(priorContractIds.length, 6);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();
const targetContractIds = contractBaseline.contracts
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-WE-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 5);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, 11);

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
assert.equal(traceabilityRefs.length, 9);

const packageReviewText = [
  "# ApprovedChangePackage review: WorkExecution",
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
  "The package authorizes retirement of the nine completed SpecialistAssignment planning items, records their prior scope as already satisfied using exact release evidence, and adds planning work only for the approved WorkExecution delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-work-execution-v1",
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
  packageId: "ACP-WE-001",
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
  stateId: "PWBS-WE-BASELINED-001",
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
  "openspec-tasks-work-execution-v1",
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
    id: "WI-WE-CONTRACTS",
    objective: "Define the closed provider-neutral WorkExecution artifacts, module surface, and executor port.",
    included: ["Define readiness, binding, attempt, result, evidence, diagnostics, retry, and traceability contracts.", "Forbid executor-owned verification, completion, integration, graph, and readiness authority."],
    excluded: ["Selecting a concrete executor for an invocation, executing work, verifying changes, or integrating changes."],
    deliverables: [["DEL-WE-SCHEMAS", "Closed WorkExecution JSON schemas.", "JsonSchemaSet"], ["DEL-WE-MODULE", "Versioned WorkExecution module definition and executor port.", "ModuleDefinition"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BINDING-001", "AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-OUTPUT-001"],
    architectureRefs: ["EL-WE-MODULE", "EL-WE-EXECUTOR-PORT"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod: "Compile all schemas and exercise positive, negative, unknown-field, forbidden-authority, and executor-substitution fixtures.",
    successCriteria: "Only closed provider-neutral WorkExecution artifacts validate and the executor port exposes no downstream authority.",
    evidenceKind: "work-execution/contract-tests",
  }),
  workItem({
    id: "WI-WE-READINESS",
    objective: "Implement Core-owned selection and proof of exactly one runnable work item.",
    included: ["Derive the ready frontier from the approved dependency DAG and integrated completion facts.", "Bind exactly one selected WorkItem and its prerequisite evidence to a RunnableFrontierProof."],
    excluded: ["Executor-selected readiness, scheduling policy, DAG mutation, or multi-item execution."],
    deliverables: [["DEL-WE-READINESS", "Deterministic runnable-frontier and one-item validator.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-ONE-ITEM-001", "AC-DEV-WE-READINESS-001"],
    architectureRefs: ["EL-WE-INPUT-GUARD", "EL-WE-FRONTIER-VALIDATOR"],
    contractRefs: ["CT-IF-WE-READINESS-PROOF"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-CONTRACTS", "after", "Readiness proof must conform to the canonical WorkExecution contracts.")],
    verificationMethod: "Exercise ready, blocked, stale-completion, changed-DAG, forged-frontier, absent-item, multi-item, and shuffled-input fixtures.",
    successCriteria: "Core alone produces a byte-stable one-item readiness proof and blocks every non-runnable invocation before executor entry.",
    evidenceKind: "work-execution/readiness-tests",
  }),
  workItem({
    id: "WI-WE-BINDING",
    objective: "Validate version-pinned SpecialistProfile-to-executor bindings and declarative host authority.",
    included: ["Resolve the exact assigned profile, executor adapter, version, configuration, tools, grants, and host policy.", "Reject stale, mismatched, missing, substituted, or authority-expanding bindings.", "Define host conformance fixtures for allowed and denied permission paths."],
    excluded: ["Portable Core claiming operating-system enforcement or choosing readiness."],
    deliverables: [["DEL-WE-BINDING", "ExecutionBinding validator and policy model.", "RuntimeLibrary"], ["DEL-WE-HOST-CONFORMANCE", "Host permission conformance fixtures.", "ConformanceFixtureSet"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BINDING-001", "AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-ISOLATION-001"],
    architectureRefs: ["EL-WE-BINDING-VALIDATOR", "EL-WE-INPUT-GUARD"],
    contractRefs: ["CT-IF-WE-EXECUTION-BINDING"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-CONTRACTS", "after", "ExecutionBinding validation consumes the closed canonical schemas.")],
    verificationMethod: "Run exact, stale, missing, mismatched-profile, substituted-adapter, grant-expansion, and host allow-deny fixtures.",
    successCriteria: "Only the exact approved binding reaches the executor port, while host effects remain explicit externally enforced obligations.",
    evidenceKind: "work-execution/binding-host-tests",
  }),
  workItem({
    id: "WI-WE-ATTEMPT-CHECKPOINT",
    objective: "Implement immutable execution-attempt identity, effect checkpointing, interruption, failure, retry lineage, and zero-call replay.",
    included: ["Create a new immutable ExecutionAttempt for each actual invocation.", "Checkpoint exact executor result bytes before canonical progression.", "Link retries to but never overwrite predecessors."],
    excluded: ["Treating replay as a new invocation, overwriting failed attempts, verification, or integration."],
    deliverables: [["DEL-WE-ATTEMPT-CHECKPOINT", "ExecutionAttempt lifecycle and checkpoint controller.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-DETERMINISM-001", "AC-DEV-WE-RETRY-001"],
    architectureRefs: ["EL-WE-CHECKPOINT", "EL-WE-INPUT-GUARD"],
    contractRefs: ["CT-IF-WE-EXECUTOR-INVOCATION"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-CONTRACTS", "after", "Attempt and checkpoint artifacts must validate against the canonical contracts.")],
    verificationMethod: "Exercise success, failure, interruption, retry, exact replay, changed-input, duplicate identity, and predecessor-drift fixtures.",
    successCriteria: "Every effect is represented by one immutable attempt and exact retry performs zero executor calls with byte-identical canonical replay.",
    evidenceKind: "work-execution/attempt-checkpoint-tests",
  }),
  workItem({
    id: "WI-WE-CODEX-TASK-ADAPTER",
    objective: "Implement the first WorkExecution adapter using one user-visible Codex task per work item.",
    included: ["Create a task with the exact bounded work contract, context bundle, authority demand, and handoff schema.", "Preserve task identity, returned raw bytes, diagnostics, and artifacts as executor evidence."],
    excluded: ["Bundling multiple work items into one task, hidden subagent execution, self-verification, or direct integration."],
    deliverables: [["DEL-WE-CODEX-TASK-ADAPTER", "Codex task executor adapter and conformance fixtures.", "ModulePlugin"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-ISOLATION-001", "AC-DEV-WE-ONE-ITEM-001"],
    architectureRefs: ["EL-WE-CODEX-TASK-ADAPTER", "EL-WE-EXECUTOR-PORT"],
    contractRefs: ["CT-IF-WE-EXECUTOR-INVOCATION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    dependencyHints: [hint("WI-WE-BINDING", "after", "The task adapter may run only after exact binding validation."), hint("WI-WE-ATTEMPT-CHECKPOINT", "after", "Task effects require immutable attempt and checkpoint semantics.")],
    verificationMethod: "Create fixture tasks for success, failure, interruption, malformed handoff, authority expansion, and exact retry.",
    successCriteria: "Each runnable work item maps to one auditable user-visible task without acquiring readiness, verification, integration, or graph authority.",
    evidenceKind: "work-execution/codex-task-conformance",
  }),
  workItem({
    id: "WI-WE-A2A-ADAPTER",
    objective: "Implement an optional A2A executor behind the same WorkExecution port.",
    included: ["Bind a version-pinned A2A Agent Card and selected skill to one execution attempt.", "Normalize A2A task, artifact, diagnostic, and terminal-state evidence into the canonical raw executor result."],
    excluded: ["A2A-specific Core branches, capability inference from prose, or remote-agent verification authority."],
    deliverables: [["DEL-WE-A2A-ADAPTER", "A2A WorkExecution adapter manifest and conformance fixtures.", "ModulePlugin"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BINDING-001", "AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-ISOLATION-001"],
    architectureRefs: ["EL-WE-A2A-EXECUTOR-ADAPTER", "EL-WE-EXECUTOR-PORT"],
    contractRefs: ["CT-IF-WE-EXECUTOR-INVOCATION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    dependencyHints: [hint("WI-WE-BINDING", "after", "A2A invocation requires an exact approved executor binding."), hint("WI-WE-ATTEMPT-CHECKPOINT", "after", "Remote task effects use the same immutable attempt semantics.")],
    verificationMethod: "Normalize pinned Agent Card, task, artifact, authentication, cancellation, failure, and terminal-state fixtures through the common executor port.",
    successCriteria: "A2A remains an optional replaceable executor whose canonical behavior and authority match the Codex task binding.",
    evidenceKind: "work-execution/a2a-conformance",
  }),
  workItem({
    id: "WI-WE-RESULT-ASSEMBLY",
    objective: "Assemble canonical WorkExecution outputs from checkpoint-replayed executor bytes.",
    included: ["Validate proposed mutations against bounded scope.", "Produce exactly one ChangeSetDraft, one ExecutionEvidenceBundle, diagnostics, and the immutable attempt record.", "Reject verified, complete, integrated, or undeclared output claims."],
    excluded: ["Running verification, deciding completion, mutating the repository baseline, or integrating changes."],
    deliverables: [["DEL-WE-RESULT-ASSEMBLY", "Deterministic WorkExecution result assembler and validators.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-DETERMINISM-001", "AC-DEV-WE-OUTPUT-001"],
    architectureRefs: ["EL-WE-RESULT-ASSEMBLER", "EL-WE-CHECKPOINT"],
    contractRefs: ["CT-IF-WE-RESULT-ASSEMBLY"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-ATTEMPT-CHECKPOINT", "after", "Canonical assembly consumes only checkpoint-replayed executor bytes."), hint("WI-WE-CONTRACTS", "after", "Outputs must conform to the closed result contracts.")],
    verificationMethod: "Exercise exact output, missing output, extra mutation, scope escape, malformed evidence, forbidden authority, and byte-stable replay fixtures.",
    successCriteria: "Successful execution yields exactly one proposed change and evidence bundle without any downstream completion claim.",
    evidenceKind: "work-execution/result-assembly-tests",
  }),
  workItem({
    id: "WI-WE-TRACEABILITY",
    objective: "Project candidate execution attempts and produced change drafts through a trusted forward-only contributor.",
    included: ["Derive WorkItem attempted-by ExecutionAttempt and successful ExecutionAttempt produces ChangeSetDraft relationships.", "Persist update digest, execution identity, graph version, checkpoint, and atomic merge proof."],
    excluded: ["Executor-authored graph operations, verified-by facts, implemented-by facts, integrated facts, or inverse edges."],
    deliverables: [["DEL-WE-TRACEABILITY", "WorkExecution candidate traceability contributor and merge proof.", "TraceabilityContributor"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-TRACEABILITY-001"],
    architectureRefs: ["EL-WE-TRACEABILITY-CONTRIBUTOR"],
    contractRefs: ["CT-IF-WE-CANDIDATE-TRACEABILITY"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-RESULT-ASSEMBLY", "after", "Traceability projects only validated canonical attempts and change drafts.")],
    verificationMethod: "Project, validate, atomically merge, replay, and query allowed attempt edges while rejecting arbitrary and downstream factual edges.",
    successCriteria: "Only trusted candidate attempted-by and produces facts enter TraceabilityGraph with complete reproducible provenance.",
    evidenceKind: "work-execution/traceability-tests",
  }),
  workItem({
    id: "WI-WE-VERIFICATION",
    objective: "Release-gate WorkExecution across readiness, binding, host boundaries, attempts, adapters, output assembly, traceability, and packaging.",
    included: ["Run focused and full regressions, drift, replay, interruption, authority, substitution, isolation, and package checks.", "Dogfood the ready frontier through separate user-visible execution tasks."],
    excluded: ["Performing WorkItemVerification or claiming that proposed changes are integrated."],
    deliverables: [["DEL-WE-RELEASE-EVIDENCE", "WorkExecution release verification evidence.", "VerificationEvidenceSet"]],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-WE-CODEX-TASK-ADAPTER", "after", "The primary dogfood executor must be available."), hint("WI-WE-A2A-ADAPTER", "after", "Executor substitution must be testable."), hint("WI-WE-RESULT-ASSEMBLY", "after", "Canonical output behavior must be complete."), hint("WI-WE-TRACEABILITY", "after", "Candidate traceability must be complete.")],
    verificationMethod: "Run the canonical package gate, module dogfood frontier, mutation tests, zero-call replay, adapter substitution, and independent contract review.",
    successCriteria: "All WorkExecution release gates pass deterministically while verification and integration remain downstream.",
    evidenceKind: "work-execution/release-gate",
  }),
  workItem({
    id: "WI-WE-DOCUMENTATION",
    objective: "Document WorkExecution configuration, task handoff, host boundary, artifacts, outcomes, retries, and extension points.",
    included: ["Explain readiness, binding, one-item execution, Codex task and A2A adapters, evidence, traceability, and downstream barriers.", "Provide operator examples for success, failure, interruption, retry, and resume."],
    excluded: ["Claiming portable Core enforces host permissions or that executor output is verified or integrated."],
    deliverables: [["DEL-WE-DOCUMENTATION", "WorkExecution operator, adapter, and IDE documentation.", "DocumentationSet"]],
    workType: "documentation-change",
    acceptanceCriterionRefs: ["AC-DEV-WE-BOUNDARY-001", "AC-DEV-WE-ISOLATION-001", "AC-DEV-WE-RETRY-001"],
    architectureRefs: ["EL-WE-MODULE", "EL-WE-CODEX-TASK-ADAPTER", "EL-WE-A2A-EXECUTOR-ADAPTER"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-WE-VERIFICATION", "after", "Documentation must cite final verified behavior and exact artifact examples.")],
    verificationMethod: "Review documentation against approved requirements, architecture, contracts, release evidence, and actual user-visible task handoffs.",
    successCriteria: "Operators can run and audit WorkExecution without confusing execution with readiness, verification, completion, or integration.",
    evidenceKind: "work-execution/documentation-review",
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
      "The prior SpecialistAssignment module work is present in the pinned repository snapshot and has an exact passing Gate promotion proof; it is historical completion evidence, not new WorkExecution work.",
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
assert.equal(coverageDispositions.length, 96);

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
      "The prior SpecialistAssignment deliverable is present in the pinned repository revision and has exact passing Gate evidence; retain its scope as already satisfied instead of carrying completed work into the WorkExecution plan.",
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
  changeSetId: "WBCS-WE-001",
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
  read("dogfood/work-execution/candidate/ProjectOverview.md"),
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
        "Nine prior completed SpecialistAssignment items are retired and their 72 scope dispositions are preserved as already satisfied with exact repository and Gate evidence.",
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
  "module-route-decision-work-execution-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-work-execution-v1",
  runId: "work-execution-dogfood-run-v1",
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
      "C:/repos/DevRelay/dogfood/work-execution/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "work-execution",
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
        "C:/repos/DevRelay/dogfood/work-execution/work-breakdown",
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
    requirementsBaselineObserverContributor,
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
    kind === "work-item" && state === "active" && stableId.startsWith("WI-WE-"),
);
const retiredPriorWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "retired" && stableId.startsWith("WI-SA-"),
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
  "# WorkBreakdown Gate: WorkExecution",
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
  "- PASS: all 9 approved WorkExecution acceptance criteria, all 10 approved architecture elements, and all 5 approved contracts have reciprocal planned coverage.",
  "- PASS: all nine previously completed SpecialistAssignment planning items are retired; their 72 scope dispositions are retained as already satisfied with exact repository and passing dogfood evidence.",
  "- PASS: every new WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one revision, retired stale candidate work and edges, and preserved a replayable atomic merge proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownChangeSetDraft and promote the resulting WorkBreakdownBaseline 1.3.1 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-work-execution-v1",
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
  version: "1.3.1",
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
  proofId: "work-breakdown-gate-promotion-work-execution-v1",
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
    "WorkBreakdown did not assign a specialist, schedule, execute, build, or claim completion of any WorkExecution item.",
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
