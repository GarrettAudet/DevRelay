import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  applyWorkBreakdownChangeSet,
  sameWorkBreakdownArtifactRef,
  validateWorkBreakdownArtifact,
  WorkBreakdownArtifactValidationError,
} from "../src/work-breakdown-artifact-validator.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const ref = (
  artifactId,
  schema = "https://devrelay.dev/artifacts/test/v1",
  mediaType = "application/vnd.devrelay.test+json",
  hash = digest("a"),
  uri = `artifact://work-breakdown-tests/${artifactId}`,
) => ({ artifactId, schema, mediaType, digest: hash, uri });

function sourceRef() {
  return {
    role: "requirements-baseline",
    artifact: ref("requirements-baseline", undefined, undefined, digest("b")),
    jsonPointer: "/requirements/acceptanceCriteria/0",
  };
}

function workItem(id = "WI-ONE") {
  return {
    id,
    objective: "Produce one bounded deliverable.",
    "bounded-scope": {
      included: ["The explicitly authorized change."],
      excluded: ["Execution, scheduling, and assignment."],
    },
    deliverables: [
      {
        id: `DEL-${id.slice(3)}`,
        description: "One reviewable planning deliverable.",
        artifactKind: "source-change",
      },
    ],
    "work-type": "code-change",
    "acceptance-criterion-refs": ["AC-ONE"],
    "architecture-refs": ["EL-ONE"],
    "contract-refs": [],
    "required-capabilities": ["CAP-CODE"],
    "dependency-hints": [
      {
        "work-item-ref": id,
        relation: "after",
        rationale: "A deliberately unresolved, non-authoritative proposal.",
        authority: "hint",
      },
    ],
    "verification-plan": {
      checks: [
        {
          id: `VC-${id.slice(3)}`,
          method: "Run the bounded verification command.",
          successCriteria: "The declared acceptance criterion passes.",
        },
      ],
    },
    "required-evidence": [
      {
        kind: "test-report",
        description: "Exact test output bound to the produced change.",
      },
    ],
    "source-refs": [sourceRef()],
  };
}

function draft(item = workItem()) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownDraft",
    draftId: "WBD-ONE",
    operation: "establish-breakdown",
    inputBindings: [
      {
        role: "requirements-baseline",
        artifact: sourceRef().artifact,
      },
    ],
    workItems: [item],
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-ONE",
        disposition: "planned",
        workItemRefs: [item.id],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-ONE",
        disposition: "planned",
        workItemRefs: [item.id],
      },
    ],
    nativeArtifacts: [],
    sourceRefs: [sourceRef()],
  };
}

function baseline(items = [workItem("WI-ONE"), workItem("WI-TWO")]) {
  items[1]["acceptance-criterion-refs"] = ["AC-TWO"];
  items[1]["architecture-refs"] = ["EL-TWO"];
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownBaseline",
    baselineId: "WBB-ONE",
    version: "1.0.0",
    approvedCandidate: ref(
      "WBD-ONE",
      "https://devrelay.dev/artifacts/work-breakdown-draft/v1",
      "application/vnd.devrelay.work-breakdown-draft+json",
      digest("c"),
    ),
    inputBindings: [
      {
        role: "requirements-baseline",
        artifact: sourceRef().artifact,
      },
    ],
    workItems: items,
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-ONE",
        disposition: "planned",
        workItemRefs: ["WI-ONE"],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-ONE",
        disposition: "planned",
        workItemRefs: ["WI-ONE"],
      },
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-TWO",
        disposition: "planned",
        workItemRefs: ["WI-TWO"],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-TWO",
        disposition: "planned",
        workItemRefs: ["WI-TWO"],
      },
    ],
    approvalEvidence: [ref("gate-evidence", undefined, undefined, digest("d"))],
    sourceRefs: [sourceRef()],
  };
}

test("WorkItemDraft is a closed literal contract with the seven deliverable-oriented types", () => {
  const valid = draft();
  assert.equal(validateWorkBreakdownArtifact(valid), valid);

  const directRequirementRef = structuredClone(valid);
  directRequirementRef.workItems[0]["requirement-refs"] = ["REQ-ONE"];
  assert.throws(
    () => validateWorkBreakdownArtifact(directRequirementRef),
    WorkBreakdownArtifactValidationError,
  );

  const directStoryRef = structuredClone(valid);
  directStoryRef.workItems[0]["user-story-refs"] = ["US-ONE"];
  assert.throws(
    () => validateWorkBreakdownArtifact(directStoryRef),
    WorkBreakdownArtifactValidationError,
  );

  const executionType = structuredClone(valid);
  executionType.workItems[0]["work-type"] = "implementation";
  assert.throws(
    () => validateWorkBreakdownArtifact(executionType),
    WorkBreakdownArtifactValidationError,
  );
});

test("nested JSON Pointers are valid while malformed escapes fail closed", () => {
  assert.equal(validateWorkBreakdownArtifact(draft()).kind, "WorkBreakdownDraft");
  const malformed = draft();
  malformed.workItems[0]["source-refs"][0].jsonPointer =
    "/requirements/~2bad";
  assert.throws(
    () => validateWorkBreakdownArtifact(malformed),
    WorkBreakdownArtifactValidationError,
  );
});

test("dependency hints remain non-authoritative proposals", () => {
  const candidate = draft();
  candidate.workItems[0]["dependency-hints"] = [
    {
      "work-item-ref": "WI-DOES-NOT-EXIST",
      relation: "before",
      rationale: "WorkDependencyAnalysis will resolve this proposal.",
      authority: "hint",
    },
    {
      "work-item-ref": "WI-ONE",
      relation: "after",
      rationale: "A self-cycle remains a proposal until dependency analysis.",
      authority: "hint",
    },
  ];
  assert.equal(validateWorkBreakdownArtifact(candidate), candidate);
});

test("artifact identity ignores relocation but not schema, media type, or digest", () => {
  const left = ref("artifact", undefined, undefined, digest("a"), "file:///a");
  const relocated = { ...left, uri: "artifact://relocated/same-bytes" };
  assert.equal(sameWorkBreakdownArtifactRef(left, relocated), true);
  assert.equal(
    sameWorkBreakdownArtifactRef(left, { ...left, digest: digest("b") }),
    false,
  );
  assert.equal(
    sameWorkBreakdownArtifactRef(left, {
      ...left,
      schema: "https://devrelay.dev/artifacts/other/v1",
    }),
    false,
  );
  assert.equal(
    sameWorkBreakdownArtifactRef(left, {
      ...left,
      mediaType: "application/vnd.devrelay.other+json",
    }),
    false,
  );
});

test("typed change application preserves unrelated work and rejects stale prior digests", () => {
  const current = baseline();
  const currentRef = ref(
    current.baselineId,
    "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
    "application/vnd.devrelay.work-breakdown-baseline+json",
    digest("e"),
  );
  const replacement = structuredClone(current.workItems[0]);
  replacement.objective = "Produce the revised bounded deliverable.";
  const changeSet = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownChangeSetDraft",
    changeSetId: "WBCS-ONE",
    operation: "decompose-change",
    currentBaseline: currentRef,
    inputBindings: current.inputBindings,
    changes: [
      {
        operation: "update",
        workItemId: "WI-ONE",
        priorItemDigest: canonicalJsonDigest(current.workItems[0]),
        workItem: replacement,
      },
    ],
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-ONE",
        disposition: "planned",
        workItemRefs: ["WI-ONE"],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-ONE",
        disposition: "planned",
        workItemRefs: ["WI-ONE"],
      },
    ],
    resultingWorkItemsDigest: digest("f"),
    nativeArtifacts: [],
    sourceRefs: [sourceRef()],
  };
  const applied = applyWorkBreakdownChangeSet({
    baseline: current,
    baselineRef: currentRef,
    changeSet,
  });
  assert.deepEqual(
    applied.workItems.map(({ id }) => id),
    ["WI-ONE", "WI-TWO"],
  );
  assert.equal(applied.workItems[0].objective, replacement.objective);
  assert.equal(applied.workItems[1].objective, current.workItems[1].objective);

  const stale = structuredClone(changeSet);
  stale.changes[0].priorItemDigest = digest("0");
  assert.throws(
    () =>
      applyWorkBreakdownChangeSet({
        baseline: current,
        baselineRef: currentRef,
        changeSet: stale,
      }),
    WorkBreakdownArtifactValidationError,
  );
});
