import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateReleasePreparationArtifact } from "./release-preparation-artifact-validator.mjs";
import { createTraceabilityQueryService } from "./traceability-query-service.mjs";

const CANDIDATE_SCOPE = "release-preparation/candidate";
const APPROVED_SCOPE = "release-preparation/readiness";
const fail = (message) => { throw new TypeError(`release-preparation traceability contributor: ${message}`); };
const endpoint = (kind, stableId, authority, scope) => ({ kind, stableId, authority, scope });
const artifactEndpoint = (artifact) => ({ artifact: structuredClone(artifact) });
const sorted = (values) => values.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en"));
const immutable = (value) => Object.freeze(structuredClone(value));
const sameRef = (left, right) => Boolean(left && right && left.artifactId === right.artifactId && left.schema === right.schema && left.mediaType === right.mediaType && left.digest === right.digest && left.uri === right.uri);
const artifactStableId = (ref) => canonicalJsonDigest({ schema: ref.schema, artifactId: ref.artifactId, digest: ref.digest });

function allLoaded(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.ref && value.value && value.bytes !== undefined) { result.push(value); return result; }
  for (const child of Object.values(value)) allLoaded(child, result);
  return result;
}

function exactLoaded(context, kind) {
  const matches = allLoaded({ loadedInputs: context.loadedInputs, loadedOutputs: context.loadedOutputs, loadedAttachments: context.loadedAttachments, resolvedArtifacts: context.resolvedArtifacts }).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`${kind} must have exactly one loaded artifact`);
  const loaded = matches[0];
  const bytes = Buffer.from(loaded.bytes);
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${kind} raw bytes are not UTF-8 JSON`); }
  if (sha256Digest(bytes) !== loaded.ref.digest || canonicalJson(decoded) !== new TextDecoder().decode(bytes) || canonicalJson(decoded) !== canonicalJson(loaded.value)) fail(`${kind} bytes are stale or substituted`);
  validateReleasePreparationArtifact(loaded.value, { ref: loaded.ref });
  return loaded;
}

function exactReferenced(context, ref) {
  const closure = Array.isArray(context.loadedArtifacts)
    ? context.loadedArtifacts
    : allLoaded({ loadedInputs: context.loadedInputs, loadedOutputs: context.loadedOutputs, loadedAttachments: context.loadedAttachments, resolvedArtifacts: context.resolvedArtifacts });
  const matches = closure.filter((loaded) => sameRef(loaded.ref, ref));
  if (matches.length !== 1) fail(`artifact endpoint ${ref.artifactId} must resolve exactly once in the trusted closure`);
  if (sha256Digest(Buffer.from(matches[0].bytes)) !== ref.digest) fail(`artifact endpoint ${ref.artifactId} bytes are stale`);
  return matches[0];
}

function artifactNode(loaded) {
  return { kind: "artifact-reference", stableId: artifactStableId(loaded.ref), label: loaded.ref.artifactId, attributes: { artifact: structuredClone(loaded.ref) }, sourceLocators: [locator(loaded, "", loaded.value)] };
}

function locator(loaded, jsonPointer, entity) {
  return { artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer, entityDigest: canonicalJsonDigest(entity) };
}

const candidateMatches = (context) => Boolean(context?.invocation?.module?.id === "release-preparation" && context?.moduleResult?.status === "completed" && context.moduleResult.outcome === "verification-candidate");
const readinessMatches = (context) => Boolean(context?.invocation?.module?.id === "release-verification-gate" && context?.moduleResult?.status === "completed" && context.moduleResult.outcome === "ready");

export function createReleasePreparationCandidateTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.release-preparation-candidate", version: "1.0.0" }),
    authority: "candidate",
    scope: CANDIDATE_SCOPE,
    ownership: immutable({ authority: "candidate", scope: CANDIDATE_SCOPE, nodeKinds: ["release-candidate", "release-verification-obligation", "verification-evidence"], edgeKinds: ["prepared-from", "materialized-as", "verified-by", "covers-release-obligation"], retention: "append-only" }),
    match: candidateMatches,
    async project(context) {
      if (!candidateMatches(context)) fail("candidate contributor called for a nonmatching result");
      const candidateLoaded = exactLoaded(context, "ReleaseCandidate");
      const policyLoaded = exactLoaded(context, "ReleaseVerificationPolicy");
      const resultSetLoaded = exactLoaded(context, "ReleaseVerificationResultSet");
      const verificationLoaded = exactLoaded(context, "ReleaseVerificationCandidate");
      const candidate = candidateLoaded.value;
      const policy = policyLoaded.value;
      const resultSet = resultSetLoaded.value;
      const verification = verificationLoaded.value;
      validateReleasePreparationArtifact(resultSet, { candidateRef: candidateLoaded.ref, policy, policyRef: policyLoaded.ref });
      validateReleasePreparationArtifact(verification, { resultSet, resultSetRef: resultSetLoaded.ref, policy });
      const candidateNode = endpoint("release-candidate", candidate.candidateId, "candidate", CANDIDATE_SCOPE);
      const referenced = [candidate.attempt, ...candidate.materializationReceipts, ...candidate.artifacts.map(({ artifact }) => artifact)].map((ref) => exactReferenced(context, ref));
      const nodes = [
        ...referenced.map(artifactNode),
        { kind: "release-candidate", stableId: candidate.candidateId, label: `${candidate.packageVersion} candidate`, attributes: { artifact: immutable(candidateLoaded.ref), source: immutable(candidate.source), checkpointDigest: candidate.checkpointDigest, proposedOutcome: verification.proposedOutcome }, sourceLocators: [locator(candidateLoaded, "", candidate), locator(verificationLoaded, "/proposedOutcome", verification.proposedOutcome)] },
      ];
      const edges = [];
      for (const source of [candidate.attempt, ...candidate.materializationReceipts]) edges.push({ kind: "prepared-from", source: artifactEndpoint(source), target: candidateNode, rationale: "The exact release candidate was prepared from this immutable input or effect receipt.", sourceLocators: [locator(candidateLoaded, "", candidate)] });
      candidate.artifacts.forEach((entry, index) => edges.push({ kind: "materialized-as", source: candidateNode, target: artifactEndpoint(entry.artifact), rationale: "The candidate contains this exact content-addressed release artifact.", sourceLocators: [locator(candidateLoaded, `/artifacts/${index}`, entry)] }));
      policy.obligations.forEach((obligation, index) => nodes.push({ kind: "release-verification-obligation", stableId: `${policy.policyId}:${obligation.id}`, label: obligation.id, attributes: { family: obligation.family, required: obligation.required, policy: immutable(policyLoaded.ref), ...(obligation.notApplicableRule ? { notApplicableRule: obligation.notApplicableRule } : {}) }, sourceLocators: [locator(policyLoaded, `/obligations/${index}`, obligation)] }));
      resultSet.results.forEach((result, index) => {
        const evidenceId = `${resultSet.resultSetId}:${result.obligationId}`;
        const verificationStatus = result.status === "pass" || result.status === "not-applicable" ? "pass" : result.status === "fail" ? "fail" : "inconclusive";
        nodes.push({ kind: "verification-evidence", stableId: evidenceId, label: evidenceId, verificationStatus, attributes: { adapter: immutable(resultSet.adapter), disposition: result.status, evidence: immutable(result.evidence), subjectDigest: result.subjectDigest }, sourceLocators: [locator(resultSetLoaded, `/results/${index}`, result)] });
        edges.push({ kind: "verified-by", source: candidateNode, target: endpoint("verification-evidence", evidenceId, "candidate", CANDIDATE_SCOPE), rationale: "This exact observation verifies one obligation against the candidate bytes.", sourceLocators: [locator(resultSetLoaded, `/results/${index}`, result)] });
        edges.push({ kind: "covers-release-obligation", source: endpoint("verification-evidence", evidenceId, "candidate", CANDIDATE_SCOPE), target: endpoint("release-verification-obligation", `${policy.policyId}:${result.obligationId}`, "candidate", CANDIDATE_SCOPE), rationale: "The observation covers this exact versioned release obligation.", sourceLocators: [locator(resultSetLoaded, `/results/${index}`, result), locator(policyLoaded, `/obligations/${policy.obligations.findIndex(({ id }) => id === result.obligationId)}`, policy.obligations.find(({ id }) => id === result.obligationId))] });
      });
      return { horizon: "verification", nodes: sorted(nodes), edges: sorted(edges) };
    },
  });
}

export function createReleaseReadinessTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.release-readiness", version: "1.0.0" }),
    authority: "approved",
    scope: APPROVED_SCOPE,
    ownership: immutable({ authority: "approved", scope: APPROVED_SCOPE, nodeKinds: ["release-candidate", "release-readiness-baseline"], edgeKinds: ["promoted-to-readiness"], retention: "append-only" }),
    match: readinessMatches,
    async project(context) {
      if (!readinessMatches(context)) fail("readiness contributor called for a nonmatching result");
      const candidateLoaded = exactLoaded(context, "ReleaseCandidate");
      const verificationLoaded = exactLoaded(context, "ReleaseVerificationCandidate");
      const approvalLoaded = exactLoaded(context, "ReleaseGateApproval");
      const readinessLoaded = exactLoaded(context, "ReleaseReadinessBaseline");
      const candidate = candidateLoaded.value;
      const approval = approvalLoaded.value;
      const readiness = readinessLoaded.value;
      if (approval.decision !== "ready" || readiness.publicationAuthorized !== false || readiness.candidate.digest !== candidateLoaded.ref.digest || readiness.verificationCandidate.digest !== verificationLoaded.ref.digest || readiness.gateApproval.digest !== approvalLoaded.ref.digest) fail("readiness artifacts do not form one exact Gate-owned closure");
      const nodes = [
        { kind: "release-candidate", stableId: candidate.candidateId, label: `${candidate.packageVersion} approved candidate`, attributes: { artifact: immutable(candidateLoaded.ref), source: immutable(candidate.source), gateApproval: immutable(approvalLoaded.ref) }, sourceLocators: [locator(candidateLoaded, "", candidate), locator(approvalLoaded, "", approval)] },
        { kind: "release-readiness-baseline", stableId: readiness.baselineId, label: readiness.baselineId, attributes: { artifact: immutable(readinessLoaded.ref), publicationAuthorized: false, version: readiness.version }, sourceLocators: [locator(readinessLoaded, "", readiness)] },
      ];
      const edges = [{ kind: "promoted-to-readiness", source: endpoint("release-candidate", candidate.candidateId, "approved", APPROVED_SCOPE), target: endpoint("release-readiness-baseline", readiness.baselineId, "approved", APPROVED_SCOPE), rationale: "ReleaseVerificationGate promoted this exact candidate only to publication consideration.", sourceLocators: [locator(approvalLoaded, "", approval), locator(readinessLoaded, "", readiness)] }];
      return { horizon: "verification", nodes: sorted(nodes), edges };
    },
  });
}

export const releasePreparationCandidateTraceabilityContributor = createReleasePreparationCandidateTraceabilityContributor();
export const releaseReadinessTraceabilityContributor = createReleaseReadinessTraceabilityContributor();
export const releasePreparationTraceabilityContributors = Object.freeze([releasePreparationCandidateTraceabilityContributor, releaseReadinessTraceabilityContributor]);

export function createReleaseTraceabilityQueryService(snapshot) {
  const generic = createTraceabilityQueryService(snapshot);
  const find = (kind, stableId, authority, scope) => {
    const matches = snapshot.nodes.filter((node) => node.kind === kind && node.stableId === stableId && node.authority === authority && node.scope === scope);
    if (matches.length !== 1) fail(`${kind}/${stableId} does not resolve exactly once`);
    return { kind, stableId, authority, scope };
  };
  return Object.freeze({
    candidateImpact(candidateId, options = {}) { return generic.impact({ start: find("release-candidate", candidateId, "candidate", CANDIDATE_SCOPE), ...options }); },
    candidateCoverage(candidateId, options = {}) { return generic.coverage({ start: find("release-candidate", candidateId, "candidate", CANDIDATE_SCOPE), targetKinds: ["verification-evidence", "release-verification-obligation"], ...options }); },
    readinessProvenance(baselineId, options = {}) { return generic.provenance({ start: find("release-readiness-baseline", baselineId, "approved", APPROVED_SCOPE), ...options }); },
    orphanDiagnostics(options = {}) { return generic.diagnostics({ family: "orphan", ...options }); },
  });
}
