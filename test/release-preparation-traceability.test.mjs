import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { RELEASE_PREPARATION_ARTIFACT_CONTRACTS, withReleasePreparationContentDigest } from "../src/release-preparation-artifact-validator.mjs";
import {
  createReleasePreparationCandidateTraceabilityContributor,
  createReleaseReadinessTraceabilityContributor,
  createReleaseTraceabilityQueryService,
  releasePreparationCandidateTraceabilityContributor,
  releaseReadinessTraceabilityContributor,
} from "../src/release-preparation-traceability-contributor.mjs";
import { TRACEABILITY_VOCABULARY_V1_7, TRACEABILITY_VOCABULARY_V1_8 } from "../src/traceability-artifact-validator.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const API = "devrelay.dev/v1alpha1";
const D = canonicalJsonDigest;
const genericRef = (id) => ({ artifactId: id, schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`, mediaType: "application/json", digest: D(id), uri: `memory://fixture/${id}` });
const rawLoaded = (value, artifactId) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const contract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS[value.kind] ?? { schema: `https://devrelay.dev/artifacts/${value.kind.toLowerCase()}/v1`, mediaType: "application/json" };
  return { value, bytes, ref: { artifactId, schema: contract.schema, mediaType: contract.mediaType, digest: sha256Digest(bytes), uri: `memory://fixture/raw/${artifactId}` } };
};

function fixture() {
  const supporting = ["ATTEMPT", "RECEIPT", "TARBALL", "CATALOG", "SBOM", "LEDGER", "NOTES", "LEGAL", "INDEX"].map((id) => rawLoaded({ apiVersion: API, kind: "FixtureArtifact", id }, id));
  const byId = new Map(supporting.map((entry) => [entry.ref.artifactId, entry]));
  const artifactKinds = [["installable-tarball", "TARBALL"], ["release-catalog", "CATALOG"], ["cyclonedx-sbom", "SBOM"], ["sha256-ledger", "LEDGER"], ["release-notes", "NOTES"], ["license-notice", "LEGAL"], ["evidence-index", "INDEX"]];
  const candidate = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseCandidate", candidateId: "RC-TRACE", attempt: byId.get("ATTEMPT").ref, source: { commit: "a".repeat(40), tree: D("tree") }, packageVersion: "0.10.0-rc.3", artifacts: artifactKinds.map(([kind, id]) => ({ id, kind, artifact: byId.get(id).ref })), materializationReceipts: [byId.get("RECEIPT").ref], checkpointDigest: D("checkpoint"), sourceRefs: [{ role: "requirements", artifact: genericRef("REQ") }] });
  const candidateLoaded = rawLoaded(candidate, candidate.candidateId);
  const policy = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationPolicy", policyId: "RVP-TRACE", version: "1.0.0", obligations: [{ id: "TESTS", family: "tests", required: true }, { id: "ATTEST", family: "attestation", required: true, notApplicableRule: "NO-LIVE" }], offlineByDefault: true, failClosed: true, sourceRefs: candidate.sourceRefs });
  const policyLoaded = rawLoaded(policy, policy.policyId);
  const resultSet = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationResultSet", resultSetId: "RVRS-TRACE", candidate: candidateLoaded.ref, candidateDigest: candidateLoaded.ref.digest, policy: policyLoaded.ref, adapter: { id: "native.verify", version: "1.0.0", maturity: "fixture-conformant" }, results: [{ obligationId: "TESTS", status: "pass", subjectDigest: candidateLoaded.ref.digest, evidence: [] }, { obligationId: "ATTEST", status: "not-applicable", subjectDigest: candidateLoaded.ref.digest, notApplicableRule: "NO-LIVE", evidence: [] }], durationMs: 1, cacheHits: 0, retries: 0, diagnostics: [] });
  const resultSetLoaded = rawLoaded(resultSet, resultSet.resultSetId);
  const verification = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseVerificationCandidate", verificationCandidateId: "RVC-TRACE", candidate: candidateLoaded.ref, resultSet: resultSetLoaded.ref, environmentReadinessReceipt: genericRef("ENV"), ownerIntent: genericRef("OWNER"), proposedOutcome: "ready", blockers: [], warnings: [], diagnostics: [], sourceRefs: candidate.sourceRefs });
  const verificationLoaded = rawLoaded(verification, verification.verificationCandidateId);
  const approval = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseGateApproval", approvalId: "RGA-TRACE", authority: "devrelay-core", decision: "ready", candidate: verificationLoaded.ref, terminalCheckpointDigest: D("terminal"), policyVersion: policy.version });
  const approvalLoaded = rawLoaded(approval, approval.approvalId);
  const readiness = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleaseReadinessBaseline", baselineId: "RRB-TRACE", version: candidate.packageVersion, candidate: candidateLoaded.ref, verificationCandidate: verificationLoaded.ref, gateApproval: approvalLoaded.ref, publicationAuthorized: false, approvalEvidence: [resultSetLoaded.ref], sourceRefs: candidate.sourceRefs });
  const readinessLoaded = rawLoaded(readiness, readiness.baselineId);
  const candidateOutputs = { candidate: [candidateLoaded], policy: [policyLoaded], results: [resultSetLoaded], verification: [verificationLoaded] };
  const candidateContext = { invocation: { invocationId: "RP-TRACE", module: { id: "release-preparation", version: "1.0.0", operation: "verify-candidate" } }, moduleResult: { invocationId: "RP-TRACE", status: "completed", outcome: "verification-candidate", outputs: Object.fromEntries(Object.entries(candidateOutputs).map(([key, [entry]]) => [key, [entry.ref]])), evidence: [] }, loadedOutputs: candidateOutputs, loadedAttachments: { supporting } };
  const readinessOutputs = { candidate: [candidateLoaded], verification: [verificationLoaded], approval: [approvalLoaded], readiness: [readinessLoaded] };
  const readinessContext = { invocation: { invocationId: "RPG-TRACE", module: { id: "release-verification-gate", version: "1.0.0", operation: "evaluate" } }, moduleResult: { invocationId: "RPG-TRACE", status: "completed", outcome: "ready", outputs: Object.fromEntries(Object.entries(readinessOutputs).map(([key, [entry]]) => [key, [entry.ref]])), evidence: [] }, loadedOutputs: readinessOutputs };
  return { candidate, candidateContext, readiness, readinessContext };
}

test("candidate contributor deterministically projects exact bytes, obligations, and observations", async () => {
  const { candidateContext } = fixture();
  const first = await releasePreparationCandidateTraceabilityContributor.project(candidateContext);
  const second = await releasePreparationCandidateTraceabilityContributor.project(candidateContext);
  assert.deepEqual(first, second);
  assert.equal(first.nodes.filter(({ kind }) => kind === "release-candidate").length, 1);
  assert.equal(first.nodes.filter(({ kind }) => kind === "release-verification-obligation").length, 2);
  assert.equal(first.edges.filter(({ kind }) => kind === "materialized-as").length, 7);
  assert.equal(canonicalJson(first).includes("graphOperations"), false);
});

test("Gate contributor creates a separate approved identity without publication authority", async () => {
  const { readinessContext } = fixture();
  const projection = await releaseReadinessTraceabilityContributor.project(readinessContext);
  assert.equal(projection.nodes.find(({ kind }) => kind === "release-readiness-baseline").attributes.publicationAuthorized, false);
  assert.equal(projection.edges[0].kind, "promoted-to-readiness");
});

test("V1.8 merges candidate then approved facts atomically and supports coverage and provenance", async () => {
  const { candidate, candidateContext, readiness, readinessContext } = fixture();
  const graph = createTraceabilityGraphService({ graphId: "rp-trace", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_8, contributors: [releasePreparationCandidateTraceabilityContributor, releaseReadinessTraceabilityContributor] });
  const preparedCandidate = await graph.prepare({ ...candidateContext, baseGraph: graph.captureBase(), invocationFingerprint: D(candidateContext.invocation) });
  const mergedCandidate = await graph.mergePrepared(preparedCandidate);
  const preparedReady = await graph.prepare({ ...readinessContext, baseGraph: graph.captureBase(), invocationFingerprint: D(readinessContext.invocation) });
  const mergedReady = await graph.mergePrepared(preparedReady);
  assert.equal(mergedReady.snapshot.revision, 2);
  const candidateNodes = mergedReady.snapshot.nodes.filter(({ kind, stableId }) => kind === "release-candidate" && stableId === candidate.candidateId);
  assert.deepEqual(candidateNodes.map(({ authority }) => authority).sort(), ["approved", "candidate"]);
  const queries = createReleaseTraceabilityQueryService(mergedReady.snapshot);
  assert.equal(queries.candidateCoverage(candidate.candidateId).total >= 2, true);
  assert.equal(queries.readinessProvenance(readiness.baselineId).total >= 1, true);
  assert.equal(mergedCandidate.receipt.disposition, "merged");
});

test("unknown artifact endpoints fail before graph mutation", async () => {
  const { candidateContext } = fixture();
  candidateContext.loadedAttachments = {};
  const graph = createTraceabilityGraphService({ graphId: "rp-orphan", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_8, contributors: [releasePreparationCandidateTraceabilityContributor] });
  await assert.rejects(() => graph.prepare({ ...candidateContext, baseGraph: graph.captureBase(), invocationFingerprint: D(candidateContext.invocation) }), /artifact|resolve|closure|trusted/u);
  assert.equal(graph.captureBase().revision, 0);
});

test("stale bytes and adapter-authored authority fail closed", async () => {
  const { candidateContext } = fixture();
  candidateContext.loadedOutputs.candidate[0].bytes = Buffer.from("{}", "utf8");
  await assert.rejects(() => createReleasePreparationCandidateTraceabilityContributor().project(candidateContext), /stale|substituted/u);
  const { candidateContext: other } = fixture();
  other.loadedOutputs.results[0].value = { ...other.loadedOutputs.results[0].value, gateDecision: "ready" };
  await assert.rejects(() => createReleasePreparationCandidateTraceabilityContributor().project(other), /stale|substituted|invalid/u);
});

test("older vocabularies reject release ownership and Gate substitutions", async () => {
  assert.throws(() => createTraceabilityGraphService({ graphId: "old", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_7, contributors: [createReleasePreparationCandidateTraceabilityContributor()] }), /unknown node kind|ownership/u);
  const { readinessContext } = fixture();
  readinessContext.loadedOutputs.readiness[0].value = { ...readinessContext.loadedOutputs.readiness[0].value, publicationAuthorized: true };
  await assert.rejects(() => createReleaseReadinessTraceabilityContributor().project(readinessContext), /stale|substituted|invalid|publication/u);
});
