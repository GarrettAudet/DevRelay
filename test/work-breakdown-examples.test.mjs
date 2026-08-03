import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { assertInvocationMatchesRoute } from "../src/operation-router.mjs";
import {
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
  applyWorkBreakdownChangeSet,
  sameWorkBreakdownArtifactRef,
  validateWorkBreakdownArtifact,
  validateWorkBreakdownBaselinePromotion,
  validateWorkBreakdownCandidateAgainstInputs,
} from "../src/work-breakdown-artifact-validator.mjs";
import {
  WORK_BREAKDOWN_INPUT_GUARD,
  workBreakdownRuntimeArtifactContracts,
} from "../src/work-breakdown-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);

async function readBytes(path) {
  return readFile(new URL(path, root));
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

const fixturePathByArtifactId = new Map([
  [
    "PWBS-AUTH-UNBASELINED-001",
    "examples/artifacts/project-work-breakdown-state-unbaselined-001.json",
  ],
  [
    "PWBS-AUTH-BASELINED-001",
    "examples/artifacts/project-work-breakdown-state-baselined-001.json",
  ],
  [
    "work-breakdown-route-establish-001",
    "examples/artifacts/module-route-decision-work-breakdown-establish-001.json",
  ],
  [
    "work-breakdown-route-change-001",
    "examples/artifacts/module-route-decision-work-breakdown-change-001.json",
  ],
  ["requirements-baseline-001", "examples/artifacts/requirements-baseline-001.json"],
  [
    "project-overview-baseline-001",
    "examples/artifacts/project-overview-baseline-001.json",
  ],
  ["architecture-baseline-001", "examples/artifacts/architecture-baseline-001.json"],
  ["CD-AUTH-001", "examples/artifacts/contract-disposition-auth-001.json"],
  [
    "CC-WORK-BREAKDOWN-001",
    "examples/artifacts/capability-catalog-work-breakdown-001.json",
  ],
  ["repository-snapshot-001", "examples/artifacts/repository-snapshot-001.json"],
  [
    "repository-snapshot-advanced-001",
    "examples/artifacts/repository-snapshot-advanced-001.json",
  ],
  ["WBD-AUTH-001", "examples/artifacts/work-breakdown-draft-auth-001.json"],
  ["WBB-AUTH-001", "examples/artifacts/work-breakdown-baseline-auth-001.json"],
  ["ACP-AUTH-001", "examples/artifacts/approved-change-package-auth-001.json"],
  [
    "traceability-graph-auth-001",
    "examples/artifacts/traceability-graph-auth-001.json",
  ],
  [
    "WBCS-AUTH-001",
    "examples/artifacts/work-breakdown-change-set-auth-001.json",
  ],
  [
    "WBCR-AUTH-001",
    "examples/artifacts/work-breakdown-clarification-request-auth-001.json",
  ],
  [
    "WBC-AUTH-001",
    "examples/artifacts/work-breakdown-continuation-auth-001.json",
  ],
  [
    "WBRS-AUTH-001",
    "examples/artifacts/work-breakdown-clarification-response-auth-001.json",
  ],
]);

const nativePathByArtifactId = new Map([
  [
    "spec-kit-tasks-auth-001",
    "examples/native/work-breakdown/spec-kit-tasks.md",
  ],
  [
    "openspec-tasks-auth-change-001",
    "examples/native/work-breakdown/openspec-tasks-change.md",
  ],
]);

const attachmentPathByArtifactId = new Map([
  ["project-overview-md-001", "examples/artifacts/ProjectOverview.md"],
  ["spec-kit-plan-auth-001", "examples/native/architecture/spec-kit-plan.md"],
  ["structurizr-workspace-auth-001", "examples/native/architecture/workspace.dsl"],
  ["madr-auth-001", "examples/native/architecture/0001-centralize-authentication.md"],
]);

const artifactFixturePaths = [
  "examples/artifacts/contract-disposition-auth-001.json",
  "examples/artifacts/capability-catalog-work-breakdown-001.json",
  "examples/artifacts/project-work-breakdown-state-unbaselined-001.json",
  "examples/artifacts/work-breakdown-draft-auth-001.json",
  "examples/artifacts/work-breakdown-baseline-auth-001.json",
  "examples/artifacts/approved-change-package-auth-001.json",
  "examples/artifacts/project-work-breakdown-state-baselined-001.json",
  "examples/artifacts/work-breakdown-change-set-auth-001.json",
  "examples/artifacts/work-breakdown-clarification-request-auth-001.json",
  "examples/artifacts/work-breakdown-continuation-auth-001.json",
  "examples/artifacts/work-breakdown-clarification-response-auth-001.json",
];

const [
  moduleDefinition,
  specKitPlugin,
  openSpecPlugin,
  establishInvocation,
  changeInvocation,
  driftInvocation,
  establishResult,
  changeResult,
  clarificationResult,
  driftResult,
  draft,
  baseline,
  changeSet,
  clarificationRequest,
  clarificationContinuation,
  clarificationResponse,
] = await Promise.all([
  readJson("examples/modules/work-breakdown.module.json"),
  readJson("examples/plugins/spec-kit-tasks.plugin.json"),
  readJson("examples/plugins/openspec-tasks.plugin.json"),
  readJson("examples/invocations/work-breakdown-establish-001.invocation.json"),
  readJson(
    "examples/invocations/work-breakdown-decompose-change-001.invocation.json",
  ),
  readJson("examples/invocations/work-breakdown-decompose-drift-001.invocation.json"),
  readJson("examples/results/work-breakdown-establish-001.result.json"),
  readJson("examples/results/work-breakdown-decompose-change-001.result.json"),
  readJson("examples/results/work-breakdown-clarification-001.result.json"),
  readJson("examples/results/work-breakdown-baseline-drift-001.result.json"),
  readJson("examples/artifacts/work-breakdown-draft-auth-001.json"),
  readJson("examples/artifacts/work-breakdown-baseline-auth-001.json"),
  readJson("examples/artifacts/work-breakdown-change-set-auth-001.json"),
  readJson(
    "examples/artifacts/work-breakdown-clarification-request-auth-001.json",
  ),
  readJson("examples/artifacts/work-breakdown-continuation-auth-001.json"),
  readJson(
    "examples/artifacts/work-breakdown-clarification-response-auth-001.json",
  ),
]);

const noLiveAdapter = Object.freeze({
  async invoke() {
    throw new Error("consumer fixture tests never invoke upstream tools");
  },
});

const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [specKitPlugin, openSpecPlugin].map((definition) => ({
    definition,
    adapter: noLiveAdapter,
  })),
  artifactContracts: workBreakdownRuntimeArtifactContracts(),
});

const runtimeContracts = new Map(
  workBreakdownRuntimeArtifactContracts().map((contract) => [
    contract.schema,
    contract,
  ]),
);

async function loadFixtureRef(ref) {
  const path = fixturePathByArtifactId.get(ref.artifactId);
  assert.ok(path, `no local fixture is registered for ${ref.artifactId}`);
  const bytes = await readBytes(path);
  assert.equal(sha256Digest(bytes), ref.digest, `${ref.artifactId} digest`);
  return {
    ref: structuredClone(ref),
    bytes,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

async function loadInvocationInputs(invocation) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(invocation.inputs).map(async ([port, refs]) => [
        port,
        await Promise.all(refs.map(loadFixtureRef)),
      ]),
    ),
  );
}

async function assertNativeRef(ref) {
  const path = nativePathByArtifactId.get(ref.artifactId);
  assert.ok(path, `no native fixture is registered for ${ref.artifactId}`);
  assert.equal(sha256Digest(await readBytes(path)), ref.digest);
}

test("consumer invocations select configured adapters and all result outcomes validate", () => {
  assert.equal(
    registry.resolve(establishInvocation).pluginDefinition.metadata.id,
    "spec-kit-tasks",
  );
  assert.equal(
    registry.resolve(changeInvocation).pluginDefinition.metadata.id,
    "openspec-tasks",
  );
  assert.equal(
    registry.resolve(driftInvocation).pluginDefinition.metadata.id,
    "openspec-tasks",
  );

  for (const [invocation, result] of [
    [establishInvocation, establishResult],
    [changeInvocation, changeResult],
    [establishInvocation, clarificationResult],
    [driftInvocation, driftResult],
  ]) {
    assert.equal(registry.validateResult(invocation, result), result);
  }
});

test("published route decisions are exact deterministic runtime selections", async () => {
  for (const invocation of [establishInvocation, changeInvocation]) {
    const stateRef = invocation.inputs["project-work-breakdown-state"][0];
    const state = await loadFixtureRef(stateRef);
    const routeRef = invocation.inputs["routing-decision"][0];
    const route = await loadFixtureRef(routeRef);
    const selected = await registry.selectOperation(
      { id: "work-breakdown", version: "0.1.0" },
      stateRef,
      {
        artifacts: {
          async load(ref) {
            assert.equal(sameWorkBreakdownArtifactRef(ref, stateRef), true);
            return state.bytes;
          },
        },
      },
    );
    assert.deepEqual(selected, route.value);
    assert.equal(
      assertInvocationMatchesRoute(selected, invocation).module.operation,
      invocation.module.operation,
    );
  }
});
test("published WorkBreakdown artifacts and local references are content addressed", async () => {
  for (const path of artifactFixturePaths) {
    const value = await readJson(path);
    assert.equal(validateWorkBreakdownArtifact(value), value);
  }

  for (const invocation of [
    establishInvocation,
    changeInvocation,
    driftInvocation,
  ]) {
    for (const refs of Object.values(invocation.inputs)) {
      for (const ref of refs) await loadFixtureRef(ref);
    }
  }
  for (const result of [
    establishResult,
    changeResult,
    clarificationResult,
  ]) {
    for (const refs of Object.values(result.outputs)) {
      for (const ref of refs) await loadFixtureRef(ref);
    }
  }
  for (const ref of [...draft.nativeArtifacts, ...changeSet.nativeArtifacts]) {
    await assertNativeRef(ref);
  }
});

test("establish draft closes over exact inputs and promotes without mutation", async () => {
  const loadedInputs = await loadInvocationInputs(establishInvocation);
  assert.equal(
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: draft,
      operation: "establish-breakdown",
      loadedInputs,
    }),
    draft,
  );

  const draftRef = establishResult.outputs["work-breakdown-draft"][0];
  assert.equal(
    validateWorkBreakdownBaselinePromotion({
      candidate: draft,
      candidateRef: draftRef,
      baseline,
    }).baselineId,
    baseline.baselineId,
  );

  const runtime = runtimeContracts.get(draftRef.schema);
  assert.ok(runtime);
  assert.equal(
    await runtime.validate(draft, {
      phase: "output",
      ref: draftRef,
      invocation: establishInvocation,
      loadedInputs,
    }),
    draft,
  );
});

test("change candidate adds, updates, retires, and preserves unrelated work", async () => {
  const loadedInputs = await loadInvocationInputs(changeInvocation);
  assert.equal(
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: changeSet,
      operation: "decompose-change",
      loadedInputs,
    }),
    changeSet,
  );
  assert.deepEqual(
    changeSet.changes.map(({ operation }) => operation),
    ["add", "update", "retire"],
  );

  const applied = applyWorkBreakdownChangeSet({
    baseline,
    baselineRef: changeSet.currentBaseline,
    changeSet,
  });
  assert.equal(applied.workItemsDigest, changeSet.resultingWorkItemsDigest);
  assert.deepEqual(
    applied.workItems.map(({ id }) => id),
    [
      "WI-AUTH-CORE",
      "WI-AUTH-FAILURE-VERIFICATION",
      "WI-AUTH-OPERATIONS",
      "WI-AUTH-PERFORMANCE",
    ],
  );
  const baselineItems = new Map(baseline.workItems.map((item) => [item.id, item]));
  const resultItems = new Map(applied.workItems.map((item) => [item.id, item]));
  assert.deepEqual(
    resultItems.get("WI-AUTH-OPERATIONS"),
    baselineItems.get("WI-AUTH-OPERATIONS"),
  );
  assert.deepEqual(
    resultItems.get("WI-AUTH-PERFORMANCE"),
    baselineItems.get("WI-AUTH-PERFORMANCE"),
  );
  assert.notDeepEqual(
    resultItems.get("WI-AUTH-CORE"),
    baselineItems.get("WI-AUTH-CORE"),
  );
  assert.equal(resultItems.has("WI-AUTH-FAILURE-TESTS"), false);

  const candidateRef = changeResult.outputs["work-breakdown-change-set-draft"][0];
  const runtime = runtimeContracts.get(candidateRef.schema);
  assert.equal(
    await runtime.validate(changeSet, {
      phase: "output",
      ref: candidateRef,
      invocation: changeInvocation,
      loadedInputs,
    }),
    changeSet,
  );
});

test("clarification request, continuation, and response retain exact lineage", async () => {
  const requestRef = clarificationResult.outputs["clarification-requests"][0];
  const continuationRef = clarificationResult.outputs.continuation[0];
  assert.equal(
    sameWorkBreakdownArtifactRef(
      clarificationContinuation.clarificationRequest,
      requestRef,
    ),
    true,
  );
  assert.equal(
    sameWorkBreakdownArtifactRef(
      clarificationResponse.clarificationRequest,
      requestRef,
    ),
    true,
  );
  assert.equal(
    clarificationResponse.responses[0].questionId,
    clarificationRequest.questions[0].id,
  );

  const loadedInputs = await loadInvocationInputs(establishInvocation);
  const requestLoaded = await loadFixtureRef(requestRef);
  const continuationLoaded = await loadFixtureRef(continuationRef);
  const context = {
    phase: "output",
    invocation: establishInvocation,
    producer: structuredClone(clarificationRequest.sourceInvocation),
    loadedInputs,
    loadedArtifacts: {
      "clarification-requests": [requestLoaded],
      continuation: [continuationLoaded],
    },
  };
  assert.equal(
    await runtimeContracts.get(requestRef.schema).validate(clarificationRequest, {
      ...context,
      ref: requestRef,
    }),
    clarificationRequest,
  );
  assert.equal(
    await runtimeContracts
      .get(continuationRef.schema)
      .validate(clarificationContinuation, {
        ...context,
        ref: continuationRef,
      }),
    clarificationContinuation,
  );
});

test("baseline drift result is the exact deterministic input-guard response", async () => {
  const loadedInputs = await loadInvocationInputs(driftInvocation);
  assert.deepEqual(
    WORK_BREAKDOWN_INPUT_GUARD.evaluate({
      invocation: driftInvocation,
      loadedInputs,
    }),
    driftResult,
  );
  assert.equal(driftResult.outputs.constructor, Object);
  assert.deepEqual(driftResult.outputs, {});
  assert.deepEqual(driftResult.evidence, []);
  assert.equal(driftResult.diagnostics[0].code, "WB_BASELINE_DRIFT");
});

test("ordinary decompose execution rejects pre-change lineage drift before the adapter", async () => {
  const invocation = structuredClone(changeInvocation);
  const state = await readJson(
    "examples/artifacts/project-work-breakdown-state-baselined-001.json",
  );
  const route = await readJson(
    "examples/artifacts/module-route-decision-work-breakdown-change-001.json",
  );
  const changePackage = await readJson(
    "examples/artifacts/approved-change-package-auth-001.json",
  );
  changePackage.preChange.requirementsBaseline.digest =
    "sha256:" + "0".repeat(64);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  const overrides = new Map();

  const changePackageBytes = encode(changePackage);
  const changePackageRef = structuredClone(
    invocation.inputs["approved-change-package"][0],
  );
  changePackageRef.digest = sha256Digest(changePackageBytes);
  invocation.inputs["approved-change-package"] = [changePackageRef];
  overrides.set(changePackageRef.artifactId, changePackageBytes);

  state.approvedChangePackage = structuredClone(changePackageRef);
  const stateBytes = encode(state);
  const stateRef = structuredClone(
    invocation.inputs["project-work-breakdown-state"][0],
  );
  stateRef.digest = sha256Digest(stateBytes);
  invocation.inputs["project-work-breakdown-state"] = [stateRef];
  overrides.set(stateRef.artifactId, stateBytes);

  route.state.digest = stateRef.digest;
  const routeBytes = encode(route);
  const routeRef = structuredClone(invocation.inputs["routing-decision"][0]);
  routeRef.digest = sha256Digest(routeBytes);
  invocation.inputs["routing-decision"] = [routeRef];
  overrides.set(routeRef.artifactId, routeBytes);

  const checkpointValues = new Map();
  const checkpoints = {
    async get(key) {
      return checkpointValues.get(key);
    },
    async put(key, value) {
      checkpointValues.set(key, structuredClone(value));
    },
  };
  let adapterCalls = 0;
  const activeRegistry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: openSpecPlugin,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return structuredClone(changeResult);
          },
        },
      },
    ],
    artifactContracts: workBreakdownRuntimeArtifactContracts(),
  });
  const artifacts = {
    async load(ref) {
      const override = overrides.get(ref.artifactId);
      if (override) return Buffer.from(override);
      const path =
        fixturePathByArtifactId.get(ref.artifactId) ??
        attachmentPathByArtifactId.get(ref.artifactId) ??
        nativePathByArtifactId.get(ref.artifactId);
      if (!path) throw new Error("missing artifact " + ref.artifactId);
      return readBytes(path);
    },
  };

  const result = await activeRegistry.execute(invocation, {
    artifacts,
    checkpoints,
  });
  assert.equal(result.outcome, "baseline_drift");
  assert.match(
    result.diagnostics[0].message,
    /approved change pre-change requirementsBaseline changed/,
  );
  assert.equal(adapterCalls, 0);
  assert.deepEqual(
    await activeRegistry.execute(invocation, { artifacts, checkpoints }),
    result,
  );
  assert.equal(adapterCalls, 0);
});

test("native task artifacts stay bounded planning inputs", async () => {
  const specKit = await readFile(
    new URL(nativePathByArtifactId.get("spec-kit-tasks-auth-001"), root),
    "utf8",
  );
  const openSpec = await readFile(
    new URL(nativePathByArtifactId.get("openspec-tasks-auth-change-001"), root),
    "utf8",
  );
  assert.match(specKit, /describes planned deliverables only/u);
  assert.match(specKit, /does not assign specialists/u);
  assert.match(openSpec, /proposes only the authorized WorkBreakdown delta/u);
  assert.match(openSpec, /do not execute code/u);
  assert.doesNotMatch(specKit, /- \[x\]/iu);
  assert.doesNotMatch(openSpec, /- \[x\]/iu);
  assert.ok(Buffer.byteLength(specKit) < 8192);
  assert.ok(Buffer.byteLength(openSpec) < 8192);
  assert.equal(
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft.schema,
    establishResult.outputs["work-breakdown-draft"][0].schema,
  );
});
