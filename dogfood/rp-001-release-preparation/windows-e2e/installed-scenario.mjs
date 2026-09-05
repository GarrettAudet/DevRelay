import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS,
  RELEASE_PREPARATION_ARTIFACT_CONTRACTS,
  RELEASE_VERIFICATION_FAMILIES,
  TRACEABILITY_VOCABULARY_V1_8,
  approveEnvironmentVerificationCandidate,
  buildEnvironmentVerificationCandidate,
  canonicalJson,
  canonicalJsonDigest,
  createInMemoryReleaseArtifactStore,
  createInMemoryReleaseMaterializationCheckpointStore,
  createInMemoryTraceabilityStore,
  createNativeNodeWindowsReleaseHost,
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  createReleasePreparationCandidateTraceabilityContributor,
  createReleaseReadinessTraceabilityContributor,
  createReleaseTraceabilityQueryService,
  createReleaseVerificationPolicy,
  createTraceabilityGraphService,
  deriveReleasePreparationRoute,
  detectReleasePreparationIdentityDrift,
  evaluateReleaseVerificationGate,
  materializeNativeReleaseCandidate,
  promoteEnvironmentGate,
  renderReleaseReadinessSummary,
  resolveEnvironmentProfileSet,
  resolveReleasePreparationAttempt,
  sha256Digest,
  verifyStoredReleaseCandidate,
} from "devrelay/advanced";

const API = "devrelay.dev/v1alpha1";
assert.equal(process.platform, "win32", "RP-001 release-defining E2E requires Windows");

const scenarioRoot = dirname(fileURLToPath(import.meta.url));
const inputRoot = resolve(scenarioRoot, "inputs");
const packageRoot = dirname(fileURLToPath(import.meta.resolve("devrelay/package.json")));
const D = canonicalJsonDigest;
const readJson = (name) => JSON.parse(readFileSync(resolve(inputRoot, name), "utf8"));
const rawRef = (artifactId, value, schema = `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`, mediaType = "application/json") => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  return { value, bytes, ref: { artifactId, schema, mediaType, digest, uri: `memory://devrelay/rp001/windows-e2e/${encodeURIComponent(artifactId)}/${digest.slice(7)}` } };
};
const genericRef = (artifactId) => ({
  artifactId,
  schema: `https://devrelay.dev/evidence/${artifactId.toLowerCase()}/v1`,
  mediaType: "application/json",
  digest: D(artifactId),
  uri: `memory://devrelay/rp001/windows-e2e/${artifactId}`,
});
const idOf = (value) => value.baselineId ?? value.dispositionId ?? value.resultId ?? value.receiptId ?? value.policyId ?? value.intentId ?? value.artifactId;
const loadedInput = (name) => {
  const value = readJson(name);
  return rawRef(idOf(value), value);
};

const repository = loadedInput("repository-snapshot.json");
const systemVerification = loadedInput("system-verification-result.json");
const releaseCheck = loadedInput("release-check-evidence.json");
const baselineFiles = [
  ["requirements", "requirements-baseline.json"],
  ["project-overview", "project-overview-baseline.json"],
  ["architecture", "architecture-baseline.json"],
  ["contract-disposition", "contract-disposition.json"],
  ["work-breakdown", "work-breakdown-baseline.json"],
  ["work-dependency", "work-dependency-baseline.json"],
  ["specialist-assignment", "specialist-assignment-baseline.json"],
  ["project-memory", "project-memory-baseline.json"],
];
const baselines = baselineFiles.map(([role, name]) => ({ role, ...loadedInput(name) }));
assert.equal(baselines.length, 8);
assert.equal(releaseCheck.value.outcome, "pass");

const route = deriveReleasePreparationRoute({
  systemVerification,
  applicability: "applicable",
});
assert.equal(route.operation, "prepare-candidate");

const sourceRefs = [{ role: "approved-work-item", artifact: genericRef("WI-RP-WINDOWS-E2E") }];
const profileSet = resolveEnvironmentProfileSet({
  profileSetId: "EPS-RP-001-WINDOWS-E2E",
  version: "1.0.0",
  repository: repository.ref,
  hostProfile: {
    id: "HOST-RP-WINDOWS-DESKTOP",
    layer: "devrelay-host",
    name: "ChatGPT/Codex Desktop Windows release host",
    checks: [
      { id: "HOST-OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 900 },
      { id: "HOST-NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=22.0.0", freshnessSeconds: 900 },
    ],
  },
  projectProfiles: [{
    id: "PROJECT-RP-INSTALLED-CONSUMER",
    layer: "project-target",
    name: "Installed DevRelay package",
    checks: [{ id: "PACKAGE-JSON", capability: "package.json", required: true, observationKind: "filesystem", constraint: "present", freshnessSeconds: 900 }],
  }],
  sourceRefs,
});
const environmentHost = createNativeWindowsEnvironmentHost({ repositoryRoot: packageRoot });
const environmentObservation = createNativeWindowsEnvironmentInventory({
  inventoryId: "INV-RP-001-WINDOWS-E2E",
  profileSet,
  repository: repository.ref,
  host: environmentHost,
  observedAt: "2026-09-02T08:00:00.000Z",
  sourceRefs,
});
const environmentCandidateRequest = {
  candidateId: "EVC-RP-001-WINDOWS-E2E",
  operation: "establish-environment",
  repository: repository.ref,
  upstreamBaselines: baselines.map(({ ref }) => ref),
  profileSet,
  inventory: environmentObservation.inventory,
  effectReceipts: [],
  frontierId: "FRONTIER-RP-001-008",
  workItemIds: ["WI-RP-WINDOWS-E2E"],
  assignmentBaseline: baselines.find(({ role }) => role === "specialist-assignment").ref,
  executionAttemptId: "ATT-RP-WINDOWS-E2E-001",
  evaluatedAt: "2026-09-02T08:00:30.000Z",
  sourceRefs,
};
const environmentCandidate = buildEnvironmentVerificationCandidate(environmentCandidateRequest);
assert.equal(environmentCandidate.proposedOutcome, "ready");
const environmentApproval = approveEnvironmentVerificationCandidate({
  candidate: environmentCandidate,
  terminalCheckpointDigest: D("RP-001-ENVIRONMENT-CHECKPOINT"),
  policyVersion: "1.0.0",
});
const environmentPromotion = promoteEnvironmentGate({
  proofId: "PROOF-RP-001-WINDOWS-E2E",
  baselineId: "BASELINE-RP-001-WINDOWS-E2E",
  baselineVersion: "1.0.0",
  candidate: environmentCandidate,
  approval: environmentApproval,
  profileSet,
  inventory: environmentObservation.inventory,
  assignmentBaseline: environmentCandidateRequest.assignmentBaseline,
  workItemIds: environmentCandidateRequest.workItemIds,
  issuedAt: "2026-09-02T08:01:00.000Z",
  expiresAt: "2026-09-02T08:11:00.000Z",
  policyVersion: "1.0.0",
  graphCheckpoint: genericRef("GRAPH-RP-001-ENVIRONMENT"),
  sourceRefs,
});
const environmentReadiness = rawRef(
  environmentPromotion.readiness.receiptId,
  environmentPromotion.readiness,
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentReadinessReceipt.schema,
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentReadinessReceipt.mediaType,
);

const ownerIntentValue = {
  apiVersion: API,
  kind: "ReleaseOwnerIntent",
  intentId: "OWNER-RP-001-WINDOWS-E2E",
  packageVersion: "0.10.0-rc.3",
  releaseDesignation: "prerelease",
  changelogApproved: true,
  publicationAuthorized: false,
  targetScope: {
    distribution: "github-source-and-installable-tarball",
    environment: "chatgpt-codex-desktop-windows",
  },
};
const ownerIntent = rawRef(ownerIntentValue.intentId, ownerIntentValue);
const policyValue = createReleaseVerificationPolicy({
  policyId: "RVP-RP-001-WINDOWS-E2E",
  version: "1.0.0",
  obligations: RELEASE_VERIFICATION_FAMILIES.map((family) => ({
    id: `RP-${family.toUpperCase()}`,
    family,
    required: true,
    ...(family === "attestation" ? { notApplicableRule: "RP-NO-LIVE-UPSTREAM-PROVIDER" } : {}),
  })),
  sourceRefs,
});
const policy = rawRef(policyValue.policyId, policyValue, RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseVerificationPolicy.schema, RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseVerificationPolicy.mediaType);
const packageFiles = readJson("package-files.json").paths;
const releaseConfigurationDigest = D({ packageFiles, releaseCheck: releaseCheck.ref.digest, offline: true });
const toolchain = [
  { id: "node", version: process.version.slice(1), digest: D({ id: "node", version: process.version }) },
  { id: "npm", version: readJson("package-files.json").npmVersion, digest: D({ id: "npm", version: readJson("package-files.json").npmVersion }) },
];
const attempt = resolveReleasePreparationAttempt({
  systemVerification,
  repositorySnapshot: repository,
  approvedBaselines: baselines,
  releasePolicy: policy,
  packageVersion: "0.10.0-rc.3",
  releaseConfigurationDigest,
  toolchain,
  environmentReadinessReceipt: environmentReadiness,
  ownerIntent,
  evaluatedAt: "2026-09-02T08:02:00.000Z",
});
const attemptLoaded = rawRef(attempt.attemptId, attempt, RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleasePreparationAttempt.schema, RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleasePreparationAttempt.mediaType);

const artifactStore = createInMemoryReleaseArtifactStore();
const materializationCheckpoints = createInMemoryReleaseMaterializationCheckpointStore();
let captureCalls = 0;
const nativeHost = createNativeNodeWindowsReleaseHost({ root: packageRoot, packagePaths: packageFiles, platform: "win32" });
const observedHost = { ...nativeHost, async capture() { captureCalls += 1; return nativeHost.capture(); } };
const materializationInput = {
  invocationId: "RP-001-WINDOWS-E2E-MATERIALIZE",
  attempt,
  attemptRef: attemptLoaded.ref,
  host: observedHost,
  artifactStore,
  checkpoints: materializationCheckpoints,
};
const materialized = await materializeNativeReleaseCandidate(materializationInput);
const replayedMaterialization = await materializeNativeReleaseCandidate(materializationInput);
assert.equal(captureCalls, 1);
assert.equal(replayedMaterialization.effectCalls, 0);
assert.equal(replayedMaterialization.replayed, true);
assert.deepEqual(replayedMaterialization.candidate, materialized.candidate);

const evidenceFor = () => [releaseCheck.ref];
const verification = await verifyStoredReleaseCandidate({
  resultSetId: "RVRS-RP-001-WINDOWS-E2E",
  verificationCandidateId: "RVC-RP-001-WINDOWS-E2E",
  candidate: materialized.candidate,
  candidateRef: materialized.candidateRef,
  policy: policy.value,
  policyRef: policy.ref,
  artifactStore,
  adapter: { id: "native.windows-installed-release-verifier", version: "1.0.0", maturity: "release-ready" },
  verifier: {
    async verify({ obligation }) {
      return obligation.family === "attestation"
        ? { status: "not-applicable", notApplicableRule: obligation.notApplicableRule, evidence: [] }
        : { status: "pass", evidence: evidenceFor(obligation) };
    },
  },
  environmentReadinessReceipt: environmentReadiness.ref,
  ownerIntent: ownerIntent.ref,
  sourceRefs,
});
assert.equal(verification.resultSet.results.length, RELEASE_VERIFICATION_FAMILIES.length);
assert.equal(verification.verificationCandidate.proposedOutcome, "ready");

const gate = evaluateReleaseVerificationGate({
  approvalId: "RGA-RP-001-WINDOWS-E2E",
  baselineId: "RRB-RP-001-WINDOWS-E2E",
  releaseCandidate: materialized.candidate,
  releaseCandidateRef: materialized.candidateRef,
  verificationCandidate: verification.verificationCandidate,
  verificationCandidateRef: verification.verificationCandidateRef,
  resultSet: verification.resultSet,
  resultSetRef: verification.resultSetRef,
  policy: policy.value,
  policyRef: policy.ref,
  terminalCheckpointDigest: D({ materialization: materialized.checkpointKey, verification: verification.resultSetRef.digest }),
  requiredMaturity: "release-ready",
  effectReviews: [],
  approvalEvidence: [releaseCheck.ref, verification.resultSetRef],
  sourceRefs,
});
assert.equal(gate.summary.decision, "ready");
assert.equal(gate.summary.publicationAuthorized, false);
assert.equal(gate.readinessBaseline.publicationAuthorized, false);
assert.match(renderReleaseReadinessSummary(gate.summary), /Publication authorized: no/u);

const proposedDrift = resolveReleasePreparationAttempt({
  systemVerification,
  repositorySnapshot: repository,
  approvedBaselines: baselines,
  releasePolicy: policy,
  packageVersion: "0.10.0-rc.3",
  releaseConfigurationDigest: D({ releaseConfigurationDigest, induced: "drift" }),
  toolchain,
  environmentReadinessReceipt: environmentReadiness,
  ownerIntent,
  evaluatedAt: "2026-09-02T08:03:00.000Z",
});
const drift = detectReleasePreparationIdentityDrift(attempt, proposedDrift);
assert.equal(drift.driftDetected, true);
const driftRoute = deriveReleasePreparationRoute({
  systemVerification,
  applicability: "applicable",
  currentAttempt: attemptLoaded.ref,
  driftDetected: true,
});
assert.equal(driftRoute.operation, "prepare-candidate");
let substitutionRejected = false;
try {
  artifactStore.read({ ...materialized.candidate.artifacts[0].artifact, artifactId: "SUBSTITUTED" });
} catch {
  substitutionRejected = true;
}
assert.equal(substitutionRejected, true);

const recoveredAttempt = resolveReleasePreparationAttempt({
  systemVerification,
  repositorySnapshot: repository,
  approvedBaselines: baselines,
  releasePolicy: policy,
  packageVersion: "0.10.0-rc.3",
  releaseConfigurationDigest,
  toolchain,
  environmentReadinessReceipt: environmentReadiness,
  ownerIntent,
  evaluatedAt: "2026-09-02T08:04:00.000Z",
});
assert.equal(recoveredAttempt.fingerprint, attempt.fingerprint);
const recoveryReplay = await materializeNativeReleaseCandidate(materializationInput);
assert.equal(recoveryReplay.effectCalls, 0);

const loadedExact = (value, ref) => ({ value, bytes: Buffer.from(canonicalJson(value), "utf8"), ref });
const opaqueLoaded = (ref) => ({ bytes: artifactStore.read(ref), ref });
const resultSetLoaded = loadedExact(verification.resultSet, verification.resultSetRef);
const verificationLoaded = loadedExact(verification.verificationCandidate, verification.verificationCandidateRef);
const candidateLoaded = loadedExact(materialized.candidate, materialized.candidateRef);
const receiptLoaded = loadedExact(materialized.receipt, materialized.receiptRef);
const supporting = [attemptLoaded, receiptLoaded, ...materialized.candidate.artifacts.map(({ artifact }) => opaqueLoaded(artifact))];
const candidateOutputs = { candidate: [candidateLoaded], policy: [policy], results: [resultSetLoaded], verification: [verificationLoaded] };
const candidateContext = {
  invocation: { invocationId: "RP-001-WINDOWS-E2E-TRACE", module: { id: "release-preparation", version: "1.0.0", operation: "verify-candidate" } },
  invocationFingerprint: D("RP-001-WINDOWS-E2E-TRACE"),
  moduleResult: { invocationId: "RP-001-WINDOWS-E2E-TRACE", status: "completed", outcome: "verification-candidate", outputs: Object.fromEntries(Object.entries(candidateOutputs).map(([key, [entry]]) => [key, [entry.ref]])), evidence: [] },
  loadedOutputs: candidateOutputs,
  loadedAttachments: { supporting },
};
const approvalLoaded = loadedExact(gate.approval, gate.approvalRef);
const readinessLoaded = loadedExact(gate.readinessBaseline, gate.readinessBaselineRef);
const readinessOutputs = { candidate: [candidateLoaded], verification: [verificationLoaded], approval: [approvalLoaded], readiness: [readinessLoaded] };
const readinessContext = {
  invocation: { invocationId: "RP-001-WINDOWS-E2E-GATE-TRACE", module: { id: "release-verification-gate", version: "1.0.0", operation: "evaluate" } },
  invocationFingerprint: D("RP-001-WINDOWS-E2E-GATE-TRACE"),
  moduleResult: { invocationId: "RP-001-WINDOWS-E2E-GATE-TRACE", status: "completed", outcome: "ready", outputs: Object.fromEntries(Object.entries(readinessOutputs).map(([key, [entry]]) => [key, [entry.ref]])), evidence: [] },
  loadedOutputs: readinessOutputs,
};
const graph = createTraceabilityGraphService({
  graphId: "rp-001-windows-e2e",
  projectId: "devrelay",
  store: createInMemoryTraceabilityStore(),
  vocabulary: TRACEABILITY_VOCABULARY_V1_8,
  contributors: [createReleasePreparationCandidateTraceabilityContributor(), createReleaseReadinessTraceabilityContributor()],
});
const preparedCandidateTrace = await graph.prepare({ ...candidateContext, baseGraph: graph.captureBase() });
const mergedCandidateTrace = await graph.mergePrepared(preparedCandidateTrace);
const preparedReadinessTrace = await graph.prepare({ ...readinessContext, baseGraph: graph.captureBase() });
const mergedReadinessTrace = await graph.mergePrepared(preparedReadinessTrace);
const queries = createReleaseTraceabilityQueryService(mergedReadinessTrace.snapshot);
const coverage = queries.candidateCoverage(materialized.candidate.candidateId);
const provenance = queries.readinessProvenance(gate.readinessBaseline.baselineId);
assert.equal(coverage.total >= RELEASE_VERIFICATION_FAMILIES.length, true);
assert.equal(provenance.total >= 1, true);

const forbiddenEffects = [
  ...materialized.receipt.grants.map(({ kind }) => kind),
  ...materialized.receipt.publicationEffects,
];
assert.equal(forbiddenEffects.some((kind) => ["network.connect", "secrets.read", "signing.use", "git.tag", "repository.remote-write"].includes(kind)), false);

const receipt = {
  apiVersion: API,
  kind: "Rp001InstalledWindowsDesktopE2eReceipt",
  platform: process.platform,
  nodeVersion: process.version,
  host: { application: "ChatGPT Desktop", executor: "Codex", operatingSystem: "Windows" },
  packageImport: "devrelay/advanced",
  repository: repository.ref,
  systemVerification: systemVerification.ref,
  baselines: baselines.map(({ role, ref }) => ({ role, artifact: ref })),
  environment: { profileSetDigest: profileSet.contentDigest, inventoryFingerprint: environmentObservation.inventory.fingerprint, readiness: environmentReadiness.ref },
  route,
  attempt: attemptLoaded.ref,
  materialization: { candidate: materialized.candidateRef, receipt: materialized.receiptRef, artifactKinds: materialized.candidate.artifacts.map(({ kind }) => kind), captureCalls, replayEffectCalls: replayedMaterialization.effectCalls },
  verification: { policy: policy.ref, resultSet: verification.resultSetRef, candidate: verification.verificationCandidateRef, obligations: verification.resultSet.results, releaseCheck: releaseCheck.ref },
  gate: { approval: gate.approvalRef, readiness: gate.readinessBaselineRef, summary: gate.summary },
  recovery: { drift, route: driftRoute, substitutionRejected, recoveredFingerprint: recoveredAttempt.fingerprint, replayEffectCalls: recoveryReplay.effectCalls },
  traceability: { candidateUpdate: preparedCandidateTrace.updateRef, candidateMerge: mergedCandidateTrace.receipt, readinessUpdate: preparedReadinessTrace.updateRef, readinessMerge: mergedReadinessTrace.receipt, graph: mergedReadinessTrace.snapshotRef, coverageTotal: coverage.total, provenanceTotal: provenance.total },
  noPublication: { publicationAuthorized: false, forbiddenEffectsObserved: [], publicRegistryCalls: 0, remoteRepositoryWrites: 0, tagsCreated: 0 },
  outcome: "pass",
};
receipt.receiptDigest = D(receipt);
process.stdout.write(`${canonicalJson(receipt)}\n`);
