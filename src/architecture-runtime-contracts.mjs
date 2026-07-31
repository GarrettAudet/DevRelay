import { canonicalJsonDigest } from "./content-digest.mjs";

import {
  validateArchitectureArtifact,
  validateArchitectureChangeSetAgainstBaseline,
  validateArchitectureChangeSetAgainstState,
  validateArchitectureDraftAgainstState,
} from "./architecture-artifact-validator.mjs";
import { validateArchitectureClarificationHandoff } from "./architecture-handoff-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";

const ARCHITECTURE_SCHEMAS = new Set([
  "https://devrelay.dev/artifacts/project-architecture-state/v1",
  "https://devrelay.dev/artifacts/current-architecture-snapshot/v1",
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "https://devrelay.dev/artifacts/architecture-draft/v1",
  "https://devrelay.dev/artifacts/architecture-change-set-draft/v1",
  "https://devrelay.dev/artifacts/architecture-clarification-request-set/v1",
  "https://devrelay.dev/artifacts/architecture-clarification-response-set/v1",
  "https://devrelay.dev/artifacts/architecture-design-continuation/v1",
  "https://devrelay.dev/artifacts/architecture-designer-working/v1",
  "https://devrelay.dev/artifacts/architecture-modeler-working/v1",
]);

const REQUIREMENTS_SCHEMAS = new Set([
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
]);

const SHARED_SCHEMAS = new Set([
  "https://devrelay.dev/artifacts/project-context/v1",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
]);

function oneLoaded(loadedInputs, port) {
  const entries = loadedInputs?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function refKey(ref) {
  return `${ref.schema}\u0000${ref.digest}`;
}

const STATE_POINTER_PORTS = Object.freeze({
  projectContext: "project-context",
  requirementsBaseline: "requirements-baseline",
  repositorySnapshot: "repository-snapshot",
  currentArchitectureSnapshot: "current-architecture-snapshot",
  architectureBaseline: "architecture-baseline",
});

function samePointer(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function failLineage(message) {
  throw new Error(`architecture runtime lineage failed: ${message}`);
}

function loadedRef(context, port) {
  return oneLoaded(context.loadedInputs, port)?.ref;
}

function assertPointer(label, actual, expected) {
  if (!samePointer(actual, expected)) {
    failLineage(`${label} does not match the exact runtime artifact`);
  }
}

function assertStateLineage(state, context) {
  for (const [field, port] of Object.entries(STATE_POINTER_PORTS)) {
    const stateHas = state[field] !== undefined;
    const invocationRef = loadedRef(context, port);
    const invocationHas = invocationRef !== undefined;
    if (stateHas !== invocationHas) {
      failLineage(`project state and invocation disagree on ${port}`);
    }
    if (stateHas) {
      assertPointer(`project state ${port}`, state[field], invocationRef);
    }
  }
}

function assertCurrentArchitectureSnapshotLineage(snapshot, context) {
  const state = oneLoaded(
    context.loadedInputs,
    "project-architecture-state",
  );
  if (!state || state.value.state !== "existing-discovered-unbaselined") {
    failLineage(
      "current architecture snapshot requires discovered project state",
    );
  }
  assertPointer(
    "project state current architecture snapshot",
    state.value.currentArchitectureSnapshot,
    context.ref,
  );
  assertPointer(
    "current architecture snapshot project context",
    snapshot.projectContext,
    loadedRef(context, "project-context"),
  );
  assertPointer(
    "current architecture snapshot repository",
    snapshot.repositorySnapshot,
    loadedRef(context, "repository-snapshot"),
  );
}

function assertArchitectureBaselineLineage(baseline, context) {
  const state = oneLoaded(
    context.loadedInputs,
    "project-architecture-state",
  );
  if (!state || state.value.state !== "baselined") {
    failLineage("architecture baseline requires baselined project state");
  }
  assertPointer(
    "project state architecture baseline",
    state.value.architectureBaseline,
    context.ref,
  );
  assertPointer(
    "architecture baseline project context",
    baseline.projectContext,
    loadedRef(context, "project-context"),
  );
  if (baseline.repositorySnapshot !== undefined) {
    assertPointer(
      "architecture baseline repository",
      baseline.repositorySnapshot,
      loadedRef(context, "repository-snapshot"),
    );
  }
}

function lineageInputMap(context) {
  const names =
    context.operation.adapterChain?.resume?.lineageInputs ??
    Object.keys(context.loadedInputs ?? {});
  return new Map(
    names
      .filter((name) => context.loadedInputs?.[name]?.length === 1)
      .map((name) => [name, context.loadedInputs[name][0].ref]),
  );
}

function assertBaseInputs(baseInputs, context) {
  const expected = lineageInputMap(context);
  if (baseInputs.length !== expected.size) {
    failLineage("designer base inputs are not the exact invocation lineage");
  }
  const seen = new Set();
  for (const { role, artifact } of baseInputs) {
    if (seen.has(role) || !expected.has(role)) {
      failLineage(`designer base input ${role} is duplicate or undeclared`);
    }
    seen.add(role);
    assertPointer(`designer base input ${role}`, artifact, expected.get(role));
  }
}

function producerStep(context, expected) {
  if (context.producer?.step !== expected) {
    failLineage(
      `${expected} artifact was not produced by the declared ${expected} step`,
    );
  }
}

function designerHandoff(context) {
  return context.loadedHandoffs?.designer?.[
    "architecture-designer-working"
  ]?.[0];
}

function modelerHandoff(context) {
  return context.loadedHandoffs?.modeler?.[
    "architecture-modeler-working"
  ]?.[0];
}

function resolveLineageSection(section, name, options) {
  if (!section) {
    failLineage(`${name} section is missing`);
  }
  if (section.mode === "embedded") {
    return section.content;
  }
  const content = options.resolveAttached?.(section.artifact);
  if (!content) {
    failLineage(`attached ${name} section was not resolved`);
  }
  return content;
}

function nativeEntries(section, options) {
  return resolveLineageSection(
    section,
    "native artifacts",
    options,
  ).entries;
}

function assertNativeProducer(section, options, context, stage) {
  const owned = nativeEntries(section, options).filter(
    (entry) => entry.producedBy.stage === stage,
  );
  if (
    owned.length === 0 ||
    owned.some(
      (entry) =>
        entry.producedBy.adapterId !== context.producer.plugin.id ||
        entry.producedBy.adapterVersion !== context.producer.plugin.version,
    )
  ) {
    failLineage(
      `${stage} native provenance does not match the configured plug-in`,
    );
  }
}

function assertDesignerLineage(value, context, options) {
  producerStep(context, "designer");
  assertNativeProducer(
    value.nativeArtifacts,
    options,
    context,
    "designer",
  );
  if (value.operation !== context.invocation.module.operation) {
    failLineage("designer operation does not match the invocation");
  }
  assertPointer(
    "designer project state",
    value.projectArchitectureState,
    loadedRef(context, "project-architecture-state"),
  );
  assertBaseInputs(value.baseInputs, context);
}

function assertModelerLineage(value, context, options) {
  producerStep(context, "modeler");
  assertNativeProducer(
    value.nativeArtifacts,
    options,
    context,
    "modeler",
  );
  if (value.operation !== context.invocation.module.operation) {
    failLineage("modeler operation does not match the invocation");
  }
  assertPointer(
    "modeler project state",
    value.projectArchitectureState,
    loadedRef(context, "project-architecture-state"),
  );
  const designer = designerHandoff(context);
  if (!designer) {
    failLineage("modeler is missing the validated designer handoff");
  }
  assertPointer(
    "modeler designer handoff",
    value.designerWorkingArtifact,
    designer.ref,
  );
}

function assertEqualSection(label, candidate, working) {
  if (canonicalJsonDigest(candidate) !== canonicalJsonDigest(working)) {
    failLineage(`terminal candidate replaced the validated ${label} section`);
  }
}

function assertNativeSubset(candidateEntries, requiredEntries, owner) {
  const byId = new Map(candidateEntries.map((entry) => [entry.id, entry]));
  for (const entry of requiredEntries) {
    const candidate = byId.get(entry.id);
    if (
      !candidate ||
      canonicalJsonDigest(candidate) !== canonicalJsonDigest(entry)
    ) {
      failLineage(`terminal candidate replaced ${owner} native artifact ${entry.id}`);
    }
  }
}

async function assertTerminalLineage(value, context, options) {
  producerStep(context, "decision-recorder");
  assertNativeProducer(
    value.sections.nativeArtifacts,
    options,
    context,
    "decision-recorder",
  );
  const designer = designerHandoff(context);
  const modeler = modelerHandoff(context);
  if (!designer || !modeler) {
    failLineage("terminal candidate is missing validated working handoffs");
  }

  const designerOptions = await architectureOptions(designer.value, context);
  const modelerOptions = await architectureOptions(modeler.value, context);
  const sections = value.sections;
  assertEqualSection(
    "technical design",
    resolveLineageSection(
      sections.technicalDesign,
      "technical design",
      options,
    ),
    resolveLineageSection(
      designer.value.technicalDesign,
      "designer technical design",
      designerOptions,
    ),
  );
  assertEqualSection(
    "interface intent",
    resolveLineageSection(
      sections.interfaceIntent,
      "interface intent",
      options,
    ),
    resolveLineageSection(
      designer.value.interfaceIntent,
      "designer interface intent",
      designerOptions,
    ),
  );
  assertEqualSection(
    "architecture constraints",
    resolveLineageSection(
      sections.architectureConstraints,
      "architecture constraints",
      options,
    ),
    resolveLineageSection(
      designer.value.architectureConstraints,
      "designer architecture constraints",
      designerOptions,
    ),
  );
  assertEqualSection(
    "architecture model",
    resolveLineageSection(
      sections.architectureModel,
      "architecture model",
      options,
    ),
    resolveLineageSection(
      modeler.value.architectureModel,
      "modeler architecture model",
      modelerOptions,
    ),
  );
  assertEqualSection(
    "diagrams",
    resolveLineageSection(sections.diagrams, "diagrams", options),
    resolveLineageSection(
      modeler.value.diagrams,
      "modeler diagrams",
      modelerOptions,
    ),
  );

  const candidateEntries = nativeEntries(
    sections.nativeArtifacts,
    options,
  );
  assertNativeSubset(
    candidateEntries,
    nativeEntries(designer.value.nativeArtifacts, designerOptions),
    "designer",
  );
  assertNativeSubset(
    candidateEntries,
    nativeEntries(modeler.value.nativeArtifacts, modelerOptions),
    "modeler",
  );
}

function assertContinuationLineage(value, context) {
  if (
    value.sourceInvocation.invocationId !== context.invocation.invocationId ||
    value.sourceInvocation.invocationFingerprint !==
      context.producer?.invocationFingerprint
  ) {
    failLineage("continuation source invocation does not match execution");
  }
  if (value.chainFingerprint !== context.chainFingerprint) {
    failLineage("continuation chain fingerprint does not match execution");
  }
  if (value.activeStage !== context.producer?.step) {
    failLineage("continuation active stage does not match the paused step");
  }
  if (value.operation !== context.invocation.module.operation) {
    failLineage("continuation operation does not match execution");
  }
  assertPointer(
    "continuation project state",
    value.projectArchitectureState,
    loadedRef(context, "project-architecture-state"),
  );
  assertBaseInputs(value.baseInputs, context);

  if (value.completedStages.length !== context.priorResults.length) {
    failLineage("continuation completed stages do not match execution");
  }
  for (let index = 0; index < value.completedStages.length; index += 1) {
    const recorded = value.completedStages[index];
    const actual = context.priorResults[index];
    if (
      recorded.step !== actual.step ||
      recorded.plugin.id !== actual.plugin.id ||
      recorded.plugin.version !== actual.plugin.version ||
      recorded.stepInvocationDigest !== actual.stepInvocationDigest ||
      recorded.stepResultDigest !== actual.digest ||
      canonicalJsonDigest(recorded.outputs) !==
        canonicalJsonDigest(actual.outputs)
    ) {
      failLineage("continuation completed-stage provenance is invalid");
    }
  }
}

function collectAttached(value, refs = []) {
  if (value === null || typeof value !== "object") {
    return refs;
  }
  if (
    value.mode === "attached" &&
    value.artifact &&
    typeof value.artifact === "object"
  ) {
    refs.push(value.artifact);
    return refs;
  }
  for (const child of Object.values(value)) {
    collectAttached(child, refs);
  }
  return refs;
}

async function architectureOptions(value, context) {
  const refs = collectAttached(value);
  if (refs.length === 0) {
    return {};
  }
  if (typeof context.load !== "function") {
    throw new Error("attached architecture sections require a verified loader");
  }
  const resolved = new Map();
  for (const ref of refs) {
    resolved.set(refKey(ref), await context.load(ref));
  }
  return {
    resolveAttached(ref) {
      return resolved.get(refKey(ref));
    },
  };
}

async function validateArchitectureRuntimeArtifact(value, context) {
  const options = await architectureOptions(value, context);
  validateArchitectureArtifact(value, options);

  if (
    context.phase === "input" &&
    value.kind === "ProjectArchitectureState"
  ) {
    assertStateLineage(value, context);
  }

  if (
    context.phase === "input" &&
    value.kind === "CurrentArchitectureSnapshot"
  ) {
    assertCurrentArchitectureSnapshotLineage(value, context);
  }

  if (
    context.phase === "input" &&
    value.kind === "ArchitectureBaseline"
  ) {
    assertArchitectureBaselineLineage(value, context);
  }

  if (
    context.phase === "handoff" &&
    value.kind === "ArchitectureDesignerWorkingArtifact"
  ) {
    assertDesignerLineage(value, context, options);
  }

  if (
    context.phase === "handoff" &&
    value.kind === "ArchitectureModelerWorkingArtifact"
  ) {
    assertModelerLineage(value, context, options);
  }

  if (
    context.phase === "output" &&
    value.kind === "ArchitectureDesignContinuation"
  ) {
    assertContinuationLineage(value, context);
  }

  if (context.phase === "output" && value.kind === "ArchitectureDraft") {
    await assertTerminalLineage(value, context, options);
    const state = oneLoaded(
      context.loadedInputs,
      "project-architecture-state",
    );
    const snapshot = oneLoaded(
      context.loadedInputs,
      "current-architecture-snapshot",
    );
    if (!state) {
      throw new Error("ArchitectureDraft validation requires loaded project state");
    }
    validateArchitectureDraftAgainstState({
      projectArchitectureState: state.value,
      projectArchitectureStateRef: state.ref,
      architectureDraft: value,
      currentArchitectureSnapshot: snapshot?.value,
      options,
    });
  }

  if (
    context.phase === "output" &&
    value.kind === "ArchitectureChangeSetDraft"
  ) {
    await assertTerminalLineage(value, context, options);
    const state = oneLoaded(
      context.loadedInputs,
      "project-architecture-state",
    );
    const baseline = oneLoaded(
      context.loadedInputs,
      "architecture-baseline",
    );
    if (!state || !baseline) {
      throw new Error(
        "ArchitectureChangeSetDraft validation requires loaded state and baseline",
      );
    }
    const baselineOptions = await architectureOptions(
      baseline.value,
      context,
    );
    const combinedOptions = {
      resolveAttached(ref) {
        return (
          options.resolveAttached?.(ref) ??
          baselineOptions.resolveAttached?.(ref)
        );
      },
    };
    validateArchitectureChangeSetAgainstState({
      projectArchitectureState: state.value,
      projectArchitectureStateRef: state.ref,
      architectureChangeSet: value,
      options: combinedOptions,
    });
    validateArchitectureChangeSetAgainstBaseline({
      architectureBaseline: baseline.value,
      architectureBaselineRef: baseline.ref,
      architectureChangeSet: value,
      options: combinedOptions,
    });
  }

  if (
    context.phase === "input" &&
    value.kind === "ArchitectureDesignContinuation"
  ) {
    const request = oneLoaded(context.loadedInputs, "clarification-request");
    const response = oneLoaded(
      context.loadedInputs,
      "clarification-responses",
    );
    if (request && response) {
      validateArchitectureClarificationHandoff({
        invocation: context.invocation,
        clarificationRequest: request.value,
        clarificationResponse: response.value,
        continuation: value,
      });
    }
  }
  return value;
}

export function architectureRuntimeArtifactContracts() {
  return [
    ...[...ARCHITECTURE_SCHEMAS].map((schema) => ({
      schema,
      validate: validateArchitectureRuntimeArtifact,
    })),
    ...[...REQUIREMENTS_SCHEMAS].map((schema) => ({
      schema,
      validate: validateRequirementsArtifact,
    })),
    ...[...SHARED_SCHEMAS].map((schema) => ({
      schema,
      validate: validateRequirementsArtifact,
    })),
  ];
}
