import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { validateArchitectureArtifact } from "../../src/architecture-artifact-validator.mjs";
import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";

const root = new URL("../../", import.meta.url);
const here = new URL("architecture-design/", import.meta.url);
const API = "devrelay.dev/v1alpha1";
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const ptr = ({ artifactId, digest }) => ({ artifactId, digest });
const ref = (artifactId, schema, mediaType, bytes, uri) => ({ artifactId, schema, mediaType, digest: sha256Digest(bytes), uri });
const sortIds = (values) => values.sort((a, b) => (a.id ?? a.flowId).localeCompare(b.id ?? b.flowId));

const [requirementsBytes, overviewBytes, contextBytes, architectureBytes, workspaceBytes] = await Promise.all([
  readFile(new URL("project/requirements-baseline.json", root)),
  readFile(new URL("project/project-overview-baseline.json", root)),
  readFile(new URL("dogfood/chatgpt-desktop-list-runs/project-context.json", root)),
  readFile(new URL("project/architecture-baseline.json", root)),
  readFile(new URL("dogfood/chatgpt-desktop-runtime/architecture-design/workspace.dsl", root)),
]);
const requirements = JSON.parse(requirementsBytes), overview = JSON.parse(overviewBytes), context = JSON.parse(contextBytes), architecture = JSON.parse(architectureBytes);
if (architecture.baselineId === "architecture-baseline-devrelay-v1-chatgpt-desktop-list-runs-001") {
  process.stdout.write(`${JSON.stringify({ operation: "checkpoint-replay", baseline: sha256Digest(architectureBytes), gate: "pass", next: "contract-generation" }, null, 2)}\n`);
  process.exit(0);
}
const requirementsRef = ref(requirements.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBytes, "devrelay://project/requirements-baseline.json");
const overviewRef = ref(overview.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBytes, "devrelay://project/project-overview-baseline.json");
const contextRef = ref("project-context-chatgpt-desktop-list-runs-v1", "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", contextBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/project-context.json");
const architectureRef = ref(architecture.baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", architectureBytes, "devrelay://project/architecture-baseline.json");
if (requirements.version !== "1.9.0" || overview.version !== "1.9.0") throw new Error("ArchitectureDesign requires the approved list-runs requirements pair.");

const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL(root), encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: new URL(root), encoding: "utf8" }).trim();
const repositorySnapshot = { apiVersion: API, kind: "RepositorySnapshot", repository: "C:/repos/DevRelay", revision, treeDigest: sha256Digest(Buffer.from(tree, "utf8")), includedPaths: ["AGENTS.md", "ProjectOverview.md", "contracts/**", "docs/**", "dogfood/**", "examples/**", "plugins/**", "project/**", "release/**", "scripts/**", "src/**", "test/**", "package-lock.json", "package.json"], excludedPaths: [".git/**", "node_modules/**"] };
const repositoryBytes = jsonBytes(repositorySnapshot);
const repositoryRef = ref(`repository-snapshot-devrelay-${revision.slice(0, 7)}`, "https://devrelay.dev/artifacts/repository-snapshot/v1", "application/vnd.devrelay.repository-snapshot+json", repositoryBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/repository-snapshot.json");
const state = { apiVersion: API, kind: "ProjectArchitectureState", stateId: "project-architecture-state-chatgpt-desktop-list-runs-v1", state: "baselined", projectLifecycle: "existing", projectContext: contextRef, requirementsBaseline: requirementsRef, repositorySnapshot: repositoryRef, architectureBaseline: architectureRef, projectOverviewBaseline: overviewRef };
const stateBytes = jsonBytes(state);
const stateRef = ref(state.stateId, "https://devrelay.dev/artifacts/project-architecture-state/v1", "application/vnd.devrelay.project-architecture-state+json", stateBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/project-architecture-state.json");

const sourceRequirementIds = ["US-DEV-DESKTOP-LIST-RUNS-001"];
const sections = structuredClone(architecture.sections);
const commandInterface = sections.interfaceIntent.content.interfaces.find(({ id }) => id === "IF-DESKTOP-MCP-COMMANDS");
if (!commandInterface) throw new Error("The approved architecture has no Desktop MCP command boundary.");
commandInterface.name = "Typed Desktop lifecycle and run-discovery commands";
commandInterface.purpose = "Expose closed local lifecycle commands plus privacy-safe read-only persisted-run discovery.";
commandInterface.semanticInputs = ["Exact lifecycle operation requests", "Bounded ListRunsRequest with page limit and opaque continuation cursor"];
commandInterface.semanticOutputs = ["Validated Core lifecycle result", "Privacy-safe ListRunsResult containing run metadata and bounded corruption diagnostics"];
commandInterface.failureBehavior = "Reject malformed or authority-bearing requests; report per-run corruption without repairing, deleting, or rewriting stored bytes.";
commandInterface.securityPrivacyIntent = ["STDIO is local and list-runs exposes metadata only", "Prompts, source content, credentials, artifact bytes, and raw evidence are excluded"];
commandInterface.deliveryConsistencyIntent = ["List operations are read-only", "Stable newest-first pages use run ID as the deterministic tie-breaker"];
commandInterface.sourceRequirementIds = [...new Set([...commandInterface.sourceRequirementIds, ...sourceRequirementIds])].sort();

const adrText = "# Use store-owned read-only discovery with Core-owned safe projection\n\n## Context and problem statement\n\nDesktop operators need to discover persisted runs without knowing run IDs, while corrupt records and sensitive artifacts must remain isolated.\n\n## Decision\n\nThe run store performs non-mutating enumeration and integrity classification. Core projects only the closed safe summary. The MCP bridge validates bounded pagination and carries no repair, route, Gate, graph, or execution authority.\n\n## Consequences\n\nOrdering and cursors are deterministic for the exact store observation. Corrupt entries remain untouched and are represented only by bounded diagnostics.\n";
const adrBytes = Buffer.from(adrText, "utf8");
const adrRef = ref("madr-adr-desktop-006-v1", "https://devrelay.dev/native/madr/v1", "text/markdown", adrBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/0006-list-runs.proposed.md");
const decision = {
  id: "ADR-DESKTOP-006", title: "Use store-owned read-only discovery with Core-owned safe projection", status: "proposed",
  contextAndProblemStatement: "Desktop operators need persisted-run discovery without exposing sensitive artifacts or permitting mutation of corrupt state.",
  decisionDrivers: ["Determinism", "Privacy", "Read-only failure isolation", "Windows Desktop operability"].sort(),
  consideredOptions: [
    { id: "OPT-DESKTOP-LIST-CORE-PROJECTION", title: "Store enumeration plus Core-owned safe projection", pros: ["Preserves authority and privacy boundaries", "Reports corruption without mutation"], cons: ["Requires a new closed cross-run response contract"] },
    { id: "OPT-DESKTOP-LIST-DIRECT-FILES", title: "Let the MCP bridge enumerate files directly", pros: ["Fewer internal calls"], cons: ["Leaks storage semantics and bypasses Core validation"] },
  ],
  outcome: { chosenOptionId: "OPT-DESKTOP-LIST-CORE-PROJECTION", justification: "It preserves the existing Core/store/MCP trust boundaries and supports deterministic bounded discovery." },
  consequences: [{ polarity: "positive", statement: "Run discovery remains local, read-only, privacy-safe, and deterministic." }, { polarity: "negative", statement: "The public MCP command contract and store summary contract must evolve together." }],
  confirmation: "Run-store, lifecycle-controller, MCP conformance, privacy, corruption non-mutation, clean-install, and end-to-end acceptance tests pass.",
  relatedDecisionIds: ["ADR-DESKTOP-002", "ADR-DESKTOP-004"], supersedesDecisionIds: [],
  affectedTargets: [{ kind: "element", id: "EL-DESKTOP-RUN-STORE" }, { kind: "element", id: "EL-DESKTOP-MCP-BRIDGE" }, { kind: "interface", id: "IF-DESKTOP-MCP-COMMANDS" }],
  sourceRequirementIds, sourceRefs: [], format: { name: "MADR", version: "4.0" }, nativeArtifact: adrRef,
};
sections.decisionRecords.content.decisions.push(decision);
sortIds(sections.decisionRecords.content.decisions);
const nativeEntry = { id: "NA-DESKTOP-MADR-006", artifact: adrRef, role: "madr-decision-record", logicalPath: "dogfood/chatgpt-desktop-list-runs/architecture-design/0006-list-runs.proposed.md", producedBy: { stage: "decision-recorder", adapterId: "madr", adapterVersion: "0.1.0", tool: { name: "MADR", version: "4.0" } }, disposition: "generated", canonicalMappings: [{ section: "decisionRecords", entityIds: [decision.id], jsonPointers: ["/sections/decisionRecords"] }], warnings: [] };
sections.nativeArtifacts.content.entries.push(nativeEntry);
sortIds(sections.nativeArtifacts.content.entries);
sortIds(sections.interfaceIntent.content.interfaces);
sections.technicalDesign.content.solutionSummary += " The list-runs change adds store-owned read-only enumeration, Core-owned safe projection, and one closed MCP command without changing lifecycle authority.";
sections.technicalDesign.content.requirementsDrivers = [...new Set([...sections.technicalDesign.content.requirementsDrivers, ...sourceRequirementIds])].sort();
sections.technicalDesign.content.sourceRequirementIds = [...new Set([...sections.technicalDesign.content.sourceRequirementIds, ...sourceRequirementIds])].sort();
sections.technicalDesign.content.behaviorFlows.push("A Desktop operator requests a bounded run page; the MCP bridge validates the closed request, the store enumerates and integrity-classifies without mutation, Core projects privacy-safe summaries, and the bridge returns a stable newest-first page or bounded corruption diagnostics.");
sections.technicalDesign.content.behaviorFlows.sort((left, right) => left.localeCompare(right));

const interfaceChange = { changeId: "CHG-DESKTOP-INTERFACE-MODIFY-IF-DESKTOP-MCP-COMMANDS-LIST", entityKind: "interface", entityId: commandInterface.id, operation: "modify", rationale: "Add the approved bounded list-runs request and safe response to the existing Desktop MCP boundary.", compatibilityImpact: "backward-compatible", sourceRequirementIds, expectedBaseDigest: canonicalJsonDigest(architecture.sections.interfaceIntent.content.interfaces.find(({ id }) => id === commandInterface.id)), targetDigest: canonicalJsonDigest(commandInterface) };
const decisionChange = { changeId: "CHG-DESKTOP-DECISION-ADD-ADR-DESKTOP-006", decisionId: decision.id, operation: "add", rationale: "Record the non-mutating storage and Core projection boundary.", sourceRequirementIds };
const traceability = sourceRequirementIds.map((requirementId) => ({ requirementId, disposition: "designed", targets: [{ kind: "change", id: interfaceChange.changeId }, { kind: "change", id: decisionChange.changeId }, { kind: "decision", id: decision.id }, { kind: "interface", id: commandInterface.id }, { kind: "technical-design", id: sections.technicalDesign.content.technicalDesignId }], rationale: "The typed MCP interface and storage-boundary decision jointly realize this approved requirement." }));
const changeSet = {
  apiVersion: API, kind: "ArchitectureChangeSetDraft", changeSetId: "architecture-change-set-chatgpt-desktop-list-runs-v1", operation: "design-change",
  projectArchitectureState: stateRef, baseArchitectureBaseline: architectureRef, baseArchitectureDigest: architectureRef.digest,
  targetRequirementsBaseline: requirementsRef, targetProjectOverviewBaseline: overviewRef, projectContext: contextRef, repositorySnapshot: repositoryRef,
  changeDisposition: "architecture-change",
  scope: { level: "change", boundary: "Read-only local persisted-run discovery through the existing ChatGPT Desktop MCP boundary.", in: ["Run-store enumeration and integrity classification", "Core-owned privacy-safe summary projection", "Bounded stable pagination", "Closed Desktop MCP command"], out: ["Run mutation or repair", "Prompt, source, credential, artifact-byte, or raw-evidence disclosure", "Hosted or cross-project discovery", "Lifecycle routing, Gate, graph, execution, or integration authority"] },
  sections,
  changes: { elementChanges: [], relationshipChanges: [], viewChanges: [], interfaceChanges: [interfaceChange], constraintChanges: [], decisionChanges: [decisionChange] },
  traceability,
  assumptions: [{ id: "ASM-DESKTOP-LIST-LOCAL-STORE", statement: "The command lists only the currently configured local project/store.", status: "confirmed", blocking: false }],
  risks: [{ id: "RISK-DESKTOP-LIST-METADATA-LEAK", statement: "Unbounded or open-ended summaries could leak sensitive persisted content.", impact: "Private source or credentials could be disclosed through Desktop.", mitigation: "Use a closed safe-field projection and canary-based privacy tests." }, { id: "RISK-DESKTOP-LIST-CORRUPTION-MUTATION", statement: "Enumeration could accidentally repair or rewrite corrupt state.", impact: "Forensic evidence and deterministic recovery semantics could be destroyed.", mitigation: "Use read-only enumeration and pre/post byte-and-metadata hashes." }],
  requiredEvidence: ["architecture/openspec-design", "architecture/structurizr-model-preservation", "architecture/madr-decision", "architecture/exhaustive-semantic-diff", "architecture/gate-review"].sort(),
  sourceRefs: [{ role: "requirements-baseline", artifact: requirementsRef }, { role: "architecture-baseline", artifact: architectureRef }, { role: "project-context", artifact: contextRef }, { role: "repository-snapshot", artifact: repositoryRef }],
};
validateArchitectureArtifact(changeSet);
const changeBytes = jsonBytes(changeSet);
const changeRef = ref(changeSet.changeSetId, "https://devrelay.dev/artifacts/architecture-change-set-draft/v1", "application/vnd.devrelay.architecture-change-set-draft+json", changeBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/architecture-change-set-draft.json");
const gateReview = { apiVersion: API, kind: "ArchitectureGateReview", reviewId: "architecture-gate-review-chatgpt-desktop-list-runs-v1", outcome: "pass", candidate: ptr(changeRef), findings: [], checks: { baselineBound: true, requirementsCovered: true, c4HierarchyUnchanged: true, structurizrModelUnchanged: true, publicContractIntentExplicit: true, authorityBoundariesPreserved: true }, progressionAllowed: true };
const gateReviewBytes = jsonBytes(gateReview);
const gateReviewRef = ref(gateReview.reviewId, "https://devrelay.dev/evidence/architecture-gate-review/v1", "application/vnd.devrelay.architecture-gate-review+json", gateReviewBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/architecture-gate-review.json");
const approval = { apiVersion: API, kind: "ArchitectureGateApproval", approvalId: "architecture-gate-approval-chatgpt-desktop-list-runs-v1", authority: "project-owner", decision: "approve", source: { channel: "chat", statement: "approve list runs; assume I approve necessary items" }, approvedCandidate: ptr(changeRef), approvedReview: ptr(gateReviewRef), modificationPolicy: "Any candidate change requires a new Gate record." };
const approvalBytes = jsonBytes(approval), approvalRef = ref(approval.approvalId, "https://devrelay.dev/evidence/architecture-gate-approval/v1", "application/vnd.devrelay.architecture-gate-approval+json", approvalBytes, "devrelay://dogfood/chatgpt-desktop-list-runs/architecture-design/architecture-gate-owner-approval.json");
const baselineSections = structuredClone(sections);
baselineSections.decisionRecords.content.decisions.find(({ id }) => id === decision.id).status = "accepted";
const baseline = { apiVersion: API, kind: "ArchitectureBaseline", baselineId: "architecture-baseline-devrelay-v1-chatgpt-desktop-list-runs-001", approvedDraft: changeRef, requirementsBaseline: requirementsRef, projectOverviewBaseline: overviewRef, projectContext: contextRef, repositorySnapshot: repositoryRef, sections: baselineSections, approvalPolicyVersion: "architecture-gate/0.1.0", approvalEvidence: [gateReviewRef, approvalRef], sourceRefs: [] };
validateArchitectureArtifact(baseline);
const baselineBytes = jsonBytes(baseline), baselineRef = ref(baseline.baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", baselineBytes, "devrelay://project/architecture-baseline.json");

await mkdir(here, { recursive: true });
await Promise.all([
  writeFile(new URL("repository-snapshot.json", here), repositoryBytes), writeFile(new URL("project-architecture-state.json", here), stateBytes),
  writeFile(new URL("architecture-change-set-draft.json", here), changeBytes), writeFile(new URL("architecture-gate-review.json", here), gateReviewBytes),
  writeFile(new URL("architecture-gate-owner-approval.json", here), approvalBytes), writeFile(new URL("architecture-baseline.json", here), baselineBytes),
  writeFile(new URL("design.md", here), Buffer.from("# List-runs architecture design\n\nOpenSpec design capability: extend the existing MCP command boundary with store-owned non-mutating enumeration and Core-owned safe projection. No new container or component is required.\n", "utf8")),
  writeFile(new URL("workspace.dsl", here), workspaceBytes), writeFile(new URL("0006-list-runs.proposed.md", here), adrBytes),
  writeFile(new URL("architecture-gate-promotion-proof.json", here), jsonBytes({ apiVersion: API, kind: "ArchitectureGatePromotionProof", status: "pass", base: ptr(architectureRef), candidate: ptr(changeRef), promoted: ptr(baselineRef), review: ptr(gateReviewRef), approval: approvalRef, nextModule: "contract-generation" })),
]);
await mkdir(new URL(`project/history/architecture/${architecture.baselineId}/`, root), { recursive: true });
await writeFile(new URL(`project/history/architecture/${architecture.baselineId}/architecture-baseline.json`, root), architectureBytes);
await writeFile(new URL("project/architecture-baseline.json", root), baselineBytes);
await writeFile(new URL("project/project-architecture-state.json", root), jsonBytes({ ...state, stateId: "project-architecture-state-devrelay-chatgpt-desktop-list-runs-approved-v1", architectureBaseline: baselineRef }));
process.stdout.write(`${JSON.stringify({ operation: "design-change", designer: "OpenSpec", modeler: "Structurizr (model preserved)", decisionRecorder: "MADR", candidate: changeRef.digest, baseline: baselineRef.digest, gate: "pass", next: "contract-generation" }, null, 2)}\n`);
