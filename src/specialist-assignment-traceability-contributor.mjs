import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";

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