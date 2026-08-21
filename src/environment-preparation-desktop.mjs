import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateEnvironmentPreparationArtifact } from "./environment-preparation-artifact-validator.mjs";

export class EnvironmentPreparedDesktopError extends Error {
  constructor(message, code = "DR5450") {
    super(`environment-prepared Desktop execution failed: ${message}`);
    this.name = "EnvironmentPreparedDesktopError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new EnvironmentPreparedDesktopError(message, code);
};
const immutable = (value) => Object.freeze(structuredClone(value));
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right, "en"));

function sameRef(left, right) {
  return Boolean(
    left && right && left.artifactId === right.artifactId && left.schema === right.schema &&
      left.mediaType === right.mediaType && left.digest === right.digest && left.uri === right.uri,
  );
}

function assertPreparationResult(result, request) {
  if (!result || typeof result !== "object") fail("environment runtime returned no preparation result");
  const { candidate, approval, readiness, readinessRef } = result;
  for (const artifact of [candidate, approval, readiness]) validateEnvironmentPreparationArtifact(artifact);
  if (
    candidate.proposedOutcome !== "ready" || approval.decision !== "ready" ||
    approval.candidate.digest !== candidate.contentDigest
  ) {
    fail("only an exact Core-approved ready candidate may authorize execution", "DR5451");
  }
  if (
    readiness.candidate.digest !== candidate.contentDigest ||
    readiness.gateApproval.digest !== approval.contentDigest ||
    readiness.frontierId !== request.frontierId ||
    readiness.executionAttemptId !== request.executionAttemptId ||
    JSON.stringify(sorted(readiness.workItemIds)) !== JSON.stringify(sorted(request.workItemIds)) ||
    !sameRef(readiness.repository, request.repository) ||
    !sameRef(readiness.assignmentBaseline, request.assignmentBaseline)
  ) {
    fail("environment readiness does not bind the exact execution frontier", "DR5451");
  }
  if (readinessRef && readinessRef.digest !== readiness.contentDigest) {
    fail("environment readiness reference was substituted", "DR5451");
  }
  return { candidate, approval, readiness };
}

export function renderEnvironmentRemediationPlan(plan) {
  validateEnvironmentPreparationArtifact(plan);
  const effects = [...plan.effects].sort((left, right) => left.id.localeCompare(right.id, "en"));
  const lines = [
    `Environment remediation plan ${plan.planId}`,
    `Base fingerprint: ${plan.baseFingerprint}`,
    `Approval required: ${plan.approvalRequired ? "yes" : "no"}`,
  ];
  if (effects.length === 0) lines.push("No environment mutations are proposed.");
  for (const effect of effects) {
    lines.push(
      "",
      `${effect.id} [${effect.scope}]`,
      `  Change: ${effect.description}`,
      `  Impact: ${effect.impact}`,
      `  Rollback: ${effect.rollback.supported ? effect.rollback.procedure : "not supported"}`,
      `  Grants: ${effect.grants.length === 0 ? "none" : effect.grants.map(({ kind, scope }) => `${kind}:${scope}`).join(", ")}`,
      `  Evidence: ${effect.requiredEvidence.join(", ")}`,
    );
  }
  for (const diagnostic of plan.diagnostics) lines.push(`Warning ${diagnostic.code}: ${diagnostic.message}`);
  return `${lines.join("\n")}\n`;
}

export function summarizeEnvironmentReadiness({ candidate, readiness }) {
  validateEnvironmentPreparationArtifact(candidate);
  validateEnvironmentPreparationArtifact(readiness);
  return immutable({
    outcome: candidate.proposedOutcome,
    frontierId: readiness.frontierId,
    workItemIds: sorted(readiness.workItemIds),
    executionAttemptId: readiness.executionAttemptId,
    issuedAt: readiness.issuedAt,
    expiresAt: readiness.expiresAt,
    singleUse: readiness.singleUse,
    checks: [...candidate.checks]
      .sort((left, right) => left.checkId.localeCompare(right.checkId, "en"))
      .map(({ checkId, required, status }) => ({ checkId, required, status })),
    diagnostics: structuredClone(candidate.diagnostics),
    summaryDigest: canonicalJsonDigest({
      candidate: candidate.contentDigest,
      readiness: readiness.contentDigest,
    }),
  });
}

export function createEnvironmentPreparedDesktopCoordinator({
  environmentRuntime,
  readinessStore,
  executionCoordinator,
} = {}) {
  if (
    typeof environmentRuntime?.prepareFrontier !== "function" ||
    typeof readinessStore?.put !== "function" || typeof readinessStore?.consume !== "function" ||
    typeof executionCoordinator?.prepare !== "function" || typeof executionCoordinator?.execute !== "function"
  ) {
    fail("environment runtime, readiness store, and execution coordinator are required");
  }
  const preparations = new Map();
  return Object.freeze({
    async prepareFrontier(request) {
      if (!request?.frontierId || !request?.executionAttemptId || !Array.isArray(request.workItemIds)) {
        fail("frontier, work items, and execution attempt are required");
      }
      const result = assertPreparationResult(await environmentRuntime.prepareFrontier(immutable(request)), request);
      readinessStore.put(result.readiness);
      const preparationId = `EP-DESKTOP-${result.readiness.receiptId}`;
      const record = immutable({
        preparationId,
        request: structuredClone(request),
        candidate: result.candidate,
        approval: result.approval,
        readiness: result.readiness,
        summary: summarizeEnvironmentReadiness(result),
      });
      preparations.set(preparationId, record);
      return record;
    },
    async executePrepared({ preparationId, consumedAt, executionRequest } = {}) {
      const preparation = preparations.get(preparationId);
      if (!preparation) fail("unknown or unavailable preparation", "DR5452");
      if (executionRequest?.attemptId !== preparation.readiness.executionAttemptId) {
        fail("execution attempt differs from the ready environment", "DR5452");
      }
      const consumptionProof = readinessStore.consume({
        receiptId: preparation.readiness.receiptId,
        repository: preparation.request.repository,
        frontierId: preparation.request.frontierId,
        workItemIds: preparation.request.workItemIds,
        assignmentBaseline: preparation.request.assignmentBaseline,
        executionAttemptId: preparation.request.executionAttemptId,
        fingerprint: preparation.readiness.fingerprint,
        consumedAt,
      });
      const preparedExecution = executionCoordinator.prepare(immutable(executionRequest));
      const execution = await executionCoordinator.execute(executionRequest.runId);
      preparations.delete(preparationId);
      return immutable({
        outcome: execution.outcome,
        environmentReadiness: preparation.readiness.contentDigest,
        consumptionProof,
        preparedExecution,
        execution,
      });
    },
    inspect(preparationId) {
      const preparation = preparations.get(preparationId);
      return preparation ? immutable(preparation) : undefined;
    },
  });
}
