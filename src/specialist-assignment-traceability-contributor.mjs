import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";

const WORK_ITEM_SCOPE = "work-breakdown/candidate";
const fail = (message) => { throw new TypeError(`specialist-assignment traceability contributor: ${message}`); };
const immutable = (value) => Object.freeze(structuredClone(value));

function locator(loaded, jsonPointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}
function loadedArtifact(context, outputName, expectedKind) {
  const entries = context?.loadedOutputs?.[outputName];
  if (!Array.isArray(entries) || entries.length !== 1) fail(`loadedOutputs.${outputName} must contain exactly one artifact`);
  const loaded = entries[0];
  validateSpecialistAssignmentArtifact(loaded.value);
  if (loaded.value.kind !== expectedKind) fail(`${outputName} is not ${expectedKind}`);
  return loaded;
}

function createContributor({ id, moduleId, operation, outcome, outputName, artifactKind, authority, scope, edgeKind }) {
  const matches = (context) => Boolean(
    context?.invocation?.module?.id === moduleId &&
    context.invocation.module.version === "1.0.0" &&
    context.invocation.module.operation === operation &&
    context?.moduleResult?.status === "completed" &&
    context.moduleResult.outcome === outcome
  );
  return Object.freeze({
    metadata: immutable({ id, version: "1.0.0" }),
    match: matches,
    scope,
    authority,
    ownership: immutable({ scope, authority, nodeKinds: ["specialist-profile"], edgeKinds: [edgeKind] }),
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const loaded = loadedArtifact(context, outputName, artifactKind);
      const nodes = [];
      const seen = new Set();
      const edges = loaded.value.assignments.map((assignment, position) => {
        if (!seen.has(assignment.specialistProfileRef)) {
          seen.add(assignment.specialistProfileRef);
          nodes.push({
            kind: "specialist-profile",
            stableId: assignment.specialistProfileRef,
            label: assignment.specialistProfileRef,
            attributes: {
              capabilityCoverage: structuredClone(assignment.capabilityCoverage),
              requiredTools: structuredClone(assignment.requiredTools),
              requiredGrants: structuredClone(assignment.requiredGrants),
            },
            sourceLocators: [locator(loaded, `/assignments/${position}/specialistProfileRef`, assignment.specialistProfileRef)],
          });
        }
        return {
          kind: edgeKind,
          source: { kind: "work-item", stableId: assignment.workItemRef, authority: "candidate", scope: WORK_ITEM_SCOPE },
          target: { kind: "specialist-profile", stableId: assignment.specialistProfileRef },
          rationale: assignment.assignmentRationale,
          sourceLocators: [locator(loaded, `/assignments/${position}`, assignment)],
        };
      });
      return {
        horizon: "implementation",
        nodes: nodes.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en")),
        edges: edges.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en")),
      };
    },
  });
}

export const specialistAssignmentCandidateTraceabilityContributor = createContributor({
  id: "devrelay.specialist-assignment-candidate",
  moduleId: "specialist-assignment",
  operation: "assign-specialists",
  outcome: "assigned",
  outputName: "specialist-assignment-draft",
  artifactKind: "SpecialistAssignmentDraft",
  authority: "candidate",
  scope: "specialist-assignment/candidate",
  edgeKind: "proposed-assignment",
});
export const specialistAssignmentBaselineTraceabilityContributor = createContributor({
  id: "devrelay.specialist-assignment-baseline",
  moduleId: "specialist-assignment-gate",
  operation: "promote-baseline",
  outcome: "promoted",
  outputName: "specialist-assignment-baseline",
  artifactKind: "SpecialistAssignmentBaseline",
  authority: "approved",
  scope: "specialist-assignment/baseline",
  edgeKind: "assigned-to",
});

// Opt-in projection for the durable v3 owning-Gate activation transaction.
// Released candidate-work contributors above remain unchanged.
export function createSpecialistAssignmentActivationTraceabilityContributor() {
  const match = context => context?.invocation?.module?.id === "work-breakdown" &&
    context.invocation.module.version === "0.1.0" && context.moduleResult?.status === "completed" && context.moduleResult.outcome === "decomposed" &&
    context.gate?.id === "specialist-assignment-gate" && context.gate.version === "3.0.0" && context.gate.outcome === "promoted" &&
    /^sha256:[a-f0-9]{64}$/.test(context.gate.commitDigest ?? "");
  const scope = "specialist-assignment/baseline";
  return Object.freeze({
    metadata: immutable({ id: "devrelay.specialist-assignment-activation", version: "1.0.0" }),
    match, scope, authority: "approved",
    ownership: immutable({ scope, authority: "approved", nodeKinds: ["specialist-profile"], edgeKinds: ["assigned-to"] }),
    async project(context) {
      if (!match(context)) fail("activation requires the owning v3 Gate context");
      const baseline = loadedArtifact(context, "specialist-assignment-baseline", "SpecialistAssignmentBaseline");
      const draft = loadedArtifact(context, "specialist-assignment-draft", "SpecialistAssignmentDraft");
      if (baseline.value.version !== "3.0.0" || canonicalJson(baseline.ref) !== canonicalJson(context.gate.baseline) ||
          canonicalJson(baseline.value.approvedDraft) !== canonicalJson(draft.ref) || canonicalJson(baseline.value.assignments) !== canonicalJson(draft.value.assignments)) fail("approved baseline differs from the Gate or its draft");
      const workEntries = context.loadedOutputs?.["work-breakdown-baseline"];
      const catalogs = context.loadedOutputs?.["specialist-catalog"];
      if (workEntries?.length !== 1 || catalogs?.length !== 1) fail("activation requires exact approved work and specialist catalog");
      const work = workEntries[0], catalog = catalogs[0];
      validateWorkBreakdownArtifact(work.value, { ref: work.ref });
      if (work.value.kind !== "WorkBreakdownBaseline" || catalog.value.kind !== "SpecialistCatalog") fail("activation inputs have incompatible kinds");
      for (const [role, ref] of [["work-breakdown-baseline", work.ref], ["specialist-catalog", catalog.ref]]) {
        const bindings = draft.value.inputBindings.filter(entry => entry.role === role);
        if (bindings.length !== 1 || canonicalJson(bindings[0].artifact) !== canonicalJson(ref)) fail(`activation changes ${role} lineage`);
      }
      if (canonicalJson(work.value.workItems.map(entry => entry.id).sort()) !== canonicalJson(baseline.value.assignments.map(entry => entry.workItemRef).sort())) fail("activation omits approved work items");
      const nodes = [];
      const seen = new Set();
      const edges = baseline.value.assignments.map((assignment, position) => {
        const profiles = catalog.value.profiles.filter(entry => entry.id === assignment.specialistProfileRef);
        if (profiles.length !== 1) fail("assignment profile is missing or ambiguous in its exact catalog");
        if (!seen.has(assignment.specialistProfileRef)) {
          seen.add(assignment.specialistProfileRef);
          const profile = profiles[0];
          const index = catalog.value.profiles.indexOf(profile);
          nodes.push({ kind: "specialist-profile", stableId: profile.id, label: profile.name ?? profile.id,
            attributes: { capabilityIds: [...(profile.capabilityIds ?? [])], toolIds: [...(profile.toolIds ?? [])], grantIds: [...(profile.grantIds ?? [])] },
            sourceLocators: [locator(catalog, `/profiles/${index}`, profile)] });
        }
        return { kind: "assigned-to", source: { kind: "work-item", stableId: assignment.workItemRef, authority: "approved", scope: "work-breakdown/baseline" },
          target: { kind: "specialist-profile", stableId: assignment.specialistProfileRef }, rationale: assignment.assignmentRationale,
          sourceLocators: [locator(baseline, `/assignments/${position}`, assignment)] };
      });
      const order = (a, b) => canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0;
      return { horizon: "implementation", nodes: nodes.sort(order), edges: edges.sort(order),
        ...(edges.length ? {} : { reason: "The approved assignment baseline contains no work items." }) };
    },
  });
}
