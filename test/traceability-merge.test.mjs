import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_EDGE_KINDS,
  TRACEABILITY_NODE_KINDS,
} from "../src/traceability-artifact-validator.mjs";
import {
  TraceabilityConflictError,
  TraceabilityGraphError,
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

function loadedArtifact(id, value) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    ref: {
      artifactId: id,
      schema: `https://example.test/artifacts/${id}/v1`,
      mediaType: "application/json",
      digest: sha256Digest(bytes),
      uri: `memory://fixtures/${id}.json`,
    },
    bytes,
    value,
  };
}

function execution(id, output, outcome = "completed", status = "completed") {
  const invocation = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: `invocation-${id}`,
    runId: `run-${id}`,
    nodeId: `node-${id}`,
    module: { id: id, version: "1.0.0", operation: "project" },
    inputs: {},
    options: {},
  };
  const moduleResult = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId: invocation.invocationId,
    status,
    outcome,
    outputs: output ? { primary: [output.ref] } : {},
    evidence: [],
    diagnostics: [],
  };
  return {
    invocation,
    invocationFingerprint: canonicalJsonDigest({ id, invocation }),
    moduleResult,
    loadedInputs: {},
    loadedOutputs: output ? { primary: [output] } : {},
  };
}

const TEST_NODE_KINDS = TRACEABILITY_NODE_KINDS.filter((kind) => kind !== "artifact-reference");
const TEST_EDGE_KINDS = [...TRACEABILITY_EDGE_KINDS];

function contributor({
  moduleId,
  scope,
  authority = "candidate",
  horizon = "requirements",
  projection,
  reason,
}) {
  return {
    metadata: { id: `test.${scope.replaceAll("/", ".")}`, version: "1.0.0" },
    match: { moduleId },
    scope,
    authority,
    ownership: {
      scope,
      authority,
      nodeKinds: TEST_NODE_KINDS,
      edgeKinds: TEST_EDGE_KINDS,
    },
    async project(context) {
      const projected = projection ? await projection(context) : { nodes: [], edges: [] };
      const loaded = context.loadedOutputs.primary?.[0];
      const sourceLocators = loaded
        ? [
            {
              artifact: {
                artifactId: loaded.ref.artifactId,
                digest: loaded.ref.digest,
              },
              jsonPointer: "",
              entityDigest: canonicalJsonDigest(loaded.value),
            },
          ]
        : [];
      return {
        horizon,
        nodes: projected.nodes.map((node) => ({
          ...node,
          sourceLocators: node.sourceLocators ?? sourceLocators,
        })),
        edges: projected.edges.map((edge) => ({
          ...edge,
          sourceLocators: edge.sourceLocators ?? sourceLocators,
        })),
        ...(reason === undefined ? {} : { reason }),
      };
    },
  };
}

function requirementsProjection(suffix = "ONE", label = "Objective") {
  return {
    nodes: [
      { kind: "project", stableId: "project", label: "Project" },
      { kind: "business-objective", stableId: `BO-${suffix}`, label },
      { kind: "capability", stableId: `CAP-${suffix}`, label: `Capability ${suffix}` },
      { kind: "user-story", stableId: `US-${suffix}`, label: `Story ${suffix}` },
      { kind: "acceptance-criterion", stableId: `AC-${suffix}`, label: `Criterion ${suffix}` },
    ],
    edges: [
      {
        kind: "defines",
        source: { kind: "project", stableId: "project" },
        target: { kind: "business-objective", stableId: `BO-${suffix}` },
        rationale: "Project defines objective.",
      },
      {
        kind: "realized-by",
        source: { kind: "business-objective", stableId: `BO-${suffix}` },
        target: { kind: "capability", stableId: `CAP-${suffix}` },
        rationale: "Objective is realized by capability.",
      },
      {
        kind: "specified-by",
        source: { kind: "capability", stableId: `CAP-${suffix}` },
        target: { kind: "user-story", stableId: `US-${suffix}` },
        rationale: "Capability is specified by story.",
      },
      {
        kind: "accepted-by",
        source: { kind: "user-story", stableId: `US-${suffix}` },
        target: { kind: "acceptance-criterion", stableId: `AC-${suffix}` },
        rationale: "Story is accepted by criterion.",
      },
    ],
  };
}

async function prepare(service, baseGraph, run) {
  return service.prepare({ baseGraph, ...run });
}

test("prepare, checkpoint reprojection, atomic merge, retry, and applied proof are exact", async () => {
  const output = loadedArtifact("requirements-candidate", { kind: "Candidate" });
  const run = execution("requirements", output);
  const service = createTraceabilityGraphService({
    graphId: "merge-graph",
    projectId: "merge-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "requirements",
        scope: "requirements/candidate",
        projection: () => requirementsProjection(),
      }),
    ],
  });
  const base = service.captureBase();
  const first = await prepare(service, base, run);
  assert.deepEqual(Object.keys(first.checkpoint).sort(), [
    "baseGraphRef",
    "update",
    "updateRef",
  ]);
  assert.equal(Object.isFrozen(first), true);

  const replay = await service.validatePrepared({
    checkpoint: structuredClone(first.checkpoint),
    ...run,
  });
  assert.equal(replay.updateRef.digest, first.updateRef.digest);
  const merged = await service.mergePrepared(replay);
  assert.equal(merged.disposition, "merged");
  assert.equal(merged.snapshot.revision, 1);
  assert.equal(merged.snapshot.nodes.length, 5);
  assert.equal(merged.snapshot.edges.length, 4);

  const retried = await service.mergePrepared(replay);
  assert.equal(retried.receiptRef.digest, merged.receiptRef.digest);
  assert.equal(service.captureBase().revision, 1);
  const proof = service.assertApplied(first.updateRef);
  assert.deepEqual(Object.keys(proof).sort(), [
    "receipt",
    "receiptRef",
    "resultGraphRef",
    "updateRef",
  ]);
  assert.equal(proof.resultGraphRef.digest, merged.snapshotRef.digest);
});

test("prepare rejects dangling and incompatible full-graph edge endpoints", async () => {
  const danglingOutput = loadedArtifact("dangling-edge", { kind: "Candidate" });
  const danglingRun = execution("dangling-edge", danglingOutput);
  const dangling = createTraceabilityGraphService({
    graphId: "dangling-graph",
    projectId: "dangling-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "dangling-edge",
        scope: "dangling/candidate",
        projection: () => ({
          nodes: [],
          edges: [
            {
              kind: "depends-on",
              sourceNodeId: `sha256:${"a".repeat(64)}`,
              targetNodeId: `sha256:${"b".repeat(64)}`,
              rationale: "This edge must never survive preparation.",
            },
          ],
        }),
      }),
    ],
  });
  await assert.rejects(
    prepare(dangling, dangling.captureBase(), danglingRun),
    (error) => error.code === "TG_DANGLING_EDGE",
  );

  const seedOutput = loadedArtifact("edge-seed", { kind: "Candidate" });
  const invalidOutput = loadedArtifact("invalid-edge", { kind: "Candidate" });
  const seeded = createTraceabilityGraphService({
    graphId: "endpoint-type-graph",
    projectId: "endpoint-type-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "edge-seed",
        scope: "requirements/candidate",
        projection: () => requirementsProjection(),
      }),
      contributor({
        moduleId: "invalid-edge",
        scope: "invalid-edge/candidate",
        projection: () => ({
          nodes: [],
          edges: [
            {
              kind: "source-endpoint",
              source: {
                kind: "business-objective",
                stableId: "BO-ONE",
                authority: "candidate",
                scope: "requirements/candidate",
              },
              target: {
                kind: "capability",
                stableId: "CAP-ONE",
                authority: "candidate",
                scope: "requirements/candidate",
              },
              rationale: "Business objectives and capabilities are invalid source-endpoint kinds.",
            },
          ],
        }),
      }),
    ],
  });
  const seedRun = execution("edge-seed", seedOutput);
  await seeded.mergePrepared(await prepare(seeded, seeded.captureBase(), seedRun));
  const invalidRun = execution("invalid-edge", invalidOutput);
  await assert.rejects(
    prepare(seeded, seeded.captureBase(), invalidRun),
    (error) => error.code === "TG_INVALID_EDGE_ENDPOINTS",
  );
});

test("requirements-internal edges cannot cross authority or ownership scope", async () => {
  const seedOutput = loadedArtifact("authority-seed", { kind: "Candidate" });
  const linkOutput = loadedArtifact("candidate-requirements-link", { kind: "Candidate" });
  const service = createTraceabilityGraphService({
    graphId: "requirements-authority-graph",
    projectId: "requirements-authority-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "authority-seed",
        scope: "requirements/approved",
        authority: "approved",
        projection: () => requirementsProjection(),
      }),
      contributor({
        moduleId: "candidate-requirements-link",
        scope: "requirements/candidate-link",
        authority: "candidate",
        projection: () => ({
          nodes: [],
          edges: [
            {
              kind: "realized-by",
              source: {
                kind: "business-objective",
                stableId: "BO-ONE",
                authority: "approved",
                scope: "requirements/approved",
              },
              target: {
                kind: "capability",
                stableId: "CAP-ONE",
                authority: "approved",
                scope: "requirements/approved",
              },
              rationale: "A candidate assertion cannot bind approved requirements.",
            },
          ],
        }),
      }),
    ],
  });
  const seedRun = execution("authority-seed", seedOutput);
  await service.mergePrepared(await prepare(service, service.captureBase(), seedRun));
  const linkRun = execution("candidate-requirements-link", linkOutput);
  await assert.rejects(
    prepare(service, service.captureBase(), linkRun),
    (error) => error.code === "TG_INVALID_EDGE_AUTHORITY",
  );
});

test("serialized checkpoint tampering and fabricated prepared values fail closed", async () => {
  const output = loadedArtifact("candidate-tamper", { kind: "Candidate" });
  const run = execution("tamper", output);
  const service = createTraceabilityGraphService({
    graphId: "tamper-graph",
    projectId: "tamper-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "tamper",
        scope: "requirements/candidate",
        projection: () => requirementsProjection(),
      }),
    ],
  });
  const prepared = await prepare(service, service.captureBase(), run);
  const checkpoint = structuredClone(prepared.checkpoint);
  checkpoint.update.scopes[0].scope = "tampered/scope";
  await assert.rejects(
    service.validatePrepared({ checkpoint, ...run }),
    (error) => error.code === "TG_PREPARED_CHECKPOINT_MISMATCH",
  );
  await assert.rejects(
    service.mergePrepared({
      baseGraphRef: prepared.baseGraphRef,
      updateRef: prepared.updateRef,
      update: prepared.update,
    }),
    (error) => error.code === "TG_UNVERIFIED_PREPARED_UPDATE",
  );
});

test("missing contributor fails for every artifact output while output-empty fallback is a no-op", async () => {
  const output = loadedArtifact("clarification", { kind: "Clarification" });
  const run = execution("clarification", output, "needs_clarification");
  const missing = createTraceabilityGraphService({
    graphId: "missing-graph",
    projectId: "missing-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [],
  });
  await assert.rejects(
    prepare(missing, missing.captureBase(), run),
    (error) => error.code === "TG_MISSING_CONTRIBUTOR",
  );
  const failedWithOutput = execution("failed-output", output, "failed", "failed");
  await assert.rejects(
    prepare(missing, missing.captureBase(), failedWithOutput),
    (error) => error.code === "TG_MISSING_CONTRIBUTOR",
  );

  const evidenceOnlyRun = execution("evidence-only", undefined, "verified");
  evidenceOnlyRun.moduleResult.evidence = [
    {
      kind: "test",
      subject: "AC-1",
      status: "pass",
      summary: "Passing evidence requires a traceability contributor.",
    },
  ];
  await assert.rejects(
    prepare(missing, missing.captureBase(), evidenceOnlyRun),
    (error) => error.code === "TG_MISSING_CONTRIBUTOR",
  );

  const noOutputRun = execution("accounting-only", undefined, "failed", "failed");
  const noOutputPrepared = await prepare(
    missing,
    missing.captureBase(),
    noOutputRun,
  );
  assert.equal(noOutputPrepared.update.nodeChanges.length, 0);
  assert.equal(noOutputPrepared.update.edgeChanges.length, 0);
  assert.deepEqual(noOutputPrepared.update.scopes[0].nodeIds, []);
  assert.deepEqual(noOutputPrepared.update.scopes[0].edgeIds, []);
  assert.equal(noOutputPrepared.update.scopes[0].scope, "core/non-contributing");
  assert.equal(
    noOutputPrepared.update.scopes[0].contributor.contractDigest,
    canonicalJsonDigest({
      id: "devrelay.traceability/non-contributing",
      version: "1.0.0",
      ownership: {
        scope: "core/non-contributing",
        authority: "candidate",
        nodeKinds: [],
        edgeKinds: [],
      },
    }),
  );
  const noOutputMerged = await missing.mergePrepared(noOutputPrepared);
  assert.equal(noOutputMerged.snapshot.revision, 1);

  const explicit = createTraceabilityGraphService({
    graphId: "empty-graph",
    projectId: "empty-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "clarification",
        scope: "requirements/clarification",
        reason: "Clarification has no semantic graph facts.",
      }),
    ],
  });
  const emptyPrepared = await prepare(explicit, explicit.captureBase(), run);
  assert.equal(emptyPrepared.update.nodeChanges.length, 0);
  assert.equal(emptyPrepared.update.edgeChanges.length, 0);
  const merged = await explicit.mergePrepared(emptyPrepared);
  assert.equal(merged.disposition, "no-op");
  assert.equal(merged.snapshot.revision, 1);
});

test("empty accounting projection never retires an existing semantic scope", async () => {
  const firstOutput = loadedArtifact("semantic", { kind: "Semantic" });
  const firstRun = execution("semantic", firstOutput);
  const emptyOutput = loadedArtifact("semantic-control", { kind: "Control" });
  const emptyRun = execution("control", emptyOutput, "needs_clarification");
  const service = createTraceabilityGraphService({
    graphId: "empty-retirement-graph",
    projectId: "empty-retirement-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "semantic",
        scope: "requirements/candidate",
        projection: () => requirementsProjection(),
      }),
      contributor({
        moduleId: "control",
        scope: "requirements/candidate",
        reason: "Control outcome has no semantic changes.",
      }),
    ],
  });
  await service.mergePrepared(await prepare(service, service.captureBase(), firstRun));
  const before = service.captureBase();
  const emptyPrepared = await prepare(service, before, emptyRun);
  assert.equal(emptyPrepared.update.nodeChanges.length, 0);
  assert.equal(emptyPrepared.update.edgeChanges.length, 0);
  await service.mergePrepared(emptyPrepared);
  assert.equal(service.captureBase().snapshot.nodes.filter(({ state }) => state === "active").length, 5);
});

test("complete desired scope retires omitted assertions without physical deletion", async () => {
  const outputA = loadedArtifact("scope-a", { revision: 1 });
  const outputB = loadedArtifact("scope-b", { revision: 2 });
  const projectionByInvocation = (context) =>
    context.invocation.invocationId.endsWith("scope-first")
      ? requirementsProjection()
      : {
          nodes: [
            { kind: "project", stableId: "project", label: "Project" },
            { kind: "business-objective", stableId: "BO-ONE", label: "Objective" },
          ],
          edges: [
            {
              kind: "defines",
              source: { kind: "project", stableId: "project" },
              target: { kind: "business-objective", stableId: "BO-ONE" },
              rationale: "Project defines objective.",
            },
          ],
        };
  const service = createTraceabilityGraphService({
    graphId: "retirement-graph",
    projectId: "retirement-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "scope-first",
        scope: "requirements/candidate",
        projection: projectionByInvocation,
      }),
      contributor({
        moduleId: "scope-second",
        scope: "requirements/candidate",
        projection: projectionByInvocation,
      }),
    ],
  });
  await service.mergePrepared(
    await prepare(service, service.captureBase(), execution("scope-first", outputA)),
  );
  const second = await prepare(
    service,
    service.captureBase(),
    execution("scope-second", outputB),
  );
  assert.ok(second.update.nodeChanges.some(({ node }) => node.state === "retired"));
  await service.mergePrepared(second);
  const snapshot = service.captureBase().snapshot;
  assert.equal(snapshot.nodes.length, 5);
  assert.equal(snapshot.nodes.filter(({ state }) => state === "retired").length, 3);
});

test("stale disjoint updates rebase and overlapping stale updates conflict", async () => {
  const service = createTraceabilityGraphService({
    graphId: "concurrency-graph",
    projectId: "concurrency-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "left",
        scope: "left/candidate",
        projection: () => ({
          nodes: [{ kind: "business-objective", stableId: "BO-LEFT", label: "Left" }],
          edges: [],
        }),
      }),
      contributor({
        moduleId: "right",
        scope: "right/candidate",
        projection: () => ({
          nodes: [{ kind: "business-objective", stableId: "BO-RIGHT", label: "Right" }],
          edges: [],
        }),
      }),
      contributor({
        moduleId: "overlap-a",
        scope: "overlap/candidate",
        projection: () => ({
          nodes: [{ kind: "business-objective", stableId: "BO-SAME", label: "A" }],
          edges: [],
        }),
      }),
      contributor({
        moduleId: "overlap-b",
        scope: "overlap/candidate",
        projection: () => ({
          nodes: [{ kind: "business-objective", stableId: "BO-SAME", label: "B" }],
          edges: [],
        }),
      }),
    ],
  });
  const base = service.captureBase();
  const left = await prepare(service, base, execution("left", loadedArtifact("left", {})));
  const right = await prepare(service, base, execution("right", loadedArtifact("right", {})));
  await service.mergePrepared(left);
  const rebased = await service.mergePrepared(right);
  assert.equal(rebased.disposition, "rebased");

  const overlapBase = service.captureBase();
  const overlapA = await prepare(
    service,
    overlapBase,
    execution("overlap-a", loadedArtifact("overlap-a", {})),
  );
  const overlapB = await prepare(
    service,
    overlapBase,
    execution("overlap-b", loadedArtifact("overlap-b", {})),
  );
  await service.mergePrepared(overlapA);
  await assert.rejects(
    service.mergePrepared(overlapB),
    TraceabilityConflictError,
  );
});

test("candidate and approved logical observations coexist and later candidate revision cannot replace approved", async () => {
  const candidateProjection = (label) => ({
    nodes: [{ kind: "user-story", stableId: "US-SHARED", label }],
    edges: [],
  });
  const service = createTraceabilityGraphService({
    graphId: "observation-graph",
    projectId: "observation-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "candidate-a",
        scope: "requirements/candidate",
        authority: "candidate",
        projection: () => candidateProjection("Candidate one"),
      }),
      contributor({
        moduleId: "approved",
        scope: "requirements/baseline",
        authority: "approved",
        projection: () => candidateProjection("Approved"),
      }),
      contributor({
        moduleId: "candidate-b",
        scope: "requirements/candidate",
        authority: "candidate",
        projection: () => candidateProjection("Candidate two"),
      }),
    ],
  });
  for (const id of ["candidate-a", "approved", "candidate-b"]) {
    const prepared = await prepare(
      service,
      service.captureBase(),
      execution(id, loadedArtifact(id, {})),
    );
    await service.mergePrepared(prepared);
  }
  const observations = service.captureBase().snapshot.nodes.filter(
    ({ kind, stableId }) => kind === "user-story" && stableId === "US-SHARED",
  );
  assert.equal(observations.length, 2);
  assert.deepEqual(
    observations.map(({ authority, label }) => [authority, label]).sort(),
    [
      ["approved", "Approved"],
      ["candidate", "Candidate two"],
    ],
  );
});

test("duplicate exact artifact references from contributors coalesce and loaded bytes override fabricated values", async () => {
  const artifact = loadedArtifact("shared-artifact", { truth: true });
  const run = execution("artifact-module", artifact);
  const artifactAssertion = {
    kind: "artifact-reference",
    label: artifact.ref.artifactId,
    attributes: { artifact: artifact.ref },
  };
  const service = createTraceabilityGraphService({
    graphId: "artifact-graph",
    projectId: "artifact-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "artifact-module",
        scope: "one/candidate",
        projection: () => ({ nodes: [artifactAssertion], edges: [] }),
      }),
      contributor({
        moduleId: "artifact-module",
        scope: "two/candidate",
        projection: () => ({ nodes: [artifactAssertion], edges: [] }),
      }),
    ],
  });
  await service.mergePrepared(await prepare(service, service.captureBase(), run));
  assert.equal(
    service.captureBase().snapshot.nodes.filter(({ kind }) => kind === "artifact-reference").length,
    1,
  );

  const exposedOnly = {
    ...run,
    loadedOutputs: { primary: [{ ref: artifact.ref, value: { truth: false } }] },
    resolveArtifact: async () => artifact,
  };
  await assert.rejects(
    service.prepare({ baseGraph: service.captureBase(), ...exposedOnly }),
    (error) => error.code === "TG_SOURCE_VALUE_MISMATCH",
  );
});

test("assertApplied rejects same digest with altered ArtifactRef metadata", async () => {
  const output = loadedArtifact("metadata", {});
  const run = execution("metadata", output);
  const service = createTraceabilityGraphService({
    graphId: "metadata-graph",
    projectId: "metadata-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      contributor({
        moduleId: "metadata",
        scope: "metadata/candidate",
        projection: () => ({
          nodes: [{ kind: "business-objective", stableId: "BO-META", label: "Meta" }],
          edges: [],
        }),
      }),
    ],
  });
  const prepared = await prepare(service, service.captureBase(), run);
  await service.mergePrepared(prepared);
  const altered = { ...prepared.updateRef, artifactId: "different-id" };
  assert.throws(
    () => service.assertApplied(altered),
    (error) => error.code === "TG_UPDATE_REF_MISMATCH",
  );
});

test("application proof remains valid across a long immutable history", async () => {
  const service = createTraceabilityGraphService({
    graphId: "long-history-graph",
    projectId: "long-history-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [],
  });
  let firstUpdateRef;
  for (let index = 0; index < 12; index += 1) {
    const run = execution(`history-${index}`, undefined, "completed");
    const prepared = await prepare(service, service.captureBase(), run);
    firstUpdateRef ??= prepared.updateRef;
    await service.mergePrepared(prepared);
  }
  assert.equal(service.captureBase().revision, 12);
  const proof = service.assertApplied(firstUpdateRef);
  assert.deepEqual(proof.updateRef, firstUpdateRef);
});

test("a stored receipt cannot prove an update outside the persisted head lineage", async () => {
  const output = loadedArtifact("forged-proof", { kind: "Candidate" });
  const run = execution("forged-proof", output);
  const graphId = "forged-proof-graph";
  const projectId = "forged-proof-project";
  const makeContributor = () =>
    contributor({
      moduleId: "forged-proof",
      scope: "requirements/candidate",
      projection: () => requirementsProjection("FORGED"),
    });

  const honestStore = createInMemoryTraceabilityStore();
  const honest = createTraceabilityGraphService({
    graphId,
    projectId,
    store: honestStore,
    contributors: [makeContributor()],
  });
  const honestPrepared = await prepare(
    honest,
    honest.captureBase(),
    run,
  );
  await honest.mergePrepared(honestPrepared);

  const untouchedStore = createInMemoryTraceabilityStore();
  const forgedStore = {
    initialize: (...args) => untouchedStore.initialize(...args),
    capture: (...args) => untouchedStore.capture(...args),
    load: (...args) => honestStore.load(...args),
    receipt: (...args) => honestStore.receipt(...args),
    isAncestor: (...args) => untouchedStore.isAncestor(...args),
    commit: (...args) => untouchedStore.commit(...args),
  };
  const target = createTraceabilityGraphService({
    graphId,
    projectId,
    store: forgedStore,
    contributors: [makeContributor()],
  });
  const targetPrepared = await prepare(
    target,
    target.captureBase(),
    run,
  );
  await assert.rejects(
    target.mergePrepared(targetPrepared),
    (error) => error.code === "TG_UPDATE_NOT_APPLIED",
  );
  assert.throws(
    () => target.assertApplied(targetPrepared.updateRef),
    (error) => error.code === "TG_UPDATE_NOT_APPLIED",
  );
  assert.equal(target.captureBase().revision, 0);
});

test("persistent compare-and-swap loss stops after the bounded retry budget", async () => {
  const output = loadedArtifact("retry-budget", { kind: "Candidate" });
  const run = execution("retry-budget", output);
  const backing = createInMemoryTraceabilityStore();
  let commitAttempts = 0;
  const stalledStore = {
    initialize: (...args) => backing.initialize(...args),
    capture: (...args) => backing.capture(...args),
    load: (...args) => backing.load(...args),
    receipt: () => undefined,
    isAncestor: (...args) => backing.isAncestor(...args),
    commit() {
      commitAttempts += 1;
      return undefined;
    },
  };
  const service = createTraceabilityGraphService({
    graphId: "retry-budget-graph",
    projectId: "retry-budget-project",
    store: stalledStore,
    contributors: [
      contributor({
        moduleId: "retry-budget",
        scope: "requirements/candidate",
        projection: () => requirementsProjection("RETRY"),
      }),
    ],
  });
  const prepared = await prepare(service, service.captureBase(), run);
  await assert.rejects(
    service.mergePrepared(prepared),
    (error) => error.code === "TG_COMMIT_RETRY_EXHAUSTED",
  );
  assert.equal(commitAttempts, 8);
  assert.equal(service.captureBase().revision, 0);
});

test("contributor ownership is explicit, unique, and kind-bounded", async () => {
  const store = createInMemoryTraceabilityStore();
  assert.throws(
    () =>
      createTraceabilityGraphService({
        graphId: "missing-owner-graph",
        projectId: "missing-owner-project",
        store,
        contributors: [
          {
            metadata: { id: "test.missing-owner", version: "1.0.0" },
            scope: "requirements/candidate",
            authority: "candidate",
            project: async () => ({
              horizon: "requirements",
              nodes: [],
              edges: [],
              reason: "No assertions.",
            }),
          },
        ],
      }),
    (error) => error.code === "TG_INVALID_ARGUMENT" && /ownership/u.test(error.message),
  );

  const first = contributor({
    moduleId: "owner-one",
    scope: "shared/candidate",
    reason: "No assertions.",
  });
  const second = contributor({
    moduleId: "owner-two",
    scope: "shared/candidate",
    reason: "No assertions.",
  });
  second.metadata = { id: "test.different-owner", version: "1.0.0" };
  assert.throws(
    () =>
      createTraceabilityGraphService({
        graphId: "conflicting-owner-graph",
        projectId: "conflicting-owner-project",
        store: createInMemoryTraceabilityStore(),
        contributors: [first, second],
      }),
    (error) => error.code === "TG_CONTRIBUTOR_OWNERSHIP_CONFLICT",
  );

  const output = loadedArtifact("unauthorized-kind", { kind: "Candidate" });
  const run = execution("unauthorized-kind", output);
  const bounded = contributor({
    moduleId: "unauthorized-kind",
    scope: "bounded/candidate",
    projection: () => ({
      nodes: [
        {
          kind: "business-objective",
          stableId: "BO-UNAUTHORIZED",
          label: "Unauthorized objective",
        },
      ],
      edges: [],
    }),
  });
  bounded.ownership = {
    ...bounded.ownership,
    nodeKinds: ["project"],
  };
  const boundedService = createTraceabilityGraphService({
    graphId: "bounded-owner-graph",
    projectId: "bounded-owner-project",
    store: createInMemoryTraceabilityStore(),
    contributors: [bounded],
  });
  await assert.rejects(
    boundedService.prepare({
      baseGraph: boundedService.captureBase(),
      ...run,
    }),
    (error) => error.code === "TG_UNAUTHORIZED_ASSERTION_KIND",
  );
});
