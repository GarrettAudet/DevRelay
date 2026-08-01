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
import {
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";
import { normativeRequirementIds } from "../src/requirements-artifact-validator.mjs";
import {
  alignArchitectureChangeDigests,
  alignArchitectureRequirements,
  augmentArchitectureArtifactOverview,
} from "./architecture-project-overview-fixtures.mjs";

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

const [repositorySnapshot, requirementsBaseline] = await Promise.all([
  readJson("examples/artifacts/repository-snapshot-001.json"),
  readJson("examples/artifacts/requirements-baseline-001.json"),
]);

for (const artifact of artifacts.values()) {
  augmentArchitectureArtifactOverview(artifact);
  alignArchitectureRequirements(artifact, requirementsBaseline);
}
alignArchitectureChangeDigests(
  artifacts.get("architecture-change-set-draft-001.json"),
  artifacts.get("architecture-baseline-001.json"),
);

const get = (name) => artifacts.get(name);
const clone = (value) => structuredClone(value);

function replaceRequirementId(value, from, to) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === from) {
        value[index] = to;
      } else {
        replaceRequirementId(value[index], from, to);
      }
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      replaceRequirementId(child, from, to);
    }
  }
}

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

  const existingWithoutRepository = clone(
    get("project-architecture-state-baselined-001.json"),
  );
  delete existingWithoutRepository.repositorySnapshot;
  expectArtifactError(existingWithoutRepository);

  const greenfieldWithRepository = clone(
    get("project-architecture-state-baselined-001.json"),
  );
  greenfieldWithRepository.projectLifecycle = "greenfield";
  expectArtifactError(greenfieldWithRepository);

  const greenfieldBaseline = clone(greenfieldWithRepository);
  delete greenfieldBaseline.repositorySnapshot;
  assert.equal(
    validateArchitectureArtifact(greenfieldBaseline),
    greenfieldBaseline,
  );
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
      repositorySnapshot,
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
  const bytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`);
  const ref = {
    artifactId: "technical-design-auth-001",
    schema: "https://devrelay.dev/artifacts/technical-design/v1",
    mediaType: "application/vnd.devrelay.technical-design+json",
    digest: sha256Digest(bytes),
    uri: "file:///workspace/.devrelay/artifacts/technical-design-auth-001.json",
  };
  attached.sections.technicalDesign = {
    mode: "attached",
    contentId: content.technicalDesignId,
    artifact: ref,
  };
  assert.notEqual(ref.digest, canonicalJsonDigest(content));
  assert.equal(validateArchitectureArtifact(attached), attached);
  assert.equal(
    validateArchitectureArtifact(attached, {
      resolveAttached() {
        return { ref, bytes, value: content };
      },
    }),
    attached,
  );

  const stale = clone(content);
  stale.objective = "Different bytes";
  expectArtifactError(attached, {
    resolveAttached() {
      return { ref, bytes, value: stale };
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

  const missingBackCitation = clone(
    get("architecture-draft-001.json"),
  );
  missingBackCitation.sections.technicalDesign.content
    .sourceRequirementIds = [];
  expectArtifactError(missingBackCitation);
});

test("resolved empty sections still enforce closed architecture references", () => {
  const constraintDangling = clone(
    get("architecture-draft-001.json"),
  );
  constraintDangling.sections.interfaceIntent.content.interfaces = [];
  constraintDangling.sections.technicalDesign.content.interfaceIntentIds = [];
  constraintDangling.sections.decisionRecords.content.decisions[0]
    .affectedTargets =
      constraintDangling.sections.decisionRecords.content.decisions[0]
        .affectedTargets.filter(({ kind }) => kind !== "interface");
  constraintDangling.traceability[0].targets =
    constraintDangling.traceability[0].targets.filter(
      ({ kind }) => kind !== "interface",
    );
  expectArtifactError(constraintDangling);

  const decisionDangling = clone(
    get("architecture-draft-001.json"),
  );
  decisionDangling.sections.interfaceIntent.content.interfaces = [];
  decisionDangling.sections.technicalDesign.content.interfaceIntentIds = [];
  decisionDangling.sections.architectureConstraints.content.constraints[0]
    .appliesTo =
      decisionDangling.sections.architectureConstraints.content.constraints[0]
        .appliesTo.filter(({ kind }) => kind !== "interface");
  decisionDangling.traceability[0].targets =
    decisionDangling.traceability[0].targets.filter(
      ({ kind }) => kind !== "interface",
    );
  expectArtifactError(decisionDangling);
});

test("candidate traceability exactly covers the approved requirements", () => {
  const state = get(
    "project-architecture-state-existing-discovered-001.json",
  );
  const snapshot = get("current-architecture-snapshot-001.json");
  const unapproved = clone(get("architecture-draft-001.json"));
  replaceRequirementId(
    unapproved,
    normativeRequirementIds(requirementsBaseline.requirements)[0],
    "REQ-FAKE-001",
  );
  unapproved.sections.diagrams.content.architectureModelDigest =
    canonicalJsonDigest(unapproved.sections.architectureModel.content);
  assert.throws(
    () =>
      validateArchitectureDraftAgainstState({
        projectArchitectureState: state,
        projectArchitectureStateRef: unapproved.projectArchitectureState,
        requirementsBaseline,
        architectureDraft: unapproved,
        currentArchitectureSnapshot: snapshot,
      }),
    ArchitectureArtifactValidationError,
  );

  const expandedBaseline = clone(requirementsBaseline);
  const second = clone(expandedBaseline.requirements.userStories[0]);
  second.id = "US-AUTH-SECOND";
  expandedBaseline.requirements.userStories.push(second);
  assert.throws(
    () =>
      validateArchitectureDraftAgainstState({
        projectArchitectureState: state,
        projectArchitectureStateRef:
          get("architecture-draft-001.json").projectArchitectureState,
        requirementsBaseline: expandedBaseline,
        architectureDraft: get("architecture-draft-001.json"),
        currentArchitectureSnapshot: snapshot,
      }),
    ArchitectureArtifactValidationError,
  );
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
        requirementsBaseline,
        architectureDraft: draft,
        currentArchitectureSnapshot: get(
          "current-architecture-snapshot-001.json",
        ),
      }),
    ArchitectureArtifactValidationError,
  );

  const extraReconciliation = clone(
    get("architecture-draft-001.json"),
  );
  extraReconciliation.discoveryReconciliation.push({
    observedKind: "element",
    observedId: "EL-NOT-OBSERVED",
    disposition: "removed",
    rationale: "Fabricated discovery row.",
  });
  assert.throws(
    () =>
      validateArchitectureDraftAgainstState({
        projectArchitectureState: get(
          "project-architecture-state-existing-discovered-001.json",
        ),
        projectArchitectureStateRef:
          extraReconciliation.projectArchitectureState,
        requirementsBaseline,
        architectureDraft: extraReconciliation,
        currentArchitectureSnapshot: get(
          "current-architecture-snapshot-001.json",
        ),
      }),
    ArchitectureArtifactValidationError,
  );

  const blockedDiscovery = clone(
    get("current-architecture-snapshot-001.json"),
  );
  blockedDiscovery.gaps.push({
    id: "GAP-BLOCKING-001",
    statement: "Architecture ownership remains unknown.",
    blocking: true,
  });
  assert.throws(
    () =>
      validateArchitectureDraftAgainstState({
        projectArchitectureState: get(
          "project-architecture-state-existing-discovered-001.json",
        ),
        projectArchitectureStateRef:
          get("architecture-draft-001.json").projectArchitectureState,
        requirementsBaseline,
        architectureDraft: get("architecture-draft-001.json"),
        currentArchitectureSnapshot: blockedDiscovery,
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
      requirementsBaseline,
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

  const undeclaredMutation = clone(changeSet);
  const client = undeclaredMutation.sections.architectureModel.content
    .elements.find(({ id }) => id === "EL-CLIENT");
  client.description = "Undeclared target architecture mutation.";
  undeclaredMutation.sections.diagrams.content.architectureModelDigest =
    canonicalJsonDigest(
      undeclaredMutation.sections.architectureModel.content,
    );
  assert.throws(
    () =>
      validateArchitectureChangeSetAgainstBaseline({
        architectureBaseline: baseline,
        architectureBaselineRef: changeSet.baseArchitectureBaseline,
        architectureChangeSet: undeclaredMutation,
      }),
    ArchitectureArtifactValidationError,
  );

  const forgedRepository = clone(changeSet);
  forgedRepository.repositorySnapshot.digest =
    `sha256:${"f".repeat(64)}`;
  assert.throws(
    () =>
      validateArchitectureChangeSetAgainstState({
        projectArchitectureState: state,
        projectArchitectureStateRef: changeSet.projectArchitectureState,
        requirementsBaseline,
        architectureChangeSet: forgedRepository,
      }),
    ArchitectureArtifactValidationError,
  );

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
  for (const trace of emptyChange.traceability) {
    trace.targets = trace.targets.filter(({ kind }) => kind !== "change");
  }
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

  const invalidMapping = clone(get("architecture-draft-001.json"));
  const mapping = invalidMapping.sections.nativeArtifacts.content
    .entries[0].canonicalMappings[0];
  mapping.entityIds = [];
  mapping.jsonPointers = [
    "/sections/technicalDesign/definitely-not-real",
  ];
  expectArtifactError(invalidMapping);

  const generatedWithoutMapping = clone(
    get("architecture-draft-001.json"),
  );
  generatedWithoutMapping.sections.nativeArtifacts.content.entries[0]
    .canonicalMappings = [];
  expectArtifactError(generatedWithoutMapping);

  const contradictoryUnmapped = clone(
    get("architecture-draft-001.json"),
  );
  contradictoryUnmapped.sections.nativeArtifacts.content.entries[0]
    .disposition = "unmapped";
  expectArtifactError(contradictoryUnmapped);

  const unexplainedUnmapped = clone(
    get("architecture-draft-001.json"),
  );
  const unmappedEntry =
    unexplainedUnmapped.sections.nativeArtifacts.content.entries[0];
  unmappedEntry.disposition = "unmapped";
  unmappedEntry.canonicalMappings = [];
  unmappedEntry.warnings = [];
  expectArtifactError(unexplainedUnmapped);

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
