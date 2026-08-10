import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateArchitectureArtifact } from "../src/architecture-artifact-validator.mjs";
import { normativeRequirementIds } from "../src/requirements-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const dogfood = "dogfood/lifecycle-run-report/architecture-design/";
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readText = (relativePath) => readFile(new URL(relativePath, root), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

test("LifecycleRunReport ArchitectureDesign dogfood produces one low-churn, replayable, Structurizr-conformant gate candidate", async () => {
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
    architectureChangeSetDigest: output.architectureChangeSetDigest,
    architectureGateReviewDigest: output.architectureGateReviewDigest,
    structurizrConformanceProofDigest:
      output.structurizrConformanceProofDigest,
    progressionAllowed: false,
  });

  const [
    requirements,
    baseline,
    state,
    route,
    invocation,
    result,
    candidate,
    proof,
    gate,
    conformance,
  ] = await Promise.all([
    readJson("project/history/1.2.0/requirements-baseline.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json"),
    readJson(`${dogfood}project-architecture-state.json`),
    readJson(`${dogfood}module-route-decision.json`),
    readJson(`${dogfood}architecture-design.invocation.json`),
    readJson(`${dogfood}architecture-design.result.json`),
    readJson(`${dogfood}architecture-change-set-draft.json`),
    readJson(`${dogfood}runtime-execution-proof.json`),
    readJson(`${dogfood}architecture-gate-candidate.json`),
    readJson(`${dogfood}structurizr-conformance-proof.json`),
  ]);

  validateArchitectureArtifact(candidate);
  assert.equal(state.state, "baselined");
  assert.equal(route.selection.operation, "design-change");
  assert.deepEqual(invocation.module, {
    id: "architecture-design",
    version: "0.1.0",
    operation: "design-change",
  });
  assert.equal(
    invocation.inputs["architecture-baseline-project-context"][0].digest,
    baseline.projectContext.digest,
  );
  assert.equal(
    invocation.inputs["architecture-baseline-repository-snapshot"][0].digest,
    baseline.repositorySnapshot.digest,
  );
  assert.notEqual(
    invocation.inputs["project-context"][0].digest,
    baseline.projectContext.digest,
  );
  assert.notEqual(
    invocation.inputs["repository-snapshot"][0].digest,
    baseline.repositorySnapshot.digest,
  );

  const candidateDigest = await digest(`${dogfood}architecture-change-set-draft.json`);
  const conformanceDigest = await digest(`${dogfood}structurizr-conformance-proof.json`);
  assert.equal(output.architectureChangeSetDigest, candidateDigest);
  assert.equal(output.structurizrConformanceProofDigest, conformanceDigest);
  assert.equal(result.outputs["architecture-change-set-draft"][0].digest, candidateDigest);
  assert.equal(proof.architectureChangeSetDigest, candidateDigest);
  assert.equal(gate.candidate.digest, candidateDigest);
  assert.equal(gate.exactBindings.StructurizrConformanceProof, conformanceDigest);
  assert.equal(gate.status, "awaiting-approval");
  assert.equal(gate.progressionAllowed, false);

  assert.equal(conformance.status, "pass");
  assert.equal(conformance.parser.product, "Structurizr");
  assert.equal(conformance.parser.version, "2026.06.28");
  assert.equal(conformance.inputs.candidateDigest, candidateDigest);
  assert.ok(Object.values(conformance.comparison).every(({ match }) => match));
  assert.equal(conformance.comparison.elements.count, 33);
  assert.equal(conformance.comparison.relationships.count, 35);
  assert.equal(conformance.comparison.views.count, 6);

  const model = candidate.sections.architectureModel.content;
  const byElementId = new Map(model.elements.map((item) => [item.id, item]));
  assert.deepEqual(
    {
      type: byElementId.get("EL-RUN-REPORTING").type,
      parentId: byElementId.get("EL-RUN-REPORTING").parentId,
    },
    { type: "container", parentId: "EL-DEVRELAY-SYSTEM" },
  );
  for (const element of model.elements) {
    if (element.type === "container") {
      assert.equal(byElementId.get(element.parentId).type, "software-system");
    }
    if (element.type === "component") {
      assert.equal(byElementId.get(element.parentId).type, "container");
    }
  }
  assert.deepEqual(
    model.elements
      .filter(({ parentId }) => parentId === "EL-RUN-REPORTING")
      .map(({ id }) => id)
      .sort(),
    [
      "EL-RUN-COMPARABILITY",
      "EL-RUN-CONTENT-POLICY",
      "EL-RUN-LEDGER",
      "EL-RUN-MARKDOWN-RENDERER",
      "EL-RUN-MATURITY-RESOLVER",
      "EL-RUN-OBSERVATION-INGRESS",
      "EL-RUN-REPORT-PORT",
      "EL-RUN-SNAPSHOT-PROJECTOR",
    ],
  );

  const views = candidate.sections.diagrams.content.views;
  for (const view of views) {
    for (const elementId of view.elementIds) {
      const element = byElementId.get(elementId);
      assert.equal(element.type, view.type);
      if (view.type === "component") {
        assert.equal(element.parentId, view.scopeElementId);
      }
    }
  }

  const changeCollections = Object.values(candidate.changes);
  assert.ok(changeCollections.every((changes) =>
    changes.every(({ operation }) => operation === "add")
  ));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(candidate.changes).map(([key, changes]) => [key, changes.length]),
    ),
    {
      elementChanges: 12,
      relationshipChanges: 15,
      viewChanges: 3,
      interfaceChanges: 8,
      constraintChanges: 10,
      decisionChanges: 7,
    },
  );

  for (const [sectionName, key] of [
    ["architectureModel", "elements"],
    ["architectureModel", "relationships"],
    ["diagrams", "views"],
    ["interfaceIntent", "interfaces"],
    ["architectureConstraints", "constraints"],
    ["decisionRecords", "decisions"],
  ]) {
    const target = new Map(
      candidate.sections[sectionName].content[key].map((item) => [
        item.id ?? item.viewKey,
        item,
      ]),
    );
    for (const existing of baseline.sections[sectionName].content[key]) {
      assert.deepEqual(target.get(existing.id ?? existing.viewKey), existing);
    }
  }

  const newInterfaces = candidate.sections.interfaceIntent.content.interfaces
    .filter(({ id }) => id.startsWith("IF-RUN-"));
  assert.equal(newInterfaces.length, 8);
  assert.ok(newInterfaces.every(({ contractGeneration }) =>
    contractGeneration.required === true
      && JSON.stringify(contractGeneration.suggestedKinds) === '["json-schema"]'
  ));
  assert.deepEqual(
    newInterfaces.map(({ id }) => id).sort(),
    [
      "IF-RUN-COMPARABILITY",
      "IF-RUN-CONTENT-POLICY",
      "IF-RUN-HOST-OBSERVATIONS",
      "IF-RUN-INTEGRATED-COMPLETION",
      "IF-RUN-LIFECYCLE-SNAPSHOT",
      "IF-RUN-READY-FRONTIER",
      "IF-RUN-REPORT-ACCESS",
      "IF-RUN-WORKFLOW-FACTS",
    ],
  );

  const constraints = new Map(
    candidate.sections.architectureConstraints.content.constraints.map((item) => [
      item.id,
      item,
    ]),
  );
  assert.match(constraints.get("CON-RUN-NON-AUTHORITY").statement, /cannot route|cannot approve/i);
  assert.match(constraints.get("CON-RUN-STATIC-DAG").statement, /immutable/);
  assert.match(constraints.get("CON-RUN-CROSS-CUTTING").statement, /cannot appear as additional lifecycle stages/);

  const relationships = new Map(model.relationships.map((item) => [item.id, item]));
  assert.deepEqual(
    [
      relationships.get("REL-RUN-DAG-FRONTIER").sourceElementId,
      relationships.get("REL-RUN-DAG-FRONTIER").targetElementId,
    ],
    ["EL-WDA-MODULE", "EL-RUN-FRONTIER-RESOLVER"],
  );
  assert.deepEqual(
    [
      relationships.get("REL-RUN-INTEGRATION-COMPLETION").sourceElementId,
      relationships.get("REL-RUN-INTEGRATION-COMPLETION").targetElementId,
    ],
    ["EL-WB-DOWNSTREAM", "EL-RUN-COMPLETION-REGISTRY"],
  );

  assert.deepEqual(
    candidate.traceability.map(({ requirementId }) => requirementId),
    normativeRequirementIds(requirements.requirements),
  );
  assert.ok(candidate.traceability.every(({ targets }) => targets.length > 0));
  assert.ok(candidate.traceability.some(({ disposition }) =>
    disposition === "already-designed"
  ));

  const gateReview = await readText(`${dogfood}architecture-gate-candidate.md`);
  assert.ok(gateReview.includes(candidateDigest));
  assert.ok(gateReview.includes(conformanceDigest));
  assert.ok(gateReview.includes("Status: **awaiting owner approval**"));
  assert.ok(gateReview.includes("all eight new structured interfaces require ContractGeneration"));
  assert.ok(gateReview.includes("reporting remains cross-cutting"));
});
