import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { projectOverviewRuntimeArtifactContracts } from "../src/project-overview-runtime-contracts.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;

function sourceRefs() {
  return [
    {
      role: "goal",
      artifact: { artifactId: "goal-001", digest: SHA_A },
    },
  ];
}

function requirementsBody() {
  const refs = sourceRefs();
  return {
    purpose: { statement: "Relay verified engineering artifacts.", sourceRefs: refs },
    businessObjectives: [
      {
        id: "BO-RELAY",
        statement: "Make delivery reproducible.",
        stakeholderIds: ["STK-TEAM"],
        priority: "must",
        sourceRefs: refs,
      },
    ],
    users: [
      {
        id: "USR-ENGINEER",
        name: "Engineer",
        description: "Uses verified module outputs.",
        stakeholderIds: ["STK-TEAM"],
        needs: ["Explicit context"],
        sourceRefs: refs,
      },
    ],
    capabilities: [
      {
        id: "CAP-RELAY",
        name: "Artifact relay",
        description: "Relays approved artifacts.",
        businessObjectiveIds: ["BO-RELAY"],
        userIds: ["USR-ENGINEER"],
        audience: "user-facing",
        key: true,
        priority: "must",
        sourceRefs: refs,
      },
    ],
    successMetrics: [
      {
        id: "SM-LINEAGE",
        name: "Lineage coverage",
        businessObjectiveIds: ["BO-RELAY"],
        measure: "Outputs with verified lineage",
        target: "100%",
        measurementMethod: "Contract validation",
        sourceRefs: refs,
      },
    ],
    scope: [
      {
        id: "SCOPE-RELAY",
        statement: "Requirements and architecture context.",
        sourceRefs: refs,
      },
    ],
    nonGoals: [],
    constraints: [
      {
        id: "CON-PORTABLE",
        category: "technical",
        statement: "Context identity is location-independent.",
        applicability: { level: "project" },
        acceptanceCriterionIds: ["AC-PORTABLE"],
        sourceRefs: refs,
      },
    ],
    nonFunctionalRequirements: [
      {
        id: "NFR-RELIABLE",
        category: "reliability",
        statement: "Tampered context fails closed.",
        applicability: { level: "project" },
        measure: "Rejected tampered projections",
        target: "100%",
        priority: "must",
        acceptanceCriterionIds: ["AC-RELIABLE"],
        sourceRefs: refs,
      },
    ],
    terminology: [
      {
        id: "TERM-RELAY",
        term: "Relay",
        definition: "A verified artifact handoff.",
        aliases: [],
        sourceRefs: refs,
      },
    ],
    currentStatus: {
      lifecycle: "greenfield",
      phase: "planning",
      summary: "Requirements context is being established.",
      sourceRefs: refs,
    },
  };
}

function fullRef(artifactId, schema, mediaType, digest, uri = artifactId) {
  return {
    artifactId,
    schema,
    mediaType,
    digest,
    uri: `memory://artifacts/${uri}`,
  };
}

function pointer(ref) {
  return { artifactId: ref.artifactId, digest: ref.digest };
}

function documentFor(overview, bytes = renderProjectOverviewMarkdownBytes(overview)) {
  return {
    path: PROJECT_OVERVIEW_DOCUMENT.path,
    schema: PROJECT_OVERVIEW_DOCUMENT.schema,
    mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
    artifact: {
      artifactId: "project-overview-md-runtime",
      digest: sha256Digest(bytes),
    },
    renderer: { ...PROJECT_OVERVIEW_RENDERER },
  };
}

function draftFixture() {
  const requirements = { kind: "RequirementsDraft", requirements: requirementsBody() };
  const requirementsRef = fullRef(
    "requirements-draft-runtime",
    "https://devrelay.dev/artifacts/requirements-draft/v1",
    "application/vnd.devrelay.requirements-draft+json",
    SHA_B,
    "relocatable/requirements-draft-runtime",
  );
  const overview = deriveProjectOverview(requirements.requirements);
  const bytes = renderProjectOverviewMarkdownBytes(overview);
  return {
    requirements,
    requirementsRef,
    bytes,
    draft: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ProjectOverviewDraft",
      draftId: "project-overview-draft-runtime",
      requirementsDraft: pointer(requirementsRef),
      projection: { ...PROJECT_OVERVIEW_PROJECTION },
      overview,
      renderedDocument: documentFor(overview, bytes),
    },
  };
}

function contractFor(schema) {
  return projectOverviewRuntimeArtifactContracts().find(
    (contract) => contract.schema === schema,
  ).validate;
}

const validateDraftRuntime = contractFor(
  "https://devrelay.dev/artifacts/project-overview-draft/v1",
);
const validateChangeRuntime = contractFor(
  "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
);
const validateBaselineRuntime = contractFor(
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
);

test("runtime verifies the exact raw ProjectOverview.md bytes and portable draft lineage", async () => {
  const fixture = draftFixture();
  const context = {
    phase: "output",
    loadedArtifacts: {
      "requirements-draft": [
        { ref: fixture.requirementsRef, value: fixture.requirements },
      ],
    },
    async loadBytes(ref) {
      assert.deepEqual(ref, fixture.draft.renderedDocument.artifact);
      return fixture.bytes;
    },
  };

  assert.equal(await validateDraftRuntime(fixture.draft, context), fixture.draft);

  const relocatedContext = structuredClone({
    phase: context.phase,
    loadedArtifacts: context.loadedArtifacts,
  });
  relocatedContext.loadedArtifacts["requirements-draft"][0].ref.uri =
    "file:///another/host/requirements-draft-runtime.json";
  relocatedContext.loadBytes = async () => fixture.bytes;
  assert.equal(
    await validateDraftRuntime(fixture.draft, relocatedContext),
    fixture.draft,
  );
});

test("runtime rejects digest tampering and noncanonical BOM/CRLF Markdown", async () => {
  const fixture = draftFixture();
  const baseContext = {
    phase: "output",
    loadedArtifacts: {
      "requirements-draft": [
        { ref: fixture.requirementsRef, value: fixture.requirements },
      ],
    },
  };

  await assert.rejects(
    () =>
      validateDraftRuntime(fixture.draft, {
        ...baseContext,
        loadBytes: async () => Buffer.from("tampered", "utf8"),
      }),
    /bytes do not match their declared digest/,
  );

  const noncanonical = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(fixture.bytes.toString("utf8").replace(/\n/g, "\r\n"), "utf8"),
  ]);
  const forged = structuredClone(fixture.draft);
  forged.renderedDocument.artifact.digest = sha256Digest(noncanonical);
  await assert.rejects(
    () =>
      validateDraftRuntime(forged, {
        ...baseContext,
        loadBytes: async () => noncanonical,
      }),
    /not the exact deterministic UTF-8\/NFC\/LF projection/,
  );
});

test("runtime change validation binds the exact baseline and complete replacement", async () => {
  const initial = draftFixture();
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: "project-overview-baseline-runtime",
    version: "1.0.0",
    approvedOverviewCandidate: {
      artifactId: initial.draft.draftId,
      digest: SHA_A,
    },
    requirementsBaseline: {
      artifactId: "requirements-baseline-runtime",
      digest: SHA_B,
    },
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview: initial.draft.overview,
    renderedDocument: initial.draft.renderedDocument,
    approvalEvidence: [{ artifactId: "approval-runtime", digest: SHA_C }],
  };
  const baselineRef = fullRef(
    baseline.baselineId,
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
    canonicalJsonDigest(baseline),
  );
  const replacement = requirementsBody();
  replacement.currentStatus.summary = "Requirements context is approved.";
  const requirementsChangeRef = fullRef(
    "requirements-change-runtime",
    "https://devrelay.dev/artifacts/requirements-change-set/v1",
    "application/vnd.devrelay.requirements-change-set+json",
    SHA_C,
  );
  const overview = deriveProjectOverview(replacement);
  const bytes = renderProjectOverviewMarkdownBytes(overview);
  const change = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewChangeSetDraft",
    changeSetId: "project-overview-change-runtime",
    baseOverview: pointer(baselineRef),
    requirementsChangeSet: pointer(requirementsChangeRef),
    changeDisposition: "changed",
    changedSections: ["currentStatus"],
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: documentFor(overview, bytes),
  };
  const context = {
    phase: "output",
    loadedInputs: {
      "project-overview-baseline": [{ ref: baselineRef, value: baseline }],
    },
    loadedArtifacts: {
      "requirements-change-set": [
        {
          ref: requirementsChangeRef,
          value: { kind: "RequirementsChangeSet", replacement },
        },
      ],
    },
    loadBytes: async () => bytes,
  };

  assert.equal(await validateChangeRuntime(change, context), change);

  const wrongBase = structuredClone(change);
  wrongBase.baseOverview.digest = SHA_A;
  await assert.rejects(
    () => validateChangeRuntime(wrongBase, context),
    /baseOverview does not match the exact content-addressed artifact/,
  );
});

test("baseline input fails closed without its paired RequirementsBaseline", async () => {
  const fixture = draftFixture();
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: "project-overview-baseline-unpaired",
    version: "1.0.0",
    approvedOverviewCandidate: {
      artifactId: fixture.draft.draftId,
      digest: SHA_A,
    },
    requirementsBaseline: {
      artifactId: "requirements-baseline-missing",
      digest: SHA_B,
    },
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview: fixture.draft.overview,
    renderedDocument: fixture.draft.renderedDocument,
    approvalEvidence: [{ artifactId: "approval-unpaired", digest: SHA_C }],
  };

  await assert.rejects(
    () =>
      validateBaselineRuntime(baseline, {
        phase: "input",
        loadedInputs: {},
        loadBytes: async () => fixture.bytes,
      }),
    /requires its exact paired RequirementsBaseline input/,
  );
});

test("baseline input is canonically paired with RequirementsBaseline despite object key order", async () => {
  const fixture = draftFixture();
  const requirementsRef = fullRef(
    "requirements-baseline-paired",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
    SHA_C,
  );
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectOverviewBaseline",
    baselineId: "project-overview-baseline-paired",
    version: "1.0.0",
    approvedOverviewCandidate: {
      artifactId: fixture.draft.draftId,
      digest: SHA_A,
    },
    requirementsBaseline: pointer(requirementsRef),
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview: fixture.draft.overview,
    renderedDocument: fixture.draft.renderedDocument,
    approvalEvidence: [{ artifactId: "approval-paired", digest: SHA_C }],
  };
  const reorderedBody = requirementsBody();
  reorderedBody.purpose = {
    sourceRefs: reorderedBody.purpose.sourceRefs,
    statement: reorderedBody.purpose.statement,
  };
  const context = {
    phase: "input",
    loadedInputs: {
      "requirements-baseline": [
        {
          ref: requirementsRef,
          value: { kind: "RequirementsBaseline", requirements: reorderedBody },
        },
      ],
    },
    loadBytes: async () => fixture.bytes,
  };

  assert.equal(await validateBaselineRuntime(baseline, context), baseline);
});
