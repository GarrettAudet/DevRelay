import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateProjectOverviewArtifact } from "../src/project-overview-artifact-validator.mjs";
import {
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";
import { V1_LIFECYCLE } from "../project/project-baseline-data.mjs";

const root = new URL("../", import.meta.url);

async function json(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

test("the canonical project baseline contains the exact approved V1 lifecycle", async () => {
  const [requirementsBaseline, overviewBaseline, overviewBytes, promotion] =
    await Promise.all([
      json("project/requirements-baseline.json"),
      json("project/project-overview-baseline.json"),
      readFile(new URL("ProjectOverview.md", root)),
      json("project/requirements-promotion.commit.json"),
    ]);

  validateRequirementsArtifact(requirementsBaseline);
  validateProjectOverviewArtifact(overviewBaseline);

  const lifecycleScope = requirementsBaseline.requirements.scope.filter(({ id }) =>
    id.startsWith("SCOPE-DEV-V1-"),
  );
  assert.deepEqual(
    lifecycleScope.map(({ id }) => id),
    V1_LIFECYCLE.map(({ id }) => id),
  );
  for (const lifecycle of V1_LIFECYCLE) {
    const scope = lifecycleScope.find(
      ({ id }) => id === lifecycle.id,
    );
    assert.match(scope.statement, new RegExp(`^${lifecycle.name} \\[`));
    assert.equal(
      scope.statement.includes("; conditional"),
      lifecycle.conditional,
    );
  }
  assert.equal(requirementsBaseline.version, "2.2.0");
  assert.equal(overviewBaseline.version, "2.2.0");
  assert.equal(
    sha256Digest(await readFile(new URL("project/requirements-baseline.json", root))),
    promotion.next.requirementsBaseline.digest,
  );
  assert.equal(
    sha256Digest(await readFile(new URL("project/project-overview-baseline.json", root))),
    promotion.next.projectOverviewBaseline.digest,
  );
  assert.equal(
    sha256Digest(
      await readFile(new URL("project/history/2.1.0/requirements-baseline.json", root)),
    ),
    promotion.previous.requirementsBaseline.digest,
  );
  assert.equal(
    sha256Digest(
      await readFile(new URL("project/history/2.1.0/project-overview-baseline.json", root)),
    ),
    promotion.previous.projectOverviewBaseline.digest,
  );

  assert.deepEqual(
    overviewBaseline.overview,
    deriveProjectOverview(requirementsBaseline.requirements),
  );
  assert.equal(
    overviewBytes.equals(
      renderProjectOverviewMarkdownBytes(overviewBaseline.overview),
    ),
    true,
  );
  assert.equal(
    overviewBaseline.renderedDocument.artifact.digest,
    sha256Digest(overviewBytes),
  );
  assert.deepEqual(
    overviewBaseline.approvalEvidence,
    requirementsBaseline.approvalEvidence,
  );
});

test("the approved WorkDependencyAnalysis change supersedes the exact historical pair", async () => {
  const [
    invocation,
    currentRequirements,
    currentOverview,
    historicalRequirementsBytes,
    historicalOverviewBytes,
    promotionProof,
  ] =
    await Promise.all([
      json("dogfood/work-dependency-analysis/requirements-change.invocation.json"),
      json("project/history/1.1.0/requirements-baseline.json"),
      json("project/history/1.1.0/project-overview-baseline.json"),
      readFile(new URL("project/history/1.0.0/requirements-baseline.json", root)),
      readFile(
        new URL("project/history/1.0.0/project-overview-baseline.json", root),
      ),
      json(
        "dogfood/work-dependency-analysis/requirements-gate-promotion-proof.json",
      ),
    ]);

  assert.equal(
    invocation.inputs["requirements-baseline"][0].digest,
    sha256Digest(historicalRequirementsBytes),
  );
  assert.equal(
    invocation.inputs["project-overview-baseline"][0].digest,
    sha256Digest(historicalOverviewBytes),
  );
  assert.deepEqual(currentRequirements.supersedes, {
    artifactId: invocation.inputs["requirements-baseline"][0].artifactId,
    digest: sha256Digest(historicalRequirementsBytes),
  });
  assert.deepEqual(currentOverview.supersedes, {
    artifactId: invocation.inputs["project-overview-baseline"][0].artifactId,
    digest: sha256Digest(historicalOverviewBytes),
  });
  assert.equal(
    currentRequirements.approvedCandidate.digest,
    "sha256:fd63abe4b76235b72c78624f380e3f0aacccbabdcd75f25de54523a63b583a5b",
  );
  assert.equal(promotionProof.status, "pass");
  assert.equal(promotionProof.replay.adapterCallCount, 0);
  assert.equal(promotionProof.architectureProgressionAllowed, true);
});
