import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const candidateRoot = new URL(
  "file:///C:/Users/garre/.codex/worktrees/7eeb/DevRelay-v04-work-dependency-analysis/",
);
const adapterSource = await readFile(
  new URL("src/openspec-requirements-adapter.mjs", candidateRoot),
  "utf8",
);
const fixture = JSON.parse(
  await readFile(
    new URL(
      "dogfood/bootstrap-open-spec-requirements-adapter/verification/dr4200-historical-provenance-repair-001/minimized-source-ref-fixture.json",
      candidateRoot,
    ),
    "utf8",
  ),
);

const canonical = (value) =>
  JSON.stringify(value, Object.keys(value ?? {}).sort());
const deepCanonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(deepCanonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${deepCanonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

test("verifier mutation matrix proves whole historical sourceRef identity is field-closed", () => {
  const approved = structuredClone(fixture.historicalSourceRef);
  approved.artifact.schema = "https://devrelay.dev/artifacts/owner-decision/v1";
  approved.artifact.mediaType = "application/vnd.devrelay.owner-decision+json";
  approved.artifact.uri = "artifact://owner-decisions/lifecycle-v1";
  approved.jsonPointer = "/decisions/0";
  const mutations = [
    (v) => {
      v.role = "repository";
    },
    (v) => {
      v.artifact.artifactId += "-mutated";
    },
    (v) => {
      v.artifact.digest = `sha256:${"0".repeat(64)}`;
    },
    (v) => {
      v.artifact.schema += "-mutated";
    },
    (v) => {
      v.artifact.mediaType = "application/json";
    },
    (v) => {
      v.artifact.uri += "-mutated";
    },
    (v) => {
      v.location += " mutated";
    },
    (v) => {
      v.jsonPointer = "/decisions/1";
    },
    (v) => {
      v.injected = true;
    },
    (v) => {
      v.artifact.injected = true;
    },
  ];
  const approvedKey = deepCanonical(approved);
  assert.equal(deepCanonical(structuredClone(approved)), approvedKey);
  for (const mutate of mutations) {
    const changed = structuredClone(approved);
    mutate(changed);
    assert.notEqual(deepCanonical(changed), approvedKey);
  }
  assert.notEqual(
    canonical(approved),
    canonical({ ...approved, injected: true }),
  );
});

test("candidate implementation authorizes canonical whole refs and retains exact base-role pointer restriction", () => {
  assert.match(adapterSource, /target\.add\(canonicalJson\(source\)\)/);
  assert.match(
    adapterSource,
    /approvedHistoricalSourceRefs\.has\(canonicalJson\(source\)\)/,
  );
  assert.match(
    adapterSource,
    /allowedPointers\.has\(key\)\s*&&\s*BASE_PORTS\.includes\(source\.role\)/,
  );
  assert.match(adapterSource, /requirements-baseline/);
  assert.match(adapterSource, /project-overview-baseline/);
  assert.doesNotMatch(adapterSource, /feature-specific-context/);
});
