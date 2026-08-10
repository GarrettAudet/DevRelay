import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJsonDigest } from "../../../src/content-digest.mjs";
import { validateArchitectureArtifact } from "../../../src/architecture-artifact-validator.mjs";
import { architectureRuntimeArtifactContracts } from "../../../src/architecture-runtime-contracts.mjs";

import { createModuleRegistry } from "../../../src/module-registry.mjs";
import { verifyStructurizrConformance } from "../../../scripts/verify-structurizr-conformance.mjs";
import { buildLifecycleRunReportArchitecture } from "./lifecycle-run-report-architecture-data.mjs";

const root = process.cwd();
const dir = path.join(root, "dogfood/lifecycle-run-report/architecture-design");
const logicalRoot = "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/architecture-design";
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const load = (relativePath) => JSON.parse(read(relativePath));
const sha256 = (bytes) =>
  `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const writeJson = (name, value) => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, name), bytes);
  return bytes;
};
const writeText = (name, value) => {
  const bytes = Buffer.from(value.replace(/\n/g, "\n"), "utf8");
  fs.writeFileSync(path.join(dir, name), bytes);
  return bytes;
};
const artifactRef = (artifactId, schema, mediaType, digest, uri) => ({
  artifactId,
  schema,
  mediaType,
  digest,
  uri,
});
const fileRef = (artifactId, schema, mediaType, name, bytes) =>
  artifactRef(artifactId, schema, mediaType, sha256(bytes), `${logicalRoot}/${name}`);

const requirements = load("project/history/1.2.0/requirements-baseline.json");
const projectOverview = load("project/history/1.2.0/project-overview-baseline.json");
const projectContext = load("dogfood/lifecycle-run-report/project-context.json");
const repositorySnapshot = load("dogfood/lifecycle-run-report/repository-snapshot.json");
const architectureBaseline = load(
  "dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json",
);

const requirementsRef = artifactRef(
  requirements.baselineId,
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
  sha256(read("project/history/1.2.0/requirements-baseline.json")),
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewRef = artifactRef(
  projectOverview.baselineId,
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
  sha256(read("project/history/1.2.0/project-overview-baseline.json")),
  "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
);
const projectContextRef = artifactRef(
  "project-context-devrelay-lifecycle-run-report-v1",
  "https://devrelay.dev/artifacts/project-context/v1",
  "application/vnd.devrelay.project-context+json",
  sha256(read("dogfood/lifecycle-run-report/project-context.json")),
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/project-context.json",
);
const repositorySnapshotRef = artifactRef(
  "repository-snapshot-devrelay-4bda7fe",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "application/vnd.devrelay.repository-snapshot+json",
  sha256(read("dogfood/lifecycle-run-report/repository-snapshot.json")),
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report/repository-snapshot.json",
);
const architectureBaselineRef = artifactRef(
  architectureBaseline.baselineId,
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
  sha256(read("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json")),
  "file:///C:/repos/DevRelay/project/architecture-baseline.json",
);
const architectureBaselineProjectContextRef = structuredClone(architectureBaseline.projectContext);
const architectureBaselineRepositorySnapshotRef = structuredClone(architectureBaseline.repositorySnapshot);

const projectArchitectureState = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectArchitectureState",
  stateId: "project-architecture-state-lifecycle-run-report-v1",
  state: "baselined",
  projectLifecycle: "existing",
  projectContext: projectContextRef,
  requirementsBaseline: requirementsRef,
  repositorySnapshot: repositorySnapshotRef,
  architectureBaseline: architectureBaselineRef,
  projectOverviewBaseline: projectOverviewRef,
};
const stateBytes = writeJson("project-architecture-state.json", projectArchitectureState);
const stateRef = fileRef(
  projectArchitectureState.stateId,
  "https://devrelay.dev/artifacts/project-architecture-state/v1",
  "application/vnd.devrelay.project-architecture-state+json",
  "project-architecture-state.json",
  stateBytes,
);
const routeDecision = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleRouteDecision",
  module: { id: "architecture-design", version: "0.1.0" },
  state: {
    artifactId: stateRef.artifactId,
    schema: stateRef.schema,
    digest: stateRef.digest,
  },
  discriminator: { path: "/state", value: "baselined" },
  reasonCode: "BASELINE_REQUIRES_CHANGE_DESIGN",
  selection: { kind: "operation", operation: "design-change" },
};
const routeBytes = writeJson("module-route-decision.json", routeDecision);
const routeRef = fileRef(
  "module-route-decision-lifecycle-run-report-architecture-v1",
  "https://devrelay.dev/artifacts/module-route-decision/v1",
  "application/vnd.devrelay.module-route-decision+json",
  "module-route-decision.json",
  routeBytes,
);

const {
  DEV,
  RUN,
  allNormativeIds,
  alreadyDesignedTargets,
  baseSections,
  model,
  scope,
  openSpecDesign,
  diagramViewSpecs,
  decisionSpecs,
  technicalDesign,
  interfaces,
  constraints,
  assumptions,
  risks,
  uniq,
} = buildLifecycleRunReportArchitecture({
  architectureBaseline,
  requirements,
});

const dslQuote = (value) => JSON.stringify(value ?? "");
const dslIdByElementId = new Map(
  model.elements.map(({ id }, index) => [id, `e${index + 1}`]),
);
const renderDslProperties = (indent, id) => [
  `${indent}properties {`,
  `${indent}  "devrelay.id" ${dslQuote(id)}`,
  `${indent}}`,
];
const renderDslElement = (entity, indent) => {
  const identifier = dslIdByElementId.get(entity.id);
  const keyword = {
    "software-system": "softwareSystem",
    container: "container",
    component: "component",
  }[entity.type];
  if (!keyword) {
    throw new Error(`unsupported Structurizr element type ${entity.type}`);
  }
  const parameters =
    entity.type === "software-system"
      ? `${dslQuote(entity.name)} ${dslQuote(entity.description)}`
      : `${dslQuote(entity.name)} ${dslQuote(entity.description)} ${dslQuote(entity.technology)}`;
  const lines = [`${indent}${identifier} = ${keyword} ${parameters} {`];
  lines.push(...renderDslProperties(`${indent}  `, entity.id));
  for (const child of model.elements.filter(
    ({ parentId }) => parentId === entity.id,
  )) {
    lines.push(...renderDslElement(child, `${indent}  `));
  }
  lines.push(`${indent}}`);
  return lines;
};
const buildStructurizrDsl = () => {
  const system = model.elements.find(
    ({ type, parentId }) => type === "software-system" && !parentId,
  );
  if (!system) {
    throw new Error("Structurizr model requires one root software system");
  }
  const lines = [
    `workspace ${dslQuote("DevRelay Lifecycle Reporting")} ${dslQuote("Run observability and ready-frontier target architecture")} {`,
    "  !identifiers flat",
    "  !impliedRelationships false",
    "  model {",
    ...renderDslElement(system, "    "),
  ];
  for (const relation of model.relationships) {
    lines.push(
      `    ${dslIdByElementId.get(relation.sourceElementId)} -> ${dslIdByElementId.get(relation.targetElementId)} ${dslQuote(relation.description)} {`,
      ...renderDslProperties("      ", relation.id),
      "    }",
    );
  }
  lines.push("  }", "  views {");
  for (const view of diagramViewSpecs) {
    const viewKeyword = view.type === "container" ? "container" : "component";
    lines.push(
      `    ${viewKeyword} ${dslIdByElementId.get(view.scopeElementId)} ${dslQuote(view.viewKey)} {`,
    );
    for (const elementId of view.elementIds) {
      lines.push(`      include ${dslIdByElementId.get(elementId)}`);
    }
    lines.push("      autoLayout lr", "    }");
  }
  lines.push("  }", "}", "");
  return lines.join("\n");
};
const structurizrDsl = buildStructurizrDsl();
const nativeBytesByName = new Map();
nativeBytesByName.set("design.md", writeText("design.md", openSpecDesign));
nativeBytesByName.set("workspace.dsl", writeText("workspace.dsl", structurizrDsl));
for (const [index, spec] of decisionSpecs.entries()) {
  const file = `${String(index + 1).padStart(4, "0")}-${spec.id.toLowerCase()}.proposed.md`;
  const text = `# ${spec.title}\n\n## Status\n\nProposed\n\n## Context and problem statement\n\nDevRelay needs human-readable run observability and repeating ready-frontier execution without transferring workflow authority to reporting, telemetry, or a mutable scheduler.\n\n## Decision drivers\n\n- Determinism\n- Human readability\n- Provider neutrality\n- Traceability\n- Privacy\n\n## Considered options\n\n- ${spec.chosen}\n- ${spec.rejected}\n\n## Decision outcome\n\nChosen: ${spec.chosen}. The selected boundary preserves canonical DevRelay authority while making operational evidence inspectable and comparable.\n\n## Consequences\n\n- Positive: arbitrary circuits remain observable without module-specific renderer branches.\n- Negative: structured contracts, content policy, and conformance evidence are required before WorkBreakdown.\n`;
  nativeBytesByName.set(file, writeText(file, text));
  spec.file = file;
  spec.nativeRef = fileRef(
    `madr-${spec.id.toLowerCase()}-v1`,
    "https://devrelay.dev/native/madr/v1",
    "text/markdown",
    file,
    nativeBytesByName.get(file),
  );
}
const designRef = fileRef(
  "openspec-design-lifecycle-run-report-v1",
  "https://devrelay.dev/native/openspec-design/v1",
  "text/markdown",
  "design.md",
  nativeBytesByName.get("design.md"),
);
const dslRef = fileRef(
  "structurizr-workspace-lifecycle-run-report-v1",
  "https://devrelay.dev/native/structurizr-workspace/v1",
  "text/vnd.structurizr.dsl",
  "workspace.dsl",
  nativeBytesByName.get("workspace.dsl"),
);

const decisions = structuredClone(
  baseSections.decisionRecords.content.decisions,
);
for (const spec of decisionSpecs) {
  decisions.push({
    id: spec.id,
    title: spec.title,
    status: "proposed",
    contextAndProblemStatement: spec.title,
    decisionDrivers: ["Determinism", "Provider neutrality", "Traceability"],
    consideredOptions: [
      { id: spec.chosen, title: "Adopt the bounded canonical design", pros: ["Preserves contracts and authority boundaries"], cons: ["Requires explicit conformance evidence"] },
      { id: spec.rejected, title: "Use the rejected coupled design", pros: ["Reduces immediate adapter work"], cons: ["Leaks implementation or mutable state into canonical semantics"] },
    ],
    outcome: { chosenOptionId: spec.chosen, justification: "The bounded design preserves deterministic DevRelay ownership while keeping implementations replaceable." },
    consequences: [
      { polarity: "positive", statement: "Canonical semantics remain deterministic and auditable." },
      { polarity: "negative", statement: "Each implementation binding requires conformance and replay evidence." },
    ],
    confirmation: "Architecture, runtime, policy, graph, replay, and gate conformance tests pass.",
    relatedDecisionIds: decisionSpecs.filter(({ id }) => id !== spec.id).map(({ id }) => id),
    supersedesDecisionIds: spec.supersedes,
    affectedTargets: spec.targets,
    sourceRequirementIds: uniq(spec.requirements),
    sourceRefs: [],
    format: { name: "MADR", version: "4.0" },
    nativeArtifact: spec.nativeRef,
  });
}

const priorViewsByKey = new Map(
  baseSections.diagrams.content.views.map((view) => [view.viewKey, view]),
);
const views = diagramViewSpecs.map((view) => ({
  ...view,
  renderings: view.viewKey.startsWith("VIEW-RUN-")
    ? [{ format: "structurizr", artifact: dslRef }]
    : structuredClone(priorViewsByKey.get(view.viewKey).renderings),
}));
const diagrams = {
  diagramSetId: "DIAGRAMS-DEVRELAY-RUN-003",
  architectureModelId: model.modelId,
  architectureModelDigest: canonicalJsonDigest(model),
  views,
};

const nativeEntry = (id, artifact, role, logicalPath, stage, adapterId, toolName, mappings) => ({
  id,
  artifact,
  role,
  logicalPath: `dogfood/lifecycle-run-report/architecture-design/${logicalPath}`,
  producedBy: {
    stage,
    adapterId,
    adapterVersion: "0.1.0",
    tool: {
      name: toolName,
      version:
        toolName === "MADR"
          ? "4.0"
          : toolName === "Structurizr DSL" ? "2026.06.28" : "1.0",
    },
  },
  disposition: "generated",
  canonicalMappings: mappings,
  warnings: [],
});
const nativeEntries = [
  nativeEntry("NA-RUN-OPENSPEC-DESIGN", designRef, "technical-design-source", "design.md", "designer", "openspec-design", "OpenSpec", [
    { section: "technicalDesign", entityIds: [technicalDesign.technicalDesignId], jsonPointers: ["/sections/technicalDesign"] },
    { section: "interfaceIntent", entityIds: interfaces.filter(({ id }) => id.startsWith("IF-RUN-")).map(({ id }) => id), jsonPointers: ["/sections/interfaceIntent"] },
    { section: "architectureConstraints", entityIds: constraints.filter(({ id }) => id.startsWith("CON-RUN-")).map(({ id }) => id), jsonPointers: ["/sections/architectureConstraints"] },
  ]),
  nativeEntry("NA-RUN-STRUCTURIZR", dslRef, "structurizr-workspace", "workspace.dsl", "modeler", "structurizr", "Structurizr DSL", [
    { section: "architectureModel", entityIds: [model.modelId], jsonPointers: ["/sections/architectureModel"] },
    { section: "diagrams", entityIds: views.map(({ viewKey }) => viewKey), jsonPointers: ["/sections/diagrams"] },
  ]),
  ...decisionSpecs.map((spec, index) => nativeEntry(
    `NA-RUN-MADR-${String(index + 1).padStart(3, "0")}`,
    spec.nativeRef,
    "madr-decision-record",
    spec.file,
    "decision-recorder",
    "madr",
    "MADR",
    [{ section: "decisionRecords", entityIds: [spec.id], jsonPointers: ["/sections/decisionRecords"] }],
  )),
];
const sections = {
  technicalDesign: { mode: "embedded", content: technicalDesign },
  architectureModel: { mode: "embedded", content: model },
  diagrams: { mode: "embedded", content: diagrams },
  interfaceIntent: { mode: "embedded", content: { interfaceIntentSetId: "INTERFACES-DEVRELAY-RUN-001", interfaces } },
  architectureConstraints: { mode: "embedded", content: { constraintSetId: "CONSTRAINTS-DEVRELAY-RUN-001", constraints } },
  decisionRecords: { mode: "embedded", content: { decisionRecordSetId: "DECISIONS-DEVRELAY-RUN-001", decisions } },
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-DEVRELAY-RUN-001", entries: nativeEntries } },
};

const entityCollections = [
  ["elementChanges", "element", baseSections.architectureModel.content.elements, model.elements, (value) => value.id],
  ["relationshipChanges", "relationship", baseSections.architectureModel.content.relationships, model.relationships, (value) => value.id],
  ["viewChanges", "view", baseSections.diagrams.content.views, diagrams.views, (value) => value.viewKey],
  ["interfaceChanges", "interface", baseSections.interfaceIntent.content.interfaces, interfaces, (value) => value.id],
  ["constraintChanges", "constraint", baseSections.architectureConstraints.content.constraints, constraints, (value) => value.id],
];
const changes = {
  elementChanges: [],
  relationshipChanges: [],
  viewChanges: [],
  interfaceChanges: [],
  constraintChanges: [],
  decisionChanges: [],
};
for (const [collection, kind, beforeValues, afterValues, idOf] of entityCollections) {
  const before = new Map(beforeValues.map((value) => [idOf(value), value]));
  const after = new Map(afterValues.map((value) => [idOf(value), value]));
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(id);
    const target = after.get(id);
    const operation = !previous ? "add" : !target ? "remove" : canonicalJsonDigest(previous) !== canonicalJsonDigest(target) ? "modify" : undefined;
    if (!operation) continue;
    const change = {
      changeId: `CHG-RUN-${kind.toUpperCase()}-${id}`,
      entityKind: kind,
      entityId: id,
      operation,
      rationale: operation === "add"
        ? `Add the ${kind} required by lifecycle run reporting.`
        : operation === "remove"
          ? `Remove the obsolete ${kind} to restore faithful C4 materialization.`
          : `Modify the ${kind} for the lifecycle run reporting target architecture.`,
      compatibilityImpact: "backward-compatible",
      sourceRequirementIds: uniq(
        operation === "remove"
          ? [RUN.inspect, RUN.deterministic]
          : kind === "view"
            ? [RUN.inspect, RUN.deterministic]
            : target?.sourceRequirementIds ?? [],
      ),
    };
    if (previous) change.expectedBaseDigest = canonicalJsonDigest(previous);
    if (target) change.targetDigest = canonicalJsonDigest(target);
    changes[collection].push(change);
  }
}
for (const id of decisionSpecs.map(({ id }) => id)) {
  const decision = decisions.find((item) => item.id === id);
  changes.decisionChanges.push({
    changeId: `CHG-RUN-DECISION-ADD-${id}`,
    decisionId: id,
    operation: "add",
    rationale: "Record the lifecycle run reporting architecture choice as a proposed MADR.",
    sourceRequirementIds: uniq(decision.sourceRequirementIds),
  });
}

const citations = new Map(allNormativeIds.map((id) => [id, new Map()]));
const cite = (kind, id, requirementIds) => {
  for (const requirementId of requirementIds ?? []) {
    const targets = citations.get(requirementId);
    if (!targets) continue;
    targets.set(`${kind}:${id}`, { kind, id });
  }
};
cite("technical-design", technicalDesign.technicalDesignId, technicalDesign.sourceRequirementIds);
for (const item of model.elements) cite("element", item.id, item.sourceRequirementIds);
for (const item of model.relationships) cite("relationship", item.id, item.sourceRequirementIds);
for (const item of interfaces) cite("interface", item.id, item.sourceRequirementIds);
for (const item of constraints) cite("constraint", item.id, item.sourceRequirementIds);
for (const item of decisions) cite("decision", item.id, item.sourceRequirementIds);
for (const collection of Object.values(changes)) {
  for (const item of collection) cite("change", item.changeId, item.sourceRequirementIds);
}
const traceability = allNormativeIds.map((requirementId) => {
  const designedTargets = [...citations.get(requirementId).values()].sort(
    (left, right) =>
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
  if (designedTargets.length > 0) {
    return {
      requirementId,
      disposition: "designed",
      targets: designedTargets,
      rationale:
        "The listed target entities and exhaustive typed changes reciprocally cite this approved requirement.",
    };
  }
  const baselineTargets = alreadyDesignedTargets.get(requirementId);
  if (!baselineTargets) {
    throw new Error(`normative requirement ${requirementId} lacks architecture coverage`);
  }
  return {
    requirementId,
    disposition: "already-designed",
    targets: baselineTargets,
    rationale:
      "The approved baseline already satisfies this requirement through the unchanged referenced entity; no citation rewrite is required.",
  };
});

const changeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureChangeSetDraft",
  changeSetId: "architecture-change-set-lifecycle-run-report-v1",
  operation: "design-change",
  projectArchitectureState: stateRef,
  baseArchitectureBaseline: architectureBaselineRef,
  baseArchitectureDigest: architectureBaselineRef.digest,
  targetRequirementsBaseline: requirementsRef,
  projectContext: projectContextRef,
  repositorySnapshot: repositorySnapshotRef,
  changeDisposition: "architecture-change",
  scope,
  sections,
  changes,
  traceability,
  assumptions,
  risks,
  requiredEvidence: [
    "architecture/design-change-chain",
    "architecture/exhaustive-semantic-diff",
    "architecture/requirements-traceability",
    "architecture/adapter-authority-boundaries",
    "architecture/structurizr-native-conformance",
    "architecture/gate-review",
  ],
  sourceRefs: [],
  targetProjectOverviewBaseline: projectOverviewRef,
};
validateArchitectureArtifact(changeSet);

const baseInputs = [
  ["project-architecture-state", stateRef],
  ["requirements-baseline", requirementsRef],
  ["project-overview-baseline", projectOverviewRef],
  ["project-context", projectContextRef],
  ["repository-snapshot", repositorySnapshotRef],
  ["architecture-baseline", architectureBaselineRef],
  ["architecture-baseline-project-context", architectureBaselineProjectContextRef],
  ["architecture-baseline-repository-snapshot", architectureBaselineRepositorySnapshotRef],
].map(([role, artifact]) => ({ role, artifact }));
const designerWorking = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureDesignerWorkingArtifact",
  workingArtifactId: "architecture-designer-working-lifecycle-run-report-v1",
  operation: "design-change",
  projectArchitectureState: stateRef,
  baseInputs,
  technicalDesign: sections.technicalDesign,
  interfaceIntent: sections.interfaceIntent,
  architectureConstraints: sections.architectureConstraints,
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-RUN-DESIGNER-001", entries: [nativeEntries[0]] } },
  assumptions,
  risks,
  sourceRefs: [],
};
const designerBytes = writeJson("architecture-designer-working.json", designerWorking);
const designerRef = fileRef(designerWorking.workingArtifactId, "https://devrelay.dev/artifacts/architecture-designer-working/v1", "application/vnd.devrelay.architecture-designer-working+json", "architecture-designer-working.json", designerBytes);
const modelerWorking = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureModelerWorkingArtifact",
  workingArtifactId: "architecture-modeler-working-lifecycle-run-report-v1",
  operation: "design-change",
  projectArchitectureState: stateRef,
  designerWorkingArtifact: designerRef,
  architectureModel: sections.architectureModel,
  diagrams: sections.diagrams,
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-RUN-MODELER-001", entries: [nativeEntries[1]] } },
  sourceRefs: [],
};
const modelerBytes = writeJson("architecture-modeler-working.json", modelerWorking);
const modelerRef = fileRef(modelerWorking.workingArtifactId, "https://devrelay.dev/artifacts/architecture-modeler-working/v1", "application/vnd.devrelay.architecture-modeler-working+json", "architecture-modeler-working.json", modelerBytes);
const changeSetBytes = writeJson("architecture-change-set-draft.json", changeSet);
const changeSetRef = fileRef(changeSet.changeSetId, "https://devrelay.dev/artifacts/architecture-change-set-draft/v1", "application/vnd.devrelay.architecture-change-set-draft+json", "architecture-change-set-draft.json", changeSetBytes);

const conformanceProof = await verifyStructurizrConformance({
  rootPath: root,
  workspacePath:
    "dogfood/lifecycle-run-report/architecture-design/workspace.dsl",
  candidatePath:
    "dogfood/lifecycle-run-report/architecture-design/architecture-change-set-draft.json",
  outputDirectory:
    ".devrelay/conformance/lifecycle-run-report",
});
const conformanceBytes = writeJson(
  "structurizr-conformance-proof.json",
  conformanceProof,
);
const conformanceRef = fileRef(
  "structurizr-conformance-proof-lifecycle-run-report-v1",
  "https://devrelay.dev/evidence/structurizr-conformance-proof/v1",
  "application/vnd.devrelay.structurizr-conformance-proof+json",
  "structurizr-conformance-proof.json",
  conformanceBytes,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "architecture-design-change-lifecycle-run-report-v1",
  runId: "lifecycle-run-report-architecture-run-v1",
  nodeId: "architecture-design",
  module: { id: "architecture-design", version: "0.1.0", operation: "design-change" },
  adapters: [
    { step: "designer", plugin: { id: "openspec-design", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "1.0", changeName: "lifecycle-run-report", schema: "devrelay-architecture", artifact: "design.md", bridge: "agent-command", toolName: "OpenSpec" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/openspec/changes" }, { kind: "network.connect", scope: "host:implementation-engine" }] },
    { step: "modeler", plugin: { id: "structurizr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "2026.06.28", workspacePath: "dogfood/lifecycle-run-report/architecture-design/workspace.dsl", exportFormat: "static", toolName: "Structurizr DSL" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/architecture" }, { kind: "process.spawn", scope: "structurizr-export" }] },
    { step: "decision-recorder", plugin: { id: "madr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", templateVersion: "4.0", decisionsPath: "C:/repos/DevRelay/dogfood/lifecycle-run-report/architecture-design", toolName: "MADR", toolVersion: "4.0" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/dogfood/lifecycle-run-report/architecture-design" }] },
  ],
  inputs: {
    "project-architecture-state": [stateRef],
    "routing-decision": [routeRef],
    "requirements-baseline": [requirementsRef],
    "project-overview-baseline": [projectOverviewRef],
    "project-context": [projectContextRef],
    "repository-snapshot": [repositorySnapshotRef],
    "architecture-baseline": [architectureBaselineRef],
    "architecture-baseline-project-context": [architectureBaselineProjectContextRef],
    "architecture-baseline-repository-snapshot": [architectureBaselineRepositorySnapshotRef],
  },
  options: {},
};
const invocationBytes = writeJson("architecture-design.invocation.json", invocation);
const moduleResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: invocation.invocationId,
  status: "completed",
  outcome: "change_set_drafted",
  outputs: { "architecture-change-set-draft": [changeSetRef] },
  evidence: [
    { kind: "architecture/chain-provenance", subject: `architecture-change-set-draft:${changeSet.changeSetId}`, status: "pass", artifact: changeSetRef, summary: "The configured OpenSpec design, Structurizr, and MADR bindings ran in exact order through bounded deterministic fixtures; no upstream CLI was invoked." },
    { kind: "architecture/contract-validation", subject: `architecture-change-set-draft:${changeSet.changeSetId}`, status: "pass", artifact: changeSetRef, summary: "The candidate passed released state, artifact, exhaustive-diff, lineage, and handoff validation." },
    { kind: "architecture/structurizr-native-conformance", subject: `architecture-change-set-draft:${changeSet.changeSetId}`, status: "pass", artifact: conformanceRef, summary: "Official Structurizr parse and JSON export normalize exactly to the canonical elements, relationships, hierarchy, and three views." },
  ],
  diagnostics: [],
};
const resultBytes = writeJson("architecture-design.result.json", moduleResult);

const bytesById = new Map();
const register = (ref, bytes) => bytesById.set(ref.artifactId, Buffer.from(bytes));
register(stateRef, stateBytes);
register(routeRef, routeBytes);
register(requirementsRef, read("project/history/1.2.0/requirements-baseline.json"));
register(projectOverviewRef, read("project/history/1.2.0/project-overview-baseline.json"));
register(projectOverview.renderedDocument.artifact, read("project/history/1.2.0/ProjectOverview.md"));
register(projectContextRef, read("dogfood/lifecycle-run-report/project-context.json"));
register(repositorySnapshotRef, read("dogfood/lifecycle-run-report/repository-snapshot.json"));
register(architectureBaselineRef, read("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json"));
register(architectureBaselineProjectContextRef, read("dogfood/work-dependency-analysis/project-context.json"));
register(architectureBaselineRepositorySnapshotRef, read("dogfood/work-dependency-analysis/repository-snapshot.json"));
for (const entry of architectureBaseline.sections.nativeArtifacts.content.entries) {
  register(entry.artifact, read(entry.logicalPath));
}
register(designerRef, designerBytes);
register(modelerRef, modelerBytes);
register(changeSetRef, changeSetBytes);
register(conformanceRef, conformanceBytes);
register(designRef, nativeBytesByName.get("design.md"));
register(dslRef, nativeBytesByName.get("workspace.dsl"));
for (const spec of decisionSpecs) register(spec.nativeRef, nativeBytesByName.get(spec.file));
const artifacts = {
  async load(ref) {
    const bytes = bytesById.get(ref.artifactId);
    if (!bytes) throw new Error(`missing registered artifact ${ref.artifactId}`);
    return Buffer.from(bytes);
  },
};
const checkpointValues = new Map();
const checkpoints = {
  async get(key) { return checkpointValues.get(key); },
  async put(key, value) { checkpointValues.set(key, value); },
};
const continueResult = (step, outputs) => ({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleStepResult",
  invocationId: step.invocationId,
  invocationFingerprint: step.invocationFingerprint,
  chainFingerprint: step.chainFingerprint,
  stepInvocationDigest: step.stepInvocationDigest,
  step: step.step,
  plugin: structuredClone(step.plugin),
  disposition: "continue",
  outputs,
  evidence: [],
  diagnostics: [],
});
const terminalResult = (step, result) => ({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleStepResult",
  invocationId: step.invocationId,
  invocationFingerprint: step.invocationFingerprint,
  chainFingerprint: step.chainFingerprint,
  stepInvocationDigest: step.stepInvocationDigest,
  step: step.step,
  plugin: structuredClone(step.plugin),
  disposition: "terminal",
  moduleResult: result,
});
const calls = [];
const pluginDefinitions = ["openspec-design", "structurizr", "madr"].map((id) => load(`examples/plugins/${id}.plugin.json`));
const registry = createModuleRegistry({
  modules: [load("examples/modules/architecture-design.module.json")],
  plugins: pluginDefinitions.map((definition) => ({
    definition,
    adapter: {
      async invoke(step) {
        calls.push(definition.metadata.id);
        if (step.step === "designer") return continueResult(step, { "architecture-designer-working": [designerRef] });
        if (step.step === "modeler") return continueResult(step, { "architecture-modeler-working": [modelerRef] });
        const terminal = structuredClone(moduleResult);
        terminal.invocationId = step.invocationId;
        return terminalResult(step, terminal);
      },
    },
  })),
  artifactContracts: architectureRuntimeArtifactContracts(),
});
const actual = await registry.execute(invocation, { artifacts, checkpoints });
const callsBeforeReplay = calls.length;
const replay = await registry.execute(invocation, { artifacts, checkpoints });
if (calls.length !== callsBeforeReplay) throw new Error("checkpoint replay reinvoked an adapter");
if (checkpointValues.size !== 3) throw new Error("ArchitectureDesign did not persist exactly three effect checkpoints");
if (JSON.stringify(actual) !== JSON.stringify(replay)) throw new Error("ArchitectureDesign replay result changed");
const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureDogfoodExecutionProof",
  status: "pass",
  operation: "design-change",
  routeReasonCode: routeDecision.reasonCode,
  adapterCalls: calls,
  checkpointCount: checkpointValues.size,
  replayAdapterCalls: 0,
  outcome: actual.outcome,
  invocationDigest: sha256(invocationBytes),
  resultDigest: sha256(resultBytes),
  architectureChangeSetDigest: changeSetRef.digest,
};
const proofBytes = writeJson("runtime-execution-proof.json", proof);
const gateBindings = [
  ["RequirementsBaseline", requirementsRef.digest],
  ["ProjectOverviewBaseline", projectOverviewRef.digest],
  ["ProjectContext", projectContextRef.digest],
  ["RepositorySnapshot", repositorySnapshotRef.digest],
  ["ArchitectureBaseline", architectureBaselineRef.digest],
  ["ProjectArchitectureState", stateRef.digest],
  ["ModuleRouteDecision", routeRef.digest],
  ["DesignerWorkingArtifact", designerRef.digest],
  ["ModelerWorkingArtifact", modelerRef.digest],
  ["ArchitectureChangeSetDraft", changeSetRef.digest],
  ["Native OpenSpec design", designRef.digest],
  ["Native Structurizr workspace", dslRef.digest],
  ["StructurizrConformanceProof", conformanceRef.digest],
  ...decisionSpecs.map((spec) => [`Native ${spec.id}`, spec.nativeRef.digest]),
  ["ModuleInvocation", sha256(invocationBytes)],
  ["ModuleResult", sha256(resultBytes)],
  ["RuntimeExecutionProof", sha256(proofBytes)],
];
const gateReview = [
  "# Architecture Gate candidate: lifecycle run reporting 0.1.0",
  "",
  "Status: **awaiting owner approval**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Deterministic route and chain",
  "",
  "- Project state is `baselined`; Core selected `design-change` with `BASELINE_REQUIRES_CHANGE_DESIGN`.",
  "- Configured chain executed as OpenSpec design -> Structurizr -> MADR with three checkpoints and zero adapter calls on replay.",
  "- OpenSpec and MADR effects remain bounded deterministic adapter fixtures; the official Structurizr 2026.06.28 binary separately parsed and exported the workspace for canonical comparison.",
  "",
  "## Gate findings",
  "",
  `- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to ${model.elements.length} elements, ${model.relationships.length} relationships, the hierarchy, and ${views.length} declared views.`,
  "- PASS: RunLedger records canonical workflow facts append-only; LifecycleRunReport projects arbitrary circuit history without controlling progression.",
  "- PASS: host observations remain non-authoritative and require explicit measured, estimated, unavailable, or not-applicable dispositions.",
  "- PASS: report bytes are deterministic for the same ledger checkpoint, configuration, and rendering version; snapshots declare comparability and maturity explicitly.",
  "- PASS: Core records integrated completion facts and derives ready frontiers from the approved static WorkDependency DAG plus current completion state.",
  "- PASS: all eight new structured interfaces require ContractGeneration JSON Schemas before WorkBreakdown progression.",
  "- PASS: reporting remains cross-cutting and cannot route, approve, mutate TraceabilityGraph, execute work, or become a lifecycle stage.",
  "- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.",
  "- PASS: reporting and frontier traceability are forward-only; inverse traversal remains derived by TraceabilityGraph.",
  "",
  "## Approval boundary",
  "",
  "Approval must bind this exact ArchitectureChangeSetDraft and all exact input and native-artifact digests above. Any modification requires a new Architecture Gate candidate.",
  "",
].join("\n");
const gateBytes = writeText("architecture-gate-candidate.md", gateReview);
writeJson("architecture-gate-candidate.json", {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureGateCandidate",
  status: "awaiting-approval",
  candidate: changeSetRef,
  exactBindings: Object.fromEntries(gateBindings.map(([label, digest]) => [label, digest])),
  reviewDigest: sha256(gateBytes),
  progressionAllowed: false,
});
if (process.argv.includes("--promote")) {
  const { promoteLifecycleRunReportArchitecture } = await import("./promote.mjs");
  const promotion = await promoteLifecycleRunReportArchitecture({
    root,
    dir,
    read,
    fileRef,
    artifactRef,
    sha256,
    writeJson,
    registry,
    invocation,
    artifacts,
    checkpoints,
    calls,
    callsBeforeReplay,
    checkpointValues,
    changeSet,
    changeSetRef,
    requirementsRef,
    projectOverviewRef,
    projectContextRef,
    repositorySnapshotRef,
    architectureBaselineRef,
    conformanceRef,
    conformanceBytes,
    proofBytes,
    gateBytes,
  });
  console.log(JSON.stringify(promotion, null, 2));
} else {
  console.log(JSON.stringify({
    status: "ARCHITECTURE_GATE_CANDIDATE",
    operation: "design-change",
    routeReasonCode: routeDecision.reasonCode,
    adapters: calls,
    checkpointCount: checkpointValues.size,
    replayAdapterCalls: 0,
    architectureChangeSetDigest: changeSetRef.digest,
    architectureGateReviewDigest: sha256(gateBytes),
    structurizrConformanceProofDigest: conformanceRef.digest,
    progressionAllowed: false,
  }, null, 2));
}