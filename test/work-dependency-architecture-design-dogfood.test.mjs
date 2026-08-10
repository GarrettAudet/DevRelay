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
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readText = (relativePath) => readFile(new URL(relativePath, root), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

test("WorkDependencyAnalysis ArchitectureDesign dogfood produces one replayable, Structurizr-conformant gate candidate", async () => {
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      ["dogfood/work-dependency-analysis/architecture-design/materialize.mjs"],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
  assert.deepEqual(output.adapters, ["openspec-design", "structurizr", "madr"]);
  assert.equal(output.operation, "design-change");
  assert.equal(output.routeReasonCode, "BASELINE_REQUIRES_CHANGE_DESIGN");
  assert.equal(output.checkpointCount, 3);
  assert.equal(output.replayAdapterCalls, 0);

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
    readJson("project/history/1.1.0/requirements-baseline.json"),
    readJson("dogfood/work-breakdown/architecture-design/architecture-baseline.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/project-architecture-state.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/module-route-decision.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-design.invocation.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-design.result.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-change-set-draft.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/runtime-execution-proof.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-gate-candidate.json"),
    readJson("dogfood/work-dependency-analysis/architecture-design/structurizr-conformance-proof.json"),
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

  const candidateDigest = await digest(
    "dogfood/work-dependency-analysis/architecture-design/architecture-change-set-draft.json",
  );
  const conformanceDigest = await digest(
    "dogfood/work-dependency-analysis/architecture-design/structurizr-conformance-proof.json",
  );
  assert.equal(output.architectureChangeSetDigest, candidateDigest);
  assert.equal(output.structurizrConformanceProofDigest, conformanceDigest);
  assert.equal(result.outputs["architecture-change-set-draft"][0].digest, candidateDigest);
  assert.equal(proof.architectureChangeSetDigest, candidateDigest);
  assert.equal(gate.candidate.digest, candidateDigest);
  assert.equal(
    gate.exactBindings.StructurizrConformanceProof,
    conformanceDigest,
  );
  assert.equal(gate.status, "awaiting-approval");
  assert.equal(gate.progressionAllowed, false);

  assert.equal(conformance.status, "pass");
  assert.equal(conformance.parser.product, "Structurizr");
  assert.equal(conformance.parser.version, "2026.06.28");
  assert.equal(conformance.inputs.candidateDigest, candidateDigest);
  assert.ok(
    Object.values(conformance.comparison).every(({ match }) => match === true),
  );
  assert.equal(conformance.comparison.elements.count, 21);
  assert.equal(conformance.comparison.relationships.count, 20);
  assert.equal(conformance.comparison.views.count, 3);

  const model = candidate.sections.architectureModel.content;
  const byElementId = new Map(model.elements.map((item) => [item.id, item]));
  assert.equal(byElementId.has("EL-DEVRELAY-MODULES"), false);
  assert.deepEqual(
    {
      type: byElementId.get("EL-WDA-MODULE").type,
      parentId: byElementId.get("EL-WDA-MODULE").parentId,
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
      .filter(({ parentId }) => parentId === "EL-DEVRELAY-CORE")
      .map(({ id }) => id)
      .sort(),
    [
      "EL-WB-PREFLIGHT",
      "EL-WDA-CONTRIBUTOR",
      "EL-WDA-GATE",
      "EL-WDA-GRAPH-MECHANICS",
      "EL-WDA-OPA",
      "EL-WDA-SNAPSHOT",
    ],
  );
  assert.deepEqual(
    model.elements
      .filter(({ parentId }) => parentId === "EL-WDA-MODULE")
      .map(({ id }) => id)
      .sort(),
    [
      "EL-WDA-NATIVE-PROPOSER",
      "EL-WDA-OPTIONAL-PROPOSERS",
      "EL-WDA-PROPOSER-PORT",
      "EL-WDA-SPECKIT-REVIEWER",
    ],
  );

  const views = candidate.sections.diagrams.content.views;
  assert.deepEqual(
    views.map(({ viewKey }) => viewKey).sort(),
    [
      "VIEW-WDA-CONTAINERS",
      "VIEW-WDA-CORE-COMPONENTS",
      "VIEW-WDA-MODULE-COMPONENTS",
    ],
  );
  for (const view of views) {
    for (const elementId of view.elementIds) {
      const element = byElementId.get(elementId);
      assert.equal(element.type, view.type);
      if (view.type === "component") {
        assert.equal(element.parentId, view.scopeElementId);
      }
    }
  }

  assert.deepEqual(
    candidate.traceability.map(({ requirementId }) => requirementId),
    normativeRequirementIds(requirements.requirements),
  );
  assert.ok(candidate.traceability.every(({ targets }) => targets.length > 0));
  assert.ok(
    candidate.traceability.some(
      ({ disposition }) => disposition === "already-designed",
    ),
  );
  assert.ok(
    candidate.traceability.some(({ disposition }) => disposition === "designed"),
  );

  assert.equal(
    candidate.changes.elementChanges.some(
      ({ operation }) => operation === "modify",
    ),
    false,
  );
  assert.equal(
    candidate.changes.relationshipChanges.some(
      ({ operation }) => operation === "modify",
    ),
    false,
  );
  assert.equal(candidate.changes.interfaceChanges.every(
    ({ operation }) => operation === "add",
  ), true);
  assert.equal(candidate.changes.constraintChanges.every(
    ({ operation }) => operation === "add",
  ), true);
  assert.equal(candidate.changes.decisionChanges.length, 5);
  assert.equal(candidate.changes.decisionChanges.every(
    ({ operation }) => operation === "add",
  ), true);

  const targetElements = new Map(model.elements.map((item) => [item.id, item]));
  for (const baselineElement of baseline.sections.architectureModel.content.elements) {
    if (baselineElement.id === "EL-DEVRELAY-MODULES") continue;
    assert.deepEqual(targetElements.get(baselineElement.id), baselineElement);
  }
  const targetInterfaces = new Map(
    candidate.sections.interfaceIntent.content.interfaces.map((item) => [
      item.id,
      item,
    ]),
  );
  for (const baselineInterface of baseline.sections.interfaceIntent.content.interfaces) {
    assert.deepEqual(targetInterfaces.get(baselineInterface.id), baselineInterface);
  }

  const gateReview = await readText(
    "dogfood/work-dependency-analysis/architecture-design/architecture-gate-candidate.md",
  );
  assert.ok(gateReview.includes(candidateDigest));
  assert.ok(gateReview.includes(conformanceDigest));
  assert.ok(gateReview.includes("Status: **awaiting owner approval**"));
  assert.ok(gateReview.includes("official Structurizr 2026.06.28 binary"));
  assert.equal(gateReview.includes("no OpenSpec, Structurizr, or MADR CLI was invoked"), false);
});
