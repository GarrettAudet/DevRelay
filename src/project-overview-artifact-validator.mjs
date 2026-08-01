import { readFileSync } from "node:fs";

import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  PROJECT_OVERVIEW_SECTIONS,
  canonicalizeProjectOverviewBody,
  deriveProjectOverview,
  diffProjectOverviewSections,
  renderProjectOverviewMarkdownBytes,
} from "./project-overview.mjs";
import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const projectOverviewArtifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL(
        "../contracts/project-overview-artifacts.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  [
    JSON.parse(
      readFileSync(
        new URL(
          "../contracts/shared-artifacts.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    JSON.parse(
      readFileSync(
        new URL(
          "../contracts/requirements-gathering-artifacts.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ],
);

export class ProjectOverviewArtifactValidationError extends Error {
  constructor(message) {
    super(`project overview artifact is invalid: ${message}`);
    this.name = "ProjectOverviewArtifactValidationError";
    this.code = "DR1800";
  }
}

function fail(message) {
  throw new ProjectOverviewArtifactValidationError(message);
}

function refKey(ref) {
  return [ref?.artifactId, ref?.digest].join("\u0000");
}

function sameRef(left, right) {
  return refKey(left) === refKey(right);
}

function assertRef(label, actual, expected) {
  if (!sameRef(actual, expected)) {
    fail(`${label} does not match the exact content-addressed artifact`);
  }
}

function assertJsonEqual(label, actual, expected) {
  if (canonicalJsonDigest(actual) !== canonicalJsonDigest(expected)) {
    fail(`${label} is not the exact canonical value`);
  }
}

function assertContractIdentity(label, actual, expected) {
  if (
    actual.id !== expected.id ||
    actual.version !== expected.version ||
    actual.contractDigest !== expected.contractDigest
  ) {
    fail(`${label} does not identify the supported contract`);
  }
}

function assertCanonicalOverview(overview) {
  let canonical;
  try {
    canonical = canonicalizeProjectOverviewBody(overview);
  } catch (error) {
    fail(error.message);
  }
  assertJsonEqual("overview body", overview, canonical);
}

function assertUniqueIds(overview) {
  for (const section of [
    "businessObjectives",
    "users",
    "keyCapabilities",
    "successMetrics",
    "scope",
    "nonGoals",
    "constraints",
    "nonFunctionalRequirements",
    "terminology",
  ]) {
    const seen = new Set();
    for (const item of overview[section]) {
      if (seen.has(item.id)) {
        fail(`${section} contains duplicate stable ID ${item.id}`);
      }
      seen.add(item.id);
    }
  }
}

function assertChangedSectionOrder(changedSections) {
  let previous = -1;
  for (const section of changedSections) {
    const index = PROJECT_OVERVIEW_SECTIONS.indexOf(section);
    if (index <= previous) {
      fail("changedSections is not in canonical section order");
    }
    previous = index;
  }
}

function validateIntrinsic(artifact) {
  assertContractIdentity(
    "projection",
    artifact.projection,
    PROJECT_OVERVIEW_PROJECTION,
  );
  assertContractIdentity(
    "renderer",
    artifact.renderedDocument.renderer,
    PROJECT_OVERVIEW_RENDERER,
  );
  assertCanonicalOverview(artifact.overview);
  assertUniqueIds(artifact.overview);
  if (artifact.kind === "ProjectOverviewChangeSetDraft") {
    assertChangedSectionOrder(artifact.changedSections);
  }
}

export function validateProjectOverviewArtifact(artifact) {
  if (!projectOverviewArtifactValidator(artifact)) {
    throw new ProjectOverviewArtifactValidationError(
      validationDetail(projectOverviewArtifactValidator),
    );
  }
  validateIntrinsic(artifact);
  return artifact;
}

export function validateProjectOverviewRenderedDocument({
  projectOverviewArtifact,
  renderedDocumentBytes,
}) {
  validateProjectOverviewArtifact(projectOverviewArtifact);
  if (
    !Buffer.isBuffer(renderedDocumentBytes) &&
    !(renderedDocumentBytes instanceof Uint8Array)
  ) {
    fail("rendered ProjectOverview.md must be supplied as raw bytes");
  }
  const actual = Buffer.from(renderedDocumentBytes);
  if (
    sha256Digest(actual) !==
    projectOverviewArtifact.renderedDocument.artifact.digest
  ) {
    fail("rendered ProjectOverview.md bytes do not match their declared digest");
  }
  const expected = renderProjectOverviewMarkdownBytes(
    projectOverviewArtifact.overview,
  );
  if (!actual.equals(expected)) {
    fail(
      "rendered ProjectOverview.md is not the exact deterministic UTF-8/NFC/LF projection",
    );
  }
  return projectOverviewArtifact;
}

export function validateProjectOverviewDraftAgainstRequirements({
  projectOverviewDraft,
  requirementsDraft,
  requirementsDraftRef,
}) {
  validateProjectOverviewArtifact(projectOverviewDraft);
  if (requirementsDraft?.kind !== "RequirementsDraft") {
    fail("draft validation requires a RequirementsDraft");
  }
  assertRef(
    "requirementsDraft",
    projectOverviewDraft.requirementsDraft,
    requirementsDraftRef,
  );
  assertJsonEqual(
    "draft projection",
    projectOverviewDraft.overview,
    deriveProjectOverview(requirementsDraft.requirements),
  );
  return projectOverviewDraft;
}

export function validateProjectOverviewChangeSetAgainstBaseline({
  projectOverviewChangeSet,
  requirementsChangeSet,
  requirementsChangeSetRef,
  baseOverview,
  baseOverviewRef,
}) {
  validateProjectOverviewArtifact(projectOverviewChangeSet);
  validateProjectOverviewArtifact(baseOverview);
  if (requirementsChangeSet?.kind !== "RequirementsChangeSet") {
    fail("change validation requires a RequirementsChangeSet");
  }
  if (baseOverview.kind !== "ProjectOverviewBaseline") {
    fail("change validation requires a ProjectOverviewBaseline");
  }
  assertRef(
    "baseOverview",
    projectOverviewChangeSet.baseOverview,
    baseOverviewRef,
  );
  assertRef(
    "requirementsChangeSet",
    projectOverviewChangeSet.requirementsChangeSet,
    requirementsChangeSetRef,
  );
  const expectedOverview = deriveProjectOverview(
    requirementsChangeSet.replacement,
  );
  assertJsonEqual(
    "change-set projection",
    projectOverviewChangeSet.overview,
    expectedOverview,
  );
  const expectedSections = diffProjectOverviewSections(
    baseOverview.overview,
    expectedOverview,
  );
  assertJsonEqual(
    "changedSections",
    projectOverviewChangeSet.changedSections,
    expectedSections,
  );
  const expectedDisposition =
    expectedSections.length === 0 ? "unchanged" : "changed";
  if (projectOverviewChangeSet.changeDisposition !== expectedDisposition) {
    fail(`changeDisposition must be ${expectedDisposition}`);
  }
  return projectOverviewChangeSet;
}

function semverParts(version) {
  return version.split(".").map((part) => BigInt(part));
}

function isGreaterVersion(candidate, previous) {
  const left = semverParts(candidate);
  const right = semverParts(previous);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] > right[index];
    }
  }
  return false;
}

export function validateProjectOverviewBaselinePromotion({
  projectOverviewBaseline,
  approvedCandidate,
  approvedCandidateRef,
  requirementsBaseline,
  requirementsBaselineRef,
  previousBaseline,
  previousBaselineRef,
}) {
  validateProjectOverviewArtifact(projectOverviewBaseline);
  validateProjectOverviewArtifact(approvedCandidate);
  if (requirementsBaseline?.kind !== "RequirementsBaseline") {
    fail("promotion requires a RequirementsBaseline");
  }
  assertRef(
    "approvedOverviewCandidate",
    projectOverviewBaseline.approvedOverviewCandidate,
    approvedCandidateRef,
  );
  assertRef(
    "requirementsBaseline",
    projectOverviewBaseline.requirementsBaseline,
    requirementsBaselineRef,
  );
  assertJsonEqual(
    "promoted overview",
    projectOverviewBaseline.overview,
    approvedCandidate.overview,
  );
  assertJsonEqual(
    "promoted rendered document",
    projectOverviewBaseline.renderedDocument,
    approvedCandidate.renderedDocument,
  );
  assertJsonEqual(
    "requirements baseline projection",
    projectOverviewBaseline.overview,
    deriveProjectOverview(requirementsBaseline.requirements),
  );

  if (approvedCandidate.kind === "ProjectOverviewDraft") {
    if (
      previousBaseline !== undefined ||
      previousBaselineRef !== undefined ||
      projectOverviewBaseline.supersedes !== undefined
    ) {
      fail("initial promotion cannot supersede an overview baseline");
    }
    return projectOverviewBaseline;
  }

  if (approvedCandidate.kind !== "ProjectOverviewChangeSetDraft") {
    fail("approved candidate kind is not promotable");
  }
  if (!previousBaseline || !previousBaselineRef) {
    fail("change promotion requires the exact previous overview baseline");
  }
  validateProjectOverviewArtifact(previousBaseline);
  assertRef("candidate baseOverview", approvedCandidate.baseOverview, previousBaselineRef);
  assertRef("supersedes", projectOverviewBaseline.supersedes, previousBaselineRef);
  if (projectOverviewBaseline.baselineId === previousBaseline.baselineId) {
    fail("change promotion must issue a new overview baseline ID");
  }
  if (!isGreaterVersion(projectOverviewBaseline.version, previousBaseline.version)) {
    fail("change promotion must advance the overview baseline version");
  }
  if (
    sameRef(
      projectOverviewBaseline.requirementsBaseline,
      previousBaseline.requirementsBaseline,
    )
  ) {
    fail("change promotion must pair with the newly approved requirements baseline");
  }
  const expectedSections = diffProjectOverviewSections(
    previousBaseline.overview,
    approvedCandidate.overview,
  );
  assertJsonEqual(
    "approved candidate changedSections",
    approvedCandidate.changedSections,
    expectedSections,
  );
  const expectedDisposition =
    expectedSections.length === 0 ? "unchanged" : "changed";
  if (approvedCandidate.changeDisposition !== expectedDisposition) {
    fail(`approved candidate changeDisposition must be ${expectedDisposition}`);
  }
  return projectOverviewBaseline;
}
