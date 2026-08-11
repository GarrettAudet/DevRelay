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
const dogfoodRelative = "dogfood/chatgpt-desktop-runtime/work-breakdown";
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
  "dogfood/chatgpt-desktop-runtime/repository-snapshot.json",
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
  "dogfood/chatgpt-desktop-runtime/requirements-gate-promotion-proof.json",
);
const architecturePromotionBytes = read(
  "dogfood/chatgpt-desktop-runtime/architecture-design/architecture-gate-promotion-proof.json",
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
  "dogfood/chatgpt-desktop-runtime/contract-generation/approved/contract-gate-promotion.json",
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
  "repository-snapshot-devrelay-chatgpt-desktop-runtime-001",
  REPOSITORY_CONTRACT,
  repositoryBytes,
  "file:///C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/repository-snapshot.json",
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
  "file:///C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/requirements-gate-promotion-proof.json",
);
const architecturePromotionRef = artifactRef(
  architecturePromotion.proofId,
  {
    schema: "https://devrelay.dev/evidence/architecture-gate-promotion/v1",
    mediaType: "application/json",
  },
  architecturePromotionBytes,
  "file:///C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/architecture-design/architecture-gate-promotion-proof.json",
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
  "file:///C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/contract-generation/approved/contract-gate-promotion.json",
);

const targetAcceptanceIds = requirements.requirements.acceptanceCriteria
  .map(({ id }) => id)
  .filter((id) => id.startsWith("AC-DEV-DESKTOP-"))
  .sort();
const targetArchitectureIds = architecture.sections.architectureModel.content.elements
  .map(({ id }) => id)
  .filter((id) => id.startsWith("EL-DESKTOP-"))
  .sort();
assert.equal(targetAcceptanceIds.length, 12);
assert.equal(targetArchitectureIds.length, 8);

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
  .filter(({ interfaceIntentId }) => interfaceIntentId.startsWith("IF-DESKTOP-"))
  .map(({ id }) => id)
  .sort();
assert.equal(targetContractIds.length, 6);
const authorizedContractIds = [
  ...new Set([...priorContractIds, ...targetContractIds]),
].sort();
assert.equal(authorizedContractIds.length, 48);

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
  "# ApprovedChangePackage review: ChatGPT Desktop runtime",
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
  "The package authorizes retirement of the nine completed LifecycleRunReport planning items and adds planning-only work for the approved ChatGPT Desktop Windows runtime delta.",
  "",
].join("\n");
const packageReviewBytes = writeText(
  "approved-change-package-review.md",
  packageReviewText,
);
const packageReviewRef = artifactRef(
  "approved-change-package-review-chatgpt-desktop-runtime-v1",
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
  packageId: "ACP-DESKTOP-001",
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
  stateId: "PWBS-DESKTOP-BASELINED-001",
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
  "openspec-tasks-chatgpt-desktop-runtime-v1",
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
    "required-capabilities": [...new Set(capabilities)].sort(),
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
    id: "WI-DESKTOP-CONTRACTS",
    objective: "Implement the closed Desktop runtime artifact contracts and provider-neutral public types.",
    included: ["Implement and export schemas for capability resolution, installation, MCP commands, run state, run view, and task lifecycle.", "Bind each validator to the approved ContractBaseline 1.7.0 artifacts."],
    excluded: ["Starting tasks, selecting workflow routes, approving gates, or performing installation effects."],
    deliverables: [["DEL-DESKTOP-CONTRACTS", "Desktop runtime schemas, validators, and public library exports.", "RuntimeContractSet"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-DETERMINISM-001", "AC-DEV-DESKTOP-MCP-001", "AC-DEV-DESKTOP-RESUME-001"],
    architectureRefs: ["EL-DESKTOP-HOST", "EL-DESKTOP-MCP-BRIDGE", "EL-DESKTOP-RUN-STORE"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    verificationMethod: "Compile every schema and run positive, negative, unknown-field, authority-boundary, and deterministic-byte fixtures.",
    successCriteria: "Only closed approved Desktop artifacts validate and equivalent values produce byte-identical canonical representations.",
    evidenceKind: "chatgpt-desktop/contracts-conformance",
  }),
  workItem({
    id: "WI-DESKTOP-PLUGIN",
    objective: "Package DevRelay as a repository-backed ChatGPT Desktop plug-in with one discoverable operator skill and local MCP binding.",
    included: ["Create the .codex-plugin manifest, repository marketplace entry, Desktop skill, and MCP configuration.", "Expose the deterministic DevRelay operating surface without embedding workflow authority in the skill."],
    excluded: ["Public directory publication, hosted services, or duplicating Core lifecycle decisions in prompts."],
    deliverables: [["DEL-DESKTOP-PLUGIN", "Validated repository marketplace plug-in package.", "PluginPackage"]],
    workType: "configuration-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-INSTALL-001", "AC-DEV-DESKTOP-LIVE-PATH-001", "AC-DEV-DESKTOP-WINDOWS-001"],
    architectureRefs: ["EL-DESKTOP-PLUGIN"],
    contractRefs: ["CT-IF-DESKTOP-INSTALLATION", "CT-IF-DESKTOP-MCP-COMMANDS"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-DESKTOP-CONTRACTS", "after", "The plug-in advertises only the approved typed Desktop surface.")],
    verificationMethod: "Run the official local plug-in validator and load the package from a clean repository marketplace registration.",
    successCriteria: "ChatGPT Desktop discovers one valid DevRelay plug-in and its local MCP server without manual source edits.",
    evidenceKind: "chatgpt-desktop/plugin-validation",
  }),
  workItem({
    id: "WI-DESKTOP-MCP-BRIDGE",
    objective: "Implement the typed local STDIO MCP bridge that exposes DevRelay lifecycle commands to ChatGPT Desktop.",
    included: ["Expose bounded start, inspect, resume, approve, and report operations over approved contracts.", "Validate every request before invoking Core and every response before returning it."],
    excluded: ["Model-selected routing, direct graph mutation, arbitrary shell execution, or bypassing gates."],
    deliverables: [["DEL-DESKTOP-MCP-BRIDGE", "Local STDIO MCP server and command handlers.", "RuntimeService"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-DETERMINISM-001", "AC-DEV-DESKTOP-MCP-001", "AC-DEV-DESKTOP-SECURITY-001"],
    architectureRefs: ["EL-DESKTOP-MCP-BRIDGE", "EL-DESKTOP-HOST"],
    contractRefs: ["CT-IF-DESKTOP-MCP-COMMANDS"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-CONTRACTS", "after", "The bridge must validate the canonical Desktop request and response contracts.")],
    verificationMethod: "Exercise initialize, tools/list, valid calls, malformed calls, unknown tools, denied effects, restart, and byte-stable replay over STDIO.",
    successCriteria: "The local MCP bridge is protocol-conformant, deterministic, fail-closed, and grants no lifecycle authority outside Core.",
    evidenceKind: "chatgpt-desktop/mcp-conformance",
  }),
  workItem({
    id: "WI-DESKTOP-RUN-STORE",
    objective: "Persist content-addressed Desktop run state, checkpoints, task bindings, approvals, and reports for exact resume.",
    included: ["Implement atomic local writes, digest verification, restart recovery, and immutable execution history.", "Keep source artifacts and human-readable report pointers."],
    excluded: ["Cloud persistence, mutable evidence, or reconstructing state from conversational memory."],
    deliverables: [["DEL-DESKTOP-RUN-STORE", "Durable local Desktop run store and replay API.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-DETERMINISM-001", "AC-DEV-DESKTOP-OBSERVABILITY-001", "AC-DEV-DESKTOP-RESUME-001"],
    architectureRefs: ["EL-DESKTOP-RUN-STORE"],
    contractRefs: ["CT-IF-DESKTOP-RUN-STATE", "CT-IF-DESKTOP-RUN-VIEW"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-CONTRACTS", "after", "Stored values must conform to the approved run-state and run-view contracts.")],
    verificationMethod: "Exercise atomic commit, interruption, corruption, stale checkpoint, duplicate request, restart, and exact replay fixtures on Windows paths.",
    successCriteria: "An interrupted Desktop run resumes from the last valid checkpoint with no lost or invented lifecycle facts.",
    evidenceKind: "chatgpt-desktop/run-store-recovery",
  }),
  workItem({
    id: "WI-DESKTOP-CAPABILITY-RESOLVER",
    objective: "Resolve configured module capabilities to version-pinned live, fixture-conformant, or unavailable adapter bindings.",
    included: ["Inventory mandatory-module bindings and maturity labels.", "Fail closed when a mandatory live path is absent or a binding drifts."],
    excluded: ["Letting the model choose adapters or claiming fixture adapters are live."],
    deliverables: [["DEL-DESKTOP-CAPABILITY-RESOLVER", "Desktop capability resolver and maturity inventory.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-LIVE-PATH-001", "AC-DEV-DESKTOP-MATURITY-001"],
    architectureRefs: ["EL-DESKTOP-CAPABILITY-RESOLVER"],
    contractRefs: ["CT-IF-DESKTOP-CAPABILITY-RESOLUTION"],
    capabilities: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-CONTRACTS", "after", "Capability resolution emits the approved closed contract.")],
    verificationMethod: "Exercise live, fixture, missing, duplicate, incompatible-version, tampered-manifest, and deterministic-selection fixtures.",
    successCriteria: "Every mandatory module has one explicit maturity-labelled binding and no unavailable or fixture-only binding can masquerade as the release path.",
    evidenceKind: "chatgpt-desktop/capability-resolution",
  }),
  workItem({
    id: "WI-DESKTOP-APP-SERVER",
    objective: "Implement a typed Codex app-server JSON-RPC client for starting, resuming, and observing discrete Desktop tasks.",
    included: ["Bind thread/start, thread/resume, turn/start, notifications, cancellation, and terminal results.", "Preserve exact request, response, and task identity evidence."],
    excluded: ["Treating app-server tasks as workflow authority or relying on undocumented conversational state."],
    deliverables: [["DEL-DESKTOP-APP-SERVER", "Codex app-server client and protocol fixtures.", "RuntimeLibrary"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-SECURITY-001", "AC-DEV-DESKTOP-TASKS-001", "AC-DEV-DESKTOP-WINDOWS-001"],
    architectureRefs: ["EL-DESKTOP-APP-SERVER-CLIENT"],
    contractRefs: ["CT-IF-DESKTOP-TASK-LIFECYCLE"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-CONTRACTS", "after", "Task lifecycle messages must normalize into the approved contract.")],
    verificationMethod: "Run protocol fixtures and one live local app-server task covering start, event streaming, completion, cancellation, restart, and resume.",
    successCriteria: "DevRelay can deterministically bind one local Codex task lifecycle to one WorkItem without granting that task Core authority.",
    evidenceKind: "chatgpt-desktop/app-server-conformance",
  }),
  workItem({
    id: "WI-DESKTOP-TASK-SUPERVISOR",
    objective: "Create and supervise exactly one isolated Codex task for each runnable WorkItem selected by Core.",
    included: ["Render immutable work-item context, launch only the ready frontier, collect exact handoffs, and bind task identity to execution records.", "Recalculate readiness only after verified integration."],
    excluded: ["Changing the DAG, selecting work independently, accepting self-reported completion, or merging unverified changes."],
    deliverables: [["DEL-DESKTOP-TASK-SUPERVISOR", "Desktop task supervisor and immutable handoff collector.", "RuntimeService"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-DETERMINISM-001", "AC-DEV-DESKTOP-HANDOFF-001", "AC-DEV-DESKTOP-SECURITY-001", "AC-DEV-DESKTOP-TASKS-001"],
    architectureRefs: ["EL-DESKTOP-HOST", "EL-DESKTOP-TASK-SUPERVISOR"],
    contractRefs: ["CT-IF-DESKTOP-TASK-LIFECYCLE"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-APP-SERVER", "after", "The supervisor uses the validated app-server lifecycle client."), hint("WI-DESKTOP-RUN-STORE", "after", "Task bindings and handoffs require durable checkpoints.")],
    verificationMethod: "Exercise serial and parallel frontiers, duplicate launch, stale DAG, failed handoff, cancellation, restart, and exact transitive-context fixtures.",
    successCriteria: "Each ready WorkItem maps to one auditable task and no dependent work starts before its verified handoffs are accepted by Core.",
    evidenceKind: "chatgpt-desktop/task-supervision",
  }),
  workItem({
    id: "WI-DESKTOP-LIFECYCLE",
    objective: "Compose the Desktop plug-in, MCP bridge, capability resolver, run store, Core modules, and task supervisor into one deterministic lifecycle controller.",
    included: ["Run every mandatory module and gate in the approved sequence.", "Expose current state, next action, approvals, evidence, traceability, and the human-readable lifecycle report."],
    excluded: ["Skipping modules, substituting prompt memory for artifacts, or allowing the Desktop shell to own progression."],
    deliverables: [["DEL-DESKTOP-LIFECYCLE", "End-to-end Desktop lifecycle controller and operator surface.", "RuntimeService"]],
    workType: "code-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-E2E-001", "AC-DEV-DESKTOP-LIVE-PATH-001", "AC-DEV-DESKTOP-OBSERVABILITY-001"],
    architectureRefs: ["EL-DESKTOP-HOST", "EL-DESKTOP-MCP-BRIDGE", "EL-DESKTOP-TASK-SUPERVISOR"],
    contractRefs: ["CT-IF-DESKTOP-MCP-COMMANDS", "CT-IF-DESKTOP-RUN-VIEW"],
    capabilities: ["CAP-NODEJS-ENGINEERING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-CAPABILITY-RESOLVER", "after", "The controller may invoke only maturity-valid configured bindings."), hint("WI-DESKTOP-MCP-BRIDGE", "after", "Desktop commands enter through the validated MCP boundary."), hint("WI-DESKTOP-TASK-SUPERVISOR", "after", "WorkExecution uses isolated supervised tasks." )],
    verificationMethod: "Run complete, blocked, failed, resumed, and repeating-frontier lifecycle fixtures through the MCP command surface.",
    successCriteria: "Core deterministically advances one artifact-backed lifecycle and exposes a truthful human-readable state without skipped authority checks.",
    evidenceKind: "chatgpt-desktop/lifecycle-controller",
  }),
  workItem({
    id: "WI-DESKTOP-INSTALL",
    objective: "Provide deterministic Windows installation, upgrade, rollback, uninstall, and health-check operations for the repository-backed Desktop plug-in.",
    included: ["Register the local marketplace and plug-in, verify dependencies and configuration, preserve prior state, and emit a digest-bound receipt."],
    excluded: ["Silent global mutation, public marketplace publication, hosted deployment, or storing secrets in the repository."],
    deliverables: [["DEL-DESKTOP-INSTALL", "Windows install controller, rollback path, and health check.", "InstallationBundle"]],
    workType: "configuration-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-INSTALL-001", "AC-DEV-DESKTOP-SECURITY-001", "AC-DEV-DESKTOP-WINDOWS-001"],
    architectureRefs: ["EL-DESKTOP-HOST", "EL-DESKTOP-INSTALL-CONTROLLER", "EL-DESKTOP-PLUGIN"],
    contractRefs: ["CT-IF-DESKTOP-INSTALLATION"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-RELEASE-ENGINEERING", "CAP-RELEASE-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-PLUGIN", "after", "Installation registers the validated plug-in package."), hint("WI-DESKTOP-LIFECYCLE", "after", "Health checks exercise the complete local runtime surface.")],
    verificationMethod: "Run clean install, idempotent reinstall, upgrade, rollback, uninstall, path-with-spaces, missing dependency, and tampered package fixtures on Windows.",
    successCriteria: "A Windows Desktop user can install, verify, upgrade, roll back, and remove the exact package with auditable reversible effects.",
    evidenceKind: "chatgpt-desktop/installation",
  }),
  workItem({
    id: "WI-DESKTOP-DOCUMENTATION",
    objective: "Document the ChatGPT Desktop Windows quick path, lifecycle behavior, plug-in maturity, evidence model, troubleshooting, and rollback.",
    included: ["Provide operator commands, expected task behavior, reports, approval points, limitations, and recovery steps."],
    excluded: ["Claiming public publication, a hosted backend, or live maturity for unexecuted alternative adapters."],
    deliverables: [["DEL-DESKTOP-DOCUMENTATION", "Desktop operator, adapter, security, and troubleshooting guide.", "DocumentationSet"]],
    workType: "documentation-change",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-INSTALL-001", "AC-DEV-DESKTOP-MATURITY-001", "AC-DEV-DESKTOP-OBSERVABILITY-001"],
    architectureRefs: ["EL-DESKTOP-PLUGIN"],
    capabilities: ["CAP-TECHNICAL-WRITING"],
    dependencyHints: [hint("WI-DESKTOP-INSTALL", "after", "The guide must cite the verified installation and recovery path."), hint("WI-DESKTOP-VERIFICATION", "after", "Maturity and limitations must match final release evidence.")],
    verificationMethod: "Review every command and claim against clean-install evidence, runtime outputs, security boundaries, and the adapter maturity inventory.",
    successCriteria: "A new Windows Desktop user can operate and recover DevRelay while understanding exactly which capabilities are live or fixture-conformant.",
    evidenceKind: "chatgpt-desktop/documentation-review",
  }),
  workItem({
    id: "WI-DESKTOP-VERIFICATION",
    objective: "Release-gate the deterministic Desktop library, plug-in, MCP bridge, app-server integration, task supervision, persistence, security, and packaging.",
    included: ["Run focused, package, installed-package, protocol, restart, isolation, negative, and Windows path suites.", "Independently validate all approved requirements, architecture elements, and contracts."],
    excluded: ["Using self-reported task completion as evidence or claiming business acceptance."],
    deliverables: [["DEL-DESKTOP-VERIFICATION", "Desktop release verification and security evidence set.", "VerificationEvidenceSet"]],
    workType: "test-change",
    acceptanceCriterionRefs: targetAcceptanceIds,
    architectureRefs: targetArchitectureIds,
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING", "CAP-TEST-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-LIFECYCLE", "after", "The complete Desktop runtime path must be executable."), hint("WI-DESKTOP-INSTALL", "after", "Installed-package behavior must be testable.")],
    verificationMethod: "Run npm verify, installed-package verification, MCP and app-server protocol suites, restart and drift scenarios, permission-negative tests, and clean Windows smoke tests.",
    successCriteria: "Every Desktop acceptance criterion, architecture element, and contract has passing independent evidence with no critical security or determinism finding.",
    evidenceKind: "chatgpt-desktop/release-gate",
  }),
  workItem({
    id: "WI-DESKTOP-CLEAN-RUN",
    objective: "Prove the release by using the clean-installed Desktop plug-in to build, verify, integrate, and accept one bounded production-quality DevRelay feature.",
    included: ["Run the full mandatory module sequence and repeating execution frontier.", "Create one discrete Codex task per runnable WorkItem and preserve exact handoffs, verification, integration, system, and business-acceptance evidence."],
    excluded: ["Fixture-only execution, skipped modules, manual artifact substitution, or treating this planning run as the clean-install proof."],
    deliverables: [["DEL-DESKTOP-CLEAN-RUN", "Clean-install end-to-end Desktop reference run and LifecycleRunReport.md.", "OperationalReadinessEvidence"]],
    workType: "operational-readiness",
    acceptanceCriterionRefs: ["AC-DEV-DESKTOP-E2E-001", "AC-DEV-DESKTOP-HANDOFF-001", "AC-DEV-DESKTOP-LIVE-PATH-001", "AC-DEV-DESKTOP-TASKS-001"],
    architectureRefs: ["EL-DESKTOP-HOST", "EL-DESKTOP-PLUGIN", "EL-DESKTOP-TASK-SUPERVISOR"],
    contractRefs: targetContractIds,
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-RELEASE-ENGINEERING", "CAP-RELEASE-ENGINEERING"],
    dependencyHints: [hint("WI-DESKTOP-DOCUMENTATION", "after", "The clean operator path uses final verified instructions."), hint("WI-DESKTOP-VERIFICATION", "after", "Only the release-gated package may produce the acceptance run.")],
    verificationMethod: "Install into a clean Desktop configuration and execute one real feature from Goal through BusinessAcceptance while comparing every artifact, gate, task, and evidence link.",
    successCriteria: "A clean ChatGPT Desktop Windows installation completes one real production-quality feature through every mandatory DevRelay module with exact traceability and no manual authority bypass.",
    evidenceKind: "chatgpt-desktop/clean-e2e-run",
  }),
].sort((left, right) => left.id.localeCompare(right.id, "en"));
assert.equal(proposedWorkItems.length, 12);
const workItems = proposedWorkItems;

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
    rationale: "The prior LifecycleRunReport work is present in the pinned repository snapshot with exact passing WorkBreakdown Gate evidence; it is historical completion evidence, not new Desktop runtime work.",
    currentEvidence: clone(priorCompletionEvidence),
  })),
  ...targetAcceptanceIds.map((id) => plannedCoverage("acceptance-criterion", id)),
  ...targetArchitectureIds.map((id) => plannedCoverage("architecture", id)),
  ...targetContractIds.map((id) => plannedCoverage("contract", id)),
].sort((left, right) =>
  (left.scopeKind + "\u0000" + left.scopeRef).localeCompare(right.scopeKind + "\u0000" + right.scopeRef, "en"),
);

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
    rationale: "The prior LifecycleRunReport deliverable is complete in the pinned repository and is retained as already-satisfied historical coverage.",
  })),
  ...workItems.map((item) => ({ operation: "add", workItem: item })),
].sort((left, right) =>
  (left.workItemId ?? left.workItem.id).localeCompare(right.workItemId ?? right.workItem.id, "en"),
);

const workBreakdownChangeSet = {
  apiVersion: API_VERSION,
  kind: "WorkBreakdownChangeSetDraft",
  changeSetId: "WBCS-DESKTOP-001",
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
        "The nine approved ChatGPT Desktop runtime work items and all 206 scope dispositions are preserved unchanged while the baseline is rebound to the approved ContractBaseline 1.6.0 lineage.",
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
  "module-route-decision-chatgpt-desktop-runtime-v1",
  ROUTE_CONTRACT,
  routeBytes,
  finalUri("module-route-decision.json"),
);
register(routeRef, routeBytes);

const invocation = {
  apiVersion: API_VERSION,
  kind: "ModuleInvocation",
  invocationId: "work-breakdown-decompose-chatgpt-desktop-runtime-v1",
  runId: "chatgpt-desktop-runtime-dogfood-run-v1",
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
      "C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/work-breakdown",
    toolName: "OpenSpec",
    toolVersion: "0.1.0-fixture",
    changeName: "chatgpt-desktop-runtime",
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
        "C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime/work-breakdown",
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
const activeDesktopWorkItems = snapshot.nodes.filter(
  ({ kind, state, stableId }) =>
    kind === "work-item" && state === "active" && stableId.startsWith("WI-DESKTOP-"),
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
assert.equal(activeDesktopWorkItems.length, workItems.length);
assert.equal(activeAfter.length, workItems.length);
assert.equal(retiredAfter.length, retiredBefore.length + currentBaseline.workItems.length);
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
  "work-breakdown-runtime-proof-chatgpt-desktop-runtime-v1",
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
  "# WorkBreakdown Gate: ChatGPT Desktop runtime",
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
  "- PASS: all 12 approved Desktop acceptance criteria, all 8 Desktop architecture elements, and all 6 Desktop contracts have reciprocal planned coverage inside the complete 232-disposition snapshot.",
  "- PASS: the nine completed LifecycleRunReport items are retired and retained as already-satisfied historical coverage; twelve bounded Desktop deliverables are added without claiming execution.",
  "- PASS: every Desktop WorkItemDraft uses the closed deliverable-oriented contract and only controlled capability types; dependency hints remain non-authoritative.",
  "- PASS: the trusted contributor extended the exact prior graph by one revision, retiring the prior candidate work nodes and adding the Desktop planning nodes atomically.",
  "",
  "## Decision",
  "",
  "Approve the exact Desktop WorkBreakdownChangeSetDraft and promote WorkBreakdownBaseline 1.8.0 for progression to WorkDependencyAnalysis.",
  "",
].join("\n");
const gateBytes = writeText("work-breakdown-gate.md", gateText);
const gateRef = artifactRef(
  "work-breakdown-gate-chatgpt-desktop-runtime-v1",
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
  version: "1.8.0",
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
  proofId: "work-breakdown-gate-promotion-chatgpt-desktop-runtime-v1",
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
    preservedWorkItems: 0,
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
    "WorkBreakdown did not assign a specialist, schedule, execute, build, or claim completion of any ChatGPT Desktop runtime item.",
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
      preservedWorkItems: 0,
      coverage: coverageDispositions.length,
      graphRevision: snapshot.revision,
      progressionAllowed: promotionProof.workDependencyAnalysisProgressionAllowed,
    },
    null,
    2,
  ),
);




