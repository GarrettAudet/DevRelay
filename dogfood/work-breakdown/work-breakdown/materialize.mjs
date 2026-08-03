import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { architectureBaselineObserverContributor } from "../../../src/architecture-traceability-contributor.mjs";
import { sha256Digest } from "../../../src/content-digest.mjs";
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
const dogfoodDir = path.join(
  root,
  "dogfood",
  "work-breakdown",
  "work-breakdown",
);
const finalRoot =
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/work-breakdown";

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
  schema: "https://devrelay.dev/native/openspec-tasks/v1",
  mediaType: "text/markdown",
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function load(relativePath) {
  return JSON.parse(read(relativePath));
}

function writeJson(name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dogfoodDir, name), bytes);
  return bytes;
}

function writeText(name, text) {
  const bytes = Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");
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
  return value === undefined ? undefined : structuredClone(value);
}

function createCheckpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return clone(values.get(key));
      },
      async put(key, value) {
        values.set(key, clone(value));
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
        return clone(values.get(key));
      },
      async putIfAbsent(key, value) {
        if (!values.has(key)) values.set(key, clone(value));
        return clone(values.get(key));
      },
    },
  };
}

const requirementsPath = "dogfood/work-breakdown/requirements-baseline.json";
const overviewPath = "dogfood/work-breakdown/project-overview-baseline.json";
const architecturePath =
  "dogfood/work-breakdown/architecture-design/architecture-baseline.json";
const repositoryPath = "dogfood/work-breakdown/repository-snapshot.json";

const requirementsBytes = read(requirementsPath);
const overviewBytes = read(overviewPath);
const architectureBytes = read(architecturePath);
const repositoryBytes = read(repositoryPath);
const requirements = JSON.parse(requirementsBytes);
const overview = JSON.parse(overviewBytes);
const architecture = JSON.parse(architectureBytes);
const repository = JSON.parse(repositoryBytes);

const requirementsRef = artifactRef(
  requirements.baselineId,
  REQUIREMENTS_CONTRACT,
  requirementsBytes,
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/requirements-baseline.json",
);
const overviewRef = artifactRef(
  overview.baselineId,
  OVERVIEW_CONTRACT,
  overviewBytes,
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/project-overview-baseline.json",
);
const architectureRef = artifactRef(
  architecture.baselineId,
  ARCHITECTURE_CONTRACT,
  architectureBytes,
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/architecture-design/architecture-baseline.json",
);
const repositoryRef = artifactRef(
  "repository-snapshot-devrelay-7d3b9c1",
  REPOSITORY_CONTRACT,
  repositoryBytes,
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/repository-snapshot.json",
);

assert.deepEqual(architecture.requirementsBaseline, requirementsRef);
assert.deepEqual(architecture.projectOverviewBaseline, overviewRef);
assert.deepEqual(architecture.repositorySnapshot, repositoryRef);

const contractApprovalText = [
  "# Contract disposition approval",
  "",
  "Status: **approved-not-applicable**",
  "",
  "WorkBreakdown 0.1.0 changes DevRelay's internal planning contracts only. No independently governed product interface contract baseline is applicable to this establishment run.",
  "",
].join("\n");
const contractApprovalBytes = writeText(
  "contract-not-applicable-approval.md",
  contractApprovalText,
);
const contractApprovalRef = artifactRef(
  "work-breakdown-contract-na-approval-v1",
  {
    schema: "https://devrelay.dev/evidence/approval/v1",
    mediaType: "text/markdown",
  },
  contractApprovalBytes,
  finalUri("contract-not-applicable-approval.md"),
);

const approvedNotApplicable = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ApprovedNotApplicable",
  approvalId: "ANA-WB-CONTRACTS",
  purpose: "contract-disposition",
  rationale:
    "This WorkBreakdown establishment changes internal planning contracts and does not introduce an independently governed product interface contract.",
  authority: {
    id: "devrelay-work-breakdown-owner",
    role: "human-approver",
  },
  approvalEvidence: [contractApprovalRef],
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
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ContractDisposition",
  dispositionId: "CD-WB-NOT-APPLICABLE",
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

const capabilityCatalog = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "CapabilityCatalog",
  catalogId: "CC-WB-DOGFOOD",
  version: "1.0.0",
  capabilities: [
    {
      id: "CAP-CONTRACT-AUTHORING",
      name: "Contract authoring",
      type: "analysis",
      description:
        "Define and validate closed provider-neutral artifact and module contracts.",
      providerNeutral: true,
    },
    {
      id: "CAP-NODEJS-ENGINEERING",
      name: "Node.js engineering",
      type: "code",
      description:
        "Implement deterministic Node.js runtime, validation, and graph behavior.",
      providerNeutral: true,
    },
    {
      id: "CAP-RELEASE-ENGINEERING",
      name: "Release engineering",
      type: "operations",
      description:
        "Run release gates, package checks, and deterministic replay validation.",
      providerNeutral: true,
    },
    {
      id: "CAP-TECHNICAL-WRITING",
      name: "Technical writing",
      type: "documentation",
      description:
        "Document module boundaries, configuration, evidence, and limitations.",
      providerNeutral: true,
    },
    {
      id: "CAP-TEST-ENGINEERING",
      name: "Test engineering",
      type: "test",
      description:
        "Design positive, negative, replay, and trust-boundary verification.",
      providerNeutral: true,
    },
  ],
};
const capabilityCatalogBytes = writeJson(
  "capability-catalog.json",
  capabilityCatalog,
);
const capabilityCatalogRef = artifactRef(
  capabilityCatalog.catalogId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.CapabilityCatalog,
  capabilityCatalogBytes,
  finalUri("capability-catalog.json"),
);
validateWorkBreakdownArtifact(capabilityCatalog, {
  ref: capabilityCatalogRef,
});

const projectState = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectWorkBreakdownState",
  stateId: "PWBS-WB-DOGFOOD",
  state: "unbaselined",
  requirementsBaseline: requirementsRef,
  projectOverviewBaseline: overviewRef,
  architectureBaseline: architectureRef,
  contractDisposition: contractDispositionRef,
  capabilityCatalog: capabilityCatalogRef,
  repositoryContext: repositoryRef,
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

const tasksBytes = fs.readFileSync(path.join(dogfoodDir, "tasks.md"));
const tasksRef = artifactRef(
  "openspec-tasks-work-breakdown-dogfood-v1",
  NATIVE_TASKS_CONTRACT,
  tasksBytes,
  finalUri("tasks.md"),
);

const acceptanceCriteria = requirements.requirements.acceptanceCriteria;
const architectureElements =
  architecture.sections.architectureModel.content.elements;
const acceptanceIndex = new Map(
  acceptanceCriteria.map((entry, index) => [entry.id, index]),
);
const architectureIndex = new Map(
  architectureElements.map((entry, index) => [entry.id, index]),
);

function sourceRef(role, artifact, jsonPointer) {
  return { role, artifact: structuredClone(artifact), jsonPointer };
}

function requirementSource(id) {
  return sourceRef(
    "requirements-baseline",
    requirementsRef,
    `/requirements/acceptanceCriteria/${acceptanceIndex.get(id)}`,
  );
}

function architectureSource(id) {
  return sourceRef(
    "architecture-baseline",
    architectureRef,
    `/sections/architectureModel/content/elements/${architectureIndex.get(id)}`,
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
    "required-evidence": [
      {
        kind: evidenceKind,
        description: successCriteria,
      },
    ],
    "source-refs": [
      ...acceptanceCriterionRefs.map(requirementSource),
      ...architectureRefs.map(architectureSource),
    ],
  };
}

const workItems = [
  workItem({
    id: "WI-WB-ADAPTERS",
    objective:
      "Publish replaceable OpenSpec and Spec Kit task adapters that expose planning only.",
    included: [
      "Define both adapters for both WorkBreakdown operations.",
      "Constrain commands, configuration, and declared capabilities to planning outputs.",
    ],
    excluded: [
      "Invoking OpenSpec or Spec Kit implementation commands.",
      "Hard-coupling either operation to a provider.",
    ],
    deliverables: [
      [
        "DEL-WB-ADAPTER-MANIFESTS",
        "Versioned OpenSpec and Spec Kit WorkBreakdown plug-in manifests.",
        "ModulePluginSet",
      ],
    ],
    workType: "configuration-change",
    acceptanceCriterionRefs: [
      "AC-WB-ADAPTER-SELECTION-001",
      "AC-WB-NO-EXECUTION-001",
      "AC-WB-OUTPUT-CONTRACT-001",
    ],
    architectureRefs: ["EL-WB-ADAPTER-PORT"],
    capabilities: ["CAP-CONTRACT-AUTHORING"],
    dependencyHints: [
      hint(
        "WI-WB-DOMAIN-CONTRACTS",
        "after",
        "The plug-in surface should follow the canonical artifact contract; WorkDependencyAnalysis must decide the authoritative edge.",
      ),
    ],
    verificationMethod:
      "Validate both plug-in manifests and scan their capabilities and commands.",
    successCriteria:
      "Both operations are replaceable, planning-only, and contain no execution/build authority.",
    evidenceKind: "work-breakdown/plugin-conformance",
  }),
  workItem({
    id: "WI-WB-DOCUMENTATION",
    objective:
      "Document WorkBreakdown configuration, boundaries, outputs, Gate behavior, and dogfood evidence.",
    included: [
      "Publish module usage and trust-boundary documentation.",
      "Record bounded-fixture limitations and downstream ownership.",
    ],
    excluded: ["Claiming that planned work has been executed or verified."],
    deliverables: [
      [
        "DEL-WB-DOCUMENTATION",
        "Release documentation and deterministic dogfood evidence package.",
        "DocumentationSet",
      ],
    ],
    workType: "documentation-change",
    acceptanceCriterionRefs: [
      "AC-WB-NO-EXECUTION-001",
      "AC-WB-OUTPUT-CONTRACT-001",
    ],
    architectureRefs: ["EL-DEVRELAY-SYSTEM", "EL-WB-DOWNSTREAM"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [
      hint(
        "WI-WB-VERIFICATION",
        "related",
        "Documentation should cite final verification evidence; the hint is not an authoritative dependency.",
      ),
    ],
    verificationMethod:
      "Review documentation against the approved requirements and architecture boundaries.",
    successCriteria:
      "Operators can configure and audit WorkBreakdown without mistaking plans for execution.",
    evidenceKind: "work-breakdown/documentation-review",
  }),
  workItem({
    id: "WI-WB-DOMAIN-CONTRACTS",
    objective:
      "Define closed provider-neutral WorkBreakdown artifacts and validation semantics.",
    included: [
      "Define exact WorkItemDraft, coverage, state, baseline, change, and continuation shapes.",
      "Validate source closure, capability references, coverage, and deterministic delta application.",
    ],
    excluded: [
      "Dependency-cycle or ordering validation.",
      "Assignment, estimates, scheduling, implementation, or status tracking.",
    ],
    deliverables: [
      [
        "DEL-WB-ARTIFACT-SCHEMA",
        "Closed WorkBreakdown artifact schema.",
        "JsonSchema",
      ],
      [
        "DEL-WB-ARTIFACT-VALIDATOR",
        "Context-neutral artifact and lineage validators.",
        "RuntimeLibrary",
      ],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WB-DECOMPOSE-CHANGE-001",
      "AC-WB-DECOMPOSE-ESTABLISH-001",
      "AC-WB-NO-EXECUTION-001",
      "AC-WB-OUTPUT-CONTRACT-001",
      "AC-WB-WORK-ITEM-CONTRACT-001",
    ],
    architectureRefs: [
      "EL-DEVRELAY-MODULES",
      "EL-WB-MODULE",
      "EL-WB-VALIDATORS",
    ],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod:
      "Run positive and negative schema, lineage, coverage, and delta fixtures.",
    successCriteria:
      "Only exact authorized, source-closed WorkBreakdown candidates validate.",
    evidenceKind: "work-breakdown/domain-contract-tests",
  }),
  workItem({
    id: "WI-WB-GATE",
    objective:
      "Implement the WorkBreakdown Gate and exact baseline promotion boundary.",
    included: [
      "Reject unscoped work, uncovered scope, unresolved evidence, and invalid references.",
      "Keep no-work approval under Gate authority and promote an exact immutable baseline.",
    ],
    excluded: [
      "Cycle detection, missing-dependency policy, or impossible-ordering analysis.",
    ],
    deliverables: [
      [
        "DEL-WB-GATE",
        "WorkBreakdown candidate approval and baseline promotion Gate.",
        "GateRuntime",
      ],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WB-COVERAGE-DISPOSITIONS-001",
      "AC-WB-GATE-BOUNDARY-001",
    ],
    architectureRefs: ["EL-WB-GATE"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint(
        "WI-WB-DOMAIN-CONTRACTS",
        "after",
        "Gate promotion consumes canonical candidate contracts; dependency authority remains downstream.",
      ),
    ],
    verificationMethod:
      "Exercise candidate rejection, evidence resolution, Gate-owned approval, and exact promotion tests.",
    successCriteria:
      "Only complete authorized candidates can become a WorkBreakdownBaseline.",
    evidenceKind: "work-breakdown/gate-tests",
  }),
  workItem({
    id: "WI-WB-RUNTIME",
    objective:
      "Implement deterministic state routing, exact input binding, checkpointing, and pre-adapter drift handling.",
    included: [
      "Route unbaselined and baselined states through Core.",
      "Detect content, version, repository revision, tree, and approved-change lineage drift before adapter entry.",
      "Checkpoint and replay effects deterministically.",
    ],
    excluded: ["Choosing a plug-in through model improvisation."],
    deliverables: [
      [
        "DEL-WB-RUNTIME",
        "Registered WorkBreakdown runtime contracts and drift guard.",
        "RuntimeLibrary",
      ],
      [
        "DEL-WB-MODULE-MANIFEST",
        "State-routed WorkBreakdown module manifest.",
        "ModuleDefinition",
      ],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WB-ADAPTER-SELECTION-001",
      "AC-WB-DECOMPOSE-CHANGE-001",
      "AC-WB-DECOMPOSE-ESTABLISH-001",
      "AC-WB-INPUT-PINNING-001",
    ],
    architectureRefs: ["EL-DEVRELAY-CORE", "EL-WB-PREFLIGHT"],
    capabilities: ["CAP-NODEJS-ENGINEERING"],
    dependencyHints: [
      hint(
        "WI-WB-DOMAIN-CONTRACTS",
        "after",
        "Runtime input contracts must exist before integration; WorkDependencyAnalysis owns final ordering.",
      ),
    ],
    verificationMethod:
      "Run both route fixtures, effect replay, and stale-baseline zero-adapter tests.",
    successCriteria:
      "Routing and replay are deterministic and baseline_drift never enters the adapter.",
    evidenceKind: "work-breakdown/runtime-tests",
  }),
  workItem({
    id: "WI-WB-TRACEABILITY",
    objective:
      "Add trusted WorkBreakdown planning projection to TraceabilityGraph 1.1.",
    included: [
      "Observe approved requirement and architecture baselines.",
      "Derive only upstream-to-downstream candidate planning edges from validated typed references.",
      "Persist atomic merge and replay proof in ModuleExecutionRecord.",
    ],
    excluded: [
      "Graph mutation by adapters.",
      "Inverse, dependency, implementation, completion, or verification edges.",
    ],
    deliverables: [
      [
        "DEL-WB-TRACEABILITY-CONTRIBUTOR",
        "Trusted WorkBreakdown and approved-baseline observer contributors.",
        "TraceabilityContributorSet",
      ],
      [
        "DEL-WB-TRACEABILITY-VOCABULARY",
        "Compatible traceability 1.1 planning vocabulary extension.",
        "TraceabilityContract",
      ],
    ],
    workType: "code-change",
    acceptanceCriterionRefs: [
      "AC-WB-COVERAGE-DISPOSITIONS-001",
      "AC-WB-TRACEABILITY-001",
    ],
    architectureRefs: [
      "EL-DEVRELAY-GRAPH",
      "EL-WB-CONTRIBUTOR",
      "EL-WB-OBSERVERS",
    ],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [
      hint(
        "WI-WB-DOMAIN-CONTRACTS",
        "after",
        "Projection consumes validated typed references; this remains a planning hint.",
      ),
    ],
    verificationMethod:
      "Project, validate, merge, replay, query, and inspect every candidate planning edge.",
    successCriteria:
      "Every typed reference yields exactly one allowed forward planning edge and a verifiable atomic merge proof.",
    evidenceKind: "work-breakdown/traceability-tests",
  }),
  workItem({
    id: "WI-WB-VERIFICATION",
    objective:
      "Release-gate WorkBreakdown across contracts, runtime, adapters, Gate, traceability, and packaging.",
    included: [
      "Run focused and full tests, syntax checks, package inspection, and deterministic dogfood replay.",
      "Check Core neutrality and planning-only boundaries.",
    ],
    excluded: [
      "Treating dependency hints as an authoritative DAG.",
      "Executing any planned work item through WorkBreakdown.",
    ],
    deliverables: [
      [
        "DEL-WB-RELEASE-EVIDENCE",
        "Release verification and regression evidence.",
        "VerificationEvidenceSet",
      ],
    ],
    workType: "test-change",
    acceptanceCriterionRefs: [
      "AC-WB-GATE-BOUNDARY-001",
      "AC-WB-INPUT-PINNING-001",
      "AC-WB-NO-EXECUTION-001",
      "AC-WB-TRACEABILITY-001",
      "AC-WB-WORK-ITEM-CONTRACT-001",
    ],
    architectureRefs: ["EL-DEVRELAY-SYSTEM", "EL-WB-DOWNSTREAM"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [
      hint(
        "WI-WB-RUNTIME",
        "after",
        "Runtime behavior must be available for end-to-end verification; WorkDependencyAnalysis decides the authoritative DAG.",
      ),
      hint(
        "WI-WB-TRACEABILITY",
        "after",
        "Graph behavior must be available for end-to-end verification; WorkDependencyAnalysis decides the authoritative DAG.",
      ),
    ],
    verificationMethod:
      "Run npm verification, release catalog/check, focused dogfood tests, and independent review.",
    successCriteria:
      "All release gates pass with deterministic outputs and no forbidden execution semantics.",
    evidenceKind: "work-breakdown/release-gate",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));

const exactWorkItemKeys = [
  "id",
  "objective",
  "bounded-scope",
  "deliverables",
  "work-type",
  "acceptance-criterion-refs",
  "architecture-refs",
  "contract-refs",
  "required-capabilities",
  "dependency-hints",
  "verification-plan",
  "required-evidence",
  "source-refs",
].sort();
for (const item of workItems) {
  assert.deepEqual(Object.keys(item).sort(), exactWorkItemKeys);
}

function plannedCoverage(scopeKind, scopeRef) {
  const field =
    scopeKind === "acceptance-criterion"
      ? "acceptance-criterion-refs"
      : scopeKind === "architecture"
        ? "architecture-refs"
        : "contract-refs";
  const workItemRefs = workItems
    .filter((item) => item[field].includes(scopeRef))
    .map((item) => item.id)
    .sort();
  assert.ok(workItemRefs.length > 0, `${scopeKind} ${scopeRef} is uncovered`);
  return {
    scopeKind,
    scopeRef,
    disposition: "planned",
    workItemRefs,
  };
}

const coverageDispositions = [
  ...acceptanceCriteria.map(({ id }) =>
    plannedCoverage("acceptance-criterion", id),
  ),
  ...architectureElements.map(({ id }) => plannedCoverage("architecture", id)),
].sort((left, right) =>
  `${left.scopeKind}\u0000${left.scopeRef}`.localeCompare(
    `${right.scopeKind}\u0000${right.scopeRef}`,
    "en",
  ),
);
assert.equal(coverageDispositions.length, 22);

const inputBindings = [
  ["project-work-breakdown-state", projectStateRef],
  ["requirements-baseline", requirementsRef],
  ["project-overview-baseline", overviewRef],
  ["architecture-baseline", architectureRef],
  ["contract-disposition", contractDispositionRef],
  ["capability-catalog", capabilityCatalogRef],
  ["repository-context", repositoryRef],
].map(([role, artifact]) => ({ role, artifact }));

const workBreakdownDraft = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownDraft",
  draftId: "WBD-WB-DOGFOOD",
  operation: "establish-breakdown",
  inputBindings,
  workItems,
  coverageDispositions,
  nativeArtifacts: [tasksRef],
  sourceRefs: [
    sourceRef("project-work-breakdown-state", projectStateRef, "/state"),
    sourceRef("requirements-baseline", requirementsRef, "/requirements/purpose"),
    sourceRef("project-overview-baseline", overviewRef, "/overview/purpose"),
    sourceRef(
      "architecture-baseline",
      architectureRef,
      "/sections/technicalDesign",
    ),
    sourceRef("repository-context", repositoryRef, "/revision"),
  ],
};
const workBreakdownDraftBytes = writeJson(
  "work-breakdown-draft.json",
  workBreakdownDraft,
);
const workBreakdownDraftRef = artifactRef(
  workBreakdownDraft.draftId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft,
  workBreakdownDraftBytes,
  finalUri("work-breakdown-draft.json"),
);
validateWorkBreakdownArtifact(workBreakdownDraft, {
  ref: workBreakdownDraftRef,
});

const bytesByRef = new Map();
function refKey(ref) {
  return [ref.artifactId, ref.schema, ref.mediaType, ref.digest].join("\u0000");
}
function register(ref, bytes) {
  assert.equal(sha256Digest(bytes), ref.digest, `invalid bytes for ${ref.artifactId}`);
  bytesByRef.set(refKey(ref), Buffer.from(bytes));
}

register(requirementsRef, requirementsBytes);
register(overviewRef, overviewBytes);
register(architectureRef, architectureBytes);
register(repositoryRef, repositoryBytes);
register(contractDispositionRef, contractDispositionBytes);
register(capabilityCatalogRef, capabilityCatalogBytes);
register(projectStateRef, projectStateBytes);
register(workBreakdownDraftRef, workBreakdownDraftBytes);
register(tasksRef, tasksBytes);
register(contractApprovalRef, contractApprovalBytes);
register(approvedNotApplicableRef, approvedNotApplicableBytes);
register(
  overview.renderedDocument.artifact,
  read("dogfood/work-breakdown/ProjectOverview.md"),
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
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId,
  status: "completed",
  outcome: "decomposed",
  outputs: {
    "work-breakdown-draft": [workBreakdownDraftRef],
  },
  evidence: [
    {
      kind: "work-breakdown/contract-validation",
      subject: `work-breakdown-draft:${workBreakdownDraft.draftId}`,
      status: "pass",
      artifact: workBreakdownDraftRef,
      summary:
        "The canonical draft passed closed-schema, lineage, coverage, capability, and source-reference validation.",
    },
    {
      kind: "work-breakdown/source-closure",
      subject: `work-breakdown-draft:${workBreakdownDraft.draftId}`,
      status: "pass",
      artifact: workBreakdownDraftRef,
      summary:
        "All declared sources resolve within the exact immutable invocation inputs; the OpenSpec tasks file remains subordinate native evidence.",
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
assert.equal(selectedRoute.selection.operation, "establish-breakdown");
assert.equal(selectedRoute.reasonCode, "WORK_BREAKDOWN_BASELINE_ABSENT");
const routeBytes = writeJson("module-route-decision.json", selectedRoute);
const routeRef = artifactRef(
  "module-route-decision-work-breakdown-dogfood-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

function invocationFor({
  invocationId,
  runId,
  stateRef,
  routingRef,
}) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId,
    runId,
    nodeId: "work-breakdown",
    module: {
      id: "work-breakdown",
      version: "0.1.0",
      operation: "establish-breakdown",
    },
    plugin: { id: "openspec-tasks", version: "0.1.0" },
    inputs: {
      "project-work-breakdown-state": [stateRef],
      "routing-decision": [routingRef],
      "requirements-baseline": [requirementsRef],
      "project-overview-baseline": [overviewRef],
      "architecture-baseline": [architectureRef],
      "contract-disposition": [contractDispositionRef],
      "capability-catalog": [capabilityCatalogRef],
      "repository-context": [repositoryRef],
    },
    options: {},
    config: {
      projectRoot: "C:/repos/DevRelay",
      planningOutputRoot:
        "C:/repos/DevRelay/dogfood/work-breakdown/work-breakdown",
      toolName: "OpenSpec",
      toolVersion: "0.1.0-fixture",
      changeName: "work-breakdown-module",
      schema: "devrelay-work-breakdown",
      artifact: "tasks.md",
      command: "/opsx:continue",
      bridge: "agent-command",
    },
    grants: [
      { kind: "filesystem.read", scope: "C:/repos/DevRelay" },
      {
        kind: "filesystem.write",
        scope: "C:/repos/DevRelay/dogfood/work-breakdown/work-breakdown",
      },
      { kind: "network.connect", scope: "host:implementation-engine" },
    ],
  };
}

const invocation = invocationFor({
  invocationId: "work-breakdown-establish-dogfood-v1",
  runId: "work-breakdown-dogfood-run-v1",
  stateRef: projectStateRef,
  routingRef: routeRef,
});
const invocationBytes = writeJson("work-breakdown.invocation.json", invocation);

const effectCheckpoints = createCheckpointStore();
const traceabilityCheckpoints = createTraceabilityCheckpointStore();
const graph = createTraceabilityGraphService({
  graphId: "devrelay/work-breakdown",
  projectId: "devrelay",
  store: createInMemoryTraceabilityStore(),
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
assert.equal(executionRecord.mergeReceipt.snapshot.revision, 1);
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
  {
    artifacts,
    checkpoints: effectCheckpoints.store,
  },
);
assert.equal(checkpointReplay.kind, "VerifiedCheckpointReplayReceipt");
assert.equal(checkpointReplay.moduleResult.outcome, "decomposed");
assert.equal(adapterCalls.length, callsBeforeCheckpointVerification);
const snapshot = executionRecord.mergeReceipt.snapshot;
const candidateEdges = snapshot.edges.filter(
  ({ scope, authority }) =>
    scope === "work-breakdown/candidate" && authority === "candidate",
);
const expectedPlanningEdgeCount = workItems.reduce(
  (count, item) =>
    count +
    item["acceptance-criterion-refs"].length +
    item["architecture-refs"].length +
    item["contract-refs"].length,
  0,
);
assert.equal(candidateEdges.length, expectedPlanningEdgeCount);
const nodesById = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
const planningEdgeKeys = new Set(
  candidateEdges.map((edge) => {
    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);
    assert.equal(target.kind, "work-item");
    return `${edge.kind}\u0000${source.stableId}\u0000${target.stableId}`;
  }),
);
for (const item of workItems) {
  for (const id of item["acceptance-criterion-refs"]) {
    assert.ok(planningEdgeKeys.has(`planned-by\u0000${id}\u0000${item.id}`));
  }
  for (const id of item["architecture-refs"]) {
    assert.ok(
      planningEdgeKeys.has(
        `implementation-planned-by\u0000${id}\u0000${item.id}`,
      ),
    );
  }
}
const forbiddenPlanningEdges = new Set([
  "depends-on",
  "implemented-by",
  "produces",
  "realized-by",
  "tested-by",
  "verified-by",
]);
assert.equal(
  candidateEdges.some(({ kind }) => forbiddenPlanningEdges.has(kind)),
  false,
);
const objectivePath = queryTraceabilityGraph(snapshot, {
  start: {
    kind: "business-objective",
    stableId: "BO-WB-COMPLETENESS-001",
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
const updateBytes = writeJson(
  "traceability-update.json",
  executionRecord.traceabilityUpdate,
);
const snapshotBytes = writeJson("traceability-graph-snapshot.json", snapshot);
const executionRecordBytes = writeJson(
  "module-execution-record.json",
  executionRecord,
);
const runtimeProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownRuntimeProof",
  status: "pass",
  selectedOperation: selectedRoute.selection.operation,
  selectedPlugin: invocation.plugin,
  adapterMode: "bounded-openspec-tasks-fixture",
  liveOpenSpecCliInvoked: false,
  adapterCalls: adapterCalls.length,
  replayAdapterCalls: adapterCalls.length - callsBeforeReplay,
  effectCheckpointCount: effectCheckpoints.values.size,
  traceabilityCheckpointCount: traceabilityCheckpoints.values.size,
  checkpointVerificationAdapterCalls:
    adapterCalls.length - callsBeforeCheckpointVerification,
  invocationDigest: sha256Digest(invocationBytes),
  moduleResultDigest: sha256Digest(moduleResultBytes),
  mergeProof: {
    executionId: executionRecord.invocationId,
    graphRevision: executionRecord.mergeReceipt.snapshot.revision,
    traceabilityUpdateDigest: executionRecord.traceabilityUpdateRef.digest,
    traceCheckpointKey: executionRecord.traceCheckpointKey,
    traceCheckpointDigest: executionRecord.traceCheckpointDigest,
    resultingGraph: executionRecord.mergeReceipt.snapshotRef,
    applicationReceipt: executionRecord.applicationProof.receiptRef,
    executionRecordDigest: executionRecord.recordDigest,
  },
  planningEdges: {
    total: candidateEdges.length,
    kinds: Object.fromEntries(
      [...new Set(candidateEdges.map(({ kind }) => kind))]
        .sort()
        .map((kind) => [
          kind,
          candidateEdges.filter((edge) => edge.kind === kind).length,
        ]),
    ),
  },
};
const runtimeProofBytes = writeJson("runtime-execution-proof.json", runtimeProof);

await validateWorkBreakdownGateCandidate({
  checkpointReplay,
  noWorkApprovals: [],
});

const gateBindings = [
  ["RequirementsBaseline", requirementsRef.digest],
  ["ProjectOverviewBaseline", overviewRef.digest],
  ["ArchitectureBaseline", architectureRef.digest],
  ["RepositorySnapshot", repositoryRef.digest],
  ["ContractDisposition", contractDispositionRef.digest],
  ["CapabilityCatalog", capabilityCatalogRef.digest],
  ["ProjectWorkBreakdownState", projectStateRef.digest],
  ["ModuleRouteDecision", routeRef.digest],
  ["WorkBreakdownDraft", workBreakdownDraftRef.digest],
  ["ModuleExecutionRecord", executionRecord.recordDigest],
  ["TraceabilityUpdate", executionRecord.traceabilityUpdateRef.digest],
  ["RuntimeProof", sha256Digest(runtimeProofBytes)],
];
const gateText = [
  "# WorkBreakdown Gate: WorkBreakdown 0.1.0",
  "",
  "Status: **pass**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Findings",
  "",
  "- PASS: Core derived `establish-breakdown` from the exact unbaselined project state.",
  "- PASS: the configured `openspec-tasks@0.1.0` bounded fixture produced one canonical WorkBreakdownDraft; no live OpenSpec CLI or implementation command ran.",
  "- PASS: every one of the 10 approved acceptance criteria and 12 approved architecture elements has exactly one planned coverage disposition with reciprocal WorkItem references.",
  "- PASS: every WorkItemDraft uses the exact closed field set and a deliverable-oriented work type; source and capability references resolve against invocation inputs.",
  "- PASS: dependency hints remain non-authoritative and no cycle, missing-dependency, or ordering claim is made.",
  "- PASS: trusted contributors emitted only forward candidate planning edges and Core atomically merged them with a replayable ModuleExecutionRecord proof.",
  "",
  "## Decision",
  "",
  "Approve the exact WorkBreakdownDraft and promote it to WorkBreakdownBaseline 1.0.0.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-dogfood-v1",
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-review/v1",
    mediaType: "text/markdown",
  },
  gateBytes,
  finalUri("work-breakdown-gate.md"),
);

const workBreakdownBaseline = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownBaseline",
  baselineId: "WBB-WB-DOGFOOD",
  version: "1.0.0",
  approvedCandidate: workBreakdownDraftRef,
  inputBindings: structuredClone(workBreakdownDraft.inputBindings),
  workItems: structuredClone(workBreakdownDraft.workItems),
  coverageDispositions: structuredClone(
    workBreakdownDraft.coverageDispositions,
  ),
  approvalEvidence: [gateRef],
  sourceRefs: structuredClone(workBreakdownDraft.sourceRefs),
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
  noWorkApprovals: [],
});
assert.deepEqual(gatePromotion.baselineRef, workBreakdownBaselineRef);
assert.deepEqual(gatePromotion.candidateRef, workBreakdownDraftRef);
assert.equal(gatePromotion.operation, "establish-breakdown");
assert.equal(
  gatePromotion.commitPayload.baseline.bytesBase64,
  workBreakdownBaselineBytes.toString("base64"),
);
const gatePromotionProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownGatePromotionProof",
  status: "pass",
  checkpointReplay: {
    invocationId: checkpointReplay.invocation.invocationId,
    producer: checkpointReplay.producer,
    candidate: gatePromotion.candidateRef,
    adapterCalls: adapterCalls.length - callsBeforeCheckpointVerification,
  },
  operation: gatePromotion.operation,
  baseline: gatePromotion.baselineRef,
  commitPayload: {
    byteLength: gatePromotion.commitPayload.baseline.byteLength,
    bytesDigest: sha256Digest(
      Buffer.from(gatePromotion.commitPayload.baseline.bytesBase64, "base64"),
    ),
  },
};
const gatePromotionProofBytes = writeJson(
  "work-breakdown-gate-promotion-proof.json",
  gatePromotionProof,
);

const driftState = structuredClone(projectState);
driftState.stateId = "PWBS-WB-DOGFOOD-DRIFT";
driftState.architectureBaseline.digest = `sha256:${"9".repeat(64)}`;
const driftStateBytes = writeJson(
  "project-work-breakdown-state-drift.json",
  driftState,
);
const driftStateRef = artifactRef(
  driftState.stateId,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ProjectWorkBreakdownState,
  driftStateBytes,
  finalUri("project-work-breakdown-state-drift.json"),
);
validateWorkBreakdownArtifact(driftState, { ref: driftStateRef });
register(driftStateRef, driftStateBytes);
const driftRoute = await registry.selectOperation(
  { id: "work-breakdown", version: "0.1.0" },
  driftStateRef,
  { artifacts },
);
assert.equal(driftRoute.selection.operation, "establish-breakdown");
const driftRouteBytes = writeJson(
  "module-route-decision-drift.json",
  driftRoute,
);
const driftRouteRef = artifactRef(
  "module-route-decision-work-breakdown-drift-v1",
  ROUTE_CONTRACT,
  driftRouteBytes,
  finalUri("module-route-decision-drift.json"),
);
register(driftRouteRef, driftRouteBytes);
const driftInvocation = invocationFor({
  invocationId: "work-breakdown-establish-drift-v1",
  runId: "work-breakdown-drift-run-v1",
  stateRef: driftStateRef,
  routingRef: driftRouteRef,
});
const driftInvocationBytes = writeJson(
  "baseline-drift.invocation.json",
  driftInvocation,
);
const driftCheckpoints = createCheckpointStore();
const callsBeforeDrift = adapterCalls.length;
const driftResult = await registry.execute(driftInvocation, {
  artifacts,
  checkpoints: driftCheckpoints.store,
});
assert.equal(driftResult.outcome, "baseline_drift");
assert.equal(adapterCalls.length, callsBeforeDrift);
const driftReplay = await registry.execute(driftInvocation, {
  artifacts,
  checkpoints: driftCheckpoints.store,
});
assert.deepEqual(driftReplay, driftResult);
assert.equal(adapterCalls.length, callsBeforeDrift);
assert.equal(driftCheckpoints.values.size, 1);
const driftResultBytes = writeJson("baseline-drift.result.json", driftResult);
const driftProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownBaselineDriftProof",
  status: "pass",
  cause: "ProjectWorkBreakdownState pins a stale ArchitectureBaseline digest.",
  selectedOperation: driftRoute.selection.operation,
  outcome: driftResult.outcome,
  adapterCalls: 0,
  replayAdapterCalls: 0,
  checkpointCount: driftCheckpoints.values.size,
  invocationDigest: sha256Digest(driftInvocationBytes),
  resultDigest: sha256Digest(driftResultBytes),
  diagnostics: driftResult.diagnostics,
};
const driftProofBytes = writeJson(
  "baseline-drift-execution-proof.json",
  driftProof,
);

const dogfoodProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkBreakdownDogfoodProof",
  status: "pass",
  module: { id: "work-breakdown", version: "0.1.0" },
  operation: "establish-breakdown",
  plugin: { id: "openspec-tasks", version: "0.1.0" },
  adapterExecution: {
    mode: "bounded-fixture",
    nativeCapability: "tasks.md",
    liveCliInvoked: false,
  },
  upstream: {
    requirementsBaseline: requirementsRef,
    projectOverviewBaseline: overviewRef,
    architectureBaseline: architectureRef,
    repositorySnapshot: repositoryRef,
    contractDisposition: contractDispositionRef,
  },
  outputs: {
    workBreakdownDraft: workBreakdownDraftRef,
    workBreakdownBaseline: workBreakdownBaselineRef,
    moduleExecutionRecord: {
      artifactId: "module-execution-record-work-breakdown-dogfood-v1",
      digest: sha256Digest(executionRecordBytes),
      uri: finalUri("module-execution-record.json"),
    },
    traceabilityUpdate: executionRecord.traceabilityUpdateRef,
    traceabilityGraph: executionRecord.mergeReceipt.snapshotRef,
  },
  assertions: {
    workItemCount: workItems.length,
    acceptanceCriterionCoverageCount: acceptanceCriteria.length,
    architectureCoverageCount: architectureElements.length,
    contractCoverageCount: 0,
    candidatePlanningEdgeCount: candidateEdges.length,
    objectiveToWorkItemPathCount: objectivePath.paths.length,
    normalReplayAdapterCalls: adapterCalls.length - callsBeforeReplay,
    driftAdapterCalls: 0,
    driftReplayAdapterCalls: 0,
  },
  evidence: {
    runtimeProofDigest: sha256Digest(runtimeProofBytes),
    gateDigest: gateRef.digest,
    gatePromotionProofDigest: sha256Digest(gatePromotionProofBytes),
    driftProofDigest: sha256Digest(driftProofBytes),
    traceabilityUpdateBytesDigest: sha256Digest(updateBytes),
    traceabilitySnapshotBytesDigest: sha256Digest(snapshotBytes),
  },
  limitations: [
    "The checked-in tasks.md is a bounded OpenSpec adapter fixture; no live OpenSpec CLI was invoked.",
    "Dependency hints are proposals only and were not validated as an authoritative DAG.",
    "WorkBreakdown did not assign, execute, build, schedule, or claim completion of any work item.",
  ],
};
writeJson("work-breakdown-dogfood-proof.json", dogfoodProof);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      operation: selectedRoute.selection.operation,
      plugin: invocation.plugin,
      workItems: workItems.length,
      coverage: coverageDispositions.length,
      planningEdges: candidateEdges.length,
      graphRevision: snapshot.revision,
      adapterCalls: adapterCalls.length,
      replayAdapterCalls: adapterCalls.length - callsBeforeReplay,
      driftAdapterCalls: adapterCalls.length - callsBeforeDrift,
      baselineDigest: workBreakdownBaselineRef.digest,
    },
    null,
    2,
  ),
);
