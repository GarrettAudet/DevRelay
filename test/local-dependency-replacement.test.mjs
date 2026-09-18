import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url)));
const dependencies = [read("desktop-local-host-configuration.schema.json"), read("module-result.schema.json")];
const validate = compileArtifactSchema(read("desktop-dependency-context-submission-v2.schema.json"), dependencies);
const validateInitial = compileArtifactSchema(read("desktop-dependency-context-submission.schema.json"), dependencies);

test("Desktop dependency replacement v2 requires explicit predecessor file and preserves initial v1", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const file = { path: "baseline.json", ref: { artifactId: "fixture", schema: "https://devrelay.dev/artifacts/work-dependency-baseline/v1", mediaType: "application/vnd.devrelay.work-dependency-baseline+json", digest, uri: "artifact://fixture" } };
  const body = { kind: "DesktopDependencyReplacementContextSubmission", activationDigest: digest, createdAt: "2026-09-19T00:00:00Z", contextSliceSet: file, policyBundle: file, currentWorkDependencyBaseline: file, artifacts: [] };
  assert.equal(validate(body), true);
  assert.equal(validateInitial(body), false);
  for (const key of Object.keys(body)) { const invalid = { ...body }; delete invalid[key]; assert.equal(validate(invalid), false, key); }
  for (const patch of [{ extra: true }, { kind: "DesktopDependencyContextSubmission" }, { kind: "DesktopDependencyReplacementContextSubmissionV99" }, { currentWorkDependencyBaseline: file.ref }, { currentWorkDependencyBaseline: { ref: file.ref } }, { currentWorkDependencyBaseline: null }, { operation: "analyze-dependencies" }]) {
    assert.equal(validate({ ...body, ...patch }), false);
  }
  const { currentWorkDependencyBaseline, ...initial } = { ...body, kind: "DesktopDependencyContextSubmission" };
  assert.equal(validateInitial(initial), true);
  assert.equal(validate(initial), false);
  assert.equal(validateInitial({ ...initial, currentWorkDependencyBaseline }), false);
});
