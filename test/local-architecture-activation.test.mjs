import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { activateLocalArchitectureGate, verifyLocalArchitectureActivation } from "../src/local-architecture-activation.mjs";

test("architecture activation rejects unvalidated Gate records before graph or storage access", async () => {
  let accesses = 0;
  const forbidden = new Proxy({}, { get() { accesses++; throw new Error("effect before Gate validation"); } });
  const request = { checkpointReplay: {}, record: {}, storage: forbidden, graph: forbidden,
    namespace: "fixture", loadArtifact() { accesses++; throw new Error("unexpected artifact load"); } };
  await assert.rejects(activateLocalArchitectureGate(request), /stored architecture Gate violates/);
  await assert.rejects(verifyLocalArchitectureActivation(request), /stored architecture Gate violates/);
  assert.equal(accesses, 0);
});

test("architecture activation contract rejects extra authority, missing proof and malformed state storage", () => {
  const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
  const validate = compileArtifactSchema(read("local-architecture-activation.schema.json"),
    [read("module-result.schema.json"), read("module-execution-record.schema.json"), read("local-discovery-activation.schema.json")]);
  const digest = canonicalJsonDigest({ fixture: true });
  const ref = { artifactId: "fixture", schema: "https://devrelay.dev/fixture/v1", mediaType: "application/json", uri: "fixture://activation", digest };
  // Structural fixture only: successful schema validation is not graph authority.
  const value = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalArchitectureActivation", gateCommitDigest: digest,
    checkpointKey: `architecture-activation:${digest}`, state: ref,
    storedState: { artifactId: ref.artifactId, mediaType: ref.mediaType, digest, byteCount: 1 },
    applicationProof: { updateRef: ref, receiptRef: ref, receipt: {}, resultGraphRef: ref },
    scope: "approved-architecture-state-activation", lifecycleComplete: false };
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  for (const invalid of [{ ...value, lifecycleComplete: true }, { ...value, approved: true },
    { ...value, applicationProof: {} }, { ...value, gateCommitDigest: "approve" },
    { ...value, storedState: { ...value.storedState, byteCount: -1 } }]) assert.equal(validate(invalid), false);
});
