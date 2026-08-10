import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { adaptSystemTestResult, TEST_SYSTEM_VERIFIER } from "../src/system-verification-test-adapter.mjs";
import { adaptSystemReviewResult, REVIEW_SYSTEM_VERIFIER } from "../src/system-verification-review-adapter.mjs";

const D = `sha256:${"a".repeat(64)}`;
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });

function invocation(verifier) {
  return seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "SystemVerifierInvocation", invocationId: "SVI-1", subject: ref("SYSTEM"), obligationSet: ref("OBLIGATIONS"), policy: ref("POLICY"), verifier, assignedObligationIds: ["OB-AC", "OB-NFR"], verificationEnvironment: { disposition: "approved-not-applicable", rationale: "Hermetic verification" }, grants: [] }, "invocationFingerprint");
}

function invoke(binding, nativeResult, verifier = binding.verifier) {
  const nativeBytes = Buffer.from(JSON.stringify(nativeResult));
  return binding.adapter({ invocation: invocation(verifier), nativeBytes, nativeResult, nativeArtifact: ref("NATIVE-RESULT", sha256Digest(nativeBytes)) });
}

const bindings = [
  { name: "test", adapter: adaptSystemTestResult, verifier: TEST_SYSTEM_VERIFIER, list: "tests", state: "status", pass: "pass", fail: "fail", unsure: "inconclusive" },
  { name: "review", adapter: adaptSystemReviewResult, verifier: REVIEW_SYSTEM_VERIFIER, list: "findings", state: "disposition", pass: "accepted", fail: "rejected", unsure: "uncertain" },
];
const evidence = (kind, artifactId) => ({ kind, artifact: ref(artifactId) });
const entry = (binding, obligationId, state, evidenceBindings = [evidence("system-test-report", `EVIDENCE-${obligationId}`)]) => ({ obligationId, [binding.state]: state, evidenceBindings });

for (const binding of bindings) {
  test(`${binding.name} system verifier maps native evidence to only canonical raw observations`, () => {
    const raw = invoke(binding, { [binding.list]: [entry(binding, "OB-NFR", binding.fail), entry(binding, "OB-AC", binding.pass)] });
    assert.equal(raw.kind, "RawSystemVerifierObservation");
    assert.deepEqual(raw.observations.map(({ obligationId, status }) => [obligationId, status]), [["OB-AC", "pass"], ["OB-NFR", "fail"]]);
    assert.equal(raw.observations[0].evidenceBindings[0].kind, "system-test-report");
    assert.equal(Object.hasOwn(raw.observations[0], "evidenceArtifacts"), false);
    assert.equal(raw.nativeEvidence[0].artifactId, "NATIVE-RESULT");
    assert.notEqual(raw.nativeEvidence[0].artifactId, raw.observations[0].evidenceBindings[0].artifact.artifactId);
    assert.match(raw.rawObservationDigest, /^sha256:[0-9a-f]{64}$/);
    for (const forbidden of ["outcome", "progression", "authority", "graphOperations", "scope", "businessAcceptance"]) assert.equal(Object.hasOwn(raw, forbidden), false);
  });

  test(`${binding.name} system verifier exactly covers assigned obligations and is deterministic`, () => {
    const first = invoke(binding, { [binding.list]: [entry(binding, "OB-AC", binding.pass)] });
    assert.deepEqual(first.observations.map(({ obligationId, status, evidenceBindings }) => [obligationId, status, evidenceBindings.length]), [["OB-AC", "pass", 1], ["OB-NFR", "inconclusive", 0]]);
    const reordered = invoke(binding, { [binding.list]: [entry(binding, "OB-NFR", binding.unsure, []), entry(binding, "OB-AC", binding.pass, [evidence("coverage-report", "Z"), evidence("test-report", "A")])] });
    const equivalent = invoke(binding, { [binding.list]: [entry(binding, "OB-AC", binding.pass, [evidence("test-report", "A"), evidence("coverage-report", "Z")]), entry(binding, "OB-NFR", binding.unsure, [])] });
    assert.deepEqual(reordered.observations, equivalent.observations);
    assert.notEqual(reordered.observationId, equivalent.observationId, "raw identity remains bound to the exact native bytes");
  });

  test(`${binding.name} system verifier rejects authority, graph, scope, substitution, and malformed evidence`, () => {
    for (const forbidden of [{ outcome: "verified" }, { graphOperations: [] }, { scope: ["extra"] }, { businessAcceptance: true }]) assert.throws(() => invoke(binding, { [binding.list]: [], ...forbidden }), /authority|malformed/);
    assert.throws(() => invoke(binding, { [binding.list]: [entry(binding, "OTHER", binding.pass)] }), /unrelated/);
    assert.throws(() => invoke(binding, { [binding.list]: [entry(binding, "OB-AC", binding.pass, [])] }), /requires evidence/);
    assert.throws(() => invoke(binding, { [binding.list]: [entry(binding, "OB-AC", binding.pass), entry(binding, "OB-AC", binding.fail)] }), /duplicate/);
    const duplicateBinding = evidence("test-report", "SAME");
    assert.throws(() => invoke(binding, { [binding.list]: [entry(binding, "OB-AC", binding.pass, [duplicateBinding, duplicateBinding])] }), /duplicate .* evidence binding/);
    const legacy = { obligationId: "OB-AC", [binding.state]: binding.pass, evidenceArtifacts: [ref("LEGACY")] };
    assert.throws(() => invoke(binding, { [binding.list]: [legacy] }), /malformed/);
    const other = binding.name === "test" ? REVIEW_SYSTEM_VERIFIER : TEST_SYSTEM_VERIFIER;
    assert.throws(() => invoke(binding, { [binding.list]: [] }, other), /substituted/);
    const value = { [binding.list]: [] }, bytes = Buffer.from(JSON.stringify(value));
    assert.throws(() => binding.adapter({ invocation: invocation(binding.verifier), nativeBytes: bytes, nativeResult: { ...value, extra: true }, nativeArtifact: ref("NATIVE", sha256Digest(bytes)) }), /does not match/);
    assert.throws(() => binding.adapter({ invocation: invocation(binding.verifier), nativeBytes: bytes, nativeResult: value, nativeArtifact: ref("NATIVE", D) }), /digest-bind/);
  });
}

test("both proposer-only SystemVerification plug-ins conform through the same module contract", () => {
  const moduleDefinition = JSON.parse(readFileSync(new URL("../examples/modules/system-verification.module.json", import.meta.url)));
  const definitions = ["../examples/plugins/test-system-verifier.plugin.json", "../examples/plugins/review-system-verifier.plugin.json"].map((path) => JSON.parse(readFileSync(new URL(path, import.meta.url))));
  const registry = createModuleRegistry({ modules: [moduleDefinition], plugins: definitions.map((definition) => ({ definition, adapter: { async invoke() { throw new Error("not exercised"); } } })) });
  assert.equal(registry.pluginCount, 2);
  for (const definition of definitions) {
    const operation = definition.implements[0].operations[0];
    assert.equal(operation.role, "proposer");
    assert.equal(operation.execution, "effect");
    assert.ok(!JSON.stringify(definition).includes("BusinessAcceptance"));
  }
});
