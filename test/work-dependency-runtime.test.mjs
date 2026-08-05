import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { promoteWorkDependencyBaseline } from "../src/work-dependency-gate.mjs";
import { createNativeDependencyProposal } from "../src/work-dependency-native-proposer.mjs";
import { createWorkDependencyAnalysisRuntime } from "../src/work-dependency-runtime.mjs";
import { createContextSlice } from "../src/work-dependency-snapshot.mjs";

const ROOT = new URL("../", import.meta.url);

function artifactId(value) {
  return (
    value.baselineId ??
    value.sliceSetId ??
    value.approvalId ??
    value.policyId ??
    value.artifactId
  );
}

function loadedFromValue(value, schema, mediaType, name = artifactId(value)) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const ref = {
    artifactId: name,
    schema,
    mediaType,
    digest: sha256Digest(bytes),
    uri: `memory://test/${name}.json`,
  };
  return { value, ref, bytes };
}

async function loadedFile(relativePath, schema, mediaType) {
  const bytes = await readFile(new URL(relativePath, ROOT));
  const value = JSON.parse(bytes);
  return {
    value,
    ref: {
      artifactId: artifactId(value),
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: pathToFileURL(new URL(relativePath, ROOT).pathname).href,
    },
    bytes,
  };
}

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return records.get(key);
    },
    async put(key, value) {
      if (records.has(key)) throw new Error("immutable checkpoint already exists");
      records.set(key, structuredClone(value));
    },
  };
}

async function fixture() {
  const workBreakdown = await loadedFile(
    "project/work-breakdown-baseline.json",
    "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
    "application/vnd.devrelay.work-breakdown-baseline+json",
  );
  const projectOverview = await loadedFile(
    "project/project-overview-baseline.json",
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  );
  const requirements = await loadedFile(
    "project/requirements-baseline.json",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  );
  const architecture = await loadedFile(
    "project/architecture-baseline.json",
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
  );
  const coveredRefs = workBreakdown.value.workItems.map(({ id }) => id);
  const slices = [
    createContextSlice({
      id: "CTX-WDA-REQUIREMENTS",
      purpose: "Admit the approved acceptance criteria relevant to dependency review.",
      source: requirements,
      sourceKind: "RequirementsBaseline",
      sourceVersion: { kind: "artifact-version", value: requirements.value.version },
      selector: "/requirements/acceptanceCriteria",
      coveredRefs,
    }),
    createContextSlice({
      id: "CTX-WDA-ARCHITECTURE",
      purpose: "Admit the approved architecture elements relevant to dependency review.",
      source: architecture,
      sourceKind: "ArchitectureBaseline",
      sourceVersion: { kind: "content-digest", value: architecture.ref.digest },
      selector: "/sections/architectureModel/content/elements",
      coveredRefs,
    }),
  ];
  const contextSliceSet = loadedFromValue(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ContextSliceSet",
      sliceSetId: "CTXS-WDA-TEST",
      slices,
    },
    "https://devrelay.dev/artifacts/context-slice-set/v1",
    "application/vnd.devrelay.context-slice-set+json",
  );
  const policyBytes = await readFile(
    new URL("policies/work-dependency-analysis/policy.wasm", ROOT),
  );
  const policyWasm = {
    value: { kind: "OpaWasmPolicyBinary" },
    ref: {
      artifactId: "opa-wda-policy-wasm-0.1.0",
      schema: "https://devrelay.dev/native/opa-wasm/v1",
      mediaType: "application/wasm",
      digest: sha256Digest(policyBytes),
      uri: "memory://test/opa-wda-policy-0.1.0.wasm",
    },
    bytes: policyBytes,
  };
  const policyBundle = loadedFromValue(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "OpaPolicyBundle",
      policyId: "OPA-WDA-POLICY",
      version: "0.1.0",
      wasm: policyWasm.ref,
      entrypoint: "devrelay/work_dependency/decision",
      opaCompilerVersion: "1.16.2",
    },
    "https://devrelay.dev/artifacts/opa-policy-bundle/v1",
    "application/vnd.devrelay.opa-policy-bundle+json",
  );
  const sources = new Map(
    [requirements, architecture, policyWasm].map((entry) => [entry.ref.digest, entry]),
  );
  return {
    workBreakdown,
    projectOverview,
    contextSliceSet,
    policyBundle,
    resolveArtifact: async (ref) => sources.get(ref.digest),
  };
}

test("runtime owns snapshot, Graphology-DAG, OPA, checkpoint replay, and adapter isolation", async () => {
  const inputs = await fixture();
  let proposerCalls = 0;
  let reviewerCalls = 0;
  const runtime = createWorkDependencyAnalysisRuntime({
    proposer: {
      id: "native-structured-dependency-proposer",
      version: "0.1.0",
      async propose(snapshot) {
        proposerCalls += 1;
        assert.equal(snapshot.kind, "WorkBreakdownAnalysisSnapshot");
        assert.equal("traceabilityGraph" in snapshot, false);
        return createNativeDependencyProposal(snapshot);
      },
    },
    reviewer: {
      id: "github.spec-kit-consistency-reviewer",
      version: "0.1.0",
      async review({ graphMechanics }) {
        reviewerCalls += 1;
        const material = {
          graphDigest: graphMechanics.graphDigest,
          status: "pass",
          findings: [],
        };
        return {
          apiVersion: "devrelay.dev/v1alpha1",
          kind: "WorkDependencyConsistencyReview",
          reviewId: `WDCR-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
          reviewer: {
            id: "github.spec-kit-consistency-reviewer",
            version: "0.1.0",
          },
          graphDigest: graphMechanics.graphDigest,
          advisory: true,
          status: "pass",
          findings: [],
        };
      },
    },
  });
  const checkpoints = memoryStore();
  const first = await runtime.execute({
    executionId: "WDA-TEST-001",
    ...inputs,
    checkpoints,
  });
  assert.equal(first.outcome, "analyzed");
  assert.equal(first.progressionAllowed, true);
  assert.equal(first.replayed, false);
  assert.ok(first.candidate.edges.length > 0);
  assert.equal(proposerCalls, 1);
  assert.equal(reviewerCalls, 1);

  const replay = await runtime.execute({
    executionId: "WDA-TEST-001",
    ...inputs,
    resolveArtifact: async () => {
      throw new Error("replay must not resolve context");
    },
    checkpoints,
  });
  assert.equal(replay.replayed, true);
  assert.equal(proposerCalls, 1);
  assert.equal(reviewerCalls, 1);

  const receipt = await runtime.verifyCheckpointedExecution({
    executionId: first.executionId,
    executionFingerprint: first.executionFingerprint,
    checkpoints,
  });
  return { inputs, first, receipt };
});

test("Gate promotes only an exact approved static-DAG baseline", async () => {
  const inputs = await fixture();
  const runtime = createWorkDependencyAnalysisRuntime();
  const checkpoints = memoryStore();
  const result = await runtime.execute({
    executionId: "WDA-GATE-001",
    ...inputs,
    checkpoints,
  });
  const receipt = await runtime.verifyCheckpointedExecution({
    executionId: result.executionId,
    executionFingerprint: result.executionFingerprint,
    checkpoints,
  });
  const candidateRef = result.candidateRef;
  const policyRef = receipt.checkpoint.artifacts.policyDecisionSet.ref;
  const reviewRef = receipt.checkpoint.artifacts.consistencyReview.ref;
  const approvalEvidence = loadedFromValue(
    { artifactId: "WDA-GATE-REVIEW", status: "pass" },
    "https://devrelay.dev/evidence/work-dependency-gate-review/v1",
    "application/json",
    "WDA-GATE-REVIEW",
  );
  const approval = loadedFromValue(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "WorkDependencyGateApproval",
      approvalId: "WDA-APPROVAL-001",
      authority: "project-owner",
      decision: "approve",
      policyVersion: "work-dependency-gate/0.1.0",
      candidate: candidateRef,
      requiredEvidence: [approvalEvidence.ref],
    },
    "https://devrelay.dev/evidence/work-dependency-gate-approval/v1",
    "application/vnd.devrelay.work-dependency-gate-approval+json",
  );
  const candidate = result.candidate;
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyBaseline",
    baselineId: "WDB-WDA-TEST",
    version: "1.0.0",
    approvedCandidate: candidateRef,
    workBreakdownBaseline: inputs.workBreakdown.ref,
    nodes: candidate.nodes,
    edges: candidate.edges,
    graphDigest: candidate.graphDigest,
    topologicalOrder: candidate.topologicalOrder,
    policyEvidence: policyRef,
    consistencyEvidence: reviewRef,
    approvalEvidence: [approval.ref],
    sourceRefs: candidate.sourceRefs,
  };
  const baselineLoaded = loadedFromValue(
    baseline,
    "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
    "application/vnd.devrelay.work-dependency-baseline+json",
  );
  const commit = await promoteWorkDependencyBaseline({
    replayReceipt: receipt,
    baseline,
    baselineRef: baselineLoaded.ref,
    baselineBytes: baselineLoaded.bytes,
    approval,
    evidenceResolver: async (ref) =>
      ref.digest === approvalEvidence.ref.digest ? approvalEvidence : undefined,
  });
  assert.equal(commit.progressionAllowed, true);
  assert.equal(commit.baseline.kind, "WorkDependencyBaseline");

  await assert.rejects(
    promoteWorkDependencyBaseline({
      replayReceipt: { ...receipt },
      baseline,
      baselineRef: baselineLoaded.ref,
      baselineBytes: baselineLoaded.bytes,
      approval,
      evidenceResolver: async () => approvalEvidence,
    }),
    /unforgeable checkpoint replay receipt/,
  );
});
