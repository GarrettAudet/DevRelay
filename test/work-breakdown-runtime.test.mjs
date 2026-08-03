import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
} from "../src/work-breakdown-artifact-validator.mjs";
import { validateWorkBreakdownGateCandidate } from "../src/work-breakdown-gate.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../src/work-breakdown-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const clone = (value) => structuredClone(value);

async function bytes(relativePath) {
  return readFile(new URL(relativePath, root));
}

async function document(relativePath) {
  const raw = await bytes(relativePath);
  return { bytes: raw, value: JSON.parse(raw.toString("utf8")) };
}

const [
  workBreakdownModule,
  architectureModule,
  pluginDefinition,
  invocationDocument,
  resultDocument,
  stateDocument,
  routeDocument,
  requirementsDocument,
  overviewDocument,
  architectureDocument,
  contractDocument,
  catalogDocument,
  repositoryDocument,
  candidateDocument,
] = await Promise.all([
  document("examples/modules/work-breakdown.module.json"),
  document("examples/modules/architecture-design.module.json"),
  document("examples/plugins/openspec-tasks.plugin.json"),
  document("dogfood/work-breakdown/work-breakdown/work-breakdown.invocation.json"),
  document("dogfood/work-breakdown/work-breakdown/work-breakdown.result.json"),
  document("dogfood/work-breakdown/work-breakdown/project-work-breakdown-state.json"),
  document("dogfood/work-breakdown/work-breakdown/module-route-decision.json"),
  document("dogfood/work-breakdown/requirements-baseline.json"),
  document("dogfood/work-breakdown/project-overview-baseline.json"),
  document("dogfood/work-breakdown/architecture-design/architecture-baseline.json"),
  document("dogfood/work-breakdown/work-breakdown/contract-disposition.json"),
  document("dogfood/work-breakdown/work-breakdown/capability-catalog.json"),
  document("dogfood/work-breakdown/repository-snapshot.json"),
  document("dogfood/work-breakdown/work-breakdown/work-breakdown-draft.json"),
]);

const primaryArtifacts = new Map([
  ["PWBS-WB-DOGFOOD", stateDocument.bytes],
  ["module-route-decision-work-breakdown-dogfood-v1", routeDocument.bytes],
  ["requirements-baseline-work-breakdown-v1", requirementsDocument.bytes],
  ["project-overview-baseline-work-breakdown-v1", overviewDocument.bytes],
  ["architecture-baseline-work-breakdown-v1", architectureDocument.bytes],
  ["CD-WB-NOT-APPLICABLE", contractDocument.bytes],
  ["CC-WB-DOGFOOD", catalogDocument.bytes],
  ["repository-snapshot-devrelay-7d3b9c1", repositoryDocument.bytes],
  ["WBD-WB-DOGFOOD", candidateDocument.bytes],
  [
    "project-overview-markdown-work-breakdown-v1",
    await bytes("dogfood/work-breakdown/ProjectOverview.md"),
  ],
]);

function checkpointStore() {
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

function dogfoodRelativePath(ref) {
  let parsed;
  try {
    parsed = new URL(ref.uri);
  } catch {
    return undefined;
  }
  const normalized = decodeURIComponent(parsed.pathname).replaceAll("\\", "/");
  const marker = "/dogfood/work-breakdown/";
  const index = normalized.toLowerCase().indexOf(marker);
  return index < 0
    ? undefined
    : `dogfood/work-breakdown/${normalized.slice(index + marker.length)}`;
}

function harness({ invocation, result, overrides = new Map() } = {}) {
  const activeInvocation = clone(invocation ?? invocationDocument.value);
  const activeResult = clone(result ?? resultDocument.value);
  const checkpoints = checkpointStore();
  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [workBreakdownModule.value],
    plugins: [
      {
        definition: pluginDefinition.value,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return clone(activeResult);
          },
        },
      },
    ],
    artifactContracts: workBreakdownRuntimeArtifactContracts(),
  });
  const artifacts = {
    async load(ref) {
      const direct = overrides.get(ref.artifactId) ?? primaryArtifacts.get(ref.artifactId);
      if (direct) return Buffer.from(direct);
      const relative = dogfoodRelativePath(ref);
      if (!relative) throw new Error(`missing artifact ${ref.artifactId}`);
      return bytes(relative);
    },
  };
  return {
    invocation: activeInvocation,
    result: activeResult,
    registry,
    artifacts,
    checkpoints,
    calls: () => adapterCalls,
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rebindStateAndRoute(invocation, state, route, overrides) {
  const stateBytes = jsonBytes(state);
  const stateRef = clone(invocation.inputs["project-work-breakdown-state"][0]);
  stateRef.digest = sha256Digest(stateBytes);
  invocation.inputs["project-work-breakdown-state"] = [stateRef];
  overrides.set(stateRef.artifactId, stateBytes);

  route.state.artifactId = stateRef.artifactId;
  route.state.schema = stateRef.schema;
  route.state.digest = stateRef.digest;
  const routeBytes = jsonBytes(route);
  const routeRef = clone(invocation.inputs["routing-decision"][0]);
  routeRef.digest = sha256Digest(routeBytes);
  invocation.inputs["routing-decision"] = [routeRef];
  overrides.set(routeRef.artifactId, routeBytes);
}

test("production runtime reaches the configured adapter and checkpoint replay never reinvokes it", async () => {
  const runtime = harness();
  const result = await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  assert.equal(result.outcome, "decomposed");
  assert.equal(runtime.calls(), 1);
  const replay = await runtime.registry.verifyCheckpointedExecution(
    runtime.invocation,
    { artifacts: runtime.artifacts, checkpoints: runtime.checkpoints },
  );
  assert.equal(replay.moduleResult.outcome, "decomposed");
  assert.equal(runtime.calls(), 1);
});

test("ArtifactRef relocation is not baseline drift", async () => {
  const invocation = clone(invocationDocument.value);
  invocation.inputs["architecture-baseline"][0].uri =
    "artifact://relocated/architecture-baseline-work-breakdown-v1";
  const runtime = harness({ invocation });
  const result = await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  assert.equal(result.outcome, "decomposed");
  assert.equal(runtime.calls(), 1);
});

test("digest, schema, and media-type state drift terminate before adapter entry and replay", async (t) => {
  for (const drift of ["digest", "schema", "mediaType"]) {
    await t.test(drift, async () => {
      const invocation = clone(invocationDocument.value);
      const state = clone(stateDocument.value);
      const route = clone(routeDocument.value);
      const overrides = new Map();
      if (drift === "digest") {
        state.architectureBaseline.digest = `sha256:${"0".repeat(64)}`;
      } else if (drift === "schema") {
        state.architectureBaseline.schema =
          "https://devrelay.dev/artifacts/architecture-baseline/v2";
      } else {
        state.architectureBaseline.mediaType =
          "application/vnd.devrelay.architecture-baseline-v2+json";
      }
      rebindStateAndRoute(invocation, state, route, overrides);
      const runtime = harness({ invocation, overrides });
      const result = await runtime.registry.execute(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      });
      assert.equal(result.outcome, "baseline_drift");
      assert.deepEqual(result.outputs, {});
      assert.equal(runtime.calls(), 0);
      const replay = await runtime.registry.execute(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      });
      assert.deepEqual(replay, result);
      assert.equal(runtime.calls(), 0);
    });
  }
});

test("ArchitectureBaseline upstream drift terminates before adapter entry", async () => {
  const invocation = clone(invocationDocument.value);
  const state = clone(stateDocument.value);
  const route = clone(routeDocument.value);
  const architecture = clone(architectureDocument.value);
  const overrides = new Map();
  architecture.requirementsBaseline.digest = "sha256:" + "0".repeat(64);
  const architectureBytes = jsonBytes(architecture);
  const architectureRef = clone(invocation.inputs["architecture-baseline"][0]);
  architectureRef.digest = sha256Digest(architectureBytes);
  invocation.inputs["architecture-baseline"] = [architectureRef];
  overrides.set(architectureRef.artifactId, architectureBytes);
  state.architectureBaseline = clone(architectureRef);
  rebindStateAndRoute(invocation, state, route, overrides);

  const runtime = harness({ invocation, overrides });
  const result = await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  assert.equal(result.outcome, "baseline_drift");
  assert.match(
    result.diagnostics[0].message,
    /architecture baseline requirements baseline changed/,
  );
  assert.equal(runtime.calls(), 0);
  const replay = await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  assert.deepEqual(replay, result);
  assert.equal(runtime.calls(), 0);
});

test("attached ArchitectureModel executes, replays, and passes the Gate by exact resolver", async () => {
  const invocation = clone(invocationDocument.value);
  const state = clone(stateDocument.value);
  const route = clone(routeDocument.value);
  const architecture = clone(architectureDocument.value);
  const candidate = clone(candidateDocument.value);
  const result = clone(resultDocument.value);
  const overrides = new Map();

  const model = clone(architecture.sections.architectureModel.content);
  const modelBytes = Buffer.from(canonicalJson(model), "utf8");
  const modelRef = {
    artifactId: "architecture-model-work-breakdown-attached-v1",
    schema: "https://devrelay.dev/artifacts/architecture-model/v1",
    mediaType: "application/vnd.devrelay.architecture-model+json",
    digest: sha256Digest(modelBytes),
    uri: "artifact://work-breakdown-runtime/architecture-model",
  };
  architecture.sections.architectureModel = {
    mode: "attached",
    contentId: model.modelId,
    artifact: modelRef,
  };
  const architectureBytes = jsonBytes(architecture);
  const architectureRef = clone(invocation.inputs["architecture-baseline"][0]);
  architectureRef.digest = sha256Digest(architectureBytes);
  invocation.inputs["architecture-baseline"] = [architectureRef];
  overrides.set(architectureRef.artifactId, architectureBytes);
  overrides.set(modelRef.artifactId, modelBytes);

  state.architectureBaseline = clone(architectureRef);
  rebindStateAndRoute(invocation, state, route, overrides);
  const stateRef = invocation.inputs["project-work-breakdown-state"][0];
  for (const binding of candidate.inputBindings) {
    if (binding.role === "project-work-breakdown-state") {
      binding.artifact = clone(stateRef);
    }
    if (binding.role === "architecture-baseline") {
      binding.artifact = clone(architectureRef);
    }
  }
  const rebindRuntimeSource = (source) => {
    if (source.role === "architecture-baseline") {
      source.artifact = clone(architectureRef);
      source.jsonPointer = "/sections/architectureModel";
    }
    if (source.role === "project-work-breakdown-state") {
      source.artifact = clone(stateRef);
    }
  };
  const uniqueSources = (sources) => [
    ...new Map(
      sources.map((source) => [
        source.role +
          "|" +
          source.artifact.digest +
          "|" +
          source.jsonPointer,
        source,
      ]),
    ).values(),
  ];
  for (const item of candidate.workItems) {
    item["source-refs"].forEach(rebindRuntimeSource);
    item["source-refs"] = uniqueSources(item["source-refs"]);
  }
  candidate.sourceRefs.forEach(rebindRuntimeSource);
  candidate.sourceRefs = uniqueSources(candidate.sourceRefs);

  const candidateBytes = jsonBytes(candidate);
  const candidateRef = clone(
    result.outputs["work-breakdown-draft"][0],
  );
  candidateRef.digest = sha256Digest(candidateBytes);
  result.outputs["work-breakdown-draft"] = [candidateRef];
  for (const evidence of result.evidence) {
    evidence.artifact = clone(candidateRef);
  }
  overrides.set(candidateRef.artifactId, candidateBytes);

  const runtime = harness({ invocation, result, overrides });
  const executed = await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  assert.equal(executed.outcome, "decomposed");
  assert.equal(runtime.calls(), 1);
  const checkpointReplay =
    await runtime.registry.verifyCheckpointedExecution(runtime.invocation, {
      artifacts: runtime.artifacts,
      checkpoints: runtime.checkpoints,
    });
  const approved = await validateWorkBreakdownGateCandidate({
    checkpointReplay,
    async architectureAttachmentResolver(ref) {
      assert.deepEqual(ref, modelRef);
      return { ref: modelRef, bytes: modelBytes, value: model };
    },
  });
  assert.equal(approved.candidate.draftId, candidate.draftId);
  assert.equal(runtime.calls(), 1);

  await assert.rejects(
    validateWorkBreakdownGateCandidate({
      checkpointReplay,
      async architectureAttachmentResolver() {
        return {
          ref: modelRef,
          bytes: Buffer.from("{}"),
          value: model,
        };
      },
    }),
    /bytes do not match its digest/,
  );
});

test("repository-context schema and media variants cannot be cross-paired", async () => {
  const invocation = clone(invocationDocument.value);
  invocation.inputs["repository-context"][0].schema =
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable.schema;
  invocation.inputs["repository-context"][0].mediaType =
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable.mediaType;
  const runtime = harness({ invocation });
  await assert.rejects(
    () =>
      runtime.registry.execute(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    /repository-context must pair schema|ApprovedNotApplicable|work-breakdown artifact is invalid/,
  );
  assert.equal(runtime.calls(), 0);
});

test("one combined registry has no duplicate ArchitectureBaseline contract and retains ArchitectureDesign lineage", async () => {
  const runtimeContracts = workBreakdownRuntimeArtifactContracts();
  assert.doesNotThrow(() =>
    createModuleRegistry({
      modules: [architectureModule.value, workBreakdownModule.value],
      artifactContracts: runtimeContracts,
    }),
  );
  const architectureContract = runtimeContracts.find(
    ({ schema }) =>
      schema === "https://devrelay.dev/artifacts/architecture-baseline/v1",
  );
  assert.ok(architectureContract);
  const runtime = harness();
  await assert.rejects(
    () =>
      architectureContract.validate(clone(architectureDocument.value), {
        phase: "input",
        ref: clone(invocationDocument.value.inputs["architecture-baseline"][0]),
        invocation: {
          module: {
            id: "architecture-design",
            version: "0.1.0",
            operation: "design-change",
          },
        },
        operation: {},
        loadedInputs: {},
        loadedHandoffs: {},
        loadArtifact: runtime.artifacts.load,
        loadBytes: runtime.artifacts.load,
      }),
    /architecture baseline requires baselined project state/,
  );
});