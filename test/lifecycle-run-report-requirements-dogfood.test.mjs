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
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const dogfood = new URL("dogfood/lifecycle-run-report/", root);
const readBytes = (name) => readFile(new URL(name, dogfood));
const readJson = async (name) =>
  JSON.parse(await readFile(new URL(name, dogfood), "utf8"));

const expectedDigests = Object.freeze({
  requirementsChangeSet:
    "sha256:e5b3e637d80093b0ed05497f1b71903993f7230a43b1fb6d83628c9fccbbb8e1",
  projectOverviewChangeSet:
    "sha256:dce8060598f7e3139debd14b3090c9f7990253eb59b29c2295dc67531a7ff5b1",
  projectOverviewMarkdown:
    "sha256:a592c999205b8ffba0eb13327cc0f680e091910e9638b82bb6bb5ffd6ccdd930",
  nativeSourceBundle:
    "sha256:d53ea72274ccf9a67ba10f15378230a2e166c8123622aa4ba32202153753b16c",
  terminalCheckpoint:
    "sha256:49fad8f1cbfeb584d2404eb437da68ab028bcf7e60605c766cf041e489b8f606",
});

const lifecycleScopeIds = Object.freeze([
  "SCOPE-DEV-V1-010-REQUIREMENTS-GATHERING",
  "SCOPE-DEV-V1-020-REQUIREMENTS-GATE",
  "SCOPE-DEV-V1-030-ARCHITECTURE-DISCOVERY",
  "SCOPE-DEV-V1-040-ARCHITECTURE-DESIGN",
  "SCOPE-DEV-V1-050-ARCHITECTURE-GATE",
  "SCOPE-DEV-V1-060-CONTRACT-GENERATION",
  "SCOPE-DEV-V1-065-CONTRACT-GATE",
  "SCOPE-DEV-V1-070-WORK-BREAKDOWN",
  "SCOPE-DEV-V1-075-WORK-BREAKDOWN-GATE",
  "SCOPE-DEV-V1-080-WORK-DEPENDENCY-ANALYSIS",
  "SCOPE-DEV-V1-085-WORK-DEPENDENCY-GATE",
  "SCOPE-DEV-V1-090-SPECIALIST-ASSIGNMENT",
  "SCOPE-DEV-V1-095-SPECIALIST-ASSIGNMENT-GATE",
  "SCOPE-DEV-V1-100-WORK-EXECUTION",
  "SCOPE-DEV-V1-110-WORK-ITEM-VERIFICATION",
  "SCOPE-DEV-V1-120-CHANGE-INTEGRATION",
  "SCOPE-DEV-V1-130-SYSTEM-VERIFICATION",
  "SCOPE-DEV-V1-140-BUSINESS-ACCEPTANCE",
]);

test("V1 lifecycle requirements candidate is exact, low-churn, and replayable", async () => {
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
    previousOverviewBaseline,
    gateReview,
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
    readJson("../../project/history/1.1.0/project-overview-baseline.json"),
    readFile(new URL("requirements-gate-review.md", dogfood), "utf8"),
  ]);

  assert.equal(
    sha256Digest(await readBytes("requirements-change-set.json")),
    expectedDigests.requirementsChangeSet,
  );
  assert.equal(
    sha256Digest(await readBytes("project-overview-change-set-draft.json")),
    expectedDigests.projectOverviewChangeSet,
  );
  assert.equal(
    sha256Digest(await readBytes("candidate/ProjectOverview.md")),
    expectedDigests.projectOverviewMarkdown,
  );
  assert.equal(
    sha256Digest(await readBytes("native-source-bundle.json")),
    expectedDigests.nativeSourceBundle,
  );
  assert.equal(
    sha256Digest(await readBytes("requirements-change.checkpoint.json")),
    expectedDigests.terminalCheckpoint,
  );

  const bytesByArtifactId = new Map();
  const add = async (artifactId, name) => {
    bytesByArtifactId.set(artifactId, await readBytes(name));
  };
  await Promise.all([
    add(invocation.inputs.goal[0].artifactId, "goal.json"),
    add(invocation.inputs["project-context"][0].artifactId, "project-context.json"),
    bytesByArtifactId.set(
      invocation.inputs["repository-snapshot"][0].artifactId,
      await readFile(new URL("dogfood/contract-generation/repository-snapshot.json", root)),
    ),
    add(
      invocation.inputs["requirements-baseline"][0].artifactId,
      "../../project/history/1.1.0/requirements-baseline.json",
    ),
    add(
      invocation.inputs["project-overview-baseline"][0].artifactId,
      "../../project/history/1.1.0/project-overview-baseline.json",
    ),
    add(
      previousOverviewBaseline.renderedDocument.artifact.artifactId,
      "../../project/history/1.1.0/ProjectOverview.md",
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
      add(artifact.artifactId, path.replace("dogfood/lifecycle-run-report/", "")),
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
  assert.equal(proof.adapterMaturity, "fixture-conformant");
  assert.equal(proof.requirementsGateStatus, "awaiting-owner-approval");
  assert.equal(proof.architectureProgressionAllowed, false);
  assert.deepEqual(changeSet.changedSections, [
    "acceptanceCriteria",
    "assumptions",
    "businessObjectives",
    "capabilities",
    "constraints",
    "currentStatus",
    "deliverables",
    "dependencies",
    "nonFunctionalRequirements",
    "nonGoals",
    "requiredEvidence",
    "risks",
    "scope",
    "sourceRefs",
    "successMetrics",
    "terminology",
    "userJourneys",
    "userStories",
    "users",
  ]);
  assert.equal(changeSet.changedSections.includes("purpose"), false);
  assert.equal(changeSet.changedSections.includes("stakeholders"), false);
  assert.deepEqual(
    changeSet.replacement.scope
      .filter(({ id }) => id.startsWith("SCOPE-DEV-V1-"))
      .map(({ id }) => id),
    lifecycleScopeIds,
  );

  const fullScopeCriterion = changeSet.replacement.acceptanceCriteria.find(
    ({ id }) => id === "AC-DEV-FULL-V1-SCOPE-001",
  );
  const assignmentCriterion = changeSet.replacement.acceptanceCriteria.find(
    ({ id }) => id === "AC-DEV-SPECIALIST-BOUNDARY-001",
  );
  const frontierCriterion = changeSet.replacement.acceptanceCriteria.find(
    ({ id }) => id === "AC-DEV-FRONTIER-LOOP-001",
  );
  const reportAuthorityCriterion = changeSet.replacement.acceptanceCriteria.find(
    ({ id }) => id === "AC-DEV-RUN-NON-AUTHORITY-001",
  );
  assert.match(fullScopeCriterion.statement, /exactly RequirementsGathering.*BusinessAcceptanceGate/i);
  assert.doesNotMatch(fullScopeCriterion.statement, /fourteen/i);
  assert.match(
    assignmentCriterion.statement,
    /provider-neutral specialist profile.*without selecting readiness.*concrete provider/i,
  );
  assert.match(frontierCriterion.statement, /immutable WorkDependencyBaseline.*integrated-completion facts/i);
  assert.match(
    reportAuthorityCriterion.statement,
    /cannot route modules.*approve Gates.*alter progression/i,
  );

  const projectedOverview = deriveProjectOverview(changeSet.replacement);
  assert.deepEqual(projectedOverview, overviewChange.overview);
  assert.deepEqual(
    renderProjectOverviewMarkdownBytes(projectedOverview),
    await readBytes("candidate/ProjectOverview.md"),
  );
  assert.deepEqual(
    nativeBundle.sources.map(({ role }) => role),
    ["owner-decision", "capability-evidence", "proposal", "specification"],
  );
  assert.match(nativeBundle.normalization.warnings[0], /fixture-conformant/i);
  assert.match(gateReview, /awaiting owner approval/i);
  assert.match(gateReview, /replaces obsolete fourteen-component/i);
});

test("owner approval promotes one exact restart-safe baseline pair", async () => {
  const [
    approvalBytes,
    requirementsBaselineBytes,
    projectOverviewBaselineBytes,
    projectOverviewMarkdownBytes,
    proofBytes,
    previousRequirementsBytes,
    previousOverviewBytes,
    previousMarkdownBytes,
  ] = await Promise.all([
    readBytes("requirements-gate-owner-approval.json"),
    readBytes("../../project/history/1.2.0/requirements-baseline.json"),
    readBytes("../../project/history/1.2.0/project-overview-baseline.json"),
    readBytes("../../project/history/1.2.0/ProjectOverview.md"),
    readBytes("requirements-gate-promotion-proof.json"),
    readBytes("../../project/history/1.1.0/requirements-baseline.json"),
    readBytes("../../project/history/1.1.0/project-overview-baseline.json"),
    readBytes("../../project/history/1.1.0/ProjectOverview.md"),
  ]);
  const approval = JSON.parse(approvalBytes);
  const requirementsBaseline = JSON.parse(requirementsBaselineBytes);
  const projectOverviewBaseline = JSON.parse(projectOverviewBaselineBytes);
  const proof = JSON.parse(proofBytes);

  assert.equal(
    sha256Digest(approvalBytes),
    "sha256:0051aeca68c72069b7030b518a8b43021f0adb4f7288809532b3891fba593afe",
  );
  assert.equal(
    sha256Digest(requirementsBaselineBytes),
    "sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1",
  );
  assert.equal(
    sha256Digest(projectOverviewBaselineBytes),
    "sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e",
  );
  assert.equal(
    sha256Digest(proofBytes),
    "sha256:f2207df210ac48f17aca2077aa82e437003bc1f07f89df91af13140290829242",
  );
  assert.equal(
    sha256Digest(projectOverviewMarkdownBytes),
    expectedDigests.projectOverviewMarkdown,
  );
  assert.deepEqual(projectOverviewMarkdownBytes, await readBytes("candidate/ProjectOverview.md"));
  assert.equal(
    sha256Digest(previousRequirementsBytes),
    "sha256:4b072ef574875f3a5659d5e0a33a13564820e32ba866273f6ff2f460b60759b0",
  );
  assert.equal(
    sha256Digest(previousOverviewBytes),
    "sha256:b915cba9e0af8480229611aff735f265d38bd8c1c4d5fabf19b64432549c16bf",
  );
  assert.equal(
    sha256Digest(previousMarkdownBytes),
    "sha256:4b9385d583f5b9d51782dd9a3a6e0b7a7daa08416e36b671153f7349e440c86a",
  );

  assert.equal(approval.authority, "project-owner");
  assert.equal(approval.decision, "approve");
  assert.equal(approval.source.statement, "I approve");
  assert.deepEqual(approval.authorizedActions, [
    "atomic-requirements-project-overview-promotion",
    "progress-to-architecture-design",
  ]);
  assert.deepEqual(approval.approvedCandidate, {
    requirementsChangeSet: expectedDigests.requirementsChangeSet,
    projectOverviewChangeSet: expectedDigests.projectOverviewChangeSet,
    projectOverviewMarkdown: expectedDigests.projectOverviewMarkdown,
    nativeSourceBundle: expectedDigests.nativeSourceBundle,
    terminalCheckpoint: expectedDigests.terminalCheckpoint,
    repositorySnapshot:
      "sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73",
    repositoryRevision: "4bda7fe707ba102bd22fe0001c83aa13ec03b0c5",
    repositoryTree:
      "sha256:6d27786016084029b7148e33d7200656366120cd986f046d32b9e406c12b33dd",
  });

  assert.equal(requirementsBaseline.version, "1.2.0");
  assert.equal(projectOverviewBaseline.version, "1.2.0");
  assert.equal(
    projectOverviewBaseline.requirementsBaseline.digest,
    sha256Digest(requirementsBaselineBytes),
  );
  assert.equal(
    requirementsBaseline.approvalEvidence[0].digest,
    sha256Digest(approvalBytes),
  );
  assert.equal(
    projectOverviewBaseline.approvalEvidence[0].digest,
    sha256Digest(approvalBytes),
  );
  assert.equal(proof.replay.adapterCallCount, 0);
  assert.equal(proof.architectureProgressionAllowed, true);

});
