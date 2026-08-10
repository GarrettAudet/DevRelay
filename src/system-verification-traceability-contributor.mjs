import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";

const SCOPE = "system-verification/verified";
const REQUIREMENTS_SCOPE = "requirements/baseline";
const fail = (message) => { throw new TypeError(`system-verification traceability contributor: ${message}`); };
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const pointer = (value, idField, digestField) => ({ artifactId: value[idField], digest: value[digestField] });
const endpoint = (kind, stableId, authority, scope) => ({ kind, stableId, authority, scope });
const sorted = (values) => values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));

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

function loadedArtifacts(context) {
  return [...Object.values(context?.loadedInputs ?? {}), ...Object.values(context?.loadedOutputs ?? {}), ...Object.values(context?.loadedAttachments ?? {})].flat();
}

function oneKind(context, kind) {
  const matches = loadedArtifacts(context).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`exactly one loaded ${kind} artifact is required`);
  const loaded = matches[0];
  if (!loaded.ref || (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array))) fail(`${kind} requires raw bytes and an ArtifactRef`);
  const bytes = Buffer.from(loaded.bytes);
  const canonical = Buffer.from(canonicalJson(loaded.value), "utf8");
  if (!bytes.equals(canonical) || loaded.ref.digest !== sha256Digest(bytes)) fail(`${kind} raw bytes or digest are stale`);
  return loaded;
}

function locator(loaded, jsonPointer, entity) {
  return { artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer, entityDigest: canonicalJsonDigest(entity) };
}

function matches(context) {
  return context?.invocation?.module?.id === "system-verification" &&
    context.invocation.module.version === "0.1.0" &&
    context.invocation.module.operation === "verify-system" &&
    context?.moduleResult?.status === "completed" && context.moduleResult.outcome === "verified";
}

function exactVerifiedContext(context) {
  const subjectLoaded = oneKind(context, "IntegratedSystemCandidate");
  const obligationsLoaded = oneKind(context, "SystemVerificationObligationSet");
  const evidenceLoaded = oneKind(context, "NormalizedSystemVerificationEvidence");
  const policyLoaded = oneKind(context, "SystemVerificationPolicy");
  const evaluationLoaded = oneKind(context, "SystemVerificationEvaluation");
  const resultLoaded = oneKind(context, "SystemVerificationResult");
  const subject = validateSystemVerificationArtifact(subjectLoaded.value);
  const obligations = validateSystemVerificationArtifact(obligationsLoaded.value);
  const evidence = validateSystemVerificationArtifact(evidenceLoaded.value, { subject, obligations });
  const policy = validateSystemVerificationArtifact(policyLoaded.value);
  const evaluation = validateSystemVerificationArtifact(evaluationLoaded.value, { subject, obligations, policy, evidence });
  const result = validateSystemVerificationArtifact(resultLoaded.value, { evaluation });
  if (result.outcome !== "verified" || result.progression !== "business-acceptance-gate") fail("only an exact verified SystemVerificationResult may project facts");
  const resultRefs = context.moduleResult.outputs?.["system-verification-result"];
  if (Object.keys(context.moduleResult.outputs ?? {}).join(",") !== "system-verification-result" || !Array.isArray(resultRefs) || resultRefs.length !== 1 || !sameRef(resultRefs[0], resultLoaded.ref)) fail("ModuleResult must contain only the exact SystemVerificationResult output");
  if (context.moduleResult.invocationId !== context.invocation.invocationId) fail("ModuleResult invocation is substituted");
  if (!context.moduleResult.evidence?.some((entry) => entry.kind === "system-verification/contract-tests" && entry.status === "pass" && sameRef(entry.artifact, resultLoaded.ref))) fail("verified ModuleResult lacks pass evidence bound to its exact result");
  const expected = [
    [obligations.subject, pointer(subject, "subjectId", "subjectDigest")], [evidence.subject, pointer(subject, "subjectId", "subjectDigest")],
    [evidence.obligationSet, pointer(obligations, "obligationSetId", "obligationSetDigest")], [result.subject, pointer(subject, "subjectId", "subjectDigest")],
    [result.obligationSet, pointer(obligations, "obligationSetId", "obligationSetDigest")], [result.policy, pointer(policy, "policyId", "policyDigest")],
    [result.evidence, pointer(evidence, "evidenceSetId", "evidenceDigest")], [result.evaluation, pointer(evaluation, "evaluationId", "evaluationDigest")],
  ];
  if (expected.some(([actual, wanted]) => !sameRef(actual, wanted))) fail("SystemVerification lineage is stale or substituted");
  return { obligationsLoaded, evidenceLoaded, resultLoaded, obligations, evidence, evaluation, result };
}

export function createSystemVerificationTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.system-verification", version: "1.0.0" }),
    authority: "approved",
    scope: SCOPE,
    ownership: immutable({ authority: "approved", scope: SCOPE, nodeKinds: ["verification-evidence"], edgeKinds: ["verified-by"] }),
    match: matches,
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const values = exactVerifiedContext(context);
      const obligations = new Map(values.obligations.obligations.map((entry) => [entry.obligationId, entry]));
      const evidence = new Map(values.evidence.items.map((entry, index) => [entry.evidenceId, { entry, index }]));
      const nodes = [];
      const edges = [];
      for (const [index, disposition] of values.evaluation.dispositions.entries()) {
        if (disposition.status !== "satisfied" || disposition.evidenceIds.length === 0) fail(`verified obligation ${disposition.obligationId} lacks satisfied evidence`);
        const obligation = obligations.get(disposition.obligationId);
        if (!obligation) fail(`orphan disposition ${disposition.obligationId}`);
        for (const evidenceId of disposition.evidenceIds) {
          const found = evidence.get(evidenceId);
          if (!found || found.entry.obligationId !== disposition.obligationId || found.entry.status !== "pass") fail(`evidence ${evidenceId} is missing, orphaned, or not passing`);
          if (!nodes.some((node) => node.stableId === evidenceId)) nodes.push({ kind: "verification-evidence", stableId: evidenceId, label: evidenceId, attributes: { evidenceKind: found.entry.kind, artifact: immutable(found.entry.artifact), producer: immutable(found.entry.producer), systemVerificationResult: immutable(values.resultLoaded.ref) }, sourceLocators: [locator(values.evidenceLoaded, `/items/${found.index}`, found.entry), locator(values.resultLoaded, "", values.result)] });
          if (obligation.kind === "acceptance-criterion") edges.push({ kind: "verified-by", source: endpoint("acceptance-criterion", obligation.sourceRef, "approved", REQUIREMENTS_SCOPE), target: endpoint("verification-evidence", evidenceId, "approved", SCOPE), rationale: "The exact verified SystemVerification result records passing evidence for this acceptance criterion.", sourceLocators: [locator(values.obligationsLoaded, `/obligations/${values.obligations.obligations.indexOf(obligation)}`, obligation), locator(values.resultLoaded, "/evaluation", values.result.evaluation), locator(values.evidenceLoaded, `/items/${found.index}`, found.entry)] });
        }
      }
      return { horizon: "verification", nodes: sorted(nodes), edges: sorted(edges) };
    },
  });
}

export const systemVerificationTraceabilityContributor = createSystemVerificationTraceabilityContributor();
