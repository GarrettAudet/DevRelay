import { canonicalJsonDigest } from "./content-digest.mjs";
import { verifyLocalSpecialistAssignmentInputs } from "./local-specialist-assignment-planning.mjs";
import { assertLocalDependencyBaselineCurrent } from "./local-dependency-baseline-activation.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { createSpecialistAssignmentRuntimeV3, SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING } from "./specialist-assignment-runtime-v3.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
async function prepare({ assignmentBinding, assignmentPlan, ...request }) {
  if (!assignmentBinding || !same(assignmentBinding, SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING)) throw new TypeError("assignment requires an explicit supported native binding");
  const prepared = await verifyLocalSpecialistAssignmentInputs({ ...request, expectedPlan: assignmentPlan });
  const executionId = `local-assignment-${canonicalJsonDigest({ invocation: request.checkpointReplay.invocation, plan: prepared.plan }).slice(7)}`;
  const inputBindings = Object.entries(prepared.plan.inputs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([role, artifact]) => ({ role, artifact }));
  const executionFingerprint = canonicalJsonDigest({ executionId, module: { ...prepared.plan.module, operation: prepared.plan.operation }, inputBindings, binding: assignmentBinding });
  const runtime = createSpecialistAssignmentRuntimeV3({ binding: assignmentBinding,
    checkpointStore: createLocalHostCheckpointStore({ storage: request.storage, namespace: `${request.namespace}/specialist-assignment-v3` }),
    beforeFreshExecution() {
      assertLocalDependencyBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: prepared.plan.inputs["work-dependency-baseline"] });
      assertLocalWorkBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: prepared.plan.inputs["work-breakdown-baseline"] });
      assertLocalWorkContextCurrent({ storage: request.storage, namespace: request.namespace, boundary: request.boundary,
        state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
    } });
  return { runtime, executionId, executionFingerprint, inputs: prepared.plan.inputs, loadArtifact: request.loadArtifact };
}

export async function executeLocalSpecialistAssignment(request) {
  const prepared = await prepare(request);
  const execution = await prepared.runtime.execute(prepared);
  if (execution.executionFingerprint !== prepared.executionFingerprint) throw new TypeError("assignment runtime identity differs from exact host inputs");
  return execution;
}
export async function verifyLocalSpecialistAssignmentExecution({ assignmentExecution, ...request }) {
  const prepared = await prepare(request);
  if (assignmentExecution?.executionId !== prepared.executionId || assignmentExecution?.executionFingerprint !== prepared.executionFingerprint) throw new TypeError("assignment execution identity differs from exact host inputs");
  const receipt = await prepared.runtime.verifyCheckpointedExecution(prepared);
  if (typeof assignmentExecution.replayed !== "boolean" || !same({ ...receipt.checkpoint.receipt, replayed: assignmentExecution.replayed }, assignmentExecution)) throw new TypeError("assignment execution differs from durable checkpoint");
  return receipt;
}
