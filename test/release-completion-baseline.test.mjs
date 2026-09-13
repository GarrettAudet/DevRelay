import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { validateRequirementsArtifact } from "../src/requirements-artifact-validator.mjs";
import { validateProjectOverviewRenderedDocument } from "../src/project-overview-artifact-validator.mjs";
import { deriveProjectOverview } from "../src/project-overview.mjs";

test("release repairs preserve the exact approved global requirements/overview pair", () => {
  const bytes = readFileSync(new URL("../project/requirements-baseline.json", import.meta.url));
  const requirements = validateRequirementsArtifact(JSON.parse(bytes));
  const overview = JSON.parse(readFileSync(new URL("../project/project-overview-baseline.json", import.meta.url)));
  assert.equal(overview.version, requirements.version);
  assert.equal(overview.requirementsBaseline.artifactId, requirements.baselineId);
  assert.equal(overview.requirementsBaseline.digest, sha256Digest(bytes));
  assert.equal(canonicalJsonDigest(overview.overview), canonicalJsonDigest(deriveProjectOverview(requirements.requirements)));
  validateProjectOverviewRenderedDocument({
    projectOverviewArtifact: overview,
    renderedDocumentBytes: readFileSync(new URL("../ProjectOverview.md", import.meta.url)),
  });
  const ids = new Set(requirements.requirements.acceptanceCriteria.map(({ id }) => id));
  for (const id of ["AC-SIM-CLI-001", "AC-DEV-OSS-SECURITY-001", "AC-SIM-WINDOWS-E2E-001"]) {
    assert.ok(ids.has(id), `repair scope must already exist in approved requirements: ${id}`);
  }
});
