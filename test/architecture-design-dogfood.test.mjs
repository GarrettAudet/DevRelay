import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../src/requirements-gate.mjs";
import {
  normativeRequirementIds,
  validateRequirementsArtifact,
} from "../src/requirements-artifact-validator.mjs";
import {
  validateProjectOverviewArtifact,
  validateProjectOverviewRenderedDocument,
} from "../src/project-overview-artifact-validator.mjs";
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
  projectOverviewDraft,
  nativeSourceBundle,
  invocation,
  result,
  requirementsBaseline,
  projectOverviewBaseline,
  requirementsModule,
  openSpecPlugin,
] = await Promise.all([
  readJson("dogfood/architecture-design/goal.json"),
  readJson("dogfood/architecture-design/project-context.json"),
  readJson("dogfood/architecture-design/repository-snapshot.json"),
  readJson("dogfood/architecture-design/requirements-draft.json"),
  readJson("dogfood/architecture-design/project-overview-draft.json"),
  readJson("dogfood/architecture-design/native-source-bundle.json"),
  readJson("dogfood/architecture-design/requirements-gathering.invocation.json"),
  readJson("dogfood/architecture-design/requirements-gathering.result.json"),
  readJson("dogfood/architecture-design/requirements-baseline.json"),
  readJson("dogfood/architecture-design/project-overview-baseline.json"),
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
  validateProjectOverviewArtifact(projectOverviewDraft);
  validateProjectOverviewArtifact(projectOverviewBaseline);
  const renderedDocumentBytes = await readBytes(
    "dogfood/architecture-design/ProjectOverview.md",
  );
  validateProjectOverviewRenderedDocument({
    projectOverviewArtifact: projectOverviewDraft,
    renderedDocumentBytes,
  });
  validateProjectOverviewRenderedDocument({
    projectOverviewArtifact: projectOverviewBaseline,
    renderedDocumentBytes,
  });
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
  assert.deepEqual(
    nativeSourceBundle.canonicalOutputs.map(({ artifactId }) => artifactId),
    [
      requirementsDraft.draftId,
      projectOverviewDraft.draftId,
    ],
  );
  assert.equal(
    nativeSourceBundle.canonicalOutputs[0].digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );
  assert.equal(
    nativeSourceBundle.canonicalOutputs[1].digest,
    await digest("dogfood/architecture-design/project-overview-draft.json"),
  );

  assert.equal(
    result.outputs["requirements-draft"][0].digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );
  assert.equal(
    result.outputs["project-overview-draft"][0].digest,
    await digest("dogfood/architecture-design/project-overview-draft.json"),
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
    "dogfood/architecture-design/project-overview-draft.json",
    "dogfood/architecture-design/ProjectOverview.md",
    "dogfood/architecture-design/native-source-bundle.json",
    "dogfood/architecture-design/clarification-transcript.md",
  ]) {
    assert.ok(gate.includes(await digest(path)), `gate does not bind ${path}`);
  }

  assert.equal(
    requirementsBaseline.approvedCandidate.digest,
    await digest("dogfood/architecture-design/requirements-draft.json"),
  );
  assert.equal(
    projectOverviewBaseline.approvedOverviewCandidate.digest,
    await digest("dogfood/architecture-design/project-overview-draft.json"),
  );
  assert.equal(
    projectOverviewBaseline.requirementsBaseline.digest,
    await digest("dogfood/architecture-design/requirements-baseline.json"),
  );
  assert.equal(
    requirementsBaseline.approvalEvidence[0].digest,
    await digest("dogfood/architecture-design/requirements-gate.md"),
  );

  const evidenceBytes = new Map([
    [invocation.inputs.goal[0].artifactId, await readBytes("dogfood/architecture-design/goal.json")],
    [
      invocation.inputs["project-context"][0].artifactId,
      await readBytes("dogfood/architecture-design/project-context.json"),
    ],
    [
      invocation.inputs["repository-snapshot"][0].artifactId,
      await readBytes("dogfood/architecture-design/repository-snapshot.json"),
    ],
    [
      result.outputs["requirements-draft"][0].artifactId,
      await readBytes("dogfood/architecture-design/requirements-draft.json"),
    ],
    [
      result.outputs["project-overview-draft"][0].artifactId,
      await readBytes("dogfood/architecture-design/project-overview-draft.json"),
    ],
    [
      result.outputs["native-source-bundle"][0].artifactId,
      await readBytes("dogfood/architecture-design/native-source-bundle.json"),
    ],
    [
      projectOverviewDraft.renderedDocument.artifact.artifactId,
      await readBytes("dogfood/architecture-design/ProjectOverview.md"),
    ],
    [
      nativeSourceBundle.sources[0].artifact.artifactId,
      await readBytes("dogfood/architecture-design/clarification-transcript.md"),
    ],
  ]);
  const checkpointValues = new Map();
  const checkpoints = {
    async get(key) {
      return checkpointValues.get(key);
    },
    async put(key, value) {
      checkpointValues.set(key, value);
    },
  };
  const artifacts = {
    async load(ref) {
      const bytes = evidenceBytes.get(ref.artifactId);
      if (!bytes) throw new Error(`missing dogfood artifact ${ref.artifactId}`);
      return Buffer.from(bytes);
    },
  };
  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [requirementsModule],
    plugins: [
      {
        definition: openSpecPlugin,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return structuredClone(result);
          },
        },
      },
    ],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });

  assert.deepEqual(
    await registry.execute(invocation, { artifacts, checkpoints }),
    result,
  );
  const checkpointReplay = await registry.verifyCheckpointedExecution(
    invocation,
    { artifacts, checkpoints },
  );
  assert.equal(adapterCalls, 1, "checkpoint replay must not reinvoke OpenSpec");
  assert.equal(checkpointValues.size, 1);

  const requirementsBaselineBytes = await readBytes(
    "dogfood/architecture-design/requirements-baseline.json",
  );
  const projectOverviewBaselineBytes = await readBytes(
    "dogfood/architecture-design/project-overview-baseline.json",
  );
  const requirementsBaselineRef = {
    artifactId: requirementsBaseline.baselineId,
    schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
    mediaType: "application/vnd.devrelay.requirements-baseline+json",
    digest: await digest("dogfood/architecture-design/requirements-baseline.json"),
    uri: new URL(
      "dogfood/architecture-design/requirements-baseline.json",
      root,
    ).href,
  };
  const projectOverviewBaselineRef = {
    artifactId: projectOverviewBaseline.baselineId,
    schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    mediaType: "application/vnd.devrelay.project-overview-baseline+json",
    digest: await digest(
      "dogfood/architecture-design/project-overview-baseline.json",
    ),
    uri: new URL(
      "dogfood/architecture-design/project-overview-baseline.json",
      root,
    ).href,
  };
  const promoted = validateRequirementsGatePromotion({
    checkpointReplay,
    requirementsBaseline,
    requirementsBaselineRef,
    requirementsBaselineBytes,
    projectOverviewBaseline,
    projectOverviewBaselineRef,
    projectOverviewBaselineBytes,
    projectOverviewMarkdownBytes: renderedDocumentBytes,
  });
  assert.deepEqual(promoted.requirementsBaselineRef, requirementsBaselineRef);
  assert.deepEqual(
    promoted.projectOverviewBaselineRef,
    projectOverviewBaselineRef,
  );
  assert.equal(
    promoted.commitPayload.requirementsBaseline.bytesBase64,
    requirementsBaselineBytes.toString("base64"),
  );
  assert.equal(
    promoted.commitPayload.projectOverviewBaseline.bytesBase64,
    projectOverviewBaselineBytes.toString("base64"),
  );
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
  assert.deepEqual(normativeRequirementIds(requirementsBaseline.requirements), [
    "US-ARCH-CHAIN",
    "US-ARCH-CLARIFICATION",
    "US-ARCH-DISCOVERY",
    "US-ARCH-GATE",
    "US-ARCH-MODULE",
    "US-ARCH-OPERATIONS",
    "US-ARCH-PRIMARY-OUTPUT",
    "US-ARCH-ROUTING",
    "US-ARCH-SECTIONS",
    "US-ARCH-STATE",
    "NFR-ARCH-CONFORMANCE",
    "NFR-ARCH-PROVENANCE",
    "CON-ARCH-APPROVED-REQUIREMENTS",
    "CON-ARCH-BOUNDED-CAPABILITY",
    "CON-ARCH-CANDIDATE-ONLY",
    "CON-ARCH-CORE-AUTHORITY",
    "CON-ARCH-IMMUTABLE-BOUNDARIES",
    "CON-ARCH-INTERFACE-BOUNDARY",
    "CON-ARCH-PROVIDER-NEUTRALITY",
    "CON-ARCH-REQUIREMENTS-COMPATIBILITY",
    "CON-ARCH-SMALL-KERNEL",
    "CON-ARCH-V1-ADAPTERS",
  ]);
  assert.equal(
    requirementsBaseline.requirements.assumptions.some(
      ({ status, blocking }) => status !== "confirmed" && blocking,
    ),
    false,
  );
});

test("repository snapshot records pre-implementation provenance", (t) => {
  assert.match(repositorySnapshot.revision, /^[0-9a-f]{40}$/u);
  assert.match(repositorySnapshot.treeDigest, /^sha256:[0-9a-f]{64}$/u);

  if (!existsSync(new URL("../.git", import.meta.url))) {
    t.diagnostic(
      "Git history is absent from this source archive; provenance shape remains verified.",
    );
    return;
  }

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
