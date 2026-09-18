import { resolveVerifiedArchitectureModelContent } from "../../src/architecture-artifact-validator.mjs";
import { validateWorkBreakdownCandidateAgainstInputs } from "../../src/work-breakdown-artifact-validator.mjs";
import { canonicalJson } from "../../src/content-digest.mjs";

// Synthetic protocol exercise only: one bounded fixture deliverable per scope.
// This is not an engineering plan for the project or evidence of implementation.
export function desktopWorkCandidate({ loadedInputs, nativeRef, architectureModelAttachment }) {
  const one = role => loadedInputs[role][0];
  const architecture = one("architecture-baseline");
  const model = resolveVerifiedArchitectureModelContent(architecture.value, { resolveAttached: () => architectureModelAttachment });
  const contracts = one("contract-disposition").value;
  const scope = [
    ...one("requirements-baseline").value.requirements.acceptanceCriteria.map((entry, index) => ({ kind: "acceptance-criterion", id: entry.id, role: "requirements-baseline", pointer: `/requirements/acceptanceCriteria/${index}` })),
    ...model.elements.map(entry => ({ kind: "architecture", id: entry.id, role: "architecture-baseline", pointer: "/sections/architectureModel" })),
    ...(contracts.mode === "baseline" ? contracts.contractTargets : []).map((entry, index) => ({ kind: "contract", id: entry.id, role: "contract-disposition", pointer: `/contractTargets/${index}` })),
  ];
  const workItems = scope.map((entry, index) => ({
    id: `WI-FIXTURE-${index + 1}`, objective: `Produce one synthetic fixture change for ${entry.id}.`,
    "bounded-scope": { included: [`Only fixture coverage of ${entry.id}.`], excluded: ["Production implementation, approval, assignment and execution."] },
    deliverables: [{ id: `DEL-FIXTURE-${index + 1}`, description: "One reviewable fixture source change.", artifactKind: "source-change" }],
    "work-type": "code-change", "acceptance-criterion-refs": entry.kind === "acceptance-criterion" ? [entry.id] : [],
    "architecture-refs": entry.kind === "architecture" ? [entry.id] : [], "contract-refs": entry.kind === "contract" ? [entry.id] : [],
    "required-capabilities": [one("capability-catalog").value.capabilities[0].id], "dependency-hints": [],
    "verification-plan": { checks: [{ id: `VC-FIXTURE-${index + 1}`, method: "Run the isolated fixture assertion.", successCriteria: `The fixture assertion for ${entry.id} passes.` }] },
    "required-evidence": [{ kind: "fixture-test-report", description: "Exact fixture test output; no production claim." }],
    "source-refs": [{ role: entry.role, artifact: one(entry.role).ref, jsonPointer: entry.pointer }],
  }));
  const candidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkBreakdownDraft", draftId: "WBD-DESKTOP-FIXTURE", operation: "establish-breakdown",
    inputBindings: Object.entries(loadedInputs).filter(([role]) => role !== "routing-decision").map(([role, [entry]]) => ({ role, artifact: entry.ref })),
    workItems, coverageDispositions: scope.map((entry, index) => ({ scopeKind: entry.kind, scopeRef: entry.id, disposition: "planned", workItemRefs: [workItems[index].id] })),
    nativeArtifacts: [nativeRef], sourceRefs: [...new Map(scope.map(entry => {
      const ref = { role: entry.role, artifact: one(entry.role).ref, jsonPointer: entry.pointer };
      return [canonicalJson(ref), ref];
    })).values()] };
  validateWorkBreakdownCandidateAgainstInputs({ candidate, operation: candidate.operation, loadedInputs, architectureModelAttachment });
  return candidate;
}
