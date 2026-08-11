import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJsonDigest } from "../../../src/content-digest.mjs";
import { validateArchitectureArtifact } from "../../../src/architecture-artifact-validator.mjs";
import { architectureRuntimeArtifactContracts } from "../../../src/architecture-runtime-contracts.mjs";
import { validateArchitectureGatePromotion } from "../../../src/architecture-gate.mjs";
import { createModuleRegistry } from "../../../src/module-registry.mjs";
import { verifyStructurizrConformance } from "../../../scripts/verify-structurizr-conformance.mjs";

const root = process.cwd();
const dir = path.join(root, "dogfood/work-dependency-analysis/architecture-design");
const logicalRoot = "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis/architecture-design";
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

const requirements = load("project/history/1.1.0/requirements-baseline.json");
const projectOverview = load("project/history/1.1.0/project-overview-baseline.json");
const projectContext = load("dogfood/work-dependency-analysis/project-context.json");
const repositorySnapshot = load("dogfood/work-dependency-analysis/repository-snapshot.json");
const architectureBaseline = load(
  "dogfood/work-breakdown/architecture-design/architecture-baseline.json",
);

const requirementsRef = artifactRef(
  requirements.baselineId,
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
  sha256(read("project/history/1.1.0/requirements-baseline.json")),
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewRef = artifactRef(
  projectOverview.baselineId,
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
  sha256(read("project/history/1.1.0/project-overview-baseline.json")),
  "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
);
const projectContextRef = artifactRef(
  "project-context-devrelay-work-dependency-analysis-v1",
  "https://devrelay.dev/artifacts/project-context/v1",
  "application/vnd.devrelay.project-context+json",
  sha256(read("dogfood/work-dependency-analysis/project-context.json")),
  "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis/project-context.json",
);
const repositorySnapshotRef = artifactRef(
  "repository-snapshot-devrelay-9cb4f2b",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "application/vnd.devrelay.repository-snapshot+json",
  sha256(read("dogfood/work-dependency-analysis/repository-snapshot.json")),
  "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis/repository-snapshot.json",
);
const architectureBaselineRef = artifactRef(
  architectureBaseline.baselineId,
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
  sha256(read("dogfood/work-breakdown/architecture-design/architecture-baseline.json")),
  "file:///C:/repos/DevRelay/dogfood/work-breakdown/architecture-design/architecture-baseline.json",
);
const architectureBaselineProjectContextRef = structuredClone(architectureBaseline.projectContext);
const architectureBaselineRepositorySnapshotRef = structuredClone(architectureBaseline.repositorySnapshot);

const projectArchitectureState = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectArchitectureState",
  stateId: "project-architecture-state-work-dependency-analysis-v1",
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
  "module-route-decision-work-dependency-analysis-architecture-v1",
  "https://devrelay.dev/artifacts/module-route-decision/v1",
  "application/vnd.devrelay.module-route-decision+json",
  "module-route-decision.json",
  routeBytes,
);

const DEV = {
  extend: "US-DEV-EXTEND-001",
  orchestrate: "US-DEV-ORCHESTRATE-001",
  specify: "US-DEV-SPECIFY-001",
  verify: "US-DEV-VERIFY-001",
  deterministic: "NFR-DEV-DETERMINISM-001",
  portable: "NFR-DEV-PORTABILITY-001",
  traceable: "NFR-DEV-TRACEABILITY-001",
  artifacts: "CON-DEV-ARTIFACT-CONTRACTS-001",
  gates: "CON-DEV-GATE-SEPARATION-001",
  inventory: "CON-DEV-MODULE-INVENTORY-001",
  neutral: "CON-DEV-PROVIDER-NEUTRAL-001",
};
const WDA = {
  analyze: "US-WDA-ANALYZE-001",
  parallel: "US-WDA-PARALLEL-001",
  plugins: "US-WDA-PLUGINS-001",
  verify: "US-WDA-VERIFY-001",
  deterministic: "NFR-WDA-DETERMINISM-001",
  noExecution: "CON-WDA-NO-EXECUTION-001",
  neutral: "CON-WDA-PROVIDER-NEUTRAL-001",
  traceDirection: "CON-WDA-TRACE-DIRECTION-001",
};
const allNormativeIds = [
  ...requirements.requirements.userStories.map(({ id }) => id),
  ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
  ...requirements.requirements.constraints.map(({ id }) => id),
];
const uniq = (...values) => [...new Set(values.flat())];

const baseSections = architectureBaseline.sections;
const model = structuredClone(baseSections.architectureModel.content);
model.modelId = "MODEL-DEVRELAY-WDA-002";
model.elements = model.elements.filter(
  ({ id }) => id !== "EL-DEVRELAY-MODULES",
);

const architectureElement = ({
  id,
  name,
  type,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags,
}) => ({
  id,
  name,
  type,
  parentId,
  description,
  technology: "Provider-neutral DevRelay contract",
  responsibilities,
  tags,
  properties: {},
  sourceRequirementIds: uniq(sourceRequirementIds),
  sourceRefs: [],
});
const component = (
  id,
  name,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
) =>
  architectureElement({
    id,
    name,
    type: "component",
    parentId,
    description,
    responsibilities,
    sourceRequirementIds,
    tags: ["Component", "WorkDependencyAnalysis"],
  });
model.elements.push(
  architectureElement({
    id: "EL-WDA-MODULE",
    name: "WorkDependencyAnalysis",
    type: "container",
    parentId: "EL-DEVRELAY-SYSTEM",
    description:
      "Coordinates one complete static dependency-analysis candidate without assigning or executing work.",
    responsibilities: [
      "Normalize dependency proposals",
      "Coordinate bounded reviewer and Core-owned verification capabilities",
    ],
    sourceRequirementIds: Object.values(WDA),
    tags: ["Container", "LifecycleModule", "WorkDependencyAnalysis"],
  }),
  component(
    "EL-WDA-SNAPSHOT",
    "Snapshot Builder",
    "EL-DEVRELAY-CORE",
    "Builds one immutable full WorkBreakdown snapshot and verifies declared context slices.",
    ["Bind the exact WorkBreakdownBaseline", "Verify source and extracted-content digests"],
    [WDA.analyze, WDA.deterministic, DEV.artifacts],
  ),
  component(
    "EL-WDA-GRAPH-MECHANICS",
    "Graph Mechanics",
    "EL-DEVRELAY-CORE",
    "Owns canonical DAG mechanics while using pinned Graphology and Graphology-DAG internally.",
    ["Reject invalid endpoints, duplicates, self-dependencies, and cycles", "Emit canonical diagnostics"],
    [WDA.verify, WDA.deterministic, WDA.neutral],
  ),
  component(
    "EL-WDA-OPA",
    "OPA Policy Evaluator",
    "EL-DEVRELAY-CORE",
    "Evaluates a pinned policy bundle over one canonical JSON input and normalizes the decision set.",
    ["Bind bundle, entrypoint, input, engine, and raw result evidence", "Return policy decisions without promotion authority"],
    [WDA.verify, WDA.deterministic, WDA.neutral],
  ),
  component(
    "EL-WDA-GATE",
    "WorkDependency Gate",
    "EL-DEVRELAY-CORE",
    "Owns semantic completeness review, exact approval, and dependency-baseline promotion.",
    ["Reject unresolved missing dependencies and impossible ordering", "Promote only the exact candidate"],
    [WDA.verify, WDA.parallel, DEV.gates, DEV.verify],
  ),
  component(
    "EL-WDA-CONTRIBUTOR",
    "Traceability Contributor",
    "EL-DEVRELAY-CORE",
    "Derives forward candidate dependency relationships after candidate validation.",
    ["Emit only approved relationship vocabulary", "Checkpoint updates before atomic graph merge"],
    [WDA.parallel, WDA.traceDirection, DEV.traceable],
  ),
  component(
    "EL-WDA-PROPOSER-PORT",
    "Dependency Proposal Port",
    "EL-WDA-MODULE",
    "Admits the native structured proposer or an optional configured proposal adapter through one contract.",
    ["Expose only DependencyProposal semantics", "Prevent adapter authority leakage"],
    [WDA.analyze, WDA.plugins, WDA.neutral],
  ),
  component(
    "EL-WDA-NATIVE-PROPOSER",
    "Native Structured Proposer",
    "EL-WDA-MODULE",
    "Default provider-neutral proposer over the complete snapshot and declared context slices.",
    ["Propose dependency edges", "Disposition every dependency hint"],
    [WDA.analyze, WDA.plugins, WDA.deterministic],
  ),
  component(
    "EL-WDA-OPTIONAL-PROPOSERS",
    "Optional Adapter Bridge",
    "EL-WDA-MODULE",
    "Task Master and OpenSpec bindings that may propose only the canonical DependencyProposal.",
    ["Normalize native proposal output", "Preserve subordinate native evidence"],
    [WDA.plugins, WDA.neutral, DEV.extend],
  ),
  component(
    "EL-WDA-SPECKIT-REVIEWER",
    "Spec Kit Consistency Reviewer",
    "EL-WDA-MODULE",
    "Advisory consistency and coverage reviewer over the normalized proposal.",
    ["Report bounded findings", "Never create authoritative edges or approve progression"],
    [WDA.plugins, WDA.verify, WDA.neutral],
  ),
);

const parentByElementId = new Map(
  model.elements.map(({ id, parentId }) => [id, parentId]),
);
model.relationships = model.relationships.filter(
  ({ id, sourceElementId, targetElementId }) =>
    id !== "REL-CORE-MODULES" &&
    parentByElementId.get(sourceElementId) !== targetElementId &&
    parentByElementId.get(targetElementId) !== sourceElementId,
);
const relationship = (id, sourceElementId, targetElementId, description, sourceRequirementIds) => ({
  id,
  sourceElementId,
  targetElementId,
  description,
  interactionStyle: "synchronous",
  tags: [],
  sourceRequirementIds: uniq(sourceRequirementIds),
  sourceRefs: [],
});
model.relationships.push(
  relationship("REL-CORE-WDA", "EL-DEVRELAY-CORE", "EL-WDA-MODULE", "Executes the registered provider-neutral WorkDependencyAnalysis contract.", [WDA.analyze, WDA.deterministic, DEV.orchestrate]),
  relationship("REL-WB-WDA", "EL-WB-MODULE", "EL-WDA-MODULE", "Supplies one exact approved WorkBreakdownBaseline for analysis.", [WDA.analyze, DEV.orchestrate]),
  relationship("REL-WDA-GRAPH", "EL-WDA-MODULE", "EL-DEVRELAY-GRAPH", "Submits only trusted checkpointed dependency traceability updates.", [WDA.traceDirection, DEV.traceable]),
  relationship("REL-WDA-DOWNSTREAM", "EL-WDA-MODULE", "EL-WB-DOWNSTREAM", "Releases only an approved static dependency DAG to SpecialistAssignment.", [WDA.parallel, WDA.noExecution, DEV.gates]),
  relationship("REL-SNAPSHOT-PROPOSER", "EL-WDA-SNAPSHOT", "EL-WDA-PROPOSER-PORT", "Provides the complete snapshot and only declared pinned context slices.", [WDA.analyze, WDA.deterministic]),
  relationship("REL-PROPOSER-NATIVE", "EL-WDA-PROPOSER-PORT", "EL-WDA-NATIVE-PROPOSER", "Dispatches to the default native structured proposer.", [WDA.analyze, WDA.plugins]),
  relationship("REL-PROPOSER-OPTIONAL", "EL-WDA-PROPOSER-PORT", "EL-WDA-OPTIONAL-PROPOSERS", "Dispatches to the configured optional adapter bridge when selected.", [WDA.plugins, WDA.neutral, DEV.extend]),
  relationship("REL-PROPOSER-MECHANICS", "EL-WDA-PROPOSER-PORT", "EL-WDA-GRAPH-MECHANICS", "Submits a normalized proposal for Core-owned structural validation.", [WDA.verify, WDA.deterministic]),
  relationship("REL-MECHANICS-OPA", "EL-WDA-GRAPH-MECHANICS", "EL-WDA-OPA", "Supplies the canonical graph and mechanical diagnostics for pinned policy evaluation.", [WDA.verify, WDA.deterministic]),
  relationship("REL-PROPOSER-REVIEWER", "EL-WDA-PROPOSER-PORT", "EL-WDA-SPECKIT-REVIEWER", "Requests an advisory cross-artifact consistency review.", [WDA.plugins, WDA.verify]),
  relationship("REL-MECHANICS-GATE", "EL-WDA-GRAPH-MECHANICS", "EL-WDA-GATE", "Supplies canonical graph mechanics and cycle evidence.", [WDA.verify, DEV.gates]),
  relationship("REL-OPA-GATE", "EL-WDA-OPA", "EL-WDA-GATE", "Supplies normalized pinned policy decisions and raw-result evidence.", [WDA.verify, DEV.gates]),
  relationship("REL-REVIEWER-GATE", "EL-WDA-SPECKIT-REVIEWER", "EL-WDA-GATE", "Supplies bounded advisory findings without approval authority.", [WDA.plugins, WDA.verify]),
  relationship("REL-GATE-CONTRIBUTOR", "EL-WDA-GATE", "EL-WDA-CONTRIBUTOR", "Supplies a validated exact candidate for deterministic graph projection.", [WDA.parallel, WDA.traceDirection]),
  relationship("REL-WDA-CONTRIBUTOR-GRAPH", "EL-WDA-CONTRIBUTOR", "EL-DEVRELAY-GRAPH", "Submits checkpointed forward candidate relationships for atomic merge.", [WDA.traceDirection, DEV.traceable]),
);

const scope = {
  level: "change",
  boundary: "WorkDependencyAnalysis 0.1.0 architecture over the approved WorkBreakdown output.",
  in: [
    "One full immutable WorkBreakdown analysis snapshot",
    "Declared version-, digest-, or commit-pinned context slices",
    "Native structured proposer and optional proposal adapters",
    "Core-owned Graphology-DAG mechanics and OPA policy evaluation",
    "Advisory Spec Kit consistency review",
    "WorkDependencyGate promotion and forward traceability",
  ],
  out: [
    "Specialist assignment",
    "Estimates, waves, schedules, or mutable runtime readiness",
    "Work execution or code modification",
    "Completion or verification evidence",
  ],
};

const openSpecDesign = `# WorkDependencyAnalysis design\n\n## Context\n\nDevRelay needs an authoritative dependency DAG between approved WorkBreakdown and SpecialistAssignment without coupling canonical semantics to one analyzer.\n\n## Decision\n\nCore constructs one complete immutable analysis snapshot and validates declared pinned context slices. A configured proposer emits only DependencyProposal. Core then owns graph mechanics through a replaceable Graphology-DAG implementation, evaluates pinned OPA policy, requests a bounded Spec Kit consistency review, and prepares the exact candidate for WorkDependencyGate. Task Master and OpenSpec remain optional proposal adapters.\n\n## Boundaries\n\nThe module does not assign, estimate, schedule, execute, modify code, or record completion. It persists a static approved DAG; later modules derive runnable frontiers from current state.\n`;
const viewFor = ({
  viewKey,
  type,
  title,
  purpose,
  audience,
  scopeElementId,
  elementIds,
}) => {
  const included = new Set(elementIds);
  return {
    viewKey,
    type,
    title,
    purpose,
    audience,
    scopeElementId,
    elementIds,
    relationshipIds: model.relationships
      .filter(
        ({ sourceElementId, targetElementId }) =>
          included.has(sourceElementId) && included.has(targetElementId),
      )
      .map(({ id }) => id),
  };
};
const diagramViewSpecs = [
  viewFor({
    viewKey: "VIEW-WDA-CONTAINERS",
    type: "container",
    title: "DevRelay top-level containers",
    purpose: "Show the lifecycle module, Generic Core, TraceabilityGraph, and downstream container boundaries.",
    audience: ["engineering", "architecture"],
    scopeElementId: "EL-DEVRELAY-SYSTEM",
    elementIds: model.elements
      .filter(
        ({ type, parentId }) =>
          type === "container" && parentId === "EL-DEVRELAY-SYSTEM",
      )
      .map(({ id }) => id),
  }),
  viewFor({
    viewKey: "VIEW-WDA-CORE-COMPONENTS",
    type: "component",
    title: "Generic Core components for WorkDependencyAnalysis",
    purpose: "Show snapshot construction, graph mechanics, OPA policy, Gate, and traceability ownership.",
    audience: ["engineering", "architecture", "verification"],
    scopeElementId: "EL-DEVRELAY-CORE",
    elementIds: model.elements
      .filter(
        ({ type, parentId }) =>
          type === "component" && parentId === "EL-DEVRELAY-CORE",
      )
      .map(({ id }) => id),
  }),
  viewFor({
    viewKey: "VIEW-WDA-MODULE-COMPONENTS",
    type: "component",
    title: "WorkDependencyAnalysis module components",
    purpose: "Show the bounded proposal port, native proposer, optional adapter bridge, and advisory reviewer.",
    audience: ["engineering", "architecture", "extension-authors"],
    scopeElementId: "EL-WDA-MODULE",
    elementIds: model.elements
      .filter(
        ({ type, parentId }) =>
          type === "component" && parentId === "EL-WDA-MODULE",
      )
      .map(({ id }) => id),
  }),
];

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
    `workspace ${dslQuote("DevRelay WorkDependencyAnalysis")} ${dslQuote("Dependency-analysis target architecture")} {`,
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
const decisionSpecs = [
  {
    id: "ADR-WDA-001",
    title: "Keep planning authority in Core and configured gates",
    chosen: "OPT-WDA-CORE-AUTHORITY",
    rejected: "OPT-WDA-PLUGIN-AUTHORITY",
    supersedes: [],
    requirements: [WDA.verify, WDA.plugins, DEV.gates, DEV.neutral],
    targets: [
      { kind: "element", id: "EL-WDA-MODULE" },
      { kind: "element", id: "EL-WDA-GATE" },
      { kind: "constraint", id: "CON-WDA-CORE-AUTHORITY" },
    ],
  },
  {
    id: "ADR-WDA-002",
    title: "Store forward lifecycle traceability and derive reverse traversal",
    chosen: "OPT-WDA-FORWARD-TRACE",
    rejected: "OPT-WDA-INVERSE-EDGES",
    supersedes: [],
    requirements: [WDA.traceDirection, DEV.traceable, DEV.artifacts],
    targets: [
      { kind: "element", id: "EL-WDA-CONTRIBUTOR" },
      { kind: "constraint", id: "CON-WDA-FORWARD-TRACE" },
    ],
  },
  {
    id: "ADR-WDA-003",
    title: "Analyze a full work-breakdown snapshot with pinned context slices",
    chosen: "OPT-WDA-FULL-SNAPSHOT",
    rejected: "OPT-WDA-ADAPTER-SELECTED-CONTEXT",
    supersedes: [],
    requirements: [WDA.analyze, WDA.deterministic, DEV.artifacts],
    targets: [
      { kind: "element", id: "EL-WDA-SNAPSHOT" },
      { kind: "constraint", id: "CON-WDA-IMMUTABLE-INPUT" },
    ],
  },
  {
    id: "ADR-WDA-004",
    title: "Compose native proposal, OPA policy, DAG mechanics, and advisory review slots",
    chosen: "OPT-WDA-COMPOSED-CAPABILITIES",
    rejected: "OPT-WDA-MONOLITHIC-ANALYZER",
    supersedes: [],
    requirements: [WDA.plugins, WDA.verify, WDA.neutral, DEV.extend],
    targets: [
      { kind: "interface", id: "IF-WDA-PROPOSER" },
      { kind: "interface", id: "IF-WDA-POLICY" },
      { kind: "interface", id: "IF-WDA-CONSISTENCY" },
    ],
  },
  {
    id: "ADR-WDA-005",
    title: "Persist a static authoritative DAG and derive runnable frontiers downstream",
    chosen: "OPT-WDA-STATIC-DAG",
    rejected: "OPT-WDA-PERSISTED-WAVES",
    supersedes: [],
    requirements: [WDA.parallel, WDA.noExecution, WDA.deterministic],
    targets: [
      { kind: "element", id: "EL-WDA-GATE" },
      { kind: "constraint", id: "CON-WDA-STATIC-DAG" },
    ],
  },
];
const nativeBytesByName = new Map();
nativeBytesByName.set("design.md", writeText("design.md", openSpecDesign));
nativeBytesByName.set("workspace.dsl", writeText("workspace.dsl", structurizrDsl));
for (const [index, spec] of decisionSpecs.entries()) {
  const file = `${String(index + 1).padStart(4, "0")}-${spec.id.toLowerCase()}.proposed.md`;
  const text = `# ${spec.title}\n\n## Status\n\nProposed\n\n## Context and problem statement\n\nWorkDependencyAnalysis must preserve deterministic Core and gate authority while allowing bounded capability replacement.\n\n## Decision drivers\n\n- Determinism\n- Provider neutrality\n- Traceability\n\n## Considered options\n\n- ${spec.chosen}\n- ${spec.rejected}\n\n## Decision outcome\n\nChosen: ${spec.chosen}. The selected boundary preserves canonical DevRelay semantics and keeps native tools subordinate.\n\n## Consequences\n\n- Positive: capability implementations remain replaceable.\n- Negative: conformance and replay evidence are required for each binding.\n`;
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
  "openspec-design-work-dependency-analysis-v1",
  "https://devrelay.dev/native/openspec-design/v1",
  "text/markdown",
  "design.md",
  nativeBytesByName.get("design.md"),
);
const dslRef = fileRef(
  "structurizr-workspace-work-dependency-analysis-v1",
  "https://devrelay.dev/native/structurizr-workspace/v1",
  "text/vnd.structurizr.dsl",
  "workspace.dsl",
  nativeBytesByName.get("workspace.dsl"),
);

const technicalDesign = {
  technicalDesignId: "TD-WDA-001",
  objective: "Introduce deterministic provider-neutral dependency analysis between WorkBreakdown and SpecialistAssignment.",
  scope,
  problemSummary: "Approved work items need authoritative ordering without allowing a planner or model to own validation, policy, workflow routing, or execution.",
  solutionSummary: "Build one full snapshot, invoke a bounded proposal capability, run Core-owned graph mechanics and OPA policy, request advisory consistency review, and submit the exact candidate to WorkDependencyGate.",
  requirementsDrivers: [
    "Every approved work item appears exactly once in the candidate graph.",
    "Every hint is dispositioned and every context slice is pinned and verified.",
    "Cycles, invalid endpoints, missing dependencies, and impossible ordering fail closed.",
    "Proposal, mechanics, policy, review, gate, and graph authority remain separate.",
  ],
  behaviorFlows: [
    "Core loads the exact WorkBreakdownBaseline and creates one immutable WorkBreakdownAnalysisSnapshot.",
    "Core verifies each declared ContextSlice before any proposer runs.",
    "The configured proposer returns one canonical DependencyProposal.",
    "Core normalizes ordering, validates graph mechanics through its Graphology-DAG implementation, and evaluates pinned OPA policy.",
    "Spec Kit returns bounded advisory consistency findings over the normalized candidate.",
    "WorkDependencyGate performs semantic completeness review and controls exact promotion.",
    "A trusted contributor derives only forward candidate dependency relationships for checkpointed graph merge.",
  ],
  dataResponsibilities: [
    "WorkBreakdownAnalysisSnapshot owns complete work-item coverage and exact upstream lineage.",
    "ContextSlice owns purpose, source version or commit, deterministic selector, extracted digest, and coverage references.",
    "DependencyProposal owns proposed edges, evidence, and dependency-hint dispositions without approval authority.",
    "Core graph mechanics own canonical node and edge ordering plus cycle witnesses.",
    "OPA evaluation evidence binds bundle digest, entrypoint, input digest, engine version, and raw result.",
    "WorkDependencyGate owns semantic completeness and baseline promotion.",
  ],
  failureHandling: [
    "Input lineage or extracted-content drift fails before proposer entry.",
    "Unknown work items, duplicate nodes or edges, self-dependencies, and cycles fail with canonical diagnostics.",
    "OPA-denied relationships and unresolved blocking reviewer or Gate findings prevent promotion.",
    "Checkpoint mismatch fails closed and never repeats an already checkpointed adapter effect.",
  ],
  securityPrivacy: [
    "Proposal adapters receive only the full declared snapshot and admitted context slices.",
    "Adapters cannot access TraceabilityGraph, mutate Core state, approve artifacts, or execute work.",
    "OPA input is canonical and excludes undeclared native context.",
  ],
  performanceReliabilityOperability: [
    "Canonical sorting makes graph digests independent of library traversal order.",
    "Exact checkpoint replay returns the same validated step results without adapter reinvocation.",
    "A static DAG avoids stale persisted waves; downstream derives current runnable frontiers.",
  ],
  compatibilityMigrationRollout: [
    "Graphology and OPA remain replaceable behind canonical Core ports.",
    "Task Master and OpenSpec are optional proposers with no special canonical fields.",
    "Spec Kit is an advisory reviewer only and cannot add authoritative edges.",
  ],
  verificationIntent: [
    "Test complete node coverage, hint disposition, pinned context verification, canonical graph ordering, and zero-call replay.",
    "Test self-edge and multi-node cycle witnesses, missing dependencies, OPA denials, unresolved review findings, and Gate rejection.",
    "Test native, Task Master, and OpenSpec proposal bindings against one contract and prove Core contains no provider special cases.",
    "Test forward-only traceability merge and the downstream-only runnable-frontier boundary.",
  ],
  interfaceIntentIds: [
    "IF-WDA-PROPOSER",
    "IF-WDA-GRAPH-MECHANICS",
    "IF-WDA-POLICY",
    "IF-WDA-CONSISTENCY",
    "IF-WDA-GATE",
    "IF-WDA-TRACEABILITY",
  ],
  constraintIds: [
    "CON-WDA-IMMUTABLE-INPUT",
    "CON-WDA-CORE-AUTHORITY",
    "CON-WDA-PINNED-POLICY",
    "CON-WDA-STATIC-DAG",
    "CON-WDA-PLUGIN-TRUST",
    "CON-WDA-ANALYSIS-ONLY",
    "CON-WDA-FORWARD-TRACE",
  ],
  sourceRequirementIds: uniq(Object.values(WDA), DEV.extend, DEV.orchestrate, DEV.verify, DEV.deterministic, DEV.traceable, DEV.artifacts, DEV.gates, DEV.neutral),
  sourceRefs: [],
};

const interfaceIntent = (id, name, providerElementId, consumerElementIds, inputs, outputs, requirementIds) => ({
  id,
  name,
  purpose: name,
  ownerBoundary: providerElementId,
  providerElementId,
  consumerElementIds,
  interactionStyle: "synchronous",
  semanticInputs: inputs,
  semanticOutputs: outputs,
  protocolConstraints: ["Exact versions and SHA-256 digests", "Canonical provider-neutral semantics"],
  failureBehavior: "Fail closed without partial progression.",
  compatibilityObligations: ["Stable canonical behavior across compatible implementations"],
  securityPrivacyIntent: ["No undeclared context, graph authority, approval authority, or execution authority crosses the boundary"],
  deliveryConsistencyIntent: ["Validate and checkpoint before progression"],
  contractGeneration: { required: false, suggestedKinds: [] },
  sourceRequirementIds: uniq(requirementIds),
  sourceRefs: [],
});
const interfaces = structuredClone(
  baseSections.interfaceIntent.content.interfaces,
);
interfaces.push(
  interfaceIntent("IF-WDA-PROPOSER", "Canonical dependency proposal", "EL-WDA-PROPOSER-PORT", ["EL-WDA-MODULE"], ["WorkBreakdownAnalysisSnapshot", "ContextSliceSet"], ["DependencyProposal", "NativeArtifactBundle"], [WDA.analyze, WDA.plugins, WDA.neutral]),
  interfaceIntent("IF-WDA-GRAPH-MECHANICS", "Canonical DAG mechanics", "EL-WDA-GRAPH-MECHANICS", ["EL-WDA-MODULE"], ["Normalized DependencyProposal"], ["Canonical graph digest", "Mechanical diagnostics", "Cycle witness"], [WDA.verify, WDA.deterministic, WDA.neutral]),
  interfaceIntent("IF-WDA-POLICY", "Pinned dependency policy evaluation", "EL-WDA-OPA", ["EL-WDA-MODULE", "EL-WDA-GATE"], ["Canonical policy input", "Pinned bundle and entrypoint"], ["Normalized policy decision set", "Raw-result evidence"], [WDA.verify, WDA.deterministic]),
  interfaceIntent("IF-WDA-CONSISTENCY", "Advisory consistency review", "EL-WDA-SPECKIT-REVIEWER", ["EL-WDA-MODULE", "EL-WDA-GATE"], ["Normalized candidate", "Exact upstream artifacts"], ["Bounded consistency findings"], [WDA.plugins, WDA.verify, WDA.neutral]),
  interfaceIntent("IF-WDA-GATE", "Dependency semantic gate and promotion", "EL-WDA-GATE", ["EL-WDA-MODULE", "EL-WB-DOWNSTREAM"], ["Exact candidate and evidence package"], ["Approved WorkDependencyBaseline or rejection"], [WDA.verify, WDA.parallel, DEV.gates]),
  interfaceIntent("IF-WDA-TRACEABILITY", "Trusted dependency traceability projection", "EL-WDA-CONTRIBUTOR", ["EL-DEVRELAY-GRAPH"], ["Validated dependency candidate"], ["Forward candidate dependency update set"], [WDA.parallel, WDA.traceDirection, DEV.traceable]),
);

const constraint = (id, category, statement, appliesTo, requirementIds) => ({
  id,
  category,
  strength: "must",
  statement,
  rationale: statement,
  appliesTo,
  verificationIntent: "Dedicated positive, negative, drift, and replay conformance fixtures.",
  sourceRequirementIds: uniq(requirementIds),
  sourceRefs: [],
});
const constraints = structuredClone(
  baseSections.architectureConstraints.content.constraints,
);
constraints.push(
  constraint("CON-WDA-IMMUTABLE-INPUT", "data", "Core must build one complete immutable analysis snapshot and admit only verified declared context slices before proposer entry.", [{ kind: "element", id: "EL-WDA-SNAPSHOT" }], [WDA.analyze, WDA.deterministic, DEV.artifacts]),
  constraint("CON-WDA-CORE-AUTHORITY", "organizational", "Core owns graph mechanics and policy normalization; WorkDependencyGate alone owns semantic approval and promotion.", [{ kind: "element", id: "EL-WDA-GRAPH-MECHANICS" }, { kind: "element", id: "EL-WDA-GATE" }], [WDA.verify, DEV.gates]),
  constraint("CON-WDA-PINNED-POLICY", "data", "OPA evaluation must bind the policy bundle digest, entrypoint, canonical input digest, engine version, and raw result evidence.", [{ kind: "element", id: "EL-WDA-OPA" }, { kind: "interface", id: "IF-WDA-POLICY" }], [WDA.verify, WDA.deterministic]),
  constraint("CON-WDA-STATIC-DAG", "operational", "The approved artifact stores a static DAG only; mutable readiness and runnable frontiers are derived downstream.", [{ kind: "element", id: "EL-WDA-GATE" }], [WDA.parallel, WDA.noExecution]),
  constraint("CON-WDA-PLUGIN-TRUST", "security", "Proposers and reviewers cannot route, mutate Core or TraceabilityGraph, evaluate promotion policy, approve candidates, or execute work.", [{ kind: "element", id: "EL-WDA-PROPOSER-PORT" }, { kind: "element", id: "EL-WDA-SPECKIT-REVIEWER" }], [WDA.plugins, WDA.neutral, DEV.neutral]),
  constraint("CON-WDA-ANALYSIS-ONLY", "operational", "WorkDependencyAnalysis cannot assign, estimate, schedule, execute, modify code, or record completion.", [{ kind: "element", id: "EL-WDA-MODULE" }], [WDA.noExecution, WDA.parallel, DEV.inventory]),
  constraint("CON-WDA-FORWARD-TRACE", "data", "Traceability stores forward candidate dependency assertions only and derives reverse traversal at query time.", [{ kind: "element", id: "EL-WDA-CONTRIBUTOR" }, { kind: "element", id: "EL-DEVRELAY-GRAPH" }], [WDA.traceDirection, DEV.traceable]),
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

const views = diagramViewSpecs.map((view) => ({
  ...view,
  renderings: [{ format: "structurizr", artifact: dslRef }],
}));
const diagrams = {
  diagramSetId: "DIAGRAMS-DEVRELAY-WDA-002",
  architectureModelId: model.modelId,
  architectureModelDigest: canonicalJsonDigest(model),
  views,
};

const nativeEntry = (id, artifact, role, logicalPath, stage, adapterId, toolName, mappings) => ({
  id,
  artifact,
  role,
  logicalPath: `dogfood/work-dependency-analysis/architecture-design/${logicalPath}`,
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
  nativeEntry("NA-WDA-OPENSPEC-DESIGN", designRef, "technical-design-source", "design.md", "designer", "openspec-design", "OpenSpec", [
    { section: "technicalDesign", entityIds: [technicalDesign.technicalDesignId], jsonPointers: ["/sections/technicalDesign"] },
    { section: "interfaceIntent", entityIds: interfaces.filter(({ id }) => id.startsWith("IF-WDA-")).map(({ id }) => id), jsonPointers: ["/sections/interfaceIntent"] },
    { section: "architectureConstraints", entityIds: constraints.filter(({ id }) => id.startsWith("CON-WDA-")).map(({ id }) => id), jsonPointers: ["/sections/architectureConstraints"] },
  ]),
  nativeEntry("NA-WDA-STRUCTURIZR", dslRef, "structurizr-workspace", "workspace.dsl", "modeler", "structurizr", "Structurizr DSL", [
    { section: "architectureModel", entityIds: [model.modelId], jsonPointers: ["/sections/architectureModel"] },
    { section: "diagrams", entityIds: views.map(({ viewKey }) => viewKey), jsonPointers: ["/sections/diagrams"] },
  ]),
  ...decisionSpecs.map((spec, index) => nativeEntry(
    `NA-WDA-MADR-${String(index + 1).padStart(3, "0")}`,
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
  interfaceIntent: { mode: "embedded", content: { interfaceIntentSetId: "INTERFACES-DEVRELAY-WDA-001", interfaces } },
  architectureConstraints: { mode: "embedded", content: { constraintSetId: "CONSTRAINTS-DEVRELAY-WDA-001", constraints } },
  decisionRecords: { mode: "embedded", content: { decisionRecordSetId: "DECISIONS-DEVRELAY-WDA-001", decisions } },
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-DEVRELAY-WDA-001", entries: nativeEntries } },
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
      changeId: `CHG-WDA-${kind.toUpperCase()}-${id}`,
      entityKind: kind,
      entityId: id,
      operation,
      rationale: operation === "add"
        ? `Add the ${kind} required by WorkDependencyAnalysis.`
        : operation === "remove"
          ? `Remove the obsolete ${kind} to restore faithful C4 materialization.`
          : `Modify the ${kind} for the WorkDependencyAnalysis target architecture.`,
      compatibilityImpact: "backward-compatible",
      sourceRequirementIds: uniq(
        operation === "remove"
          ? [WDA.verify, WDA.deterministic]
          : kind === "view"
            ? [WDA.analyze, WDA.verify]
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
    changeId: `CHG-WDA-DECISION-ADD-${id}`,
    decisionId: id,
    operation: "add",
    rationale: "Record the WorkDependencyAnalysis architecture choice as a proposed MADR.",
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
const alreadyDesignedTargets = new Map([
  [
    DEV.specify,
    [{ kind: "element", id: "EL-WB-MODULE" }],
  ],
  [
    DEV.portable,
    [{ kind: "element", id: "EL-WB-ADAPTER-PORT" }],
  ],
]);
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

const assumptions = [
  { id: "ASM-WDA-BASELINE-CURRENT", statement: "The supplied WorkBreakdown architecture baseline is the current approved architecture state and the repository revision remains 9cb4f2b8d340142557027fc0477440722d4f8286.", status: "confirmed", blocking: false },
  { id: "ASM-WDA-CONTRACTS-DEFERRED", statement: "Detailed JSON artifact schemas remain a ContractGeneration or module-implementation concern; ArchitectureDesign records semantic interface intent only.", status: "confirmed", blocking: false },
];
const risks = [
  { id: "RISK-WDA-PROPOSER-AUTHORITY", statement: "A proposal implementation could be mistaken for the authoritative dependency engine.", impact: "Plugin-specific behavior could bypass Core mechanics, policy, or Gate review.", mitigation: "Constrain every proposer to DependencyProposal and test forbidden authority and Core special cases." },
  { id: "RISK-WDA-CONTEXT-DRIFT", statement: "Context slices could be stale, incomplete, or selected opportunistically.", impact: "Dependencies would be inferred from unauthorized or inconsistent context.", mitigation: "Construct the full snapshot in Core and verify declared source and extracted-content digests before proposer entry." },
  { id: "RISK-WDA-LIBRARY-LEAKAGE", statement: "Graphology traversal or OPA native results could leak into canonical artifacts.", impact: "Library swaps would alter DevRelay semantics or digests.", mitigation: "Normalize all ordering, diagnostics, policy decisions, and evidence through Core-owned contracts." },
  { id: "RISK-WDA-STALE-WAVES", statement: "Persisted execution waves would become stale as work state changes.", impact: "Downstream scheduling could incorrectly serialize or release work.", mitigation: "Persist only the static DAG and derive runnable frontiers downstream from current state." },
  { id: "RISK-WDA-REVIEWER-OVERREACH", statement: "The consistency reviewer could be treated as a source of authoritative edges.", impact: "Advisory model output would silently change the approved dependency graph.", mitigation: "Allow findings only; WorkDependencyGate owns resolution and exact approval." },
];
const changeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureChangeSetDraft",
  changeSetId: "architecture-change-set-work-dependency-analysis-v1",
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
  workingArtifactId: "architecture-designer-working-work-dependency-analysis-v1",
  operation: "design-change",
  projectArchitectureState: stateRef,
  baseInputs,
  technicalDesign: sections.technicalDesign,
  interfaceIntent: sections.interfaceIntent,
  architectureConstraints: sections.architectureConstraints,
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-WDA-DESIGNER-001", entries: [nativeEntries[0]] } },
  assumptions,
  risks,
  sourceRefs: [],
};
const designerBytes = writeJson("architecture-designer-working.json", designerWorking);
const designerRef = fileRef(designerWorking.workingArtifactId, "https://devrelay.dev/artifacts/architecture-designer-working/v1", "application/vnd.devrelay.architecture-designer-working+json", "architecture-designer-working.json", designerBytes);
const modelerWorking = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureModelerWorkingArtifact",
  workingArtifactId: "architecture-modeler-working-work-dependency-analysis-v1",
  operation: "design-change",
  projectArchitectureState: stateRef,
  designerWorkingArtifact: designerRef,
  architectureModel: sections.architectureModel,
  diagrams: sections.diagrams,
  nativeArtifacts: { mode: "embedded", content: { nativeArtifactSetId: "NATIVE-WDA-MODELER-001", entries: [nativeEntries[1]] } },
  sourceRefs: [],
};
const modelerBytes = writeJson("architecture-modeler-working.json", modelerWorking);
const modelerRef = fileRef(modelerWorking.workingArtifactId, "https://devrelay.dev/artifacts/architecture-modeler-working/v1", "application/vnd.devrelay.architecture-modeler-working+json", "architecture-modeler-working.json", modelerBytes);
const changeSetBytes = writeJson("architecture-change-set-draft.json", changeSet);
const changeSetRef = fileRef(changeSet.changeSetId, "https://devrelay.dev/artifacts/architecture-change-set-draft/v1", "application/vnd.devrelay.architecture-change-set-draft+json", "architecture-change-set-draft.json", changeSetBytes);

const conformanceProof = await verifyStructurizrConformance({
  rootPath: root,
  workspacePath:
    "dogfood/work-dependency-analysis/architecture-design/workspace.dsl",
  candidatePath:
    "dogfood/work-dependency-analysis/architecture-design/architecture-change-set-draft.json",
  outputDirectory:
    ".devrelay/conformance/work-dependency-analysis",
});
const conformanceBytes = writeJson(
  "structurizr-conformance-proof.json",
  conformanceProof,
);
const conformanceRef = fileRef(
  "structurizr-conformance-proof-work-dependency-analysis-v1",
  "https://devrelay.dev/evidence/structurizr-conformance-proof/v1",
  "application/vnd.devrelay.structurizr-conformance-proof+json",
  "structurizr-conformance-proof.json",
  conformanceBytes,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "architecture-design-change-work-dependency-analysis-v1",
  runId: "work-dependency-analysis-architecture-run-v1",
  nodeId: "architecture-design",
  module: { id: "architecture-design", version: "0.1.0", operation: "design-change" },
  adapters: [
    { step: "designer", plugin: { id: "openspec-design", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "1.0", changeName: "work-dependency-analysis", schema: "devrelay-architecture", artifact: "design.md", bridge: "agent-command", toolName: "OpenSpec" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/openspec/changes" }, { kind: "network.connect", scope: "host:implementation-engine" }] },
    { step: "modeler", plugin: { id: "structurizr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "2026.06.28", workspacePath: "dogfood/work-dependency-analysis/architecture-design/workspace.dsl", exportFormat: "static", toolName: "Structurizr DSL" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/architecture" }, { kind: "process.spawn", scope: "structurizr-export" }] },
    { step: "decision-recorder", plugin: { id: "madr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", templateVersion: "4.0", decisionsPath: "C:/repos/DevRelay/dogfood/work-dependency-analysis/architecture-design", toolName: "MADR", toolVersion: "4.0" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/dogfood/work-dependency-analysis/architecture-design" }] },
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
register(requirementsRef, read("project/history/1.1.0/requirements-baseline.json"));
register(projectOverviewRef, read("project/history/1.1.0/project-overview-baseline.json"));
register(projectOverview.renderedDocument.artifact, read("project/history/1.1.0/ProjectOverview.md"));
register(projectContextRef, read("dogfood/work-dependency-analysis/project-context.json"));
register(repositorySnapshotRef, read("dogfood/work-dependency-analysis/repository-snapshot.json"));
register(architectureBaselineRef, read("dogfood/work-breakdown/architecture-design/architecture-baseline.json"));
register(architectureBaselineProjectContextRef, read("dogfood/work-breakdown/project-context.json"));
register(architectureBaselineRepositorySnapshotRef, read("dogfood/work-breakdown/repository-snapshot.json"));
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
  "# Architecture Gate candidate: WorkDependencyAnalysis 0.1.0",
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
  "- PASS: official Structurizr validation accepted the software-system -> container -> component hierarchy; JSON export normalized exactly to 21 elements, 20 relationships, the hierarchy, one container view, and two component views.",
  "- PASS: the target architecture consumes one full WorkBreakdown snapshot plus only declared, version- or commit-pinned ContextSlices.",
  "- PASS: proposal generation is a replaceable port; the native structured proposer is default and Task Master/OpenSpec are optional adapters.",
  "- PASS: Core owns canonical graph mechanics behind Graphology-DAG and policy evaluation behind a pinned OPA boundary.",
  "- PASS: Spec Kit is advisory consistency review only; it cannot create authoritative edges or approve progression.",
  "- PASS: WorkDependencyGate owns semantic completeness and promotion; adapters cannot route, approve, mutate TraceabilityGraph, or execute work.",
  "- PASS: the approved artifact is a static DAG; SpecialistAssignment or a later scheduler derives current runnable frontiers.",
  "- PASS: exhaustive typed changes and reciprocal traceability cover all approved normative requirements.",
  "- PASS: traceability emits forward candidate dependency assertions only; reverse traversal is derived.",
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

if (!process.argv.includes("--promote")) {
  console.log(
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
  );
} else {
const ownerApprovalPath =
  "dogfood/work-dependency-analysis/architecture-design/architecture-gate-owner-approval.json";
const ownerApprovalBytes = read(ownerApprovalPath);
const ownerApproval = JSON.parse(ownerApprovalBytes);
const ownerApprovalRef = fileRef(
  ownerApproval.approvalId,
  "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1",
  "application/vnd.devrelay.architecture-gate-owner-approval+json",
  "architecture-gate-owner-approval.json",
  ownerApprovalBytes,
);
const gateReviewRef = fileRef(
  "architecture-gate-review-work-dependency-analysis-v1",
  "https://devrelay.dev/evidence/architecture-gate-review/v1",
  "text/markdown",
  "architecture-gate-candidate.md",
  gateBytes,
);
const executionProofRef = fileRef(
  "architecture-dogfood-execution-proof-work-dependency-analysis-v1",
  "https://devrelay.dev/evidence/architecture-dogfood-execution-proof/v1",
  "application/vnd.devrelay.architecture-dogfood-execution-proof+json",
  "runtime-execution-proof.json",
  proofBytes,
);
const checkpointReplay =
  await registry.verifyCheckpointedExecution(invocation, {
    artifacts,
    checkpoints,
  });
if (calls.length !== callsBeforeReplay) {
  throw new Error("ArchitectureGate checkpoint verification invoked an adapter");
}

const promotedSections = structuredClone(changeSet.sections);
for (const decision of promotedSections.decisionRecords.content.decisions) {
  if (decision.status === "proposed") decision.status = "accepted";
}
const promotedBaseline = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureBaseline",
  baselineId: "architecture-baseline-devrelay-v1-wda-001",
  approvedDraft: changeSetRef,
  requirementsBaseline: requirementsRef,
  projectOverviewBaseline: projectOverviewRef,
  projectContext: projectContextRef,
  repositorySnapshot: repositorySnapshotRef,
  sections: promotedSections,
  approvalPolicyVersion: ownerApproval.policyVersion,
  approvalEvidence: [
    gateReviewRef,
    conformanceRef,
    executionProofRef,
    ownerApprovalRef,
  ],
  sourceRefs: structuredClone(changeSet.sourceRefs),
};
const promotedBaselineBytes = Buffer.from(
  `${JSON.stringify(promotedBaseline, null, 2)}\n`,
  "utf8",
);
const promotedBaselineRef = fileRef(
  promotedBaseline.baselineId,
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
  "architecture-baseline.json",
  promotedBaselineBytes,
);
const evidenceById = new Map([
  [gateReviewRef.artifactId, { ref: gateReviewRef, bytes: gateBytes }],
  [conformanceRef.artifactId, { ref: conformanceRef, bytes: conformanceBytes }],
  [executionProofRef.artifactId, {
    ref: executionProofRef,
    bytes: proofBytes,
  }],
]);
const gatePromotion = await validateArchitectureGatePromotion({
  checkpointReplay,
  ownerApproval,
  ownerApprovalRef,
  ownerApprovalBytes,
  baseline: promotedBaseline,
  baselineRef: promotedBaselineRef,
  baselineBytes: promotedBaselineBytes,
  evidenceResolver: async (ref) => {
    const evidence = evidenceById.get(ref.artifactId);
    if (!evidence) throw new Error(`missing Gate evidence ${ref.artifactId}`);
    return evidence;
  },
});

const jsonArtifactBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => ({
  artifactId: ref.artifactId,
  digest: ref.digest,
});
const projectBaselineRef = {
  ...promotedBaselineRef,
  uri: "file:///C:/repos/DevRelay/project/architecture-baseline.json",
};
const promotedProjectState = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectArchitectureState",
  stateId: "project-architecture-state-devrelay-wda-approved-v1",
  state: "baselined",
  projectLifecycle: "existing",
  projectContext: projectContextRef,
  requirementsBaseline: requirementsRef,
  repositorySnapshot: repositorySnapshotRef,
  architectureBaseline: projectBaselineRef,
  projectOverviewBaseline: projectOverviewRef,
};
const promotedProjectStateBytes = jsonArtifactBytes(promotedProjectState);
const promotedProjectStateRef = artifactRef(
  promotedProjectState.stateId,
  "https://devrelay.dev/artifacts/project-architecture-state/v1",
  "application/vnd.devrelay.project-architecture-state+json",
  sha256(promotedProjectStateBytes),
  "file:///C:/repos/DevRelay/project/project-architecture-state.json",
);
const promotionId = "architecture-promotion-work-dependency-analysis-v1";
const pendingPromotion = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitecturePromotionJournal",
  promotionId,
  state: "prepared",
  previous: {
    architectureBaseline: pointer(architectureBaselineRef),
  },
  next: {
    architectureBaseline: pointer(projectBaselineRef),
    projectArchitectureState: pointer(promotedProjectStateRef),
  },
  candidate: pointer(changeSetRef),
  approval: pointer(ownerApprovalRef),
};
fs.writeFileSync(
  path.join(dir, "architecture-baseline.json"),
  promotedBaselineBytes,
);
const promotionProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ArchitectureGatePromotionProof",
  proofId: promotionId,
  status: "pass",
  operation: gatePromotion.operation,
  candidate: pointer(changeSetRef),
  gateReview: pointer(gateReviewRef),
  conformanceProof: pointer(conformanceRef),
  executionProof: pointer(executionProofRef),
  ownerApproval: pointer(ownerApprovalRef),
  previousArchitectureBaseline: pointer(architectureBaselineRef),
  promotedArchitectureBaseline: pointer(projectBaselineRef),
  promotedProjectArchitectureState: pointer(promotedProjectStateRef),
  checkpointReplay: {
    producer: checkpointReplay.producer,
    checkpointCount: checkpointValues.size,
    adapterCallsOnVerification: 0,
  },
  commitPayloadDigest: canonicalJsonDigest(gatePromotion.commitPayload),
  workBreakdownProgressionAllowed: true,
};
const promotionProofBytes = writeJson(
  "architecture-gate-promotion-proof.json",
  promotionProof,
);
const promotionProofRef = fileRef(
  promotionProof.proofId,
  "https://devrelay.dev/evidence/architecture-gate-promotion-proof/v1",
  "application/vnd.devrelay.architecture-gate-promotion-proof+json",
  "architecture-gate-promotion-proof.json",
  promotionProofBytes,
);
console.log(JSON.stringify({
  status: "ARCHITECTURE_GATE_PROMOTED",
  operation: "design-change",
  routeReasonCode: routeDecision.reasonCode,
  adapters: calls,
  checkpointCount: checkpointValues.size,
  replayAdapterCalls: 0,
  architectureChangeSetDigest: changeSetRef.digest,
  architectureGateReviewDigest: sha256(gateBytes),
  structurizrConformanceProofDigest: conformanceRef.digest,
  ownerApprovalDigest: ownerApprovalRef.digest,
  architectureBaselineDigest: projectBaselineRef.digest,
  promotionProofDigest: promotionProofRef.digest,
  workBreakdownProgressionAllowed: true,
}, null, 2));
}
