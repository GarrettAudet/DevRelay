import { canonicalJsonDigest } from "./content-digest.mjs";
import { verifyLocalWorkContinuityClaim } from "./local-work-continuity.mjs";
import { createWorkContinuityIndex, transitionWorkAttempt } from "./work-continuity.mjs";

// Finish recording a known, durably recorded effect. Never initiates creation.
export async function settleRecordedDesktopDispatch(request) {
  const allowed = ["storage", "store", "worktrees", "runtime", "coordinator", "effectRunId", "runId", "workItemId", "memoryBootstrap", "claim"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) throw new TypeError("dispatch settlement: undeclared input");
  const { storage, store, worktrees, runtime, coordinator, effectRunId, runId, workItemId, memoryBootstrap, claim } = request;
  if (!claim || Object.keys(claim).some(key => !["attemptId", "owner", "leaseExpiresAt", "expectedHostVersion", "expectedIndexRevision"].includes(key))) {
    throw new TypeError("dispatch settlement: undeclared claim input");
  }
  const plan = runtime.loadTaskPlan(runId, { workItemId, memoryBootstrap });
  const effect = coordinator.inspect(effectRunId);
  if (effect.state.phase !== "recorded" || effect.state.attemptId !== plan.attemptId ||
      effect.state.workItemId !== workItemId || effect.state.repositoryRevision !== plan.startingRevision ||
      effect.state.worktree !== plan.worktreeLease.workspace || effect.state.idempotencyKey !== plan.idempotencyKey ||
      effect.state.executor.id !== plan.executor.id ||
      effect.state.executor.configurationDigest !== plan.workFingerprint?.material?.implementationConfigurationDigest) {
    throw new TypeError("dispatch settlement: exact recorded effect is required");
  }
  if (claim?.attemptId !== plan.attemptId) throw new TypeError("dispatch settlement: claim attempt differs");
  verifyLocalWorkContinuityClaim({ storage, store, workFingerprint: plan.workFingerprint, ...claim });
  const replay = await coordinator.execute(effectRunId);
  if (replay.outcome !== "replayed" || replay.executorCalls !== 0) throw new TypeError("dispatch settlement: effect replay was not read-only");
  const receipt = replay.result;
  // Each step has exact replay behavior. An interruption between steps leaves
  // evidence for the next call, never permission to recreate the provider task.
  runtime.recordTaskDispatch({ plan, memoryBootstrap, receipt });
  worktrees.bindTask(plan.attemptId, receipt.taskId);
  verifyLocalWorkContinuityClaim({ storage, store, workFingerprint: plan.workFingerprint, ...claim });
  const current = store.read();
  const attempt = current.state.index.records.find(item => item.attemptId === plan.attemptId);
  const transition = { kind: "LocalDesktopDispatched", attemptId: plan.attemptId, planDigest: plan.planDigest, receiptDigest: receipt.receiptDigest };
  if (attempt.status !== "prepared") {
    const exact = storage.readTransitionJournal(store.runId).filter(row => canonicalJsonDigest(row.transition) === canonicalJsonDigest(transition));
    if (exact.length !== 1 || !exact[0].checkpointRef) throw new TypeError("dispatch settlement: advanced attempt lacks exact dispatch evidence");
    const checkpoint = JSON.parse(storage.getArtifact(exact[0].checkpointRef));
    if (canonicalJsonDigest(checkpoint) !== canonicalJsonDigest(createWorkContinuityIndex({ records: checkpoint.records, revision: checkpoint.revision }))) {
      throw new TypeError("dispatch settlement: invalid dispatch checkpoint");
    }
    const recorded = checkpoint.records?.find(item => item.attemptId === plan.attemptId);
    if (recorded?.status !== "dispatched" || recorded.receiptDigest !== receipt.receiptDigest ||
        recorded.fingerprint !== plan.workFingerprint.fingerprint) throw new TypeError("dispatch settlement: dispatch checkpoint differs");
    return receipt;
  }
  store.commit({ expectedHostVersion: current.version, expectedIndexRevision: current.state.index.revision,
    transition, nextIndex: transitionWorkAttempt({ index: current.state.index, expectedRevision: current.state.index.revision,
      attemptId: plan.attemptId, fromStatus: "prepared", toStatus: "dispatched", receiptDigest: receipt.receiptDigest }) });
  return receipt;
}
