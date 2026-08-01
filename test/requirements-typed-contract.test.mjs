import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  ArtifactValidationError,
  normativeRequirementIds,
  validateRequirementsArtifact,
  validateRequirementsBaselinePromotion,
} from "../src/requirements-artifact-validator.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const pointer = (artifactId, character) => ({
  artifactId,
  digest: digest(character),
});
const clone = (value) => structuredClone(value);

const goalRef = pointer("goal-typed-001", "a");
const projectRef = pointer("project-context-typed-001", "b");
const priorGoalRef = pointer("goal-prior-001", "c");
const baselineRef = pointer("requirements-baseline-typed-001", "d");
const overviewBaselineRef = pointer("project-overview-baseline-typed-001", "2");
const draftRef = pointer("requirements-draft-typed-001", "e");
const changeRef = pointer("requirements-change-set-typed-001", "1");
const approvalRef = pointer("requirements-approval-typed-001", "f");

const sourceRef = (artifact = goalRef, role = "goal") => ({
  role,
  artifact: clone(artifact),
});

function requirementsBody(source = goalRef) {
  const sources = () => [sourceRef(source, source === priorGoalRef ? "prior-goal" : "goal")];
  return {
    purpose: {
      statement: "Enable registered users to access protected capabilities.",
      sourceRefs: sources(),
    },
    businessObjectives: [
      {
        id: "BO-ACCESS-001",
        statement: "Increase successful access to protected capabilities.",
        stakeholderIds: ["STK-CUSTOMER-001"],
        priority: "must",
        sourceRefs: sources(),
      },
    ],
    successMetrics: [
      {
        id: "SM-ACCESS-001",
        name: "Successful sign-in rate",
        businessObjectiveIds: ["BO-ACCESS-001"],
        measure: "Percentage of valid sign-in attempts that establish a session.",
        target: "At least 99 percent.",
        measurementMethod: "Aggregate production authentication telemetry.",
        evaluationWindow: "Rolling 30 days.",
        sourceRefs: sources(),
      },
    ],
    stakeholders: [
      {
        id: "STK-CUSTOMER-001",
        name: "Registered customers",
        role: "Use protected product capabilities.",
        category: "user",
        interests: ["Reliable and secure access."],
        sourceRefs: sources(),
      },
    ],
    users: [
      {
        id: "USR-CUSTOMER-001",
        name: "Registered customer",
        description: "A customer with an existing product identity.",
        stakeholderIds: ["STK-CUSTOMER-001"],
        needs: ["Access protected product capabilities."],
        sourceRefs: sources(),
      },
    ],
    capabilities: [
      {
        id: "CAP-AUTH-001",
        name: "User authentication",
        description: "Establish an authenticated session for a registered customer.",
        businessObjectiveIds: ["BO-ACCESS-001"],
        userIds: ["USR-CUSTOMER-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
        sourceRefs: sources(),
      },
    ],
    userJourneys: [
      {
        id: "UJ-SIGNIN-001",
        name: "Sign in",
        userId: "USR-CUSTOMER-001",
        capabilityIds: ["CAP-AUTH-001"],
        trigger: "The customer opens a protected capability.",
        outcome: "The customer has an authenticated session.",
        steps: [
          {
            sequence: 1,
            action: "Provide valid credentials.",
            expectedOutcome: "The credentials are accepted.",
          },
          {
            sequence: 2,
            action: "Complete sign in.",
            expectedOutcome: "An authenticated session is established.",
          },
        ],
        sourceRefs: sources(),
      },
    ],
    userStories: [
      {
        id: "US-SIGNIN-001",
        userId: "USR-CUSTOMER-001",
        capabilityId: "CAP-AUTH-001",
        userJourneyIds: ["UJ-SIGNIN-001"],
        need: "Authenticate with valid credentials.",
        benefit: "I can use protected product capabilities.",
        priority: "must",
        acceptanceCriterionIds: ["AC-SIGNIN-001"],
        sourceRefs: sources(),
      },
    ],
    acceptanceCriteria: [
      {
        id: "AC-PERF-001",
        statement: "The sign-in latency target is satisfied under the declared load.",
        verification: "Run the authentication load test.",
        sourceRefs: sources(),
      },
      {
        id: "AC-PLATFORM-001",
        statement: "Authentication works on the supported browser baseline.",
        verification: "Run the supported-browser compatibility suite.",
        sourceRefs: sources(),
      },
      {
        id: "AC-SIGNIN-001",
        statement: "Valid credentials establish a session for the matching user.",
        verification: "Run an end-to-end sign-in test with a registered test user.",
        sourceRefs: sources(),
      },
    ],
    nonFunctionalRequirements: [
      {
        id: "NFR-PERF-001",
        category: "performance",
        statement: "Authentication must respond within the declared latency target.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-AUTH-001"],
        },
        measure: "95th percentile sign-in response latency.",
        target: "At most 500 milliseconds under 100 concurrent sign-ins.",
        priority: "must",
        acceptanceCriterionIds: ["AC-PERF-001"],
        sourceRefs: sources(),
      },
    ],
    constraints: [
      {
        id: "CON-PLATFORM-001",
        category: "platform",
        statement: "Authentication must support the declared browser baseline.",
        rationale: "Customers use the product through supported browsers.",
        applicability: {
          level: "capabilities",
          capabilityIds: ["CAP-AUTH-001"],
        },
        acceptanceCriterionIds: ["AC-PLATFORM-001"],
        sourceRefs: sources(),
      },
    ],
    scope: [
      {
        id: "SCOPE-AUTH-001",
        statement: "Registered-user sign in.",
        sourceRefs: sources(),
      },
    ],
    nonGoals: [
      {
        id: "NG-IDENTITY-001",
        statement: "Select or replace the identity provider.",
        rationale: "Provider selection belongs to architecture.",
        sourceRefs: sources(),
      },
    ],
    terminology: [
      {
        id: "TERM-SESSION-001",
        term: "Authenticated session",
        definition: "A verified product session bound to one registered customer.",
        aliases: ["User session"],
        sourceRefs: sources(),
      },
    ],
    currentStatus: {
      lifecycle: "greenfield",
      phase: "planning",
      summary: "Authentication requirements are being baselined.",
      sourceRefs: sources(),
    },
    assumptions: [
      {
        id: "ASM-IDENTITY-001",
        statement: "A registered identity exists before sign in.",
        status: "confirmed",
        blocking: false,
        sourceRefs: sources(),
      },
    ],
    dependencies: ["An authoritative identity source."],
    risks: ["Incorrect failure behavior could disclose account existence."],
    deliverables: ["Approved authentication requirements."],
    requiredEvidence: ["requirements/acceptance-review"],
    sourceRefs: sources(),
  };
}

function draft(body = requirementsBody()) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsDraft",
    draftId: "requirements-draft-typed-001",
    baseInputs: [
      { role: "goal", artifact: clone(goalRef) },
      { role: "project-context", artifact: clone(projectRef) },
    ],
    goal: clone(goalRef),
    projectContext: clone(projectRef),
    requirements: body,
  };
}

function baseline(body = requirementsBody(priorGoalRef)) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsBaseline",
    baselineId: "requirements-baseline-typed-001",
    version: "1.0.0",
    approvedCandidate: clone(draftRef),
    requirements: body,
    approvalEvidence: [clone(approvalRef)],
  };
}

function changeSet(current = baseline()) {
  const replacement = clone(current.requirements);
  replacement.businessObjectives[0].statement =
    "Increase reliable and secure access to protected capabilities.";
  replacement.businessObjectives[0].sourceRefs = [sourceRef()];
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsChangeSet",
    changeSetId: "requirements-change-set-typed-001",
    baseInputs: [
      { role: "goal", artifact: clone(goalRef) },
      { role: "project-context", artifact: clone(projectRef) },
      { role: "requirements-baseline", artifact: clone(baselineRef) },
      {
        role: "project-overview-baseline",
        artifact: clone(overviewBaselineRef),
      },
    ],
    baseline: clone(baselineRef),
    expectedRequirementsDigest: canonicalJsonDigest(current.requirements),
    replacement,
    changedSections: ["businessObjectives"],
    reason: "Clarify that successful access must also remain secure.",
    compatibilityImpact: "backward-compatible",
    risks: [],
    requiredEvidence: ["requirements/change-review"],
    sourceRefs: [sourceRef(baselineRef, "requirements-baseline"), sourceRef()],
  };
}

function expectInvalid(value, pattern) {
  assert.throws(
    () => validateRequirementsArtifact(value),
    (error) =>
      error instanceof ArtifactValidationError &&
      (pattern === undefined || pattern.test(error.message)),
  );
}

const runtimeContract = requirementsRuntimeArtifactContracts().find(
  ({ schema }) => schema === "https://devrelay.dev/artifacts/requirements-change-set/v1",
);

function changeContext(current) {
  return {
    phase: "output",
    loadedInputs: {
      goal: [{ ref: clone(goalRef), value: { kind: "GoalArtifact" } }],
      "project-context": [
        {
          ref: clone(projectRef),
          value: { kind: "ProjectContext", lifecycle: "greenfield" },
        },
      ],
      "requirements-baseline": [
        { ref: clone(baselineRef), value: clone(current) },
      ],
      "project-overview-baseline": [
        {
          ref: clone(overviewBaselineRef),
          value: { kind: "ProjectOverviewBaseline" },
        },
      ],
    },
    loadedArtifacts: {},
  };
}

test("typed RequirementsBody is canonical and exposes derived normative IDs", () => {
  const value = draft();
  assert.equal(validateRequirementsArtifact(value), value);
  assert.deepEqual(normativeRequirementIds(value.requirements), [
    "US-SIGNIN-001",
    "NFR-PERF-001",
    "CON-PLATFORM-001",
  ]);

  const legacy = draft();
  legacy.requirements.requirements = [];
  expectInvalid(legacy);
});

test("assumptions use the closed evidence-backed contract", () => {
  const valid = draft();
  assert.deepEqual(Object.keys(valid.requirements.assumptions[0]), [
    "id",
    "statement",
    "status",
    "blocking",
    "sourceRefs",
  ]);

  for (const field of ["id", "statement", "status", "blocking", "sourceRefs"]) {
    const missing = draft();
    delete missing.requirements.assumptions[0][field];
    expectInvalid(missing);
  }

  const uncited = draft();
  uncited.requirements.assumptions[0].sourceRefs = [];
  expectInvalid(uncited);

  const openShape = draft();
  openShape.requirements.assumptions[0].owner = "the model";
  expectInvalid(openShape);
});

test("typed references are closed and journey/story relationships are compatible", () => {
  const dangling = draft();
  dangling.requirements.userStories[0].capabilityId = "CAP-UNKNOWN-001";
  expectInvalid(dangling, /unknown stable ID CAP-UNKNOWN-001/);

  const incompatible = draft();
  incompatible.requirements.userStories[0].userId = "USR-CUSTOMER-001";
  incompatible.requirements.userJourneys[0].capabilityIds = ["CAP-AUTH-001"];
  incompatible.requirements.userStories[0].capabilityId = "CAP-AUTH-001";
  incompatible.requirements.userJourneys[0].userId = "USR-CUSTOMER-001";
  incompatible.requirements.userJourneys[0].steps[1].sequence = 1;
  expectInvalid(incompatible, /ordered by contiguous sequence/);
});

test("coverage gates reject orphan objectives, capabilities, journeys, and criteria", () => {
  const noMetric = draft();
  noMetric.requirements.businessObjectives.push({
    id: "BO-ORPHAN-001",
    statement: "An uncovered objective.",
    stakeholderIds: ["STK-CUSTOMER-001"],
    priority: "should",
    sourceRefs: [sourceRef()],
  });
  expectInvalid(noMetric, /has no success metric/);

  const noCapabilityCoverage = draft();
  noCapabilityCoverage.requirements.capabilities.push({
    id: "CAP-ORPHAN-001",
    name: "Uncovered capability",
    description: "A user-facing capability without journey or story coverage.",
    businessObjectiveIds: ["BO-ACCESS-001"],
    userIds: ["USR-CUSTOMER-001"],
    audience: "user-facing",
    key: false,
    priority: "should",
    sourceRefs: [sourceRef()],
  });
  expectInvalid(noCapabilityCoverage, /lacks journey or story coverage/);

  const orphanCriterion = draft();
  orphanCriterion.requirements.acceptanceCriteria.push({
    id: "AC-ORPHAN-001",
    statement: "An unowned criterion.",
    verification: "No owning requirement exists.",
    sourceRefs: [sourceRef()],
  });
  orphanCriterion.requirements.acceptanceCriteria.sort(({ id: left }, { id: right }) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  expectInvalid(orphanCriterion, /is orphaned/);
});

test("set-like requirements collections and journey steps require canonical order", () => {
  const reorderedRecords = draft();
  reorderedRecords.requirements.acceptanceCriteria.reverse();
  expectInvalid(reorderedRecords, /strictly lexically sorted/);

  const reorderedIds = draft();
  reorderedIds.requirements.capabilities[0].businessObjectiveIds = [
    "BO-ZZZ-001",
    "BO-ACCESS-001",
  ];
  expectInvalid(reorderedIds, /strictly lexically sorted/);

  const reorderedSteps = draft();
  reorderedSteps.requirements.userJourneys[0].steps.reverse();
  expectInvalid(reorderedSteps, /ordered by contiguous sequence/);
});

test("requirements text requires canonical Unicode and LF-only line endings", () => {
  const nonNfc = draft();
  nonNfc.requirements.purpose.statement = "A cafe\u0301 workflow.";
  expectInvalid(nonNfc, /Unicode NFC normalization/);

  const crlf = draft();
  crlf.requirements.purpose.statement = "First line.\r\nSecond line.";
  expectInvalid(crlf, /LF-only line endings/);
});

test("stakeholder, user, journey, and story coverage is reciprocal", () => {
  const orphanStakeholder = draft();
  orphanStakeholder.requirements.stakeholders.push({
    id: "STK-ORPHAN-001",
    name: "Unconnected sponsor",
    role: "Has no declared relationship.",
    category: "sponsor",
    interests: ["Traceable ownership."],
    sourceRefs: [sourceRef()],
  });
  expectInvalid(orphanStakeholder, /stakeholder STK-ORPHAN-001 is orphaned/);

  const orphanUser = draft();
  orphanUser.requirements.users.push({
    id: "USR-ORPHAN-001",
    name: "Unconnected user",
    description: "Has no capability, journey, or story.",
    stakeholderIds: ["STK-CUSTOMER-001"],
    needs: ["A declared product relationship."],
    sourceRefs: [sourceRef()],
  });
  expectInvalid(orphanUser, /user USR-ORPHAN-001 is orphaned/);

  const mismatchedJourney = draft();
  mismatchedJourney.requirements.users.push({
    id: "USR-SECONDARY-001",
    name: "Secondary user",
    description: "A user outside the authentication capability audience.",
    stakeholderIds: ["STK-CUSTOMER-001"],
    needs: ["A compatible capability."],
    sourceRefs: [sourceRef()],
  });
  mismatchedJourney.requirements.userJourneys[0].userId = "USR-SECONDARY-001";
  mismatchedJourney.requirements.userStories[0].userId = "USR-SECONDARY-001";
  expectInvalid(mismatchedJourney, /not an audience member of capability/);
});

test("full-body change sets require sorted declared sections intrinsically", () => {
  const current = baseline();
  const value = changeSet(current);
  value.replacement.scope[0].statement = "Registered-user sign in and sign out.";
  value.changedSections = ["scope", "businessObjectives"];
  expectInvalid(value, /lexically sorted/);
});

test("runtime citation closure includes assumption evidence", async () => {
  const current = baseline();
  const value = changeSet(current);
  value.replacement.assumptions[0].sourceRefs = [
    sourceRef(pointer("outside-evidence-001", "9"), "external-evidence"),
  ];
  value.changedSections.push("assumptions");
  value.changedSections.sort();
  await assert.rejects(
    () => runtimeContract.validate(value, changeContext(current)),
    /neither an exact base input nor an allowed native source/,
  );
});

test("runtime accepts an exhaustive optimistic replacement and preserved baseline citations", async () => {
  const current = baseline();
  const value = changeSet(current);
  await assert.doesNotReject(() =>
    runtimeContract.validate(value, changeContext(current)),
  );
});

test("runtime rejects stale, no-op, missing, and extra changed sections", async () => {
  const current = baseline();

  const stale = changeSet(current);
  stale.expectedRequirementsDigest = digest("0");
  await assert.rejects(
    () => runtimeContract.validate(stale, changeContext(current)),
    /expected requirements digest is stale/,
  );

  const noOp = changeSet(current);
  noOp.replacement = clone(current.requirements);
  await assert.rejects(
    () => runtimeContract.validate(noOp, changeContext(current)),
    /replacement is an exact no-op/,
  );

  const missing = changeSet(current);
  missing.replacement.scope[0].statement = "Registered-user sign in and sign out.";
  await assert.rejects(
    () => runtimeContract.validate(missing, changeContext(current)),
    /changedSections do not exactly describe/,
  );

  const extra = changeSet(current);
  extra.changedSections.push("scope");
  await assert.rejects(
    () => runtimeContract.validate(extra, changeContext(current)),
    /changedSections do not exactly describe/,
  );
});

test("runtime binds currentStatus lifecycle to ProjectContext", async () => {
  const current = baseline();
  const value = changeSet(current);
  value.replacement.currentStatus.lifecycle = "existing";
  value.changedSections.push("currentStatus");
  await assert.rejects(
    () => runtimeContract.validate(value, changeContext(current)),
    /current status lifecycle does not match/,
  );
});


test("RequirementsBaseline binds a generic approvedCandidate", () => {
  const candidate = draft();
  const promoted = baseline(clone(candidate.requirements));
  assert.equal(
    validateRequirementsBaselinePromotion({
      candidate,
      candidateRef: draftRef,
      baseline: promoted,
    }),
    promoted,
  );

  const legacy = clone(promoted);
  legacy.approvedDraft = clone(draftRef);
  delete legacy.approvedCandidate;
  expectInvalid(legacy);
});

test("promotion rejects only unconfirmed blocking assumptions", () => {
  for (const [status, blocking, accepted] of [
    ["confirmed", false, true],
    ["confirmed", true, true],
    ["unconfirmed", false, true],
    ["unconfirmed", true, false],
  ]) {
    const body = requirementsBody();
    body.assumptions[0].status = status;
    body.assumptions[0].blocking = blocking;
    const candidate = draft(body);
    const promoted = baseline(clone(body));
    const validate = () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: draftRef,
        baseline: promoted,
      });
    if (accepted) {
      assert.equal(
        validate(),
        promoted,
        "expected " + status + "/" + blocking + " to promote",
      );
    } else {
      assert.throws(
        validate,
        /cannot promote unconfirmed blocking assumption ASM-IDENTITY-001/,
      );
    }
  }
});

test("initial baseline promotion is exact and non-superseding", () => {
  const candidate = draft();

  const mismatchedBody = baseline(clone(candidate.requirements));
  mismatchedBody.requirements.purpose.statement = "A mismatched approved body.";
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: draftRef,
        baseline: mismatchedBody,
      }),
    /body is not the exact approved candidate body/,
  );

  const superseding = baseline(clone(candidate.requirements));
  superseding.supersedes = clone(baselineRef);
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: draftRef,
        baseline: superseding,
      }),
    /must not supersede/,
  );
});

function changedBaseline(previous, candidate) {
  const promoted = baseline(clone(candidate.replacement));
  promoted.baselineId = "requirements-baseline-typed-002";
  promoted.version = "2.0.0";
  promoted.approvedCandidate = clone(changeRef);
  promoted.supersedes = clone(baselineRef);
  return promoted;
}

test("change promotion creates a new version that exactly supersedes its target", () => {
  const previous = baseline();
  const candidate = changeSet(previous);
  const promoted = changedBaseline(previous, candidate);
  assert.equal(
    validateRequirementsBaselinePromotion({
      candidate,
      candidateRef: changeRef,
      baseline: promoted,
      previousBaseline: previous,
      previousBaselineRef: baselineRef,
    }),
    promoted,
  );
});

test("change promotion rejects missing lineage, reused identity, and stale candidates", () => {
  const previous = baseline();
  const candidate = changeSet(previous);

  const missingSupersedes = changedBaseline(previous, candidate);
  delete missingSupersedes.supersedes;
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: changeRef,
        baseline: missingSupersedes,
        previousBaseline: previous,
        previousBaselineRef: baselineRef,
      }),
    /supersedes does not match/,
  );

  const reusedId = changedBaseline(previous, candidate);
  reusedId.baselineId = previous.baselineId;
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: changeRef,
        baseline: reusedId,
        previousBaseline: previous,
        previousBaselineRef: baselineRef,
      }),
    /new baseline ID/,
  );

  const reusedVersion = changedBaseline(previous, candidate);
  reusedVersion.version = previous.version;
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: changeRef,
        baseline: reusedVersion,
        previousBaseline: previous,
        previousBaselineRef: baselineRef,
      }),
    /new baseline version/,
  );

  const lowerVersion = changedBaseline(previous, candidate);
  lowerVersion.version = "0.9.0";
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate,
        candidateRef: changeRef,
        baseline: lowerVersion,
        previousBaseline: previous,
        previousBaselineRef: baselineRef,
      }),
    /strictly greater/,
  );

  const stale = changeSet(previous);
  stale.expectedRequirementsDigest = digest("0");
  assert.throws(
    () =>
      validateRequirementsBaselinePromotion({
        candidate: stale,
        candidateRef: changeRef,
        baseline: changedBaseline(previous, stale),
        previousBaseline: previous,
        previousBaselineRef: baselineRef,
      }),
    /expected requirements digest is stale/,
  );
});


test("requirements baseline and ProjectOverview baseline are an atomic lineage pair", async () => {
  const current = baseline();
  const value = changeSet(current);
  const missingOverview = changeContext(current);
  delete missingOverview.loadedInputs["project-overview-baseline"];
  await assert.rejects(
    () => runtimeContract.validate(value, missingOverview),
    /requirements-baseline and project-overview-baseline together/,
  );
});
