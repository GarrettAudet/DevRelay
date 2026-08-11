import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateArchitectureArtifact } from "../src/architecture-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/work-item-verification/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

const expected = Object.freeze({
  requirements:
    "sha256:f9ea89ac760902ee1f3285b9816603dd82ecf47c2451a6b4558b51772c939438",
  overview:
    "sha256:5c5a6678356be97ff75a68b357262e1a49b50fe010f4401897fed497b682b886",
  architecture:
    "sha256:08d77bce4e294a4ba25374acc8a338dd0c159cd760577d991000c0efe00d5c1d",
  candidate:
    "sha256:62cf155b41fb9a4d490a2dd6c785d9c195bc63d291e47ff146cbd6b702ad0540",
  gateReview:
    "sha256:d2847e11cebdc42da5839a7ef8c7f2d34d487815d8b031bd77755ea3db006502",
  conformance:
    "sha256:23c5d072179e4a62a19246b7a5cc4a2a26aaf00bcdc691f060861713050f2ba7",
});

test("WorkItemVerification ArchitectureDesign is additive, replayable, and Structurizr-conformant", async () => {
  const output = JSON.parse(execFileSync(
    process.execPath,
    [`${dogfood}materialize.mjs`],
    { cwd: rootPath, encoding: "utf8" },
  ));
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

  const [base, candidate, route, invocation, result, proof, gate, conformance] =
    await Promise.all([
      readJson("project/history/architecture/architecture-baseline-devrelay-v1-work-execution-001/architecture-baseline.json"),
      readJson(`${dogfood}architecture-change-set-draft.json`),
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
  assert.equal(route.selection.operation, "design-change");
  assert.deepEqual(invocation.module, {
    id: "architecture-design",
    version: "0.1.0",
    operation: "design-change",
  });
  assert.equal(result.outcome, "change_set_drafted");
  assert.equal(proof.checkpointCount, 3);
  assert.equal(proof.replayAdapterCalls, 0);
  assert.equal(gate.progressionAllowed, false);
  assert.equal(gate.candidate.digest, expected.candidate);

  assert.equal(await digest(`${dogfood}architecture-change-set-draft.json`), expected.candidate);
  assert.equal(await digest(`${dogfood}architecture-gate-candidate.md`), expected.gateReview);
  assert.equal(await digest(`${dogfood}structurizr-conformance-proof.json`), expected.conformance);

  assert.ok(
    Object.values(candidate.changes).flat().every(({ operation }) => operation === "add"),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(candidate.changes).map(([name, values]) => [name, values.length]),
    ),
    {
      elementChanges: 13,
      relationshipChanges: 11,
      viewChanges: 4,
      interfaceChanges: 9,
      constraintChanges: 12,
      decisionChanges: 5,
    },
  );

  const baseElements = new Map(
    base.sections.architectureModel.content.elements.map((item) => [item.id, item]),
  );
  const targetElements = new Map(
    candidate.sections.architectureModel.content.elements.map((item) => [item.id, item]),
  );
  for (const [id, entity] of baseElements) assert.deepEqual(targetElements.get(id), entity);

  const newElements = candidate.sections.architectureModel.content.elements.filter(
    ({ id }) => id.startsWith("EL-WIV-"),
  );
  assert.equal(newElements.length, 13);
  assert.deepEqual(
    newElements.filter(({ type }) => type === "container").map(({ id, parentId }) => [id, parentId]),
    [["EL-WIV-MODULE", "EL-DEVRELAY-SYSTEM"]],
  );
  assert.ok(
    newElements.filter(({ type }) => type === "component").every(({ parentId }) =>
      ["EL-WIV-MODULE", "EL-DEVRELAY-CORE", "EL-DEVRELAY-GRAPH"].includes(parentId),
    ),
  );

  assert.deepEqual(
    candidate.sections.interfaceIntent.content.interfaces
      .filter(({ id }) => id.startsWith("IF-WIV-"))
      .map(({ id }) => id),
    [
      "IF-WIV-INPUT-BINDING",
      "IF-WIV-OBLIGATION-SET",
      "IF-WIV-VERIFIER-BINDING",
      "IF-WIV-VERIFIER-INVOCATION",
      "IF-WIV-EVIDENCE-NORMALIZATION",
      "IF-WIV-POLICY-EVALUATION",
      "IF-WIV-GATE-CANDIDATE",
      "IF-WIV-CANDIDATE-TRACEABILITY",
      "IF-WIV-APPROVED-TRACEABILITY",
    ],
  );

  for (const requirementId of [
    "US-DEV-WORK-ITEM-VERIFICATION-001",
    "NFR-DEV-WIV-DETERMINISM-001",
    "NFR-DEV-WIV-EVIDENCE-CLOSURE-001",
    "NFR-DEV-WIV-ISOLATION-001",
    "CON-DEV-WIV-AUTHORITY-001",
    "CON-DEV-WIV-EXACT-SUBJECT-001",
    "CON-DEV-WIV-IMMUTABLE-ATTEMPT-001",
    "CON-DEV-WIV-NO-INTEGRATION-001",
    "CON-DEV-WIV-HOST-ENFORCEMENT-001",
  ]) {
    const coverage = candidate.traceability.find((entry) => entry.requirementId === requirementId);
    assert.equal(coverage.disposition, "designed");
    assert.ok(coverage.targets.some(({ id }) => id.startsWith("EL-WIV-") || id === "TD-WIV-001"));
  }

  assert.equal(conformance.status, "pass");
  assert.equal(conformance.parser.product, "Structurizr");
  assert.ok(Object.values(conformance.comparison).every(({ match }) => match));
  assert.equal(conformance.comparison.elements.count, 76);
  assert.equal(conformance.comparison.relationships.count, 74);
  assert.equal(conformance.comparison.views.count, 22);

  assert.match(candidate.sections.technicalDesign.content.solutionSummary, /Gate alone approve progression to ChangeIntegration/i);
  assert.doesNotMatch(candidate.sections.technicalDesign.content.solutionSummary, /integrated-completion fact/i);
});
