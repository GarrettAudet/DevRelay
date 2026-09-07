import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateQualityContinuityArtifact } from "./quality-continuity-artifact-validator.mjs";

const CANDIDATE_SCOPE = "quality-continuity/candidate";
const APPROVED_SCOPE = "quality-continuity/approved";
const CANDIDATE_KINDS = new Set(["CrossCuttingCompositionPlan", "CrossCuttingBoundaryResult", "QualityPolicyCandidate", "QualityObligationResolution", "QualityEvidenceAssessment", "WorkFingerprint", "WorkContinuityIndex", "WorkReuseDecision", "WorkSimilarityCandidates", "WorkContinuityLease", "WorkContinuityReconciliation", "ProjectControlSnapshot", "ProjectProductivityAssessment"]);
const CANDIDATE_OPERATIONS = new Map([
  ["quality-policy", new Set(["propose-policy", "resolve-obligations"])],
  ["work-continuity", new Set(["decide-reuse", "record-attempt"])],
  ["project-control", new Set(["project-snapshot", "assess-productivity"])],
  ["desktop-orchestration", new Set(["project-run"])],
]);
const fail = (message) => { throw new TypeError(`quality continuity traceability contributor: ${message}`); };
const immutable = (value) => Object.freeze(structuredClone(value));

function loaded(context) {
  return [...Object.values(context?.loadedInputs ?? {}), ...Object.values(context?.loadedOutputs ?? {}), ...Object.values(context?.loadedAttachments ?? {})].flat();
}
function exact(item) {
  if (!item?.ref || (!Buffer.isBuffer(item.bytes) && !(item.bytes instanceof Uint8Array))) fail("exact artifact bytes and reference are required");
  const bytes = Buffer.from(item.bytes);
  if (sha256Digest(bytes) !== item.ref.digest || bytes.toString("utf8") !== canonicalJson(item.value)) fail("artifact bytes or digest drifted");
  validateQualityContinuityArtifact(item.value);
  return item;
}
const locator = (item) => ({ artifact: { artifactId: item.ref.artifactId, digest: item.ref.digest }, jsonPointer: "", entityDigest: canonicalJsonDigest(item.value) });
const stableId = (item) => canonicalJsonDigest({ schema: item.ref.schema, artifactId: item.ref.artifactId, digest: item.ref.digest });
const node = (item) => ({ kind: "artifact-reference", attributes: { artifact: immutable(item.ref) }, sourceLocators: [locator(item)] });
const endpoint = (item) => ({ kind: "artifact-reference", stableId: stableId(item), authority: "reference", scope: "core/artifact-reference" });
const sorted = (values) => values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));

function projectArtifacts(context, predicate, horizon) {
  const outputs = Object.values(context?.loadedOutputs ?? {}).flat().filter((item) => predicate(item?.value?.kind)).map(exact);
  if (!outputs.length) fail("matching execution has no exact outputs");
  const inputs = Object.values(context?.loadedInputs ?? {}).flat().filter((item) => item?.ref && (Buffer.isBuffer(item.bytes) || item.bytes instanceof Uint8Array));
  const nodes = outputs.map(node);
  const edges = [];
  for (const output of outputs) {
    for (const input of inputs) {
      if (sha256Digest(Buffer.from(input.bytes)) !== input.ref.digest) fail("input artifact bytes or digest drifted");
      nodes.push({ kind: "artifact-reference", attributes: { artifact: immutable(input.ref) } });
      edges.push({ kind: "derived-from", source: endpoint(output), target: endpoint(input), rationale: "The validated cross-cutting artifact is deterministically derived from this exact declared input.", sourceLocators: [locator(output)] });
    }
  }
  return { horizon, nodes: sorted(nodes), edges: sorted(edges), ...(edges.length ? {} : { reason: "The validated artifact has no loaded artifact inputs." }) };
}

function exactInvocation(context, authority) {
  const module = context?.invocation?.module;
  if (authority === "approved") return module?.id === "quality-policy-gate" && module?.version === "0.1.0" && module?.operation === "promote-baseline";
  return module?.version === "0.1.0" && CANDIDATE_OPERATIONS.get(module.id)?.has(module.operation) === true;
}

function contributor({ id, authority, scope, predicate, horizon }) {
  return Object.freeze({
    metadata: immutable({ id, version: "1.0.0" }),
    authority,
    scope,
    ownership: immutable({ authority, scope, nodeKinds: [], edgeKinds: ["derived-from"], retention: "append-only" }),
    match(context) { return exactInvocation(context, authority) && Object.values(context?.loadedOutputs ?? {}).flat().some((item) => predicate(item?.value?.kind)); },
    async project(context) {
      if (!this.match(context)) fail("project called for a nonmatching execution");
      return projectArtifacts(context, predicate, horizon);
    },
  });
}

export const qualityContinuityCandidateTraceabilityContributor = contributor({ id: "devrelay.quality-continuity-candidate", authority: "candidate", scope: CANDIDATE_SCOPE, predicate: (kind) => CANDIDATE_KINDS.has(kind), horizon: "verification" });
export const qualityContinuityApprovedTraceabilityContributor = contributor({ id: "devrelay.quality-policy-approved", authority: "approved", scope: APPROVED_SCOPE, predicate: (kind) => kind === "QualityPolicyBaseline", horizon: "requirements" });
export const qualityContinuityTraceabilityContributors = Object.freeze([qualityContinuityCandidateTraceabilityContributor, qualityContinuityApprovedTraceabilityContributor]);
