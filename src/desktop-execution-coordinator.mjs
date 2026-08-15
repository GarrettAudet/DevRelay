import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

export class DesktopExecutionCoordinatorError extends Error {
  constructor(message, code = "DR4760") { super(`Desktop execution coordinator: ${message}`); this.name = "DesktopExecutionCoordinatorError"; this.code = code; }
}
const fail = (message, code) => { throw new DesktopExecutionCoordinatorError(message, code); };
const frozen = (value) => Object.freeze(structuredClone(value));
const sorted = (values) => [...values].sort();
const covers = (required, supplied) => {
  const available = new Set(supplied);
  return required.every((value) => available.has(value));
};

export function createDesktopExecutionCoordinator({ storage, worktreeManager, executors, failureInjector = () => {} }) {
  if (!storage || !worktreeManager || !executors || typeof executors !== "object") fail("storage, worktree manager, and executor registry are required");
  const registry = new Map(Object.entries(executors));
  const bindingFor = (request) => {
    const supplied = request.executor;
    const trusted = registry.get(supplied?.id);
    if (!trusted || trusted.version !== supplied.version || trusted.configurationDigest !== supplied.configurationDigest) fail("executor identity or configuration was substituted", "DR4761");
    if (
      !covers(request.requiredCapabilities ?? [], trusted.capabilities ?? []) ||
      !covers(request.requiredGrants ?? [], trusted.grants ?? [])
    ) fail("executor capability or grant coverage is incomplete", "DR4761");
    const worktree = worktreeManager.inspect(request.attemptId);
    if (worktree.workItemId !== request.workItemId || worktree.revision !== request.repositoryRevision) fail("worktree binding is stale or substituted", "DR4762");
    const material = {
      runId: request.runId,
      attemptId: request.attemptId,
      workItemId: request.workItemId,
      repositoryRevision: request.repositoryRevision,
      worktree: worktree.workspace,
      executor: supplied,
      requiredCapabilities: sorted(request.requiredCapabilities ?? []),
      requiredGrants: sorted(request.requiredGrants ?? []),
      idempotencyKey: request.idempotencyKey,
    };
    if (!material.runId || !material.workItemId || !material.idempotencyKey) fail("run, work item, and idempotency identities are required");
    return { trusted, state: { phase: "prepared", ...material, bindingDigest: canonicalJsonDigest(material) } };
  };
  const artifact = (state, result) => storage.putArtifact({
    artifactId: `DESKTOP-EXECUTION-${state.runId}`,
    bytes: Buffer.from(canonicalJson({ bindingDigest: state.bindingDigest, idempotencyKey: state.idempotencyKey, result }), "utf8"),
    mediaType: "application/vnd.devrelay.desktop-execution-receipt+json",
    provenance: [],
  });
  const commit = (run, lease, transition, nextState, refs = []) => storage.commitTransition({
    runId: run.runId,
    expectedVersion: run.version,
    leaseToken: lease.token,
    transition,
    nextState,
    artifactRefs: refs,
    checkpointRef: refs[0] ?? null,
  });

  return Object.freeze({
    prepare(request) {
      const { state } = bindingFor(request);
      const initialized = storage.initializeRun({ runId: state.runId, state });
      failureInjector({ boundary: "after-prepared", runId: state.runId });
      return frozen({ runId: state.runId, phase: initialized.state.phase, bindingDigest: state.bindingDigest, version: initialized.version });
    },
    async execute(runId) {
      let run = storage.readRun(runId);
      if (run.state.phase === "recorded") return frozen({ outcome: "replayed", executorCalls: 0, receipt: run.artifactRefs[0], result: JSON.parse(storage.getArtifact(run.artifactRefs[0])).result });
      if (run.state.phase !== "prepared") return frozen({ outcome: "quarantined", executorCalls: 0, phase: run.state.phase });
      const trusted = registry.get(run.state.executor.id);
      if (!trusted || trusted.version !== run.state.executor.version || trusted.configurationDigest !== run.state.executor.configurationDigest) fail("approved executor is no longer available", "DR4761");
      const lease = storage.acquireLease({ runId, owner: `desktop-executor:${run.state.executor.id}`, expectedVersion: run.version });
      run = commit(run, lease, { operation: "authorize-effect", idempotencyKey: run.state.idempotencyKey }, { ...run.state, phase: "effect-started" });
      failureInjector({ boundary: "after-effect-state", runId });
      try {
        const result = await trusted.execute(frozen({ ...run.state, worktree: run.state.worktree }));
        failureInjector({ boundary: "after-effect", runId });
        const receipt = artifact(run.state, result);
        failureInjector({ boundary: "after-artifact", runId });
        const recorded = commit(run, lease, { operation: "record-effect", idempotencyKey: run.state.idempotencyKey }, { ...run.state, phase: "recorded", receipt }, [receipt]);
        failureInjector({ boundary: "after-recorded", runId });
        storage.releaseLease({ runId, leaseToken: lease.token });
        return frozen({ outcome: "recorded", executorCalls: 1, receipt, version: recorded.version, result });
      } catch (error) {
        try { storage.releaseLease({ runId, leaseToken: lease.token }); } catch {}
        throw error;
      }
    },
    async resume({ runId, workItemId, executor }) {
      const run = storage.readRun(runId);
      if (run.state.workItemId !== workItemId || run.state.executor.id !== executor.id || run.state.executor.configurationDigest !== executor.configurationDigest) fail("resume binding was substituted", "DR4761");
      if (run.state.phase === "recorded") return this.execute(runId);
      if (run.state.phase === "prepared") return this.execute(runId);
      return frozen({ outcome: "quarantined", executorCalls: 0, phase: run.state.phase, idempotencyKey: run.state.idempotencyKey });
    },
    reconcile({ runId, receiptResult }) {
      let run = storage.readRun(runId);
      if (!new Set(["effect-started", "quarantined"]).has(run.state.phase)) fail("run does not require reconciliation");
      if (!receiptResult || receiptResult.idempotencyKey !== run.state.idempotencyKey || receiptResult.bindingDigest !== run.state.bindingDigest) fail("reconciliation receipt is missing or substituted", "DR4763");
      const lease = storage.acquireLease({ runId, owner: "desktop-recovery", expectedVersion: run.version });
      const receipt = artifact(run.state, receiptResult.result);
      run = commit(run, lease, { operation: "reconcile-effect", idempotencyKey: run.state.idempotencyKey }, { ...run.state, phase: "recorded", receipt }, [receipt]);
      storage.releaseLease({ runId, leaseToken: lease.token });
      return frozen({ outcome: "recorded", executorCalls: 0, receipt, version: run.version });
    },
    inspect(runId) { return storage.readRun(runId); },
  });
}

