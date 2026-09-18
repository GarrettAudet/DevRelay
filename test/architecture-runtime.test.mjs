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
import { validateArchitectureGatePromotion } from "../src/architecture-gate.mjs";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalArchitectureGate } from "../src/local-architecture-gate.mjs";
import { activateLocalArchitectureGate, verifyLocalArchitectureActivation } from "../src/local-architecture-activation.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { assertLocalArchitectureCurrentState, localArchitectureHeadId } from "../src/local-discovery-activation.mjs";
import { createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { architectureTraceabilityContributor, createArchitectureActivationTraceabilityContributor } from "../src/architecture-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import { prepareLocalContractPlanning, verifyLocalContractPlanning } from "../src/local-contract-planning.mjs";
import { executeLocalContractPlanning, verifyLocalContractExecution } from "../src/local-contract-execution.mjs";
import { localContractHeadId, activateLocalContractsNotApplicable, verifyLocalContractsNotApplicableActivation } from "../src/local-contract-activation.mjs";
import { prepareLocalContractsNotApplicable, verifyLocalContractsNotApplicable, createContractsNotApplicableTraceContext } from "../src/local-contract-not-applicable.mjs";
import { createContractNotApplicableTraceabilityContributor } from "../src/contract-traceability-contributor.mjs";
import { prepareLocalWorkBreakdownState, prepareLocalWorkBreakdownRoute } from "../src/local-work-breakdown-planning.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../src/work-breakdown-runtime-contracts.mjs";
import { createLocalWorkBreakdownContext, materializeLocalWorkBreakdownContext, verifyLocalWorkBreakdownContext, assertLocalWorkContextCurrent } from "../src/local-work-breakdown-context.mjs";
import { createSessionContextSnapshot, executeSessionBootstrap } from "../src/session-bootstrap.mjs";

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

test("ArchitectureGate recognizes the released baseline_drafted outcome but still requires owner approval", async () => {
  const fixture = await runtimeFixture();
  const context = { artifacts: fixture.store.artifacts, checkpoints: checkpoints() };
  await fixture.registry.execute(fixture.invocation, context);
  const checkpointReplay = await fixture.registry.verifyCheckpointedExecution(fixture.invocation, context);
  assert.equal(checkpointReplay.moduleResult.outcome, "baseline_drafted");
  await assert.rejects(validateArchitectureGatePromotion({ checkpointReplay }), /owner approval/);
  await assert.rejects(validateArchitectureGatePromotion({ checkpointReplay: structuredClone(checkpointReplay) }), /receipt|checkpoint/i);
});

for (const interruption of ["before", "after"]) test(`Architecture activation recovers ${interruption} graph merge without rerunning design`, async t => {
  const disposition = section => {
    for (const intent of section.content.interfaces) intent.contractGeneration = {
      required: interruption === "before", suggestedKinds: interruption === "before" ? ["json-schema"] : [],
    };
  };
  const fixture = await runtimeFixture({ mutateDesigner: value => disposition(value.interfaceIntent),
    mutateDraft: value => disposition(value.sections.interfaceIntent) });
  const context = { artifacts: fixture.store.artifacts, checkpoints: checkpoints() };
  await fixture.registry.execute(fixture.invocation, context);
  const checkpointReplay = await fixture.registry.verifyCheckpointedExecution(fixture.invocation, context);
  const draft = checkpointReplay.loadedOutputs["architecture-draft"][0].value;
  const raw = (id, value, schema, mediaType = "application/json") => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    fixture.store.addBytes(id, bytes);
    return { artifactId: id, schema, mediaType, digest: sha256Digest(bytes), uri: `fixture://activation/${id}` };
  };
  const review = raw("activation-review", "Synthetic review only", "https://devrelay.dev/evidence/architecture-gate-review/v1", "text/markdown");
  const evidence = raw("activation-test", "Synthetic evidence only", "https://devrelay.dev/evidence/test/v1", "text/markdown");
  const owner = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureGateOwnerApproval", approvalId: "activation-owner",
    authority: "project-owner", decision: "approve", policyVersion: "architecture-gate/0.1.0", candidate: fixture.draftRef,
    gateReview: review, requiredEvidence: [evidence], repositoryRevision: "fixture-greenfield" };
  const ownerApprovalRef = raw(owner.approvalId, owner, "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1", "application/vnd.devrelay.architecture-gate-owner-approval+json");
  const sections = structuredClone(draft.sections);
  for (const decision of sections.decisionRecords.content.decisions) if (decision.status === "proposed") decision.status = "accepted";
  const baseline = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureBaseline", baselineId: "activation-baseline",
    approvedDraft: fixture.draftRef, requirementsBaseline: draft.requirementsBaseline, projectOverviewBaseline: draft.projectOverviewBaseline,
    projectContext: draft.projectContext, sections, approvalPolicyVersion: owner.policyVersion,
    approvalEvidence: [review, evidence, ownerApprovalRef], sourceRefs: draft.sourceRefs };
  const baselineRef = fixture.store.add(baseline.baselineId, baseline);
  const loadArtifact = fixture.store.artifacts.load;
  const record = await prepareLocalArchitectureGate({ checkpointReplay, ownerApprovalRef, baselineRef, loadArtifact });
  const directory = mkdtempSync(join(tmpdir(), "devrelay-activation-recovery-"));
  let storage = createLocalHostStorage({ rootDirectory: directory });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  const makeGraph = () => createTraceabilityGraphService({ projectId: "activation-fixture", graphId: "activation-fixture-graph",
    store: createLocalHostTraceabilityStore({ storage, namespace: "activation-fixture/graph", graphId: "activation-fixture-graph" }),
    contributors: [requirementsBaselineObserverContributor, architectureTraceabilityContributor, createArchitectureActivationTraceabilityContributor(), createContractNotApplicableTraceabilityContributor()] });
  let graph = makeGraph();
  const namespace = "architecture-recovery-fixture";
  let merges = 0;
  let exactPrepared;
  const interrupted = { ...graph, async mergePrepared(prepared) {
    exactPrepared = prepared.checkpoint;
    assert.deepEqual(createLocalHostCheckpointStore({ storage, namespace }).get(`architecture-activation:${record.commitDigest}`), exactPrepared,
      "prepared graph update must be durable before any merge attempt");
    if (interruption === "after") { merges++; await graph.mergePrepared(prepared); }
    throw new Error("fixture activation interruption");
  } };
  const request = () => ({ storage, namespace, graph, checkpointReplay, record, loadArtifact });
  await assert.rejects(activateLocalArchitectureGate({ ...request(), graph: interrupted }), /fixture activation interruption/);
  assert.throws(() => assertLocalArchitectureCurrentState({ storage, namespace, state: fixture.stateRef }), /needs recovery/);
  assert.equal(storage.readRun(localArchitectureHeadId(namespace)).state.pendingCommit, record.commitDigest);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory: directory });
  graph = makeGraph();
  let noMerge = { ...graph, mergePrepared() { merges++; throw new Error("recovery must reuse applied graph"); } };
  const recoverGraph = interruption === "after" ? noMerge : { ...graph, async mergePrepared(prepared) {
    assert.deepEqual(prepared.checkpoint, exactPrepared, "recovery must not select a new prepared graph update");
    merges++; return graph.mergePrepared(prepared);
  } };
  const activation = await activateLocalArchitectureGate({ ...request(), graph: recoverGraph });
  assert.equal(merges, 1);
  assert.deepEqual(await verifyLocalArchitectureActivation(request()), activation);
  const head = storage.readRun(localArchitectureHeadId(namespace));
  assert.equal(head.state.pendingCommit, null);
  assert.deepEqual(head.state.state, activation.state);
  assert.deepEqual(await activateLocalArchitectureGate({ ...request(), graph: noMerge }), activation);
  assert.deepEqual(storage.readRun(localArchitectureHeadId(namespace)), head);
  const planning = await prepareLocalContractPlanning(request());
  const contractState = JSON.parse(Buffer.from(planning.state.bytesBase64, "base64"));
  assert.deepEqual(contractState.architectureBaseline, baselineRef);
  assert.deepEqual(contractState.projectOverviewBaseline, draft.projectOverviewBaseline);
  assert.equal(planning.scope, "contract-planning-candidate");
  assert.equal(planning.lifecycleComplete, false);
  assert.equal(planning.route.kind, interruption === "before" ? "module" : "gate");
  if (planning.route.kind === "gate") assert.equal(planning.route.branch, "approve-not-applicable");
  else assert.equal(planning.route.operation, "establish-contracts");
  assert.deepEqual(await prepareLocalContractPlanning(request()), planning);
  assert.deepEqual(storage.readRun(localArchitectureHeadId(namespace)), head, "planning is read-only");
  const bindings = [{ contractKind: "json-schema", id: "json-schema-contract-generator", version: "0.1.0" }];
  const executionRequest = { ...request(), planning, bindings, executionId: "CG-LOCAL-ACTIVATION-FIXTURE" };
  let notApplicable;
  await assert.rejects(executeLocalContractPlanning({ ...executionRequest, bindings: [] }), /explicit supported pinned/);
  if (planning.route.kind === "module") {
    await assert.rejects(prepareLocalContractsNotApplicable({ ...request(), planning }), /zero-intent planning/);
    const execution = await executeLocalContractPlanning(executionRequest);
    assert.equal(execution.replayed, false);
    assert.ok(execution.candidateRef);
    storage.close();
    storage = createLocalHostStorage({ rootDirectory: directory });
    graph = makeGraph();
    noMerge = { ...graph, mergePrepared() { merges++; throw new Error("recovery must reuse applied graph"); } };
    const replay = await executeLocalContractPlanning({ ...executionRequest, ...request() });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.candidateRef, execution.candidateRef);
    const receipt = await verifyLocalContractExecution({ storage, namespace, bindings,
      executionId: execution.executionId, executionFingerprint: execution.executionFingerprint });
    assert.equal(receipt.kind, "VerifiedContractGenerationCheckpointReplayReceipt");
    storage.initializeRun({ runId: localContractHeadId(namespace), state: { kind: "LocalContractHead",
      state: planning.state.ref, activationDigest: null, pendingCommit: sha256Digest(Buffer.from("fixture-pending-contract-gate")) } });
    await assert.rejects(executeLocalContractPlanning({ ...executionRequest, ...request(), executionId: "CG-BLOCKED-WHILE-PENDING" }), /activation needs recovery/);
    assert.equal((await executeLocalContractPlanning({ ...executionRequest, ...request() })).replayed, true,
      "existing checkpoint replay must not become a new generator call while activation is pending");
    await assert.rejects(verifyLocalContractExecution({ storage, namespace, bindings,
      executionId: execution.executionId, executionFingerprint: sha256Digest(Buffer.from("wrong-fingerprint")) }), /checkpoint does not match the exact execution/);
  } else {
    await assert.rejects(executeLocalContractPlanning(executionRequest), /requires ContractGate/);
    const approvalRef = raw("ANA-LOCAL-CONTRACTS", { apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable",
      approvalId: "ANA-LOCAL-CONTRACTS", purpose: "contract-disposition", rationale: "Synthetic approval fixture for zero required contract intents.",
      authority: { id: "fixture-owner", role: "human-approver" }, approvalEvidence: [evidence] },
    "https://devrelay.dev/artifacts/approved-not-applicable/v1", "application/vnd.devrelay.approved-not-applicable+json");
    notApplicable = await prepareLocalContractsNotApplicable({ ...request(), planning, approvalRef });
    assert.equal(notApplicable.scope, "validated-contract-not-applicable");
    assert.equal(notApplicable.lifecycleComplete, false);
    assert.deepEqual(await verifyLocalContractsNotApplicable({ ...request(), planning, commit: notApplicable }), notApplicable);
    const trace = await createContractsNotApplicableTraceContext({ ...request(), planning, commit: notApplicable });
    assert.deepEqual(trace.invocation, request().checkpointReplay.invocation,
      "a no-contract Gate must not invent a generator invocation");
    const contributor = createContractNotApplicableTraceabilityContributor();
    assert.equal(contributor.match(trace), true);
    const projection = await contributor.project(trace);
    assert.deepEqual(projection.nodes, []);
    assert.deepEqual(projection.edges, []);
    await assert.rejects(createContractsNotApplicableTraceContext({ ...request(), planning,
      commit: { ...notApplicable, planningDigest: sha256Digest(Buffer.from("substituted-planning")) } }), /differs/);
    const naRequest = () => ({ ...request(), planning, commit: notApplicable });
    let naMerges = 0;
    const interruptedNa = { ...graph, async mergePrepared(prepared) {
      assert.deepEqual(createLocalHostCheckpointStore({ storage, namespace }).get(`contract-activation:${notApplicable.commitDigest}`), prepared.checkpoint);
      naMerges++;
      await graph.mergePrepared(prepared);
      throw new Error("fixture NA interruption after merge");
    } };
    await assert.rejects(activateLocalContractsNotApplicable({ ...naRequest(), graph: interruptedNa }), /NA interruption/);
    assert.equal(storage.readRun(localContractHeadId(namespace)).state.pendingCommit, notApplicable.commitDigest);
    storage.close();
    storage = createLocalHostStorage({ rootDirectory: directory });
    graph = makeGraph();
    noMerge = { ...graph, mergePrepared() { throw new Error("recovery must reuse applied graph"); } };
    const naActivation = await activateLocalContractsNotApplicable({ ...naRequest(), graph: noMerge });
    assert.equal(naMerges, 1);
    assert.equal(JSON.parse(storage.getArtifact(naActivation.storedState)).state, "not-applicable");
    assert.deepEqual(await verifyLocalContractsNotApplicableActivation(naRequest()), naActivation);
    const naHead = storage.readRun(localContractHeadId(namespace));
    assert.deepEqual(await activateLocalContractsNotApplicable({ ...naRequest(), graph: noMerge }), naActivation);
    assert.deepEqual(storage.readRun(localContractHeadId(namespace)), naHead);
    const capabilityCatalog = raw("CC-LOCAL", { apiVersion: "devrelay.dev/v1alpha1", kind: "CapabilityCatalog", catalogId: "CC-LOCAL", version: "1.0.0",
      capabilities: [{ id: "CAP-CODE", name: "Code", type: "code", description: "Synthetic code capability", providerNeutral: true }] },
    "https://devrelay.dev/artifacts/capability-catalog/v1", "application/vnd.devrelay.capability-catalog+json");
    const repositoryContext = raw("ANA-REPOSITORY", { apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable", approvalId: "ANA-REPOSITORY",
      purpose: "repository-context", rationale: "Synthetic greenfield fixture", authority: { id: "fixture-owner", role: "human-approver" }, approvalEvidence: [evidence] },
    "https://devrelay.dev/artifacts/approved-not-applicable/v1", "application/vnd.devrelay.approved-not-applicable+json");
    const workRequest = { ...request(), planning, notApplicableCommit: notApplicable, capabilityCatalog, repositoryContext };
    const workState = await prepareLocalWorkBreakdownState(workRequest);
    assert.equal(JSON.parse(workState.bytes).state, "unbaselined");
    assert.deepEqual(JSON.parse(workState.bytes).contractDisposition, notApplicable.disposition.ref);
    await assert.rejects(prepareLocalWorkBreakdownState({ ...workRequest, contractGate: {} }), /exactly one/);
    await assert.rejects(prepareLocalWorkBreakdownState({ ...workRequest, capabilityCatalog: undefined }), /explicit capability/);
    await assert.rejects(prepareLocalWorkBreakdownState({ ...workRequest, contractReplayReceipt: {} }), /cannot carry a generator/);
    await assert.rejects(prepareLocalWorkBreakdownState({ ...workRequest,
      capabilityCatalog: { ...capabilityCatalog, digest: sha256Digest(Buffer.from("wrong catalog bytes")) } }), error => error.code === "DR2103");
    const workRegistry = createModuleRegistry({ modules: [JSON.parse(await readFile(new URL("../examples/modules/work-breakdown.module.json", import.meta.url), "utf8"))],
      plugins: [], artifactContracts: workBreakdownRuntimeArtifactContracts() });
    const workRoute = await prepareLocalWorkBreakdownRoute({ ...workRequest, registry: workRegistry });
    assert.deepEqual(workRoute.state, workState);
    assert.equal(workRoute.route.selection.operation, "establish-breakdown");
    const contextRef = raw("work-context-fixture", "Synthetic memory context", "https://example.test/context/v1", "text/plain");
    const priorSnapshot = createSessionContextSnapshot({ projectId: "activation-fixture", taskId: "work-handoff", workspaceId: "fixture-workspace",
      repositoryRevision: "0".repeat(40), createdAt: "2026-09-14T00:00:00Z", roadmapDisposition: "RoadmapNotInitialized",
      bindings: [...["project-memory-baseline", "current-synopsis", "traceability-context", "lifecycle-status", "ready-frontier", "project-overview-projection"].map(role => ({ role, artifact: contextRef, artifactVersion: "fixture" })),
        { role: "requirements-baseline", artifact: baseline.requirementsBaseline, artifactVersion: "1.0.0" },
        { role: "project-overview", artifact: baseline.projectOverviewBaseline, artifactVersion: "1.0.0" }] });
    const priorReceipt = await executeSessionBootstrap({ snapshot: priorSnapshot, artifactResolver: loadArtifact,
      expectedProjectId: priorSnapshot.projectId, expectedTaskId: priorSnapshot.taskId, expectedWorkspaceId: priorSnapshot.workspaceId, expectedRepositoryRevision: priorSnapshot.repositoryRevision });
    const handoff = await createLocalWorkBreakdownContext({ ...workRequest, registry: workRegistry, priorSnapshot, priorReceipt, createdAt: "2026-09-14T01:00:00Z" });
    assert.equal(handoff.files.length, 7);
    assert.deepEqual(handoff.state, workState.ref);
    assert.deepEqual(handoff.snapshot.bindings.find(entry => entry.role === "project-memory-baseline").artifact, contextRef);
    assert.equal(handoff.snapshot.bindings.some(entry => entry.role === "ready-frontier"), false);
    assert.ok(handoff.invalidatedBindings.some(entry => entry.role === "ready-frontier"));
    const boundaryRef = handoff.snapshot.bindings.find(entry => entry.role === "lifecycle-status").artifact;
    const boundary = JSON.parse(Buffer.from(handoff.files.find(entry => entry.ref.artifactId === boundaryRef.artifactId).bytesBase64, "base64"));
    const startGuard = { storage, namespace, boundary, state: handoff.state };
    assert.doesNotThrow(() => assertLocalWorkContextCurrent(startGuard));
    assert.throws(() => assertLocalWorkContextCurrent({ ...startGuard, state: { ...handoff.state, artifactId: "substituted" } }), /session boundary/);
    assert.throws(() => assertLocalWorkContextCurrent({ ...startGuard, namespace: "missing-heads" }));
    const descriptor = { path: "fixture.json", digest: contextRef.digest };
    const configuration = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLocalHostConfiguration", projectId: priorSnapshot.projectId,
      taskId: priorSnapshot.taskId, workspaceRoot: directory, stateDirectory: "published", graphId: "fixture-graph",
      sessionSnapshot: descriptor, memoryManifest: "fixture-memory.json", memorySessionState: descriptor,
      contractSet: "architecture", modules: [descriptor], plugins: [descriptor], artifacts: [], grants: [] };
    const resolvePath = relative => {
      assert.ok(relative.startsWith("published"));
      assert.equal(relative.includes(".."), false);
      return join(directory, relative);
    };
    const publicationArgs = { configuration, handoff, resolvePath };
    const published = materializeLocalWorkBreakdownContext(publicationArgs);
    const publishedConfiguration = JSON.parse(readFileSync(published.configurationPath));
    assert.equal(publishedConfiguration.contractSet, "work-breakdown");
    assert.ok(publishedConfiguration.artifacts.every(entry => existsSync(resolvePath(entry.path))));
    assert.deepEqual(materializeLocalWorkBreakdownContext(publicationArgs), published);
    assert.deepEqual(materializeLocalWorkBreakdownContext({ ...publicationArgs, verifyOnly: true,
      resolvePath: (relative, capability) => { assert.equal(capability, "filesystem.read"); return resolvePath(relative); } }), published);
    assert.throws(() => materializeLocalWorkBreakdownContext({ ...publicationArgs, handoff: { ...handoff, lifecycleComplete: true } }), /drifted/);
    const contractLease = storage.acquireLease({ runId: localContractHeadId(namespace), owner: "fixture-next-contract", expectedVersion: naHead.version });
    storage.commitTransition({ runId: localContractHeadId(namespace), expectedVersion: naHead.version, leaseToken: contractLease.token,
      transition: { kind: "FixturePendingContract" }, nextState: { ...naHead.state, pendingCommit: sha256Digest(Buffer.from("next contract")) } });
    storage.releaseLease({ runId: localContractHeadId(namespace), leaseToken: contractLease.token });
    await assert.rejects(prepareLocalWorkBreakdownState(workRequest), /activation needs recovery/);
    assert.throws(() => assertLocalWorkContextCurrent(startGuard), /activation needs recovery/);
    const historicHead = storage.readRun(localContractHeadId(namespace));
    const historicalArgs = { ...workRequest, registry: workRegistry, priorSnapshot, priorReceipt, handoff };
    assert.deepEqual(await verifyLocalWorkBreakdownContext(historicalArgs), handoff);
    assert.deepEqual(storage.readRun(localContractHeadId(namespace)), historicHead);
    await assert.rejects(verifyLocalWorkBreakdownContext({ ...historicalArgs, handoff: { ...handoff, handoffDigest: sha256Digest(Buffer.from("wrong handoff")) } }), /differs/);
  }
  const headId = localArchitectureHeadId(namespace);
  const lease = storage.acquireLease({ runId: headId, owner: "fixture-later-gate", expectedVersion: head.version });
  storage.commitTransition({ runId: headId, expectedVersion: head.version, leaseToken: lease.token,
    transition: { kind: "FixtureLaterState" }, nextState: { ...head.state,
      state: { ...activation.state, artifactId: "fixture-later-approved-state" } } });
  storage.releaseLease({ runId: headId, leaseToken: lease.token });
  const laterHead = storage.readRun(headId);
  assert.deepEqual(await activateLocalArchitectureGate({ ...request(), graph: noMerge }), activation);
  assert.deepEqual(storage.readRun(headId), laterHead, "historical replay must not roll back or touch a later head");
  await assert.rejects(prepareLocalContractPlanning(request()), /stale|substituted/);
  assert.deepEqual(await verifyLocalContractPlanning({ ...request(), planning }), planning);
  if (notApplicable) {
    assert.deepEqual(await verifyLocalContractsNotApplicable({ ...request(), planning, commit: notApplicable }), notApplicable);
    await assert.rejects(prepareLocalContractsNotApplicable({ ...request(), planning, approvalRef: notApplicable.approval.ref }), /stale|substituted/);
  }
  await assert.rejects(verifyLocalContractPlanning({ ...request(), planning: { ...planning, planningDigest: sha256Digest(Buffer.from("substituted")) } }), /differs/);
  assert.deepEqual(fixture.calls, ["spec-kit-plan", "structurizr", "madr"]);
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
