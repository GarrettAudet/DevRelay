import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArchitectureArtifactValidationError,
  validateArchitectureArtifact,
} from "../src/architecture-artifact-validator.mjs";
import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const clone = (value) => structuredClone(value);

const [
  moduleDefinition,
  discoveredState,
  baselinedState,
  snapshot,
  baseline,
  designer,
  modeler,
  draft,
] = await Promise.all([
  readJson("examples/modules/architecture-design.module.json"),
  readJson(
    "examples/artifacts/project-architecture-state-existing-discovered-001.json",
  ),
  readJson(
    "examples/artifacts/project-architecture-state-baselined-001.json",
  ),
  readJson("examples/artifacts/current-architecture-snapshot-001.json"),
  readJson("examples/artifacts/architecture-baseline-001.json"),
  readJson("examples/artifacts/architecture-designer-working-001.json"),
  readJson("examples/artifacts/architecture-modeler-working-001.json"),
  readJson("examples/artifacts/architecture-draft-001.json"),
]);

const operations = new Map(
  moduleDefinition.operations.map((operation) => [operation.id, operation]),
);
const contracts = new Map(
  architectureRuntimeArtifactContracts().map((contract) => [
    contract.schema,
    contract.validate,
  ]),
);

function loaded(ref, value = {}) {
  return { ref: clone(ref), value: clone(value) };
}

function contextFor({
  operation = "establish-baseline",
  loadedInputs,
  loadedHandoffs = {},
  phase = "input",
  port,
  producer,
  ref,
  attachments = new Map(),
}) {
  return {
    phase,
    port,
    ref,
    invocation: {
      invocationId: "architecture-lineage-regression",
      module: {
        id: "architecture-design",
        version: "0.1.0",
        operation,
      },
    },
    operation: operations.get(operation),
    loadedInputs,
    loadedHandoffs,
    priorResults: [],
    chainFingerprint: `sha256:${"a".repeat(64)}`,
    producer,
    async load(artifact) {
      const content = attachments.get(artifact.digest);
      if (!content) {
        throw new Error(`missing attached content ${artifact.digest}`);
      }
      return clone(content);
    },
  };
}

function attachment(section, name, attachments, mutate = (value) => value) {
  const content = mutate(clone(section.content));
  const identityFields = {
    technicalDesign: "technicalDesignId",
    architectureModel: "modelId",
    diagrams: "diagramSetId",
    interfaceIntent: "interfaceIntentSetId",
    architectureConstraints: "constraintSetId",
    decisionRecords: "decisionRecordSetId",
    nativeArtifacts: "nativeArtifactSetId",
  };
  const digest = canonicalJsonDigest(content);
  attachments.set(digest, content);
  return {
    mode: "attached",
    contentId: content[identityFields[name]],
    artifact: {
      artifactId: `attached-${name}-${content[identityFields[name]]}`,
      schema: `https://devrelay.dev/artifacts/${name}/v1`,
      mediaType: `application/vnd.devrelay.${name}+json`,
      digest,
      uri: `artifact://architecture-lineage/${name}/${digest.slice(7)}`,
    },
  };
}

function establishInputs({ relocate = false } = {}) {
  const values = new Map(
    designer.baseInputs.map(({ role, artifact }) => [role, artifact]),
  );
  const result = {};
  for (const [role, artifact] of values) {
    const ref = clone(artifact);
    if (relocate) {
      ref.uri = `artifact://relocated/${role}/${ref.digest.slice(7)}`;
    }
    const value =
      role === "project-architecture-state"
        ? discoveredState
        : role === "current-architecture-snapshot"
          ? snapshot
          : {};
    result[role] = [loaded(ref, value)];
  }
  return result;
}

test("attached section content is validated by the embedded closed schema", () => {
  const attachedDraft = clone(draft);
  const attachments = new Map();
  attachedDraft.sections.technicalDesign = attachment(
    attachedDraft.sections.technicalDesign,
    "technicalDesign",
    attachments,
    (content) => {
      content.undeclaredField = true;
      return content;
    },
  );

  assert.throws(
    () =>
      validateArchitectureArtifact(attachedDraft, {
        resolveAttached(artifact) {
          return attachments.get(artifact.digest);
        },
      }),
    ArchitectureArtifactValidationError,
  );
});

test("runtime lineage accepts attached native evidence and relocated URIs", async () => {
  const attachedDesigner = clone(designer);
  const attachments = new Map();
  attachedDesigner.nativeArtifacts = attachment(
    attachedDesigner.nativeArtifacts,
    "nativeArtifacts",
    attachments,
  );
  const schema =
    "https://devrelay.dev/artifacts/architecture-designer-working/v1";

  await assert.doesNotReject(
    contracts.get(schema)(
      attachedDesigner,
      contextFor({
        loadedInputs: establishInputs({ relocate: true }),
        phase: "handoff",
        port: "architecture-designer-working",
        producer: {
          step: "designer",
          plugin: {
            id: "spec-kit-plan",
            version: "0.1.0",
          },
          invocationFingerprint: `sha256:${"b".repeat(64)}`,
          chainFingerprint: `sha256:${"a".repeat(64)}`,
          stepInvocationDigest: `sha256:${"c".repeat(64)}`,
        },
        attachments,
      }),
    ),
  );
});

test("terminal lineage compares resolved content across attachment modes", async () => {
  const candidate = clone(draft);
  const attachments = new Map();
  candidate.sections.technicalDesign = attachment(
    candidate.sections.technicalDesign,
    "technicalDesign",
    attachments,
  );
  candidate.sections.nativeArtifacts = attachment(
    candidate.sections.nativeArtifacts,
    "nativeArtifacts",
    attachments,
  );
  const stateRef = candidate.projectArchitectureState;
  const snapshotRef = candidate.currentArchitectureSnapshot;
  const loadedInputs = {
    "project-architecture-state": [loaded(stateRef, discoveredState)],
    "requirements-baseline": [loaded(candidate.requirementsBaseline)],
    "project-context": [loaded(candidate.projectContext)],
    "repository-snapshot": [loaded(candidate.repositorySnapshot)],
    "current-architecture-snapshot": [loaded(snapshotRef, snapshot)],
  };
  const loadedHandoffs = {
    designer: {
      "architecture-designer-working": [
        loaded(modeler.designerWorkingArtifact, designer),
      ],
    },
    modeler: {
      "architecture-modeler-working": [
        loaded(
          {
            artifactId: modeler.workingArtifactId,
            schema:
              "https://devrelay.dev/artifacts/architecture-modeler-working/v1",
            mediaType:
              "application/vnd.devrelay.architecture-modeler-working+json",
            digest: `sha256:${"e".repeat(64)}`,
            uri: "artifact://architecture-lineage/modeler",
          },
          modeler,
        ),
      ],
    },
  };

  await assert.doesNotReject(
    contracts.get("https://devrelay.dev/artifacts/architecture-draft/v1")(
      candidate,
      contextFor({
        loadedInputs,
        loadedHandoffs,
        phase: "output",
        port: "architecture-draft",
        producer: {
          step: "decision-recorder",
          plugin: {
            id: "madr",
            version: "0.1.0",
          },
          invocationFingerprint: `sha256:${"b".repeat(64)}`,
          chainFingerprint: `sha256:${"a".repeat(64)}`,
          stepInvocationDigest: `sha256:${"d".repeat(64)}`,
        },
        attachments,
      }),
    ),
  );
});

test("snapshot and baseline internals bind to invocation provenance", async () => {
  const snapshotRef = discoveredState.currentArchitectureSnapshot;
  const snapshotInputs = {
    "project-architecture-state": [
      loaded(draft.projectArchitectureState, discoveredState),
    ],
    "requirements-baseline": [loaded(discoveredState.requirementsBaseline)],
    "project-context": [loaded(discoveredState.projectContext)],
    "repository-snapshot": [loaded(discoveredState.repositorySnapshot)],
    "current-architecture-snapshot": [loaded(snapshotRef, snapshot)],
  };
  const snapshotContext = contextFor({
    loadedInputs: snapshotInputs,
    ref: snapshotRef,
  });
  const snapshotValidator = contracts.get(
    "https://devrelay.dev/artifacts/current-architecture-snapshot/v1",
  );
  await assert.doesNotReject(snapshotValidator(snapshot, snapshotContext));

  const staleSnapshot = clone(snapshot);
  staleSnapshot.projectContext.digest = `sha256:${"f".repeat(64)}`;
  await assert.rejects(snapshotValidator(staleSnapshot, snapshotContext));

  const baselineRef = baselinedState.architectureBaseline;
  const baselineInputs = {
    "project-architecture-state": [
      loaded(
        {
          artifactId: baselinedState.stateId,
          schema:
            "https://devrelay.dev/artifacts/project-architecture-state/v1",
          mediaType:
            "application/vnd.devrelay.project-architecture-state+json",
          digest: `sha256:${"4".repeat(64)}`,
          uri: "artifact://architecture-lineage/baselined-state",
        },
        baselinedState,
      ),
    ],
    "requirements-baseline": [loaded(baselinedState.requirementsBaseline)],
    "project-context": [loaded(baselinedState.projectContext)],
    "repository-snapshot": [loaded(baselinedState.repositorySnapshot)],
    "architecture-baseline": [loaded(baselineRef, baseline)],
  };
  const baselineContext = contextFor({
    operation: "design-change",
    loadedInputs: baselineInputs,
    ref: baselineRef,
  });
  const baselineValidator = contracts.get(
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
  );
  await assert.doesNotReject(baselineValidator(baseline, baselineContext));

  const staleBaseline = clone(baseline);
  staleBaseline.repositorySnapshot.digest = `sha256:${"f".repeat(64)}`;
  await assert.rejects(baselineValidator(staleBaseline, baselineContext));
});
