import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";

const targetTails = new Map();

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function outcome(kind, details = {}) {
  return deepFreeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ChangeIntegrationTargetCasResult",
    outcome: kind,
    ...details,
  });
}

function diagnostic(code, error) {
  return {
    authority: "non-authoritative",
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

function serialize(targetRef, work) {
  const previous = targetTails.get(targetRef) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  const tail = current.catch(() => undefined);
  targetTails.set(targetRef, tail);
  return current.finally(() => {
    if (targetTails.get(targetRef) === tail) targetTails.delete(targetRef);
  });
}

function adapterInvocation(plan, invocationId) {
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "IntegrationAdapterInvocation",
    invocationId,
    plan: { artifactId: plan.planId, digest: plan.planDigest },
    adapter: structuredClone(plan.adapter),
    permissionDemands: structuredClone(plan.permissionDemands),
    operation: {
      operationId: invocationId,
      transition: structuredClone(plan.transition),
    },
  };
  const invocation = {
    ...body,
    invocationFingerprint: canonicalJsonDigest(
      Object.fromEntries(
        Object.entries(body).filter(([key]) => !["apiVersion", "kind"].includes(key)),
      ),
    ),
  };
  validateChangeIntegrationArtifact(invocation, { plan, binding: { adapter: plan.adapter } });
  return deepFreeze(invocation);
}

/**
 * Serializes authorization by configured target ref. The effect callback is a
 * host port: it must atomically compare `expectedTargetCommit` and apply the
 * requested transition, or apply nothing. Core never implements that effect.
 */
export function authorizeChangeIntegrationEffect({
  plan,
  invocationId,
  observeTarget,
  applyAtomicConditionalEffect,
} = {}) {
  try {
    validateChangeIntegrationArtifact(plan);
  } catch (error) {
    return Promise.resolve(outcome("unable-to-proceed", { reason: error.message }));
  }
  if (!invocationId || typeof observeTarget !== "function" || typeof applyAtomicConditionalEffect !== "function") {
    return Promise.resolve(outcome("unable-to-proceed", { reason: "invocationId and both host callbacks are required" }));
  }

  const { targetRef, expectedTargetCommit } = plan.transition;
  return serialize(targetRef, async () => {
    let observed;
    try {
      observed = await observeTarget(deepFreeze({ targetRef }));
    } catch (error) {
      return outcome("unable-to-proceed", { reason: `target observation failed: ${error.message}` });
    }
    if (!observed || observed.ref !== targetRef || observed.commit !== expectedTargetCommit) {
      return outcome("baseline-drift", {
        expected: { ref: targetRef, commit: expectedTargetCommit },
        observed: observed === undefined ? null : structuredClone(observed),
      });
    }

    let invocation;
    try {
      invocation = adapterInvocation(plan, invocationId);
    } catch (error) {
      return outcome("unable-to-proceed", {
        reason: `effect authorization preparation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const request = deepFreeze({
      targetRef,
      expectedTargetCommit,
      invocation,
    });
    try {
      const effectResult = await applyAtomicConditionalEffect(request);
      return outcome("authorized-effect-result", {
        invocation,
        effectResult: cloneJson(effectResult),
      });
    } catch (error) {
      return outcome("effect-uncertain", {
        invocation,
        diagnostic: diagnostic("ATOMIC_EFFECT_OUTCOME_UNCERTAIN", error),
      });
    }
  });
}

export const executeChangeIntegrationTargetCas = authorizeChangeIntegrationEffect;
