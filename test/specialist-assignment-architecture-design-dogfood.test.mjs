import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateArchitectureArtifact } from "../src/architecture-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/specialist-assignment/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

const expected = Object.freeze({
  requirements:
    "sha256:999f98d84439bc3115512e43a8b4ab33f39ff38353d9ed24f11cdd7205708435",
  overview:
    "sha256:0dd0524534586957b595d6a92b6e410002f2a88f95ee37ae13301b5dfacbe762",
  architecture:
    "sha256:62a637f33635671295f730ff7e49bd69442d7721968e0bd5ad7be1c6801b9231",
  candidate:
    "sha256:167b12cb3fdd758e73f84c78b5b6e597d056a691cf247263c995771f237bbf69",
  gateReview:
    "sha256:18f0eaa10a810bcf0591bfb068205e6b13285ca49758aa9a1666e84613b82203",
  conformance:
    "sha256:0be6cc031f117dab50c17f6ab346e2538335c8432fe6785fe6a9520b9cbd2dcb",
});

test("SpecialistAssignment ArchitectureDesign yields one additive replayable Structurizr-conformant Gate candidate", async () => {
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [`${dogfood}materialize.mjs`],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
  assert.deepEqual(output, {
    status: "ARCHITECTURE_GATE_CANDIDATE",
    operation: "design-change",
    routeReasonCode: "BASELINE_REQUIRES_CHANGE_DESIGN",
    adapters: ["openspec-design", "structurizr", "madr"],
    checkpointCount: 3,
    replayAdapterCalls: 0,
    architectureChangeSetDigest: expected.candidate,
    architectureGateReviewDigest: expected.gateReview,
    structurizrConformanceProofDigest: expected.conformance,
    progressionAllowed: false,
  });

  const [
    base,
    candidate,
    state,
    route,
    invocation,
    result,
    proof,
    gate,
    conformance,
  ] = await Promise.all([
    readJson(
      "project/history/architecture/architecture-baseline-devrelay-v1-contract-generation-001/architecture-baseline.json",
    ),
    readJson(`${dogfood}architecture-change-set-draft.json`),
    readJson(`${dogfood}project-architecture-state.json`),
    readJson(`${dogfood}module-route-decision.json`),
    readJson(`${dogfood}architecture-design.invocation.json`),
    readJson(`${dogfood}architecture-design.result.json`),
    readJson(`${dogfood}runtime-execution-proof.json`),
    readJson(`${dogfood}architecture-gate-candidate.json`),
    readJson(`${dogfood}structurizr-conformance-proof.json`),
  ]);

  validateArchitectureArtifact(candidate);
  assert.equal(candidate.baseArchitectureBaseline.digest, expected.architecture);
  assert.equal(candidate.targetRequirementsBaseline.digest, expected.requirements);
  assert.equal(candidate.targetProjectOverviewBaseline.digest, expected.overview);
  assert.equal(state.state, "baselined");
  assert.equal(route.selection.operation, "design-change");
  assert.deepEqual(invocation.module, {
    id: "architecture-design",
    version: "0.1.0",
    operation: "design-change",
  });
  assert.equal(result.outcome, "change_set_drafted");
  assert.equal(proof.checkpointCount, 3);
  assert.equal(proof.replayAdapterCalls, 0);

  assert.equal(
    await digest(`${dogfood}architecture-change-set-draft.json`),
    expected.candidate,
  );
  assert.equal(
    await digest(`${dogfood}architecture-gate-candidate.md`),
    expected.gateReview,
  );
  assert.equal(
    await digest(`${dogfood}structurizr-conformance-proof.json`),
    expected.conformance,
  );
  assert.equal(gate.candidate.digest, expected.candidate);
  assert.equal(gate.reviewDigest, expected.gateReview);
  assert.equal(gate.progressionAllowed, false);

  const changeCollections = Object.values(candidate.changes);
  assert.ok(changeCollections.flat().every(({ operation }) => operation === "add"));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(candidate.changes).map(([key, values]) => [key, values.length]),
    ),
    {
      elementChanges: 10,
      relationshipChanges: 10,
      viewChanges: 4,
      interfaceChanges: 6,
      constraintChanges: 8,
      decisionChanges: 5,
    },
  );

  const targetModel = candidate.sections.architectureModel.content;
  const baseElements = new Map(
    base.sections.architectureModel.content.elements.map((item) => [item.id, item]),
  );
  const targetElements = new Map(targetModel.elements.map((item) => [item.id, item]));
  for (const [id, entity] of baseElements) {
    assert.deepEqual(targetElements.get(id), entity);
  }
  const newElements = targetModel.elements.filter(({ id }) => id.startsWith("EL-SA-"));
  assert.equal(newElements.length, 10);
  assert.deepEqual(
    newElements
      .filter(({ type }) => type === "container")
      .map(({ id, parentId }) => [id, parentId]),
    [["EL-SA-MODULE", "EL-DEVRELAY-SYSTEM"]],
  );
  assert.ok(
    newElements
      .filter(({ type }) => type === "component")
      .every(({ parentId }) =>
        ["EL-SA-MODULE", "EL-DEVRELAY-CORE", "EL-DEVRELAY-GRAPH"].includes(
          parentId,
        ),
      ),
  );

  const newInterfaces = candidate.sections.interfaceIntent.content.interfaces
    .filter(({ id }) => id.startsWith("IF-SA-"))
    .map(({ id }) => id);
  assert.deepEqual(newInterfaces, [
    "IF-SA-RANKER-INVOCATION",
    "IF-SA-ELIGIBILITY-EVALUATION",
    "IF-SA-CANDIDATE-ASSEMBLY",
    "IF-SA-GATE-CANDIDATE",
    "IF-SA-CANDIDATE-TRACEABILITY",
    "IF-SA-APPROVED-TRACEABILITY",
  ]);
  const requiredInterfaces = candidate.sections.interfaceIntent.content.interfaces.filter(
    ({ contractGeneration }) => contractGeneration.required,
  );
  assert.equal(requiredInterfaces.length, 20);
  assert.ok(
    requiredInterfaces.every(({ contractGeneration }) =>
      contractGeneration.suggestedKinds.includes("json-schema"),
    ),
  );

  for (const requirementId of [
    "US-DEV-SPECIALIST-ASSIGNMENT-001",
    "NFR-DEV-SA-DETERMINISM-001",
    "CON-DEV-SA-AUTHORITY-001",
    "CON-DEV-SA-ONE-PROFILE-001",
    "CON-DEV-SA-EXECUTION-BARRIER-001",
  ]) {
    const coverage = candidate.traceability.find(
      (entry) => entry.requirementId === requirementId,
    );
    assert.equal(coverage.disposition, "designed");
    assert.ok(coverage.targets.some(({ id }) => id.startsWith("EL-SA-") || id === "TD-SA-001"));
  }
  assert.deepEqual(
    candidate.traceability.find(
      ({ requirementId }) => requirementId === "US-DEV-SPECIFY-001",
    ).targets,
    [{ kind: "element", id: "EL-WB-MODULE" }],
  );
  assert.deepEqual(
    candidate.traceability.find(
      ({ requirementId }) => requirementId === "NFR-DEV-DETERMINISM-001",
    ).targets,
    [{ kind: "element", id: "EL-DEVRELAY-CORE" }],
  );

  assert.equal(conformance.status, "pass");
  assert.equal(conformance.parser.product, "Structurizr");
  assert.ok(Object.values(conformance.comparison).every(({ match }) => match));
  assert.equal(conformance.comparison.elements.count, 53);
  assert.equal(conformance.comparison.relationships.count, 55);
  assert.equal(conformance.comparison.views.count, 14);
});
