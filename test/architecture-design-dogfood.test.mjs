import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleRegistry } from "../src/module-registry.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";
import { validateSharedArtifact } from "../src/shared-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const readBytes = (path) => readFile(new URL(path, root));
const readText = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));
const digest = async (path) =>
  `sha256:${createHash("sha256").update(await readBytes(path)).digest("hex")}`;

const [
  goal,
  projectContext,
  repositorySnapshot,
  requirementsDraft,
  nativeSourceBundle,
  invocation,
  result,
  requirementsBaseline,
  requirementsModule,
  openSpecPlugin,
] = await Promise.all([
  readJson("dogfood/architecture-design/goal.json"),
  readJson("dogfood/architecture-design/project-context.json"),
  readJson("dogfood/architecture-design/repository-snapshot.json"),
  readJson("dogfood/architecture-design/requirements-draft.json"),
  readJson("dogfood/architecture-design/native-source-bundle.json"),
  readJson("dogfood/architecture-design/requirements-gathering.invocation.json"),
  readJson("dogfood/architecture-design/requirements-gathering.result.json"),
  readJson("dogfood/architecture-design/requirements-baseline.json"),
  readJson("examples/modules/requirements-gathering.module.json"),
  readJson("examples/plugins/openspec.plugin.json"),
]);

test("interactive RequirementsGathering dogfood run is content-bound end to end", async () => {
  for (const artifact of [
    goal,
    projectContext,
    repositorySnapshot,
    requirementsDraft,
    requirementsBaseline,
  ]) {
    validateRequirementsArtifact(artifact);
  }
  validateSharedArtifact(nativeSourceBundle);

  const inputPaths = {
    goal: "dogfood/architecture-design/goal.json",
    "project-context": "dogfood/architecture-design/project-context.json",
    "repository-snapshot":
      "dogfood/architecture-design/repository-snapshot.json",
  };
  for (const [port, path] of Object.entries(inputPaths)) {
    assert.equal(invocation.inputs[port][0].digest, await digest(path));
  }

  assert.equal(
    requirementsDraft.goal.digest,
    await digest("dogfood/architecture-design/goal.json"),
  );
  assert.equal(
    requirementsDraft.projectContext.digest,
    await digest("dogfood/architecture-design/project-context.json"),
  );

  assert.deepEqual(
    nativeSourceBundle.sources.map(({ path }) => path),
    ["dogfood/architecture-design/clarification-transcript.md"],
  );
  assert.equal(
    nativeSourceBundle.sources[0].artifact.digest,
    await digest("dogfood/architecture-design/clarification-transcript.md"),
  );
  assert.equal(
    nativeSourceBundle.canonicalOutputs[0].digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );

  assert.equal(
    result.outputs["requirements-draft"][0].digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );
  assert.equal(
    result.outputs["native-source-bundle"][0].digest,
    await digest("dogfood/architecture-design/native-source-bundle.json"),
  );
  assert.equal(result.invocationId, invocation.invocationId);

  const gate = await readText(
    "dogfood/architecture-design/requirements-gate.md",
  );
  for (const path of [
    "dogfood/architecture-design/requirements-gathering.invocation.json",
    "dogfood/architecture-design/requirements-gathering.result.json",
    "dogfood/architecture-design/requirements-draft.json",
    "dogfood/architecture-design/native-source-bundle.json",
    "dogfood/architecture-design/clarification-transcript.md",
  ]) {
    assert.ok(gate.includes(await digest(path)), `gate does not bind ${path}`);
  }

  assert.equal(
    requirementsBaseline.approvedDraft.digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );
  assert.equal(
    requirementsBaseline.approvalEvidence[0].digest,
    await digest("dogfood/architecture-design/requirements-gate.md"),
  );

  const registry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [
      {
        definition: openSpecPlugin,
        adapter: {
          async invoke() {
            throw new Error("not executed by dogfood integrity test");
          },
        },
      },
    ],
  });
  registry.resolve(invocation);
  registry.validateResult(invocation, result);
});

test("dogfood transcript proves the visible clarification and approval sequence", async () => {
  const transcript = await readText(
    "dogfood/architecture-design/clarification-transcript.md",
  );
  for (const index of [1, 2, 3, 4]) {
    assert.match(transcript, new RegExp(`## Clarification ${index}:`));
  }
  assert.match(transcript, /Alright build out that module then/);
  assert.match(transcript, /OpenSpec CLI was not executed/);
  assert.match(transcript, /semantically exact, normalized record/);
});

test("approved baseline contains the complete canonical ArchitectureDesign decision", () => {
  const requirementIds = new Set(
    requirementsBaseline.requirements.requirements.map(({ id }) => id),
  );
  for (const id of [
    "REQ-ARCH-MODULE",
    "REQ-ARCH-OPERATIONS",
    "REQ-ARCH-ROUTING",
    "REQ-ARCH-STATE",
    "REQ-ARCH-DISCOVERY",
    "REQ-ARCH-CHAIN",
    "REQ-ARCH-V1-ADAPTERS",
    "REQ-ARCH-PRIMARY-OUTPUT",
    "REQ-ARCH-SECTIONS",
    "REQ-ARCH-PROVENANCE",
    "REQ-ARCH-INTERFACE-BOUNDARY",
    "REQ-ARCH-CLARIFICATION",
    "REQ-ARCH-GATE",
    "REQ-ARCH-BOUNDED-CAPABILITY",
    "REQ-ARCH-CONFORMANCE",
  ]) {
    assert.ok(requirementIds.has(id), `missing approved requirement ${id}`);
  }
  assert.equal(
    requirementsBaseline.requirements.assumptions.some(
      ({ status }) => status !== "confirmed",
    ),
    false,
  );
});

test("repository snapshot remains bound to the pre-implementation commit", () => {
  assert.equal(
    execFileSync("git", ["cat-file", "-t", repositorySnapshot.revision], {
      cwd: rootPath,
      encoding: "utf8",
    }).trim(),
    "commit",
  );
  const treeBytes = execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=true",
      "ls-tree",
      "-r",
      "--full-tree",
      repositorySnapshot.revision,
    ],
    {
      cwd: rootPath,
      encoding: null,
    },
  );
  assert.equal(
    repositorySnapshot.treeDigest,
    `sha256:${createHash("sha256").update(treeBytes).digest("hex")}`,
  );
});
