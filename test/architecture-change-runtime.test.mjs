import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import {
  ArchitectureGateValidationError,
  validateArchitectureGatePromotion,
} from "../src/architecture-gate.mjs";
import { sha256Digest } from "../src/content-digest.mjs";
import { renderProjectOverviewMarkdownBytes } from "../src/project-overview.mjs";
import { ContractError, createModuleRegistry } from "../src/module-registry.mjs";
import {
  MODULE_ROUTE_DECISION_MEDIA_TYPE,
  MODULE_ROUTE_DECISION_SCHEMA,
} from "../src/operation-router.mjs";
import {
  alignArchitectureChangeDigests,
  alignArchitectureRequirements,
  augmentArchitectureArtifactOverview,
  createProjectOverviewBaselineFixture,
} from "./architecture-project-overview-fixtures.mjs";
import { registerArchitectureNativeBytes } from "./native-architecture-fixtures.mjs";

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
  readJson("examples/artifacts/requirements-baseline-001.json"),
  readJson("examples/artifacts/project-context-001.json"),
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
  ProjectOverviewBaseline:
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
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
  ProjectOverviewBaseline:
    "application/vnd.devrelay.project-overview-baseline+json",
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
  mutateProjectOverview,
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
  const projectOverviewFixture = createProjectOverviewBaselineFixture({
    requirementsBaseline: requirementsFixture,
    requirementsBaselineRef: requirementsRef,
    baselineId: "project-overview-baseline-change-runtime",
  });
  mutateProjectOverview?.(projectOverviewFixture.value);
  if (mutateProjectOverview) {
    projectOverviewFixture.documentBytes =
      renderProjectOverviewMarkdownBytes(
        projectOverviewFixture.value.overview,
      );
    projectOverviewFixture.documentRef.digest = sha256Digest(
      projectOverviewFixture.documentBytes,
    );
  }
  store.addBytes(
    projectOverviewFixture.documentRef.artifactId,
    projectOverviewFixture.documentBytes,
  );
  const projectOverviewRef = store.add(
    projectOverviewFixture.value.baselineId,
    projectOverviewFixture.value,
  );
  const repositoryRef = store.add(
    "repository-snapshot-change-runtime",
    repositorySnapshotFixture,
  );
  const architectureBaseline = structuredClone(baselineFixture);
  alignArchitectureRequirements(architectureBaseline, requirementsFixture);
  architectureBaseline.projectOverviewBaseline = {
    ...structuredClone(projectOverviewRef),
    artifactId: "project-overview-baseline-older-architecture",
    digest: "sha256:" + "7".repeat(64),
    uri: "artifact://architecture-change-runtime/project-overview-baseline-older",
  };
  architectureBaseline.projectContext = structuredClone(projectContextRef);
  architectureBaseline.repositorySnapshot = structuredClone(repositoryRef);
  const baselineRef = store.add(
    architectureBaseline.baselineId,
    architectureBaseline,
  );

  const state = structuredClone(stateFixture);
  state.projectContext = structuredClone(projectContextRef);
  state.requirementsBaseline = structuredClone(requirementsRef);
  augmentArchitectureArtifactOverview(state, projectOverviewRef);
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
    "project-overview-baseline": projectOverviewRef,
    "project-context": projectContextRef,
    "architecture-baseline": baselineRef,
    "repository-snapshot": repositoryRef,
  };

  const changeSet = structuredClone(changeSetFixture);
  alignArchitectureRequirements(changeSet, requirementsFixture);
  augmentArchitectureArtifactOverview(changeSet, projectOverviewRef);
  alignArchitectureChangeDigests(changeSet, architectureBaseline);
  changeSet.projectArchitectureState = structuredClone(stateRef);
  changeSet.baseArchitectureBaseline = structuredClone(baselineRef);
  changeSet.baseArchitectureDigest = baselineRef.digest;
  changeSet.targetRequirementsBaseline = structuredClone(requirementsRef);
  changeSet.projectContext = structuredClone(projectContextRef);
  changeSet.repositorySnapshot = structuredClone(repositoryRef);
  const modelerEntry = nativeEntry(changeSet, "structurizr");
  modelerEntry.producedBy.adapterId = modelerId;

  const designer = structuredClone(designerFixture);
  alignArchitectureRequirements(designer, requirementsFixture);
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
  alignArchitectureRequirements(modeler, requirementsFixture);
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
    "project-overview-baseline": [structuredClone(projectOverviewRef)],
    "project-context": [structuredClone(projectContextRef)],
    "architecture-baseline": [structuredClone(baselineRef)],
    "repository-snapshot": [structuredClone(repositoryRef)],
  };
  invocation.adapters[1].plugin = {
    id: modelerId,
    version: modelerDefinition.metadata.version,
  };

  return {
    architectureBaseline,
    architectureBaselineRef: baselineRef,
    baselineProjectOverviewRef:
      architectureBaseline.projectOverviewBaseline,
    calls,
    changeSet,
    changeSetRef,
    invocation,
    projectOverviewRef,
    repositoryRef,
    requirementsRef,
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
  assert.notEqual(
    fixture.baselineProjectOverviewRef.digest,
    fixture.projectOverviewRef.digest,
    "the base architecture may bind an older overview than the target input",
  );
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


test("design-change rejects a ProjectOverview baseline that is not the exact RequirementsBaseline projection", async () => {
  const fixture = await changeRuntime({
    mutateProjectOverview(projectOverview) {
      projectOverview.overview.purpose.statement +=
        " This statement was not derived from the loaded requirements.";
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

test("design-change rejects stale ProjectOverview refs in state and candidate", async (t) => {
  await t.test("state", async () => {
    const fixture = await changeRuntime({
      mutateState(state) {
        state.projectOverviewBaseline.digest = "sha256:" + "f".repeat(64);
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

  await t.test("candidate", async () => {
    const fixture = await changeRuntime({
      mutateCandidate(candidate) {
        candidate.targetProjectOverviewBaseline.digest =
          "sha256:" + "f".repeat(64);
      },
    });
    await assert.rejects(
      fixture.registry.execute(fixture.invocation, {
        artifacts: fixture.store.artifacts,
        checkpoints: checkpoints(),
      }),
      (error) => error instanceof ContractError && error.code === "DR2104",
    );
    assert.deepEqual(fixture.calls, [
      "openspec-design",
      "structurizr",
      "madr",
    ]);
  });
});
function architectureGateRef(artifactId, schema, mediaType, bytes) {
  return {
    artifactId,
    schema,
    mediaType,
    digest: sha256Digest(bytes),
    uri: `artifact://architecture-gate/${artifactId}`,
  };
}

function architectureGateRequest(fixture, checkpointReplay) {
  const gateReviewBytes = Buffer.from("exact architecture gate review\n", "utf8");
  const gateReview = architectureGateRef(
    "architecture-gate-review-change-runtime",
    "https://devrelay.dev/evidence/architecture-gate-review/v1",
    "text/markdown",
    gateReviewBytes,
  );
  const conformanceBytes = Buffer.from('{"status":"pass"}\n', "utf8");
  const conformance = architectureGateRef(
    "structurizr-proof-change-runtime",
    "https://devrelay.dev/evidence/structurizr-conformance-proof/v1",
    "application/vnd.devrelay.structurizr-conformance-proof+json",
    conformanceBytes,
  );
  const evidenceBytes = new Map([
    [gateReview.artifactId, gateReviewBytes],
    [conformance.artifactId, conformanceBytes],
  ]);
  const evidenceResolver = async (ref) => ({
    ref,
    bytes: evidenceBytes.get(ref.artifactId),
  });

  const ownerApproval = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureGateOwnerApproval",
    approvalId: "architecture-gate-owner-approval-change-runtime",
    authority: "project-owner",
    decision: "approve",
    policyVersion: "architecture-gate/0.1.0",
    candidate: structuredClone(fixture.changeSetRef),
    gateReview,
    requiredEvidence: [conformance],
    repositoryRevision: "fixture-commit",
  };
  const ownerApprovalBytes = Buffer.from(
    `${JSON.stringify(ownerApproval, null, 2)}\n`,
    "utf8",
  );
  const ownerApprovalRef = architectureGateRef(
    ownerApproval.approvalId,
    "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1",
    "application/vnd.devrelay.architecture-gate-owner-approval+json",
    ownerApprovalBytes,
  );
  const sections = structuredClone(fixture.changeSet.sections);
  for (const decision of sections.decisionRecords.content.decisions) {
    if (decision.status === "proposed") decision.status = "accepted";
  }
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureBaseline",
    baselineId: "architecture-baseline-change-runtime-v2",
    approvedDraft: structuredClone(fixture.changeSetRef),
    requirementsBaseline: structuredClone(
      fixture.changeSet.targetRequirementsBaseline,
    ),
    projectOverviewBaseline: structuredClone(
      fixture.changeSet.targetProjectOverviewBaseline,
    ),
    projectContext: structuredClone(fixture.changeSet.projectContext),
    repositorySnapshot: structuredClone(
      fixture.changeSet.repositorySnapshot,
    ),
    sections,
    approvalPolicyVersion: ownerApproval.policyVersion,
    approvalEvidence: [gateReview, conformance, ownerApprovalRef],
    sourceRefs: structuredClone(fixture.changeSet.sourceRefs),
  };
  const baselineBytes = Buffer.from(
    `${JSON.stringify(baseline, null, 2)}\n`,
    "utf8",
  );
  const baselineRef = architectureGateRef(
    baseline.baselineId,
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
    baselineBytes,
  );
  return {
    checkpointReplay,
    ownerApproval,
    ownerApprovalRef,
    ownerApprovalBytes,
    baseline,
    baselineRef,
    baselineBytes,
    evidenceResolver,
  };
}

test("ArchitectureGate promotes only an exact replayed change and raw-byte owner approval", async () => {
  const fixture = await changeRuntime();
  const checkpointStore = checkpoints();
  await fixture.registry.execute(fixture.invocation, {
    artifacts: fixture.store.artifacts,
    checkpoints: checkpointStore,
  });
  const checkpointReplay =
    await fixture.registry.verifyCheckpointedExecution(
      fixture.invocation,
      {
        artifacts: fixture.store.artifacts,
        checkpoints: checkpointStore,
      },
    );
  const request = architectureGateRequest(fixture, checkpointReplay);
  const promoted = await validateArchitectureGatePromotion(request);
  assert.equal(promoted.operation, "design-change");
  assert.deepEqual(promoted.candidateRef, fixture.changeSetRef);
  assert.deepEqual(
    promoted.previousBaselineRef,
    fixture.architectureBaselineRef,
  );
  assert.equal(
    promoted.commitPayload.baseline.bytesBase64,
    request.baselineBytes.toString("base64"),
  );
  assert.equal(Object.isFrozen(promoted.commitPayload), true);
  assert.ok(
    promoted.baseline.sections.decisionRecords.content.decisions.every(
      ({ status }) => status !== "proposed",
    ),
  );

  await assert.rejects(
    () =>
      validateArchitectureGatePromotion({
        ...request,
        checkpointReplay: structuredClone(checkpointReplay),
      }),
    ArchitectureGateValidationError,
  );
  await assert.rejects(
    () =>
      validateArchitectureGatePromotion({
        ...request,
        baselineBytes: Buffer.concat([
          request.baselineBytes,
          Buffer.from(" ", "utf8"),
        ]),
      }),
    ArchitectureGateValidationError,
  );

  const staleApproval = structuredClone(request.ownerApproval);
  staleApproval.candidate.digest = `sha256:${"f".repeat(64)}`;
  const staleApprovalBytes = Buffer.from(
    `${JSON.stringify(staleApproval, null, 2)}\n`,
    "utf8",
  );
  const staleApprovalRef = architectureGateRef(
    staleApproval.approvalId,
    request.ownerApprovalRef.schema,
    request.ownerApprovalRef.mediaType,
    staleApprovalBytes,
  );
  await assert.rejects(
    () =>
      validateArchitectureGatePromotion({
        ...request,
        ownerApproval: staleApproval,
        ownerApprovalRef: staleApprovalRef,
        ownerApprovalBytes: staleApprovalBytes,
      }),
    ArchitectureGateValidationError,
  );
  const missingCheckpointKey = checkpointStore.values.keys().next().value;
  const missingCheckpoint = checkpointStore.values.get(missingCheckpointKey);
  checkpointStore.values.delete(missingCheckpointKey);
  await assert.rejects(
    () =>
      fixture.registry.verifyCheckpointedExecution(fixture.invocation, {
        artifacts: fixture.store.artifacts,
        checkpoints: checkpointStore,
      }),
    (error) => error instanceof ContractError && error.code === "DR2213",
  );
  assert.equal(fixture.calls.length, 3);
  checkpointStore.values.set(missingCheckpointKey, missingCheckpoint);
});
