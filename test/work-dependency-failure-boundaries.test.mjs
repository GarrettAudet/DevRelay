import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { promoteWorkDependencyBaseline } from "../src/work-dependency-gate.mjs";
import { createNativeDependencyProposal } from "../src/work-dependency-native-proposer.mjs";
import { createWorkDependencyAnalysisRuntime } from "../src/work-dependency-runtime.mjs";
import {
  buildWorkBreakdownAnalysisSnapshot,
  createContextSlice,
} from "../src/work-dependency-snapshot.mjs";

const ROOT = new URL("../", import.meta.url);

function idOf(value) {
  return value.baselineId ?? value.sliceSetId ?? value.policyId;
}

function loaded(value, schema, mediaType) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: {
      artifactId: idOf(value),
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `memory://failure/${idOf(value)}.json`,
    },
  };
}

async function file(relativePath, schema, mediaType) {
  const bytes = await readFile(new URL(relativePath, ROOT));
  const value = JSON.parse(bytes);
  return {
    value,
    bytes,
    ref: {
      artifactId: idOf(value),
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `memory://failure/${idOf(value)}.json`,
    },
  };
}

function store() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}

async function inputs() {
  const workBreakdown = await file(
    "dogfood/work-dependency-analysis/work-breakdown/work-breakdown-baseline.json",
    "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
    "application/vnd.devrelay.work-breakdown-baseline+json",
  );
  const projectOverview = await file(
    "project/history/1.1.0/project-overview-baseline.json",
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  );
  const requirements = await file(
    "project/history/1.1.0/requirements-baseline.json",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  );
  const architecture = await file(
    "dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json",
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
  );
  const coveredRefs = workBreakdown.value.workItems.map(({ id }) => id);
  const contextSliceSet = loaded(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ContextSliceSet",
      sliceSetId: "CTXS-WDA-FAILURE",
      slices: [
        createContextSlice({
          id: "CTX-WDA-FAILURE-REQUIREMENTS",
          purpose: "Pin approved acceptance criteria.",
          source: requirements,
          sourceKind: "RequirementsBaseline",
          sourceVersion: {
            kind: "artifact-version",
            value: requirements.value.version,
          },
          selector: "/requirements/acceptanceCriteria",
          coveredRefs,
        }),
        createContextSlice({
          id: "CTX-WDA-FAILURE-ARCHITECTURE",
          purpose: "Pin approved architecture elements.",
          source: architecture,
          sourceKind: "ArchitectureBaseline",
          sourceVersion: { kind: "content-digest", value: architecture.ref.digest },
          selector: "/sections/architectureModel/content/elements",
          coveredRefs,
        }),
      ],
    },
    "https://devrelay.dev/artifacts/context-slice-set/v1",
    "application/vnd.devrelay.context-slice-set+json",
  );
  const policyBytes = await readFile(
    new URL("policies/work-dependency-analysis/policy.wasm", ROOT),
  );
  const policyWasm = {
    value: { kind: "OpaWasmPolicyBinary" },
    bytes: policyBytes,
    ref: {
      artifactId: "opa-wda-policy-wasm-failure",
      schema: "https://devrelay.dev/native/opa-wasm/v1",
      mediaType: "application/wasm",
      digest: sha256Digest(policyBytes),
      uri: "memory://failure/policy.wasm",
    },
  };
  const policyBundle = loaded(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "OpaPolicyBundle",
      policyId: "OPA-WDA-FAILURE",
      version: "0.1.0",
      wasm: policyWasm.ref,
      entrypoint: "devrelay/work_dependency/decision",
      opaCompilerVersion: "1.16.2",
    },
    "https://devrelay.dev/artifacts/opa-policy-bundle/v1",
    "application/vnd.devrelay.opa-policy-bundle+json",
  );
  const byDigest = new Map(
    [requirements, architecture, policyWasm].map((entry) => [entry.ref.digest, entry]),
  );
  return {
    workBreakdown,
    projectOverview,
    contextSliceSet,
    policyBundle,
    resolveArtifact: async (ref) => byDigest.get(ref.digest),
  };
}

test("snapshot rejects digest-valid bytes paired with a substituted parsed value before resolution", async () => {
  const exact = await inputs();
  exact.contextSliceSet.value = {
    ...exact.contextSliceSet.value,
    sliceSetId: "CTXS-WDA-SUBSTITUTED",
  };
  let resolverCalls = 0;
  await assert.rejects(
    buildWorkBreakdownAnalysisSnapshot({
      ...exact,
      resolveArtifact: async () => {
        resolverCalls += 1;
      },
    }),
    /parsed value does not match its exact raw bytes/,
  );
  assert.equal(resolverCalls, 0);
});

test("version-pinned context drift fails before an untrusted proposer is called", async () => {
  const exact = await inputs();
  const drifted = structuredClone(exact.contextSliceSet.value);
  drifted.slices[0].sourceVersion.value = "9.9.9";
  let proposerCalls = 0;
  const runtime = createWorkDependencyAnalysisRuntime({
    proposer: {
      id: "fixture.proposer",
      version: "0.1.0",
      async propose() {
        proposerCalls += 1;
      },
    },
  });
  await assert.rejects(
    runtime.execute({
      executionId: "WDA-DRIFT-001",
      ...exact,
      contextSliceSet: loaded(
        drifted,
        "https://devrelay.dev/artifacts/context-slice-set/v1",
        "application/vnd.devrelay.context-slice-set+json",
      ),
      checkpoints: store(),
    }),
    /source version or commit drifted/,
  );
  assert.equal(proposerCalls, 0);
});

test("OPA denial remains auditable but cannot reach WorkDependencyGate", async () => {
  const exact = await inputs();
  const runtime = createWorkDependencyAnalysisRuntime({
    proposer: {
      id: "fixture.denied-proposer",
      version: "0.1.0",
      async propose(snapshot) {
        const proposal = structuredClone(createNativeDependencyProposal(snapshot));
        proposal.proposer = { id: "fixture.denied-proposer", version: "0.1.0" };
        proposal.edges[0].policyDisposition = "deny";
        proposal.proposalDigest = canonicalJsonDigest({
          snapshotDigest: proposal.snapshotDigest,
          nodes: proposal.nodes,
          edges: proposal.edges,
          hintDispositions: proposal.hintDispositions,
        });
        return proposal;
      },
    },
  });
  const checkpoints = store();
  const result = await runtime.execute({
    executionId: "WDA-DENY-001",
    ...exact,
    checkpoints,
  });
  assert.equal(result.outcome, "unable-to-proceed");
  assert.equal(result.progressionAllowed, false);
  assert.equal(result.candidate.kind, "WorkDependencyCandidate");
  const receipt = await runtime.verifyCheckpointedExecution({
    executionId: result.executionId,
    executionFingerprint: result.executionFingerprint,
    checkpoints,
  });
  await assert.rejects(
    promoteWorkDependencyBaseline({ replayReceipt: receipt }),
    /not a progression-eligible dependency analysis/,
  );
});
