import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "./schema-validation.mjs";

const validateExternalRequest = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/desktop-external-execution-request.schema.json", import.meta.url), "utf8")));

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
  if (!storage || typeof worktreeManager?.inspectForDispatch !== "function" || !executors || typeof executors !== "object") fail("storage, dispatch-capable worktree manager, and executor registry are required");
  const registry = new Map(Object.entries(executors));
  const bindingFor = (request) => {
    const supplied = request.executor;
    const trusted = registry.get(supplied?.id);
    if (!trusted || trusted.version !== supplied.version || trusted.configurationDigest !== supplied.configurationDigest) fail("executor identity or configuration was substituted", "DR4761");
    if (
      !covers(request.requiredCapabilities ?? [], trusted.capabilities ?? []) ||
      !covers(request.requiredGrants ?? [], trusted.grants ?? [])
    ) fail("executor capability or grant coverage is incomplete", "DR4761");
    const worktree = worktreeManager.inspectForDispatch(request.attemptId);
    if (worktree.attemptId !== request.attemptId || worktree.workItemId !== request.workItemId ||
        worktree.revision !== request.repositoryRevision || worktree.observedRevision !== request.repositoryRevision ||
        worktree.status !== "active") fail("worktree binding is stale or substituted", "DR4762");
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
    beginExternal(runId) {
      const run = storage.readRun(runId);
      if (run.state.phase !== "prepared") return frozen({ outcome: "quarantined", executorCalls: 0, phase: run.state.phase });
      const current = bindingFor(run.state);
      if (current.state.bindingDigest !== run.state.bindingDigest) fail("prepared execution binding drifted", "DR4762");
      const execution = { ...run.state, phase: "effect-started" };
      const body = { kind: "DesktopExternalExecutionRequest", execution, repeatAllowed: false };
      const request = { ...body, requestDigest: canonicalJsonDigest(body) };
      if (!validateExternalRequest(request)) fail("external request violates its contract");
      const requestRef = storage.putArtifact({ artifactId: `DESKTOP-EXTERNAL-${runId}`,
        mediaType: "application/vnd.devrelay.desktop-external-execution-request+json", bytes: Buffer.from(canonicalJson(request)) });
      const lease = storage.acquireLease({ runId, owner: "desktop-external-operator", expectedVersion: run.version });
      try {
        commit(run, lease, { operation: "request-external-effect", requestDigest: request.requestDigest },
          { ...execution, externalRequestRef: requestRef }, [requestRef]);
        failureInjector({ boundary: "after-external-request", runId });
        return frozen({ outcome: "operator-action-required", executorCalls: 0, request, requestRef });
      } finally { storage.releaseLease({ runId, leaseToken: lease.token }); }
    },
    async execute(runId) {
      let run = storage.readRun(runId);
      if (run.state.phase === "recorded") {
        if (run.artifactRefs.length !== 1 || canonicalJsonDigest(run.artifactRefs[0]) !== canonicalJsonDigest(run.state.receipt) ||
            canonicalJsonDigest(run.checkpointRef) !== canonicalJsonDigest(run.state.receipt)) fail("recorded receipt reference differs", "DR4763");
        const bytes = storage.getArtifact(run.artifactRefs[0]);
        const value = JSON.parse(bytes);
        if (Object.keys(value).sort().join(",") !== "bindingDigest,idempotencyKey,result" ||
            value.bindingDigest !== run.state.bindingDigest || value.idempotencyKey !== run.state.idempotencyKey ||
            bytes.toString("utf8") !== canonicalJson(value)) fail("recorded receipt binding differs", "DR4763");
        return frozen({ outcome: "replayed", executorCalls: 0, receipt: run.artifactRefs[0], result: value.result });
      }
      if (run.state.phase !== "prepared") return frozen({ outcome: "quarantined", executorCalls: 0, phase: run.state.phase });
      const trusted = registry.get(run.state.executor.id);
      if (!trusted || trusted.version !== run.state.executor.version || trusted.configurationDigest !== run.state.executor.configurationDigest) fail("approved executor is no longer available", "DR4761");
      const currentBinding = bindingFor(run.state);
      if (currentBinding.state.bindingDigest !== run.state.bindingDigest) fail("prepared execution binding drifted", "DR4762");
      const lease = storage.acquireLease({ runId, owner: `desktop-executor:${run.state.executor.id}`, expectedVersion: run.version });
      try {
        run = commit(run, lease, { operation: "authorize-effect", idempotencyKey: run.state.idempotencyKey }, { ...run.state, phase: "effect-started" });
        failureInjector({ boundary: "after-effect-state", runId });
        // A persisted intent is not continuing permission to dispatch. The
        // owner may have expired or been replaced while saving that intent.
        storage.renewLease({ runId, leaseToken: lease.token, expectedVersion: run.version });
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
      if (run.state.workItemId !== workItemId || run.state.executor.id !== executor.id || run.state.executor.version !== executor.version || run.state.executor.configurationDigest !== executor.configurationDigest) fail("resume binding was substituted", "DR4761");
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
