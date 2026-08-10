import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createArchitectureDesignHostExecutorRegistry } from "../../src/architecture-host-executor-adapters.mjs";
import { validateArchitectureArtifact, validateArchitectureChangeSetAgainstBaseline } from "../../src/architecture-artifact-validator.mjs";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { normativeRequirementIds } from "../../src/requirements-artifact-validator.mjs";

const root = process.cwd();
const sourceRoot = "C:/Users/garre/.codex/worktrees/1c19/DevRelay-v04-work-dependency-analysis";
const evidenceDir = path.join(sourceRoot, "dogfood/prefix-integrity-repair-dg1-2026-08-10");
const dir = path.join(root, "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation");
fs.mkdirSync(dir, { recursive: true });
const sha256 = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const read = (name) => fs.readFileSync(name);
const load = (name) => JSON.parse(read(name));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => ({ artifactId: ref.artifactId, schema: ref.schema, mediaType: ref.mediaType, digest: ref.digest, uri: ref.uri });
const ref = (artifactId, schema, mediaType, bytes, name) => ({ artifactId, schema, mediaType, digest: sha256(bytes), uri: `file:///C:/repos/DevRelay/dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/${name}` });
const write = (name, bytes) => { fs.writeFileSync(path.join(dir, name), bytes); return bytes; };
const writeJson = (name, value) => write(name, jsonBytes(value));

const manifestBytes = read(path.join(evidenceDir, "evidence-manifest.json"));
if (sha256(manifestBytes) !== "sha256:45637fb614b5fd8c6e175bedeca69802bb2aad2f87ea94e3bf7469296814f516") throw new Error("DG-1 evidence manifest drifted");
const requirementsPath = path.join(evidenceDir, "requirements-baseline.planning-evidence.json");
const overviewPath = path.join(evidenceDir, "project-overview-baseline.planning-evidence.json");
const contextPath = path.join(evidenceDir, "project-context.json");
const requirementsBytes = read(requirementsPath), overviewBytes = read(overviewPath), contextBytes = read(contextPath);
const requirements = JSON.parse(requirementsBytes), overview = JSON.parse(overviewBytes), projectContext = JSON.parse(contextBytes);
const baselinePath = path.join(sourceRoot, "project/architecture-baseline.json");
const baselineBytes = read(baselinePath), baseline = JSON.parse(baselineBytes);
const oldRequirementsPath = path.join(sourceRoot, "project/requirements-baseline.json");
const oldRequirements = load(oldRequirementsPath);
const baselineContextPath = path.join(sourceRoot, "dogfood/architecture-discovery/project-context.json");
const repositoryPath = path.join(sourceRoot, "dogfood/architecture-discovery/repository-snapshot.json");
const baselineContextBytes = read(baselineContextPath), repositoryBytes = read(repositoryPath);

const requirementsRef = ref(requirements.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBytes, "requirements-baseline.planning-evidence.json");
const overviewRef = ref(overview.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBytes, "project-overview-baseline.planning-evidence.json");
const projectContextRef = ref(projectContext.projectId + "-prefix-integrity-repair", "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", contextBytes, "project-context.json");
const repositoryRef = pointer(baseline.repositorySnapshot);
const baselineRef = ref(baseline.baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", baselineBytes, "architecture-baseline.json");
const baselineContextRef = pointer(baseline.projectContext);

const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectArchitectureState", stateId: "project-architecture-state-dg1-prefix-integrity-repair", state: "baselined", projectLifecycle: "existing", projectContext: projectContextRef, requirementsBaseline: requirementsRef, repositorySnapshot: repositoryRef, architectureBaseline: baselineRef, projectOverviewBaseline: overviewRef };
const stateBytes = jsonBytes(state), stateRef = ref(state.stateId, "https://devrelay.dev/artifacts/project-architecture-state/v1", "application/vnd.devrelay.project-architecture-state+json", stateBytes, "project-architecture-state.json");

const nativeContent = {
  designer: "# DG-1 bounded ArchitectureDesign executable chain\n\nUse exact host-executor bindings without Gate or graph authority.\n",
  modeler: "workspace \"DG-1 host-executor proof\" { model { } views { } }\n",
  madr: "# ADR-DG1-001: Use bounded host-executor ArchitectureDesign adapters\n\nStatus: proposed\n\nThe host invokes exact versioned capabilities; Core retains routing, checkpoints, validation, Gate, and traceability authority.\n",
};
const nativeRefs = {
  designer: ref("openspec-design-dg1-host-executor", "https://devrelay.dev/native/openspec-design/v1", "text/markdown", Buffer.from(nativeContent.designer), "design.md"),
  modeler: ref("structurizr-workspace-dg1-host-executor", "https://devrelay.dev/native/structurizr-workspace/v1", "text/vnd.structurizr.dsl", Buffer.from(nativeContent.modeler), "workspace.dsl"),
  madr: ref("madr-adr-dg1-001", "https://devrelay.dev/native/madr/v1", "text/markdown", Buffer.from(nativeContent.madr), "adr-dg1-001.proposed.md"),
};
const entry = (id, artifact, role, logicalPath, stage, adapterId, tool, mappings) => ({ id, artifact, role, logicalPath, producedBy: { stage, adapterId, adapterVersion: "0.1.0", tool }, disposition: "generated", canonicalMappings: mappings, warnings: [] });
const nativeEntries = {
  designer: entry("NA-DG1-OPENSPEC", nativeRefs.designer, "technical-design-source", "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/design.md", "designer", "openspec-design", { name: "OpenSpec", version: "1.0" }, [
    { section: "technicalDesign", entityIds: [baseline.sections.technicalDesign.content.technicalDesignId], jsonPointers: ["/sections/technicalDesign"] },
    { section: "interfaceIntent", entityIds: baseline.sections.interfaceIntent.content.interfaces.map(({ id }) => id), jsonPointers: ["/sections/interfaceIntent"] },
    { section: "architectureConstraints", entityIds: baseline.sections.architectureConstraints.content.constraints.map(({ id }) => id), jsonPointers: ["/sections/architectureConstraints"] },
  ]),
  modeler: entry("NA-DG1-STRUCTURIZR", nativeRefs.modeler, "structurizr-workspace", "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/workspace.dsl", "modeler", "structurizr", { name: "Structurizr DSL", version: "2026.06.28" }, [
    { section: "architectureModel", entityIds: [baseline.sections.architectureModel.content.modelId], jsonPointers: ["/sections/architectureModel"] },
    { section: "diagrams", entityIds: baseline.sections.diagrams.content.views.map(({ viewKey }) => viewKey), jsonPointers: ["/sections/diagrams"] },
  ]),
  madr: entry("NA-DG1-MADR", nativeRefs.madr, "madr-decision-record", "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/adr-dg1-001.proposed.md", "decision-recorder", "madr", { name: "MADR", version: "4.0" }, [
    { section: "decisionRecords", entityIds: ["ADR-DG1-001"], jsonPointers: ["/sections/decisionRecords"] },
  ]),
};

const targetIds = normativeRequirementIds(requirements.requirements);
const oldIds = new Set(normativeRequirementIds(oldRequirements.requirements));
const changedIds = targetIds.filter((id) => !oldIds.has(id));
const decisionSourceIds = changedIds.length ? changedIds : targetIds;
const decision = {
  id: "ADR-DG1-001", title: "Use bounded host-executor ArchitectureDesign adapters", status: "proposed",
  contextAndProblemStatement: "DG-1 cannot resume while exact released ArchitectureDesign bindings have no reusable executable host adapters.",
  decisionDrivers: ["Exact binding and provenance", "Checkpoint replay", "Core authority isolation"],
  consideredOptions: [
    { id: "OPT-DG1-HOST-EXECUTORS", title: "Bounded host capability executors", pros: ["Reusable and provider-neutral"], cons: ["Requires fixture conformance per provider"] },
    { id: "OPT-DG1-FIXTURE-WRAPPERS", title: "Wrap dogfood builders", pros: ["Small immediate change"], cons: ["Feature-specific and not reusable"] },
  ],
  outcome: { chosenOptionId: "OPT-DG1-HOST-EXECUTORS", justification: "Exact closed host capabilities preserve reusable bindings while Generic Core retains authority." },
  consequences: [{ polarity: "positive", statement: "Every effect is content-addressed and replayable." }, { polarity: "negative", statement: "Live CLI conformance remains separate evidence." }],
  confirmation: "All three new executors run once; exact Core checkpoint replay makes zero additional calls.", relatedDecisionIds: [], supersedesDecisionIds: [],
  affectedTargets: [{ kind: "constraint", id: baseline.sections.architectureConstraints.content.constraints[0].id }], sourceRequirementIds: decisionSourceIds, sourceRefs: [], format: { name: "MADR", version: "4.0" }, nativeArtifact: nativeRefs.madr,
};
const sections = structuredClone(baseline.sections);
sections.decisionRecords.content.decisionRecordSetId = "DECISIONS-DG1-PREFIX-INTEGRITY-REPAIR";
sections.decisionRecords.content.decisions.push(decision);
sections.nativeArtifacts = { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-DG1-PREFIX-INTEGRITY-REPAIR", entries: [nativeEntries.designer, nativeEntries.modeler, nativeEntries.madr] } };

const entityTarget = new Map();
for (const [section, list, kind, idKey = "id"] of [
  ["technicalDesign", [baseline.sections.technicalDesign.content], "technical-design", "technicalDesignId"],
  ["architectureModel", baseline.sections.architectureModel.content.elements, "element"],
  ["architectureModel", baseline.sections.architectureModel.content.relationships, "relationship"],
  ["diagrams", baseline.sections.diagrams.content.views, "view", "viewKey"],
  ["interfaceIntent", baseline.sections.interfaceIntent.content.interfaces, "interface"],
  ["architectureConstraints", baseline.sections.architectureConstraints.content.constraints, "constraint"],
  ["decisionRecords", baseline.sections.decisionRecords.content.decisions, "decision"],
]) for (const item of list) for (const requirementId of item.sourceRequirementIds ?? []) {
  const targets = entityTarget.get(requirementId) ?? [];
  targets.push({ kind, id: item[idKey] }); entityTarget.set(requirementId, targets);
}
for (const requirementId of targetIds) if (!entityTarget.has(requirementId) && !decisionSourceIds.includes(requirementId)) decisionSourceIds.push(requirementId);
decision.sourceRequirementIds = decisionSourceIds;
const traceability = targetIds.map((requirementId) => {
  const targets = entityTarget.get(requirementId) ?? [];
  if (decisionSourceIds.includes(requirementId)) targets.push({ kind: "decision", id: decision.id }, { kind: "change", id: "CHG-DG1-DECISION-001" });
  if (!targets.length) throw new Error(`architecture has no reciprocal target for ${requirementId}`);
  return { requirementId, disposition: "designed", targets, rationale: decisionSourceIds.includes(requirementId) ? "The bounded executable-chain decision directly addresses this DG-1 requirement." : "The target pair preserves reciprocal coverage through unchanged approved architecture entities." };
});
const emptyChanges = { elementChanges: [], relationshipChanges: [], viewChanges: [], interfaceChanges: [], constraintChanges: [], decisionChanges: [{ changeId: "CHG-DG1-DECISION-001", decisionId: decision.id, operation: "add", rationale: "Record the bounded reusable executor-chain decision without creating a primary component.", sourceRequirementIds: decisionSourceIds }] };
const candidate = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureChangeSetDraft", changeSetId: "architecture-change-set-dg1-prefix-integrity-repair", operation: "design-change", projectArchitectureState: stateRef, baseArchitectureBaseline: baselineRef, baseArchitectureDigest: baselineRef.digest, targetRequirementsBaseline: requirementsRef, projectContext: projectContextRef, repositorySnapshot: repositoryRef, changeDisposition: "architecture-change",
  scope: { level: "change", boundary: "DG-1 reusable ArchitectureDesign host-executor bootstrap inside the active LifecycleRunReport candidate.", in: ["Exact released OpenSpec Design, Structurizr, and MADR host bindings", "Closed native evidence and checkpoint replay"], out: ["PB repairs", "Gate promotion", "Traceability merge", "Live CLI conformance"] },
  sections, changes: emptyChanges, traceability, assumptions: [{ id: "ASM-DG1-PLANNING-PAIR", statement: "The verified planning evidence pair is immutable task-local input.", status: "confirmed", blocking: false }], risks: [{ id: "RISK-DG1-LIVE-CLI", statement: "Fixture conformance does not prove live upstream CLI behavior.", impact: "A host could incorrectly infer real upstream parse or export compatibility.", mitigation: "Record maturity explicitly and require separate live conformance." }],
  requiredEvidence: ["architecture/design-change-chain", "architecture/exhaustive-semantic-diff", "architecture/requirements-traceability", "architecture/adapter-authority-boundaries", "architecture/structurizr-native-conformance"], sourceRefs: [], targetProjectOverviewBaseline: overviewRef,
};
const candidateExpectedRef = ref(candidate.changeSetId, "https://devrelay.dev/artifacts/architecture-change-set-draft/v1", "application/vnd.devrelay.architecture-change-set-draft+json", jsonBytes(candidate), "architecture-change-set-draft.json");

const baseInputs = [["project-architecture-state", stateRef], ["requirements-baseline", requirementsRef], ["project-overview-baseline", overviewRef], ["project-context", projectContextRef], ["repository-snapshot", repositoryRef], ["architecture-baseline", baselineRef], ["architecture-baseline-project-context", baselineContextRef], ["architecture-baseline-repository-snapshot", repositoryRef]].map(([role, artifact]) => ({ role, artifact }));
const designer = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDesignerWorkingArtifact", workingArtifactId: "architecture-designer-working-dg1-prefix-integrity-repair", operation: "design-change", projectArchitectureState: stateRef, baseInputs, technicalDesign: sections.technicalDesign, interfaceIntent: sections.interfaceIntent, architectureConstraints: sections.architectureConstraints, nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-DG1-DESIGNER", entries: [nativeEntries.designer] } }, assumptions: candidate.assumptions, risks: candidate.risks, sourceRefs: [] };
const designerBytes = jsonBytes(designer), designerRef = ref(designer.workingArtifactId, "https://devrelay.dev/artifacts/architecture-designer-working/v1", "application/vnd.devrelay.architecture-designer-working+json", designerBytes, "architecture-designer-working.json");
const modeler = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureModelerWorkingArtifact", workingArtifactId: "architecture-modeler-working-dg1-prefix-integrity-repair", operation: "design-change", projectArchitectureState: stateRef, designerWorkingArtifact: designerRef, architectureModel: sections.architectureModel, diagrams: sections.diagrams, nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-DG1-MODELER", entries: [nativeEntries.modeler] } }, sourceRefs: [] };

validateArchitectureArtifact(designer); validateArchitectureArtifact(modeler); validateArchitectureArtifact(candidate);
validateArchitectureChangeSetAgainstBaseline({ architectureBaseline: baseline, architectureBaselineRef: baselineRef, architectureChangeSet: candidate, options: { approvedRequirementIds: new Set(targetIds) } });

const bytesById = new Map();
const register = (artifact, bytes) => bytesById.set(artifact.artifactId, Buffer.from(bytes));
register(requirementsRef, requirementsBytes); register(overviewRef, overviewBytes); register(projectContextRef, contextBytes); register(repositoryRef, repositoryBytes); register(baselineRef, baselineBytes); register(baselineContextRef, baselineContextBytes); register(stateRef, stateBytes);
register(overview.renderedDocument.artifact, read(path.join(evidenceDir, "ProjectOverview.md")));
for (const native of baseline.sections.nativeArtifacts.content.entries) if (!bytesById.has(native.artifact.artifactId)) {
  const local = path.join(sourceRoot, native.logicalPath); if (fs.existsSync(local)) register(native.artifact, read(local));
}
const persisted = new Map();
const loadArtifact = async (artifact) => { const bytes = bytesById.get(artifact.artifactId); if (!bytes) throw new Error(`missing exact artifact ${artifact.artifactId}`); return Buffer.from(bytes); };
const persistArtifact = async (record) => {
  const bytes = Buffer.from(record.bytes); if (sha256(bytes) !== record.digest) throw new Error("persist digest mismatch");
  const name = record.artifactId === designer.workingArtifactId ? "architecture-designer-working.json" : record.artifactId === modeler.workingArtifactId ? "architecture-modeler-working.json" : record.artifactId === candidate.changeSetId ? "architecture-change-set-draft.json" : record.artifactId === nativeRefs.designer.artifactId ? "design.md" : record.artifactId === nativeRefs.modeler.artifactId ? "workspace.dsl" : record.artifactId === nativeRefs.madr.artifactId ? "adr-dg1-001.proposed.md" : `${record.artifactId}.bin`;
  write(name, bytes); const artifact = { artifactId: record.artifactId, schema: record.schema, mediaType: record.mediaType, digest: record.digest, uri: `file:///C:/repos/DevRelay/dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/${name}` };
  bytesById.set(artifact.artifactId, bytes); persisted.set(artifact.artifactId, artifact); return artifact;
};
const calls = { "openspec-design": 0, structurizr: 0, madr: 0 };
const response = (request, artifact, nativeKey) => ({ apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureHostCapabilityResponse", binding: request.binding, artifact, nativeArtifacts: [{ artifactId: nativeRefs[nativeKey].artifactId, schema: nativeRefs[nativeKey].schema, mediaType: nativeRefs[nativeKey].mediaType, role: nativeEntries[nativeKey].role, path: nativeKey === "designer" ? "design.md" : nativeKey === "modeler" ? "workspace.dsl" : "adr-dg1-001.proposed.md", content: nativeContent[nativeKey], provenance: { sourceHandoffDigest: sha256(manifestBytes), invocationId: request.invocation.invocationId, stepInvocationDigest: request.invocation.stepInvocationDigest } }], executionIdentity: { executor: { id: `dg1-${nativeKey}-fixture-executor`, version: "1" }, tool: nativeEntries[nativeKey].producedBy.tool, model: { id: "bounded-dg1-fixture", version: "1" }, prompt: { digest: canonicalJsonDigest({ capability: request.binding.capability, increment: "DGI-LIFECYCLE-RUN-REPORT-2026-08-10" }) }, environment: { id: "node", version: process.version } }, conformance: { maturity: "fixture-conformant", validator: "architectureRuntimeArtifactContracts", realCliExecuted: false }, evidence: nativeKey === "madr" ? [{ kind: "architecture/chain-provenance", subject: `architecture-change-set-draft:${candidate.changeSetId}`, status: "pass", artifact: candidateExpectedRef, summary: "The three new bounded host executors ran in exact Core order." }, { kind: "architecture/contract-validation", subject: `architecture-change-set-draft:${candidate.changeSetId}`, status: "pass", artifact: candidateExpectedRef, summary: "Canonical architecture runtime contracts validated the task-local candidate." }] : [], diagnostics: [] });
const executors = {
  openspecDesign: async (request) => { calls["openspec-design"] += 1; return response(request, designer, "designer"); },
  structurizr: async (request) => { calls.structurizr += 1; return response(request, modeler, "modeler"); },
  madr: async (request) => { calls.madr += 1; return response(request, candidate, "madr"); },
};
const registry = createArchitectureDesignHostExecutorRegistry({ executors, loadArtifact, persistArtifact });
const route = await registry.selectOperation({ id: "architecture-design", version: "0.1.0" }, stateRef, { artifacts: { load: loadArtifact } });
const routeBytes = jsonBytes(route), routeRef = ref("module-route-decision-dg1-prefix-integrity-repair", "https://devrelay.dev/artifacts/module-route-decision/v1", "application/vnd.devrelay.module-route-decision+json", routeBytes, "module-route-decision.json"); register(routeRef, routeBytes);
const invocation = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleInvocation", invocationId: "architecture-design-dg1-prefix-integrity-repair", runId: "dg1-prefix-integrity-repair", nodeId: "architecture-design", module: { id: "architecture-design", version: "0.1.0", operation: "design-change" }, adapters: [
  { step: "designer", plugin: { id: "openspec-design", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "1.0", changeName: "prefix-integrity-repair-dg1", schema: "devrelay-architecture", artifact: "design.md", bridge: "agent-command", toolName: "OpenSpec" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/openspec/changes" }, { kind: "network.connect", scope: "host:implementation-engine" }] },
  { step: "modeler", plugin: { id: "structurizr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "2026.06.28", workspacePath: "dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/workspace.dsl", exportFormat: "static", toolName: "Structurizr DSL" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/architecture" }, { kind: "process.spawn", scope: "structurizr-export" }] },
  { step: "decision-recorder", plugin: { id: "madr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", templateVersion: "4.0", decisionsPath: "C:/repos/DevRelay/dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation", toolName: "MADR", toolVersion: "4.0" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation" }] },
], inputs: { "project-architecture-state": [stateRef], "routing-decision": [routeRef], "requirements-baseline": [requirementsRef], "project-overview-baseline": [overviewRef], "project-context": [projectContextRef], "repository-snapshot": [repositoryRef], "architecture-baseline": [baselineRef], "architecture-baseline-project-context": [baselineContextRef], "architecture-baseline-repository-snapshot": [repositoryRef] }, options: {} };
const checkpointsMap = new Map(), checkpoints = { async get(key) { return checkpointsMap.get(key); }, async put(key, value) { checkpointsMap.set(key, value); } };
const context = { artifacts: { load: loadArtifact }, checkpoints };
const first = await registry.execute(invocation, context);
const firstCalls = structuredClone(calls), firstBytes = jsonBytes(first), firstDigest = sha256(firstBytes), terminalRef = first.outputs["architecture-change-set-draft"][0], terminalBytes = await loadArtifact(terminalRef);
const replay = await registry.execute(invocation, context), replayBytes = jsonBytes(replay);
if (JSON.stringify(calls) !== JSON.stringify(firstCalls)) throw new Error("exact replay invoked a host executor");
if (!firstBytes.equals(replayBytes) || firstDigest !== sha256(replayBytes)) throw new Error("exact replay changed terminal result bytes");
if (checkpointsMap.size !== 3 || Object.values(firstCalls).some((count) => count !== 1)) throw new Error("first execution did not checkpoint exactly one call per executor");
writeJson("project-architecture-state.json", state); writeJson("module-route-decision.json", route); writeJson("architecture-design.invocation.json", invocation); write("architecture-design.result.json", firstBytes);
writeJson("runtime-execution-proof.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DG1ArchitectureHostExecutorProof", status: "pass", sourceHandoffDigest: sha256(manifestBytes), exactInputs: { requirementsBaseline: requirementsRef, projectOverviewBaseline: overviewRef, architectureBaseline: baselineRef }, firstExecutionCalls: firstCalls, checkpointCount: checkpointsMap.size, replayAdditionalCalls: { "openspec-design": 0, structurizr: 0, madr: 0 }, terminalResultDigest: firstDigest, terminalArtifact: terminalRef, terminalArtifactRawDigest: sha256(terminalBytes), identicalReplayBytes: true, maturity: { "openspec-design": "fixture-conformant", structurizr: "fixture-conformant", madr: "fixture-conformant", liveCliConformance: false }, authority: { gateMutation: false, traceabilityMutation: false, baselineMutation: false, completionMutation: false } });
process.stdout.write(`${JSON.stringify({ status: "pass", calls: firstCalls, checkpoints: checkpointsMap.size, replayAdditionalCalls: 0, terminalDigest: sha256(terminalBytes) })}\n`);
