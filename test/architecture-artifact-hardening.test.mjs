import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArchitectureArtifactValidationError,
  validateArchitectureArtifact,
  validateArchitectureChangeSetAgainstBaseline,
  validateArchitectureChangeSetAgainstState,
  validateArchitectureDiscoveryHandoff,
  validateArchitectureDraftAgainstState,
} from "../src/architecture-artifact-validator.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const artifactNames = [
  "project-architecture-state-greenfield-001.json",
  "project-architecture-state-existing-undiscovered-001.json",
  "project-architecture-state-existing-discovered-001.json",
  "project-architecture-state-baselined-001.json",
  "current-architecture-snapshot-001.json",
  "architecture-baseline-001.json",
  "architecture-draft-001.json",
  "architecture-change-set-draft-001.json",
  "architecture-designer-working-001.json",
  "architecture-modeler-working-001.json",
  "architecture-clarification-request-001.json",
  "architecture-clarification-response-001.json",
  "architecture-continuation-001.json",
];

const artifacts = new Map(
  await Promise.all(
    artifactNames.map(async (name) => [
      name,
      await readJson(`examples/artifacts/${name}`),
    ]),
  ),
);

const get = (name) => artifacts.get(name);
const clone = (value) => structuredClone(value);

function expectArtifactError(value, options) {
  assert.throws(
    () => validateArchitectureArtifact(value, options),
    ArchitectureArtifactValidationError,
  );
}

function collectResourceIds(value, ids = []) {
  if (!value || typeof value !== "object") {
    return ids;
  }
  if (typeof value.$id === "string") {
    ids.push(value.$id);
  }
  for (const nested of Object.values(value)) {
    collectResourceIds(nested, ids);
  }
  return ids;
}

test("every canonical ArchitectureDesign artifact fixture validates", () => {
  for (const [name, artifact] of artifacts) {
    assert.equal(
      validateArchitectureArtifact(artifact),
      artifact,
      `${name} did not validate`,
    );
  }
});

test("artifact schema resource identifiers remain globally unique", async () => {
  const schemas = await Promise.all(
    [
      "contracts/requirements-gathering-artifacts.schema.json",
      "contracts/shared-artifacts.schema.json",
      "contracts/architecture-design-artifacts.schema.json",
    ].map(readJson),
  );
  const ids = schemas.flatMap((schema) => collectResourceIds(schema));
  assert.equal(new Set(ids).size, ids.length);
});

test("project architecture state is a closed deterministic union", () => {
  const contradictory = clone(
    get("project-architecture-state-greenfield-001.json"),
  );
  contradictory.architectureBaseline = clone(
    get("project-architecture-state-baselined-001.json")
      .architectureBaseline,
  );
  expectArtifactError(contradictory);

  const incomplete = clone(
    get("project-architecture-state-existing-discovered-001.json"),
  );
  delete incomplete.currentArchitectureSnapshot;
  expectArtifactError(incomplete);
});

test("discovery binds pre-state while post-state points to the snapshot", () => {
  const preState = get(
    "project-architecture-state-existing-undiscovered-001.json",
  );
  const postState = get(
    "project-architecture-state-existing-discovered-001.json",
  );
  const snapshot = get("current-architecture-snapshot-001.json");

  assert.equal(
    validateArchitectureDiscoveryHandoff({
      projectArchitectureState: preState,
      projectArchitectureStateRef: snapshot.projectArchitectureState,
      currentArchitectureSnapshot: snapshot,
    }).currentArchitectureSnapshot,
    snapshot,
  );
  assert.notEqual(
    snapshot.projectArchitectureState.artifactId,
    postState.stateId,
  );
  assert.equal(
    postState.currentArchitectureSnapshot.artifactId,
    snapshot.snapshotId,
  );
});

test("draft has exactly seven embedded-or-attached composite sections", () => {
  const draft = get("architecture-draft-001.json");
  assert.deepEqual(Object.keys(draft.sections).sort(), [
    "architectureConstraints",
    "architectureModel",
    "decisionRecords",
    "diagrams",
    "interfaceIntent",
    "nativeArtifacts",
    "technicalDesign",
  ]);

  const attached = clone(draft);
  const content = attached.sections.technicalDesign.content;
  attached.sections.technicalDesign = {
    mode: "attached",
    contentId: content.technicalDesignId,
    artifact: {
      artifactId: "technical-design-auth-001",
      schema: "https://devrelay.dev/artifacts/technical-design/v1",
      mediaType: "application/vnd.devrelay.technical-design+json",
      digest: canonicalJsonDigest(content),
      uri: "file:///workspace/.devrelay/artifacts/technical-design-auth-001.json",
    },
  };
  assert.equal(validateArchitectureArtifact(attached), attached);
  assert.equal(
    validateArchitectureArtifact(attached, {
      resolveAttached() {
        return content;
      },
    }),
    attached,
  );

  const stale = clone(content);
  stale.objective = "Different bytes";
  expectArtifactError(attached, {
    resolveAttached() {
      return stale;
    },
  });
});

test("canonical technical and interface design excludes detailed API schemas", () => {
  const withOpenApi = clone(get("architecture-draft-001.json"));
  withOpenApi.sections.technicalDesign.content.openApi = {
    openapi: "3.1.0",
  };
  expectArtifactError(withOpenApi);

  const withEndpoint = clone(get("architecture-draft-001.json"));
  withEndpoint.sections.interfaceIntent.content.interfaces[0].endpoint =
    "/sessions";
  expectArtifactError(withEndpoint);
});

test("model, diagrams, interfaces, and constraints have closed references", () => {
  const duplicate = clone(get("architecture-draft-001.json"));
  duplicate.sections.architectureModel.content.elements.push(
    clone(duplicate.sections.architectureModel.content.elements[0]),
  );
  expectArtifactError(duplicate);

  const unknownEndpoint = clone(get("architecture-draft-001.json"));
  unknownEndpoint.sections.architectureModel.content.relationships[0]
    .targetElementId = "EL-UNKNOWN";
  expectArtifactError(unknownEndpoint);

  const staleDiagram = clone(get("architecture-draft-001.json"));
  staleDiagram.sections.diagrams.content.architectureModelDigest =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  expectArtifactError(staleDiagram);

  const unknownConstraintTarget = clone(
    get("architecture-draft-001.json"),
  );
  unknownConstraintTarget.sections.architectureConstraints.content
    .constraints[0].appliesTo[0].id = "EL-UNKNOWN";
  expectArtifactError(unknownConstraintTarget);
});

test("traceability covers every cited architecture target", () => {
  const missingTarget = clone(get("architecture-draft-001.json"));
  missingTarget.traceability[0].targets =
    missingTarget.traceability[0].targets.filter(
      ({ id }) => id !== "REL-AUTH-IDENTITY",
    );
  expectArtifactError(missingTarget);

  const contradictory = clone(get("architecture-draft-001.json"));
  contradictory.traceability[0].disposition = "no-architecture-impact";
  contradictory.traceability[0].targets = [];
  expectArtifactError(contradictory);

  const unknown = clone(get("architecture-draft-001.json"));
  unknown.traceability[0].targets.push({
    kind: "view",
    id: "VIEW-UNKNOWN",
  });
  expectArtifactError(unknown);
});

test("draft rejects blocking assumptions and incomplete discovery reconciliation", () => {
  const blocked = clone(get("architecture-draft-001.json"));
  blocked.assumptions[0].blocking = true;
  blocked.assumptions[0].status = "unconfirmed";
  expectArtifactError(blocked);

  const unresolved = clone(get("architecture-draft-001.json"));
  unresolved.discoveryReconciliation[0].disposition = "unresolved";
  delete unresolved.discoveryReconciliation[0].targetId;
  expectArtifactError(unresolved);

  const draft = clone(get("architecture-draft-001.json"));
  draft.discoveryReconciliation = draft.discoveryReconciliation.filter(
    ({ observedId }) => observedId !== "EL-AUTH-SERVICE",
  );
  assert.throws(
    () =>
      validateArchitectureDraftAgainstState({
        projectArchitectureState: get(
          "project-architecture-state-existing-discovered-001.json",
        ),
        projectArchitectureStateRef: draft.projectArchitectureState,
        architectureDraft: draft,
        currentArchitectureSnapshot: get(
          "current-architecture-snapshot-001.json",
        ),
      }),
    ArchitectureArtifactValidationError,
  );
});

test("draft decisions remain proposed and baselines cannot retain proposals", () => {
  const acceptedDraft = clone(get("architecture-draft-001.json"));
  acceptedDraft.sections.decisionRecords.content.decisions[0].status =
    "accepted";
  expectArtifactError(acceptedDraft);

  const proposedBaseline = clone(get("architecture-baseline-001.json"));
  proposedBaseline.sections.decisionRecords.content.decisions[0].status =
    "proposed";
  expectArtifactError(proposedBaseline);

  const invalidMadr = clone(get("architecture-draft-001.json"));
  invalidMadr.sections.decisionRecords.content.decisions[0]
    .outcome.chosenOptionId = "OPT-UNKNOWN";
  expectArtifactError(invalidMadr);
});

test("change sets bind the exact baseline and contain typed semantic changes", () => {
  const state = get("project-architecture-state-baselined-001.json");
  const baseline = get("architecture-baseline-001.json");
  const changeSet = get("architecture-change-set-draft-001.json");
  assert.equal(
    validateArchitectureChangeSetAgainstState({
      projectArchitectureState: state,
      projectArchitectureStateRef: changeSet.projectArchitectureState,
      architectureChangeSet: changeSet,
    }).architectureChangeSet,
    changeSet,
  );
  assert.equal(
    validateArchitectureChangeSetAgainstBaseline({
      architectureBaseline: baseline,
      architectureBaselineRef: changeSet.baseArchitectureBaseline,
      architectureChangeSet: changeSet,
    }).architectureChangeSet,
    changeSet,
  );

  const staleBaseline = clone(changeSet);
  staleBaseline.baseArchitectureDigest =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  expectArtifactError(staleBaseline);

  const wrongKind = clone(changeSet);
  wrongKind.changes.elementChanges[0].entityKind = "relationship";
  expectArtifactError(wrongKind);

  const absentTarget = clone(changeSet);
  absentTarget.changes.elementChanges[0].entityId = "EL-UNKNOWN";
  expectArtifactError(absentTarget);

  const staleEntityDigest = clone(changeSet);
  staleEntityDigest.changes.elementChanges[0].expectedBaseDigest =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(
    () =>
      validateArchitectureChangeSetAgainstBaseline({
        architectureBaseline: baseline,
        architectureBaselineRef: changeSet.baseArchitectureBaseline,
        architectureChangeSet: staleEntityDigest,
      }),
    ArchitectureArtifactValidationError,
  );
});

test("change and no-change dispositions are mutually exclusive", () => {
  const emptyChange = clone(
    get("architecture-change-set-draft-001.json"),
  );
  for (const collection of Object.values(emptyChange.changes)) {
    collection.splice(0);
  }
  emptyChange.traceability[0].targets =
    emptyChange.traceability[0].targets.filter(
      ({ kind }) => kind !== "change",
    );
  expectArtifactError(emptyChange);

  emptyChange.changeDisposition = "no-architecture-change";
  emptyChange.noChangeRationale =
    "The requirement update changes wording but not architecture.";
  const baseline = get("architecture-baseline-001.json");
  const driftedNoChange = clone(emptyChange);
  assert.throws(
    () =>
      validateArchitectureChangeSetAgainstBaseline({
        architectureBaseline: baseline,
        architectureBaselineRef: emptyChange.baseArchitectureBaseline,
        architectureChangeSet: driftedNoChange,
      }),
    ArchitectureArtifactValidationError,
  );
  emptyChange.sections = clone(baseline.sections);
  assert.equal(
    validateArchitectureArtifact(emptyChange),
    emptyChange,
  );
  assert.equal(
    validateArchitectureChangeSetAgainstBaseline({
      architectureBaseline: baseline,
      architectureBaselineRef: emptyChange.baseArchitectureBaseline,
      architectureChangeSet: emptyChange,
    }).architectureChangeSet,
    emptyChange,
  );

  const contradictory = clone(emptyChange);
  contradictory.changes.elementChanges.push(
    clone(
      get("architecture-change-set-draft-001.json").changes
        .elementChanges[0],
    ),
  );
  expectArtifactError(contradictory);
});

test("native files are subordinate and cannot point back to canonical outputs", () => {
  const baselineDesigner = get(
    "architecture-draft-001.json",
  ).sections.nativeArtifacts.content.entries.find(
    ({ producedBy }) => producedBy.stage === "designer",
  );
  const changeDesigner = get(
    "architecture-change-set-draft-001.json",
  ).sections.nativeArtifacts.content.entries.find(
    ({ producedBy }) => producedBy.stage === "designer",
  );
  assert.equal(baselineDesigner.producedBy.adapterId, "spec-kit-plan");
  assert.equal(changeDesigner.producedBy.adapterId, "openspec-design");
  assert.match(changeDesigner.artifact.uri, /\/design\.md$/);

  const circular = clone(get("architecture-draft-001.json"));
  circular.sections.nativeArtifacts.content.canonicalOutputs = [
    circular.projectArchitectureState,
  ];
  expectArtifactError(circular);
});

test("continuation preserves a valid stage prefix and allows early partial work", () => {
  const continuation = get("architecture-continuation-001.json");
  assert.deepEqual(continuation.workingPrimary.sections, {});
  assert.equal(validateArchitectureArtifact(continuation), continuation);

  const invalidPrefix = clone(continuation);
  invalidPrefix.activeStage = "modeler";
  expectArtifactError(invalidPrefix);

  const wrongPrimary = clone(continuation);
  wrongPrimary.workingPrimary.kind =
    "ArchitectureChangeSetDraftPartial";
  expectArtifactError(wrongPrimary);
});
