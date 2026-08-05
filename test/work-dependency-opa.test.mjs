import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { evaluateWorkDependencyPolicy } from "../src/work-dependency-opa.mjs";

const bundleBytes = await readFile(
  new URL("../policies/work-dependency-analysis/policy.wasm", import.meta.url),
);

function bundleRef(digest = sha256Digest(bundleBytes)) {
  return {
    artifactId: "opa-wda-policy-wasm-0.1.0",
    schema: "https://devrelay.dev/native/opa-wasm/v1",
    mediaType: "application/wasm",
    digest,
    uri: "memory://opa/wda-policy.wasm",
  };
}

function input(policyDisposition = "allow") {
  return {
    nodes: ["WI-A", "WI-B"],
    edges: [
      {
        id: "DEP-A-B",
        prerequisiteId: "WI-A",
        dependentId: "WI-B",
        rationale: "A precedes B.",
        evidence: [{ kind: "fixture" }],
        policyDisposition,
      },
    ],
    graphDigest: `sha256:${"a".repeat(64)}`,
  };
}

test("OPA WASM returns an exact decision for every proposed edge", async () => {
  const allowed = await evaluateWorkDependencyPolicy({
    bundleRef: bundleRef(),
    bundleBytes,
    entrypoint: "devrelay/work_dependency/decision",
    input: input(),
  });
  assert.equal(allowed.decisionSet.evaluationStatus, "evaluated");
  assert.equal(allowed.decisionSet.allow, true);
  assert.deepEqual(allowed.decisionSet.edgeDecisions, [
    { edgeId: "DEP-A-B", allow: true },
  ]);

  const denied = await evaluateWorkDependencyPolicy({
    bundleRef: bundleRef(),
    bundleBytes,
    entrypoint: "devrelay/work_dependency/decision",
    input: input("deny"),
  });
  assert.equal(denied.decisionSet.evaluationStatus, "evaluated");
  assert.equal(denied.decisionSet.allow, false);
  assert.deepEqual(denied.decisionSet.edgeDecisions, [
    { edgeId: "DEP-A-B", allow: false },
  ]);
  assert.equal(denied.decisionSet.denials[0].code, "OPA_EDGE_DENIED");
});

test("OPA rejects stale bundles and absent entrypoints before policy authority exists", async () => {
  await assert.rejects(
    evaluateWorkDependencyPolicy({
      bundleRef: bundleRef(`sha256:${"0".repeat(64)}`),
      bundleBytes,
      entrypoint: "devrelay/work_dependency/decision",
      input: input(),
    }),
    /bytes do not match the supplied digest/,
  );
  await assert.rejects(
    evaluateWorkDependencyPolicy({
      bundleRef: bundleRef(),
      bundleBytes,
      entrypoint: "devrelay/work_dependency/missing",
      input: input(),
    }),
    /entrypoint .* is absent/,
  );
});

test("invalid WASM is captured as non-authoritative evaluation evidence", async () => {
  const invalidBytes = Buffer.from("not-wasm", "utf8");
  const evaluated = await evaluateWorkDependencyPolicy({
    bundleRef: bundleRef(sha256Digest(invalidBytes)),
    bundleBytes: invalidBytes,
    entrypoint: "devrelay/work_dependency/decision",
    input: input(),
  });
  assert.equal(evaluated.decisionSet.evaluationStatus, "evaluation-error");
  assert.equal(evaluated.decisionSet.allow, false);
  assert.equal(evaluated.decisionSet.diagnostics[0].severity, "error");
});
