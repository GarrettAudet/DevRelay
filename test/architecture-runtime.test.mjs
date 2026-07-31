import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import { sha256Digest } from "../src/content-digest.mjs";
import {
  ContractError,
  createModuleRegistry,
} from "../src/module-registry.mjs";
import {
  MODULE_ROUTE_DECISION_MEDIA_TYPE,
  MODULE_ROUTE_DECISION_SCHEMA,
} from "../src/operation-router.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [
  architectureModule,
  specKitPlan,
  openSpecDesign,
  structurizr,
  madr,
  establishInvocationFixture,
  changeInvocationFixture,
  stateFixture,
  requirementsFixture,
  projectContextFixture,
  designerFixture,
  modelerFixture,
  draftFixture,
  baselineFixture,
  resultFixture,
  clarificationResultFixture,
  clarificationRequestFixture,
  clarificationResponseFixture,
  continuationFixture,
  repositorySnapshotFixture,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson("examples/plugins/spec-kit-plan.plugin.json"),
  readJson("examples/plugins/openspec-design.plugin.json"),
  readJson("examples/plugins/structurizr.plugin.json"),
  readJson("examples/plugins/madr.plugin.json"),
  readJson("examples/invocations/architecture-establish-baseline.invocation.json"),
  readJson("examples/invocations/architecture-design-change.invocation.json"),
  readJson("examples/artifacts/project-architecture-state-greenfield-001.json"),
  readJson("dogfood/architecture-design/requirements-baseline.json"),
  readJson("dogfood/architecture-design/project-context.json"),
  readJson("examples/artifacts/architecture-designer-working-001.json"),
  readJson("examples/artifacts/architecture-modeler-working-001.json"),
  readJson("examples/artifacts/architecture-draft-001.json"),
  readJson("examples/artifacts/architecture-baseline-001.json"),
  readJson("examples/results/architecture-establish-baseline.result.json"),
  readJson("examples/results/architecture-establish-clarification.result.json"),
  readJson("examples/artifacts/architecture-clarification-request-001.json"),
  readJson("examples/artifacts/architecture-clarification-response-001.json"),
  readJson("examples/artifacts/architecture-continuation-001.json"),
  readJson("dogfood/architecture-design/repository-snapshot.json"),
]);

const mediaTypes = {
  ProjectArchitectureState:
    "application/vnd.devrelay.project-architecture-state+json",
  RequirementsBaseline: "application/vnd.devrelay.requirements-baseline+json",
  ProjectContext: "application/vnd.devrelay.project-context+json",
  RepositorySnapshot: "application/vnd.devrelay.repository-snapshot+json",
  ArchitectureDesignerWorkingArtifact:
    "application/vnd.devrelay.architecture-designer-working+json",
  ArchitectureModelerWorkingArtifact:
    "application/vnd.devrelay.architecture-modeler-working+json",
  ArchitectureDraft: "application/vnd.devrelay.architecture-draft+json",
  ArchitectureBaseline: "application/vnd.devrelay.architecture-baseline+json",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_MEDIA_TYPE,
  ArchitectureClarificationRequestSet:
    "application/vnd.devrelay.architecture-clarification-request-set+json",
  ArchitectureClarificationResponseSet:
    "application/vnd.devrelay.architecture-clarification-response-set+json",
  ArchitectureDesignContinuation:
    "application/vnd.devrelay.architecture-design-continuation+json",
};

const schemas = {
  ProjectArchitectureState:
    "https://devrelay.dev/artifacts/project-architecture-state/v1",
  RequirementsBaseline:
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
  ProjectContext: "https://devrelay.dev/artifacts/project-context/v1",
  RepositorySnapshot:
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
  ArchitectureDesignerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-designer-working/v1",
  ArchitectureModelerWorkingArtifact:
    "https://devrelay.dev/artifacts/architecture-modeler-working/v1",
  ArchitectureDraft: "https://devrelay.dev/artifacts/architecture-draft/v1",
  ArchitectureBaseline:
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
  ModuleRouteDecision: MODULE_ROUTE_DECISION_SCHEMA,
  ArchitectureClarificationRequestSet:
    "https://devrelay.dev/artifacts/architecture-clarification-request-set/v1",
  ArchitectureClarificationResponseSet:
    "https://devrelay.dev/artifacts/architecture-clarification-response-set/v1",
  ArchitectureDesignContinuation:
    "https://devrelay.dev/artifacts/architecture-design-continuation/v1",
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
  artifact.baseInputs = artifact.baseInputs
    .filter(({ role }) =>
      [
        "project-architecture-state",
        "requirements-baseline",
        "project-context",
      ].includes(role),
    )
    .map(({ role }) => ({
      role,
      artifact: structuredClone(refs[role]),
    }));
}

async function runtimeFixture({ pauseAt } = {}) {
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

  const state = structuredClone(stateFixture);
  state.projectContext = structuredClone(projectContextRef);
  state.requirementsBaseline = structuredClone(requirementsRef);
  const stateRef = store.add(state.stateId, state);

  const calls = [];
  let pauseRemaining = pauseAt;
  const shouldPause = (stage) => {
    if (pauseRemaining !== stage) {
      return false;
    }
    pauseRemaining = undefined;
    return true;
  };
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
        if (shouldPause("modeler")) {
          return stepTerminal(
            stepInvocation,
            clarificationModuleResult(stepInvocation),
          );
        }
        return stepContinue(stepInvocation, {
          "architecture-modeler-working": [modelerRef],
        });
      },
    },
    madr: {
      async invoke(stepInvocation) {
        calls.push("madr");
        if (shouldPause("decision-recorder")) {
          return stepTerminal(
            stepInvocation,
            clarificationModuleResult(stepInvocation),
          );
        }
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
    "project-context": projectContextRef,
  };
  const designer = structuredClone(designerFixture);
  designer.projectArchitectureState = structuredClone(stateRef);
  replaceBaseInputs(designer, baseRefs);
  const designerRef = store.add(designer.workingArtifactId, designer);

  const modeler = structuredClone(modelerFixture);
  modeler.projectArchitectureState = structuredClone(stateRef);
  modeler.designerWorkingArtifact = structuredClone(designerRef);
  const modelerRef = store.add(modeler.workingArtifactId, modeler);

  const draft = structuredClone(draftFixture);
  draft.projectArchitectureState = structuredClone(stateRef);
  draft.requirementsBaseline = structuredClone(requirementsRef);
  draft.projectContext = structuredClone(projectContextRef);
  delete draft.repositorySnapshot;
  delete draft.currentArchitectureSnapshot;
  draft.discoveryReconciliation = [];
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
    "project-context": [structuredClone(projectContextRef)],
  };

  function clarificationModuleResult(stepInvocation) {
    const activeStage = stepInvocation.step;
    const suffix = activeStage.replaceAll("-", "");
    const baseInputs = continuationBaseInputs(invocation);

    const request = structuredClone(clarificationRequestFixture);
    request.requestSetId = `architecture-clarification-request-${suffix}`;
    request.operation = invocation.module.operation;
    request.activeStage = activeStage;
    request.projectArchitectureState = structuredClone(stateRef);
    request.baseInputs = structuredClone(baseInputs);
    const requestRef = store.add(request.requestSetId, request);

    const continuation = structuredClone(continuationFixture);
    continuation.continuationId = `architecture-continuation-${suffix}`;
    continuation.operation = invocation.module.operation;
    continuation.activeStage = activeStage;
    continuation.projectArchitectureState = structuredClone(stateRef);
    continuation.baseInputs = structuredClone(baseInputs);
    continuation.chainFingerprint = stepInvocation.chainFingerprint;
    continuation.sourceInvocation = {
      invocationId: stepInvocation.invocationId,
      invocationFingerprint: stepInvocation.invocationFingerprint,
    };
    continuation.completedStages = stepInvocation.priorResults.map(
      (result) => ({
        step: result.step,
        plugin: structuredClone(result.plugin),
        outputs: structuredClone(result.outputs),
        stepInvocationDigest: result.stepInvocationDigest,
        stepResultDigest: result.digest,
      }),
    );
    const continuationRef = store.add(
      continuation.continuationId,
      continuation,
    );

    const result = structuredClone(clarificationResultFixture);
    result.invocationId = stepInvocation.invocationId;
    result.outputs["clarification-requests"] = [
      structuredClone(requestRef),
    ];
    result.outputs.continuation = [structuredClone(continuationRef)];
    return result;
  }

  const architectureBaseline = structuredClone(baselineFixture);
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
    registry,
    routeRef,
    stateRef,
    store,
  };
}

test("ArchitectureDesign executes the configured Spec Kit → Structurizr → MADR chain", async () => {
  const fixture = await runtimeFixture();
  const checkpointStore = checkpoints();
  const result = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });

  assert.equal(result.outcome, "baseline_drafted");
  assert.deepEqual(fixture.calls, ["spec-kit-plan", "structurizr", "madr"]);
  assert.equal(result.outputs["architecture-draft"].length, 1);
  assert.equal(checkpointStore.values.size, 3);
});

test("ArchitectureDesign execution cannot bypass the route chosen from state bytes", async () => {
  const fixture = await runtimeFixture();
  const forgedDecision = JSON.parse(
    (await fixture.store.artifacts.load(fixture.routeRef)).toString("utf8"),
  );
  forgedDecision.selection.operation = "design-change";
  const forgedRef = fixture.store.add(
    "module-route-decision-forged-runtime",
    forgedDecision,
  );
  const invocation = structuredClone(fixture.invocation);
  invocation.inputs["routing-decision"] = [forgedRef];

  await assert.rejects(
    fixture.registry.execute(invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2105",
  );
  assert.deepEqual(fixture.calls, []);
});

test("ArchitectureDesign rejects a semantically invalid primary candidate before return", async () => {
  const fixture = await runtimeFixture();
  const draftRef =
    fixture.moduleResult.outputs["architecture-draft"][0];
  const invalid = structuredClone(
    JSON.parse(
      (
        await fixture.store.artifacts.load(draftRef)
      ).toString("utf8"),
    ),
  );
  invalid.projectArchitectureState.digest = `sha256:${"f".repeat(64)}`;
  const invalidRef = fixture.store.add(
    "architecture-draft-invalid-runtime",
    invalid,
    "ArchitectureDraft",
  );
  fixture.moduleResult.outputs["architecture-draft"] = [invalidRef];
  for (const evidence of fixture.moduleResult.evidence) {
    evidence.artifact = structuredClone(invalidRef);
  }

  await assert.rejects(
    fixture.registry.execute(fixture.invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
});


function continuationBaseInputs(invocation) {
  return [
    "project-architecture-state",
    "requirements-baseline",
    "project-context",
    "repository-snapshot",
    "current-architecture-snapshot",
    "architecture-baseline",
  ]
    .filter((role) => invocation.inputs[role])
    .map((role) => ({
      role,
      artifact: structuredClone(invocation.inputs[role][0]),
    }));
}

async function preparePausedResume(activeStage) {
  const fixture = await runtimeFixture({ pauseAt: activeStage });
  const checkpointStore = checkpoints();
  const sourceResult = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  assert.equal(sourceResult.outcome, "needs_clarification");

  const requestRef = sourceResult.outputs["clarification-requests"][0];
  const continuationRef = sourceResult.outputs.continuation[0];
  const request = JSON.parse(
    (await fixture.store.artifacts.load(requestRef)).toString("utf8"),
  );

  const response = structuredClone(clarificationResponseFixture);
  response.responseSetId = `architecture-clarification-response-${activeStage}`;
  response.operation = fixture.invocation.module.operation;
  response.activeStage = activeStage;
  response.request = structuredClone(requestRef);
  const responseRef = fixture.store.add(response.responseSetId, response);

  const invocation = structuredClone(fixture.invocation);
  invocation.invocationId = `${invocation.invocationId}-resume-${activeStage}`;
  invocation.runId = `${invocation.runId}-resume-${activeStage}`;
  invocation.inputs["clarification-request"] = [
    structuredClone(requestRef),
  ];
  invocation.inputs["clarification-responses"] = [
    structuredClone(responseRef),
  ];
  invocation.inputs.continuation = [structuredClone(continuationRef)];
  fixture.calls.length = 0;

  return {
    checkpointStore,
    continuationRef,
    fixture,
    invocation,
    request,
  };
}

test("portable continuation resumes at modeler from validated source checkpoints", async () => {
  const prepared = await preparePausedResume("modeler");
  const result = await prepared.fixture.registry.execute(
    prepared.invocation,
    {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    },
  );

  assert.equal(result.outcome, "baseline_drafted");
  assert.deepEqual(prepared.fixture.calls, ["structurizr", "madr"]);
});

test("portable continuation restores both prior handoffs from source checkpoints", async () => {
  const prepared = await preparePausedResume("decision-recorder");
  const result = await prepared.fixture.registry.execute(
    prepared.invocation,
    {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    },
  );

  assert.equal(result.outcome, "baseline_drafted");
  assert.deepEqual(prepared.fixture.calls, ["madr"]);
});

test("portable continuation rejects a missing source checkpoint before adapters", async () => {
  const prepared = await preparePausedResume("modeler");
  const continuation = JSON.parse(
    (
      await prepared.fixture.store.artifacts.load(prepared.continuationRef)
    ).toString("utf8"),
  );
  const sourceDigest = continuation.completedStages[0].stepInvocationDigest;
  for (const [key, value] of prepared.checkpointStore.values) {
    if (value.stepInvocationDigest === sourceDigest) {
      prepared.checkpointStore.values.delete(key);
    }
  }

  await assert.rejects(
    prepared.fixture.registry.execute(prepared.invocation, {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    }),
    (error) => error instanceof ContractError && error.code === "DR2212",
  );
  assert.deepEqual(prepared.fixture.calls, []);
});


test("a discovery prerequisite blocks ArchitectureDesign execution before adapters", async () => {
  const fixture = await runtimeFixture();
  const repositoryRef = fixture.store.add(
    "repository-snapshot-prerequisite-runtime",
    repositorySnapshotFixture,
  );
  const state = structuredClone(stateFixture);
  state.stateId = "project-architecture-state-prerequisite-runtime";
  state.state = "existing-undiscovered";
  state.projectLifecycle = "existing";
  state.projectContext = structuredClone(
    fixture.invocation.inputs["project-context"][0],
  );
  state.requirementsBaseline = structuredClone(
    fixture.invocation.inputs["requirements-baseline"][0],
  );
  state.repositorySnapshot = structuredClone(repositoryRef);
  const stateRef = fixture.store.add(state.stateId, state);
  const decision = await fixture.registry.selectOperation(
    {
      id: "architecture-design",
      version: "0.1.0",
    },
    stateRef,
    { artifacts: fixture.store.artifacts },
  );
  assert.equal(decision.selection.kind, "prerequisite");
  const decisionRef = fixture.store.add(
    "module-route-decision-prerequisite-runtime",
    decision,
  );
  const invocation = structuredClone(fixture.invocation);
  invocation.inputs["project-architecture-state"] = [stateRef];
  invocation.inputs["routing-decision"] = [decisionRef];
  invocation.inputs["repository-snapshot"] = [repositoryRef];

  await assert.rejects(
    fixture.registry.execute(invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2016",
  );
  assert.deepEqual(fixture.calls, []);
});


test("portable resume rejects changed adapter lineage before any step runs", async () => {
  const prepared = await preparePausedResume("modeler");
  prepared.invocation.adapters[1].config.toolVersion =
    "changed-after-continuation";

  await assert.rejects(
    prepared.fixture.registry.execute(prepared.invocation, {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    }),
    (error) => error instanceof ContractError && error.code === "DR2210",
  );
  assert.deepEqual(prepared.fixture.calls, []);
});

test("portable resume rejects a forged completed-step plug-in", async () => {
  const prepared = await preparePausedResume("modeler");
  const continuation = JSON.parse(
    (
      await prepared.fixture.store.artifacts.load(prepared.continuationRef)
    ).toString("utf8"),
  );
  continuation.completedStages[0].plugin.id = "forged-designer";
  prepared.invocation.inputs.continuation = [
    prepared.fixture.store.add(continuation.continuationId, continuation),
  ];

  await assert.rejects(
    prepared.fixture.registry.execute(prepared.invocation, {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    }),
    (error) => error instanceof ContractError && error.code === "DR2211",
  );
  assert.deepEqual(prepared.fixture.calls, []);
});
