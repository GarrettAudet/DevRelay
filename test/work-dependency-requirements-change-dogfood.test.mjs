import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const dogfood = new URL("dogfood/work-dependency-analysis/", root);
const readBytes = (name) => readFile(new URL(name, dogfood));
const readJson = async (name) =>
  JSON.parse(await readFile(new URL(name, dogfood), "utf8"));

test("owner decisions produce one replayable WorkDependencyAnalysis requirements change", async () => {
  const [
    moduleDefinition,
    pluginDefinition,
    invocation,
    expectedResult,
    checkpointBundle,
    proof,
    changeSet,
    overviewChange,
    nativeBundle,
    projectOverviewBaseline,
    gateReview,
    supersessionRecord,
  ] = await Promise.all([
    readJson("../../examples/modules/requirements-gathering.module.json"),
    readJson("../../examples/plugins/openspec.plugin.json"),
    readJson("requirements-change.invocation.json"),
    readJson("requirements-change.result.json"),
    readJson("requirements-change.checkpoint.json"),
    readJson("requirements-change.execution-proof.json"),
    readJson("requirements-change-set.json"),
    readJson("project-overview-change-set-draft.json"),
    readJson("native-source-bundle.json"),
    readJson("../../project/history/1.0.0/project-overview-baseline.json"),
    readFile(new URL("requirements-gate-review.md", dogfood), "utf8"),
    readFile(new URL("supersession-record.md", dogfood), "utf8"),
  ]);

  const bytesByArtifactId = new Map();
  const add = async (artifactId, name) => {
    bytesByArtifactId.set(artifactId, await readBytes(name));
  };
  await Promise.all([
    add(invocation.inputs.goal[0].artifactId, "goal.json"),
    add(invocation.inputs["project-context"][0].artifactId, "project-context.json"),
    add(
      invocation.inputs["repository-snapshot"][0].artifactId,
      "repository-snapshot.json",
    ),
    add(
      invocation.inputs["requirements-baseline"][0].artifactId,
      "../../project/history/1.0.0/requirements-baseline.json",
    ),
    add(
      invocation.inputs["project-overview-baseline"][0].artifactId,
      "../../project/history/1.0.0/project-overview-baseline.json",
    ),
    add(
      projectOverviewBaseline.renderedDocument.artifact.artifactId,
      "../../project/history/1.0.0/ProjectOverview.md",
    ),
    add(
      expectedResult.outputs["requirements-change-set"][0].artifactId,
      "requirements-change-set.json",
    ),
    add(
      expectedResult.outputs["project-overview-change-set-draft"][0].artifactId,
      "project-overview-change-set-draft.json",
    ),
    add(
      expectedResult.outputs["native-source-bundle"][0].artifactId,
      "native-source-bundle.json",
    ),
    add(
      overviewChange.renderedDocument.artifact.artifactId,
      "candidate/ProjectOverview.md",
    ),
    ...nativeBundle.sources.map(({ artifact, path }) =>
      add(
        artifact.artifactId,
        path.replace("dogfood/work-dependency-analysis/", ""),
      ),
    ),
  ]);

  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: pluginDefinition,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            throw new Error("checkpoint replay must not invoke the adapter");
          },
        },
      },
    ],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
  const replayed = await registry.execute(invocation, {
    artifacts: {
      async load(ref) {
        const bytes = bytesByArtifactId.get(ref.artifactId);
        if (bytes === undefined) {
          throw new Error(`missing dogfood bytes for ${ref.artifactId}`);
        }
        return Buffer.from(bytes);
      },
    },
    checkpoints: {
      async get(key) {
        return key === checkpointBundle.checkpointKey
          ? checkpointBundle.checkpoint
          : undefined;
      },
      async put() {
        throw new Error("checkpoint replay must not write a new checkpoint");
      },
    },
  });

  assert.deepEqual(replayed, expectedResult);
  assert.equal(adapterCalls, 0);
  assert.equal(expectedResult.outcome, "change_set_drafted");
  assert.equal(proof.requirementsGateStatus, "awaiting-owner-approval");
  assert.equal(proof.architectureProgressionAllowed, false);
  assert.equal(
    proof.checkpointDigest,
    sha256Digest(await readBytes("requirements-change.checkpoint.json")),
  );
  assert.equal(
    changeSet.replacement.assumptions.filter(
      ({ id, blocking, status }) =>
        id.startsWith("ASM-WDA-") &&
        (blocking || status !== "confirmed"),
    ).length,
    0,
  );
  assert.match(
    changeSet.replacement.assumptions.find(
      ({ id }) => id === "ASM-WDA-INPUT-CONTEXT-001",
    ).statement,
    /full immutable work-breakdown analysis snapshot.*context slices/i,
  );
  assert.match(
    changeSet.replacement.assumptions.find(
      ({ id }) => id === "ASM-WDA-PLUGIN-SURFACE-001",
    ).statement,
    /native structured proposer.*OPA.*Graphology-DAG.*Spec Kit.*Task Master.*OpenSpec/i,
  );
  assert.deepEqual(
    nativeBundle.sources.map(({ role }) => role),
    [
      "superseded-clarification-request",
      "superseded-continuation",
      "owner-decision",
      "capability-evidence",
      "proposal",
      "specification",
    ],
  );
  assert.equal(overviewChange.changeDisposition, "changed");
  assert.match(gateReview, /awaiting owner approval/i);
  assert.match(supersessionRecord, /without treating it as answered/i);
});
