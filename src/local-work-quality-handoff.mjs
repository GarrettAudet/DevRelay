import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { validateQualityContinuityArtifact } from "./quality-continuity-artifact-validator.mjs";
import { prepareLocalWorkQuality } from "./local-work-quality.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url)));
export const validateDesktopWorkQualitySubmission = compileArtifactSchema(read("desktop-work-quality-submission.schema.json"),
  [read("desktop-local-host-configuration.schema.json"), read("module-result.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);

// The host derives readiness from current activation and durable completion.
// This composition only prepares obligations, never approves or dispatches work.
export async function prepareLocalWorkQualityHandoff({ submission, readiness, workflowProfile, loadArtifact }) {
  if (!validateDesktopWorkQualitySubmission(submission)) throw new TypeError("work quality submission violates its closed contract");
  const { readinessDigest, ...readinessBody } = readiness;
  if (canonicalJsonDigest(readinessBody) !== readinessDigest || submission.readinessDigest !== readinessDigest ||
      !readiness.readyWorkItemIds.includes(submission.workItemId)) throw new TypeError("work quality requires exact current ready work");
  const context = await loadArtifactContent(submission.qualityContext.ref, { load: loadArtifact });
  validateQualityContinuityArtifact(context.value);
  if (context.value.kind !== "QualityPolicyContext" || context.ref.schema !== "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json" ||
      context.ref.mediaType !== "application/json") throw new TypeError("work quality context differs from owning contract");
  const prepared = await prepareLocalWorkQuality({ workBaselineRef: readiness.baselines.workBreakdownBaseline,
    workItemId: submission.workItemId, qualityPolicyRef: submission.qualityPolicy.ref, workflowProfile,
    riskContext: context.value.riskContext, changedSurfaces: context.value.changedSurfaces, technologies: context.value.technologies, loadArtifact });
  if (!same(prepared.context, context.value)) throw new TypeError("quality context does not exactly cover approved work criteria");
  const body = { kind: "DesktopWorkQualityHandoff", submission: structuredClone(submission), workflowProfile: structuredClone(workflowProfile), prepared };
  return { ...body, preparationDigest: canonicalJsonDigest(body) };
}

export async function verifyLocalWorkQualityHandoff({ record, readiness, loadArtifact }) {
  const expected = await prepareLocalWorkQualityHandoff({ submission: record.submission, workflowProfile: record.workflowProfile, readiness, loadArtifact });
  if (!same(expected, record)) throw new TypeError("stored work quality differs from exact derivation");
  return expected;
}
