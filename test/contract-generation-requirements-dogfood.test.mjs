import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateProjectOverviewArtifact } from "../src/project-overview-artifact-validator.mjs";
import {
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/contract-generation/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

test("ContractGeneration RequirementsGathering resumes exact clarification and produces one low-churn Gate candidate", async () => {
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [`${dogfood}materialize-requirements-change.mjs`],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
  assert.equal(output.status, "REQUIREMENTS_GATE_CANDIDATE");
  assert.equal(output.adapterCalls, 1);
  assert.equal(output.replayAdapterCalls, 0);
  assert.equal(output.progressionAllowed, false);

  const [
    baseline,
    overviewBaseline,
    request,
    response,
    continuation,
    changeSet,
    overviewChange,
    nativeBundle,
    invocation,
    result,
    executionProof,
    gateCandidate,
  ] = await Promise.all([
    readJson("project/history/1.2.0/requirements-baseline.json"),
    readJson("project/history/1.2.0/project-overview-baseline.json"),
    readJson(`${dogfood}clarification-request.json`),
    readJson(`${dogfood}clarification-response.json`),
    readJson(`${dogfood}requirements-continuation.json`),
    readJson(`${dogfood}requirements-change-set.json`),
    readJson(`${dogfood}project-overview-change-set-draft.json`),
    readJson(`${dogfood}native-source-bundle.json`),
    readJson(`${dogfood}requirements-change.invocation.json`),
    readJson(`${dogfood}requirements-change.result.json`),
    readJson(`${dogfood}requirements-change.execution-proof.json`),
    readJson(`${dogfood}requirements-gate-candidate.json`),
  ]);

  validateRequirementsArtifact(changeSet);
  validateProjectOverviewArtifact(overviewChange);
  assert.equal(changeSet.baseline.digest, await digest("project/history/1.2.0/requirements-baseline.json"));
  assert.equal(overviewChange.baseOverview.digest, await digest("project/history/1.2.0/project-overview-baseline.json"));
  assert.equal(response.request.digest, await digest(`${dogfood}clarification-request.json`));
  assert.equal(continuation.clarificationRequest.digest, response.request.digest);
  assert.equal(response.responses.length, 4);
  for (const answer of response.responses) {
    const question = request.questions.find(({ id }) => id === answer.questionId);
    assert.ok(question);
    assert.equal(typeof answer.answer, "string");
    assert.equal(question.options.includes(answer.answer), true);
    assert.match(answer.answer, /\(recommended\)$/);
  }

  assert.equal(invocation.inputs["requirements-baseline"][0].digest, changeSet.baseline.digest);
  assert.equal(
    invocation.inputs["project-overview-baseline"][0].digest,
    overviewChange.baseOverview.digest,
  );
  assert.equal(result.outcome, "change_set_drafted");
  assert.equal(executionProof.adapterCallCount, 1);
  assert.equal(executionProof.replayAdapterCallCount, 0);

  assert.equal(
    output.requirementsChangeSetDigest,
    await digest(`${dogfood}requirements-change-set.json`),
  );
  assert.equal(
    output.projectOverviewChangeSetDigest,
    await digest(`${dogfood}project-overview-change-set-draft.json`),
  );
  assert.equal(
    output.projectOverviewMarkdownDigest,
    await digest(`${dogfood}candidate/ProjectOverview.md`),
  );
  assert.equal(
    output.nativeSourceBundleDigest,
    await digest(`${dogfood}native-source-bundle.json`),
  );
  assert.equal(
    output.checkpointDigest,
    await digest(`${dogfood}requirements-change.checkpoint.json`),
  );
  assert.equal(gateCandidate.progressionAllowed, false);
  assert.equal(
    gateCandidate.exactBindings.RequirementsChangeSet,
    output.requirementsChangeSetDigest,
  );

  assert.deepEqual(changeSet.changedSections, [
    "acceptanceCriteria",
    "assumptions",
    "capabilities",
    "constraints",
    "currentStatus",
    "deliverables",
    "dependencies",
    "nonFunctionalRequirements",
    "requiredEvidence",
    "risks",
    "scope",
    "sourceRefs",
    "terminology",
    "userJourneys",
    "userStories",
  ]);
  assert.deepEqual(overviewChange.changedSections, [
    "keyCapabilities",
    "scope",
    "constraints",
    "nonFunctionalRequirements",
    "terminology",
    "currentStatus",
  ]);

  const collections = [
    "acceptanceCriteria",
    "assumptions",
    "businessObjectives",
    "capabilities",
    "constraints",
    "nonFunctionalRequirements",
    "nonGoals",
    "scope",
    "stakeholders",
    "successMetrics",
    "terminology",
    "userJourneys",
    "userStories",
    "users",
  ];
  for (const collection of collections) {
    const target = new Map(
      changeSet.replacement[collection].map((item) => [item.id, item]),
    );
    for (const existing of baseline.requirements[collection]) {
      assert.deepEqual(target.get(existing.id), existing);
    }
  }
  assert.equal(
    changeSet.replacement.capabilities.some(
      ({ id }) => id === "CAP-DEV-CONTRACT-GENERATION-001",
    ),
    true,
  );
  assert.equal(
    changeSet.replacement.acceptanceCriteria.filter(({ id }) =>
      id.startsWith("AC-DEV-CONTRACT-")
    ).length,
    8,
  );
  assert.match(
    changeSet.replacement.currentStatus.summary,
    /live JSON Schema 2020-12 path first/,
  );

  assert.deepEqual(overviewChange.overview, deriveProjectOverview(changeSet.replacement));
  assert.equal(
    (await readBytes(`${dogfood}candidate/ProjectOverview.md`)).equals(
      renderProjectOverviewMarkdownBytes(overviewChange.overview),
    ),
    true,
  );
  assert.deepEqual(nativeBundle.canonicalOutputs, [
    { artifactId: changeSet.changeSetId, digest: output.requirementsChangeSetDigest },
    { artifactId: overviewChange.changeSetId, digest: output.projectOverviewChangeSetDigest },
  ]);
  assert.equal(nativeBundle.normalization.warnings.length, 1);
});
