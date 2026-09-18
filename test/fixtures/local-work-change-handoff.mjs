// Genuine isolated Architecture/Core fixture, adapted from architecture-runtime.test.mjs.
// Kept local to this bounded test because that test file does not export its setup.
import { readFile } from "node:fs/promises";

import { architectureRuntimeArtifactContracts } from "../../src/architecture-runtime-contracts.mjs";
import { sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { MODULE_ROUTE_DECISION_MEDIA_TYPE, MODULE_ROUTE_DECISION_SCHEMA } from "../../src/operation-router.mjs";
import { alignArchitectureRequirements, augmentArchitectureArtifactOverview, createProjectOverviewBaselineFixture } from "../architecture-project-overview-fixtures.mjs";
import { registerArchitectureNativeBytes } from "../native-architecture-fixtures.mjs";

const root = new URL("../../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [
  architectureModule,
  specKitPlan,
  openSpecDesign,
  structurizr,
  madr,
  establishInvocationFixture,
  stateFixture,
  requirementsFixture,
  projectContextFixture,
  designerFixture,
  modelerFixture,
  draftFixture,
  baselineFixture,
  resultFixture,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson("examples/plugins/spec-kit-plan.plugin.json"),
  readJson("examples/plugins/openspec-design.plugin.json"),
  readJson("examples/plugins/structurizr.plugin.json"),
  readJson("examples/plugins/madr.plugin.json"),
  readJson("examples/invocations/architecture-establish-baseline.invocation.json"),
  readJson("examples/artifacts/project-architecture-state-greenfield-001.json"),
  readJson("examples/artifacts/requirements-baseline-001.json"),
  readJson("examples/artifacts/project-context-001.json"),
  readJson("examples/artifacts/architecture-designer-working-001.json"),
  readJson("examples/artifacts/architecture-modeler-working-001.json"),
  readJson("examples/artifacts/architecture-draft-001.json"),
  readJson("examples/artifacts/architecture-baseline-001.json"),
  readJson("examples/results/architecture-establish-baseline.result.json"),
]);

const mediaTypes = {
  ProjectArchitectureState:
    "application/vnd.devrelay.project-architecture-state+json",
  RequirementsBaseline: "application/vnd.devrelay.requirements-baseline+json",
  ProjectOverviewBaseline:
    "application/vnd.devrelay.project-overview-baseline+json",
  ProjectContext: "application/vnd.devrelay.project-context+json",
  ArchitectureDesignerWorkingArtifact:
    "application/vnd.devrelay.architecture-designer-working+json",
  ArchitectureModelerWorkingArtifact:
    "application/vnd.devrelay.architecture-modeler-working+json",
  ArchitectureDraft: "application/vnd.devrelay.architecture-draft+json",
  ArchitectureBaseline: "application/vnd.devrelay.architecture-baseline+json",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_MEDIA_TYPE,
};

const schemas = {
  ProjectArchitectureState:
    "https://devrelay.dev/artifacts/project-architecture-state/v1",
  RequirementsBaseline:
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
  ProjectOverviewBaseline:
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  ProjectContext: "https://devrelay.dev/artifacts/project-context/v1",
  ArchitectureDesignerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-designer-working/v1",
  ArchitectureModelerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-modeler-working/v1",
  ArchitectureDraft: "https://devrelay.dev/artifacts/architecture-draft/v1",
  ArchitectureBaseline:
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_SCHEMA,
};

function createStore() {
  const bytesById = new Map();
  return {
    add(artifactId, value, kind = value.kind) {
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      const ref = {
        artifactId,
        schema: schemas[kind],
        mediaType: mediaTypes[kind],
        digest: sha256Digest(bytes),
        uri: `artifact://architecture-runtime/${artifactId}`,
      };
      bytesById.set(artifactId, bytes);
      registerArchitectureNativeBytes(value, bytesById);
      return ref;
    },
    addBytes(artifactId, bytes) {
      bytesById.set(artifactId, Buffer.from(bytes));
    },
    artifacts: {
      async load(ref) {
        const bytes = bytesById.get(ref.artifactId);
        if (!bytes) {
          throw new Error(`missing ${ref.artifactId}`);
        }
        return bytes;
      },
    },
  };
}

export function checkpoints() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

function stepContinue(stepInvocation, outputs) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: structuredClone(stepInvocation.plugin),
    disposition: "continue",
    outputs,
    evidence: [],
    diagnostics: [],
  };
}

function stepTerminal(stepInvocation, moduleResult) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: structuredClone(stepInvocation.plugin),
    disposition: "terminal",
    moduleResult,
  };
}

function replaceBaseInputs(artifact, refs) {
  artifact.baseInputs = Object.entries(refs).map(([role, artifact]) => ({
    role,
    artifact: structuredClone(artifact),
  }));
}

export async function runtimeFixture({ mutateDesigner, mutateModeler, mutateDraft } = {}) {
  const store = createStore();
  const projectContext = structuredClone(projectContextFixture);
  projectContext.lifecycle = "greenfield";
  const projectContextRef = store.add(
    "project-context-architecture-runtime",
    projectContext,
  );
  const requirementsRef = store.add(
    requirementsFixture.baselineId,
    requirementsFixture,
  );
  const projectOverviewFixture = createProjectOverviewBaselineFixture({
    requirementsBaseline: requirementsFixture,
    requirementsBaselineRef: requirementsRef,
  });
  store.addBytes(
    projectOverviewFixture.documentRef.artifactId,
    projectOverviewFixture.documentBytes,
  );
  const projectOverviewRef = store.add(
    projectOverviewFixture.value.baselineId,
    projectOverviewFixture.value,
  );

  const state = structuredClone(stateFixture);
  state.projectContext = structuredClone(projectContextRef);
  state.requirementsBaseline = structuredClone(requirementsRef);
  augmentArchitectureArtifactOverview(state, projectOverviewRef);
  const stateRef = store.add(state.stateId, state);

  const calls = [];
  const adapters = {
    "spec-kit-plan": {
      async invoke(stepInvocation) {
        calls.push("spec-kit-plan");
        return stepContinue(stepInvocation, {
          "architecture-designer-working": [designerRef],
        });
      },
    },
    "openspec-design": {
      async invoke() {
        calls.push("openspec-design");
        throw new Error("wrong designer selected");
      },
    },
    structurizr: {
      async invoke(stepInvocation) {
        calls.push("structurizr");
        return stepContinue(stepInvocation, {
          "architecture-modeler-working": [modelerRef],
        });
      },
    },
    madr: {
      async invoke(stepInvocation) {
        calls.push("madr");
        const completed = structuredClone(moduleResult);
        completed.invocationId = stepInvocation.invocationId;
        return stepTerminal(stepInvocation, completed);
      },
    },
  };

  const registry = createModuleRegistry({
    modules: [architectureModule],
    plugins: [specKitPlan, openSpecDesign, structurizr, madr].map(
      (definition) => ({
        definition,
        adapter: adapters[definition.metadata.id],
      }),
    ),
    artifactContracts: architectureRuntimeArtifactContracts(),
  });

  const routeDecision = await registry.selectOperation(
    {
      id: "architecture-design",
      version: "0.1.0",
    },
    stateRef,
    {
      artifacts: store.artifacts,
    },
  );
  const routeRef = store.add(
    "module-route-decision-establish-runtime",
    routeDecision,
  );

  const baseRefs = {
    "project-architecture-state": stateRef,
    "requirements-baseline": requirementsRef,
    "project-overview-baseline": projectOverviewRef,
    "project-context": projectContextRef,
  };
  const designer = structuredClone(designerFixture);
  alignArchitectureRequirements(designer, requirementsFixture);
  designer.projectArchitectureState = structuredClone(stateRef);
  replaceBaseInputs(designer, baseRefs);
  mutateDesigner?.(designer);
  const designerRef = store.add(designer.workingArtifactId, designer);

  const modeler = structuredClone(modelerFixture);
  alignArchitectureRequirements(modeler, requirementsFixture);
  modeler.projectArchitectureState = structuredClone(stateRef);
  modeler.designerWorkingArtifact = structuredClone(designerRef);
  mutateModeler?.(modeler);
  const modelerRef = store.add(modeler.workingArtifactId, modeler);

  const draft = structuredClone(draftFixture);
  alignArchitectureRequirements(draft, requirementsFixture);
  augmentArchitectureArtifactOverview(draft, projectOverviewRef);
  draft.projectArchitectureState = structuredClone(stateRef);
  draft.requirementsBaseline = structuredClone(requirementsRef);
  draft.projectContext = structuredClone(projectContextRef);
  delete draft.repositorySnapshot;
  delete draft.currentArchitectureSnapshot;
  draft.discoveryReconciliation = [];
  mutateDraft?.(draft);
  const draftRef = store.add(draft.draftId, draft);

  const moduleResult = structuredClone(resultFixture);
  moduleResult.outputs["architecture-draft"] = [structuredClone(draftRef)];
  for (const evidence of moduleResult.evidence) {
    evidence.artifact = structuredClone(draftRef);
  }

  const invocation = structuredClone(establishInvocationFixture);
  invocation.inputs = {
    "project-architecture-state": [structuredClone(stateRef)],
    "routing-decision": [structuredClone(routeRef)],
    "requirements-baseline": [structuredClone(requirementsRef)],
    "project-overview-baseline": [structuredClone(projectOverviewRef)],
    "project-context": [structuredClone(projectContextRef)],
  };

  const architectureBaseline = structuredClone(baselineFixture);
  alignArchitectureRequirements(architectureBaseline, requirementsFixture);
  augmentArchitectureArtifactOverview(
    architectureBaseline,
    projectOverviewRef,
  );
  const baselineRef = store.add(
    architectureBaseline.baselineId,
    architectureBaseline,
  );

  return {
    baselineRef,
    calls,
    designerRef,
    draftRef,
    invocation,
    modelerRef,
    moduleResult,
    projectOverviewRef,
    requirementsRef,
    registry,
    routeRef,
    stateRef,
    store,
  };
}

