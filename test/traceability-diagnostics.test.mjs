import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  TRACEABILITY_EDGE_KINDS,
  TRACEABILITY_NODE_KINDS,
} from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityDiagnosticReport,
  createTraceabilityGraphService,
  diagnoseTraceabilityGraph,
  queryTraceabilityGraph,
} from "../src/traceability-graph.mjs";

function loadedArtifact(id, value = { kind: "TraceabilityFixture" }) {
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

function execution(moduleId, output) {
  const invocation = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: `invocation-${moduleId}`,
    runId: `run-${moduleId}`,
    nodeId: `node-${moduleId}`,
    module: { id: moduleId, version: "1.0.0", operation: "project" },
    inputs: {},
    options: {},
  };
  return {
    invocation,
    invocationFingerprint: canonicalJsonDigest({ moduleId, invocation }),
    moduleResult: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleResult",
      invocationId: invocation.invocationId,
      status: "completed",
      outcome: "completed",
      outputs: { primary: [output.ref] },
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {},
    loadedOutputs: { primary: [output] },
  };
}

async function materialize({ graphId, horizon, authority = "candidate", nodes, edges }) {
  const moduleId = `fixture-${graphId}`;
  const output = loadedArtifact(`output-${graphId}`);
  const scope = `fixture/${graphId}`;
  const service = createTraceabilityGraphService({
    graphId,
    projectId: `project-${graphId}`,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      {
        metadata: { id: `test.${graphId}`, version: "1.0.0" },
        match: { moduleId },
        scope,
        authority,
        ownership: {
          scope,
          authority,
          nodeKinds: TRACEABILITY_NODE_KINDS.filter(
            (kind) => kind !== "artifact-reference",
          ),
          edgeKinds: [...TRACEABILITY_EDGE_KINDS],
        },
        async project(context) {
          const loaded = context.loadedOutputs.primary[0];
          const sourceLocators = [
            {
              artifact: {
                artifactId: loaded.ref.artifactId,
                digest: loaded.ref.digest,
              },
              jsonPointer: "",
              entityDigest: canonicalJsonDigest(loaded.value),
            },
          ];
          return {
            horizon,
            nodes: nodes.map((node) => ({
              ...node,
              sourceLocators: node.sourceLocators ?? sourceLocators,
            })),
            edges: edges.map((edge) => ({
              ...edge,
              sourceLocators: edge.sourceLocators ?? sourceLocators,
            })),
          };
        },
      },
    ],
  });
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    ...execution(moduleId, output),
  });
  return service.mergePrepared(prepared);
}

function requirementChain({ architecture = false, delivery = false, evidenceStatus } = {}) {
  const nodes = [
    { kind: "project", stableId: "PROJECT", label: "Project" },
    { kind: "business-objective", stableId: "BO-1", label: "Objective" },
    { kind: "capability", stableId: "CAP-1", label: "Capability" },
    { kind: "user-story", stableId: "US-1", label: "Story" },
    { kind: "acceptance-criterion", stableId: "AC-1", label: "Criterion" },
  ];
  const edges = [
    { kind: "defines", source: { kind: "project", stableId: "PROJECT" }, target: { kind: "business-objective", stableId: "BO-1" }, rationale: "Project defines objective." },
    { kind: "realized-by", source: { kind: "business-objective", stableId: "BO-1" }, target: { kind: "capability", stableId: "CAP-1" }, rationale: "Objective is realized by capability." },
    { kind: "specified-by", source: { kind: "capability", stableId: "CAP-1" }, target: { kind: "user-story", stableId: "US-1" }, rationale: "Capability is specified by story." },
    { kind: "accepted-by", source: { kind: "user-story", stableId: "US-1" }, target: { kind: "acceptance-criterion", stableId: "AC-1" }, rationale: "Story is accepted by criterion." },
  ];
  if (architecture) {
    nodes.push({ kind: "architecture-element", stableId: "ARCH-1", label: "Architecture element" });
    edges.push({
      kind: "designed-by",
      source: { kind: "user-story", stableId: "US-1" },
      target: { kind: "architecture-element", stableId: "ARCH-1" },
      rationale: "The normative requirement is realized by architecture.",
    });
  }
  if (delivery) {
    nodes.push(
      { kind: "work-item", stableId: "WORK-1", label: "Work item" },
      { kind: "code-change", stableId: "CODE-1", label: "Code change" },
      { kind: "test", stableId: "TEST-1", label: "Test", verificationStatus: evidenceStatus },
      { kind: "verification-evidence", stableId: "EVIDENCE-1", label: "Evidence", verificationStatus: evidenceStatus },
    );
    edges.push(
      { kind: "planned-by", source: { kind: "architecture-element", stableId: "ARCH-1" }, target: { kind: "work-item", stableId: "WORK-1" }, rationale: "Architecture scopes implementation." },
      { kind: "implemented-by", source: { kind: "work-item", stableId: "WORK-1" }, target: { kind: "code-change", stableId: "CODE-1" }, rationale: "Work item is implemented by code." },
      { kind: "tested-by", source: { kind: "code-change", stableId: "CODE-1" }, target: { kind: "test", stableId: "TEST-1" }, rationale: "Code is tested." },
      { kind: "produces", source: { kind: "test", stableId: "TEST-1" }, target: { kind: "verification-evidence", stableId: "EVIDENCE-1" }, rationale: "Test produces evidence." },
      { kind: "verified-by", source: { kind: "acceptance-criterion", stableId: "AC-1" }, target: { kind: "verification-evidence", stableId: "EVIDENCE-1" }, rationale: "Evidence verifies criterion." },
    );
  }
  return { nodes, edges };
}

function qualityRequirementChain({ projectScoped = false } = {}) {
  const nodes = [
    { kind: "project", stableId: "PROJECT", label: "Project" },
    { kind: "business-objective", stableId: "BO-QUALITY", label: "Quality objective" },
    {
      kind: "capability",
      stableId: "CAP-INTERNAL",
      label: "Internal capability",
      attributes: { audience: "internal" },
    },
    { kind: "non-functional-requirement", stableId: "NFR-1", label: "Quality requirement" },
    { kind: "architecture-element", stableId: "ARCH-QUALITY", label: "Quality architecture" },
    { kind: "test", stableId: "TEST-QUALITY", label: "Quality test", verificationStatus: "pass" },
    {
      kind: "verification-evidence",
      stableId: "EVIDENCE-QUALITY",
      label: "Quality evidence",
      verificationStatus: "pass",
    },
  ];
  const scopeTarget = projectScoped
    ? { kind: "project", stableId: "PROJECT" }
    : { kind: "capability", stableId: "CAP-INTERNAL" };
  const edges = [
    { kind: "defines", source: { kind: "project", stableId: "PROJECT" }, target: { kind: "business-objective", stableId: "BO-QUALITY" }, rationale: "Project defines objective." },
    { kind: "realized-by", source: { kind: "business-objective", stableId: "BO-QUALITY" }, target: { kind: "capability", stableId: "CAP-INTERNAL" }, rationale: "Objective is realized by the internal capability." },
    { kind: "applies-to", source: { kind: "non-functional-requirement", stableId: "NFR-1" }, target: scopeTarget, rationale: "Quality requirement supplies normative coverage." },
    { kind: "designed-by", source: { kind: "non-functional-requirement", stableId: "NFR-1" }, target: { kind: "architecture-element", stableId: "ARCH-QUALITY" }, rationale: "Architecture realizes the quality requirement." },
    { kind: "tested-by", source: { kind: "non-functional-requirement", stableId: "NFR-1" }, target: { kind: "test", stableId: "TEST-QUALITY" }, rationale: "The quality requirement is tested." },
    { kind: "produces", source: { kind: "test", stableId: "TEST-QUALITY" }, target: { kind: "verification-evidence", stableId: "EVIDENCE-QUALITY" }, rationale: "The test produces evidence." },
    { kind: "verified-by", source: { kind: "non-functional-requirement", stableId: "NFR-1" }, target: { kind: "verification-evidence", stableId: "EVIDENCE-QUALITY" }, rationale: "Evidence verifies the quality requirement." },
  ];
  if (projectScoped) {
    edges.push({
      kind: "defines",
      source: { kind: "project", stableId: "PROJECT" },
      target: { kind: "non-functional-requirement", stableId: "NFR-1" },
      rationale: "Project defines the project-scoped quality requirement.",
    });
  }
  return { nodes, edges };
}

test("requirements-horizon orphan objectives and capabilities are advisory until approved", async () => {
  const merged = await materialize({
    graphId: "requirements-orphans",
    horizon: "requirements",
    nodes: [
      { kind: "business-objective", stableId: "BO-ORPHAN", label: "Orphan objective" },
      { kind: "capability", stableId: "CAP-ORPHAN", label: "Orphan capability" },
    ],
    edges: [],
  });
  const diagnostics = diagnoseTraceabilityGraph(merged.snapshot);
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(new Set(diagnostics.map(({ code }) => code)), new Set(["TG_ORPHAN_REQUIREMENT"]));
  assert.ok(diagnostics.every(({ severity, blocking }) => severity === "warning" && blocking === false));

  const report = createTraceabilityDiagnosticReport(merged.snapshot, {
    graphRef: merged.snapshotRef,
    updateRef: merged.receipt.update,
  });
  assert.deepEqual(report.summary, { errors: 0, warnings: 2, information: 0 });
  assert.equal(report.graph.digest, merged.snapshotRef.digest);
  assert.equal(Object.isFrozen(report), true);
  const unrelatedUpdate = {
    ...merged.receipt.update,
    artifactId: "unrelated-traceability-update",
    uri: "memory://fixtures/unrelated-traceability-update.json",
  };
  assert.throws(
    () => createTraceabilityDiagnosticReport(merged.snapshot, {
      graphRef: merged.snapshotRef,
      updateRef: unrelatedUpdate,
    }),
    (error) => error.code === "TG_UPDATE_REF_MISMATCH",
  );
});

test("architecture horizon blocks approved requirements without architecture realization", async () => {
  const incomplete = await materialize({
    graphId: "architecture-incomplete",
    horizon: "architecture",
    authority: "approved",
    ...requirementChain(),
  });
  const diagnostics = diagnoseTraceabilityGraph(incomplete.snapshot);
  assert.equal(diagnostics.filter(({ code }) => code === "TG_ORPHAN_REQUIREMENT").length, 2);
  assert.ok(diagnostics.every(({ severity, blocking }) => severity === "error" && blocking === true));

  const complete = await materialize({
    graphId: "architecture-complete",
    horizon: "architecture",
    authority: "approved",
    ...requirementChain({ architecture: true }),
  });
  assert.deepEqual(diagnoseTraceabilityGraph(complete.snapshot), []);
});

test("implementation diagnostics distinguish unscoped work from decision-scoped work", async () => {
  const unscoped = await materialize({
    graphId: "unscoped-work",
    horizon: "implementation",
    nodes: [{ kind: "work-item", stableId: "WORK-ORPHAN", label: "Orphan work" }],
    edges: [],
  });
  const unscopedDiagnostics = diagnoseTraceabilityGraph(unscoped.snapshot);
  assert.equal(unscopedDiagnostics.length, 1);
  assert.equal(unscopedDiagnostics[0].code, "TG_UNSCOPED_WORK");
  assert.equal(unscopedDiagnostics[0].blocking, true);

  const scoped = await materialize({
    graphId: "decision-scoped-work",
    horizon: "implementation",
    nodes: [
      { kind: "decision-record", stableId: "ADR-1", label: "Decision" },
      { kind: "work-item", stableId: "WORK-1", label: "Work" },
    ],
    edges: [
      { kind: "planned-by", source: { kind: "decision-record", stableId: "ADR-1" }, target: { kind: "work-item", stableId: "WORK-1" }, rationale: "Decision scopes work." },
    ],
  });
  assert.deepEqual(diagnoseTraceabilityGraph(scoped.snapshot), []);
});

test("verification diagnostics require passing evidence and traversal exposes forward and reverse chains", async () => {
  const failing = await materialize({
    graphId: "failing-evidence",
    horizon: "verification",
    authority: "approved",
    ...requirementChain({ architecture: true, delivery: true, evidenceStatus: "fail" }),
  });
  const missing = diagnoseTraceabilityGraph(failing.snapshot).filter(({ code }) => code === "TG_MISSING_EVIDENCE");
  assert.equal(missing.length, 3);
  assert.ok(missing.every(({ blocking }) => blocking));

  const passing = await materialize({
    graphId: "passing-evidence",
    horizon: "verification",
    authority: "approved",
    ...requirementChain({ architecture: true, delivery: true, evidenceStatus: "pass" }),
  });
  assert.deepEqual(diagnoseTraceabilityGraph(passing.snapshot), []);

  const forward = queryTraceabilityGraph(passing.snapshot, {
    start: { kind: "business-objective", stableId: "BO-1", authority: "approved" },
    direction: "outgoing",
    targetKinds: ["architecture-element", "verification-evidence"],
  });
  assert.deepEqual(
    new Set(forward.paths.map(({ targetNodeId }) => forward.nodes.find(({ nodeId }) => nodeId === targetNodeId).kind)),
    new Set(["architecture-element", "verification-evidence"]),
  );
  assert.ok(forward.paths.every(({ nodeIds, edgeIds }) => nodeIds.length === edgeIds.length + 1));

  const reverse = queryTraceabilityGraph(passing.snapshot, {
    start: { kind: "verification-evidence", stableId: "EVIDENCE-1", authority: "approved" },
    direction: "incoming",
    targetKinds: ["business-objective"],
  });
  assert.equal(reverse.paths.length, 1);
  const objective = reverse.nodes.find(({ nodeId }) => nodeId === reverse.paths[0].targetNodeId);
  assert.equal(objective.stableId, "BO-1");
  assert.deepEqual(queryTraceabilityGraph(passing.snapshot, {
    start: { kind: "business-objective", stableId: "BO-1", authority: "approved" },
    direction: "outgoing",
    targetKinds: ["architecture-element", "verification-evidence"],
  }), forward);
});

test("generic dependency edges cannot masquerade as verification evidence", async () => {
  const graph = requirementChain({ architecture: true });
  graph.nodes.push({
    kind: "verification-evidence",
    stableId: "EVIDENCE-BYPASS",
    label: "Unscoped passing evidence",
    verificationStatus: "pass",
  });
  graph.edges.push({
    kind: "depends-on",
    source: { kind: "acceptance-criterion", stableId: "AC-1" },
    target: {
      kind: "verification-evidence",
      stableId: "EVIDENCE-BYPASS",
    },
    rationale: "A generic dependency is not a verification relationship.",
  });
  const merged = await materialize({
    graphId: "evidence-bypass",
    horizon: "verification",
    authority: "approved",
    ...graph,
  });
  const missing = diagnoseTraceabilityGraph(merged.snapshot).filter(
    ({ code }) => code === "TG_MISSING_EVIDENCE",
  );
  assert.equal(missing.length, 3);
  assert.ok(missing.every(({ blocking }) => blocking));
});

test("candidate passing evidence cannot satisfy approved requirements through sanctioned evidence edges", async () => {
  const graphId = "candidate-evidence-authority-boundary";
  const approvedModuleId = "fixture-approved-requirements";
  const candidateModuleId = "fixture-candidate-evidence";
  const approvedScope = "fixture/approved-requirements";
  const candidateScope = "fixture/candidate-evidence";
  const approvedOutput = loadedArtifact("approved-requirements-output");
  const candidateOutput = loadedArtifact("candidate-evidence-output");

  function sourceLocators(context) {
    const loaded = context.loadedOutputs.primary[0];
    return [
      {
        artifact: {
          artifactId: loaded.ref.artifactId,
          digest: loaded.ref.digest,
        },
        jsonPointer: "",
        entityDigest: canonicalJsonDigest(loaded.value),
      },
    ];
  }

  const service = createTraceabilityGraphService({
    graphId,
    projectId: "project-candidate-evidence-authority-boundary",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      {
        metadata: {
          id: "test.approved-requirements",
          version: "1.0.0",
        },
        match: { moduleId: approvedModuleId },
        scope: approvedScope,
        authority: "approved",
        ownership: {
          scope: approvedScope,
          authority: "approved",
          nodeKinds: [
            "acceptance-criterion",
            "architecture-element",
            "business-objective",
            "capability",
            "project",
            "user-story",
          ],
          edgeKinds: [
            "accepted-by",
            "defines",
            "designed-by",
            "realized-by",
            "specified-by",
          ],
        },
        async project(context) {
          const graph = requirementChain({ architecture: true });
          const locators = sourceLocators(context);
          return {
            horizon: "architecture",
            nodes: graph.nodes.map((node) => ({
              ...node,
              sourceLocators: locators,
            })),
            edges: graph.edges.map((edge) => ({
              ...edge,
              sourceLocators: locators,
            })),
          };
        },
      },
      {
        metadata: {
          id: "test.candidate-evidence",
          version: "1.0.0",
        },
        match: { moduleId: candidateModuleId },
        scope: candidateScope,
        authority: "candidate",
        ownership: {
          scope: candidateScope,
          authority: "candidate",
          nodeKinds: ["test", "verification-evidence"],
          edgeKinds: ["produces", "verified-by"],
        },
        async project(context) {
          const locators = sourceLocators(context);
          return {
            horizon: "verification",
            nodes: [
              {
                kind: "test",
                stableId: "TEST-CANDIDATE",
                label: "Candidate test",
                verificationStatus: "pass",
                sourceLocators: locators,
              },
              {
                kind: "verification-evidence",
                stableId: "EVIDENCE-CANDIDATE",
                label: "Candidate passing evidence",
                verificationStatus: "pass",
                sourceLocators: locators,
              },
            ],
            edges: [
              {
                kind: "produces",
                source: { kind: "test", stableId: "TEST-CANDIDATE" },
                target: {
                  kind: "verification-evidence",
                  stableId: "EVIDENCE-CANDIDATE",
                },
                rationale: "The candidate test produces candidate evidence.",
                sourceLocators: locators,
              },
              {
                kind: "verified-by",
                source: {
                  kind: "acceptance-criterion",
                  stableId: "AC-1",
                  authority: "approved",
                  scope: approvedScope,
                },
                target: {
                  kind: "verification-evidence",
                  stableId: "EVIDENCE-CANDIDATE",
                },
                rationale: "Candidate evidence claims to verify the approved criterion.",
                sourceLocators: locators,
              },
            ],
          };
        },
      },
    ],
  });

  const approved = await service.prepare({
    baseGraph: service.captureBase(),
    ...execution(approvedModuleId, approvedOutput),
  });
  await service.mergePrepared(approved);
  const candidate = await service.prepare({
    baseGraph: service.captureBase(),
    ...execution(candidateModuleId, candidateOutput),
  });
  const merged = await service.mergePrepared(candidate);

  const evidence = merged.snapshot.nodes.find(
    ({ stableId }) => stableId === "EVIDENCE-CANDIDATE",
  );
  assert.equal(evidence.verificationStatus, "pass");
  assert.equal(evidence.authority, "candidate");
  assert.deepEqual(
    new Set(
      merged.snapshot.edges
        .filter(({ targetNodeId }) => targetNodeId === evidence.nodeId)
        .map(({ kind }) => kind),
    ),
    new Set(["produces", "verified-by"]),
  );

  const diagnostics = diagnoseTraceabilityGraph(merged.snapshot);
  const missing = diagnostics.filter(
    ({ code }) => code === "TG_MISSING_EVIDENCE",
  );
  const nodes = new Map(
    merged.snapshot.nodes.map((node) => [node.nodeId, node]),
  );
  assert.equal(diagnostics.length, 3);
  assert.equal(missing.length, 3);
  assert.deepEqual(
    new Set(missing.map(({ subjectId }) => nodes.get(subjectId).stableId)),
    new Set(["AC-1", "BO-1", "US-1"]),
  );
  assert.ok(
    missing.every(
      ({ severity, blocking, subjectId }) =>
        severity === "error" &&
        blocking === true &&
        nodes.get(subjectId).authority === "approved",
    ),
  );
});

test("quality requirements cover internal capabilities and provide sanctioned evidence paths", async () => {
  for (const projectScoped of [false, true]) {
    const merged = await materialize({
      graphId: projectScoped
        ? "project-quality-coverage"
        : "capability-quality-coverage",
      horizon: "verification",
      authority: "approved",
      ...qualityRequirementChain({ projectScoped }),
    });
    assert.deepEqual(
      diagnoseTraceabilityGraph(merged.snapshot),
      [],
      projectScoped
        ? "project-scoped quality should cover an internal capability"
        : "capability-scoped quality should cover an internal capability",
    );
  }
});

test("service rejects incomplete stores and graph queries fail closed for unknown starts", async () => {
  assert.throws(
    () => createTraceabilityGraphService({
      graphId: "invalid-store",
      projectId: "project-invalid-store",
      store: {},
      contributors: [],
    }),
    (error) => error.code === "TG_INVALID_ARGUMENT" && /store\.initialize/u.test(error.message),
  );

  const merged = await materialize({
    graphId: "query-errors",
    horizon: "requirements",
    ...requirementChain(),
  });
  assert.throws(
    () => queryTraceabilityGraph(merged.snapshot, { start: { kind: "business-objective", stableId: "MISSING" } }),
    (error) => error.code === "TG_QUERY_START_NOT_FOUND",
  );
});
