import { canonicalJsonDigest } from "./content-digest.mjs";
import { createDesktopTaskPlan } from "./desktop-task-adapter.mjs";
import { recoverLocalWorkContinuityClaim } from "./local-work-continuity.mjs";
import { findExactWorkReuse } from "./work-continuity.mjs";

// Local host composition only. This neither claims work nor invokes a provider.
// The host supplies validated execution/quality inputs and exact claim identity;
// this boundary reobserves continuity and Git before binding prepared memory.
export function prepareClaimedDesktopTaskPlan(request) {
  const allowed = ["storage", "store", "worktrees", "claim", "runId", "workFingerprint", "qualityResolution",
    "executor", "grants", "promptArtifact", "memoryBootstrap", "now"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) throw new TypeError("Desktop preparation: undeclared input");
  const { storage, store, worktrees, claim, runId, workFingerprint, qualityResolution, executor, grants,
    promptArtifact, memoryBootstrap, now } = request;
  const claimKeys = ["attemptId", "owner", "leaseExpiresAt", "expectedHostVersion", "expectedIndexRevision"];
  if (!claim || Object.keys(claim).some(key => !claimKeys.includes(key))) throw new TypeError("Desktop preparation: undeclared claim input");
  const recover = () => recoverLocalWorkContinuityClaim({ storage, store, workFingerprint, ...claim, now });
  recover();
  const observation = worktrees.inspectForDispatch(claim.attemptId);
  if (observation.attemptId !== claim.attemptId || observation.runId !== runId ||
      observation.workItemId !== workFingerprint.material.workItem.id ||
      observation.observedRevision !== workFingerprint.material.targetRevision) throw new TypeError("Desktop preparation: worktree identity differs from claimed work");
  const { stateVersion, ...worktreeLease } = observation;
  const workContinuityDecision = findExactWorkReuse({ index: store.read().state.index, workFingerprint,
    targetRevision: workFingerprint.material.targetRevision, qualityResolutionDigest: qualityResolution.resolutionDigest });
  const plan = createDesktopTaskPlan({ runId, projectId: workFingerprint.material.projectId,
    workItem: workFingerprint.material.workItem, startingRevision: workFingerprint.material.targetRevision,
    assignment: workFingerprint.material.assignment, worktreeLease, executor, grants, promptArtifact, memoryBootstrap,
    workFingerprint, qualityResolution, workContinuityDecision });
  // Detect synchronous observation callbacks or concurrent host updates during
  // preparation. This is not a substitute for dispatch-time CAS/checkpointing.
  recover();
  if (canonicalJsonDigest(worktrees.inspectForDispatch(claim.attemptId)) !== canonicalJsonDigest(observation)) {
    throw new TypeError("Desktop preparation: worktree observation changed");
  }
  return plan;
}
