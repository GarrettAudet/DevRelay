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
const dogfoodRelative = "dogfood/change-integration/work-breakdown";
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
  "dogfood/change-integration/repository-snapshot.json",
);
// The dogfood invocation is content-bound to the approved pre-CI baseline.
// Never infer that immutable input from mutable project head state.
const currentBaselineSourcePath =
  "project/history/work-breakdown/1.4.0/work-breakdown-baseline.json";
const currentBaselineBytes = read(currentBaselineSourcePath);
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const parentGraphBytes = read(
  "dogfood/work-execution/work-breakdown/traceability-graph-snapshot.json",
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
  "dogfood/work-item-verification/work-breakdown/traceability-graph-snapshot.json",
);
const priorTraceabilityUpdateBytes = read(
  "dogfood/work-item-verification/work-breakdown/traceability-update.json",
);
const parentWorkBreakdownTraceabilityUpdateBytes = read(
  "dogfood/work-execution/work-breakdown/traceability-update.json",
);
const priorExecutionRecord = load(
  "dogfood/work-item-verification/work-breakdown/module-execution-record.json",
);
const requirementsPromotionBytes = read(
  "dogfood/change-integration/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/change-integration/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/work-item-verification/work-breakdown/work-breakdown-gate-promotion-proof.json",
);
const contractDispositionBytes = read("project/contract-disposition.json");
const contractBaselineBytes = read("project/contract-baseline.json");
const contractPromotionBytes = read(
  "dogfood/change-integration/contract-generation/contract-gate-promotion.json",
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
const parentWorkBreakdownTraceabilityUpdate = JSON.parse(parentWorkBreakdownTraceabilityUpdateBytes);
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
  "file:///C:/repos/DevRelay/dogfood/change-integration/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/change-integration/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofRef = artifactRef(
  priorWorkBreakdownProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  "file:///C:/repos/DevRelay/dogfood/work-item-verification/work-breakdown/work-breakdown-gate-promotion-proof.json",
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
  "file:///C:/repos/DevRelay/dogfood/change-integration/contract-generation/contract-gate-promotion.json",
);

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-DEV-CI-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-CI-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 10);
assert.equal(targetArchitectureIds.length, 9);

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
assert.equal(priorAcceptanceIds.length, 53);
assert.equal(priorArchitectureIds.length, 55);
assert.equal(priorContractIds.length, 20);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();
const targetContractIds = contractBaseline.contracts
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-CI-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 7);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, 27);

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
const parentWorkBreakdownTraceabilityUpdateRef = clone(
  priorGraph.appliedUpdates.find(({ digest }) =>
    digest === sha256Digest(Buffer.from(canonicalJson(parentWorkBreakdownTraceabilityUpdate), "utf8"))),
);
assert.equal(parentWorkBreakdownTraceabilityUpdateRef.digest,
  sha256Digest(Buffer.from(canonicalJson(parentWorkBreakdownTraceabilityUpdate), "utf8")));
const traceabilityRefs = priorGraph.nodes
  .filter(({ kind, state }) => kind === "work-item" && state === "active")
  .map(({ nodeId }) => ({ nodeId, artifact: priorGraphRef }))
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId, "en"));
assert.equal(traceabilityRefs.length, 10);

const packageReviewText = [
  "# ApprovedChangePackage review: ChangeIntegration",
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
  "The package authorizes retirement of the ten completed WorkItemVerification planning items, records their prior scope as already satisfied using exact release evidence, and adds planning work only for the approved ChangeIntegration delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-change-integration-v1",
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
  packageId: "ACP-CI-001",
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
  stateId: "PWBS-CI-BASELINED-001",
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
  "openspec-tasks-change-integration-v1",
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
    id: "WI-CI-CONTRACTS",
    objective: "Define the closed provider-neutral ChangeIntegration artifacts, module surface, and integration adapter port.",
    included: ["Define exact subject, plan, raw effect, conflict, outcome, post-state, checkpoint, and traceability artifacts.", "Forbid adapter-owned verification approval, scope mutation, automatic conflict resolution, graph mutation, SystemVerification, and BusinessAcceptance."],
    excluded: ["Performing a repository mutation or accepting adapter prose as integration proof."],
    deliverables: [["DEL-CI-SCHEMAS", "Closed ChangeIntegration JSON schemas.", "JsonSchemaSet"], ["DEL-CI-MODULE", "Versioned ChangeIntegration module definition and integration port.", "ModuleDefinition"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-INPUTS-001", "AC-DEV-CI-OUTCOMES-001"],
    architectureRefs: ["EL-CI-MODULE", "EL-CI-INTEGRATION-PORT"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod: "Compile every schema and exercise positive, negative, unknown-field, forbidden-authority, and adapter-substitution fixtures.",
    successCriteria: "Only closed provider-neutral ChangeIntegration artifacts validate and the adapter port exposes no upstream or downstream authority.",
    evidenceKind: "change-integration/contract-tests",
  }),
  workItem({
    id: "WI-CI-INPUT-PLAN",
    objective: "Bind one exact Gate-approved verified change and deterministically build its immutable integration plan.",
    included: ["Validate WorkItemVerificationGate approval, verified bytes, target snapshot, ref, expected commit, policy, baselines, adapter, and grants.", "Bind the only authorized target transition and idempotency identity."],
    excluded: ["Observing or mutating the live target ref, invoking Git, or deciding success."],
    deliverables: [["DEL-CI-INPUT-PLAN", "Integration input guard and deterministic plan builder.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-DETERMINISM-001", "AC-DEV-CI-INPUTS-001"],
    architectureRefs: ["EL-CI-INPUT-GUARD", "EL-CI-PLAN-BUILDER"],
    contractRefs: ["CT-IF-CI-INPUT-BINDING", "CT-IF-CI-INTEGRATION-PLAN"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-CONTRACTS", "after", "Input and plan artifacts must conform to canonical contracts.")],
    verificationMethod: "Exercise exact, missing, duplicate, substituted, stale, reordered, wrong-target, wrong-policy, and over-granted fixtures.",
    successCriteria: "Core produces one byte-stable IntegrationPlan bound to the exact approved subject and only authorized target transition.",
    evidenceKind: "change-integration/input-plan-tests",
  }),
  workItem({
    id: "WI-CI-TARGET-CAS",
    objective: "Authorize integration only through an exact target-ref compare-and-swap boundary.",
    included: ["Compare the live configured ref to the expected commit immediately before effect authorization.", "Require a host-atomic conditional ref transition and serialize concurrent verified changes."],
    excluded: ["Rebasing stale work, choosing another target, or resolving conflicts."],
    deliverables: [["DEL-CI-TARGET-CAS", "Target-ref compare-and-swap coordinator and concurrency fixtures.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-ATOMICITY-001", "AC-DEV-CI-CAS-001"],
    architectureRefs: ["EL-CI-CAS-COORDINATOR"],
    contractRefs: ["CT-IF-CI-TARGET-CAS"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-INPUT-PLAN", "after", "Compare-and-swap authority consumes one exact immutable IntegrationPlan.")],
    verificationMethod: "Exercise exact, stale, rewritten, missing, deleted, and concurrently advanced refs and prove only one conditional update can proceed.",
    successCriteria: "Only an exact expected target commit receives one bounded effect authorization; every mismatch yields no mutation.",
    evidenceKind: "change-integration/target-cas-tests",
  }),
  workItem({
    id: "WI-CI-LOCAL-GIT-ADAPTER",
    objective: "Implement the V1 bounded local Git integration adapter behind the provider-neutral port.",
    included: ["Apply only the exact verified change under the authorized IntegrationPlan.", "Return exact native pre-state, operation, conflict or failure, post-state, and raw evidence."],
    excluded: ["Selecting targets, altering verified bytes, automatically resolving conflicts, approving integration, or authoring graph operations."],
    deliverables: [["DEL-CI-LOCAL-GIT-ADAPTER", "Local Git integration adapter and conformance fixtures.", "ModulePlugin"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-ATOMICITY-001", "AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-CONFLICT-001"],
    architectureRefs: ["EL-CI-INTEGRATION-PORT", "EL-CI-LOCAL-GIT-ADAPTER"],
    contractRefs: ["CT-IF-CI-ADAPTER-INVOCATION"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-CONTRACTS", "after", "The adapter must implement the canonical integration port."), hint("WI-CI-TARGET-CAS", "after", "The adapter may run only after exact target authorization.")],
    verificationMethod: "Run clean, conflict, malformed, denied, interrupted, wrong-target, changed-byte, and substituted-adapter fixtures against isolated Git repositories.",
    successCriteria: "The adapter performs only one authorized conditional local Git effect and never resolves conflicts or claims lifecycle authority.",
    evidenceKind: "change-integration/local-git-adapter-conformance",
  }),
  workItem({
    id: "WI-CI-CHECKPOINT-RECOVERY",
    objective: "Checkpoint immutable integration plans and effects and recover uncertain outcomes without duplicate mutation.",
    included: ["Persist prepared plan and raw adapter observations with one idempotency identity.", "Reconcile crash-before-effect, crash-after-effect-before-checkpoint, interruption, retry, and exact replay from repository observations."],
    excluded: ["Blindly rerunning an uncertain effect or overwriting prior attempts."],
    deliverables: [["DEL-CI-CHECKPOINT-RECOVERY", "Integration checkpoint controller and uncertain-effect recovery protocol.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-ATOMICITY-001", "AC-DEV-CI-REPLAY-001"],
    architectureRefs: ["EL-CI-CHECKPOINT"],
    contractRefs: ["CT-IF-CI-CHECKPOINT-RECOVERY"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-INPUT-PLAN", "after", "Checkpoint identity binds the exact IntegrationPlan."), hint("WI-CI-LOCAL-GIT-ADAPTER", "after", "Recovery validates native adapter effect observations.")],
    verificationMethod: "Exercise success, failure, interruption, retry, exact replay, changed-input, duplicate identity, and crash-after-effect reconciliation fixtures.",
    successCriteria: "Every effect remains immutable and exact replay performs zero Git mutation calls without duplicating the target transition.",
    evidenceKind: "change-integration/checkpoint-recovery-tests",
  }),
  workItem({
    id: "WI-CI-RESULT-VALIDATION",
    objective: "Validate native integration effects into one closed canonical outcome and exact post-state evidence.",
    included: ["Prove target parentage, tree, ref, verified change identity, raw evidence, and no-mutation failures.", "Return IntegratedChangeRecord plus updated RepositorySnapshot, IntegrationConflictSet, baseline-drift, unable-to-proceed, or execution-failed."],
    excluded: ["Inferring success from exit code or prose, resolving conflicts, or claiming SystemVerification or BusinessAcceptance."],
    deliverables: [["DEL-CI-RESULT-VALIDATION", "Integration result validator and closed outcome assembler.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-CONFLICT-001", "AC-DEV-CI-OUTCOMES-001", "AC-DEV-CI-SUCCESS-001"],
    architectureRefs: ["EL-CI-RESULT-VALIDATOR"],
    contractRefs: ["CT-IF-CI-RESULT-VALIDATION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-CHECKPOINT-RECOVERY", "after", "Result validation consumes only replay-verified native effect evidence."), hint("WI-CI-TARGET-CAS", "after", "Success and no-mutation outcomes are checked against the authorized target transition.")],
    verificationMethod: "Exercise valid, wrong-parent, wrong-tree, wrong-ref, substituted-change, forged-success, no-mutation conflict, drift, unknown-outcome, and downstream-claim fixtures.",
    successCriteria: "Only exact evidenced repository incorporation yields IntegratedChangeRecord; every other state is explicit and cannot unlock completion.",
    evidenceKind: "change-integration/result-validation-tests",
  }),
  workItem({
    id: "WI-CI-TRACEABILITY",
    objective: "Derive forward-only factual integrated-change relationships through a trusted contributor.",
    included: ["Link WorkItem and ChangeSet to IntegratedChangeRecord after validated success.", "Link affected architecture and contracts to the resulting change with atomic merge proof."],
    excluded: ["Adapter-authored graph operations, inverse edges, premature integration facts, acceptance-criterion verified-by facts, SystemVerification, or BusinessAcceptance."],
    deliverables: [["DEL-CI-TRACEABILITY", "Integrated-change traceability contributor and merge proof.", "TraceabilityContributor"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-TRACEABILITY-001"],
    architectureRefs: ["EL-CI-TRACEABILITY"],
    contractRefs: ["CT-IF-CI-TRACEABILITY"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-RESULT-VALIDATION", "after", "Factual edges derive only from one validated IntegratedChangeRecord.")],
    verificationMethod: "Derive, validate, atomically merge, replay, and query allowed forward edges while rejecting arbitrary, inverse, premature, verification, system, and business edges.",
    successCriteria: "Integrated-change lineage is reproducible and factual edges exist only after exact validated integration success.",
    evidenceKind: "change-integration/traceability-tests",
  }),
  workItem({
    id: "WI-CI-VERIFICATION",
    objective: "Release-gate ChangeIntegration across contracts, input binding, compare-and-swap, adapter effects, recovery, outcomes, traceability, and packaging.",
    included: ["Run focused and package-level regression, drift, conflict, atomicity, replay, authority, substitution, and recovery checks.", "Dogfood the first Gate-approved WorkExecution change through WorkItemVerification and local Git integration."],
    excluded: ["Treating repository integration as SystemVerification or BusinessAcceptance, or claiming fixture conformance as live remote-provider conformance."],
    deliverables: [["DEL-CI-RELEASE-EVIDENCE", "ChangeIntegration release verification evidence and first factual integration proof.", "VerificationEvidenceSet"]],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-CI-LOCAL-GIT-ADAPTER", "after", "The real bounded integration effect must be testable."), hint("WI-CI-CHECKPOINT-RECOVERY", "after", "Replay and uncertain-effect behavior must be complete."), hint("WI-CI-RESULT-VALIDATION", "after", "Closed canonical outcomes must be complete."), hint("WI-CI-TRACEABILITY", "after", "Factual post-integration traceability must be complete.")],
    verificationMethod: "Run the canonical package gate, isolated Git mutation tests, conflict and drift tests, crash recovery, zero-call replay, adapter substitution, and the first verified-item integration.",
    successCriteria: "All ChangeIntegration gates pass deterministically, one exact verified item is factually integrated, and SystemVerification remains downstream.",
    evidenceKind: "change-integration/release-gate",
  }),
  workItem({
    id: "WI-CI-DOCUMENTATION",
    objective: "Document ChangeIntegration inputs, plans, compare-and-swap, local Git adapter, conflicts, recovery, outcomes, traceability, and extension points.",
    included: ["Explain exact verified-subject binding, atomic local target effects, no-auto-resolution, uncertain-effect recovery, and downstream SystemVerification.", "Provide operator examples for success, conflict, drift, failure, retry, resume, and future remote adapters."],
    excluded: ["Claiming automatic conflict resolution, remote PR support, deployment, SystemVerification, or BusinessAcceptance in V1."],
    deliverables: [["DEL-CI-DOCUMENTATION", "ChangeIntegration operator, adapter, and IDE documentation.", "DocumentationSet"]],
    workType: "documentation-change",
    acceptanceCriterionRefs: ["AC-DEV-CI-BOUNDARY-001", "AC-DEV-CI-CONFLICT-001", "AC-DEV-CI-OUTCOMES-001", "AC-DEV-CI-REPLAY-001"],
    architectureRefs: ["EL-CI-MODULE", "EL-CI-LOCAL-GIT-ADAPTER"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-CI-VERIFICATION", "after", "Documentation must cite final verified behavior and exact integration evidence.")],
    verificationMethod: "Review documentation against approved requirements, architecture, contracts, release evidence, and actual integration handoffs.",
    successCriteria: "Operators can run and audit ChangeIntegration without confusing integration with verification, system validation, deployment, or business acceptance.",
    evidenceKind: "change-integration/documentation-review",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));
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

const priorCompletionEvidence = [priorWorkBreakdownProofRef, repositoryRef];
const coverageDispositions = [
  ...currentBaseline.coverageDispositions.map(({ scopeKind, scopeRef }) => ({
    scopeKind,
    scopeRef,
    disposition: "already-satisfied",
    rationale:
      "The prior WorkExecution module work is present in the pinned repository snapshot and has an exact passing Gate promotion proof; it is historical completion evidence, not new ChangeIntegration work.",
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
assert.equal(coverageDispositions.length, 154);

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
      "The prior WorkExecution deliverable is present in the pinned repository revision and has exact passing Gate evidence; retain its scope as already satisfied instead of carrying completed work into the ChangeIntegration plan.",
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
  changeSetId: "WBCS-CI-001",
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
  read("dogfood/change-integration/candidate/ProjectOverview.md"),
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
  "module-route-decision-change-integration-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-change-integration-v1",
  runId: "change-integration-dogfood-run-v1",
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
      "C:/repos/DevRelay/dogfood/change-integration/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "change-integration",
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
        "C:/repos/DevRelay/dogfood/change-integration/work-breakdown",
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
    { ref: parentWorkBreakdownTraceabilityUpdateRef, bytes: Buffer.from(canonicalJson(parentWorkBreakdownTraceabilityUpdate), "utf8"), value: parentWorkBreakdownTraceabilityUpdate },
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
    kind === "work-item" && state === "active" && stableId.startsWith("WI-CI-"),
);
const retiredPriorWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "retired" && stableId.startsWith("WI-WIV-"),
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
  "# WorkBreakdown Gate: ChangeIntegration",
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
  "- PASS: all 10 approved ChangeIntegration acceptance criteria, all 9 approved architecture elements, and all 7 approved contracts have reciprocal planned coverage.",
  "- PASS: all ten previously completed WorkItemVerification planning items are retired; their approved scope dispositions are retained as already satisfied with exact repository and passing dogfood evidence.",
  "- PASS: every new WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one revision, retired stale candidate work and edges, and preserved a replayable atomic merge proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownChangeSetDraft and promote the resulting WorkBreakdownBaseline 1.5.0 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-change-integration-v1",
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
  version: "1.5.0",
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
  proofId: "work-breakdown-gate-promotion-change-integration-v1",
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
    "WorkBreakdown did not assign a specialist, schedule, execute, build, or claim completion of any ChangeIntegration item.",
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
