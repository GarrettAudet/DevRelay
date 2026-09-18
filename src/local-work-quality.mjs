import { loadArtifactContent } from "./artifact-runtime.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateQualityContinuityArtifact } from "./quality-continuity-artifact-validator.mjs";
import { createQualityPolicyContext, resolveQualityObligations } from "./quality-policy.mjs";

// Explicit host projection between the owning WorkBreakdown and QualityPolicy
// contracts. Never add a type alias to the approved baseline or default it to
// unspecified: that would silently miss work-type-specific quality obligations.
export async function prepareLocalWorkQuality(request) {
  const allowed = ["workBaselineRef", "workItemId", "qualityPolicyRef", "workflowProfile", "riskContext", "changedSurfaces", "technologies", "loadArtifact"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) throw new TypeError("work quality: undeclared input");
  const { workBaselineRef, workItemId, qualityPolicyRef, workflowProfile, riskContext, changedSurfaces, technologies, loadArtifact } = request;
  const [work, policy] = await Promise.all([workBaselineRef, qualityPolicyRef].map(ref => loadArtifactContent(ref, { load: loadArtifact })));
  validateWorkBreakdownArtifact(work.value, { ref: work.ref });
  validateQualityContinuityArtifact(policy.value);
  if (work.value.kind !== "WorkBreakdownBaseline" || policy.value.kind !== "QualityPolicyBaseline") throw new TypeError("work quality: exact baselines required");
  if (policy.ref.schema !== "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json" || policy.ref.mediaType !== "application/json") {
    throw new TypeError("work quality: policy reference differs from owning Module port");
  }
  const item = work.value.workItems.find(entry => entry.id === workItemId);
  if (!item) throw new TypeError("work quality: work item is absent from approved work");
  const context = createQualityPolicyContext({ riskContext, changedSurfaces, technologies,
    acceptanceCriteria: item["acceptance-criterion-refs"] });
  const resolution = resolveQualityObligations({ baseline: policy.value, workflowProfile, context,
    workItem: { id: item.id, type: item["work-type"] } });
  return { workBaselineRef: work.ref, qualityPolicyRef: policy.ref, workItem: structuredClone(item), context, resolution };
}
