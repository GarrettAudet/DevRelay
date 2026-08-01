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
import {
  alignArchitectureRequirements,
  augmentArchitectureArtifactOverview,
  createProjectOverviewBaselineFixture,
} from "./architecture-project-overview-fixtures.mjs";
import { registerArchitectureNativeBytes } from "./native-architecture-fixtures.mjs";

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
  readJson("examples/artifacts/requirements-baseline-001.json"),
  readJson("examples/artifacts/project-context-001.json"),
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
  ProjectOverviewBaseline:
    "application/vnd.devrelay.project-overview-baseline+json",
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
  ProjectOverviewBaseline:
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
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
  artifact.baseInputs = Object.entries(refs).map(([role, artifact]) => ({
    role,
    artifact: structuredClone(artifact),
  }));
}

async function runtimeFixture({
  pauseAt,
  pauseSequence,
  mutateClarification,
  mutateDesigner,
  mutateModeler,
  mutateDraft,
} = {}) {
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
  const pauseQueue = [...(pauseSequence ?? (pauseAt ? [pauseAt] : []))];
  const shouldPause = (stage) => {
    if (pauseQueue[0] !== stage) {
      return false;
    }
    pauseQueue.shift();
    return true;
  };
  const adapters = {
    "spec-kit-plan": {
      async invoke(stepInvocation) {
        calls.push("spec-kit-plan");
        if (shouldPause("designer")) {
          return stepTerminal(
            stepInvocation,
            clarificationModuleResult(stepInvocation),
          );
        }
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
      plugin: structuredClone(stepInvocation.plugin),
      stepInvocationDigest: stepInvocation.stepInvocationDigest,
    };
    continuation.completedStages = stepInvocation.priorResults.map(
      (result) => ({
        step: result.step,
        plugin: structuredClone(result.plugin),
        sourceInvocation: structuredClone(result.sourceInvocation),
        outputs: structuredClone(result.outputs),
        stepInvocationDigest: result.stepInvocationDigest,
        stepResultDigest: result.digest,
      }),
    );
    mutateClarification?.({ request, continuation, stepInvocation });
    const requestRef = store.add(request.requestSetId, request);
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
    "project-overview-baseline",
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

async function resumeInvocationFor({
  fixture,
  sourceInvocation,
  sourceResult,
  activeStage,
}) {
  assert.equal(sourceResult.outcome, "needs_clarification");
  const requestRef = sourceResult.outputs["clarification-requests"][0];
  const continuationRef = sourceResult.outputs.continuation[0];
  const request = JSON.parse(
    (await fixture.store.artifacts.load(requestRef)).toString("utf8"),
  );

  const response = structuredClone(clarificationResponseFixture);
  response.responseSetId =
    `architecture-clarification-response-${activeStage}-${sourceInvocation.invocationId}`;
  response.operation = sourceInvocation.module.operation;
  response.activeStage = activeStage;
  response.request = structuredClone(requestRef);
  const responseRef = fixture.store.add(response.responseSetId, response);

  const invocation = structuredClone(sourceInvocation);
  invocation.invocationId =
    `${sourceInvocation.invocationId}-resume-${activeStage}`;
  invocation.runId = `${sourceInvocation.runId}-resume-${activeStage}`;
  invocation.inputs["clarification-request"] = [
    structuredClone(requestRef),
  ];
  invocation.inputs["clarification-responses"] = [
    structuredClone(responseRef),
  ];
  invocation.inputs.continuation = [structuredClone(continuationRef)];
  return {
    continuationRef,
    invocation,
    request,
  };
}

async function preparePausedResume(activeStage) {
  const fixture = await runtimeFixture({ pauseAt: activeStage });
  const checkpointStore = checkpoints();
  const sourceResult = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  const resumed = await resumeInvocationFor({
    fixture,
    sourceInvocation: fixture.invocation,
    sourceResult,
    activeStage,
  });
  fixture.calls.length = 0;
  return {
    checkpointStore,
    fixture,
    ...resumed,
  };
}

test("portable continuation resumes at designer only with its terminal source checkpoint", async () => {
  const prepared = await preparePausedResume("designer");
  const result = await prepared.fixture.registry.execute(
    prepared.invocation,
    {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: prepared.checkpointStore,
    },
  );

  assert.equal(result.outcome, "baseline_drafted");
  assert.deepEqual(
    prepared.fixture.calls,
    ["spec-kit-plan", "structurizr", "madr"],
  );
});

test("a fabricated designer-stage triad cannot resume from a fresh checkpoint store", async () => {
  const prepared = await preparePausedResume("designer");
  const continuation = JSON.parse(
    (
      await prepared.fixture.store.artifacts.load(
        prepared.continuationRef,
      )
    ).toString("utf8"),
  );
  continuation.continuationId =
    "architecture-continuation-fabricated-designer";
  continuation.sourceInvocation = {
    invocationId: "never-executed-invocation",
    invocationFingerprint: `sha256:${"f".repeat(64)}`,
    plugin: {
      id: "spec-kit-plan",
      version: "0.1.0",
    },
    stepInvocationDigest: `sha256:${"e".repeat(64)}`,
  };
  const fabricatedRef = prepared.fixture.store.add(
    continuation.continuationId,
    continuation,
  );
  prepared.invocation.inputs.continuation = [
    structuredClone(fabricatedRef),
  ];

  await assert.rejects(
    prepared.fixture.registry.execute(prepared.invocation, {
      artifacts: prepared.fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(prepared.fixture.calls, []);
});

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

test("multi-generation continuation restores checkpoints from their exact source invocations", async () => {
  const fixture = await runtimeFixture({
    pauseSequence: ["modeler", "decision-recorder"],
  });
  const checkpointStore = checkpoints();

  const resultA = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  const resumeB = await resumeInvocationFor({
    fixture,
    sourceInvocation: fixture.invocation,
    sourceResult: resultA,
    activeStage: "modeler",
  });
  fixture.calls.length = 0;

  const resultB = await fixture.registry.execute(resumeB.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  assert.equal(resultB.outcome, "needs_clarification");
  assert.deepEqual(fixture.calls, ["structurizr", "madr"]);
  const resumeC = await resumeInvocationFor({
    fixture,
    sourceInvocation: resumeB.invocation,
    sourceResult: resultB,
    activeStage: "decision-recorder",
  });
  fixture.calls.length = 0;

  const resultC = await fixture.registry.execute(resumeC.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  assert.equal(resultC.outcome, "baseline_drafted");
  assert.deepEqual(fixture.calls, ["madr"]);
});

test("clarification output binds the exact terminal step plug-in and digest", async (t) => {
  for (const [name, mutateSource] of [
    [
      "plugin",
      (sourceInvocation) => {
        sourceInvocation.plugin = {
          id: "forged-designer",
          version: "0.1.0",
        };
      },
    ],
    [
      "step digest",
      (sourceInvocation) => {
        sourceInvocation.stepInvocationDigest =
          `sha256:${"f".repeat(64)}`;
      },
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await runtimeFixture({
        pauseAt: "designer",
        mutateClarification({ continuation }) {
          mutateSource(continuation.sourceInvocation);
        },
      });
      const checkpointStore = checkpoints();
      await assert.rejects(
        fixture.registry.execute(fixture.invocation, {
          artifacts: fixture.store.artifacts,
          checkpoints: checkpointStore,
        }),
        (error) =>
          error instanceof ContractError && error.code === "DR2104",
      );
      assert.deepEqual(fixture.calls, ["spec-kit-plan"]);
      assert.equal(checkpointStore.values.size, 0);
    });
  }
});

test("clarification request and continuation are validated atomically on output", async () => {
  const fixture = await runtimeFixture({
    pauseAt: "modeler",
    mutateClarification({ request }) {
      request.questions[0].id = "Q-MISMATCH";
    },
  });
  const checkpointStore = checkpoints();
  await assert.rejects(
    fixture.registry.execute(fixture.invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpointStore,
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(fixture.calls, ["spec-kit-plan", "structurizr"]);
  assert.equal(checkpointStore.values.size, 1);
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


test("architecture source references close over exact inputs, handoffs, and native bytes", async () => {
  let exactDesignerSources;
  const fixture = await runtimeFixture({
    mutateDesigner(designer) {
      exactDesignerSources = [
        {
          role: "requirements-baseline",
          artifact: structuredClone(
            designer.baseInputs.find(({ role }) => role === "requirements-baseline").artifact,
          ),
        },
        {
          role: "technical-design-source",
          artifact: structuredClone(
            designer.nativeArtifacts.content.entries[0].artifact,
          ),
        },
      ];
      designer.sourceRefs = structuredClone(exactDesignerSources);
    },
    mutateModeler(modeler) {
      modeler.sourceRefs = [
        {
          role: "designer-handoff",
          artifact: structuredClone(modeler.designerWorkingArtifact),
        },
      ];
    },
    mutateDraft(draft) {
      draft.sourceRefs = structuredClone(exactDesignerSources);
    },
  });
  const result = await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpoints(),
  });
  assert.equal(result.outcome, "baseline_drafted");
});

test("architecture source references bind roles to exact runtime evidence", async (t) => {
  for (const [name, options, expectedCalls] of [
    [
      "input",
      {
        mutateDesigner(designer) {
          designer.sourceRefs = [
            {
              role: "project-context",
              artifact: structuredClone(
                designer.baseInputs.find(
                  ({ role }) => role === "requirements-baseline",
                ).artifact,
              ),
            },
          ];
        },
      },
      ["spec-kit-plan"],
    ],
    [
      "native artifact",
      {
        mutateDesigner(designer) {
          designer.sourceRefs = [
            {
              role: "structurizr-workspace",
              artifact: structuredClone(
                designer.nativeArtifacts.content.entries[0].artifact,
              ),
            },
          ];
        },
      },
      ["spec-kit-plan"],
    ],
    [
      "prior handoff",
      {
        mutateModeler(modeler) {
          modeler.sourceRefs = [
            {
              role: "modeler-handoff",
              artifact: structuredClone(modeler.designerWorkingArtifact),
            },
          ];
        },
      },
      ["spec-kit-plan", "structurizr"],
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await runtimeFixture(options);
      await assert.rejects(
        fixture.registry.execute(fixture.invocation, {
          artifacts: fixture.store.artifacts,
          checkpoints: checkpoints(),
        }),
        (error) => error instanceof ContractError && error.code === "DR2104",
      );
      assert.deepEqual(fixture.calls, expectedCalls);
    });
  }
});

test("architecture source references reject fabricated evidence", async () => {
  const fixture = await runtimeFixture({
    mutateDesigner(designer) {
      designer.sourceRefs = [
        {
          role: "fabricated",
          artifact: {
            artifactId: "fabricated-architecture-evidence",
            schema: "https://devrelay.dev/native/markdown/v1",
            mediaType: "text/markdown",
            digest: `sha256:${"f".repeat(64)}`,
            uri: "artifact://fabricated/architecture-evidence",
          },
        },
      ];
    },
  });
  await assert.rejects(
    fixture.registry.execute(fixture.invocation, {
      artifacts: fixture.store.artifacts,
      checkpoints: checkpoints(),
    }),
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(fixture.calls, ["spec-kit-plan"]);
});

test("architecture native artifacts require exact bytes and configured tool identity", async (t) => {
  for (const [name, mutateDesigner] of [
    [
      "digest",
      (designer) => {
        designer.nativeArtifacts.content.entries[0].artifact.digest =
          `sha256:${"0".repeat(64)}`;
      },
    ],
    [
      "tool version",
      (designer) => {
        designer.nativeArtifacts.content.entries[0].producedBy.tool.version =
          "unconfigured-version";
      },
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await runtimeFixture({ mutateDesigner });
      await assert.rejects(
        fixture.registry.execute(fixture.invocation, {
          artifacts: fixture.store.artifacts,
          checkpoints: checkpoints(),
        }),
        (error) =>
          error instanceof ContractError &&
          ["DR2102", "DR2103", "DR2104"].includes(error.code),
      );
      assert.deepEqual(fixture.calls, ["spec-kit-plan"]);
    });
  }
});

test("working handoffs reject native evidence owned by another stage", async (t) => {
  for (const [name, options, expectedCalls] of [
    [
      "designer",
      {
        mutateDesigner(designer) {
          const forged = structuredClone(
            designer.nativeArtifacts.content.entries[0],
          );
          forged.id = "NA-FORGED-MODELER-IN-DESIGNER";
          forged.artifact.artifactId = "forged-modeler-in-designer";
          forged.artifact.digest = `sha256:${"e".repeat(64)}`;
          forged.producedBy = {
            stage: "modeler",
            adapterId: "structurizr",
            adapterVersion: "0.1.0",
          };
          designer.nativeArtifacts.content.entries.push(forged);
        },
      },
      ["spec-kit-plan"],
    ],
    [
      "modeler",
      {
        mutateModeler(modeler) {
          const forged = structuredClone(
            modeler.nativeArtifacts.content.entries[0],
          );
          forged.id = "NA-FORGED-DESIGNER-IN-MODELER";
          forged.artifact.artifactId = "forged-designer-in-modeler";
          forged.artifact.digest = `sha256:${"d".repeat(64)}`;
          forged.producedBy = {
            stage: "designer",
            adapterId: "spec-kit-plan",
            adapterVersion: "0.1.0",
          };
          modeler.nativeArtifacts.content.entries.push(forged);
        },
      },
      ["spec-kit-plan", "structurizr"],
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await runtimeFixture(options);
      await assert.rejects(
        fixture.registry.execute(fixture.invocation, {
          artifacts: fixture.store.artifacts,
          checkpoints: checkpoints(),
        }),
        (error) =>
          error instanceof ContractError &&
          ["DR2102", "DR2103", "DR2104"].includes(error.code),
      );
      assert.deepEqual(fixture.calls, expectedCalls);
    });
  }
});

test("terminal candidate rejects forged earlier-stage and discovery native evidence", async (t) => {
  for (const [name, stage, adapterId, adapterVersion] of [
    ["designer", "designer", "spec-kit-plan", "0.1.0"],
    [
      "discovery",
      "discovery",
      "repository-architecture-discovery",
      "0.1.0",
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await runtimeFixture({
        mutateDraft(draft) {
          const forged = structuredClone(
            draft.sections.nativeArtifacts.content.entries[0],
          );
          forged.id = `NA-FORGED-${stage.toUpperCase()}`;
          forged.artifact.artifactId = `forged-${stage}-native`;
          forged.artifact.digest =
            stage === "designer"
              ? `sha256:${"c".repeat(64)}`
              : `sha256:${"b".repeat(64)}`;
          forged.producedBy = {
            stage,
            adapterId,
            adapterVersion,
          };
          draft.sections.nativeArtifacts.content.entries.push(forged);
        },
      });
      await assert.rejects(
        fixture.registry.execute(fixture.invocation, {
          artifacts: fixture.store.artifacts,
          checkpoints: checkpoints(),
        }),
        (error) =>
          error instanceof ContractError &&
          ["DR2102", "DR2103", "DR2104"].includes(error.code),
      );
      assert.deepEqual(
        fixture.calls,
        ["spec-kit-plan", "structurizr", "madr"],
      );
    });
  }
});

test("a discovery prerequisite blocks ArchitectureDesign execution before adapters", async () => {
  const fixture = await runtimeFixture();
  const repositoryRef = fixture.store.add(
    "repository-snapshot-prerequisite-runtime",
    repositorySnapshotFixture,
  );
  const existingProjectContext = structuredClone(projectContextFixture);
  existingProjectContext.lifecycle = "existing";
  const existingProjectContextRef = fixture.store.add(
    "project-context-prerequisite-runtime",
    existingProjectContext,
  );
  const state = structuredClone(stateFixture);
  state.stateId = "project-architecture-state-prerequisite-runtime";
  state.state = "existing-undiscovered";
  state.projectLifecycle = "existing";
  state.projectContext = structuredClone(existingProjectContextRef);
  state.requirementsBaseline = structuredClone(
    fixture.invocation.inputs["requirements-baseline"][0],
  );
  augmentArchitectureArtifactOverview(
    state,
    fixture.invocation.inputs["project-overview-baseline"][0],
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
  invocation.inputs["project-context"] = [existingProjectContextRef];
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
    (error) => error instanceof ContractError && error.code === "DR2104",
  );
  assert.deepEqual(prepared.fixture.calls, []);
});
