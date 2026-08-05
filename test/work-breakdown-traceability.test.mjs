import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureBaselineObserverContributor } from "../src/architecture-traceability-contributor.mjs";
import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import {
  TRACEABILITY_VOCABULARY,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
  queryTraceabilityGraph,
} from "../src/traceability-graph.mjs";
import {
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
  applyWorkBreakdownChangeSet,
} from "../src/work-breakdown-artifact-validator.mjs";
import {
  contractDispositionObserverContributor,
  workBreakdownControlTraceabilityContributor,
  workBreakdownTraceabilityContributor,
  workBreakdownTraceabilityContributors,
} from "../src/work-breakdown-traceability-contributor.mjs";

const [requirementsBytes, overviewBytes, architectureBytes] = await Promise.all([
  readFile(
    new URL(
      "../examples/artifacts/requirements-baseline-001.json",
      import.meta.url,
    ),
  ),
  readFile(
    new URL(
      "../examples/artifacts/project-overview-baseline-001.json",
      import.meta.url,
    ),
  ),
  readFile(
    new URL(
      "../examples/artifacts/architecture-baseline-001.json",
      import.meta.url,
    ),
  ),
]);
const requirementsBaseline = JSON.parse(requirementsBytes);
const overviewBaseline = JSON.parse(overviewBytes);
const architectureBaseline = JSON.parse(architectureBytes);

const REQUIREMENTS_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
  mediaType: "application/vnd.devrelay.requirements-baseline+json",
});
const OVERVIEW_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  mediaType: "application/vnd.devrelay.project-overview-baseline+json",
});
const ARCHITECTURE_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/artifacts/architecture-baseline/v1",
  mediaType: "application/vnd.devrelay.architecture-baseline+json",
});

function loadedFromBytes(ref, bytes, value) {
  assert.equal(sha256Digest(bytes), ref.digest);
  return {
    ref: structuredClone(ref),
    bytes: Buffer.from(bytes),
    value: structuredClone(value),
  };
}

const requirementsEntry = loadedFromBytes(
  architectureBaseline.requirementsBaseline,
  requirementsBytes,
  requirementsBaseline,
);
const overviewEntry = loadedFromBytes(
  {
    artifactId: overviewBaseline.baselineId,
    ...OVERVIEW_CONTRACT,
    digest: sha256Digest(overviewBytes),
    uri: "memory://fixtures/project-overview-baseline-001.json",
  },
  overviewBytes,
  overviewBaseline,
);
const architectureEntry = loadedFromBytes(
  {
    artifactId: architectureBaseline.baselineId,
    ...ARCHITECTURE_CONTRACT,
    digest: sha256Digest(architectureBytes),
    uri: "memory://fixtures/architecture-baseline-001.json",
  },
  architectureBytes,
  architectureBaseline,
);

function loadedValue(value, contract, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    ref: {
      artifactId,
      ...contract,
      digest: sha256Digest(bytes),
      uri: `memory://fixtures/${artifactId}.json`,
    },
    bytes,
    value: structuredClone(value),
  };
}

function contractDisposition({ applicable = true } = {}) {
  const value = applicable
    ? {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ContractDisposition",
        dispositionId: "CD-AUTH-001",
        mode: "baseline",
        contractBaseline: {
          artifactId: "contract-baseline-auth-001",
          schema: "https://example.test/artifacts/contract-baseline/v1",
          mediaType: "application/json",
          digest: `sha256:${"c".repeat(64)}`,
          uri: "memory://fixtures/contract-baseline-auth-001.json",
        },
        contractTargets: [
          {
            id: "CT-AUTH-HTTP",
            kind: "http-interface",
            description: "Authentication HTTP interface",
          },
        ],
      }
    : {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ContractDisposition",
        dispositionId: "CD-AUTH-NOT-APPLICABLE",
        mode: "not-applicable",
        notApplicable: {
          apiVersion: "devrelay.dev/v1alpha1",
          kind: "ApprovedNotApplicable",
          approvalId: "ANA-AUTH-CONTRACTS",
          purpose: "contract-disposition",
          rationale: "This fixture has no contract work.",
          authority: { id: "fixture-owner", role: "human-approver" },
          approvalEvidence: [
            {
              artifactId: "contract-na-approval",
              schema: "https://example.test/artifacts/approval/v1",
              mediaType: "application/json",
              digest: `sha256:${"d".repeat(64)}`,
              uri: "memory://fixtures/contract-na-approval.json",
            },
          ],
        },
      };
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
    value.dispositionId,
  );
}

function sourceRef() {
  return {
    role: "requirements-baseline",
    artifact: structuredClone(requirementsEntry.ref),
    jsonPointer: "/requirements/acceptanceCriteria/0",
  };
}

function workItem({
  id,
  objective = `Plan ${id}`,
  acceptanceCriteria = [],
  architecture = [],
  contracts = [],
  dependencyHints = [],
} = {}) {
  return {
    id,
    objective,
    "bounded-scope": {
      included: [`Deliver ${id}`],
      excluded: ["Execution and completion claims"],
    },
    deliverables: [
      {
        id: `DEL-${id.slice(3)}`,
        description: `Candidate deliverable for ${id}`,
        artifactKind: "planning-artifact",
      },
    ],
    "work-type": "code-change",
    "acceptance-criterion-refs": acceptanceCriteria,
    "architecture-refs": architecture,
    "contract-refs": contracts,
    "required-capabilities": ["CAP-CODE-CHANGE"],
    "dependency-hints": dependencyHints,
    "verification-plan": {
      checks: [
        {
          id: `VC-${id.slice(3)}`,
          method: "Run the declared verification check.",
          successCriteria: "The bounded deliverable satisfies its references.",
        },
      ],
    },
    "required-evidence": [
      {
        kind: "test-report",
        description: "A passing verification report.",
      },
    ],
    "source-refs": [sourceRef()],
  };
}

function inputBindings(contractEntry, additional = []) {
  return [
    { role: "requirements-baseline", artifact: requirementsEntry.ref },
    { role: "project-overview-baseline", artifact: overviewEntry.ref },
    { role: "architecture-baseline", artifact: architectureEntry.ref },
    { role: "contract-disposition", artifact: contractEntry.ref },
    ...additional,
  ].map((binding) => structuredClone(binding));
}

function draftEntry(contractEntry, { contractRef = true } = {}) {
  const prerequisite = workItem({
    id: "WI-AUTH-PREREQUISITE",
    acceptanceCriteria: ["AC-AUTH-DISCLOSURE-001"],
  });
  const delivery = workItem({
    id: "WI-AUTH-DELIVERY",
    acceptanceCriteria: ["AC-AUTH-001"],
    architecture: ["EL-AUTH-SERVICE"],
    contracts: contractRef ? ["CT-AUTH-HTTP"] : [],
    dependencyHints: [
      {
        "work-item-ref": prerequisite.id,
        relation: "after",
        rationale: "The prerequisite informs delivery ordering.",
        authority: "hint",
      },
    ],
  });
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownDraft",
    draftId: contractRef ? "WBD-AUTH-001" : "WBD-AUTH-NO-CONTRACTS",
    operation: "establish-breakdown",
    inputBindings: inputBindings(contractEntry),
    workItems: [delivery, prerequisite],
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-AUTH-001",
        disposition: "planned",
        workItemRefs: [delivery.id],
      },
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-AUTH-DISCLOSURE-001",
        disposition: "planned",
        workItemRefs: [prerequisite.id],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-AUTH-SERVICE",
        disposition: "planned",
        workItemRefs: [delivery.id],
      },
      ...(contractRef
        ? [
            {
              scopeKind: "contract",
              scopeRef: "CT-AUTH-HTTP",
              disposition: "planned",
              workItemRefs: [delivery.id],
            },
          ]
        : []),
    ],
    nativeArtifacts: [],
    sourceRefs: [sourceRef()],
  };
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft,
    value.draftId,
  );
}

function executionContext({
  operation = "establish-breakdown",
  contractEntry,
  candidateEntry,
  baselineEntry,
  outcome = "decomposed",
  status = "completed",
} = {}) {
  const outputPort =
    operation === "establish-breakdown"
      ? "work-breakdown-draft"
      : "work-breakdown-change-set-draft";
  const invocation = {
    invocationId: `invocation-${candidateEntry?.ref.artifactId ?? outcome}`,
    module: { id: "work-breakdown", version: "0.1.0", operation },
  };
  return {
    graphId: "graph-auth-work-breakdown",
    projectId: "auth-product",
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      invocationId: invocation.invocationId,
      status,
      outcome,
      outputs: candidateEntry ? { [outputPort]: [candidateEntry.ref] } : {},
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      "requirements-baseline": [requirementsEntry],
      "project-overview-baseline": [overviewEntry],
      "architecture-baseline": [architectureEntry],
      "contract-disposition": [contractEntry],
      ...(baselineEntry
        ? { "current-work-breakdown-baseline": [baselineEntry] }
        : {}),
    },
    loadedOutputs: candidateEntry
      ? { [outputPort]: [candidateEntry] }
      : {},
  };
}

function findNode(projected, stableId) {
  return projected.nodes.find((node) => node.stableId === stableId);
}

function findEdge(projected, kind, sourceId, targetId) {
  return projected.edges.find(
    (edge) =>
      edge.kind === kind &&
      edge.source.stableId === sourceId &&
      edge.target.stableId === targetId,
  );
}

test("WorkBreakdown projects only exact upstream-to-downstream planning facts", async () => {
  const contracts = contractDisposition();
  const candidate = draftEntry(contracts);
  const context = executionContext({
    contractEntry: contracts,
    candidateEntry: candidate,
  });

  assert.equal(workBreakdownTraceabilityContributor.match(context), true);
  assert.equal(workBreakdownTraceabilityContributor.authority, "candidate");
  assert.equal(
    workBreakdownTraceabilityContributor.scope,
    "work-breakdown/candidate",
  );
  const first = await workBreakdownTraceabilityContributor.project(context);
  const second = await workBreakdownTraceabilityContributor.project(context);
  assert.deepEqual(first, second);
  assert.equal(first.horizon, "implementation");
  assert.deepEqual(
    new Set(
      first.nodes
        .filter(({ kind }) => kind === "work-item")
        .map(({ stableId }) => stableId),
    ),
    new Set(["WI-AUTH-DELIVERY", "WI-AUTH-PREREQUISITE"]),
  );
  assert.deepEqual(
    first.edges.reduce((counts, edge) => {
      counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;
      return counts;
    }, {}),
    {
      "implementation-planned-by": 1,
      "planned-by": 2,
      "realization-planned-by": 1,
    },
  );
  assert.ok(
    findEdge(
      first,
      "planned-by",
      "AC-AUTH-001",
      "WI-AUTH-DELIVERY",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "implementation-planned-by",
      "EL-AUTH-SERVICE",
      "WI-AUTH-DELIVERY",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "realization-planned-by",
      "CT-AUTH-HTTP",
      "WI-AUTH-DELIVERY",
    ),
  );
  const forbidden = new Set([
    "depends-on",
    "implemented-by",
    "produces",
    "realized-by",
    "tested-by",
    "verified-by",
  ]);
  assert.equal(first.edges.some(({ kind }) => forbidden.has(kind)), false);
  assert.ok(
    findNode(first, "WI-AUTH-DELIVERY").attributes.workItem[
      "dependency-hints"
    ].length > 0,
  );
});

test("approved observers and candidate contribution validate and merge atomically", async () => {
  const contracts = contractDisposition();
  const candidate = draftEntry(contracts);
  const context = executionContext({
    contractEntry: contracts,
    candidateEntry: candidate,
  });
  const service = createTraceabilityGraphService({
    graphId: context.graphId,
    projectId: context.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureBaselineObserverContributor,
      contractDispositionObserverContributor,
      workBreakdownTraceabilityContributor,
    ],
  });
  const prepared = await service.prepare({
    ...context,
    baseGraph: service.captureBase(),
  });

  assert.equal(validateTraceabilityUpdate(prepared.update), prepared.update);
  assert.deepEqual(prepared.update.vocabulary, TRACEABILITY_VOCABULARY);
  assert.deepEqual(
    prepared.update.scopes.map(({ scope }) => scope),
    [
      "architecture/baseline",
      "contracts/baseline",
      "core/artifact-reference",
      "requirements/baseline",
      "work-breakdown/candidate",
    ],
  );
  const planningEdges = prepared.update.edgeChanges
    .map(({ edge }) => edge)
    .filter(({ scope }) => scope === "work-breakdown/candidate");
  assert.equal(planningEdges.length, 4);
  assert.ok(
    planningEdges.every(
      ({ authority, scope }) =>
        authority === "candidate" && scope === "work-breakdown/candidate",
    ),
  );
  const merged = await service.mergePrepared(prepared);
  assert.equal(merged.snapshot.vocabulary.version, "1.2.0");
  assert.equal(
    merged.snapshot.nodes.filter(
      ({ kind, authority, scope }) =>
        kind === "work-item" &&
        authority === "candidate" &&
        scope === "work-breakdown/candidate",
    ).length,
    2,
  );
  assert.equal(
    merged.snapshot.nodes.filter(
      ({ kind, authority, scope }) =>
        kind === "contract" &&
        authority === "approved" &&
        scope === "contracts/baseline",
    ).length,
    1,
  );
  assert.equal(
    merged.snapshot.edges.some(
      ({ sourceNodeId, targetNodeId }) =>
        merged.snapshot.nodes.find(({ nodeId }) => nodeId === sourceNodeId)
          ?.kind === "work-item" &&
        merged.snapshot.nodes.find(({ nodeId }) => nodeId === targetNodeId)
          ?.kind !== "work-item",
    ),
    false,
  );
  const path = queryTraceabilityGraph(merged.snapshot, {
    start: {
      kind: "acceptance-criterion",
      stableId: "AC-AUTH-001",
      authority: "approved",
      scope: "requirements/baseline",
    },
    direction: "outgoing",
    targetKinds: ["work-item"],
  });
  assert.equal(path.paths.length, 1);
  const target = path.nodes.find(
    ({ nodeId }) => nodeId === path.paths[0].targetNodeId,
  );
  assert.equal(target.stableId, "WI-AUTH-DELIVERY");
});

function baselineEntry(contractEntry) {
  const keep = workItem({
    id: "WI-KEEP",
    acceptanceCriteria: ["AC-AUTH-001"],
  });
  const update = workItem({
    id: "WI-UPDATE",
    architecture: ["EL-AUTH-SERVICE"],
  });
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownBaseline",
    baselineId: "WBB-AUTH-001",
    version: "1.0.0",
    approvedCandidate: {
      artifactId: "WBD-PRIOR",
      ...WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft,
      digest: `sha256:${"e".repeat(64)}`,
      uri: "memory://fixtures/WBD-PRIOR.json",
    },
    inputBindings: inputBindings(contractEntry),
    workItems: [keep, update],
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-AUTH-001",
        disposition: "planned",
        workItemRefs: [keep.id],
      },
      {
        scopeKind: "architecture",
        scopeRef: "EL-AUTH-SERVICE",
        disposition: "planned",
        workItemRefs: [update.id],
      },
    ],
    approvalEvidence: [
      {
        artifactId: "work-breakdown-gate-approval",
        schema: "https://example.test/artifacts/gate-approval/v1",
        mediaType: "application/json",
        digest: `sha256:${"f".repeat(64)}`,
        uri: "memory://fixtures/work-breakdown-gate-approval.json",
      },
    ],
    sourceRefs: [sourceRef()],
  };
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
    value.baselineId,
  );
}

function changeEntry(contractEntry, baseline) {
  const updated = workItem({
    id: "WI-UPDATE",
    objective: "Update the retained architecture work item.",
    architecture: ["EL-AUTH-SERVICE"],
  });
  const added = workItem({
    id: "WI-ADD",
    contracts: ["CT-AUTH-HTTP"],
  });
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownChangeSetDraft",
    changeSetId: "WBCS-AUTH-001",
    operation: "decompose-change",
    currentBaseline: structuredClone(baseline.ref),
    inputBindings: inputBindings(contractEntry, [
      {
        role: "current-work-breakdown-baseline",
        artifact: baseline.ref,
      },
    ]),
    changes: [
      {
        operation: "update",
        workItemId: "WI-UPDATE",
        priorItemDigest: canonicalJsonDigest(baseline.value.workItems[1]),
        workItem: updated,
      },
      { operation: "add", workItem: added },
    ],
    coverageDispositions: [
      {
        scopeKind: "architecture",
        scopeRef: "EL-AUTH-SERVICE",
        disposition: "planned",
        workItemRefs: [updated.id],
      },
      {
        scopeKind: "contract",
        scopeRef: "CT-AUTH-HTTP",
        disposition: "planned",
        workItemRefs: [added.id],
      },
    ],
    resultingWorkItemsDigest: `sha256:${"0".repeat(64)}`,
    nativeArtifacts: [],
    sourceRefs: [sourceRef()],
  };
  value.resultingWorkItemsDigest = applyWorkBreakdownChangeSet({
    baseline: baseline.value,
    baselineRef: baseline.ref,
    changeSet: value,
  }).workItemsDigest;
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownChangeSetDraft,
    value.changeSetId,
  );
}

function zeroDraftEntry(
  contractEntry,
  { draftId = "WBD-AUTH-ZERO" } = {},
) {
  const seeded = draftEntry(contractEntry, {
    contractRef: contractEntry.value.mode === "baseline",
  });
  const value = structuredClone(seeded.value);
  value.draftId = draftId;
  value.workItems = [];
  value.coverageDispositions = value.coverageDispositions.map(
    ({ scopeKind, scopeRef }) => ({
      scopeKind,
      scopeRef,
      disposition: "no-work-required",
      rationale: "The approved scope requires no implementation work.",
    }),
  );
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft,
    value.draftId,
  );
}

function emptyBaselineEntry(contractEntry) {
  const seeded = baselineEntry(contractEntry);
  const value = structuredClone(seeded.value);
  value.baselineId = "WBB-AUTH-EMPTY";
  value.workItems = [];
  value.coverageDispositions = [];
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
    value.baselineId,
  );
}

function changeSetEntry(
  contractEntry,
  baseline,
  { changeSetId, changes, coverageDispositions },
) {
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownChangeSetDraft",
    changeSetId,
    operation: "decompose-change",
    currentBaseline: structuredClone(baseline.ref),
    inputBindings: inputBindings(contractEntry, [
      {
        role: "current-work-breakdown-baseline",
        artifact: baseline.ref,
      },
    ]),
    changes: structuredClone(changes),
    coverageDispositions: structuredClone(coverageDispositions),
    resultingWorkItemsDigest: "sha256:" + "0".repeat(64),
    nativeArtifacts: [],
    sourceRefs: [sourceRef()],
  };
  value.resultingWorkItemsDigest = applyWorkBreakdownChangeSet({
    baseline: baseline.value,
    baselineRef: baseline.ref,
    changeSet: value,
  }).workItemsDigest;
  return loadedValue(
    value,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownChangeSetDraft,
    value.changeSetId,
  );
}

function unchangedChangeEntry(contractEntry, baseline) {
  return changeSetEntry(contractEntry, baseline, {
    changeSetId: "WBCS-AUTH-UNCHANGED",
    changes: [],
    coverageDispositions: baseline.value.coverageDispositions,
  });
}

function retireAllChangeEntry(contractEntry, baseline) {
  return changeSetEntry(contractEntry, baseline, {
    changeSetId: "WBCS-AUTH-RETIRE-ALL",
    changes: baseline.value.workItems.map((item) => ({
      operation: "retire",
      workItemId: item.id,
      priorItemDigest: canonicalJsonDigest(item),
      rationale: "The approved scope requires no remaining implementation work.",
    })),
    coverageDispositions: baseline.value.coverageDispositions.map(
      ({ scopeKind, scopeRef }) => ({
        scopeKind,
        scopeRef,
        disposition: "no-work-required",
        rationale: "The approved scope requires no remaining implementation work.",
      }),
    ),
  });
}

function coverageOnlyEmptyChangeEntry(contractEntry, baseline) {
  return changeSetEntry(contractEntry, baseline, {
    changeSetId: "WBCS-AUTH-COVERAGE-ONLY-EMPTY",
    changes: [],
    coverageDispositions: [
      {
        scopeKind: "acceptance-criterion",
        scopeRef: "AC-AUTH-001",
        disposition: "already-satisfied",
        rationale: "Current evidence already satisfies the approved criterion.",
        currentEvidence: [structuredClone(requirementsEntry.ref)],
      },
    ],
  });
}
test("change projection uses the deterministic applied full result and exact provenance", async () => {
  const contracts = contractDisposition();
  const baseline = baselineEntry(contracts);
  const candidate = changeEntry(contracts, baseline);
  const context = executionContext({
    operation: "decompose-change",
    contractEntry: contracts,
    candidateEntry: candidate,
    baselineEntry: baseline,
  });

  const projected = await workBreakdownTraceabilityContributor.project(context);
  assert.deepEqual(
    new Set(
      projected.nodes
        .filter(({ kind }) => kind === "work-item")
        .map(({ stableId }) => stableId),
    ),
    new Set(["WI-KEEP", "WI-UPDATE", "WI-ADD"]),
  );
  const keep = findNode(projected, "WI-KEEP");
  assert.ok(
    keep.sourceLocators.some(
      ({ artifact, jsonPointer }) =>
        artifact.artifactId === baseline.ref.artifactId &&
        jsonPointer === "/workItems/0",
    ),
  );
  assert.ok(
    keep.sourceLocators.some(
      ({ artifact, jsonPointer }) =>
        artifact.artifactId === candidate.ref.artifactId &&
        jsonPointer === "/resultingWorkItemsDigest",
    ),
  );
  const updated = findNode(projected, "WI-UPDATE");
  assert.ok(
    updated.sourceLocators.some(
      ({ artifact, jsonPointer }) =>
        artifact.artifactId === candidate.ref.artifactId &&
        jsonPointer === "/changes/0/workItem",
    ),
  );

  const tamperedValue = {
    ...structuredClone(candidate.value),
    resultingWorkItemsDigest: `sha256:${"9".repeat(64)}`,
  };
  const tampered = loadedValue(
    tamperedValue,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownChangeSetDraft,
    tamperedValue.changeSetId,
  );
  const tamperedContext = executionContext({
    operation: "decompose-change",
    contractEntry: contracts,
    candidateEntry: tampered,
    baselineEntry: baseline,
  });
  await assert.rejects(
    workBreakdownTraceabilityContributor.project(tamperedContext),
    /resultingWorkItemsDigest does not bind the applied result/u,
  );
});

test("zero-item establish is graph-accounted without inventing semantic work", async () => {
  const contracts = contractDisposition();
  const candidate = zeroDraftEntry(contracts);
  const context = executionContext({
    contractEntry: contracts,
    candidateEntry: candidate,
  });
  const service = createTraceabilityGraphService({
    graphId: context.graphId,
    projectId: context.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [workBreakdownTraceabilityContributor],
  });

  const prepared = await service.prepare({
    ...context,
    baseGraph: service.captureBase(),
  });
  const scope = prepared.update.scopes.find(
    ({ scope: value }) => value === "work-breakdown/candidate",
  );
  assert.equal(
    scope.reason,
    "projection contains only Core-owned artifact references",
  );
  assert.equal(
    prepared.update.nodeChanges.some(
      ({ node }) =>
        node.kind === "artifact-reference" &&
        node.attributes.artifact.artifactId === candidate.ref.artifactId,
    ),
    true,
  );

  const merged = await service.mergePrepared(prepared);
  assert.equal(
    merged.snapshot.nodes.some(
      ({ kind, scope: value, state }) =>
        kind === "work-item" &&
        value === "work-breakdown/candidate" &&
        state === "active",
    ),
    false,
  );
  assert.equal(
    merged.snapshot.edges.some(
      ({ scope: value, state }) =>
        value === "work-breakdown/candidate" && state === "active",
    ),
    false,
  );
});

test("zero-item coverage-only decompose is graph-accounted", async () => {
  const contracts = contractDisposition();
  const baseline = emptyBaselineEntry(contracts);
  const candidate = coverageOnlyEmptyChangeEntry(contracts, baseline);
  const context = executionContext({
    operation: "decompose-change",
    contractEntry: contracts,
    candidateEntry: candidate,
    baselineEntry: baseline,
  });
  const service = createTraceabilityGraphService({
    graphId: context.graphId,
    projectId: context.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [workBreakdownTraceabilityContributor],
  });

  const prepared = await service.prepare({
    ...context,
    baseGraph: service.captureBase(),
  });
  assert.equal(
    prepared.update.scopes.find(
      ({ scope }) => scope === "work-breakdown/candidate",
    ).reason,
    "projection contains only Core-owned artifact references",
  );
  const merged = await service.mergePrepared(prepared);
  assert.equal(
    merged.snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "work-item" &&
        scope === "work-breakdown/candidate" &&
        state === "active",
    ).length,
    0,
  );
});

test("nonempty to zero WorkBreakdown transition retires planned work facts", async () => {
  const contracts = contractDisposition();
  const baseline = baselineEntry(contracts);
  const initialCandidate = unchangedChangeEntry(contracts, baseline);
  const initialContext = executionContext({
    operation: "decompose-change",
    contractEntry: contracts,
    candidateEntry: initialCandidate,
    baselineEntry: baseline,
  });
  const service = createTraceabilityGraphService({
    graphId: initialContext.graphId,
    projectId: initialContext.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureBaselineObserverContributor,
      contractDispositionObserverContributor,
      workBreakdownTraceabilityContributor,
    ],
  });

  const initialPrepared = await service.prepare({
    ...initialContext,
    baseGraph: service.captureBase(),
  });
  const initialMerged = await service.mergePrepared(initialPrepared);
  assert.equal(
    initialMerged.snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "work-item" &&
        scope === "work-breakdown/candidate" &&
        state === "active",
    ).length,
    2,
  );
  assert.equal(
    initialMerged.snapshot.edges.filter(
      ({ scope, state }) =>
        scope === "work-breakdown/candidate" && state === "active",
    ).length,
    2,
  );

  const zeroCandidate = retireAllChangeEntry(contracts, baseline);
  const zeroContext = executionContext({
    operation: "decompose-change",
    contractEntry: contracts,
    candidateEntry: zeroCandidate,
    baselineEntry: baseline,
  });
  const zeroPrepared = await service.prepare({
    ...zeroContext,
    baseGraph: service.captureBase(),
  });
  assert.equal(
    zeroPrepared.update.nodeChanges.filter(
      ({ node }) =>
        node.kind === "work-item" &&
        node.scope === "work-breakdown/candidate" &&
        node.state === "retired",
    ).length,
    2,
  );
  assert.equal(
    zeroPrepared.update.edgeChanges.filter(
      ({ edge }) =>
        edge.scope === "work-breakdown/candidate" &&
        edge.state === "retired",
    ).length,
    2,
  );

  const zeroMerged = await service.mergePrepared(zeroPrepared);
  assert.equal(
    zeroMerged.snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "work-item" &&
        scope === "work-breakdown/candidate" &&
        state === "active",
    ).length,
    0,
  );
  assert.equal(
    zeroMerged.snapshot.edges.filter(
      ({ scope, state }) =>
        scope === "work-breakdown/candidate" && state === "active",
    ).length,
    0,
  );
});

test("contract baseline to not-applicable transition retires prior contract facts", async () => {
  const applicable = contractDisposition();
  const initialCandidate = draftEntry(applicable);
  const initialContext = executionContext({
    contractEntry: applicable,
    candidateEntry: initialCandidate,
  });
  const service = createTraceabilityGraphService({
    graphId: initialContext.graphId,
    projectId: initialContext.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [contractDispositionObserverContributor],
  });
  const initialPrepared = await service.prepare({
    ...initialContext,
    baseGraph: service.captureBase(),
  });
  await service.mergePrepared(initialPrepared);
  assert.equal(
    service.captureBase().snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "contract" &&
        scope === "contracts/baseline" &&
        state === "active",
    ).length,
    1,
  );

  const notApplicable = contractDisposition({ applicable: false });
  const nextCandidate = draftEntry(notApplicable, { contractRef: false });
  const nextContext = executionContext({
    contractEntry: notApplicable,
    candidateEntry: nextCandidate,
  });
  const nextPrepared = await service.prepare({
    ...nextContext,
    baseGraph: service.captureBase(),
  });
  assert.equal(
    nextPrepared.update.nodeChanges.filter(
      ({ node }) =>
        node.kind === "contract" &&
        node.scope === "contracts/baseline" &&
        node.state === "retired",
    ).length,
    1,
  );

  const nextMerged = await service.mergePrepared(nextPrepared);
  assert.equal(
    nextMerged.snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "contract" &&
        scope === "contracts/baseline" &&
        state === "active",
    ).length,
    0,
  );
  assert.equal(
    nextMerged.snapshot.nodes.filter(
      ({ kind, scope, state }) =>
        kind === "contract" &&
        scope === "contracts/baseline" &&
        state === "retired",
    ).length,
    1,
  );
});
test("not-applicable contracts project no contract facts and cannot satisfy a contract ref", async () => {
  const contracts = contractDisposition({ applicable: false });
  const legalCandidate = draftEntry(contracts, { contractRef: false });
  const legalContext = executionContext({
    contractEntry: contracts,
    candidateEntry: legalCandidate,
  });
  const projectedDisposition =
    await contractDispositionObserverContributor.project(legalContext);
  assert.equal(projectedDisposition.horizon, "contracts");
  assert.deepEqual(projectedDisposition.edges, []);
  assert.equal("reason" in projectedDisposition, false);
  assert.equal(projectedDisposition.nodes.length, 1);
  assert.equal(projectedDisposition.nodes[0].kind, "artifact-reference");
  assert.deepEqual(
    projectedDisposition.nodes[0].attributes.artifact,
    contracts.ref,
  );

  const illegalCandidate = draftEntry(contracts, { contractRef: true });
  const illegalContext = executionContext({
    contractEntry: contracts,
    candidateEntry: illegalCandidate,
  });
  const service = createTraceabilityGraphService({
    graphId: illegalContext.graphId,
    projectId: illegalContext.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureBaselineObserverContributor,
      contractDispositionObserverContributor,
      workBreakdownTraceabilityContributor,
    ],
  });
  await assert.rejects(
    service.prepare({
      ...illegalContext,
      baseGraph: service.captureBase(),
    }),
    (error) => error.code === "TG_DANGLING_EDGE",
  );
});

test("observers never project on guard-terminal paths and control accounting remains explicit", async () => {
  const contracts = contractDisposition();
  const context = executionContext({
    contractEntry: contracts,
    outcome: "baseline_drift",
  });
  assert.equal(requirementsBaselineObserverContributor.match(context), false);
  assert.equal(architectureBaselineObserverContributor.match(context), false);
  assert.equal(contractDispositionObserverContributor.match(context), false);
  assert.equal(workBreakdownTraceabilityContributor.match(context), false);
  assert.equal(workBreakdownControlTraceabilityContributor.match(context), true);
  assert.deepEqual(
    await workBreakdownControlTraceabilityContributor.project(context),
    {
      horizon: "implementation",
      nodes: [],
      edges: [],
      reason:
        "WorkBreakdown outcome baseline_drift has no canonical work candidate to project.",
    },
  );
  assert.deepEqual(workBreakdownTraceabilityContributors, [
    contractDispositionObserverContributor,
    workBreakdownTraceabilityContributor,
    workBreakdownControlTraceabilityContributor,
  ]);
});
