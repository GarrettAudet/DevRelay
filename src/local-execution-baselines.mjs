import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { verifyLocalAssignmentBaselineActivation, assertLocalAssignmentBaselineCurrent } from "./local-assignment-baseline-activation.mjs";
import { assertLocalDependencyBaselineCurrent } from "./local-dependency-baseline-activation.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`execution baselines: ${message}`); };

// Host-owned bridge from the full verified activation chain. No caller-provided
// baseline map is consumed. This checks current heads after async verification,
// but does not reserve work or authorize a worker/provider invocation.
export async function prepareLocalExecutionBaselines(request) {
  if (Object.hasOwn(request, "baselines")) fail("caller baseline overrides are forbidden");
  const activation = await verifyLocalAssignmentBaselineActivation(request);
  const work = await loadArtifactContent(request.record.baseline.ref, {
    load: () => Buffer.from(request.record.baseline.bytesBase64, "base64"),
  });
  const inputs = request.checkpointReplay.loadedInputs;
  const baselines = {};
  for (const [role, name] of [["requirements-baseline", "requirementsBaseline"],
    ["project-overview-baseline", "projectOverviewBaseline"], ["architecture-baseline", "architectureBaseline"],
    ["contract-disposition", "contractDisposition"]]) {
    const bound = work.value.inputBindings.filter(entry => entry.role === role);
    if (inputs[role]?.length !== 1 || bound.length !== 1 || !same(bound[0].artifact, inputs[role][0].ref)) {
      fail(`approved work changes ${role} lineage`);
    }
    baselines[name] = inputs[role][0].ref;
  }
  baselines.workBreakdownBaseline = work.ref;
  baselines.workDependencyBaseline = request.assignmentPlan.inputs["work-dependency-baseline"];
  baselines.specialistAssignmentBaseline = activation.baseline;
  const { storage, namespace } = request;
  assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline: baselines.specialistAssignmentBaseline });
  assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: baselines.workDependencyBaseline });
  assertLocalWorkBaselineCurrent({ storage, namespace, baseline: baselines.workBreakdownBaseline });
  assertLocalWorkContextCurrent({ storage, namespace, boundary: request.boundary,
    state: inputs["project-work-breakdown-state"][0].ref });
  return structuredClone(baselines);
}
