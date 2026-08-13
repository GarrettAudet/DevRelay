import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkExecutionArtifact } from "./work-execution-artifact-validator.mjs";
import { documentValidators, validationDetail } from "./schema-validation.mjs";

const SCOPE = "work-execution/attempt";
const WORK_ITEM_SCOPE = "work-breakdown/candidate";

function fail(message) {
  throw new TypeError(`work-execution traceability contributor: ${message}`);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function allLoaded(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.ref && value.value && value.bytes !== undefined) {
    result.push(value);
    return result;
  }
  for (const child of Object.values(value)) allLoaded(child, result);
  return result;
}

function declaredLoaded(context) {
  return allLoaded({
    loadedInputs: context.loadedInputs,
    loadedOutputs: context.loadedOutputs,
    loadedAttachments: context.loadedAttachments,
    resolvedArtifacts: context.resolvedArtifacts,
  });
}

function exactRef(left, right) {
  return Boolean(left && right && canonicalJson(left) === canonicalJson(right));
}

function exactPointer(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.digest === right.digest,
  );
}

function canonicalLoaded(context, kind, label) {
  const matches = declaredLoaded(context).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`${label} must contain exactly one loaded canonical ${kind}`);
  const loaded = matches[0];
  const bytes = Buffer.from(loaded.bytes);
  if (sha256Digest(bytes) !== loaded.ref.digest) fail(`${label} bytes do not match its ArtifactRef`);
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} bytes are not canonical JSON`);
  }
  if (
    canonicalJson(decoded) !== new TextDecoder().decode(bytes) ||
    canonicalJson(decoded) !== canonicalJson(loaded.value)
  ) {
    fail(`${label} bytes are not the exact canonical loaded value`);
  }
  return loaded;
}

function exactLoadedReference(context, expectedRef, label) {
  const candidates = declaredLoaded(context).filter(
    ({ ref }) =>
      ref?.artifactId === expectedRef?.artifactId &&
      ref?.digest === expectedRef?.digest,
  );
  if (candidates.length !== 1) fail(`${label} must resolve to exactly one loaded artifact`);
  if (!exactRef(candidates[0].ref, expectedRef)) fail(`${label} full ArtifactRef is stale or substituted`);
  return candidates[0];
}

function locator(loaded, jsonPointer, entity) {
  return {
    artifact: {
      artifactId: loaded.ref.artifactId,
      digest: loaded.ref.digest,
    },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function endpoint(kind, stableId, authority, scope) {
  return { kind, stableId, authority, scope };
}

function matches(context) {
  return Boolean(
    context?.invocation?.module?.id === "work-execution" &&
      context.invocation.module.version === "0.1.0" &&
      context.invocation.module.operation === "execute-work-item" &&
      context?.moduleResult?.status === "completed" &&
      context.moduleResult.outcome === "proposed",
  );
}

function assertResult(context, loaded) {
  const result = loaded.value;
  if (!documentValidators.moduleResult(result)) {
    fail(`ModuleResult is invalid: ${validationDetail(documentValidators.moduleResult)}`);
  }
  if (canonicalJson(result) !== canonicalJson(context.moduleResult)) {
    fail("loaded ModuleResult does not equal the executed result");
  }
  if (
    result.invocationId !== context.invocation.invocationId ||
    result.status !== "completed" ||
    result.outcome !== "proposed"
  ) {
    fail("only the exact proposed ModuleResult may project execution facts");
  }
  const names = Object.keys(result.outputs).sort().join(",");
  if (names !== "change-set-draft,execution-attempt,execution-evidence-bundle") {
    fail("proposed ModuleResult has missing or extra output ports");
  }
  const attemptRefs = result.outputs["execution-attempt"];
  const changeRefs = result.outputs["change-set-draft"];
  const evidenceRefs = result.outputs["execution-evidence-bundle"];
  if (
    !Array.isArray(attemptRefs) ||
    attemptRefs.length !== 1 ||
    !Array.isArray(changeRefs) ||
    changeRefs.length !== 1 ||
    !Array.isArray(evidenceRefs) ||
    evidenceRefs.length !== 1
  ) {
    fail("proposed ModuleResult must identify exactly one attempt, change set, and evidence bundle");
  }
  if (
    !result.evidence.some(
      (entry) =>
        entry.kind === "work-execution/raw-evidence" &&
        entry.status === "pass" &&
        exactRef(entry.artifact, evidenceRefs[0]),
    )
  ) {
    fail("proposed ModuleResult lacks exact raw-evidence pass evidence");
  }
  return {
    attemptRef: attemptRefs[0],
    changeRef: changeRefs[0],
  };
}

export function createWorkExecutionTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.work-execution", version: "1.0.0" }),
    match: matches,
    authority: "candidate",
    scope: SCOPE,
    ownership: immutable({
      authority: "candidate",
      scope: SCOPE,
      nodeKinds: ["change-set", "execution-attempt"],
      edgeKinds: ["attempted-by", "produces"],
      retention: "append-only",
    }),
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const moduleResultLoaded = canonicalLoaded(context, "ModuleResult", "ModuleResult");
      const { attemptRef, changeRef } = assertResult(context, moduleResultLoaded);
      const attemptLoaded = canonicalLoaded(context, "ExecutionAttempt", "ExecutionAttempt");
      const changeLoaded = canonicalLoaded(context, "ChangeSetDraft", "ChangeSetDraft");
      const traceLoaded = canonicalLoaded(
        context,
        "ExecutionTraceabilityCandidate",
        "ExecutionTraceabilityCandidate",
      );
      const workItemLoaded = exactLoadedReference(
        context,
        context.invocation.inputs["work-item"][0],
        "WorkItem",
      );

      for (const loaded of [attemptLoaded, changeLoaded, traceLoaded]) {
        validateWorkExecutionArtifact(loaded.value);
      }
      if (!exactRef(attemptLoaded.ref, attemptRef) || !exactRef(changeLoaded.ref, changeRef)) {
        fail("ModuleResult output refs do not equal the loaded execution artifacts");
      }
      if (
        attemptLoaded.value.status !== "proposed" ||
        attemptLoaded.value.workItemId !== workItemLoaded.value.id ||
        changeLoaded.value.attemptId !== attemptLoaded.value.attemptId
      ) {
        fail("attempt, work item, and change set identities do not form one exact proposal");
      }
      if (
        traceLoaded.value.authority !== "candidate" ||
        traceLoaded.value.scope !== SCOPE ||
        traceLoaded.value.workItemId !== workItemLoaded.value.id ||
        !exactPointer(traceLoaded.value.attempt, {
          artifactId: attemptLoaded.value.attemptId,
          digest: attemptLoaded.value.attemptDigest,
        })
      ) {
        fail("traceability candidate is stale, substituted, or unauthorized");
      }

      const attemptId = attemptLoaded.value.attemptId;
      const changeSetId = changeLoaded.ref.artifactId;
      const attemptSources = [
        locator(attemptLoaded, "", attemptLoaded.value),
        locator(traceLoaded, "/attempt", traceLoaded.value.attempt),
      ];
      const nodes = [
        {
          kind: "execution-attempt",
          stableId: attemptId,
          label: attemptId,
          attributes: {
            artifact: immutable(attemptLoaded.ref),
            invocationFingerprint: attemptLoaded.value.invocationFingerprint,
            status: attemptLoaded.value.status,
            workItemId: workItemLoaded.value.id,
          },
          sourceLocators: attemptSources,
        },
        {
          kind: "change-set",
          stableId: changeSetId,
          label: changeSetId,
          attributes: {
            artifact: immutable(changeLoaded.ref),
            attemptId,
            workItemId: workItemLoaded.value.id,
          },
          sourceLocators: [locator(changeLoaded, "", changeLoaded.value)],
        },
      ];
      const edges = [
        {
          kind: "attempted-by",
          source: endpoint("work-item", workItemLoaded.value.id, "candidate", WORK_ITEM_SCOPE),
          target: endpoint("execution-attempt", attemptId, "candidate", SCOPE),
          rationale: "The approved runnable work item was attempted by this exact immutable execution.",
          sourceLocators: [
            locator(workItemLoaded, "/id", workItemLoaded.value.id),
            locator(traceLoaded, "/workItemId", traceLoaded.value.workItemId),
          ],
        },
        {
          kind: "produces",
          source: endpoint("execution-attempt", attemptId, "candidate", SCOPE),
          target: endpoint("change-set", changeSetId, "candidate", SCOPE),
          rationale: "The exact proposed execution attempt produced this candidate change set.",
          sourceLocators: [
            locator(attemptLoaded, "", attemptLoaded.value),
            locator(changeLoaded, "/attemptId", changeLoaded.value.attemptId),
          ],
        },
      ];
      const sort = (values) =>
        values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
      return { horizon: "implementation", nodes: sort(nodes), edges: sort(edges) };
    },
  });
}

export const workExecutionTraceabilityContributor =
  createWorkExecutionTraceabilityContributor();
