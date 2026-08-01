import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  ProjectOverviewArtifactValidationError,
  validateProjectOverviewArtifact,
  validateProjectOverviewBaselinePromotion,
  validateProjectOverviewChangeSetAgainstBaseline,
  validateProjectOverviewDraftAgainstRequirements,
} from "../src/project-overview-artifact-validator.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  diffProjectOverviewSections,
  renderProjectOverviewMarkdown,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

function sourceRef(role = "goal") {
  return {
    role,
    artifact: {
      artifactId: `${role}-001`,
      digest: DIGEST_A,
    },
  };
}

function requirementsBody() {
  const sources = [sourceRef()];
  return {
    purpose: {
      statement: "Build a dependable\r\nrelay for caf\u0065\u0301 teams.",
      sourceRefs: sources,
    },
    businessObjectives: [
      {
        id: "BO-ZETA",
        statement: "Reduce escaped ambiguity.",
        stakeholderIds: ["STK-TEAM"],
        priority: "should",
        sourceRefs: sources,
      },
      {
        id: "BO-ALPHA",
        statement: "Make delivery repeatable.",
        stakeholderIds: ["STK-TEAM"],
        priority: "must",
        sourceRefs: sources,
      },
    ],
    users: [
      {
        id: "USR-ENGINEER",
        name: "Engineer",
        description: "Builds and verifies software.",
        stakeholderIds: ["STK-TEAM"],
        needs: ["Traceable evidence", "Clear handoffs"],
        sourceRefs: sources,
      },
    ],
    capabilities: [
      {
        id: "CAP-INTERNAL",
        name: "Internal bookkeeping",
        description: "Tracks private implementation detail.",
        businessObjectiveIds: ["BO-ZETA"],
        userIds: [],
        audience: "internal",
        key: false,
        priority: "could",
        sourceRefs: sources,
      },
      {
        id: "CAP-RELAY",
        name: "Deterministic relay",
        description: "Moves verified artifacts between stages.",
        businessObjectiveIds: ["BO-ZETA", "BO-ALPHA"],
        userIds: ["USR-ENGINEER"],
        audience: "user-facing",
        key: true,
        priority: "must",
        sourceRefs: sources,
      },
    ],
    successMetrics: [
      {
        id: "SM-TRACE",
        name: "Traceability coverage",
        businessObjectiveIds: ["BO-ZETA", "BO-ALPHA"],
        measure: "Approved artifacts with complete lineage",
        target: "100%",
        measurementMethod: "Validate every promoted artifact graph.",
        evaluationWindow: "Each release",
        sourceRefs: sources,
      },
    ],
    scope: [
      {
        id: "SCOPE-MODULES",
        statement: "Deterministic module contracts and handoffs.",
        sourceRefs: sources,
      },
    ],
    nonGoals: [
      {
        id: "NG-AGENT",
        statement: "Build another coding agent.",
        rationale: "DevRelay owns workflow, not model behavior.",
        sourceRefs: sources,
      },
    ],
    constraints: [
      {
        id: "CON-PORTABLE",
        category: "technical",
        statement: "Artifacts remain provider-neutral.",
        applicability: { level: "project" },
        acceptanceCriterionIds: ["AC-PORTABLE"],
        sourceRefs: sources,
      },
    ],
    nonFunctionalRequirements: [
      {
        id: "NFR-DETERMINISM",
        category: "reliability",
        statement: "Equivalent approved inputs produce equivalent routing.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-RELAY"],
        },
        measure: "Route-decision digest equality",
        target: "100% for equivalent inputs",
        priority: "must",
        acceptanceCriterionIds: ["AC-DETERMINISM"],
        sourceRefs: sources,
      },
    ],
    terminology: [
      {
        id: "TERM-BASELINE",
        term: "Baseline",
        definition: "An approved immutable artifact.",
        aliases: ["Approved version"],
        sourceRefs: sources,
      },
    ],
    currentStatus: {
      lifecycle: "greenfield",
      phase: "planning",
      summary: "Requirements are being baselined.",
      sourceRefs: sources,
    },
  };
}

function ref(artifactId, schema, mediaType, digest = DIGEST_B, uriSuffix = artifactId) {
  return {
    artifactId,
    schema,
    mediaType,
    digest,
    uri: `memory://artifacts/${uriSuffix}`,
  };
}

function pointer(artifactRef) {
  return {
    artifactId: artifactRef.artifactId,
    digest: artifactRef.digest,
  };
}

function renderedDocument(overview, artifactId = "project-overview-md-001") {
  const bytes = renderProjectOverviewMarkdownBytes(overview);
  return {
    path: PROJECT_OVERVIEW_DOCUMENT.path,
    schema: PROJECT_OVERVIEW_DOCUMENT.schema,
    mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
    artifact: {
      artifactId,
      digest: sha256Digest(bytes),
    },
    renderer: { ...PROJECT_OVERVIEW_RENDERER },
  };
}

function draftFixture(body = requirementsBody()) {
  const requirementsDraftRef = ref(
    "requirements-draft-001",
    "https://devrelay.dev/artifacts/requirements-draft/v1",
    "application/vnd.devrelay.requirements-draft+json",
  );
  const overview = deriveProjectOverview(body);
  return {
    requirementsDraftRef,
    requirementsDraft: {
      kind: "RequirementsDraft",
      requirements: body,
    },
    draft: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ProjectOverviewDraft",
      draftId: "project-overview-draft-001",
      requirementsDraft: pointer(requirementsDraftRef),
      projection: { ...PROJECT_OVERVIEW_PROJECTION },
      overview,
      renderedDocument: renderedDocument(overview),
    },
  };
}

function baselineFixture(body = requirementsBody()) {
  const overview = deriveProjectOverview(body);
  const requirementsBaselineRef = ref(
    "requirements-baseline-001",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
    DIGEST_B,
  );
  const approvedDraftRef = ref(
    "project-overview-draft-001",
    "https://devrelay.dev/artifacts/project-overview-draft/v1",
    "application/vnd.devrelay.project-overview-draft+json",
    DIGEST_A,
  );
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: "project-overview-baseline-001",
    version: "1.0.0",
    approvedOverviewCandidate: pointer(approvedDraftRef),
    requirementsBaseline: pointer(requirementsBaselineRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: renderedDocument(overview),
    approvalEvidence: [
      {
        artifactId: "requirements-approval-001",
        digest: DIGEST_C,
      },
    ],
  };
  const baselineRef = ref(
    baseline.baselineId,
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
    canonicalJsonDigest(baseline),
  );
  return {
    baseline,
    baselineRef,
    requirementsBaseline: {
      kind: "RequirementsBaseline",
      requirements: body,
    },
    requirementsBaselineRef,
  };
}

test("projection is exact, normalized, ID-ordered, and key-capability-only", () => {
  const source = requirementsBody();
  const overview = deriveProjectOverview(source);

  assert.deepEqual(
    overview.businessObjectives.map(({ id }) => id),
    ["BO-ALPHA", "BO-ZETA"],
  );
  assert.deepEqual(
    overview.keyCapabilities.map(({ id }) => id),
    ["CAP-RELAY"],
  );
  assert.deepEqual(overview.keyCapabilities[0].businessObjectiveIds, [
    "BO-ALPHA",
    "BO-ZETA",
  ]);
  assert.equal(overview.purpose.statement.includes("\r"), false);
  assert.equal(overview.purpose.statement, overview.purpose.statement.normalize("NFC"));

  const reordered = structuredClone(source);
  reordered.businessObjectives.reverse();
  reordered.capabilities.reverse();
  assert.equal(
    canonicalJsonDigest(deriveProjectOverview(reordered)),
    canonicalJsonDigest(overview),
  );
});

test("renderer emits one canonical readable ProjectOverview.md", () => {
  const markdown = renderProjectOverviewMarkdown(
    deriveProjectOverview(requirementsBody()),
  );

  assert.equal(markdown.startsWith("# Project Overview\n\n## Purpose\n"), true);
  assert.equal(markdown.includes("## Key Capabilities"), true);
  assert.equal(markdown.includes("CAP-INTERNAL"), false);
  assert.equal(markdown.includes("caf\u00e9 teams"), true);
  assert.equal(markdown.includes("\r"), false);
  assert.equal(markdown.charCodeAt(0) === 0xfeff, false);
  assert.equal(markdown.endsWith("\n"), true);
  assert.equal(markdown.endsWith("\n\n"), false);
  assert.equal(Buffer.from(markdown, "utf8").equals(renderProjectOverviewMarkdownBytes(deriveProjectOverview(requirementsBody()))), true);
});

test("portable artifact validation requires canonical order and exact contract identities", () => {
  const { draft } = draftFixture();
  assert.equal(validateProjectOverviewArtifact(draft), draft);

  const unsorted = structuredClone(draft);
  unsorted.overview.businessObjectives.reverse();
  assert.throws(
    () => validateProjectOverviewArtifact(unsorted),
    ProjectOverviewArtifactValidationError,
  );

  const wrongProjection = structuredClone(draft);
  wrongProjection.projection.version = "1.0.1";
  assert.throws(
    () => validateProjectOverviewArtifact(wrongProjection),
    /projection does not identify the supported contract/,
  );
});

test("draft projection is bound to the exact RequirementsDraft content pointer", () => {
  const fixture = draftFixture();
  assert.equal(
    validateProjectOverviewDraftAgainstRequirements({
      projectOverviewDraft: fixture.draft,
      requirementsDraft: fixture.requirementsDraft,
      requirementsDraftRef: fixture.requirementsDraftRef,
    }),
    fixture.draft,
  );

  const relocated = structuredClone(fixture.requirementsDraftRef);
  relocated.uri = "memory://relocated/requirements-draft-001";
  assert.equal(
    validateProjectOverviewDraftAgainstRequirements({
      projectOverviewDraft: fixture.draft,
      requirementsDraft: fixture.requirementsDraft,
      requirementsDraftRef: relocated,
    }),
    fixture.draft,
  );

  const drifted = structuredClone(fixture.requirementsDraft);
  drifted.requirements.purpose.statement = "A different purpose.";
  assert.throws(
    () =>
      validateProjectOverviewDraftAgainstRequirements({
        projectOverviewDraft: fixture.draft,
        requirementsDraft: drifted,
        requirementsDraftRef: fixture.requirementsDraftRef,
      }),
    /draft projection is not the exact canonical value/,
  );
});

test("change disposition and changedSections are the exhaustive canonical diff", () => {
  const base = baselineFixture();
  const replacement = requirementsBody();
  replacement.purpose.statement = "Relay approved artifacts without ambiguity.";
  const requirementsChangeSetRef = ref(
    "requirements-change-set-001",
    "https://devrelay.dev/artifacts/requirements-change-set/v1",
    "application/vnd.devrelay.requirements-change-set+json",
  );
  const overview = deriveProjectOverview(replacement);
  const change = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewChangeSetDraft",
    changeSetId: "project-overview-change-set-001",
    baseOverview: pointer(base.baselineRef),
    requirementsChangeSet: pointer(requirementsChangeSetRef),
    changeDisposition: "changed",
    changedSections: ["purpose"],
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: renderedDocument(overview, "project-overview-md-002"),
  };

  assert.deepEqual(diffProjectOverviewSections(base.baseline.overview, overview), [
    "purpose",
  ]);
  assert.equal(
    validateProjectOverviewChangeSetAgainstBaseline({
      projectOverviewChangeSet: change,
      requirementsChangeSet: {
        kind: "RequirementsChangeSet",
        replacement,
      },
      requirementsChangeSetRef,
      baseOverview: base.baseline,
      baseOverviewRef: base.baselineRef,
    }),
    change,
  );

  const falseDiff = structuredClone(change);
  falseDiff.changedSections = ["purpose", "scope"];
  assert.throws(
    () =>
      validateProjectOverviewChangeSetAgainstBaseline({
        projectOverviewChangeSet: falseDiff,
        requirementsChangeSet: {
          kind: "RequirementsChangeSet",
          replacement,
        },
        requirementsChangeSetRef,
        baseOverview: base.baseline,
        baseOverviewRef: base.baselineRef,
      }),
    /changedSections is not the exact canonical value/,
  );
});

test("an approved requirements change always creates a newly paired overview baseline", () => {
  const previous = baselineFixture();
  const nextRequirementsRef = ref(
    "requirements-baseline-002",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
    DIGEST_C,
  );
  const candidateRef = ref(
    "project-overview-change-set-002",
    "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
    "application/vnd.devrelay.project-overview-change-set-draft+json",
    DIGEST_C,
  );
  const candidate = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewChangeSetDraft",
    changeSetId: candidateRef.artifactId,
    baseOverview: pointer(previous.baselineRef),
    requirementsChangeSet: {
      artifactId: "requirements-change-set-002",
      digest: DIGEST_C,
    },
    changeDisposition: "unchanged",
    changedSections: [],
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview: structuredClone(previous.baseline.overview),
    renderedDocument: structuredClone(previous.baseline.renderedDocument),
  };
  const promoted = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: "project-overview-baseline-002",
    version: "1.0.1",
    approvedOverviewCandidate: pointer(candidateRef),
    supersedes: pointer(previous.baselineRef),
    requirementsBaseline: pointer(nextRequirementsRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview: structuredClone(candidate.overview),
    renderedDocument: structuredClone(candidate.renderedDocument),
    approvalEvidence: [
      {
        artifactId: "requirements-approval-002",
        digest: DIGEST_C,
      },
    ],
  };

  assert.equal(
    validateProjectOverviewBaselinePromotion({
      projectOverviewBaseline: promoted,
      approvedCandidate: candidate,
      approvedCandidateRef: candidateRef,
      requirementsBaseline: {
        kind: "RequirementsBaseline",
        requirements: requirementsBody(),
      },
      requirementsBaselineRef: nextRequirementsRef,
      previousBaseline: previous.baseline,
      previousBaselineRef: previous.baselineRef,
    }),
    promoted,
  );

  const reused = structuredClone(promoted);
  reused.baselineId = previous.baseline.baselineId;
  assert.throws(
    () =>
      validateProjectOverviewBaselinePromotion({
        projectOverviewBaseline: reused,
        approvedCandidate: candidate,
        approvedCandidateRef: candidateRef,
        requirementsBaseline: {
          kind: "RequirementsBaseline",
          requirements: requirementsBody(),
        },
        requirementsBaselineRef: nextRequirementsRef,
        previousBaseline: previous.baseline,
        previousBaselineRef: previous.baselineRef,
      }),
    /new overview baseline ID/,
  );
});
