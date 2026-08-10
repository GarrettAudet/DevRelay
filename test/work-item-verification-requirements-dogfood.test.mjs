import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = new URL("dogfood/work-item-verification/", root);
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readDogfoodBytes = (relativePath) => readFile(new URL(relativePath, dogfood));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const readDogfoodJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, dogfood), "utf8"));

const expected = Object.freeze({
  gateCandidate:
    "sha256:58495561273982c09abaf07ff58c0a5cd787424283f3347ad1044824671ad77b",
  requirementsChangeSet:
    "sha256:66937bc9738045ab4c4e4e83c0ac79d4ccad2097fdc7646164b5543af9ea0337",
  projectOverviewChangeSet:
    "sha256:9f259ee2e7bd6855fe3d78059705a5444805e66c0080e82ac051a7f6eb792add",
  projectOverviewMarkdown:
    "sha256:22ae4d9308324f437b3b02e614b2677d2f34bdcd8e7c992979a83e5e4b58e587",
  nativeSourceBundle:
    "sha256:36434f31c5d4387c41c9764b7d126eba77471131b6485c4f2755557b646e39e8",
  terminalCheckpoint:
    "sha256:ca33311a1c6b26199ab5b26e5a67234bde4ce1528521cf688067232ff32db23e",
  executionProof:
    "sha256:2469dd39db176841e39decbbde67acc080b8601f58d4ef7f704f3d02c7361d91",
  confirmedDesignBasis:
    "sha256:68d51980901cd1bc88166f00f7ac30238a9a6a2356340fa07d0b708d397bb35c",
  gateReview:
    "sha256:21c763bd7587c52864bac504e7bebfc5bc9d62fb37b3963b5079235cfff46811",
  requirementsBaseline:
    "sha256:f9ea89ac760902ee1f3285b9816603dd82ecf47c2451a6b4558b51772c939438",
  projectOverviewBaseline:
    "sha256:5c5a6678356be97ff75a68b357262e1a49b50fe010f4401897fed497b682b886",
  previousRequirementsBaseline:
    "sha256:c66224db72ab53947d045720e87e0d6929d4fcb80fbf1fa2f4b607e967caae30",
  previousProjectOverviewBaseline:
    "sha256:6cae194ccf525e5cd3190fd021aed052fc10f373fd1c1eb09d6b6ee002e844f7",
  approval:
    "sha256:af94f31acd2b5a695e96a0ddcaeda576e84f28e37f8dfbac0f573e037195a4f9",
  promotionProof:
    "sha256:a8d5b59245f2dd7da0f3fb0b1e4b9ec97a0370d25570cce80dbbaac9697b4914",
});

const criterionIds = Object.freeze([
  "AC-DEV-WIV-BOUNDARY-001",
  "AC-DEV-WIV-DETERMINISM-001",
  "AC-DEV-WIV-EVIDENCE-001",
  "AC-DEV-WIV-GATE-001",
  "AC-DEV-WIV-INDEPENDENCE-001",
  "AC-DEV-WIV-INPUTS-001",
  "AC-DEV-WIV-OUTCOMES-001",
  "AC-DEV-WIV-PLAN-001",
  "AC-DEV-WIV-RETRY-001",
  "AC-DEV-WIV-TRACEABILITY-001",
]);

test("WorkItemVerification requirements candidate is exact, complete, and replayable", async () => {
  const [
    moduleDefinition,
    pluginDefinition,
    invocation,
    result,
    checkpoint,
    changeSet,
    overviewChange,
    nativeBundle,
    previousOverview,
  ] = await Promise.all([
    readJson("examples/modules/requirements-gathering.module.json"),
    readJson("examples/plugins/openspec.plugin.json"),
    readDogfoodJson("requirements-change.invocation.json"),
    readDogfoodJson("requirements-change.result.json"),
    readDogfoodJson("requirements-change.checkpoint.json"),
    readDogfoodJson("requirements-change-set.json"),
    readDogfoodJson("project-overview-change-set-draft.json"),
    readDogfoodJson("native-source-bundle.json"),
    readJson("project/history/1.4.0/project-overview-baseline.json"),
  ]);

  for (const [path, digest] of [
    ["requirements-gate-candidate.json", expected.gateCandidate],
    ["requirements-change-set.json", expected.requirementsChangeSet],
    ["project-overview-change-set-draft.json", expected.projectOverviewChangeSet],
    ["candidate/ProjectOverview.md", expected.projectOverviewMarkdown],
    ["native-source-bundle.json", expected.nativeSourceBundle],
    ["requirements-change.checkpoint.json", expected.terminalCheckpoint],
    ["requirements-change.execution-proof.json", expected.executionProof],
    ["confirmed-design-basis.md", expected.confirmedDesignBasis],
    ["requirements-gate-review.md", expected.gateReview],
  ]) {
    assert.equal(sha256Digest(await readDogfoodBytes(path)), digest, path);
  }

  assert.deepEqual(Object.keys(invocation.inputs), [
    "goal",
    "project-context",
    "requirements-baseline",
    "project-overview-baseline",
  ]);
  assert.equal(
    Object.keys(invocation.inputs).some((key) => /clarification/i.test(key)),
    false,
  );
  validateRequirementsArtifact(changeSet);
  assert.deepEqual(
    changeSet.replacement.acceptanceCriteria
      .filter(({ id }) => id.startsWith("AC-DEV-WIV-"))
      .map(({ id }) => id),
    criterionIds,
  );
  assert.ok(
    changeSet.replacement.capabilities.some(
      ({ id }) => id === "CAP-DEV-WORK-ITEM-VERIFICATION-001",
    ),
  );
  assert.deepEqual(deriveProjectOverview(changeSet.replacement), overviewChange.overview);
  assert.deepEqual(
    renderProjectOverviewMarkdownBytes(overviewChange.overview),
    await readDogfoodBytes("candidate/ProjectOverview.md"),
  );
  assert.deepEqual(
    nativeBundle.sources.map(({ role }) => role),
    ["confirmed-design-basis", "proposal", "specification"],
  );

  const bytesByArtifactId = new Map();
  const add = (artifactId, bytes) => bytesByArtifactId.set(artifactId, Buffer.from(bytes));
  await Promise.all([
    readDogfoodBytes("goal.json").then((bytes) => add(invocation.inputs.goal[0].artifactId, bytes)),
    readDogfoodBytes("project-context.json").then((bytes) =>
      add(invocation.inputs["project-context"][0].artifactId, bytes),
    ),
    readBytes("project/history/1.4.0/requirements-baseline.json").then((bytes) =>
      add(invocation.inputs["requirements-baseline"][0].artifactId, bytes),
    ),
    readBytes("project/history/1.4.0/project-overview-baseline.json").then((bytes) =>
      add(invocation.inputs["project-overview-baseline"][0].artifactId, bytes),
    ),
    readBytes("project/history/1.4.0/ProjectOverview.md").then((bytes) =>
      add(previousOverview.renderedDocument.artifact.artifactId, bytes),
    ),
    readDogfoodBytes("requirements-change-set.json").then((bytes) =>
      add(result.outputs["requirements-change-set"][0].artifactId, bytes),
    ),
    readDogfoodBytes("project-overview-change-set-draft.json").then((bytes) =>
      add(result.outputs["project-overview-change-set-draft"][0].artifactId, bytes),
    ),
    readDogfoodBytes("native-source-bundle.json").then((bytes) =>
      add(result.outputs["native-source-bundle"][0].artifactId, bytes),
    ),
    readDogfoodBytes("candidate/ProjectOverview.md").then((bytes) =>
      add(overviewChange.renderedDocument.artifact.artifactId, bytes),
    ),
    ...nativeBundle.sources.map(({ artifact, path }) =>
      readDogfoodBytes(path.replace("dogfood/work-item-verification/", "")).then((bytes) =>
        add(artifact.artifactId, bytes),
      ),
    ),
  ]);

  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [{
      definition: pluginDefinition,
      adapter: {
        async invoke() {
          adapterCalls += 1;
          throw new Error("checkpoint replay must not invoke the adapter");
        },
      },
    }],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
  const replayed = await registry.execute(invocation, {
    artifacts: {
      async load(ref) {
        const bytes = bytesByArtifactId.get(ref.artifactId);
        if (bytes === undefined) throw new Error(`Missing replay bytes for ${ref.artifactId}.`);
        return Buffer.from(bytes);
      },
    },
    checkpoints: {
      async get(key) {
        return key === checkpoint.checkpointKey ? checkpoint.checkpoint : undefined;
      },
      async put() {
        throw new Error("checkpoint replay must not write");
      },
    },
  });
  assert.deepEqual(replayed, result);
  assert.equal(adapterCalls, 0);
});

test("standing owner approval promotes one exact WIV baseline pair idempotently", async () => {
  const currentPairBefore = await Promise.all([
    readBytes("project/requirements-baseline.json"),
    readBytes("project/project-overview-baseline.json"),
    readBytes("ProjectOverview.md"),
  ]);
  const promote = () => JSON.parse(execFileSync(
    process.execPath,
    ["dogfood/work-item-verification/materialize-requirements-promotion.mjs"],
    { cwd: rootPath, encoding: "utf8" },
  ));
  const first = promote();
  assert.deepEqual(first, {
    gateStatus: "pass",
    adapterCalls: 0,
    requirementsBaselineDigest: expected.requirementsBaseline,
    projectOverviewBaselineDigest: expected.projectOverviewBaseline,
    projectOverviewMarkdownDigest: expected.projectOverviewMarkdown,
    approvalDigest: expected.approval,
    promotionProofDigest: expected.promotionProof,
    architectureProgressionAllowed: true,
  });

  const [requirementsBytes, overviewBytes, markdownBytes, approvalBytes, proofBytes] =
    await Promise.all([
      readDogfoodBytes("requirements-replay-v2/requirements-baseline.json"),
      readDogfoodBytes("requirements-replay-v2/project-overview-baseline.json"),
      readDogfoodBytes("requirements-replay-v2/ProjectOverview.md"),
      readDogfoodBytes("requirements-gate-owner-approval.json"),
      readDogfoodBytes("requirements-gate-promotion-proof.json"),
    ]);
  const requirements = JSON.parse(requirementsBytes);
  const overview = JSON.parse(overviewBytes);
  const approval = JSON.parse(approvalBytes);
  const proof = JSON.parse(proofBytes);

  validateRequirementsArtifact(requirements);
  assert.equal(sha256Digest(requirementsBytes), expected.requirementsBaseline);
  assert.equal(sha256Digest(overviewBytes), expected.projectOverviewBaseline);
  assert.equal(sha256Digest(markdownBytes), expected.projectOverviewMarkdown);
  assert.equal(sha256Digest(approvalBytes), expected.approval);
  assert.equal(sha256Digest(proofBytes), expected.promotionProof);
  assert.equal(requirements.version, "1.5.0");
  assert.equal(overview.version, "1.5.0");
  assert.equal(requirements.supersedes.digest, expected.previousRequirementsBaseline);
  assert.equal(overview.supersedes.digest, expected.previousProjectOverviewBaseline);
  assert.equal(overview.requirementsBaseline.digest, expected.requirementsBaseline);
  assert.equal(
    approval.source.statement,
    "Assume routine changes are approved; ask only for design questions or missing business requirements.",
  );
  assert.equal(proof.replay.adapterCallCount, 0);
  assert.equal(proof.architectureProgressionAllowed, true);
  assert.equal(
    sha256Digest(await readBytes("project/history/1.4.0/requirements-baseline.json")),
    expected.previousRequirementsBaseline,
  );
  assert.equal(
    sha256Digest(await readBytes("project/history/1.4.0/project-overview-baseline.json")),
    expected.previousProjectOverviewBaseline,
  );

  const firstBytes = [requirementsBytes, overviewBytes, markdownBytes, approvalBytes, proofBytes];
  assert.deepEqual(promote(), first);
  assert.deepEqual(await Promise.all([
    readDogfoodBytes("requirements-replay-v2/requirements-baseline.json"),
    readDogfoodBytes("requirements-replay-v2/project-overview-baseline.json"),
    readDogfoodBytes("requirements-replay-v2/ProjectOverview.md"),
    readDogfoodBytes("requirements-gate-owner-approval.json"),
    readDogfoodBytes("requirements-gate-promotion-proof.json"),
  ]), firstBytes);
  assert.deepEqual(await Promise.all([
    readBytes("project/requirements-baseline.json"),
    readBytes("project/project-overview-baseline.json"),
    readBytes("ProjectOverview.md"),
  ]), currentPairBefore);
});
