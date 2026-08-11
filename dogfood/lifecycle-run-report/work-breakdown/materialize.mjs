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
const dogfoodRelative = "dogfood/lifecycle-run-report/work-breakdown";
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
  "dogfood/lifecycle-run-report/repository-snapshot.json",
);
const currentBaselineBytes = read("project/work-breakdown-baseline.json");
const capabilityCatalogBytes = read(
  "dogfood/work-breakdown/work-breakdown/capability-catalog.json",
);
const priorGraphBytes = read(
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/traceability-graph-snapshot.json",
);
const priorExecutionRecord = load(
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/module-execution-record.json",
);
const requirementsPromotionBytes = read(
  "dogfood/lifecycle-run-report/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/lifecycle-run-report/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofBytes = read(
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/work-breakdown-gate-promotion-proof.json",
);
const historicalCompletionProofBytes = read(
  "dogfood/architecture-discovery/work-breakdown/work-breakdown-gate-promotion-proof.json",
);
const contractDispositionBytes = read("project/contract-disposition.json");
const contractBaselineBytes = read("project/contract-baseline.json");
const contractPromotionBytes = read(
  "dogfood/architecture-discovery/contract-generation/replay-v2/contract-gate-promotion.json",
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
const historicalCompletionProof = JSON.parse(historicalCompletionProofBytes);
const contractDisposition = JSON.parse(contractDispositionBytes);
const contractBaseline = JSON.parse(contractBaselineBytes);
const contractPromotion = JSON.parse(contractPromotionBytes);

const requirementsRef = clone(architecture.requirementsBaseline);
const overviewRef = clone(architecture.projectOverviewBaseline);
const repositoryRef = artifactRef(
  "repository-snapshot-devrelay-0.9.0",
  REPOSITORY_CONTRACT,
  repositoryBytes,
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/repository-snapshot.json",
);
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
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/architecture-design/architecture-gate-promotion-proof.json",
);
const priorWorkBreakdownProofRef = artifactRef(
  priorWorkBreakdownProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  priorWorkBreakdownProofBytes,
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/work-breakdown/replay-v1/work-breakdown-gate-promotion-proof.json",
);
const historicalCompletionProofRef = artifactRef(
  historicalCompletionProof.proofId,
  {
    schema: "https://devrelay.dev/evidence/work-breakdown-gate-promotion/v1",
    mediaType: "application/json",
  },
  historicalCompletionProofBytes,
  "file:///C:/repos/DevRelay/dogfood/architecture-discovery/work-breakdown/work-breakdown-gate-promotion-proof.json",
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
  "file:///C:/repos/DevRelay/dogfood/architecture-discovery/contract-generation/replay-v2/contract-gate-promotion.json",
);

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-DEV-RUN-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-RUN-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 6);
assert.equal(targetArchitectureIds.length, 12);

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
assert.equal(priorAcceptanceIds.length, 78);
assert.equal(priorArchitectureIds.length, 86);
assert.equal(priorContractIds.length, 42);

const authorizedAcceptanceIds = [
  ...new Set([...priorAcceptanceIds, ...targetAcceptanceIds]),
].sort();
const authorizedArchitectureIds = [
  ...new Set([...priorArchitectureIds, ...targetArchitectureIds]),
].sort();
const targetContractIds = contractBaseline.contracts
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-RUN-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 8);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, 42);

const priorGraphRef = clone(priorExecutionRecord.mergeReceipt.snapshotRef);
assert.equal(
  priorGraphRef.digest,
  sha256Digest(Buffer.from(canonicalJson(priorGraph), "utf8")),
);
const traceabilityUpdateCandidates = [
  ...fs.readdirSync(path.join(root, "project/history/traceability/updates"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `project/history/traceability/updates/${entry.name}`),
  ...fs.readdirSync(path.join(root, "dogfood"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "traceability-update.json")
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/")),
];
const requiredAppliedDigests = new Set(priorGraph.appliedUpdates.map(({ digest }) => digest));
const priorAppliedUpdatePaths = new Map();
for (const sourcePath of traceabilityUpdateCandidates) {
  const value = load(sourcePath);
  const digest = sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
  if (requiredAppliedDigests.has(digest)) priorAppliedUpdatePaths.set(digest, sourcePath);
}
const priorAppliedUpdateEntries = priorGraph.appliedUpdates.map((ref) => {
  const sourcePath = priorAppliedUpdatePaths.get(ref.digest);
  assert.ok(sourcePath, `missing persisted source for ${ref.digest}`);
  const value = load(sourcePath);
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  assert.equal(sha256Digest(bytes), ref.digest);
  return { ref: clone(ref), bytes, value };
});

const traceabilityRefs = priorGraph.nodes
  .filter(({ kind, state }) => kind === "work-item" && state === "active")
  .map(({ nodeId }) => ({ nodeId, artifact: priorGraphRef }))
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId, "en"));
assert.equal(traceabilityRefs.length, 9);

const packageReviewText = [
  "# ApprovedChangePackage review: LifecycleRunReport",
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
  "The package authorizes a lineage-only rebase of the existing LifecycleRunReport plan onto the approved ContractBaseline 1.6.0. The eight report contract payloads are unchanged, so all nine work items and all 206 coverage dispositions remain byte-for-byte stable.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-lifecycle-run-report-v2",
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
  packageId: "ACP-RUN-002",
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
  stateId: "PWBS-RUN-BASELINED-002",
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
  "openspec-tasks-lifecycle-run-report-v2",
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

const proposedWorkItems = [
  workItem({
    id: "WI-RUN-CONTRACTS",
    objective: "Define the closed LifecycleRunReport artifacts, Core-owned service surface, and read-only report access port.",
    included: ["Implement validators and exports for workflow facts, observations, snapshots, policy, completion, frontier, comparability, and report access.", "Keep report contracts provider-neutral and authority-free."],
    excluded: ["Routing modules, approving Gates, mutating canonical artifacts, or satisfying verification evidence."],
    deliverables: [["DEL-RUN-CONTRACTS", "Closed LifecycleRunReport artifact validators and public Core surface.", "RuntimeContractSet"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-NON-AUTHORITY-001"],
    architectureRefs: ["EL-RUN-REPORTING", "EL-RUN-REPORT-PORT"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING"],
    verificationMethod: "Compile and exercise every report contract with positive, negative, substitution, unknown-field, and forbidden-authority fixtures.",
    successCriteria: "Only closed, versioned, provider-neutral reporting artifacts validate and none can claim workflow authority.",
    evidenceKind: "lifecycle-run-report/contract-tests",
  }),
  workItem({
    id: "WI-RUN-LEDGER",
    objective: "Record standardized workflow facts in one append-only, content-addressed RunLedger.",
    included: ["Normalize module, Gate, adapter, checkpoint, approval, progression, skip, retry, and resume records.", "Reject reordered, duplicated, stale, or authority-bearing facts."],
    excluded: ["Selecting operations or adapters, changing progression, or interpreting host observations as facts."],
    deliverables: [["DEL-RUN-LEDGER", "Canonical RunLedger recorder and immutable checkpoint implementation.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-NON-AUTHORITY-001", "AC-DEV-RUN-TRACE-JOIN-001"],
    architectureRefs: ["EL-RUN-FACT-RECORDER", "EL-RUN-LEDGER"],
    contractRefs: ["CT-IF-RUN-WORKFLOW-FACTS"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-CONTRACTS", "after", "The ledger stores only contract-valid standardized facts.")],
    verificationMethod: "Exercise arbitrary module counts, conditional skips, failures, retries, resumptions, parallel frontiers, duplicate facts, ordering changes, and checkpoint replay.",
    successCriteria: "One exact fact set always yields one byte-stable append-only ledger checkpoint without controlling the lifecycle.",
    evidenceKind: "lifecycle-run-report/ledger-tests",
  }),
  workItem({
    id: "WI-RUN-OBSERVATIONS",
    objective: "Ingest non-authoritative host observations and derive explicit maturity and comparability dispositions.",
    included: ["Represent duration, calls, tokens, cost, wait, retry, and checkpoint measurements as measured, estimated, unavailable, or not-applicable.", "Resolve adapter maturity and snapshot comparability from exact declared evidence."],
    excluded: ["Treating unavailable metrics as zero, inferring live conformance, or using observations to approve work."],
    deliverables: [["DEL-RUN-OBSERVATIONS", "Host observation ingress, maturity resolver, and comparability evaluator.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-METRICS-001", "AC-DEV-RUN-NON-AUTHORITY-001", "AC-DEV-RUN-SECURITY-001"],
    architectureRefs: ["EL-RUN-COMPARABILITY", "EL-RUN-MATURITY-RESOLVER", "EL-RUN-OBSERVATION-INGRESS"],
    contractRefs: ["CT-IF-RUN-COMPARABILITY", "CT-IF-RUN-HOST-OBSERVATIONS"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-CONTRACTS", "after", "Observations and dispositions must conform to the canonical report contracts.")],
    verificationMethod: "Exercise complete, partial, estimated, unavailable, not-applicable, maturity-substitution, incomparable, and reordered observation sets.",
    successCriteria: "Every surfaced metric and maturity statement retains exact provenance and an explicit availability or comparability disposition.",
    evidenceKind: "lifecycle-run-report/observation-tests",
  }),
  workItem({
    id: "WI-RUN-FRONTIER",
    objective: "Record factual integrated completion and derive each next runnable frontier from the approved static dependency DAG.",
    included: ["Accept only exact integrated completion facts.", "Compute deterministic ready frontiers without mutating the WorkDependencyBaseline."],
    excluded: ["Scheduling, assignment, execution, speculative completion, or dependency-DAG mutation."],
    deliverables: [["DEL-RUN-FRONTIER", "Integrated completion registry and deterministic ready-frontier resolver.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-NON-AUTHORITY-001"],
    architectureRefs: ["EL-RUN-COMPLETION-REGISTRY", "EL-RUN-FRONTIER-RESOLVER"],
    contractRefs: ["CT-IF-RUN-INTEGRATED-COMPLETION", "CT-IF-RUN-READY-FRONTIER"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-CONTRACTS", "after", "Completion and frontier data must conform to exact contracts."), hint("WI-RUN-LEDGER", "after", "Derived frontiers are recorded as facts in the ledger.")],
    verificationMethod: "Exercise empty, serial, parallel, repeated-frontier, stale completion, missing predecessor, cycle-defense, and all-complete fixtures.",
    successCriteria: "Only exact integrated completion unlocks work and insertion order never changes the derived frontier.",
    evidenceKind: "lifecycle-run-report/frontier-tests",
  }),
  workItem({
    id: "WI-RUN-SNAPSHOT",
    objective: "Project arbitrary RunLedger history and exact TraceabilityGraph state into one canonical LifecycleRunSnapshot.",
    included: ["Discover components dynamically from standardized facts.", "Join important outputs, Gate decisions, rework, performance, traceability gaps, and next action without product-ID branches."],
    excluded: ["Graph mutation, inverse-edge storage, workflow control, or hiding missing trace/evidence."],
    deliverables: [["DEL-RUN-SNAPSHOT", "Dynamic lifecycle snapshot projector and traceability join.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-METRICS-001", "AC-DEV-RUN-TRACE-JOIN-001"],
    architectureRefs: ["EL-RUN-REPORTING", "EL-RUN-SNAPSHOT-PROJECTOR"],
    contractRefs: ["CT-IF-RUN-LIFECYCLE-SNAPSHOT"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-FRONTIER", "after", "Snapshots include the current derived frontier and completion facts."), hint("WI-RUN-LEDGER", "after", "Snapshots project one exact ledger checkpoint."), hint("WI-RUN-OBSERVATIONS", "after", "Snapshots preserve explicit metric and maturity dispositions.")],
    verificationMethod: "Project serial, skipped, failed, resumed, parallel, repeating-frontier, trace-gap, and arbitrary-module-count fixtures under reordered input delivery.",
    successCriteria: "Equivalent exact run state always produces one byte-identical snapshot with complete source links and no hard-coded product modules.",
    evidenceKind: "lifecycle-run-report/snapshot-tests",
  }),
  workItem({
    id: "WI-RUN-CONTENT-POLICY",
    objective: "Apply deterministic disclosure policy before any report content is rendered or exposed.",
    included: ["Classify allowed summaries, artifact links, diagnostics, observations, and redactions from version-pinned policy.", "Fail closed on secret-like, undeclared, or unbound content."],
    excluded: ["Reading arbitrary repository source, transmitting content, or silently weakening redaction policy."],
    deliverables: [["DEL-RUN-CONTENT-POLICY", "Version-pinned report content and redaction policy evaluator.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-NON-AUTHORITY-001", "AC-DEV-RUN-SECURITY-001"],
    architectureRefs: ["EL-RUN-CONTENT-POLICY"],
    contractRefs: ["CT-IF-RUN-CONTENT-POLICY"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-CONTRACTS", "after", "Disclosure decisions use only closed content-policy contracts.")],
    verificationMethod: "Exercise allowed, redacted, secret-like, unknown, missing-policy, stale-policy, and source-substitution fixtures.",
    successCriteria: "No report or access response can expose content absent an exact allow or redaction disposition.",
    evidenceKind: "lifecycle-run-report/content-policy-tests",
  }),
  workItem({
    id: "WI-RUN-MARKDOWN",
    objective: "Render the canonical snapshot into the primary human-readable LifecycleRunReport.md and a bounded read-only access response.",
    included: ["Begin with an executive summary and plain-language stage table.", "Show operation, adapters, outcome, Gate, rework, performance, outputs, traceability, and next action with exact artifact links."],
    excluded: ["Embedding unsanitized source, controlling progression, or treating Markdown as canonical authority."],
    deliverables: [["DEL-RUN-MARKDOWN", "Deterministic Markdown renderer, LifecycleRunReport.md example, and read-only report access port.", "DocumentationGenerator"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-METRICS-001", "AC-DEV-RUN-SECURITY-001"],
    architectureRefs: ["EL-RUN-MARKDOWN-RENDERER", "EL-RUN-REPORT-PORT"],
    contractRefs: ["CT-IF-RUN-REPORT-ACCESS"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TECHNICAL-WRITING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-CONTENT-POLICY", "after", "Only policy-approved content may be rendered."), hint("WI-RUN-SNAPSHOT", "after", "Rendering consumes one validated canonical snapshot.")],
    verificationMethod: "Render representative complete, partial, failed, skipped, resumed, parallel, and repeating-frontier snapshots and compare exact bytes and human-readable sections.",
    successCriteria: "The same approved snapshot, policy, configuration, and renderer version produce byte-identical readable Markdown with complete links.",
    evidenceKind: "lifecycle-run-report/markdown-tests",
  }),
  workItem({
    id: "WI-RUN-VERIFICATION",
    objective: "Release-gate LifecycleRunReport across contracts, ledger, observations, frontier derivation, snapshot projection, policy, rendering, traceability, replay, and packaging.",
    included: ["Run focused and package-level deterministic, privacy, substitution, authority, coverage, replay, and installed-package checks.", "Dogfood one dynamic report over the released circuit."],
    excluded: ["Using the report as verification evidence for itself or claiming business acceptance."],
    deliverables: [["DEL-RUN-RELEASE-EVIDENCE", "LifecycleRunReport release verification and dogfood evidence.", "VerificationEvidenceSet"]],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-RUN-FRONTIER", "after", "Frontier semantics must be complete."), hint("WI-RUN-LEDGER", "after", "Ledger behavior must be complete."), hint("WI-RUN-MARKDOWN", "after", "The primary report path must be executable."), hint("WI-RUN-OBSERVATIONS", "after", "Observation and maturity semantics must be complete."), hint("WI-RUN-SNAPSHOT", "after", "Dynamic projection and graph joins must be complete.")],
    verificationMethod: "Run the canonical package gate plus arbitrary-module, conditional, failure, resume, parallel, frontier, metrics, privacy, traceability, replay, and installed-package suites.",
    successCriteria: "Every approved reporting criterion passes with exact evidence while reporting retains zero lifecycle authority.",
    evidenceKind: "lifecycle-run-report/release-gate",
  }),
  workItem({
    id: "WI-RUN-DOCUMENTATION",
    objective: "Document LifecycleRunReport operation, interpretation, privacy, maturity, comparability, performance, traceability, and IDE usage.",
    included: ["Explain the human-readable report, canonical snapshot, ledger, observation dispositions, repeating frontiers, and read-only authority boundary.", "Provide examples for complete, partial, blocked, failed, resumed, and incomparable runs."],
    excluded: ["Presenting the report as a Gate, verification source, scheduler, or canonical artifact replacement."],
    deliverables: [["DEL-RUN-DOCUMENTATION", "LifecycleRunReport operator, adapter, and IDE documentation.", "DocumentationSet"]],
    workType: "documentation-change",
    acceptanceCriterionRefs: ["AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-METRICS-001", "AC-DEV-RUN-NON-AUTHORITY-001", "AC-DEV-RUN-SECURITY-001", "AC-DEV-RUN-TRACE-JOIN-001"],
    architectureRefs: ["EL-RUN-REPORT-PORT", "EL-RUN-REPORTING"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-RUN-VERIFICATION", "after", "Documentation must cite final verified behavior and dogfood evidence.")],
    verificationMethod: "Review the guide and examples against approved requirements, architecture, contracts, release evidence, and generated report bytes.",
    successCriteria: "An operator can understand what happened, gauge performance, follow evidence, and distinguish reporting from workflow authority.",
    evidenceKind: "lifecycle-run-report/documentation-review",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));
assert.equal(proposedWorkItems.length, 9);
const planningSemantics = ({ ["source-refs"]: _sourceRefs, ...item }) => item;
assert.deepEqual(
  proposedWorkItems.map(planningSemantics),
  currentBaseline.workItems.map(planningSemantics),
  "The approved ContractBaseline changes lineage only; work-item semantics must not churn.",
);
const workItems = clone(currentBaseline.workItems);

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

const coverageDispositions = clone(currentBaseline.coverageDispositions);
assert.equal(coverageDispositions.length, 206);

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

const changes = [];

const workBreakdownChangeSet = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownChangeSetDraft",
  changeSetId: "WBCS-RUN-002",
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
  [historicalCompletionProofRef, historicalCompletionProofBytes],
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
        "The nine approved LifecycleRunReport work items and all 206 scope dispositions are preserved unchanged while the baseline is rebound to the approved ContractBaseline 1.6.0 lineage.",
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
  "module-route-decision-lifecycle-run-report-v2",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-lifecycle-run-report-v2",
  runId: "lifecycle-run-report-dogfood-run-v2",
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
      "C:/repos/DevRelay/dogfood/lifecycle-run-report/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "lifecycle-run-report",
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
        "C:/repos/DevRelay/dogfood/lifecycle-run-report/work-breakdown",
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
  [refKey(historicalCompletionProofRef), historicalCompletionProofBytes],
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
const activeRunWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-RUN-"),
);
const activeBefore = priorGraph.nodes.filter(
  ({ kind, state }) => kind === "work-item" && state === "active",
);
const activeAfter = snapshot.nodes.filter(
  ({ kind, state }) => kind === "work-item" && state === "active",
);
const retiredBefore = priorGraph.nodes.filter(
  ({ kind, state }) => kind === "work-item" && state === "retired",
);
const retiredAfter = snapshot.nodes.filter(
  ({ kind, state }) => kind === "work-item" && state === "retired",
);
assert.equal(activeRunWorkItems.length, workItems.length);
assert.equal(activeAfter.length, activeBefore.length);
assert.equal(retiredAfter.length, retiredBefore.length);
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
  "work-breakdown-runtime-proof-lifecycle-run-report-v2",
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
  "# WorkBreakdown Gate: LifecycleRunReport",
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
  "- PASS: all 6 LifecycleRunReport acceptance criteria, all 12 architecture elements, and all 8 contracts retain reciprocal planned coverage inside the complete 206-disposition snapshot.",
  "- PASS: the approved ContractBaseline changes lineage only; all nine work items and every coverage disposition are preserved without retire/add churn.",
  "- PASS: every preserved WorkItemDraft uses the closed deliverable-oriented contract; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one control revision without adding, retiring, or replacing work-item nodes.",
  "",
  "## Decision",
  "",
  "Approve the exact lineage-only WorkBreakdownChangeSetDraft and promote WorkBreakdownBaseline 1.7.1 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-lifecycle-run-report-v2",
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
  version: "1.7.1",
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
  proofId: "work-breakdown-gate-promotion-lifecycle-run-report-v2",
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
    retiredPriorWorkItems: 0,
    newWorkItems: 0,
    preservedWorkItems: workItems.length,
    alreadySatisfiedCoverage: coverageDispositions.filter(({ disposition }) => disposition === "already-satisfied").length,
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
    "WorkBreakdown did not assign a specialist, schedule, execute, build, or claim completion of any LifecycleRunReport item.",
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
      newWorkItems: 0,
      retiredPriorWorkItems: 0,
      preservedWorkItems: workItems.length,
      coverage: coverageDispositions.length,
      graphRevision: snapshot.revision,
      progressionAllowed: promotionProof.workDependencyAnalysisProgressionAllowed,
    },
    null,
    2,
  ),
);
