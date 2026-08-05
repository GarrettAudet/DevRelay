import { canonicalJsonDigest } from "./content-digest.mjs";

import {
  validateArchitectureArtifact,
  validateArchitectureChangeSetAgainstBaseline,
  validateArchitectureChangeSetAgainstState,
  validateArchitectureDraftAgainstState,
} from "./architecture-artifact-validator.mjs";
import { normativeRequirementIds } from "./requirements-artifact-validator.mjs";
import {
  validateArchitectureClarificationHandoff,
  validateArchitectureClarificationIssuance,
} from "./architecture-handoff-validator.mjs";
import { requirementsRuntimeArtifactContracts } from "./requirements-runtime-contracts.mjs";

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

function oneLoaded(loadedInputs, port) {
  const entries = loadedInputs?.[port];
  return entries?.length === 1 ? entries[0] : undefined;
}

function refKey(ref) {
  return `${ref.schema}\u0000${ref.digest}`;
}

function exactPointerKey(ref) {
  return [
    ref?.artifactId,
    ref?.schema,
    ref?.mediaType,
    ref?.digest,
  ].join("\u0000");
}

function walkArtifactContent(value, options, visit, resolved = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkArtifactContent(entry, options, visit, resolved);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }

  visit(value);
  if (value.mode === "attached" && value.artifact) {
    const key = exactPointerKey(value.artifact);
    if (!resolved.has(key)) {
      const record = options.resolveAttached?.(value.artifact);
      if (!record?.value) {
        failLineage("attached architecture content was not resolved");
      }
      resolved.add(key);
      walkArtifactContent(record.value, options, visit, resolved);
    }
  }
  for (const child of Object.values(value)) {
    walkArtifactContent(child, options, visit, resolved);
  }
}

function collectSourceReferences(value, options) {
  const sourceRefs = [];
  walkArtifactContent(value, options, (node) => {
    if (Array.isArray(node.sourceRefs)) {
      for (const sourceRef of node.sourceRefs) {
        sourceRefs.push(sourceRef);
      }
    }
  });
  return sourceRefs;
}

function addAllowedRole(allowed, artifact, role) {
  const key = exactPointerKey(artifact);
  const roles = allowed.get(key) ?? new Set();
  roles.add(role);
  allowed.set(key, roles);
}

function collectNativeArtifactEntries(value, options) {
  const entries = [];
  walkArtifactContent(value, options, (node) => {
    if (
      typeof node.nativeArtifactSetId === "string" &&
      Array.isArray(node.entries)
    ) {
      entries.push(...node.entries);
    }
  });
  return entries;
}

async function verifyNativeArtifactBytes(value, context, options) {
  const entries = collectNativeArtifactEntries(value, options);
  if (entries.length === 0) {
    return new Map();
  }
  if (typeof context.loadBytes !== "function") {
    failLineage("native architecture artifacts require a raw-byte loader");
  }
  const verified = new Map();
  for (const entry of entries) {
    const key = exactPointerKey(entry.artifact);
    if (!verified.has(key)) {
      await context.loadBytes(entry.artifact);
    }
    addAllowedRole(verified, entry.artifact, entry.role);
  }
  return verified;
}

function assertSourceReferenceClosure(value, context, options, nativeRoles) {
  const allowed = new Map(
    [...nativeRoles].map(([key, roles]) => [key, new Set(roles)]),
  );
  for (const [port, artifacts] of Object.entries(
    context.loadedInputs ?? {},
  )) {
    for (const { ref } of artifacts) {
      addAllowedRole(allowed, ref, port);
    }
  }
  for (const [stage, outputs] of Object.entries(
    context.loadedHandoffs ?? {},
  )) {
    for (const artifacts of Object.values(outputs)) {
      for (const { ref } of artifacts) {
        addAllowedRole(allowed, ref, `${stage}-handoff`);
      }
    }
  }
  for (const sourceRef of collectSourceReferences(value, options)) {
    const roles = allowed.get(exactPointerKey(sourceRef.artifact));
    if (!roles) {
      failLineage(
        "source reference is not an exact input, prior handoff, or verified native artifact",
      );
    }
    if (!roles.has(sourceRef.role)) {
      failLineage(
        `source reference role ${sourceRef.role} does not match the exact runtime evidence role`,
      );
    }
  }
}

const STATE_POINTER_PORTS = Object.freeze({
  projectContext: "project-context",
  requirementsBaseline: "requirements-baseline",
  projectOverviewBaseline: "project-overview-baseline",
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

function samePlugin(left, right) {
  return left?.id === right?.id && left?.version === right?.version;
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

function assertCurrentOrHistoricalPointer(label, actual, currentPort, historicalPort, context) {
  const current = loadedRef(context, currentPort);
  if (samePointer(actual, current)) return;
  const historical = loadedRef(context, historicalPort);
  if (!historical) {
    failLineage(`${label} differs from current state without explicit ${historicalPort}`);
  }
  assertPointer(label, actual, historical);
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
  const projectContext = oneLoaded(context.loadedInputs, "project-context");
  if (
    !projectContext ||
    state.projectLifecycle !== projectContext.value.lifecycle
  ) {
    failLineage(
      "project state lifecycle does not match the loaded project context",
    );
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
  const repository = oneLoaded(
    context.loadedInputs,
    "repository-snapshot",
  );
  if (
    !repository ||
    snapshot.repositoryRevision.revision !== repository.value.revision ||
    snapshot.repositoryRevision.treeDigest !== repository.value.treeDigest
  ) {
    failLineage(
      "current architecture snapshot revision does not match the loaded repository",
    );
  }
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
  assertCurrentOrHistoricalPointer(
    "architecture baseline project context",
    baseline.projectContext,
    "project-context",
    "architecture-baseline-project-context",
    context,
  );
  if (baseline.repositorySnapshot) {
    assertCurrentOrHistoricalPointer(
      "architecture baseline repository",
      baseline.repositorySnapshot,
      "repository-snapshot",
      "architecture-baseline-repository-snapshot",
      context,
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
  const record = options.resolveAttached?.(section.artifact);
  if (!record?.value) {
    failLineage(`attached ${name} section was not resolved`);
  }
  return record.value;
}

function nativeEntries(section, options) {
  return resolveLineageSection(
    section,
    "native artifacts",
    options,
  ).entries;
}

function producerBinding(context, stage) {
  const binding = context.invocation.adapters?.find(
    (candidate) =>
      candidate.step === stage &&
      samePlugin(candidate.plugin, context.producer?.plugin),
  );
  if (
    !binding ||
    typeof binding.config?.toolName !== "string" ||
    typeof binding.config?.toolVersion !== "string"
  ) {
    failLineage(`${stage} adapter lacks explicit tool identity config`);
  }
  return binding;
}

function assertNativeProducer(section, options, context, stage) {
  const owned = nativeEntries(section, options).filter(
    (entry) => entry.producedBy.stage === stage,
  );
  const binding = producerBinding(context, stage);
  if (
    owned.length === 0 ||
    owned.some(
      (entry) =>
        entry.producedBy.adapterId !== context.producer.plugin.id ||
        entry.producedBy.adapterVersion !== context.producer.plugin.version ||
        entry.producedBy.tool?.name !== binding.config.toolName ||
        entry.producedBy.tool?.version !== binding.config.toolVersion,
    )
  ) {
    failLineage(
      `${stage} native provenance does not match the configured plug-in and tool`,
    );
  }
}

function assertExclusiveNativeStage(section, options, stage) {
  const unexpected = nativeEntries(section, options).find(
    (entry) => entry.producedBy.stage !== stage,
  );
  if (unexpected) {
    failLineage(
      `${stage} handoff contains ${unexpected.producedBy.stage} native artifact ${unexpected.id}`,
    );
  }
}

function assertDesignerLineage(value, context, options) {
  producerStep(context, "designer");
  assertExclusiveNativeStage(value.nativeArtifacts, options, "designer");
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
  assertExclusiveNativeStage(value.nativeArtifacts, options, "modeler");
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

function assertNativeExact(candidateEntries, requiredEntries, owner) {
  const byId = new Map(candidateEntries.map((entry) => [entry.id, entry]));
  if (byId.size !== requiredEntries.length) {
    failLineage(
      `terminal candidate changed the ${owner} native artifact set`,
    );
  }
  for (const entry of requiredEntries) {
    const candidate = byId.get(entry.id);
    if (
      !candidate ||
      canonicalJsonDigest(candidate) !== canonicalJsonDigest(entry)
    ) {
      failLineage(
        `terminal candidate replaced ${owner} native artifact ${entry.id}`,
      );
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
  const discoveryEntry = candidateEntries.find(
    (entry) => entry.producedBy.stage === "discovery",
  );
  if (discoveryEntry) {
    failLineage(
      `terminal candidate must preserve discovery evidence through its snapshot reference, not native artifact ${discoveryEntry.id}`,
    );
  }
  assertNativeExact(
    candidateEntries.filter(
      (entry) => entry.producedBy.stage === "designer",
    ),
    nativeEntries(designer.value.nativeArtifacts, designerOptions),
    "designer",
  );
  assertNativeExact(
    candidateEntries.filter(
      (entry) => entry.producedBy.stage === "modeler",
    ),
    nativeEntries(modeler.value.nativeArtifacts, modelerOptions),
    "modeler",
  );
}

function assertContinuationLineage(value, context) {
  const sourceInvocation = value.sourceInvocation;
  if (
    sourceInvocation.invocationId !== context.producer?.invocationId ||
    sourceInvocation.invocationFingerprint !==
      context.producer?.invocationFingerprint ||
    !samePlugin(sourceInvocation.plugin, context.producer?.plugin) ||
    sourceInvocation.stepInvocationDigest !==
      context.producer?.stepInvocationDigest
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
      recorded.sourceInvocation.invocationId !==
        actual.sourceInvocation.invocationId ||
      recorded.sourceInvocation.invocationFingerprint !==
        actual.sourceInvocation.invocationFingerprint ||
      !samePlugin(
        recorded.sourceInvocation.plugin,
        actual.sourceInvocation.plugin,
      ) ||
      recorded.sourceInvocation.stepInvocationDigest !==
        actual.sourceInvocation.stepInvocationDigest ||
      recorded.stepInvocationDigest !== actual.stepInvocationDigest ||
      recorded.stepResultDigest !== actual.digest ||
      canonicalJsonDigest(recorded.outputs) !==
        canonicalJsonDigest(actual.outputs)
    ) {
      failLineage("continuation completed-stage provenance is invalid");
    }
  }
}

async function assertContinuationSourceCheckpoint(value, context) {
  if (typeof context.loadCheckpoint !== "function") {
    failLineage("continuation resume requires a checkpoint loader");
  }
  const sourceInvocation = value.sourceInvocation;
  const checkpoint = await context.loadCheckpoint(
    sourceInvocation.stepInvocationDigest,
  );
  if (!checkpoint) {
    failLineage("continuation source terminal checkpoint is missing");
  }
  const moduleResult = checkpoint.moduleResult;
  if (
    checkpoint.disposition !== "terminal" ||
    checkpoint.invocationId !== sourceInvocation.invocationId ||
    checkpoint.invocationFingerprint !==
      sourceInvocation.invocationFingerprint ||
    !samePlugin(checkpoint.plugin, sourceInvocation.plugin) ||
    checkpoint.stepInvocationDigest !==
      sourceInvocation.stepInvocationDigest ||
    checkpoint.step !== value.activeStage ||
    checkpoint.chainFingerprint !== value.chainFingerprint ||
    moduleResult?.invocationId !== sourceInvocation.invocationId ||
    moduleResult?.outcome !== "needs_clarification"
  ) {
    failLineage("continuation source terminal checkpoint is invalid");
  }
  const outputNames = Object.keys(moduleResult.outputs ?? {}).sort();
  if (
    outputNames.length !== 2 ||
    outputNames[0] !== "clarification-requests" ||
    outputNames[1] !== "continuation"
  ) {
    failLineage(
      "continuation source checkpoint has invalid clarification outputs",
    );
  }
  const request = oneLoaded(
    context.loadedInputs,
    "clarification-request",
  );
  const requestRefs = moduleResult.outputs["clarification-requests"];
  const continuationRefs = moduleResult.outputs.continuation;
  if (
    !request ||
    requestRefs?.length !== 1 ||
    continuationRefs?.length !== 1 ||
    !samePointer(requestRefs[0], request.ref) ||
    !samePointer(continuationRefs[0], context.ref)
  ) {
    failLineage(
      "continuation source checkpoint does not bind the exact clarification artifacts",
    );
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
  if (typeof context.loadArtifact !== "function") {
    throw new Error(
      "attached architecture sections require a verified artifact-record loader",
    );
  }
  const resolved = new Map();
  for (const ref of refs) {
    resolved.set(refKey(ref), await context.loadArtifact(ref));
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
  const verifiedNativeRefs = await verifyNativeArtifactBytes(
    value,
    context,
    options,
  );
  assertSourceReferenceClosure(value, context, options, verifiedNativeRefs);

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
    value.kind === "ArchitectureBaseline" &&
    context.invocation?.module?.id === "architecture-design"
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
    const request = oneLoaded(
      context.loadedArtifacts,
      "clarification-requests",
    );
    if (!request) {
      failLineage(
        "architecture continuation output is missing its clarification request",
      );
    }
    validateArchitectureClarificationIssuance({
      invocation: context.invocation,
      clarificationRequestRef: request.ref,
      clarificationRequest: request.value,
      continuationRef: context.ref,
      continuation: value,
    });
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
    const requirements = oneLoaded(
      context.loadedInputs,
      "requirements-baseline",
    );
    const projectOverview = oneLoaded(
      context.loadedInputs,
      "project-overview-baseline",
    );
    if (!state || !requirements || !projectOverview) {
      throw new Error(
        "ArchitectureDraft validation requires loaded project state, requirements, and project overview",
      );
    }
    validateArchitectureDraftAgainstState({
      projectArchitectureState: state.value,
      projectArchitectureStateRef: state.ref,
      requirementsBaseline: requirements.value,
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
    const requirements = oneLoaded(
      context.loadedInputs,
      "requirements-baseline",
    );
    const projectOverview = oneLoaded(
      context.loadedInputs,
      "project-overview-baseline",
    );
    if (!state || !baseline || !requirements || !projectOverview) {
      throw new Error(
        "ArchitectureChangeSetDraft validation requires loaded state, baseline, requirements, and project overview",
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
      approvedRequirementIds: new Set(
        normativeRequirementIds(requirements.value.requirements),
      ),
    };
    validateArchitectureChangeSetAgainstState({
      projectArchitectureState: state.value,
      projectArchitectureStateRef: state.ref,
      requirementsBaseline: requirements.value,
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
    await assertContinuationSourceCheckpoint(value, context);
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
    ...requirementsRuntimeArtifactContracts(),
    ...[...ARCHITECTURE_SCHEMAS].map((schema) => ({
      schema,
      validate: validateArchitectureRuntimeArtifact,
    })),
  ];
}
