import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";
import { validateSharedArtifact } from "../src/shared-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [
  moduleDefinition,
  pluginDefinition,
  invocationFixture,
  resultFixture,
  goal,
  projectContext,
  draft,
  nativeBundleFixture,
] = await Promise.all([
  readJson("examples/modules/requirements-gathering.module.json"),
  readJson("examples/plugins/openspec.plugin.json"),
  readJson("examples/invocations/requirements-openspec.invocation.json"),
  readJson("examples/results/requirements-openspec.result.json"),
  readJson("examples/artifacts/goal-001.json"),
  readJson("examples/artifacts/project-context-001.json"),
  readJson("examples/artifacts/requirements-draft-001.json"),
  readJson("examples/artifacts/native-source-bundle-001.json"),
]);

function add(store, artifactId, schema, mediaType, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  store.set(artifactId, bytes);
  return {
    artifactId,
    schema,
    mediaType,
    digest: sha256Digest(bytes),
    uri: `artifact://requirements-runtime/${artifactId}`,
  };
}

test("legacy RequirementsGathering single-adapter execution remains content-authoritative", async () => {
  const store = new Map();
  const goalRef = add(
    store,
    goal.goalId,
    "https://devrelay.dev/artifacts/goal/v1",
    "application/vnd.devrelay.goal+json",
    goal,
  );
  const contextRef = add(
    store,
    "project-context-001",
    "https://devrelay.dev/artifacts/project-context/v1",
    "application/vnd.devrelay.project-context+json",
    projectContext,
  );
  const runtimeDraft = structuredClone(draft);
  runtimeDraft.goal = {
    artifactId: goalRef.artifactId,
    digest: goalRef.digest,
  };
  runtimeDraft.projectContext = {
    artifactId: contextRef.artifactId,
    digest: contextRef.digest,
  };
  const replacePointers = (value) => {
    if (value === null || typeof value !== "object") {
      return;
    }
    if (value.artifactId === "goal-001") {
      value.digest = goalRef.digest;
    }
    if (value.artifactId === "project-context-001") {
      value.digest = contextRef.digest;
    }
    for (const child of Object.values(value)) {
      replacePointers(child);
    }
  };
  replacePointers(runtimeDraft);
  const draftRef = add(
    store,
    runtimeDraft.draftId,
    "https://devrelay.dev/artifacts/requirements-draft/v1",
    "application/vnd.devrelay.requirements-draft+json",
    runtimeDraft,
  );

  const nativeBundle = structuredClone(nativeBundleFixture);
  nativeBundle.canonicalOutputs = [
    {
      artifactId: draftRef.artifactId,
      digest: draftRef.digest,
    },
  ];
  const nativeRef = add(
    store,
    "native-source-openspec-001",
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
    nativeBundle,
  );

  const invocation = structuredClone(invocationFixture);
  invocation.inputs = {
    goal: [goalRef],
    "project-context": [contextRef],
  };
  const result = structuredClone(resultFixture);
  result.outputs = {
    "requirements-draft": [draftRef],
    "native-source-bundle": [nativeRef],
  };
  result.evidence[0].artifact = structuredClone(nativeRef);

  let calls = 0;
  const requirementsSchemas = new Set(
    [...moduleDefinition.operations[0].inputs, ...moduleDefinition.operations[0].outputs]
      .map(({ schema }) => schema)
      .filter(
        (schema) =>
          schema !== "https://devrelay.dev/artifacts/native-source-bundle/v1",
      ),
  );
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: pluginDefinition,
        adapter: {
          async invoke() {
            calls += 1;
            return result;
          },
        },
      },
    ],
    artifactContracts: [
      ...[...requirementsSchemas].map((schema) => ({
        schema,
        validate: validateRequirementsArtifact,
      })),
      {
        schema: "https://devrelay.dev/artifacts/native-source-bundle/v1",
        validate: validateSharedArtifact,
      },
    ],
  });

  const artifacts = {
    async load(ref) {
      const bytes = store.get(ref.artifactId);
      if (!bytes) {
        throw new Error(`missing ${ref.artifactId}`);
      }
      return bytes;
    },
  };
  await assert.rejects(
    registry.execute(invocation, { artifacts }),
    (error) => error.code === "DR2200",
  );

  const values = new Map();
  const checkpointStore = {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
  const observed = await registry.execute(invocation, {
    artifacts,
    checkpoints: checkpointStore,
  });
  const replayed = await registry.execute(invocation, {
    artifacts,
    checkpoints: checkpointStore,
  });

  assert.equal(observed.outcome, "drafted");
  assert.deepEqual(replayed, observed);
  assert.equal(calls, 1);
  assert.equal(values.size, 1);
});
