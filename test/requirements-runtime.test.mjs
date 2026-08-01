import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

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
  nativeSourceBytes,
] = await Promise.all([
  readJson("examples/modules/requirements-gathering.module.json"),
  readJson("examples/plugins/openspec.plugin.json"),
  readJson("examples/invocations/requirements-openspec.invocation.json"),
  readJson("examples/results/requirements-openspec.result.json"),
  readJson("examples/artifacts/goal-001.json"),
  readJson("examples/artifacts/project-context-001.json"),
  readJson("examples/artifacts/requirements-draft-001.json"),
  readJson("examples/artifacts/native-source-bundle-001.json"),
  readFile(new URL("examples/native/openspec/proposal.md", root)),
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

function pointer(ref) {
  return { artifactId: ref.artifactId, digest: ref.digest };
}

function addProjectOverviewDraft(store, requirementsDraftRef, requirements) {
  const overview = deriveProjectOverview(requirements);
  const bytes = renderProjectOverviewMarkdownBytes(overview);
  const markdownArtifact = {
    artifactId: "project-overview-md-runtime",
    digest: sha256Digest(bytes),
  };
  store.set(markdownArtifact.artifactId, bytes);
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewDraft",
    draftId: "project-overview-draft-runtime",
    requirementsDraft: pointer(requirementsDraftRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: {
      path: PROJECT_OVERVIEW_DOCUMENT.path,
      schema: PROJECT_OVERVIEW_DOCUMENT.schema,
      mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
      artifact: markdownArtifact,
      renderer: { ...PROJECT_OVERVIEW_RENDERER },
    },
  };
  return {
    value,
    ref: add(
      store,
      value.draftId,
      "https://devrelay.dev/artifacts/project-overview-draft/v1",
      "application/vnd.devrelay.project-overview-draft+json",
      value,
    ),
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
  runtimeDraft.baseInputs = [
    { role: "goal", artifact: pointer(goalRef) },
    { role: "project-context", artifact: pointer(contextRef) },
  ];
  runtimeDraft.goal = pointer(goalRef);
  runtimeDraft.projectContext = pointer(contextRef);
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

  const projectOverview = addProjectOverviewDraft(
    store,
    draftRef,
    runtimeDraft.requirements,
  );

  const invocation = structuredClone(invocationFixture);
  invocation.inputs = {
    goal: [goalRef],
    "project-context": [contextRef],
  };
  const sourceRef = {
    artifactId: "openspec-proposal-001",
    digest: sha256Digest(nativeSourceBytes),
  };
  store.set(sourceRef.artifactId, Buffer.from(nativeSourceBytes));
  const nativeBundle = structuredClone(nativeBundleFixture);
  nativeBundle.tool = {
    name: invocation.config.toolName,
    version: invocation.config.toolVersion,
  };
  nativeBundle.operation = invocation.config.nativeOperation;
  nativeBundle.sources[0].artifact = sourceRef;
  nativeBundle.canonicalOutputs = [
    pointer(draftRef),
    pointer(projectOverview.ref),
  ];
  const nativeRef = add(
    store,
    "native-source-openspec-001",
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
    nativeBundle,
  );

  const result = structuredClone(resultFixture);
  result.outputs = {
    "requirements-draft": [draftRef],
    "project-overview-draft": [projectOverview.ref],
    "native-source-bundle": [nativeRef],
  };
  result.evidence[0].artifact = structuredClone(nativeRef);

  let calls = 0;
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
    artifactContracts: requirementsRuntimeArtifactContracts(),
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
