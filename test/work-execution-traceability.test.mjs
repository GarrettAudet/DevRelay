import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_VOCABULARY,
  TRACEABILITY_VOCABULARY_V1_5,
  TRACEABILITY_VOCABULARY_V1_6,
} from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";
import { workExecutionTraceabilityContributor } from "../src/work-execution-traceability-contributor.mjs";

const API = "devrelay.dev/v1alpha1";
const D = `sha256:${"a".repeat(64)}`;
const ref = (
  artifactId,
  digest = D,
  schema = "https://devrelay.dev/test/v1",
  mediaType = "application/json",
) => ({ artifactId, schema, mediaType, digest, uri: `memory://${artifactId}` });
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const listSeal = (value, field, material) => ({
  ...value,
  [field]: canonicalJsonDigest(material),
});

function loaded(value, artifactId, schema, mediaType) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: ref(artifactId, sha256Digest(bytes), schema, mediaType),
  };
}

function fixture() {
  const workItem = loaded(
    { id: "WI-REL-WORK-EXECUTION-RUNTIME", objective: "Implement the runtime." },
    "WI-REL-WORK-EXECUTION-RUNTIME",
    "https://devrelay.dev/contracts/work-breakdown-artifacts.schema.json#/$defs/workItemDraft",
    "application/vnd.devrelay.work-item-draft+json",
  );
  const attempt = seal(
    {
      apiVersion: API,
      kind: "ExecutionAttempt",
      attemptId: "ATT-REL-WE-RUNTIME-001",
      workItemId: workItem.value.id,
      invocationFingerprint: D,
      bindingDigest: D,
      result: ref("RAW-ATT-REL-WE-RUNTIME-001"),
      status: "proposed",
    },
    "attemptDigest",
  );
  const attemptLoaded = loaded(
    attempt,
    attempt.attemptId,
    "https://devrelay.dev/artifacts/execution-attempt/v1",
    "application/vnd.devrelay.execution-attempt+json",
  );
  const change = listSeal(
    {
      apiVersion: API,
      kind: "ChangeSetDraft",
      attemptId: attempt.attemptId,
      mutations: [
        {
          operation: "create",
          path: "src/work-execution-runtime.mjs",
          beforeDigest: null,
          afterDigest: D,
        },
      ],
    },
    "changeDigest",
    [
      {
        operation: "create",
        path: "src/work-execution-runtime.mjs",
        beforeDigest: null,
        afterDigest: D,
      },
    ],
  );
  const changeLoaded = loaded(
    change,
    "CS-ATT-REL-WE-RUNTIME-001",
    "https://devrelay.dev/artifacts/change-set-draft/v1",
    "application/vnd.devrelay.change-set-draft+json",
  );
  const evidence = listSeal(
    {
      apiVersion: API,
      kind: "ExecutionEvidenceBundle",
      attemptId: attempt.attemptId,
      evidence: [ref("EV-RUNTIME")],
    },
    "evidenceDigest",
    [ref("EV-RUNTIME")],
  );
  const evidenceLoaded = loaded(
    evidence,
    "EEB-ATT-REL-WE-RUNTIME-001",
    "https://devrelay.dev/artifacts/execution-evidence-bundle/v1",
    "application/vnd.devrelay.execution-evidence-bundle+json",
  );
  const trace = seal(
    {
      apiVersion: API,
      kind: "ExecutionTraceabilityCandidate",
      attempt: { artifactId: attempt.attemptId, digest: attempt.attemptDigest },
      workItemId: workItem.value.id,
      authority: "candidate",
      scope: "work-execution/attempt",
    },
    "traceabilityDigest",
  );
  const traceLoaded = loaded(trace, "TRACE-WE-RUNTIME");
  const result = {
    apiVersion: API,
    kind: "ModuleResult",
    invocationId: "WE-REL-RUNTIME-001",
    status: "completed",
    outcome: "proposed",
    outputs: {
      "execution-attempt": [attemptLoaded.ref],
      "change-set-draft": [changeLoaded.ref],
      "execution-evidence-bundle": [evidenceLoaded.ref],
    },
    evidence: [
      {
        kind: "work-execution/raw-evidence",
        subject: attempt.attemptId,
        status: "pass",
        artifact: evidenceLoaded.ref,
      },
    ],
    diagnostics: [],
  };
  const resultLoaded = loaded(result, "RESULT-WE-RUNTIME");
  const context = {
    invocation: {
      apiVersion: API,
      kind: "ModuleInvocation",
      invocationId: result.invocationId,
      module: {
        id: "work-execution",
        version: "0.1.0",
        operation: "execute-work-item",
      },
      inputs: { "work-item": [workItem.ref] },
      options: {},
    },
    invocationFingerprint: D,
    moduleResult: result,
    loadedInputs: { "work-item": [workItem] },
    loadedOutputs: {
      "execution-attempt": [attemptLoaded],
      "change-set-draft": [changeLoaded],
      "execution-evidence-bundle": [evidenceLoaded],
    },
    loadedAttachments: { result: resultLoaded, trace: traceLoaded },
  };
  return { context, workItem, attemptLoaded, changeLoaded, traceLoaded };
}

function seedContributor(sourceLocator) {
  return {
    metadata: { id: "fixture.work-breakdown", version: "1.0.0" },
    authority: "candidate",
    scope: "work-breakdown/candidate",
    ownership: {
      authority: "candidate",
      scope: "work-breakdown/candidate",
      nodeKinds: ["work-item"],
      edgeKinds: [],
    },
    match: () => true,
    async project() {
      return {
        horizon: "implementation",
        nodes: [
          {
            kind: "work-item",
            stableId: "WI-REL-WORK-EXECUTION-RUNTIME",
            label: "WorkExecution runtime",
            attributes: {},
            sourceLocators: [sourceLocator],
          },
        ],
        edges: [],
      };
    },
  };
}

test("v1.6 projects and atomically merges only forward planned-to-factual execution edges", async () => {
  const { context, workItem } = fixture();
  const projection = await workExecutionTraceabilityContributor.project(context);
  assert.equal(TRACEABILITY_VOCABULARY.version, "1.5.0");
  assert.equal(TRACEABILITY_VOCABULARY_V1_5.version, "1.5.0");
  assert.equal(TRACEABILITY_VOCABULARY_V1_6.version, "1.6.0");
  assert.deepEqual(
    projection.nodes.map(({ kind }) => kind).sort(),
    ["change-set", "execution-attempt"],
  );
  assert.deepEqual(
    projection.edges.map(({ kind }) => kind).sort(),
    ["attempted-by", "produces"],
  );
  assert.equal(
    projection.edges.some(({ kind }) =>
      ["implemented-by", "integrated-as", "verified-by"].includes(kind),
    ),
    false,
  );
  const sourceLocator = {
    artifact: {
      artifactId: workItem.ref.artifactId,
      digest: workItem.ref.digest,
    },
    jsonPointer: "",
    entityDigest: canonicalJsonDigest(workItem.value),
  };
  const store = createInMemoryTraceabilityStore();
  const service = createTraceabilityGraphService({
    graphId: "we-trace",
    projectId: "devrelay",
    store,
    contributors: [seedContributor(sourceLocator), workExecutionTraceabilityContributor],
    vocabulary: TRACEABILITY_VOCABULARY_V1_6,
  });
  const base = service.captureBase();
  const prepared = await service.prepare({ ...context, baseGraph: base });
  const first = await service.mergePrepared(prepared);
  const replay = await service.mergePrepared(prepared);
  assert.equal(first.receipt.disposition, "merged");
  assert.equal(first.snapshot.revision, 1);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.snapshot, first.snapshot);
});

test("substituted outputs, adapter graph claims, extra result ports, and inverse edges fail closed", async () => {
  const substituted = fixture();
  substituted.context.loadedOutputs["change-set-draft"][0].value.attemptId = "ATT-SUBSTITUTED";
  await assert.rejects(
    workExecutionTraceabilityContributor.project(substituted.context),
    /canonical loaded value|identities/,
  );

  const graphClaim = fixture();
  graphClaim.context.loadedAttachments.trace.value.graphOperations = [
    { kind: "implemented-by" },
  ];
  await assert.rejects(
    workExecutionTraceabilityContributor.project(graphClaim.context),
    /canonical loaded value|invalid/,
  );

  const extra = fixture();
  extra.context.moduleResult = {
    ...extra.context.moduleResult,
    outputs: {
      ...extra.context.moduleResult.outputs,
      untrusted: [ref("UNTRUSTED")],
    },
  };
  extra.context.loadedAttachments.result = loaded(
    extra.context.moduleResult,
    "RESULT-WE-RUNTIME-EXTRA",
  );
  await assert.rejects(
    workExecutionTraceabilityContributor.project(extra.context),
    /extra output ports/,
  );

  const { context, workItem } = fixture();
  const projection = await workExecutionTraceabilityContributor.project(context);
  const sourceLocator = {
    artifact: { artifactId: workItem.ref.artifactId, digest: workItem.ref.digest },
    jsonPointer: "",
    entityDigest: canonicalJsonDigest(workItem.value),
  };
  const inverse = {
    ...workExecutionTraceabilityContributor,
    metadata: { id: "fixture.inverse-work-execution", version: "1.0.0" },
    project: async () => ({
      horizon: "implementation",
      nodes: projection.nodes,
      edges: projection.edges.map((edge) =>
        edge.kind === "attempted-by"
          ? { ...edge, source: edge.target, target: edge.source }
          : edge,
      ),
    }),
  };
  const service = createTraceabilityGraphService({
    graphId: "we-inverse",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [seedContributor(sourceLocator), inverse],
    vocabulary: TRACEABILITY_VOCABULARY_V1_6,
  });
  await assert.rejects(
    service.prepare({ ...context, baseGraph: service.captureBase() }),
    /invalid execution-attempt -> work-item endpoints/,
  );
});
