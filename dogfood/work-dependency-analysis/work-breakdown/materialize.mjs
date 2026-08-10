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
const dogfoodRelative = "dogfood/work-dependency-analysis/work-breakdown";
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

const requirementsBytes = read("project/history/1.1.0/requirements-baseline.json");
const overviewBytes = read("project/history/1.1.0/project-overview-baseline.json");
const architectureBytes = read("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json");
const repositoryBytes = read(
  "dogfood/work-dependency-analysis/repository-snapshot.json",
);
const currentBaselineBytes = read(
  "dogfood/work-breakdown/work-breakdown/work-breakdown-baseline.json",
);
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const priorGraphBytes = read(
  "dogfood/work-breakdown/work-breakdown/traceability-graph-snapshot.json",
);
const priorTraceabilityUpdateBytes = read(
  "dogfood/work-breakdown/work-breakdown/traceability-update.json",
);
const priorExecutionRecord = load(
  "dogfood/work-breakdown/work-breakdown/module-execution-record.json",
);
const requirementsPromotionBytes = read(
  "dogfood/work-dependency-analysis/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/work-dependency-analysis/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/work-breakdown/work-breakdown/work-breakdown-dogfood-proof.json",
);

const requirements = JSON.parse(requirementsBytes);
const overview = JSON.parse(overviewBytes);
const architecture = JSON.parse(architectureBytes);
const repository = JSON.parse(repositoryBytes);
const currentBaseline = JSON.parse(currentBaselineBytes);
const capabilityCatalog = JSON.parse(capabilityCatalogBytes);
const priorGraph = JSON.parse(priorGraphBytes);
const priorTraceabilityUpdate = JSON.parse(priorTraceabilityUpdateBytes);
const requirementsPromotion = JSON.parse(requirementsPromotionBytes);
const architecturePromotion = JSON.parse(architecturePromotionBytes);
const priorWorkBreakdownProof = JSON.parse(priorWorkBreakdownProofBytes);

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
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/work-breakdown/work-breakdown-baseline.json",
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
  "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofRef = artifactRef(
  "work-breakdown-dogfood-proof-v1",
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-dogfood/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/work-breakdown/work-breakdown-dogfood-proof.json",
);

const approvedNotApplicable = {
  apiVersion: API_VERSION,
  kind: "ApprovedNotApplicable",
  approvalId: "ANA-WDA-CONTRACTS",
  purpose: "contract-disposition",
  rationale:
    "The approved ArchitectureDesign baseline defers independently governed interface contracts to ContractGeneration; WorkDependencyAnalysis V0.4 introduces only internal orchestration artifact contracts.",
  authority: {
    id: "architecture-gate/0.1.0",
    role: "approved-policy",
  },
  approvalEvidence: [architecturePromotionRef],
};
const approvedNotApplicableBytes = writeJson(
  "approved-not-applicable.json",
  approvedNotApplicable,
);
const approvedNotApplicableRef = artifactRef(
  approvedNotApplicable.approvalId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable,
  approvedNotApplicableBytes,
  finalUri("approved-not-applicable.json"),
);
validateWorkBreakdownArtifact(approvedNotApplicable, {
  ref: approvedNotApplicableRef,
});

const contractDisposition = {
  apiVersion: API_VERSION,
  kind: "ContractDisposition",
  dispositionId: "CD-WDA-NOT-APPLICABLE",
  mode: "not-applicable",
  notApplicable: approvedNotApplicable,
};
const contractDispositionBytes = writeJson(
  "contract-disposition.json",
  contractDisposition,
);
const contractDispositionRef = artifactRef(
  contractDisposition.dispositionId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
  contractDispositionBytes,
  finalUri("contract-disposition.json"),
);
validateWorkBreakdownArtifact(contractDisposition, {
  ref: contractDispositionRef,
});

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-WDA-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-WDA-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 16);
assert.equal(targetArchitectureIds.length, 10);

const priorAcceptanceIds = currentBaseline.coverageDispositions
  .filter(({ scopeKind }) => scopeKind === "acceptance-criterion")
  .map(({ scopeRef }) => scopeRef)
  .sort();
const priorArchitectureIds = currentBaseline.coverageDispositions
  .filter(({ scopeKind }) => scopeKind === "architecture")
  .map(({ scopeRef }) => scopeRef)
  .sort();
assert.equal(priorAcceptanceIds.length, 10);
assert.equal(priorArchitectureIds.length, 12);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();

const priorGraphRef = clone(priorExecutionRecord.mergeReceipt.snapshotRef);
assert.equal(
  priorGraphRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorGraph), "utf8")),
);
const priorTraceabilityUpdateRef = clone(
  priorExecutionRecord.traceabilityUpdateRef,
);
assert.equal(priorTraceabilityUpdateRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorTraceabilityUpdate), "utf8")));
const traceabilityRefs = priorGraph.nodes
  .filter(({ kind, state }) => kind === "work-item" && state === "active")
  .map(({ nodeId }) => ({ nodeId, artifact: priorGraphRef }))
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId, "en"));
assert.equal(traceabilityRefs.length, 7);

const packageReviewText = [
  "# ApprovedChangePackage review: WorkDependencyAnalysis",
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
  "The package authorizes retirement of the seven completed WorkBreakdown-module planning items, records their prior scope as already satisfied using exact release evidence, and adds planning work only for the approved WorkDependencyAnalysis delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-wda-v1",
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
  packageId: "ACP-WDA-001",
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
  approvedContractChangeDisposition: architecturePromotionRef,
  authorizedScope: {
    acceptanceCriteria: authorizedAcceptanceIds,
    architecture: authorizedArchitectureIds,
    contracts: [],
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
  stateId: "PWBS-WDA-BASELINED-001",
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
  "openspec-tasks-work-dependency-analysis-v1",
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
    "contract-refs": [],
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
    id: "WI-WDA-CONTRACTS",
    objective:
      "Define the provider-neutral WorkDependencyAnalysis artifacts, module surface, and proposal port.",
    included: [
      "Define candidate snapshot, dependency proposal, authoritative DAG, coverage, diagnostics, and baseline contracts.",
      "Keep proposal providers outside Core-owned graph and policy authority.",
    ],
    excluded: ["Executing, assigning, scheduling, or estimating work items."],
    deliverables: [
      ["DEL-WDA-SCHEMAS", "Closed WorkDependencyAnalysis JSON schemas.", "JsonSchemaSet"],
      ["DEL-WDA-MODULE", "Versioned WorkDependencyAnalysis module definition.", "ModuleDefinition"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-DETERMINISM-001",
      "AC-WDA-NO-EXECUTION-001",
      "AC-WDA-PLUGIN-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WDA-MODULE", "EL-WDA-PROPOSER-PORT"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod: "Run positive and negative closed-contract fixtures.",
    successCriteria:
      "Only provider-neutral, planning-only artifacts and proposal-port operations validate.",
    evidenceKind: "work-dependency-analysis/contract-tests",
  }),
  workItem({
    id: "WI-WDA-SNAPSHOT",
    objective:
      "Build one immutable full candidate work-breakdown snapshot with relevant version-pinned context slices.",
    included: [
      "Bind the complete candidate work-item set and every relevant baseline, repository, and traceability context slice.",
      "Reject incoherent or drifted context before proposal invocation.",
    ],
    excluded: ["Selecting dependency edges or policy outcomes."],
    deliverables: [
      ["DEL-WDA-SNAPSHOT-BUILDER", "Deterministic candidate snapshot builder.", "RuntimeLibrary"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-CONTEXT-SLICES-001",
      "AC-WDA-INPUT-COHERENCE-001",
    ],
    architectureRefs: ["EL-WDA-SNAPSHOT"],
    capabilities: ["CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint(
        "WI-WDA-CONTRACTS",
        "after",
        "The snapshot must implement the canonical artifact contract; authority remains with WorkDependencyAnalysis.",
      ),
    ],
    verificationMethod:
      "Replay identical inputs and mutate each pinned baseline, context slice, and repository identity.",
    successCriteria:
      "Identical inputs yield identical snapshots and every stale or incoherent binding is rejected before proposal.",
    evidenceKind: "work-dependency-analysis/snapshot-tests",
  }),
  workItem({
    id: "WI-WDA-NATIVE-PROPOSER",
    objective:
      "Implement the default native structured dependency proposer over the immutable candidate snapshot.",
    included: [
      "Propose typed ordering relationships and dispositions with deterministic source references.",
      "Return proposals only through the proposal port.",
    ],
    excluded: ["Mutating Core graph state or declaring a proposal authoritative."],
    deliverables: [
      ["DEL-WDA-NATIVE-PROPOSER", "Native structured dependency proposer.", "RuntimeLibrary"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-DETERMINISM-001",
      "AC-WDA-NATIVE-PROPOSER-001",
      "AC-WDA-NO-EXECUTION-001",
    ],
    architectureRefs: ["EL-WDA-NATIVE-PROPOSER"],
    capabilities: ["CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-SNAPSHOT", "after", "Proposal consumes the exact candidate snapshot."),
    ],
    verificationMethod:
      "Run proposal fixtures twice and compare normalized proposal bytes and source closure.",
    successCriteria:
      "The native proposer is deterministic, source-closed, and never receives graph mutation authority.",
    evidenceKind: "work-dependency-analysis/native-proposer-tests",
  }),
  workItem({
    id: "WI-WDA-OPTIONAL-ADAPTERS",
    objective:
      "Publish optional Task Master and OpenSpec proposal adapters behind the same bounded proposal port.",
    included: [
      "Normalize provider-native proposals into the canonical dependency proposal contract.",
      "Declare exact capabilities and planning-only commands.",
    ],
    excluded: ["Making either optional adapter a Core dependency or execution engine."],
    deliverables: [
      ["DEL-WDA-OPTIONAL-ADAPTERS", "Optional Task Master and OpenSpec adapter manifests.", "ModulePluginSet"],
    ],
    workType: "configuration-change",
    acceptanceCriterionRefs: [
      "AC-WDA-NO-EXECUTION-001",
      "AC-WDA-PLUGIN-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WDA-OPTIONAL-PROPOSERS", "EL-WDA-PROPOSER-PORT"],
    capabilities: ["CAP-CONTRACT-AUTHORING"],
    dependencyHints: [
      hint("WI-WDA-CONTRACTS", "after", "Adapters must conform to the proposal port."),
    ],
    verificationMethod:
      "Validate both manifests and normalize bounded provider fixtures through the shared port.",
    successCriteria:
      "Either adapter can be swapped without changing Core mechanics, policy, Gate, or output contracts.",
    evidenceKind: "work-dependency-analysis/plugin-conformance",
  }),
  workItem({
    id: "WI-WDA-SPECKIT-REVIEWER",
    objective:
      "Add Spec Kit as a consistency reviewer over the proposed dependency graph.",
    included: [
      "Review proposal consistency against the pinned candidate and context slices.",
      "Return advisory findings through a bounded reviewer contract.",
    ],
    excluded: ["Creating authoritative edges or bypassing Core policy evaluation."],
    deliverables: [
      ["DEL-WDA-SPECKIT-REVIEWER", "Bounded Spec Kit consistency-review adapter.", "ModulePlugin"],
    ],
    workType: "configuration-change",
    acceptanceCriterionRefs: [
      "AC-WDA-CONSISTENCY-REVIEW-001",
      "AC-WDA-NO-EXECUTION-001",
      "AC-WDA-PLUGIN-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WDA-SPECKIT-REVIEWER"],
    capabilities: ["CAP-CONTRACT-AUTHORING"],
    dependencyHints: [
      hint("WI-WDA-NATIVE-PROPOSER", "after", "Review requires a normalized proposal."),
    ],
    verificationMethod:
      "Review valid and intentionally inconsistent proposal fixtures and verify advisory-only authority.",
    successCriteria:
      "Spec Kit findings are reproducible and cannot directly change the authoritative DAG.",
    evidenceKind: "work-dependency-analysis/reviewer-conformance",
  }),
  workItem({
    id: "WI-WDA-GRAPH-MECHANICS",
    objective:
      "Implement Core-owned static-DAG mechanics with Graphology-DAG.",
    included: [
      "Normalize vertices and edges, detect cycles and missing references, compute deterministic ordering, and derive parallel frontiers.",
      "Keep all mechanics synchronous and static for V1.",
    ],
    excluded: ["Runtime scheduling, execution monitoring, or dynamic DAG mutation."],
    deliverables: [
      ["DEL-WDA-GRAPH-MECHANICS", "Deterministic static-DAG mechanics library.", "RuntimeLibrary"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-CYCLE-001",
      "AC-WDA-DETERMINISM-001",
      "AC-WDA-GRAPH-MECHANICS-001",
      "AC-WDA-MISSING-001",
      "AC-WDA-ORDERING-001",
      "AC-WDA-PARALLEL-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WDA-GRAPH-MECHANICS"],
    capabilities: ["CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-CONTRACTS", "after", "Mechanics consume validated canonical graph artifacts."),
    ],
    verificationMethod:
      "Exercise acyclic, cyclic, missing-reference, disconnected, and tie-order fixtures with randomized input ordering.",
    successCriteria:
      "Core returns a stable DAG, deterministic order and frontiers, or exact rejection diagnostics.",
    evidenceKind: "work-dependency-analysis/graph-mechanics-tests",
  }),
  workItem({
    id: "WI-WDA-OPA-POLICY",
    objective:
      "Evaluate dependency and hint-disposition policy through a version-pinned OPA boundary.",
    included: [
      "Define closed policy input and output contracts.",
      "Bind policy bundle identity and normalize deterministic violations and dispositions.",
    ],
    excluded: ["Allowing Rego to mutate graph mechanics or invoke work execution."],
    deliverables: [
      ["DEL-WDA-OPA-POLICY", "Versioned OPA policy bundle and evaluator boundary.", "PolicyBundle"],
    ],
    workType: "configuration-change",
    acceptanceCriterionRefs: [
      "AC-WDA-HINT-DISPOSITION-001",
      "AC-WDA-INPUT-COHERENCE-001",
      "AC-WDA-OPA-POLICY-001",
    ],
    architectureRefs: ["EL-WDA-OPA"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-GRAPH-MECHANICS", "related", "Policy evaluates the normalized graph and declared hint dispositions."),
    ],
    verificationMethod:
      "Evaluate pinned policy bundles against allow, deny, and malformed input fixtures.",
    successCriteria:
      "Policy decisions are content-addressed, deterministic, and cannot replace Core graph mechanics.",
    evidenceKind: "work-dependency-analysis/opa-policy-tests",
  }),
  workItem({
    id: "WI-WDA-GATE",
    objective:
      "Implement the WorkDependency Gate and exact authoritative DAG baseline promotion boundary.",
    included: [
      "Reject incoherent snapshots, unresolved proposals, missing edges, cycles, invalid ordering, unsafe parallel frontiers, and policy failures.",
      "Promote only replay-verified candidate bytes and persist an atomic merge proof.",
    ],
    excluded: ["Executing the promoted DAG or assigning specialists."],
    deliverables: [
      ["DEL-WDA-GATE", "WorkDependency Gate and baseline promotion runtime.", "GateRuntime"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-CYCLE-001",
      "AC-WDA-GRAPH-COVERAGE-001",
      "AC-WDA-INPUT-COHERENCE-001",
      "AC-WDA-MISSING-001",
      "AC-WDA-ORDERING-001",
      "AC-WDA-PARALLEL-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WDA-GATE"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-GRAPH-MECHANICS", "after", "Gate consumes Core graph analysis."),
      hint("WI-WDA-OPA-POLICY", "after", "Gate consumes exact policy evaluation."),
    ],
    verificationMethod:
      "Run exact promotion, stale-byte, cycle, missing-edge, unsafe-frontier, and policy-denial fixtures.",
    successCriteria:
      "Only one complete replay-verified static DAG can become the authoritative dependency baseline.",
    evidenceKind: "work-dependency-analysis/gate-tests",
  }),
  workItem({
    id: "WI-WDA-TRACEABILITY",
    objective:
      "Project the authoritative dependency DAG into TraceabilityGraph through a trusted forward-only contributor.",
    included: [
      "Derive approved WorkItem-to-WorkItem dependency relationships from the Gate-approved DAG.",
      "Persist graph version, update digest, execution identity, and resulting checkpoint.",
    ],
    excluded: ["Graph access or arbitrary relationship selection by proposal adapters."],
    deliverables: [
      ["DEL-WDA-TRACEABILITY", "Trusted dependency traceability contributor and merge proof.", "TraceabilityContributor"],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WDA-HINT-DISPOSITION-001",
      "AC-WDA-TRACEABILITY-001",
    ],
    architectureRefs: ["EL-WDA-CONTRIBUTOR"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-GATE", "after", "Only Gate-approved dependencies are authoritative."),
    ],
    verificationMethod:
      "Project, merge, replay, query, and inspect every approved dependency edge and merge receipt.",
    successCriteria:
      "The graph contains only trusted forward dependency edges with a reproducible atomic merge proof.",
    evidenceKind: "work-dependency-analysis/traceability-tests",
  }),
  workItem({
    id: "WI-WDA-VERIFICATION",
    objective:
      "Release-gate WorkDependencyAnalysis across contracts, routing, proposals, Core mechanics, policy, Gate, traceability, and packaging.",
    included: [
      "Run focused and full regression, replay, drift, authority, determinism, and package checks.",
      "Prove that optional proposal providers cannot change Core outcomes without explicit normalized input changes.",
    ],
    excluded: ["Executing any DAG work item or claiming downstream completion."],
    deliverables: [
      ["DEL-WDA-RELEASE-EVIDENCE", "WorkDependencyAnalysis release verification evidence.", "VerificationEvidenceSet"],
    ],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [
      hint("WI-WDA-GATE", "after", "Gate behavior must be available for end-to-end verification."),
      hint("WI-WDA-TRACEABILITY", "after", "Traceability behavior must be available for end-to-end verification."),
    ],
    verificationMethod:
      "Run the canonical package gate, module dogfood replay, mutation tests, and independent contract review.",
    successCriteria:
      "All release gates pass with deterministic outputs and no assignment, scheduling, or execution authority.",
    evidenceKind: "work-dependency-analysis/release-gate",
  }),
  workItem({
    id: "WI-WDA-DOCUMENTATION",
    objective:
      "Document WorkDependencyAnalysis configuration, trust boundaries, artifacts, outcomes, and extension points.",
    included: [
      "Explain native, optional adapter, Spec Kit reviewer, OPA, Graphology-DAG, Gate, and traceability responsibilities.",
      "Publish the bounded V1 static-DAG limitations and downstream handoff.",
    ],
    excluded: ["Representing proposal hints as authoritative dependencies."],
    deliverables: [
      ["DEL-WDA-DOCUMENTATION", "Operator and extension documentation.", "DocumentationSet"],
    ],
    workType: "documentation-change",
    acceptanceCriterionRefs: [
      "AC-WDA-NO-EXECUTION-001",
      "AC-WDA-PLUGIN-BOUNDARY-001",
      "AC-WDA-TRACEABILITY-001",
    ],
    architectureRefs: ["EL-WDA-MODULE"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [
      hint("WI-WDA-VERIFICATION", "related", "Documentation should cite final verified behavior."),
    ],
    verificationMethod:
      "Review documentation against the approved requirements, architecture, and release evidence.",
    successCriteria:
      "Operators can configure and audit the module without confusing proposal, authority, or execution boundaries.",
    evidenceKind: "work-dependency-analysis/documentation-review",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));
assert.equal(workItems.length, 11);

function plannedCoverage(scopeKind, scopeRef) {
  const field =
    scopeKind === "acceptance-criterion"
      ? "acceptance-criterion-refs"
      : "architecture-refs";
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
      "The prior WorkBreakdown module work is present in repository revision 9cb4f2b8d340142557027fc0477440722d4f8286 and has an exact passing dogfood and Gate promotion proof; it is historical completion evidence, not new WorkDependencyAnalysis work.",
    currentEvidence: clone(priorCompletionEvidence),
  })),
  ...targetAcceptanceIds.map((id) =>
    plannedCoverage("acceptance-criterion", id),
  ),
  ...targetArchitectureIds.map((id) => plannedCoverage("architecture", id)),
].sort((left, right) =>
  `${left.scopeKind}\u0000${left.scopeRef}`.localeCompare(
    `${right.scopeKind}\u0000${right.scopeRef}`,
    "en",
  ),
);
assert.equal(coverageDispositions.length, 48);

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
      "The prior WorkBreakdown module deliverable is present in the pinned repository revision and has exact passing dogfood and Gate evidence; retain its scope as already satisfied instead of carrying completed work into the WorkDependencyAnalysis plan.",
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
  changeSetId: "WBCS-WDA-001",
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
  [approvedNotApplicableRef, approvedNotApplicableBytes],
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
  read("dogfood/work-dependency-analysis/candidate/ProjectOverview.md"),
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
        "Seven prior completed module-planning items are retired and their 22 scope dispositions are preserved as already satisfied with exact repository and dogfood evidence.",
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
  "module-route-decision-work-dependency-analysis-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-wda-v1",
  runId: "work-dependency-analysis-dogfood-run-v1",
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
      "C:/repos/DevRelay/dogfood/work-dependency-analysis/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "work-dependency-analysis",
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
        "C:/repos/DevRelay/dogfood/work-dependency-analysis/work-breakdown",
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
  artifacts: [{
    ref: priorTraceabilityUpdateRef,
    bytes: Buffer.from(canonicalJson(priorTraceabilityUpdate), "utf8"),
    value: priorTraceabilityUpdate,
  }],
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
const activeWdaWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-WDA-"),
);
const retiredPriorWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "retired" && stableId.startsWith("WI-WB-"),
);
assert.equal(activeWdaWorkItems.length, workItems.length);
assert.equal(retiredPriorWorkItems.length, currentBaseline.workItems.length);
const objectivePath = queryTraceabilityGraph(snapshot, {
  start: {
    kind: "business-objective",
    stableId: "BO-WDA-CORRECTNESS-001",
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
  "# WorkBreakdown Gate: WorkDependencyAnalysis",
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
  "- PASS: all 16 approved WorkDependencyAnalysis acceptance criteria and all 10 approved architecture elements have reciprocal planned coverage.",
  "- PASS: all seven previously completed WorkBreakdown planning items are retired; their 22 scope dispositions are retained as already satisfied with exact repository and passing dogfood evidence.",
  "- PASS: every new WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended graph revision 1 to revision 2, retired stale candidate work and edges, and preserved a replayable atomic merge proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownChangeSetDraft and promote the resulting WorkBreakdownBaseline 1.1.0 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-wda-v1",
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
  version: "1.1.0",
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
  proofId: "work-breakdown-gate-promotion-wda-v1",
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
    "WorkBreakdown did not assign, schedule, execute, build, or claim completion of any WorkDependencyAnalysis item.",
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
