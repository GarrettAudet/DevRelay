import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateArchitectureArtifact } from "../src/architecture-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/contract-generation/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

const expected = Object.freeze({
  requirements:
    "sha256:cd07170d8ea48ba98a1c4f45d30ade2e83992e0fd4433cb049fbf0af7c34e8cb",
  overview:
    "sha256:c440350f162c530a0180661ad7f6812551d0a184298f256a52239e5b2e9de699",
  architecture:
    "sha256:a2bc5b38377337dbc6e86eb45821b9fab4eca4be044693944442c6c45153fa29",
  candidate:
    "sha256:c410dd4888d660a9467d964dc447b588aac4d21290dc8045bd7b74c2f79c683c",
  gateReview:
    "sha256:05cb58bf31b3e8884456d8f13c2416bce50c8577654bbaaf6e73990520eed3e4",
  conformance:
    "sha256:e50aaab16f6a807916acddd641e5c9983db6b20138abf15852682678d0f29e29",
});

test("ContractGeneration ArchitectureDesign yields one additive replayable Structurizr-conformant Gate candidate", async () => {
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
    readJson("project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json"),
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
  const newElements = targetModel.elements.filter(({ id }) => id.startsWith("EL-CG-"));
  assert.equal(newElements.length, 10);
  assert.deepEqual(
    newElements
      .filter(({ type }) => type === "container")
      .map(({ id, parentId }) => [id, parentId]),
    [["EL-CG-MODULE", "EL-DEVRELAY-SYSTEM"]],
  );
  assert.ok(
    newElements
      .filter(({ type }) => type === "component")
      .every(({ parentId }) =>
        ["EL-CG-MODULE", "EL-DEVRELAY-CORE", "EL-DEVRELAY-GRAPH"].includes(
          parentId,
        ),
      ),
  );

  const newInterfaces = candidate.sections.interfaceIntent.content.interfaces
    .filter(({ id }) => id.startsWith("IF-CG-"))
    .map(({ id }) => id);
  assert.deepEqual(newInterfaces, [
    "IF-CG-GENERATOR-INVOCATION",
    "IF-CG-FORMAT-VALIDATION",
    "IF-CG-CANONICAL-DIFF",
    "IF-CG-GATE-CANDIDATE",
    "IF-CG-CANDIDATE-TRACEABILITY",
    "IF-CG-APPROVED-TRACEABILITY",
  ]);
  const requiredInterfaces = candidate.sections.interfaceIntent.content.interfaces.filter(
    ({ contractGeneration }) => contractGeneration.required,
  );
  assert.equal(requiredInterfaces.length, 14);
  assert.ok(
    requiredInterfaces.every(({ contractGeneration }) =>
      contractGeneration.suggestedKinds.includes("json-schema"),
    ),
  );

  for (const requirementId of [
    "US-DEV-CONTRACT-GENERATION-001",
    "NFR-DEV-CONTRACT-DETERMINISM-001",
    "CON-DEV-CONTRACT-AUTHORITY-001",
    "CON-DEV-CONTRACT-FORMAT-EXTENSION-001",
    "CON-DEV-CONTRACT-WORK-BREAKDOWN-BARRIER-001",
  ]) {
    const coverage = candidate.traceability.find(
      (entry) => entry.requirementId === requirementId,
    );
    assert.equal(coverage.disposition, "designed");
    assert.ok(coverage.targets.some(({ id }) => id.startsWith("EL-CG-") || id === "TD-CG-001"));
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
  assert.equal(conformance.comparison.elements.count, 43);
  assert.equal(conformance.comparison.relationships.count, 45);
  assert.equal(conformance.comparison.views.count, 10);
});
