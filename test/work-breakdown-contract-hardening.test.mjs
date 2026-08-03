import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import {
  applyWorkBreakdownChangeSet,
  validateWorkBreakdownArtifact,
  validateWorkBreakdownCandidateAgainstInputs,
  WorkBreakdownArtifactValidationError,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
} from "../src/work-breakdown-artifact-validator.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../src/work-breakdown-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const clone = (value) => structuredClone(value);

async function json(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

const [
  initialCandidate,
  initialState,
  changeCandidate,
  changeState,
  currentBaseline,
  approvedChange,
  requirements,
  overview,
  architecture,
  contractDisposition,
  capabilityCatalog,
  repository,
  traceabilitySnapshot,
] = await Promise.all([
  json("examples/artifacts/work-breakdown-draft-auth-001.json"),
  json("examples/artifacts/project-work-breakdown-state-unbaselined-001.json"),
  json("examples/artifacts/work-breakdown-change-set-auth-001.json"),
  json("examples/artifacts/project-work-breakdown-state-baselined-001.json"),
  json("examples/artifacts/work-breakdown-baseline-auth-001.json"),
  json("examples/artifacts/approved-change-package-auth-001.json"),
  json("examples/artifacts/requirements-baseline-001.json"),
  json("examples/artifacts/project-overview-baseline-001.json"),
  json("examples/artifacts/architecture-baseline-001.json"),
  json("examples/artifacts/contract-disposition-auth-001.json"),
  json("examples/artifacts/capability-catalog-work-breakdown-001.json"),
  json("examples/artifacts/repository-snapshot-001.json"),
  json("examples/artifacts/traceability-graph-auth-001.json"),
]);

function bindingRef(candidate, role) {
  const binding = candidate.inputBindings.find((entry) => entry.role === role);
  assert.ok(binding, `fixture is missing ${role}`);
  return binding.artifact;
}

function loadedInputs(candidate, values) {
  return Object.fromEntries(
    Object.entries(values).map(([role, value]) => [
      role,
      [{ ref: clone(bindingRef(candidate, role)), value }],
    ]),
  );
}

function initialFixture() {
  const candidate = clone(initialCandidate);
  return {
    candidate,
    loaded: loadedInputs(candidate, {
      "project-work-breakdown-state": clone(initialState),
      "requirements-baseline": clone(requirements),
      "project-overview-baseline": clone(overview),
      "architecture-baseline": clone(architecture),
      "contract-disposition": clone(contractDisposition),
      "capability-catalog": clone(capabilityCatalog),
      "repository-context": clone(repository),
    }),
  };
}

function changeFixture() {
  const candidate = clone(changeCandidate);
  const baselineRef = clone(bindingRef(candidate, "current-work-breakdown-baseline"));
  const values = {
    "project-work-breakdown-state": clone(changeState),
    "requirements-baseline": clone(requirements),
    "project-overview-baseline": clone(overview),
    "architecture-baseline": clone(architecture),
    "contract-disposition": clone(contractDisposition),
    "capability-catalog": clone(capabilityCatalog),
    "current-repository-snapshot": clone(repository),
    "current-work-breakdown-baseline": clone(currentBaseline),
    "approved-change-package": clone(approvedChange),
  };
  return {
    candidate,
    baselineRef,
    values,
    loaded: loadedInputs(candidate, values),
  };
}

function refreshLoaded(active) {
  active.loaded = loadedInputs(active.candidate, active.values);
  return active;
}

test("establish-breakdown permits an all-no-work candidate with zero work items", () => {
  const active = initialFixture();
  active.candidate.workItems = [];
  active.candidate.coverageDispositions = active.candidate.coverageDispositions.map(
    ({ scopeKind, scopeRef }) => ({
      scopeKind,
      scopeRef,
      disposition: "no-work-required",
      rationale: "The Gate must separately approve this no-work disposition.",
    }),
  );
  assert.doesNotThrow(() =>
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: active.candidate,
      operation: "establish-breakdown",
      loadedInputs: active.loaded,
    }),
  );
});

test("decompose-change permits a coverage-only delta with an unchanged item set", () => {
  const active = changeFixture();
  active.values["requirements-baseline"].requirements.acceptanceCriteria.push({
    id: "AC-AUTH-NEW-NO-WORK",
  });
  active.values["approved-change-package"].authorizedScope = {
    acceptanceCriteria: ["AC-AUTH-NEW-NO-WORK"],
    architecture: [],
    contracts: [],
  };
  active.candidate.changes = [];
  active.candidate.coverageDispositions = [
    {
      scopeKind: "acceptance-criterion",
      scopeRef: "AC-AUTH-NEW-NO-WORK",
      disposition: "already-satisfied",
      rationale: "The current repository already contains the approved behavior.",
      currentEvidence: [
        clone(bindingRef(active.candidate, "current-repository-snapshot")),
      ],
    },
  ];
  const applied = applyWorkBreakdownChangeSet({
    baseline: active.values["current-work-breakdown-baseline"],
    baselineRef: active.baselineRef,
    changeSet: active.candidate,
  });
  active.candidate.resultingWorkItemsDigest = applied.workItemsDigest;
  refreshLoaded(active);
  assert.doesNotThrow(() =>
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: active.candidate,
      operation: "decompose-change",
      loadedInputs: active.loaded,
    }),
  );
  assert.equal(applied.workItems.length, currentBaseline.workItems.length);
});

test("retiring work fails when preserved planned coverage would dangle", () => {
  const active = changeFixture();
  active.values["approved-change-package"].authorizedScope = {
    acceptanceCriteria: ["AC-AUTH-001"],
    architecture: ["EL-AUTH-SERVICE"],
    contracts: ["CT-AUTH-HTTP"],
  };
  active.candidate.changes = [
    clone(
      changeCandidate.changes.find(
        (change) => change.operation === "retire",
      ),
    ),
  ];
  active.candidate.coverageDispositions = [
    {
      scopeKind: "acceptance-criterion",
      scopeRef: "AC-AUTH-001",
      disposition: "planned",
      workItemRefs: ["WI-AUTH-CORE"],
    },
    {
      scopeKind: "architecture",
      scopeRef: "EL-AUTH-SERVICE",
      disposition: "planned",
      workItemRefs: ["WI-AUTH-CORE"],
    },
    {
      scopeKind: "contract",
      scopeRef: "CT-AUTH-HTTP",
      disposition: "planned",
      workItemRefs: ["WI-AUTH-CORE"],
    },
  ];
  refreshLoaded(active);
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: active.candidate,
        operation: "decompose-change",
        loadedInputs: active.loaded,
      }),
    /planned coverage references missing work item WI-AUTH-FAILURE-TESTS/,
  );
});

test("an approved removal may reference prior scope, but arbitrary absent scope is rejected", () => {
  const active = changeFixture();
  active.values["requirements-baseline"].requirements.acceptanceCriteria =
    active.values["requirements-baseline"].requirements.acceptanceCriteria.filter(
      ({ id }) => id !== "AC-AUTH-DISCLOSURE-001",
    );
  active.values["approved-change-package"].authorizedScope = {
    acceptanceCriteria: ["AC-AUTH-DISCLOSURE-001"],
    architecture: ["EL-AUTH-SERVICE"],
    contracts: [],
  };
  active.candidate.changes = [
    clone(
      changeCandidate.changes.find(
        (change) => change.operation === "retire",
      ),
    ),
  ];
  active.candidate.coverageDispositions = [
    {
      scopeKind: "acceptance-criterion",
      scopeRef: "AC-AUTH-DISCLOSURE-001",
      disposition: "no-work-required",
      rationale: "The approved requirement removal retires its only planned work.",
    },
    {
      scopeKind: "architecture",
      scopeRef: "EL-AUTH-SERVICE",
      disposition: "planned",
      workItemRefs: ["WI-AUTH-CORE"],
    },
  ];
  let applied = applyWorkBreakdownChangeSet({
    baseline: active.values["current-work-breakdown-baseline"],
    baselineRef: active.baselineRef,
    changeSet: active.candidate,
  });
  active.candidate.resultingWorkItemsDigest = applied.workItemsDigest;
  refreshLoaded(active);
  assert.doesNotThrow(() =>
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: active.candidate,
      operation: "decompose-change",
      loadedInputs: active.loaded,
    }),
  );

  const arbitrary = clone(active.candidate);
  const arbitraryPackage = clone(active.values["approved-change-package"]);
  arbitraryPackage.authorizedScope.acceptanceCriteria = ["AC-NOT-HISTORICAL"];
  arbitrary.coverageDispositions[0].scopeRef = "AC-NOT-HISTORICAL";
  const arbitraryValues = {
    ...active.values,
    "approved-change-package": arbitraryPackage,
  };
  const arbitraryLoaded = loadedInputs(arbitrary, arbitraryValues);
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: arbitrary,
        operation: "decompose-change",
        loadedInputs: arbitraryLoaded,
      }),
    /authorizes unknown acceptance-criterion AC-NOT-HISTORICAL/,
  );
});

test("source provenance is role-bound to the exact loaded input", () => {
  const active = initialFixture();
  const itemSource = active.candidate.workItems[0]["source-refs"][0];
  assert.equal(itemSource.role, "requirements-baseline");
  itemSource.role = "architecture-baseline";
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: active.candidate,
        operation: "establish-breakdown",
        loadedInputs: active.loaded,
      }),
    /source role architecture-baseline does not contain the exact referenced artifact/,
  );
});

test("architecture refs are ArchitectureElement IDs only and candidates cannot embed Gate approval", () => {
  const architectureRef = initialFixture().candidate;
  architectureRef.workItems[0]["architecture-refs"] = ["IF-AUTH-HTTP"];
  assert.throws(
    () => validateWorkBreakdownArtifact(architectureRef),
    WorkBreakdownArtifactValidationError,
  );

  const spoofedApproval = initialFixture().candidate;
  spoofedApproval.coverageDispositions[0] = {
    scopeKind: "acceptance-criterion",
    scopeRef: spoofedApproval.coverageDispositions[0].scopeRef,
    disposition: "no-work-required",
    rationale: "An adapter must not be able to claim Gate approval.",
    approval: {
      authority: "work-breakdown-gate",
      candidate: spoofedApproval.nativeArtifacts[0],
      scopeKind: "acceptance-criterion",
      scopeRef: spoofedApproval.coverageDispositions[0].scopeRef,
      evidence: spoofedApproval.nativeArtifacts[0],
    },
  };
  assert.throws(
    () => validateWorkBreakdownArtifact(spoofedApproval),
    WorkBreakdownArtifactValidationError,
  );
});
test("attached architecture models are exact, restart-safe semantic inputs", () => {
  const active = initialFixture();
  const architectureLoaded = active.loaded["architecture-baseline"][0];
  const model = clone(architectureLoaded.value.sections.architectureModel.content);
  const modelBytes = Buffer.from(JSON.stringify(model), "utf8");
  const modelRef = {
    artifactId: model.modelId,
    schema: "https://devrelay.dev/artifacts/architecture-model/v1",
    mediaType: "application/vnd.devrelay.architecture-model+json",
    digest: sha256Digest(modelBytes),
    uri: "artifact://work-breakdown-tests/architecture-model",
  };
  architectureLoaded.value.sections.architectureModel = {
    mode: "attached",
    contentId: model.modelId,
    artifact: modelRef,
  };
  const uniqueSources = (sources) => [
    ...new Map(
      sources.map((source) => [
        source.role + "|" + source.artifact.digest + "|" + source.jsonPointer,
        source,
      ]),
    ).values(),
  ];
  for (const item of active.candidate.workItems) {
    for (const source of item["source-refs"]) {
      if (source.role === "architecture-baseline") {
        source.jsonPointer = "/sections/architectureModel";
      }
    }
    item["source-refs"] = uniqueSources(item["source-refs"]);
  }
  for (const source of active.candidate.sourceRefs) {
    if (source.role === "architecture-baseline") {
      source.jsonPointer = "/sections/architectureModel";
    }
  }
  active.candidate.sourceRefs = uniqueSources(active.candidate.sourceRefs);
  const exactRecord = { ref: modelRef, bytes: modelBytes, value: model };
  assert.doesNotThrow(() =>
    validateWorkBreakdownCandidateAgainstInputs({
      candidate: active.candidate,
      operation: "establish-breakdown",
      loadedInputs: active.loaded,
      architectureModelAttachment: exactRecord,
    }),
  );
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: active.candidate,
        operation: "establish-breakdown",
        loadedInputs: active.loaded,
      }),
    /did not resolve to its verified artifact record/,
  );
  const wrongProvenance = clone(exactRecord);
  wrongProvenance.ref.digest = "sha256:" + "0".repeat(64);
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: active.candidate,
        operation: "establish-breakdown",
        loadedInputs: active.loaded,
        architectureModelAttachment: wrongProvenance,
      }),
    /did not resolve to its verified artifact record/,
  );
  const wrongContent = {
    ...exactRecord,
    bytes: Buffer.from(JSON.stringify({ ...model, modelId: "MODEL-WRONG" })),
  };
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: active.candidate,
        operation: "establish-breakdown",
        loadedInputs: active.loaded,
        architectureModelAttachment: wrongContent,
      }),
    /bytes do not match its digest/,
  );
});

test("architecture upstream and approved pre-change lineage are exact", () => {
  const initial = initialFixture();
  initial.loaded["architecture-baseline"][0].value.requirementsBaseline.digest =
    "sha256:" + "0".repeat(64);
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: initial.candidate,
        operation: "establish-breakdown",
        loadedInputs: initial.loaded,
      }),
    /ArchitectureBaseline requirementsBaseline/,
  );

  const change = changeFixture();
  change.values["approved-change-package"].preChange.architectureBaseline.digest =
    "sha256:" + "0".repeat(64);
  refreshLoaded(change);
  assert.throws(
    () =>
      validateWorkBreakdownCandidateAgainstInputs({
        candidate: change.candidate,
        operation: "decompose-change",
        loadedInputs: change.loaded,
      }),
    /ApprovedChangePackage preChange architectureBaseline/,
  );
});

test("approved change traceability is an exact snapshot with member node IDs", async () => {
  const active = changeFixture();
  const packageRef = bindingRef(active.candidate, "approved-change-package");
  const contract = workBreakdownRuntimeArtifactContracts().find(
    ({ schema }) => schema === packageRef.schema,
  );
  const snapshotRef =
    active.values["approved-change-package"].traceabilityRefs[0].artifact;
  const snapshotBytes = Buffer.from(
    JSON.stringify(traceabilitySnapshot, null, 2) + "\n",
    "utf8",
  );
  const context = {
    phase: "input",
    ref: packageRef,
    invocation: {
      module: { id: "work-breakdown", version: "0.1.0", operation: "decompose-change" },
    },
    loadedInputs: active.loaded,
    async loadArtifact(ref) {
      assert.equal(ref.digest, snapshotRef.digest);
      return { ref: snapshotRef, bytes: snapshotBytes, value: traceabilitySnapshot };
    },
  };
  await assert.doesNotReject(
    contract.validate(active.values["approved-change-package"], context),
  );

  const nonmember = clone(active.values["approved-change-package"]);
  nonmember.traceabilityRefs[0].nodeId = "sha256:" + "0".repeat(64);
  await assert.rejects(
    contract.validate(nonmember, context),
    /is not present in its exact snapshot/,
  );

  const wrongSchema = clone(active.values["approved-change-package"]);
  wrongSchema.traceabilityRefs[0].artifact.schema =
    "https://devrelay.dev/artifacts/traceability-graph/v1";
  assert.throws(
    () => validateWorkBreakdownArtifact(wrongSchema),
    WorkBreakdownArtifactValidationError,
  );

  const noncanonicalNode = clone(active.values["approved-change-package"]);
  noncanonicalNode.traceabilityRefs[0].nodeId =
    "acceptance-criterion:AC-AUTH-001";
  assert.throws(
    () => validateWorkBreakdownArtifact(noncanonicalNode),
    WorkBreakdownArtifactValidationError,
  );
});

test("revision requests resolve the exact prior candidate and Gate evidence", async () => {
  const active = initialFixture();
  const candidateBytes = Buffer.from(JSON.stringify(active.candidate), "utf8");
  const candidateRef = {
    artifactId: active.candidate.draftId,
    schema: WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft.schema,
    mediaType: WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft.mediaType,
    digest: sha256Digest(candidateBytes),
    uri: "artifact://work-breakdown-tests/revision-candidate",
  };
  const evidenceValue = { authority: "work-breakdown-gate", outcome: "revise" };
  const evidenceBytes = Buffer.from(JSON.stringify(evidenceValue), "utf8");
  const evidenceRef = {
    artifactId: "WB-GATE-EVIDENCE-ONE",
    schema: "https://devrelay.dev/evidence/work-breakdown-gate/v1",
    mediaType: "application/json",
    digest: sha256Digest(evidenceBytes),
    uri: "artifact://work-breakdown-tests/revision-evidence",
  };
  const revision = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownRevisionRequest",
    revisionRequestId: "WBRR-ONE",
    candidate: candidateRef,
    gateEvidence: evidenceRef,
    issues: [
      {
        code: "WB-REVISION-REQUIRED",
        message: "Narrow the first work item before Gate reconsideration.",
      },
    ],
  };
  const revisionBytes = Buffer.from(JSON.stringify(revision), "utf8");
  const revisionRef = {
    artifactId: revision.revisionRequestId,
    schema: WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownRevisionRequest.schema,
    mediaType:
      WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownRevisionRequest.mediaType,
    digest: sha256Digest(revisionBytes),
    uri: "artifact://work-breakdown-tests/revision-request",
  };
  const runtime = workBreakdownRuntimeArtifactContracts().find(
    ({ schema }) => schema === revisionRef.schema,
  );
  const loadedInputs = {
    ...active.loaded,
    "revision-request": [{ ref: revisionRef, value: revision }],
  };
  const context = {
    phase: "input",
    ref: revisionRef,
    invocation: {
      module: {
        id: "work-breakdown",
        version: "0.1.0",
        operation: "establish-breakdown",
      },
    },
    loadedInputs,
    async loadArtifact(ref) {
      if (ref.artifactId === candidateRef.artifactId) {
        return { ref: candidateRef, bytes: candidateBytes, value: active.candidate };
      }
      if (ref.artifactId === evidenceRef.artifactId) {
        return { ref: evidenceRef, bytes: evidenceBytes, value: evidenceValue };
      }
      throw new Error("unresolved revision attachment");
    },
  };
  await assert.doesNotReject(runtime.validate(revision, context));

  const wrongOperation = clone(active.candidate);
  wrongOperation.operation = "decompose-change";
  const wrongBytes = Buffer.from(JSON.stringify(wrongOperation), "utf8");
  const wrongRef = { ...candidateRef, digest: sha256Digest(wrongBytes) };
  await assert.rejects(
    runtime.validate(
      { ...revision, candidate: wrongRef },
      {
        ...context,
        async loadArtifact(ref) {
          if (ref.artifactId === candidateRef.artifactId) {
            return { ref: wrongRef, bytes: wrongBytes, value: wrongOperation };
          }
          return { ref: evidenceRef, bytes: evidenceBytes, value: evidenceValue };
        },
      },
    ),
    /revision request candidate/,
  );

  await assert.rejects(
    runtime.validate(revision, {
      ...context,
      async loadArtifact(ref) {
        if (ref.artifactId === candidateRef.artifactId) {
          return { ref: candidateRef, bytes: candidateBytes, value: active.candidate };
        }
        throw new Error("Gate evidence is unavailable");
      },
    }),
    /Gate evidence is unavailable/,
  );
});
