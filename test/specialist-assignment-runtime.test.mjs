import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { createSpecialistAssignmentRuntime } from "../src/specialist-assignment-runtime.mjs";
import { createSpecialistAssignmentRuntimeV2 } from "../src/specialist-assignment-runtime-v2.mjs";
import { promoteSpecialistAssignmentBaseline } from "../src/specialist-assignment-gate.mjs";
import { promoteSpecialistAssignmentBaselineV2 } from "../src/specialist-assignment-gate-v2.mjs";
import { rankSpecialistsDeterministically } from "../src/specialist-assignment.mjs";

function store() {
  const values = new Map();
  return {
    get: async (key) => values.get(key),
    put: async (key, value) => values.set(key, structuredClone(value)),
  };
}

const workBreakdown = {
  kind: "WorkBreakdownBaseline",
  baselineId: "WBB-TEST-001",
  workItems: [
    { id: "WI-A", "required-capabilities": ["CAP-A"] },
    { id: "WI-B", "required-capabilities": ["CAP-B"] },
  ],
};
const workDependency = {
  kind: "WorkDependencyBaseline",
  baselineId: "WDB-TEST-001",
  nodes: ["WI-A", "WI-B"],
  edges: [{ prerequisiteId: "WI-A", dependentId: "WI-B" }],
};
const capabilityCatalog = {
  kind: "CapabilityCatalog",
  catalogId: "CC-TEST-001",
  capabilities: [
    { id: "CAP-A", requiredToolIds: [], requiredGrantIds: [] },
    {
      id: "CAP-B",
      requiredToolIds: ["TOOL-B"],
      requiredGrantIds: [],
    },
  ],
};
const specialistCatalog = {
  kind: "SpecialistCatalog",
  catalogId: "SC-TEST-001",
  profiles: [
    {
      id: "P-ALL",
      capabilityIds: ["CAP-A", "CAP-B"],
      toolIds: ["TOOL-B"],
      grantIds: [],
    },
  ],
};
const assignmentPolicy = {
  kind: "AssignmentPolicy",
  policyId: "AP-TEST-001",
  workItemRules: [],
  profilePriorities: [],
};
const projectOverview = {
  kind: "ProjectOverviewBaseline",
  baselineId: "POB-TEST-001",
  version: "1.0.0",
};
const repositoryContext = {
  kind: "RepositorySnapshot",
  repository: "C:/repos/fixture",
  revision: "0123456789abcdef0123456789abcdef01234567",
  treeDigest:
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function exactBindings(input) {
  return [
    [
      "work-breakdown-baseline",
      input.workBreakdown.baselineId,
      input.workBreakdown,
    ],
    [
      "work-dependency-baseline",
      input.workDependency.baselineId,
      input.workDependency,
    ],
    [
      "capability-catalog",
      input.capabilityCatalog.catalogId,
      input.capabilityCatalog,
    ],
    [
      "specialist-catalog",
      input.specialistCatalog.catalogId,
      input.specialistCatalog,
    ],
    [
      "assignment-policy",
      input.assignmentPolicy.policyId,
      input.assignmentPolicy,
    ],
    [
      "project-overview-baseline",
      input.projectOverview.baselineId,
      input.projectOverview,
    ],
    [
      "repository-context",
      "repository-snapshot-fixture-0123456",
      input.repositoryContext,
    ],
  ].map(([role, artifactId, value]) => ({
    role,
    artifact: {
      artifactId,
      digest: canonicalJsonDigest(value),
    },
  }));
}

function invocation(overrides = {}) {
  const input = {
    executionId: "SA-EXEC-1",
    workBreakdown,
    workDependency,
    capabilityCatalog,
    specialistCatalog,
    assignmentPolicy,
    projectOverview,
    repositoryContext,
    ...overrides,
  };
  if (!Object.hasOwn(overrides, "inputBindings")) {
    input.inputBindings = exactBindings(input);
  }
  return input;
}

test("runtime checkpoints exact seven-input candidate and replays with zero ranker calls", async () => {
  let calls = 0;
  const runtime = createSpecialistAssignmentRuntime({
    checkpointStore: store(),
    ranker: {
      descriptor: { id: "fixture.ranker", version: "1.0.0" },
      rank(eligibility, policy) {
        calls += 1;
        return rankSpecialistsDeterministically(eligibility, policy);
      },
    },
  });
  const input = invocation();
  const first = await runtime.execute(input);
  const replay = await runtime.execute(input);
  assert.equal(first.outcome, "assigned");
  assert.equal(first.draft.value.assignments.length, 2);
  assert.equal(first.draft.value.inputBindings.length, 7);
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  assert.equal(replay.draft.ref.digest, first.draft.ref.digest);
});

test("runtime rejects missing, stale, and duplicate declared input bindings before ranking", async () => {
  let calls = 0;
  const runtime = createSpecialistAssignmentRuntime({
    checkpointStore: store(),
    ranker: {
      descriptor: { id: "fixture.ranker", version: "1.0.0" },
      rank(eligibility, policy) {
        calls += 1;
        return rankSpecialistsDeterministically(eligibility, policy);
      },
    },
  });
  const complete = invocation({ executionId: "SA-BINDINGS-1" });
  await assert.rejects(
    runtime.execute({
      ...complete,
      inputBindings: complete.inputBindings.slice(0, 6),
    }),
    /all seven declared inputs exactly once/,
  );
  const stale = structuredClone(complete.inputBindings);
  stale.find(({ role }) => role === "project-overview-baseline").artifact.digest =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  await assert.rejects(
    runtime.execute({ ...complete, inputBindings: stale }),
    /does not match exact input bytes/,
  );
  const duplicate = structuredClone(complete.inputBindings);
  duplicate[6] = structuredClone(duplicate[0]);
  await assert.rejects(
    runtime.execute({ ...complete, inputBindings: duplicate }),
    /repeats role/,
  );
  assert.equal(calls, 0);
});

test("runtime returns one fail-closed clarification result instead of a partial draft", async () => {
  const runtime = createSpecialistAssignmentRuntime({
    checkpointStore: store(),
  });
  const result = await runtime.execute(
    invocation({
      executionId: "SA-EXEC-2",
      specialistCatalog: {
        kind: "SpecialistCatalog",
        catalogId: "SC-TEST-NARROW-001",
        profiles: [
          {
            id: "P-A",
            capabilityIds: ["CAP-A"],
            toolIds: [],
            grantIds: [],
          },
        ],
      },
    }),
  );
  assert.equal(result.outcome, "needs-clarification");
  assert.equal(result.draft, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ workItemId }) => workItemId),
    ["WI-B"],
  );
});

test("Gate promotes only exact approved canonical draft bytes", async () => {
  const runtime = createSpecialistAssignmentRuntime({
    checkpointStore: store(),
  });
  const result = await runtime.execute(
    invocation({ executionId: "SA-EXEC-3" }),
  );
  const draft = result.draft.value;
  const bytes = Buffer.from(canonicalJson(draft), "utf8");
  const approval = {
    decision: "approve",
    candidate: {
      artifactId: result.draft.ref.artifactId,
      digest: result.draft.ref.digest,
    },
    approvedBy: "owner",
  };
  const baseline = promoteSpecialistAssignmentBaseline({
    draft,
    draftRef: result.draft.ref,
    exactDraftBytes: bytes,
    approval,
  });
  assert.equal(baseline.assignments.length, 2);
  assert.equal(baseline.assignmentDigest, draft.assignmentDigest);
  assert.throws(
    () =>
      promoteSpecialistAssignmentBaseline({
        draft,
        draftRef: {
          ...result.draft.ref,
          digest: sha256Digest(Buffer.from("modified")),
        },
        exactDraftBytes: bytes,
        approval,
      }),
    /bytes do not match/,
  );
});


test("Gate v2 promotes only the exact checkpoint-replayed draft with content-addressed owner approval", async () => {
  let calls = 0;
  const runtime = createSpecialistAssignmentRuntimeV2({
    checkpointStore: store(),
    ranker: {
      descriptor: { id: "fixture.ranker", version: "2.0.0" },
      rank(eligibility, policy) {
        calls += 1;
        return rankSpecialistsDeterministically(eligibility, policy);
      },
    },
  });
  const result = await runtime.execute(invocation({ executionId: "SA-EXEC-V2" }));
  const replay = await runtime.verifyCheckpointedExecution({
    executionId: result.executionId,
    executionFingerprint: result.executionFingerprint,
  });
  const approval = {
    kind: "SpecialistAssignmentGateApproval",
    decision: "approve",
    candidate: { artifactId: result.draft.ref.artifactId, digest: result.draft.ref.digest },
    checkpointDigest: replay.checkpointDigest,
    executionFingerprint: replay.executionFingerprint,
    approvedBy: "owner",
  };
  const exactApprovalBytes = Buffer.from(canonicalJson(approval), "utf8");
  const approvalRef = { artifactId: "SA-GATE-APPROVAL-V2", digest: sha256Digest(exactApprovalBytes) };
  const baseline = promoteSpecialistAssignmentBaselineV2({ checkpointReplay: replay, approval, approvalRef, exactApprovalBytes });
  assert.equal(baseline.version, "2.0.0");
  assert.equal(baseline.approvedDraft.digest, result.draft.ref.digest);
  assert.deepEqual(baseline.approvalEvidence, [approvalRef]);
  assert.equal(calls, 1, "checkpoint verification and Gate promotion must not reinvoke the ranker");

  for (const forged of [structuredClone(replay), JSON.parse(JSON.stringify(replay)), { ...replay }]) {
    assert.throws(
      () => promoteSpecialistAssignmentBaselineV2({ checkpointReplay: forged, approval, approvalRef, exactApprovalBytes }),
      /unforgeable checkpoint replay receipt/,
    );
  }
  await assert.rejects(
    runtime.verifyCheckpointedExecution({
      executionId: result.executionId,
      executionFingerprint: canonicalJsonDigest({ changed: "input-closure" }),
    }),
    /exact checkpoint/,
  );
  assert.equal(calls, 1);
});
