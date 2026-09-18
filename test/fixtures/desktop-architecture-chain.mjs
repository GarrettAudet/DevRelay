// Synthetic candidate data for exercising the actual Desktop/Core chain.
// This is not a design recommendation, upstream conformance or owner acceptance.
import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "../../src/content-digest.mjs";
import { normativeRequirementIds } from "../../src/requirements-artifact-validator.mjs";
import { architectureNativeBytes } from "../native-architecture-fixtures.mjs";

export function materializeDesktopArchitectureChain({ fx, invocation, requirements, requiredContracts = true }) {
  const read = name => JSON.parse(readFileSync(new URL(`../../examples/artifacts/${name}`, import.meta.url)));
  const approved = normativeRequirementIds(requirements.requirements);
  const primary = approved[0];
  if (!primary) throw new Error("fixture requires approved requirement identities");
  const files = new Map();
  const transform = value => {
    if (!value || typeof value !== "object") return;
    if (value.contractGeneration) value.contractGeneration = { required: requiredContracts, suggestedKinds: requiredContracts ? ["json-schema"] : [] };
    if (Array.isArray(value.sourceRequirementIds) && value.sourceRequirementIds.length) value.sourceRequirementIds = [primary];
    if (value.producedBy?.stage) {
      const binding = invocation.adapters.find(entry => entry.step === value.producedBy.stage);
      if (binding) value.producedBy = { ...value.producedBy, adapterId: binding.plugin.id, adapterVersion: binding.plugin.version,
        tool: { name: binding.config.toolName, version: binding.config.toolVersion } };
    }
    if (value.schema && architectureNativeBytes.has(value.artifactId)) {
      const descriptor = fx.write(`design/native-${value.artifactId}`, architectureNativeBytes.get(value.artifactId));
      if (descriptor.digest !== value.digest) throw new Error("fixture native digest drifted");
      files.set(canonicalJsonDigest(value), { path: descriptor.path, ref: structuredClone(value) });
    }
    Object.values(value).forEach(transform);
  };
  const save = (value, id, kind) => {
    const file = fx.json(`design/${id}.json`, value);
    const ref = { artifactId: id, schema: `https://devrelay.dev/artifacts/${kind}/v1`, mediaType: `application/vnd.devrelay.${kind}+json`, digest: file.digest, uri: `fixture://desktop-architecture/${id}` };
    files.set(canonicalJsonDigest(ref), { path: file.path, ref }); return ref;
  };
  const designer = read("architecture-designer-working-001.json");
  transform(designer);
  designer.projectArchitectureState = invocation.inputs["project-architecture-state"][0];
  designer.baseInputs = Object.entries(invocation.inputs).filter(([name]) => name !== "routing-decision").map(([role, refs]) => ({ role, artifact: refs[0] }));
  const designerRef = save(designer, designer.workingArtifactId, "architecture-designer-working");
  const modeler = read("architecture-modeler-working-001.json");
  transform(modeler);
  modeler.projectArchitectureState = designer.projectArchitectureState;
  modeler.designerWorkingArtifact = designerRef;
  modeler.diagrams.content.architectureModelDigest = canonicalJsonDigest(modeler.architectureModel.content);
  const modelerRef = save(modeler, modeler.workingArtifactId, "architecture-modeler-working");
  const draft = read("architecture-draft-001.json");
  transform(draft);
  for (const [field, port] of [["projectArchitectureState", "project-architecture-state"], ["requirementsBaseline", "requirements-baseline"], ["projectOverviewBaseline", "project-overview-baseline"], ["projectContext", "project-context"], ["repositorySnapshot", "repository-snapshot"], ["currentArchitectureSnapshot", "current-architecture-snapshot"]]) draft[field] = invocation.inputs[port][0];
  for (const name of ["technicalDesign", "interfaceIntent", "architectureConstraints"]) draft.sections[name] = structuredClone(designer[name]);
  for (const name of ["architectureModel", "diagrams"]) draft.sections[name] = structuredClone(modeler[name]);
  const targets = [...new Map(draft.traceability.flatMap(entry => entry.targets).map(target => [canonicalJsonDigest(target), target])).values()];
  draft.traceability = approved.map(requirementId => requirementId === primary
    ? { requirementId, disposition: "designed", targets, rationale: "Synthetic fixture mapping for chain-validation only." }
    : { requirementId, disposition: "no-architecture-impact", targets: [], rationale: "Synthetic fixture disposition; not an accepted design judgment." });
  const draftRef = save(draft, draft.draftId, "architecture-draft");
  return {
    draftRef, artifacts: [...files.values()],
    gateSubmission(repositoryRevision) {
      const evidence = (id, schema, content) => {
        const file = fx.write(`design/${id}.md`, Buffer.from(content));
        return { path: file.path, ref: { artifactId: id, schema, mediaType: "text/markdown", digest: file.digest, uri: `fixture://desktop-architecture/${id}` } };
      };
      const review = evidence("architecture-review-fixture", "https://devrelay.dev/evidence/architecture-gate-review/v1", "Synthetic Gate review fixture. Not a human acceptance of DevRelay architecture.");
      const supporting = evidence("architecture-support-fixture", "https://devrelay.dev/evidence/test/v1", "Synthetic supporting evidence for the Gate integration test only.");
      const owner = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureGateOwnerApproval", approvalId: "architecture-owner-fixture",
        authority: "project-owner", decision: "approve", policyVersion: "architecture-gate/0.1.0", candidate: draftRef,
        gateReview: review.ref, requiredEvidence: [supporting.ref], repositoryRevision };
      const ownerFile = fx.json("design/owner-fixture.json", owner);
      const ownerRef = { artifactId: owner.approvalId, schema: "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1",
        mediaType: "application/vnd.devrelay.architecture-gate-owner-approval+json", digest: ownerFile.digest, uri: "fixture://desktop-architecture/owner" };
      const sections = structuredClone(draft.sections);
      for (const decision of sections.decisionRecords.content.decisions) if (decision.status === "proposed") decision.status = "accepted";
      const baseline = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureBaseline", baselineId: "architecture-baseline-host-fixture",
        approvedDraft: draftRef, requirementsBaseline: draft.requirementsBaseline, projectOverviewBaseline: draft.projectOverviewBaseline,
        projectContext: draft.projectContext, repositorySnapshot: draft.repositorySnapshot, sections, approvalPolicyVersion: owner.policyVersion,
        approvalEvidence: [review.ref, supporting.ref, ownerRef], sourceRefs: draft.sourceRefs };
      const baselineRef = save(baseline, baseline.baselineId, "architecture-baseline");
      return fx.json("design/gate-submission.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopArchitectureGateSubmission",
        ownerApproval: { path: ownerFile.path, ref: ownerRef }, baseline: files.get(canonicalJsonDigest(baselineRef)), artifacts: [review, supporting] });
    },
    result(step) {
      const base = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleStepResult", invocationId: step.invocationId,
        invocationFingerprint: step.invocationFingerprint, chainFingerprint: step.chainFingerprint, stepInvocationDigest: step.stepInvocationDigest, step: step.step, plugin: step.plugin };
      if (step.step !== "decision-recorder") return { ...base, disposition: "continue", outputs: step.step === "designer"
        ? { "architecture-designer-working": [designerRef] } : { "architecture-modeler-working": [modelerRef] }, evidence: [], diagnostics: [] };
      return { ...base, disposition: "terminal", moduleResult: { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult",
        invocationId: step.invocationId, status: "completed", outcome: "baseline_drafted", outputs: { "architecture-draft": [draftRef] },
        evidence: ["architecture/chain-provenance", "architecture/contract-validation"].map(kind => ({ kind, subject: draftRef.artifactId, status: "pass", artifact: draftRef })), diagnostics: [] } };
    },
  };
}
