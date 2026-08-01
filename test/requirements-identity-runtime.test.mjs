import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [draftFixture, baselineFixture] = await Promise.all([
  readJson("examples/artifacts/requirements-draft-001.json"),
  readJson("examples/artifacts/requirements-baseline-001.json"),
]);

function contractFor(contracts, schema) {
  const contract = contracts.find((candidate) => candidate.schema === schema);
  assert.ok(contract, `missing runtime contract ${schema}`);
  return contract;
}

test("runtime rejects the frozen duplicate-requirement draft repro", async () => {
  const draft = structuredClone(draftFixture);
  const duplicate = structuredClone(draft.requirements.userStories[0]);
  duplicate.need = "A conflicting story under the same stable ID.";
  draft.requirements.userStories.push(duplicate);

  const goalRef = draft.baseInputs.find(({ role }) => role === "goal").artifact;
  const projectContextRef = draft.baseInputs.find(
    ({ role }) => role === "project-context",
  ).artifact;
  const contract = contractFor(
    requirementsRuntimeArtifactContracts(),
    "https://devrelay.dev/artifacts/requirements-draft/v1",
  );

  await assert.rejects(
    contract.validate(draft, {
      phase: "output",
      loadedInputs: {
        goal: [{ ref: goalRef }],
        "project-context": [
          { ref: projectContextRef, value: { lifecycle: "existing" } },
        ],
      },
      loadedArtifacts: {},
    }),
    /userStories must be strictly lexically sorted with no duplicates/,
  );
});

test("architecture composition rejects a duplicate-ID requirements baseline input", async () => {
  const baseline = structuredClone(baselineFixture);
  const duplicate = structuredClone(baseline.requirements.userStories[0]);
  duplicate.need =
    "A conflicting approved story under the same stable ID.";
  baseline.requirements.userStories.push(duplicate);

  const contract = contractFor(
    architectureRuntimeArtifactContracts(),
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
  );
  await assert.rejects(
    contract.validate(baseline, {
      phase: "input",
      loadedInputs: {},
      loadedArtifacts: {},
    }),
    /userStories must be strictly lexically sorted with no duplicates/,
  );
});
