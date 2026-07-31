import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import { sha256Digest } from "../src/content-digest.mjs";
import { ContractError, createModuleRegistry } from "../src/module-registry.mjs";
import {
  MODULE_ROUTE_DECISION_MEDIA_TYPE,
  MODULE_ROUTE_DECISION_SCHEMA,
} from "../src/operation-router.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));

const [
  architectureModule,
  openSpecDesign,
  structurizr,
  madr,
  invocationFixture,
  stateFixture,
  requirementsFixture,
  projectContextFixture,
  repositorySnapshotFixture,
  baselineFixture,
  designerFixture,
  modelerFixture,
  changeSetFixture,
  resultFixture,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson("examples/plugins/openspec-design.plugin.json"),
  readJson("examples/plugins/structurizr.plugin.json"),
  readJson("examples/plugins/madr.plugin.json"),
  readJson("examples/invocations/architecture-design-change.invocation.json"),
  readJson("examples/artifacts/project-architecture-state-baselined-001.json"),
  readJson("dogfood/architecture-design/requirements-baseline.json"),
  readJson("dogfood/architecture-design/project-context.json"),
  readJson("dogfood/architecture-design/repository-snapshot.json"),
  readJson("examples/artifacts/architecture-baseline-001.json"),
  readJson("examples/artifacts/architecture-designer-working-001.json"),
  readJson("examples/artifacts/architecture-modeler-working-001.json"),
  readJson("examples/artifacts/architecture-change-set-draft-001.json"),
  readJson("examples/results/architecture-design-change.result.json"),
]);

const schemaByKind = {
  ProjectArchitectureState:
    "https://devrelay.dev/artifacts/project-architecture-state/v1",
  RequirementsBaseline:
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
  ProjectContext: "https://devrelay.dev/artifacts/project-context/v1",
  RepositorySnapshot:
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
  ArchitectureBaseline:
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
  ArchitectureDesignerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-designer-working/v1",
  ArchitectureModelerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-modeler-working/v1",
  ArchitectureChangeSetDraft:
    "https://devrelay.dev/artifacts/architecture-change-set-draft/v1",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_SCHEMA,
};

const mediaTypeByKind = {
  ProjectArchitectureState:
    "application/vnd.devrelay.project-architecture-state+json",
  RequirementsBaseline: "application/vnd.devrelay.requirements-baseline+json",
  ProjectContext: "application/vnd.devrelay.project-context+json",
  RepositorySnapshot: "application/vnd.devrelay.repository-snapshot+json",
  ArchitectureBaseline: "application/vnd.devrelay.architecture-baseline+json",
  ArchitectureDesignerWorkingArtifact:
    "application/vnd.devrelay.architecture-designer-working+json",
  ArchitectureModelerWorkingArtifact:
    "application/vnd.devrelay.architecture-modeler-working+json",
  ArchitectureChangeSetDraft:
    "application/vnd.devrelay.architecture-change-set-draft+json",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_MEDIA_TYPE,
};

function createStore() {
  const bytesById = new Map();
  return {
    add(artifactId, value, kind = value.kind) {
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      const ref = {
        artifactId,
        schema: schemaByKind[kind],
        mediaType: mediaTypeByKind[kind],
        digest: sha256Digest(bytes),
        uri: `artifact://architecture-change-runtime/${artifactId}`,
      };
      bytesById.set(artifactId, bytes);
      return ref;
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

function checkpoints() {
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

function continueResult(stepInvocation, outputs) {
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

function terminalResult(stepInvocation, moduleResult) {
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

function nativeEntry(candidate, adapterId) {
  return candidate.sections.nativeArtifacts.content.entries.find(
    (entry) => entry.producedBy.adapterId === adapterId,
  );
}

function baseInputs(refs) {
  return Object.entries(refs).map(([role, artifact]) => ({
    role,
    artifact: structuredClone(artifact),
  }));
}

async function changeRuntime({
  modelerDefinition = structurizr,
  mutateState,
  mutateModeler,
  mutateCandidate,
} = {}) {
  const store = createStore();
  const projectContext = structuredClone(projectContextFixture);
  const projectContextRef = store.add(
    "project-context-change-runtime",
    projectContext,
  );
  const requirementsRef = store.add(
    requirementsFixture.baselineId,
    requirementsFixture,
  );
  const repositoryRef = store.add(
    "repository-snapshot-change-runtime",
    repositorySnapshotFixture,
  );
  const architectureBaseline = structuredClone(baselineFixture);
  architectureBaseline.projectContext = structuredClone(projectContextRef);
  architectureBaseline.repositorySnapshot = structuredClone(repositoryRef);
  const baselineRef = store.add(
    architectureBaseline.baselineId,
    architectureBaseline,
  );

  const state = structuredClone(stateFixture);
  state.projectContext = structuredClone(projectContextRef);
  state.requirementsBaseline = structuredClone(requirementsRef);
  state.repositorySnapshot = structuredClone(repositoryRef);
  state.architectureBaseline = structuredClone(baselineRef);
  mutateState?.(state);
  const stateRef = store.add(state.stateId, state);

  const modelerId = modelerDefinition.metadata.id;
  const calls = [];
  let designerRef;
  let modelerRef;
  let moduleResult;
  const adapters = {
    "openspec-design": {
      async invoke(stepInvocation) {
        calls.push("openspec-design");
        return continueResult(stepInvocation, {
          "architecture-designer-working": [designerRef],
        });
      },
    },
    [modelerId]: {
      async invoke(stepInvocation) {
        calls.push(modelerId);
        return continueResult(stepInvocation, {
          "architecture-modeler-working": [modelerRef],
        });
      },
    },
    madr: {
      async invoke(stepInvocation) {
        calls.push("madr");
        return terminalResult(stepInvocation, moduleResult);
      },
    },
  };
  const definitions = [openSpecDesign, modelerDefinition, madr];
  const registry = createModuleRegistry({
    modules: [architectureModule],
    plugins: definitions.map((definition) => ({
      definition,
      adapter: adapters[definition.metadata.id],
    })),
    artifactContracts: architectureRuntimeArtifactContracts(),
  });

  const routeDecision = await registry.selectOperation(
    { id: "architecture-design", version: "0.1.0" },
    stateRef,
    { artifacts: store.artifacts },
  );
  const routeRef = store.add(
    "module-route-decision-change-runtime",
    routeDecision,
  );
  const lineageRefs = {
    "project-architecture-state": stateRef,
    "requirements-baseline": requirementsRef,
    "project-context": projectContextRef,
    "architecture-baseline": baselineRef,
    "repository-snapshot": repositoryRef,
  };

  const changeSet = structuredClone(changeSetFixture);
  changeSet.projectArchitectureState = structuredClone(stateRef);
  changeSet.baseArchitectureBaseline = structuredClone(baselineRef);
  changeSet.baseArchitectureDigest = baselineRef.digest;
  changeSet.targetRequirementsBaseline = structuredClone(requirementsRef);
  changeSet.projectContext = structuredClone(projectContextRef);
  changeSet.repositorySnapshot = structuredClone(repositoryRef);
  const modelerEntry = nativeEntry(changeSet, "structurizr");
  modelerEntry.producedBy.adapterId = modelerId;

  const designer = structuredClone(designerFixture);
  designer.workingArtifactId = "architecture-designer-working-change-runtime";
  designer.operation = "design-change";
  designer.projectArchitectureState = structuredClone(stateRef);
  designer.baseInputs = baseInputs(lineageRefs);
  designer.technicalDesign = structuredClone(changeSet.sections.technicalDesign);
  designer.interfaceIntent = structuredClone(changeSet.sections.interfaceIntent);
  designer.architectureConstraints = structuredClone(
    changeSet.sections.architectureConstraints,
  );
  designer.nativeArtifacts.content.nativeArtifactSetId =
    "NATIVE-DESIGNER-CHANGE-RUNTIME";
  designer.nativeArtifacts.content.entries = [
    structuredClone(nativeEntry(changeSet, "openspec-design")),
  ];
  designerRef = store.add(designer.workingArtifactId, designer);

  const modeler = structuredClone(modelerFixture);
  modeler.workingArtifactId = "architecture-modeler-working-change-runtime";
  modeler.operation = "design-change";
  modeler.projectArchitectureState = structuredClone(stateRef);
  modeler.designerWorkingArtifact = structuredClone(designerRef);
  modeler.architectureModel = structuredClone(changeSet.sections.architectureModel);
  modeler.diagrams = structuredClone(changeSet.sections.diagrams);
  modeler.nativeArtifacts.content.nativeArtifactSetId =
    "NATIVE-MODELER-CHANGE-RUNTIME";
  modeler.nativeArtifacts.content.entries = [
    structuredClone(nativeEntry(changeSet, modelerId)),
  ];
  mutateModeler?.(modeler);
  modelerRef = store.add(modeler.workingArtifactId, modeler);

  mutateCandidate?.(changeSet);
  const changeSetRef = store.add(changeSet.changeSetId, changeSet);
  moduleResult = structuredClone(resultFixture);
  moduleResult.outputs["architecture-change-set-draft"] = [
    structuredClone(changeSetRef),
  ];
  for (const evidence of moduleResult.evidence) {
    evidence.artifact = structuredClone(changeSetRef);
  }

  const invocation = structuredClone(invocationFixture);
  invocation.inputs = {
    "project-architecture-state": [structuredClone(stateRef)],
    "routing-decision": [structuredClone(routeRef)],
    "requirements-baseline": [structuredClone(requirementsRef)],
    "project-context": [structuredClone(projectContextRef)],
    "architecture-baseline": [structuredClone(baselineRef)],
    "repository-snapshot": [structuredClone(repositoryRef)],
  };
  invocation.adapters[1].plugin = {
    id: modelerId,
    version: modelerDefinition.metadata.version,
  };

  return {
    calls,
    invocation,
    registry,
    store,
  };
}

test("design-change executes OpenSpec -> Structurizr -> MADR against the exact baseline", async () => {
  const fixture = await changeRuntime();
  const checkpointStore = checkpoints();
  const result = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });

  assert.equal(result.outcome, "change_set_drafted");
  assert.deepEqual(fixture.calls, [
    "openspec-design",
    "structurizr",
    "madr",
  ]);
  assert.equal(result.outputs["architecture-change-set-draft"].length, 1);
  assert.equal(checkpointStore.values.size, 3);
});

test("a compatible modeler swaps through configuration without a Core change", async () => {
  const alternative = structuredClone(structurizr);
  alternative.metadata.id = "structurizr-compatible";
  alternative.metadata.description =
    "A second compatible architecture modeler used to prove binding-level replacement.";
  const fixture = await changeRuntime({ modelerDefinition: alternative });
  const result = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpoints(),
  });

  assert.equal(result.outcome, "change_set_drafted");
  assert.equal(fixture.invocation.adapters[1].plugin.id, alternative.metadata.id);
  assert.deepEqual(fixture.calls, [
    "openspec-design",
    "structurizr-compatible",
    "madr",
  ]);
});

test("state and invocation cross-links must be identical before design starts", async () => {
  const fixture = await changeRuntime({
    mutateState(state) {
      state.projectContext.digest = `sha256:${"f".repeat(64)}`;
    },
  });
  await assert.rejects(
    fixture.registry.execute(fixture.invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(fixture.calls, []);
});

test("modeler and terminal candidates cannot replace validated upstream work", async () => {
  const staleModeler = await changeRuntime({
    mutateModeler(modeler) {
      modeler.designerWorkingArtifact.digest = `sha256:${"f".repeat(64)}`;
    },
  });
  await assert.rejects(
    staleModeler.registry.execute(staleModeler.invocation, {
      artifacts: staleModeler.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(staleModeler.calls, ["openspec-design", "structurizr"]);

  const replacedSection = await changeRuntime({
    mutateCandidate(candidate) {
      candidate.sections.technicalDesign.content.solutionSummary +=
        " This unreviewed replacement must be rejected.";
    },
  });
  await assert.rejects(
    replacedSection.registry.execute(replacedSection.invocation, {
      artifacts: replacedSection.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(replacedSection.calls, [
    "openspec-design",
    "structurizr",
    "madr",
  ]);
});
