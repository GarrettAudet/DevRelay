import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const dogfood = new URL("dogfood/work-dependency-analysis/", root);
const readBytes = (name) => readFile(new URL(name, dogfood));
const readJson = async (name) => JSON.parse(await readFile(new URL(name, dogfood), "utf8"));

test("WorkDependencyAnalysis clarification package replays without adapter reinvocation", async () => {
  const [
    moduleDefinition,
    pluginDefinition,
    invocation,
    expectedResult,
    request,
    continuation,
    checkpointBundle,
    proof,
    goalBytes,
    contextBytes,
    repositoryBytes,
    requestBytes,
    continuationBytes,
    checkpointBytes,
  ] = await Promise.all([
    readJson("../../examples/modules/requirements-gathering.module.json"),
    readJson("../../examples/plugins/openspec.plugin.json"),
    readJson("requirements-gathering.invocation.json"),
    readJson("requirements-gathering.result.json"),
    readJson("clarification-request.json"),
    readJson("requirements-continuation.json"),
    readJson("requirements-gathering.checkpoint.json"),
    readJson("runtime-execution-proof.json"),
    readBytes("goal.json"),
    readBytes("project-context.json"),
    readBytes("repository-snapshot.json"),
    readBytes("clarification-request.json"),
    readBytes("requirements-continuation.json"),
    readBytes("requirements-gathering.checkpoint.json"),
  ]);

  const bytesByArtifactId = new Map([
    [invocation.inputs.goal[0].artifactId, goalBytes],
    [invocation.inputs["project-context"][0].artifactId, contextBytes],
    [invocation.inputs["repository-snapshot"][0].artifactId, repositoryBytes],
    [
      expectedResult.outputs["clarification-requests"][0].artifactId,
      requestBytes,
    ],
    [expectedResult.outputs.continuation[0].artifactId, continuationBytes],
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
        return bytes;
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
  assert.equal(expectedResult.outcome, "needs_clarification");
  assert.equal(proof.promotableCandidateProduced, false);
  assert.equal(proof.architectureProgressionAllowed, false);
  assert.equal(proof.checkpointKey, checkpointBundle.checkpointKey);
  assert.equal(proof.checkpointDigest, sha256Digest(checkpointBytes));
  assert.equal(request.questions.length, 5);
  assert.ok(request.questions.every(({ blocking }) => blocking));
  assert.deepEqual(
    continuation.unresolvedQuestionIds,
    request.questions.map(({ id }) => id),
  );
  assert.equal(
    continuation.workingRequirements.assumptions.filter(
      ({ blocking, status }) => blocking && status === "unconfirmed",
    ).length,
    5,
  );
});
