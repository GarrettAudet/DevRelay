import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  analyzeDependencyGraph,
  assembleSpecialistAssignmentDraft,
  canonicalJson,
  canonicalJsonDigest,
  createNativeArchitectureInventory,
  createNativeDependencyProposal,
  evaluateSpecialistEligibility,
  evaluateWorkDependencyPolicy,
  rankSpecialistsDeterministically,
  sha256Digest,
  validateArchitectureArtifact,
  validateProjectOverviewArtifact,
  validateRequirementsArtifact,
  validateSpecialistAssignmentArtifact,
  validateWorkBreakdownArtifact,
} from "../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const MAIN = "37e968516623c3d135f8829b0e56e19a7ba59722";
const OUTPUT = new URL("./", import.meta.url);
const ROOT = new URL("../../", import.meta.url);
const uri = (path) => `devrelay://repository/${path}`;
const read = (path) => readFileSync(new URL(path, ROOT));
const json = (path) => JSON.parse(read(path));
const exact = (value) => Buffer.from(canonicalJson(value) + "\n", "utf8");
const seal = (value, field = "contentDigest") => ({
  ...value,
  [field]: canonicalJsonDigest(value),
});
const artifactDigest = (value, field) => canonicalJsonDigest(
  Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["apiVersion", "kind", field].includes(key),
    ),
  ),
);

const writeJson = (path, value) =>
  writeFileSync(new URL(path, OUTPUT), exact(value));
const rawRef = (path, artifactId, schema, mediaType) => ({
  artifactId,
  schema,
  mediaType,
  digest: sha256Digest(read(path)),
  uri: uri(path),
});
const valueRef = (path, artifactId, schema, mediaType, value) => ({
  artifactId,
  schema,
  mediaType,
  digest: sha256Digest(exact(value)),
  uri: uri(`dogfood/v0.10.1-code-scanning-hardening/${path}`),
});
const source = (role, artifact, jsonPointer = "") => ({
  role,
  artifact,
  jsonPointer,
});

mkdirSync(OUTPUT, { recursive: true });

const requirements = json("project/requirements-baseline.json");
const overview = json("project/project-overview-baseline.json");
const architecture = json("project/architecture-baseline.json");
const contractDisposition = json("project/contract-disposition.json");
const currentWorkBreakdown = json("project/work-breakdown-baseline.json");
const currentWorkDependency = json("project/work-dependency-baseline.json");
const currentAssignments = json("project/specialist-assignment-baseline.json");
validateRequirementsArtifact(requirements);
validateProjectOverviewArtifact(overview);
validateArchitectureArtifact(architecture);
validateWorkBreakdownArtifact(currentWorkBreakdown);
validateSpecialistAssignmentArtifact(currentAssignments);

const requirementsRef = rawRef(
  "project/requirements-baseline.json",
  requirements.baselineId,
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const overviewRef = rawRef(
  "project/project-overview-baseline.json",
  overview.baselineId,
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const architectureRef = rawRef(
  "project/architecture-baseline.json",
  architecture.baselineId,
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
);
const contractRef = rawRef(
  "project/contract-disposition.json",
  contractDisposition.dispositionId,
  "https://devrelay.dev/artifacts/contract-disposition/v1",
  "application/vnd.devrelay.contract-disposition+json",
);
const currentWorkBreakdownRef = rawRef(
  "project/work-breakdown-baseline.json",
  currentWorkBreakdown.baselineId,
  "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
  "application/vnd.devrelay.work-breakdown-baseline+json",
);
const currentWorkDependencyRef = rawRef(
  "project/work-dependency-baseline.json",
  currentWorkDependency.baselineId,
  "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
  "application/vnd.devrelay.work-dependency-baseline+json",
);
const currentAssignmentsRef = rawRef(
  "project/specialist-assignment-baseline.json",
  currentAssignments.baselineId,
  "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1",
  "application/vnd.devrelay.specialist-assignment-baseline+json",
);
const repositorySnapshot = {
  artifactId: "repository-snapshot-devrelay-main-37e9685",
  schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
  mediaType: "application/vnd.devrelay.repository-snapshot+json",
  digest: sha256Digest(Buffer.from(MAIN, "utf8")),
  uri: `git+https://github.com/GarrettAudet/DevRelay.git#${MAIN}`,
};

const stages = [];
function stage(module, operation, outcome, primaryArtifact, details = {}) {
  const body = {
    apiVersion: API,
    kind: "LifecycleStageRecord",
    sequence: stages.length + 1,
    module,
    operation,
    outcome,
    primaryArtifact,
    ...details,
  };
  const record = seal(body, "recordDigest");
  stages.push(record);
  writeJson(`${String(record.sequence).padStart(2, "0")}-${module}.json`, record);
  return record;
}

const scopeDecision = seal({
  apiVersion: API,
  kind: "RequirementsReuseDisposition",
  dispositionId: "RRD-SCAN-HARDENING-001",
  goal: "Close all actionable scanner findings before the public GitHub source/library preview is called release-ready.",
  requirementsBaseline: requirementsRef,
  projectOverviewBaseline: overviewRef,
  changedSections: [],
  disposition: "approved-baseline-covers-change",
  applicableCriteria: [
    "AC-DEV-ARTIFACT-HANDOFF-001",
    "AC-DEV-OSS-DOGFOOD-001",
    "AC-DEV-OSS-GOVERNANCE-001",
    "AC-DEV-OSS-MAIN-001",
    "AC-DEV-RUN-HUMAN-READABLE-001",
    "AC-DEV-RUN-SECURITY-001",
  ],
  releaseRule: "No actionable scanner finding may remain in repository-owned executable code; non-code governance signals require explicit evidence-backed dispositions.",
  clarification: "No new product behavior, public API, data handling, or supported-host decision is introduced.",
  approvalBasis: "Owner standing approval for necessary release corrections, with clarification required only for product or business ambiguity.",
}, "dispositionDigest");
writeJson("requirements-reuse-disposition.json", scopeDecision);
const scopeRef = valueRef(
  "requirements-reuse-disposition.json",
  scopeDecision.dispositionId,
  "https://devrelay.dev/evidence/requirements-reuse-disposition/v1",
  "application/vnd.devrelay.requirements-reuse-disposition+json",
  scopeDecision,
);
stage("RequirementsGathering", "classify-approved-change", "baseline-reused", scopeRef, {
  inputs: [requirementsRef, overviewRef, repositorySnapshot],
  adapterBinding: { id: "core-native-change-classifier", maturity: "executable" },
  traceabilityDisposition: "no new requirement nodes; preserve exact approved identities",
});
stage("RequirementsGate", "validate-reuse", "approved", scopeRef, {
  decision: "Existing approved scope fully authorizes the bounded release correction.",
});

const discoveryPaths = [
  ".github/workflows/release.yml",
  "dogfood/v0.10-release-hardening/assignment/promote.mjs",
  "package.json",
  "scripts/bootstrap-structurizr.mjs",
  "scripts/release-catalog.mjs",
  "src/lifecycle-run-report-markdown.mjs",
  "test/contract-generation-runtime.test.mjs",
  "test/release-governance.test.mjs",
].sort();
const discoveryAdapter = {
  id: "native-architecture-discovery",
  version: "0.1.0",
  configurationDigest: canonicalJsonDigest({ mode: "offline", commit: MAIN }),
};
const privacyPolicy = {
  artifactId: "architecture-discovery-policy-scanner-hardening",
  schema: "https://devrelay.dev/policy/architecture-discovery/v1",
  mediaType: "application/json",
  digest: canonicalJsonDigest({ offline: true, trackedOnly: true, externalTransmission: false }),
  uri: uri("dogfood/v0.10.1-code-scanning-hardening/discovery-policy.json"),
};
const inventoryBody = {
  apiVersion: API,
  kind: "RepositoryInventoryInvocation",
  invocationId: "inventory-scanner-hardening-001",
  repositorySnapshot,
  allowedPaths: discoveryPaths,
  policy: privacyPolicy,
  adapter: discoveryAdapter,
};
const inventoryInvocation = {
  ...inventoryBody,
  invocationFingerprint: artifactDigest(inventoryBody, "invocationFingerprint"),
};
const inventory = createNativeArchitectureInventory({
  invocation: inventoryInvocation,
  files: discoveryPaths.map((path) => ({
    path,
    bytes: execFileSync("git", ["show", `${MAIN}:${path}`], { cwd: ROOT }),
  })),
});
writeJson("architecture-discovery-inventory.json", inventory);
const inventoryRef = valueRef(
  "architecture-discovery-inventory.json",
  "ADI-SCAN-HARDENING-001",
  "https://devrelay.dev/artifacts/native-repository-inventory/v1",
  "application/vnd.devrelay.native-repository-inventory+json",
  inventory,
);
stage("ArchitectureDiscovery", "discover", "discovered", inventoryRef, {
  inputs: [repositorySnapshot, overviewRef],
  adapterBinding: { ...discoveryAdapter, maturity: "executable" },
  policy: { offline: true, trackedOnly: true, externalTransmission: false },
  findingCount: inventory.findings.length,
  blockingGaps: [],
});

const architectureDesign = seal({
  apiVersion: API,
  kind: "ArchitectureChangeDesign",
  designId: "ACD-SCAN-HARDENING-001",
  operation: "design-change",
  currentArchitectureBaseline: architectureRef,
  discoveryInventory: inventoryRef,
  disposition: "already-designed-elements-with-bounded-internal-hardening",
  affectedElements: [
    "EL-DEVRELAY-CORE",
    "EL-RUN-MARKDOWN-RENDERER",
    "EL-REL-EVIDENCE-ASSEMBLER",
    "EL-REL-GITHUB-PROMOTION",
    "EL-REL-TOOLING",
  ],
  decisions: [
    "Open and validate release files through one descriptor rather than path-level check-then-use sequences.",
    "Create immutable assignment artifacts exclusively and verify exact existing bytes on replay.",
    "Treat toolchain URLs as exact code-owned allowlist constants bound to version and digest.",
    "Keep GitHub workflow tokens read-only by default and isolate tag-release write authority in a post-verification job.",
    "Escape Markdown backslashes before structural delimiters.",
  ],
  publicInterfaceImpact: "none",
  traceabilityDisposition: "Use already-designed coverage; do not churn unchanged architecture entities.",
}, "designDigest");
writeJson("architecture-change-design.json", architectureDesign);
const architectureDesignRef = valueRef(
  "architecture-change-design.json",
  architectureDesign.designId,
  "https://devrelay.dev/evidence/architecture-change-design/v1",
  "application/vnd.devrelay.architecture-change-design+json",
  architectureDesign,
);
stage("ArchitectureDesign", "design-change", "designed", architectureDesignRef, {
  inputs: [requirementsRef, overviewRef, architectureRef, inventoryRef],
  adapterBindings: [
    { id: "openspec-design", maturity: "fixture-conformant", disposition: "bounded design reviewed against canonical baseline" },
    { id: "structurizr", maturity: "fixture-conformant", disposition: "not invoked; no C4 hierarchy change" },
    { id: "madr", maturity: "fixture-conformant", disposition: "decisions embedded in bounded change record" },
  ],
});
stage("ArchitectureGate", "validate-change", "approved", architectureDesignRef, {
  decision: "The internal hardening remains within existing approved elements and authority boundaries.",
});

const contractNotApplicable = seal({
  apiVersion: API,
  kind: "ApprovedNotApplicable",
  approvalId: "ANA-SCAN-CONTRACTS-001",
  purpose: "contract-generation",
  requirementsBaseline: requirementsRef,
  architectureDesign: architectureDesignRef,
  rationale: "No API, schema, event, protocol, package export, or other machine-readable interface changes.",
}, "approvalDigest");
writeJson("contract-approved-not-applicable.json", contractNotApplicable);
const contractNotApplicableRef = valueRef(
  "contract-approved-not-applicable.json",
  contractNotApplicable.approvalId,
  "https://devrelay.dev/evidence/approved-not-applicable/v1",
  "application/vnd.devrelay.approved-not-applicable+json",
  contractNotApplicable,
);
stage("ContractGeneration", "route", "not-applicable", contractNotApplicableRef, {
  inputs: [architectureDesignRef, contractRef],
  generatorCalls: 0,
});
stage("ContractGate", "approve-not-applicable", "approved", contractNotApplicableRef, {
  decision: "ContractBaseline remains unchanged.",
});

const requirementPointers = new Map(
  requirements.requirements.acceptanceCriteria.map((criterion, index) => [criterion.id, `/requirements/acceptanceCriteria/${index}`]),
);
const architecturePointers = new Map(
  architecture.sections.architectureModel.content.elements.map((element, index) => [element.id, `/sections/architectureModel/content/elements/${index}`]),
);
const item = ({ id, objective, workType, criteria, elements, capabilities, after = [], deliverable }) => ({
  id,
  objective,
  "bounded-scope": {
    included: [objective],
    excluded: ["Public API changes, new product behavior, unsupported distribution channels, or bypassing protected verification."],
  },
  deliverables: [{ id: `DEL-${id.slice(3)}`, description: deliverable, artifactKind: "ChangeSet" }],
  "work-type": workType,
  "acceptance-criterion-refs": [...criteria].sort(),
  "architecture-refs": [...elements].sort(),
  "contract-refs": [],
  "required-capabilities": [...capabilities].sort(),
  "dependency-hints": after.map((dependency) => ({
    "work-item-ref": dependency,
    relation: "after",
    rationale: `${id} consumes the verified output of ${dependency}.`,
    authority: "hint",
  })),
  "verification-plan": {
    checks: [{ id: `VC-${id.slice(3)}`, method: objective, successCriteria: deliverable }],
  },
  "required-evidence": [{ kind: `scanner-hardening/${id.toLowerCase()}`, description: deliverable }],
  "source-refs": [
    ...criteria.map((criterion) => source("requirements-baseline", requirementsRef, requirementPointers.get(criterion))),
    ...elements.map((element) => source("architecture-baseline", architectureRef, architecturePointers.get(element))),
  ],
});
const workItems = [
  item({
    id: "WI-SCAN-EXECUTABLE-CODE",
    objective: "Remove every actionable CodeQL finding in repository-owned executable code without weakening deterministic behavior.",
    workType: "code-change",
    criteria: ["AC-DEV-ARTIFACT-HANDOFF-001", "AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-SECURITY-001"],
    elements: ["EL-DEVRELAY-CORE", "EL-RUN-MARKDOWN-RENDERER", "EL-REL-TOOLING"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-SECURITY-ENGINEERING"],
    deliverable: "All 37 CodeQL findings are closed by code changes with focused regression coverage.",
  }),
  item({
    id: "WI-SCAN-RELEASE-PERMISSIONS",
    objective: "Apply least privilege to source-release automation while preserving attestation and tag prerelease behavior.",
    workType: "configuration-change",
    criteria: ["AC-DEV-OSS-MAIN-001"],
    elements: ["EL-REL-GITHUB-PROMOTION"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-SECURITY-ENGINEERING"],
    deliverable: "Read-only workflow default plus isolated, post-verification tag-release write authority.",
  }),
  item({
    id: "WI-SCAN-GOVERNANCE-DISPOSITIONS",
    objective: "Classify every non-code OpenSSF signal with exact evidence, owner, expiry, and remediation disposition.",
    workType: "operational-readiness",
    criteria: ["AC-DEV-OSS-GOVERNANCE-001"],
    elements: ["EL-REL-EVIDENCE-ASSEMBLER"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TECHNICAL-WRITING"],
    deliverable: "No governance scanner signal is silent, misleading, or treated as executable-code acceptance.",
  }),
  item({
    id: "WI-SCAN-VERIFICATION",
    objective: "Run focused, canonical, installed-package, protected-CI, CodeQL, Scorecard, and source-release verification for the exact correction.",
    workType: "test-change",
    criteria: ["AC-DEV-OSS-DOGFOOD-001", "AC-DEV-OSS-MAIN-001"],
    elements: ["EL-REL-EVIDENCE-ASSEMBLER", "EL-REL-GITHUB-PROMOTION", "EL-REL-INSTALLED-VERIFIER"],
    capabilities: ["CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    after: ["WI-SCAN-EXECUTABLE-CODE", "WI-SCAN-GOVERNANCE-DISPOSITIONS", "WI-SCAN-RELEASE-PERMISSIONS"],
    deliverable: "The exact candidate has zero actionable CodeQL findings and all release gates pass on protected main.",
  }),
].sort((a, b) => a.id.localeCompare(b.id, "en"));

const capabilityCatalog = {
  apiVersion: API,
  kind: "CapabilityCatalog",
  catalogId: "CC-SCAN-HARDENING-001",
  version: "1.0.0",
  capabilities: [...new Set(workItems.flatMap((entry) => entry["required-capabilities"]))].sort().map((id) => ({
    id,
    description: `Provider-neutral ${id} capability for the scanner hardening increment.`,
    requiredToolIds: ["TOOL-NODE", "TOOL-GIT", "TOOL-GITHUB"],
    requiredGrantIds: ["GRANT-WORKSPACE", "GRANT-GITHUB-REPOSITORY"],
  })),
};
writeJson("capability-catalog.json", capabilityCatalog);
const capabilityRef = valueRef(
  "capability-catalog.json",
  capabilityCatalog.catalogId,
  "https://devrelay.dev/artifacts/capability-catalog/v1",
  "application/vnd.devrelay.capability-catalog+json",
  capabilityCatalog,
);
const approvedChangePackage = seal({
  apiVersion: API,
  kind: "ApprovedChangePackage",
  packageId: "ACP-SCAN-HARDENING-001",
  requirementsDisposition: scopeRef,
  architectureDisposition: architectureDesignRef,
  contractDisposition: contractNotApplicableRef,
  currentBaselines: [requirementsRef, overviewRef, architectureRef, contractRef, currentWorkBreakdownRef],
  repositorySnapshot,
  traceabilityRefs: scopeDecision.applicableCriteria.map((nodeId) => ({ nodeId })),
}, "packageDigest");
writeJson("approved-change-package.json", approvedChangePackage);
const changePackageRef = valueRef(
  "approved-change-package.json",
  approvedChangePackage.packageId,
  "https://devrelay.dev/artifacts/approved-change-package/v1",
  "application/vnd.devrelay.approved-change-package+json",
  approvedChangePackage,
);
const inputBindings = [
  { role: "requirements-baseline", artifact: requirementsRef },
  { role: "project-overview-baseline", artifact: overviewRef },
  { role: "architecture-baseline", artifact: architectureRef },
  { role: "contract-disposition", artifact: contractRef },
  { role: "current-repository-snapshot", artifact: repositorySnapshot },
  { role: "capability-catalog", artifact: capabilityRef },
  { role: "current-work-breakdown-baseline", artifact: currentWorkBreakdownRef },
  { role: "approved-change-package", artifact: changePackageRef },
].sort((a, b) => a.role.localeCompare(b.role, "en"));
const coverage = [];
for (const [scopeKind, field] of [["acceptance-criterion", "acceptance-criterion-refs"], ["architecture", "architecture-refs"]]) {
  const refs = new Set(workItems.flatMap((entry) => entry[field]));
  for (const scopeRef of [...refs].sort()) {
    coverage.push({
      scopeKind,
      scopeRef,
      disposition: "planned",
      workItemRefs: workItems.filter((entry) => entry[field].includes(scopeRef)).map((entry) => entry.id).sort(),
    });
  }
}
const fullWorkItems = [...currentWorkBreakdown.workItems, ...workItems].sort((a, b) => a.id.localeCompare(b.id, "en"));
const workBreakdownChange = {
  apiVersion: API,
  kind: "WorkBreakdownChangeSetDraft",
  changeSetId: "WBCS-SCAN-HARDENING-001",
  operation: "decompose-change",
  currentBaseline: currentWorkBreakdownRef,
  inputBindings,
  changes: workItems.map((workItem) => ({ operation: "add", workItem })),
  coverageDispositions: coverage,
  resultingWorkItemsDigest: canonicalJsonDigest(fullWorkItems),
  nativeArtifacts: [],
  sourceRefs: [
    source("requirements-baseline", requirementsRef),
    source("project-overview-baseline", overviewRef),
    source("architecture-baseline", architectureRef),
    source("contract-disposition", contractRef),
    source("current-repository-snapshot", repositorySnapshot),
    source("current-work-breakdown-baseline", currentWorkBreakdownRef),
    source("approved-change-package", changePackageRef),
  ],
};
validateWorkBreakdownArtifact(workBreakdownChange);
writeJson("work-breakdown-change-set-draft.json", workBreakdownChange);
const workBreakdownRef = valueRef(
  "work-breakdown-change-set-draft.json",
  workBreakdownChange.changeSetId,
  "https://devrelay.dev/artifacts/work-breakdown-change-set-draft/v1",
  "application/vnd.devrelay.work-breakdown-change-set-draft+json",
  workBreakdownChange,
);
stage("WorkBreakdown", "decompose-change", "decomposed", workBreakdownRef, {
  inputs: inputBindings.map(({ artifact }) => artifact),
  adapterBinding: { id: "native-structured-work-proposer", maturity: "executable" },
  workItemIds: workItems.map(({ id }) => id),
});
stage("WorkBreakdownGate", "validate-change", "approved", workBreakdownRef, {
  checks: { unscopedWork: 0, uncoveredAuthorizedScope: 0, invalidReferences: 0 },
});

const contextSlices = [
  { id: "CTX-SCAN-REQUIREMENTS", purpose: "Approved release/security scope", source: requirementsRef, selector: "/requirements/acceptanceCriteria", extractedDigest: canonicalJsonDigest(scopeDecision.applicableCriteria), coveredWorkItemRefs: workItems.map(({ id }) => id) },
  { id: "CTX-SCAN-ARCHITECTURE", purpose: "Approved implementation boundaries", source: architectureRef, selector: "/sections/architectureModel/content/elements", extractedDigest: canonicalJsonDigest(architectureDesign.affectedElements), coveredWorkItemRefs: workItems.map(({ id }) => id) },
  { id: "CTX-SCAN-REPOSITORY", purpose: "Exact pre-change source revision", source: repositorySnapshot, selector: `git:${MAIN}`, extractedDigest: inventory.inventoryDigest, coveredWorkItemRefs: workItems.map(({ id }) => id) },
];
const contextSliceSetRef = {
  artifactId: "CTXS-SCAN-HARDENING-001",
  schema: "https://devrelay.dev/artifacts/context-slice-set/v1",
  mediaType: "application/vnd.devrelay.context-slice-set+json",
  digest: canonicalJsonDigest(contextSlices),
  uri: uri("dogfood/v0.10.1-code-scanning-hardening/context-slices.json"),
};
writeJson("context-slices.json", { apiVersion: API, kind: "ContextSliceSet", contextSlices });
const snapshotMaterial = {
  workBreakdownBaseline: workBreakdownRef,
  projectOverviewBaseline: overviewRef,
  contextSliceSet: contextSliceSetRef,
  workItems: fullWorkItems,
  contextSlices,
};
const dependencySnapshot = {
  apiVersion: API,
  kind: "WorkBreakdownAnalysisSnapshot",
  snapshotId: "WDAS-SCAN-HARDENING-001",
  ...snapshotMaterial,
  workItemIds: fullWorkItems.map(({ id }) => id),
  workItemsDigest: canonicalJsonDigest(fullWorkItems),
  contentDigest: canonicalJsonDigest(snapshotMaterial),
};
const proposal = createNativeDependencyProposal(dependencySnapshot);
const mechanics = analyzeDependencyGraph({
  expectedWorkItemIds: dependencySnapshot.workItemIds,
  nodeIds: proposal.nodes,
  edges: proposal.edges,
});
assert.equal(mechanics.status, "valid");
const policyBytes = read("policies/work-dependency-analysis/policy.wasm");
const policyEvaluation = await evaluateWorkDependencyPolicy({
  bundleRef: {
    artifactId: "opa-wda-policy-wasm-0.1.0",
    schema: "https://devrelay.dev/native/opa-wasm/v1",
    mediaType: "application/wasm",
    digest: sha256Digest(policyBytes),
    uri: uri("policies/work-dependency-analysis/policy.wasm"),
  },
  bundleBytes: policyBytes,
  entrypoint: "devrelay/work_dependency/decision",
  input: mechanics,
});
assert.equal(policyEvaluation.decisionSet.allow, true);
const dependencyResult = seal({
  apiVersion: API,
  kind: "WorkDependencyAnalysisResult",
  snapshot: dependencySnapshot,
  proposal,
  mechanics,
  policyDecisionSet: policyEvaluation.decisionSet,
  currentBaseline: currentWorkDependencyRef,
}, "resultDigest");
writeJson("work-dependency-analysis.json", dependencyResult);
const dependencyRef = valueRef(
  "work-dependency-analysis.json",
  "WDA-SCAN-HARDENING-001",
  "https://devrelay.dev/evidence/work-dependency-analysis-result/v1",
  "application/vnd.devrelay.work-dependency-analysis-result+json",
  dependencyResult,
);
stage("WorkDependencyAnalysis", "analyze-dependencies", "analyzed", dependencyRef, {
  inputs: [workBreakdownRef, overviewRef, contextSliceSetRef, currentWorkDependencyRef],
  proposer: { id: "native-structured-dependency-proposer", maturity: "executable" },
  graph: mechanics.implementation,
  policy: { id: "opa-wda-policy-wasm-0.1.0", maturity: "core-owned-executable" },
  reviewer: { id: "spec-kit-consistency-reviewer", maturity: "fixture-conformant", disposition: "advisory consistency check" },
});
stage("WorkDependencyGate", "validate-dependency-dag", "approved", dependencyRef, {
  checks: { cycles: 0, missingDependencies: 0, impossibleOrdering: 0, policyDenials: 0 },
});

const capabilityIds = [...new Set(workItems.flatMap((entry) => entry["required-capabilities"]))].sort();
const specialistCatalog = {
  profiles: [{
    id: "PROFILE-CHATGPT-DESKTOP-SECURITY-RELEASE",
    capabilityIds,
    toolIds: ["TOOL-GIT", "TOOL-GITHUB", "TOOL-NODE"],
    grantIds: ["GRANT-GITHUB-REPOSITORY", "GRANT-WORKSPACE"],
  }],
};
const assignmentCapabilityCatalog = {
  capabilities: capabilityIds.map((id) => ({
    id,
    requiredToolIds: ["TOOL-GIT", "TOOL-GITHUB", "TOOL-NODE"],
    requiredGrantIds: ["GRANT-GITHUB-REPOSITORY", "GRANT-WORKSPACE"],
  })),
};
const assignmentPolicy = { profilePriorities: [{ profileId: "PROFILE-CHATGPT-DESKTOP-SECURITY-RELEASE", priority: 100 }] };
const eligibility = evaluateSpecialistEligibility({
  workItems,
  capabilityCatalog: assignmentCapabilityCatalog,
  specialistCatalog,
  assignmentPolicy,
});
const selections = rankSpecialistsDeterministically(eligibility, assignmentPolicy);
const assignmentDraft = assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: selections });
validateSpecialistAssignmentArtifact(assignmentDraft);
writeJson("specialist-assignment-draft.json", assignmentDraft);
const assignmentRef = valueRef(
  "specialist-assignment-draft.json",
  assignmentDraft.draftId,
  "https://devrelay.dev/artifacts/specialist-assignment-draft/v1",
  "application/vnd.devrelay.specialist-assignment-draft+json",
  assignmentDraft,
);
stage("SpecialistAssignment", "assign-specialists", "assigned", assignmentRef, {
  inputs: [workBreakdownRef, dependencyRef, capabilityRef, currentAssignmentsRef],
  discoveryProtocol: { id: "a2a-profile-source", maturity: "contract-defined" },
  ranker: { id: "native-specialist-ranker", maturity: "executable" },
});
stage("SpecialistAssignmentGate", "validate-assignments", "approved", assignmentRef, {
  checks: { missingCapabilities: 0, missingTools: 0, missingGrants: 0, ineligibleAssignments: 0 },
});

const traceabilityProjection = seal({
  apiVersion: API,
  kind: "ProposedTraceabilityUpdateSet",
  updateSetId: "TRACE-SCAN-HARDENING-PLANNING-001",
  authority: "trusted-contributor-proposal",
  nodes: workItems.map((entry) => ({ id: entry.id, kind: "WorkItem", authority: "candidate" })),
  edges: [
    ...workItems.flatMap((entry) => entry["acceptance-criterion-refs"].map((from) => ({ from, relationship: "planned-by", to: entry.id }))),
    ...workItems.flatMap((entry) => entry["architecture-refs"].map((from) => ({ from, relationship: "implementation-planned-by", to: entry.id }))),
    ...mechanics.edges.filter((edge) => edge.prerequisiteId.startsWith("WI-SCAN-") && edge.dependentId.startsWith("WI-SCAN-")).map((edge) => ({ from: edge.prerequisiteId, relationship: "prerequisite-for", to: edge.dependentId })),
  ].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en")),
  mergeDisposition: "deferred-until-work-breakdown-and-dependency-baseline-promotion",
}, "updateDigest");
writeJson("traceability-update-set.json", traceabilityProjection);

const checkpointBody = {
  apiVersion: API,
  kind: "LifecycleCheckpoint",
  checkpointId: "CHECKPOINT-SCAN-HARDENING-PLANNING-001",
  branch: "codex/v0.10.1-code-scanning-hardening",
  baseCommit: MAIN,
  stages,
  traceabilityUpdateSet: valueRef(
    "traceability-update-set.json",
    traceabilityProjection.updateSetId,
    "https://devrelay.dev/evidence/proposed-traceability-update-set/v1",
    "application/vnd.devrelay.proposed-traceability-update-set+json",
    traceabilityProjection,
  ),
  readyFrontier: ["WI-SCAN-EXECUTABLE-CODE", "WI-SCAN-GOVERNANCE-DISPOSITIONS", "WI-SCAN-RELEASE-PERMISSIONS"],
  nextAction: "Finish WorkExecution evidence, run WorkItemVerification, then integrate and perform SystemVerification and BusinessAcceptance.",
};
const checkpoint = seal(checkpointBody, "checkpointDigest");
writeJson("lifecycle-checkpoint.json", checkpoint);

const report = `# Lifecycle Run Report — Code-scanning hardening\n\n## Executive summary\n\nDevRelay ran every released pre-execution module against protected main commit \`${MAIN}\`. The approved requirements and ProjectOverview remain unchanged, ArchitectureDiscovery executed the mandatory offline native inventory, ArchitectureDesign recorded a bounded already-designed change, ContractGeneration was deterministically not applicable, and four traceable work items were decomposed, dependency-checked with Graphology-DAG and OPA WASM, and assigned to a provider-neutral ChatGPT Desktop security/release profile.\n\n## Stage table\n\n| # | Module | Operation | Outcome | Adapter or Core capability |\n|---:|---|---|---|---|\n${stages.map((entry) => `| ${entry.sequence} | ${entry.module} | ${entry.operation} | ${entry.outcome} | ${(entry.adapterBinding?.id ?? entry.proposer?.id ?? entry.ranker?.id ?? "Core gate")} |`).join("\n")}\n\n## Work frontier\n\n- Ready in parallel: \`WI-SCAN-EXECUTABLE-CODE\`, \`WI-SCAN-GOVERNANCE-DISPOSITIONS\`, \`WI-SCAN-RELEASE-PERMISSIONS\`.\n- Then: \`WI-SCAN-VERIFICATION\`.\n- Planned graph links: ${traceabilityProjection.edges.length}.\n- Blocking clarification requests: 0.\n\n## Next action\n\n${checkpoint.nextAction}\n`;
writeFileSync(new URL("LifecycleRunReport.md", OUTPUT), report, "utf8");

process.stdout.write(JSON.stringify({
  outcome: "planning-gates-approved",
  checkpointDigest: checkpoint.checkpointDigest,
  stages: stages.length,
  workItems: workItems.map(({ id }) => id),
  dependencyEdges: mechanics.edges.length,
  policyAllow: policyEvaluation.decisionSet.allow,
  assignmentCount: assignmentDraft.assignments.length,
  traceabilityEdges: traceabilityProjection.edges.length,
}, null, 2) + "\n");
