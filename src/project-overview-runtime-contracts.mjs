import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  validateProjectOverviewArtifact,
  validateProjectOverviewBaselinePromotion,
  validateProjectOverviewChangeSetAgainstBaseline,
  validateProjectOverviewDraftAgainstRequirements,
} from "./project-overview-artifact-validator.mjs";
import {
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "./project-overview.mjs";

const PROJECT_OVERVIEW_SCHEMAS = Object.freeze([
  "https://devrelay.dev/artifacts/project-overview-draft/v1",
  "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
]);

function fail(message) {
  throw new Error(`project overview runtime lineage failed: ${message}`);
}

function oneLoaded(group, port) {
  const entries = group?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.digest === right?.digest
  );
}

function assertRef(label, actual, expected) {
  if (!sameRef(actual, expected)) {
    fail(`${label} does not match the exact runtime artifact`);
  }
}

function requireLoaded(group, port, label) {
  const loaded = oneLoaded(group, port);
  if (!loaded) {
    fail(`${label} requires one ${port} artifact`);
  }
  return loaded;
}

async function verifyRenderedDocument(value, context) {
  if (typeof context.loadBytes !== "function") {
    fail("rendered ProjectOverview.md verification requires raw-byte loading");
  }
  const ref = value.renderedDocument.artifact;
  const supplied = await context.loadBytes(ref);
  if (!Buffer.isBuffer(supplied) && !(supplied instanceof Uint8Array)) {
    fail("ProjectOverview.md loader did not return raw bytes");
  }
  const actual = Buffer.from(supplied);
  if (sha256Digest(actual) !== ref.digest) {
    fail("ProjectOverview.md bytes do not match their declared digest");
  }
  const expected = renderProjectOverviewMarkdownBytes(value.overview);
  if (!actual.equals(expected)) {
    fail(
      "ProjectOverview.md is not the exact deterministic UTF-8/NFC/LF projection",
    );
  }
}

function assertBaselineRequirements(value, context) {
  const requirements = oneLoaded(
    context.loadedInputs,
    "requirements-baseline",
  );
  if (!requirements) {
    fail(
      "ProjectOverviewBaseline input requires its exact paired RequirementsBaseline input",
    );
  }
  assertRef(
    "ProjectOverviewBaseline requirementsBaseline",
    value.requirementsBaseline,
    requirements.ref,
  );
  const expected = deriveProjectOverview(requirements.value.requirements);
  if (
    canonicalJsonDigest(value.overview) !== canonicalJsonDigest(expected)
  ) {
    fail("ProjectOverviewBaseline does not project the loaded RequirementsBaseline");
  }
}

function candidateForPromotion(context) {
  const candidates = [
    oneLoaded(context.loadedInputs, "project-overview-draft"),
    oneLoaded(context.loadedInputs, "project-overview-change-set-draft"),
  ].filter(Boolean);
  if (candidates.length !== 1) {
    fail("overview promotion requires exactly one approved candidate");
  }
  return candidates[0];
}

function requirementsForPromotion(context) {
  return (
    oneLoaded(context.loadedArtifacts, "requirements-baseline") ??
    oneLoaded(context.loadedInputs, "requirements-baseline")
  );
}

function assertBaselinePromotion(value, context) {
  const candidate = candidateForPromotion(context);
  const requirements = requirementsForPromotion(context);
  if (!requirements) {
    fail("ProjectOverviewBaseline output requires a RequirementsBaseline");
  }
  const previous =
    candidate.value.kind === "ProjectOverviewChangeSetDraft"
      ? requireLoaded(
          context.loadedInputs,
          "project-overview-baseline",
          "overview change promotion",
        )
      : undefined;
  validateProjectOverviewBaselinePromotion({
    projectOverviewBaseline: value,
    approvedCandidate: candidate.value,
    approvedCandidateRef: candidate.ref,
    requirementsBaseline: requirements.value,
    requirementsBaselineRef: requirements.ref,
    previousBaseline: previous?.value,
    previousBaselineRef: previous?.ref,
  });
}

async function validateProjectOverviewRuntimeArtifact(value, context) {
  validateProjectOverviewArtifact(value);
  await verifyRenderedDocument(value, context);

  if (context.phase === "output" && value.kind === "ProjectOverviewDraft") {
    const requirements = requireLoaded(
      context.loadedArtifacts,
      "requirements-draft",
      "ProjectOverviewDraft",
    );
    validateProjectOverviewDraftAgainstRequirements({
      projectOverviewDraft: value,
      requirementsDraft: requirements.value,
      requirementsDraftRef: requirements.ref,
    });
  }

  if (
    context.phase === "output" &&
    value.kind === "ProjectOverviewChangeSetDraft"
  ) {
    const requirements = requireLoaded(
      context.loadedArtifacts,
      "requirements-change-set",
      "ProjectOverviewChangeSetDraft",
    );
    const baseline = requireLoaded(
      context.loadedInputs,
      "project-overview-baseline",
      "ProjectOverviewChangeSetDraft",
    );
    validateProjectOverviewChangeSetAgainstBaseline({
      projectOverviewChangeSet: value,
      requirementsChangeSet: requirements.value,
      requirementsChangeSetRef: requirements.ref,
      baseOverview: baseline.value,
      baseOverviewRef: baseline.ref,
    });
  }

  if (value.kind === "ProjectOverviewBaseline") {
    if (context.phase === "output") {
      assertBaselinePromotion(value, context);
    } else if (context.phase === "input") {
      assertBaselineRequirements(value, context);
    }
  }

  return value;
}

export function projectOverviewRuntimeArtifactContracts() {
  return PROJECT_OVERVIEW_SCHEMAS.map((schema) => ({
    schema,
    validate: validateProjectOverviewRuntimeArtifact,
  }));
}
