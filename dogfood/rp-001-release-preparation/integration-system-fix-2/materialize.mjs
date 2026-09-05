import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const outRoot = resolve(root, "dogfood/rp-001-release-preparation/integration-system-fix-2");
mkdirSync(outRoot, { recursive: true });
const API = "devrelay.dev/v1alpha1";
const targetRef = "refs/heads/codex/rp-001-integration-system-fix-2";
const sourceRef = "refs/heads/codex/rp-001-source-system-fix-2";
const ids = Object.freeze([
  "WI-RP-WINDOWS-E2E",
]);
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const canonicalBytes = (value) => Buffer.from(api.canonicalJson(value), "utf8");
const ref = (artifactId, digest) => ({ artifactId, digest });
const fullRef = (artifactId, digest, schema = "https://devrelay.dev/internal/v1", mediaType = "application/json") => ({ artifactId, schema, mediaType, digest, uri: `memory://ep001/${artifactId}` });
const seal = (value, field) => ({ ...value, [field]: api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const loaded = (value, reference) => ({ value, bytes: canonicalBytes(value), ref: structuredClone(reference) });
function write(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(`${api.canonicalJson(value)}\n`, "utf8");
  writeFileSync(resolve(dir, name), bytes);
  return { artifactId: value.recordId ?? value.invocationId ?? value.kind, digest: api.sha256Digest(bytes) };
}
function artifactStore() {
  const values = new Map();
  return {
    values,
    put(bytes, { artifactId, schema = "https://devrelay.dev/internal/v1", mediaType = "application/json" }) {
      const buffer = Buffer.from(bytes);
      const reference = fullRef(artifactId, api.sha256Digest(buffer), schema, mediaType);
      values.set(reference.digest, buffer);
      return reference;
    },
    async persistArtifact(bytes, metadata) { return this.put(bytes, metadata); },
    async readArtifact(reference) {
      const bytes = values.get(reference.digest);
      if (!bytes) throw new Error(`missing artifact ${reference.artifactId}`);
      return Buffer.from(bytes);
    },
  };
}
const checkpointStore = () => {
  const values = new Map();
  return { values, async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("immutable checkpoint overwrite"); values.set(key, structuredClone(value)); } };
};

const baseCommit = json("dogfood/rp-001-release-preparation/integration-system-fix-1/integration-summary.json").finalCommit;
const sourceRoot = mkdtempSync(join(tmpdir(), "devrelay-ep001-source-"));
const sourceRepo = resolve(sourceRoot, "repo");
const sourceCommits = new Map();
try {
  execFileSync("git", ["clone", "--no-checkout", "--shared", "--", root, sourceRepo], { stdio: "ignore", windowsHide: true });
  git(sourceRepo, "checkout", "--detach", baseCommit);
  git(sourceRepo, "config", "user.name", "DevRelay Integration");
  git(sourceRepo, "config", "user.email", "devrelay@invalid");
  for (const workItemId of ids) {
    const change = json(`dogfood/rp-001-release-preparation/execution-system-fix-2/${workItemId}/change-set-draft.json`);
    for (const mutation of change.mutations) {
      const sourcePath = resolve(root, mutation.path);
      const destination = resolve(sourceRepo, mutation.path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(sourcePath, destination);
      assert.equal(api.sha256Digest(readFileSync(destination)), mutation.afterDigest, `${workItemId} source bytes drifted for ${mutation.path}`);
    }
    git(sourceRepo, "add", "--", ...change.mutations.map(({ path }) => path));
    git(sourceRepo, "commit", "-m", `RP-001 ${workItemId}`);
    sourceCommits.set(workItemId, git(sourceRepo, "rev-parse", "HEAD"));
  }
  execFileSync("git", ["-C", root, "fetch", "--no-tags", "--force", "--", sourceRepo, `HEAD:${sourceRef}`], { stdio: "ignore", windowsHide: true });
} finally {
  rmSync(sourceRoot, { recursive: true, force: true });
}

let currentCommit;
try { currentCommit = git(root, "rev-parse", "--verify", targetRef); }
catch { execFileSync("git", ["-C", root, "update-ref", targetRef, baseCommit], { stdio: "ignore", windowsHide: true }); currentCommit = baseCommit; }
if (currentCommit !== baseCommit) throw new Error(`${targetRef} already exists at ${currentCommit}; refusing to overwrite the prior integration lineage`);

const breakdown = json("project/work-breakdown-baseline.json");
const baselineArtifacts = {
  requirementsBaseline: json("project/requirements-baseline.json"),
  projectOverviewBaseline: json("project/project-overview-baseline.json"),
  architectureBaseline: json("project/architecture-baseline.json"),
  contractDisposition: json("project/contract-disposition.json"),
  workBreakdownBaseline: breakdown,
  workDependencyBaseline: json("project/work-dependency-baseline.json"),
  specialistAssignmentBaseline: json("project/specialist-assignment-baseline.json"),
};
const graphSummary = json("dogfood/rp-001-release-preparation/execution-system-fix-2/execution-summary.json");
let graphSnapshot = json("dogfood/rp-001-release-preparation/execution-system-fix-2/WI-RP-WINDOWS-E2E/traceability-graph-snapshot.json");
const graphStore = api.createInMemoryTraceabilityStore();
const graphBytes = canonicalBytes(graphSnapshot);
assert.equal(api.sha256Digest(graphBytes), graphSummary.resultGraph.digest);
const requiredUpdates = new Map(graphSnapshot.appliedUpdates.map((reference) => [reference.digest, reference]));
const restoredUpdates = new Map();
function scanTraceabilityArtifacts(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") scanTraceabilityArtifacts(path);
      continue;
    }
    if (!entry.name.endsWith(".json") || (!entry.name.includes("traceability") && !directory.includes("traceability"))) continue;
    let value;
    try { value = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
    if (!String(value?.kind ?? "").includes("TraceabilityUpdate")) continue;
    const bytes = canonicalBytes(value);
    const digest = api.sha256Digest(bytes);
    if (requiredUpdates.has(digest) && !restoredUpdates.has(digest)) restoredUpdates.set(digest, { ref: requiredUpdates.get(digest), bytes, value });
  }
}
scanTraceabilityArtifacts(resolve(root, "dogfood"));
scanTraceabilityArtifacts(resolve(root, "project/history/traceability"));
assert.equal(restoredUpdates.size, requiredUpdates.size, `restored ${restoredUpdates.size} of ${requiredUpdates.size} applied traceability updates`);
graphStore.restore(graphSnapshot.graphId, [{ ref: graphSummary.resultGraph, bytes: graphBytes, value: graphSnapshot }, ...restoredUpdates.values()], graphSummary.resultGraph);
const graph = api.createTraceabilityGraphService({ graphId: graphSnapshot.graphId, projectId: graphSnapshot.projectId, store: graphStore, contributors: [api.changeIntegrationTraceabilityContributor], vocabulary: graphSnapshot.vocabulary });
const integrationResults = [];

for (const workItemId of ids) {
  const outDir = resolve(outRoot, workItemId);
  mkdirSync(outDir, { recursive: true });
  const verificationDir = `dogfood/rp-001-release-preparation/verification-system-fix-2/${workItemId}`;
  const workItem = breakdown.workItems.find(({ id }) => id === workItemId);
  const verificationSubject = json(`${verificationDir}/subject.json`);
  const obligations = json(`${verificationDir}/obligation-set.json`);
  const verifierBinding = json(`${verificationDir}/binding.json`);
  const normalizedEvidence = json(`${verificationDir}/normalized-evidence.json`);
  const policyEvaluation = json(`${verificationDir}/evaluation.json`);
  const verificationCandidate = json(`${verificationDir}/gate-candidate.json`);
  const gateApproval = json(`${verificationDir}/gate-approval.json`);
  const verifiedChange = json(`dogfood/rp-001-release-preparation/execution-system-fix-2/${workItemId}/change-set-draft.json`);
  const verifiedChangeBytes = canonicalBytes(verifiedChange);
  const workItemRef = verificationSubject.workItem;
  const verifiedChangeRef = verificationSubject.changeSetDraft;
  assert.equal(workItemRef.artifactId, workItemId);
  assert.equal(workItemRef.digest, api.canonicalJsonDigest(workItem));
  assert.equal(verifiedChangeRef.digest, api.sha256Digest(verifiedChangeBytes));
  const baselines = Object.fromEntries(Object.entries(baselineArtifacts).map(([name, artifact]) => [name, { artifact, reference: structuredClone(verificationSubject[name]) }]));
  const targetTree = git(root, "rev-parse", `${currentCommit}^{tree}`);
  const targetSnapshot = {
    apiVersion: API,
    kind: "RepositorySnapshot",
    repository: root.replaceAll("\\", "/"),
    revision: currentCommit,
    treeDigest: api.canonicalJsonDigest({ commit: currentCommit, tree: targetTree }),
    includedPaths: ["README.md", "docs/**", "examples/**", "package.json", "src/**", "test/**"],
    excludedPaths: [".git/**", "node_modules/**"],
  };
  const targetReference = ref(`REPO-RP001-INTEGRATION-${currentCommit.slice(0, 12).toUpperCase()}`, api.canonicalJsonDigest(targetSnapshot));
  const integrationPolicy = { kind: "IntegrationPolicy", version: "1.0.0", mode: "verified-fast-forward", targetRef };
  const integrationPolicyBytes = Buffer.from(`DevRelay RP-001 verified fast-forward policy for ${targetRef}\n`, "utf8");
  const integrationPolicyRef = fullRef(`CI-POLICY-${workItemId}`, api.sha256Digest(integrationPolicyBytes));
  const configuration = { repositoryPath: root, gitExecutable: "git", timeoutMs: 120_000, maxOutputBytes: 1024 * 1024 };
  const adapter = { id: "local-git-integration", version: "0.1.0", configurationDigest: api.localGitIntegrationConfigurationDigest(configuration) };
  const permissionDemands = [{ kind: "process.spawn", scope: { values: ["git"] } }];
  const verificationContext = { policyEvaluation, subject: verificationSubject, obligations, binding: verifierBinding, normalizedEvidence };
  const validatedInput = api.bindChangeIntegrationInputs({
    subjectId: `CI-SUBJECT-${workItemId}`,
    bindingId: `CI-BINDING-${workItemId}`,
    workItem,
    workItemRef,
    verificationSubject,
    verificationCandidate,
    verificationContext,
    gateApproval,
    verifiedChange,
    verifiedChangeRef,
    verifiedChangeBytes,
    verificationEvidence: gateApproval.acceptedEvidence,
    baselines,
    target: { artifact: targetSnapshot, reference: targetReference },
    targetRef,
    expectedCommit: currentCommit,
    integrationPolicy,
    integrationPolicyRef,
    integrationPolicyBytes,
    adapter,
    permissionDemands,
    hostGrants: permissionDemands,
    idempotencyKey: `CI-EP001-${workItemId}-REPAIR-002`,
  });
  const sourceCommit = sourceCommits.get(workItemId);
  const plan = api.buildChangeIntegrationPlan({ planId: `CI-PLAN-${workItemId}`, validatedInput, verifiedChangeBytes, sourceCommit, strategy: "fast-forward" });
  const nativeStore = artifactStore();
  const rawStore = artifactStore();
  const resultStore = artifactStore();
  let effectCalls = 0;
  const localAdapter = api.createLocalGitIntegrationAdapter({
    ...configuration,
    persistNativeEvidence: async (bytes) => nativeStore.put(bytes, { artifactId: `NATIVE-${workItemId}-${nativeStore.values.size}`, mediaType: "application/vnd.devrelay.local-git-native-evidence+json" }),
    readNativeEvidence: nativeStore.readArtifact.bind(nativeStore),
  });
  const checkpoints = checkpointStore();
  const controller = api.createChangeIntegrationCheckpointController({
    effect: async (invocation) => {
      effectCalls += 1;
      return localAdapter(invocation, { invocationFingerprint: invocation.invocationFingerprint, targetRef, expectedTargetCommit: currentCommit });
    },
    persistRawResult: async (bytes) => rawStore.put(bytes, { artifactId: `RAW-${workItemId}`, schema: "https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult", mediaType: "application/vnd.devrelay.raw-integration-effect-result+json" }),
    readRawResult: rawStore.readArtifact.bind(rawStore),
  });
  const coordinated = await api.authorizeChangeIntegrationEffect({
    plan,
    invocationId: `CI-INVOCATION-${workItemId}-REPAIR-002`,
    observeTarget: async () => ({ ref: targetRef, commit: git(root, "rev-parse", "--verify", targetRef) }),
    applyAtomicConditionalEffect: async ({ invocation }) => controller.execute({ plan, invocation, checkpoints }),
  });
  assert.equal(coordinated.outcome, "authorized-effect-result");
  const invocation = coordinated.invocation;
  if (!coordinated.effectResult?.rawResult) throw new Error(`integration effect failed for ${workItemId}: ${JSON.stringify(coordinated.effectResult)}`);
  const replay = await controller.execute({ plan, invocation, checkpoints });
  assert.equal(effectCalls, 1);
  assert.equal(replay.effectCalls, 0);
  assert.equal(replay.rawResult.terminalState, "integrated");
  assert.equal(git(root, "rev-parse", "--verify", targetRef), sourceCommit);
  const postSnapshot = {
    apiVersion: API,
    kind: "RepositorySnapshot",
    repository: targetSnapshot.repository,
    revision: sourceCommit,
    treeDigest: replay.rawResult.postState.treeDigest,
    includedPaths: targetSnapshot.includedPaths,
    excludedPaths: targetSnapshot.excludedPaths,
  };
  const postBytes = canonicalBytes(postSnapshot);
  const postRef = resultStore.put(postBytes, { artifactId: `POST-${workItemId}`, schema: "https://devrelay.dev/artifacts/repository-snapshot/v1", mediaType: "application/vnd.devrelay.repository-snapshot+json" });
  const incorporationProof = {
    apiVersion: API,
    kind: "RepositoryIncorporationProof",
    invocationId: invocation.invocationId,
    invocationFingerprint: invocation.invocationFingerprint,
    targetRef,
    strategy: "fast-forward",
    expectedTargetCommit: currentCommit,
    sourceCommit,
    postCommit: sourceCommit,
    postTreeDigest: replay.rawResult.postState.treeDigest,
    parentCommits: [currentCommit],
    sourceIncorporated: true,
  };
  const proofBytes = canonicalBytes(incorporationProof);
  const proofRef = resultStore.put(proofBytes, { artifactId: `INCORPORATION-${workItemId}`, schema: "https://devrelay.dev/internal/change-integration/repository-incorporation-proof/v1", mediaType: "application/vnd.devrelay.repository-incorporation-proof+json" });
  const rawRef = replay.checkpoint.rawResult;
  const rawArtifactRef = fullRef(rawRef.artifactId, rawRef.digest, "https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult", "application/vnd.devrelay.raw-integration-effect-result+json");
  const readArtifact = async (reference) => {
    const bytes = resultStore.values.get(reference.digest) ?? rawStore.values.get(reference.digest);
    if (!bytes) throw new Error(`missing validation artifact ${reference.artifactId}`);
    return Buffer.from(bytes);
  };
  const result = await api.validateChangeIntegrationResult({
    subject: validatedInput.subject,
    plan,
    invocation,
    checkpointReplay: replay,
    rawResultArtifact: rawArtifactRef,
    preRepositorySnapshot: targetSnapshot,
    postRepositorySnapshotRef: postRef,
    postRepositorySnapshotBytes: postBytes,
    incorporationProofRef: proofRef,
    incorporationProofBytes: proofBytes,
    persistArtifact: resultStore.persistArtifact.bind(resultStore),
    readArtifact,
  });
  assert.equal(result.outcome, "integrated");
  const recordRef = result.outputs["integrated-change-record"][0];
  const recordBytes = await resultStore.readArtifact(recordRef);
  const record = JSON.parse(recordBytes);
  const trace = seal({ apiVersion: API, kind: "ChangeIntegrationTraceabilityInput", integratedChange: ref(recordRef.artifactId, recordRef.digest), subject: ref(validatedInput.subject.subjectId, validatedInput.subject.subjectDigest), repositorySnapshot: ref(postRef.artifactId, postRef.digest), authority: "approved", scope: "change-integration/integrated" }, "traceabilityDigest");
  const resultLoaded = loaded(result, fullRef(`CI-RESULT-${workItemId}`, api.canonicalJsonDigest(result), "https://devrelay.dev/artifacts/module-result/v1", "application/json"));
  const context = {
    invocation: { invocationId: invocation.invocationId, module: { id: "change-integration", version: "0.1.0", operation: "integrate-change" } },
    invocationFingerprint: invocation.invocationFingerprint,
    moduleResult: result,
    loadedInputs: {
      "verified-work-item-subject": [loaded(validatedInput.subject, fullRef(validatedInput.subject.subjectId, api.canonicalJsonDigest(validatedInput.subject), "https://devrelay.dev/artifacts/verified-work-item-subject/v1", "application/json"))],
      "integration-input-binding": [loaded(validatedInput.binding, fullRef(validatedInput.binding.bindingId, api.canonicalJsonDigest(validatedInput.binding), "https://devrelay.dev/artifacts/integration-input-binding/v1", "application/json"))],
    },
    loadedOutputs: {
      "integrated-change-record": [{ value: record, bytes: recordBytes, ref: recordRef }],
      "repository-snapshot": [{ value: postSnapshot, bytes: postBytes, ref: postRef }],
    },
    loadedAttachments: {
      result: resultLoaded,
      trace: loaded(trace, fullRef(`CI-TRACE-${workItemId}`, api.canonicalJsonDigest(trace), "https://devrelay.dev/artifacts/change-integration-traceability-input/v1", "application/json")),
      workItem: loaded(workItem, workItemRef),
      changeSet: loaded(verifiedChange, verifiedChangeRef),
      architecture: loaded(baselineArtifacts.architectureBaseline, verificationSubject.architectureBaseline),
      contract: loaded(baselineArtifacts.contractDisposition, verificationSubject.contractDisposition),
    },
  };
  const prepared = await graph.prepare({ ...context, baseGraph: graph.captureBase() });
  const merged = await graph.mergePrepared(prepared);
  assert.equal(merged.receipt.disposition, "merged");
  graphSnapshot = merged.snapshot;
  write(outDir, "integration-subject.json", validatedInput.subject);
  write(outDir, "integration-binding.json", validatedInput.binding);
  write(outDir, "integration-plan.json", plan);
  write(outDir, "integration-invocation.json", invocation);
  write(outDir, "raw-integration-result.json", replay.rawResult);
  write(outDir, "integration-result.json", result);
  write(outDir, "integrated-change-record.json", record);
  write(outDir, "post-repository-snapshot.json", postSnapshot);
  write(outDir, "repository-incorporation-proof.json", incorporationProof);
  write(outDir, "traceability-update.json", prepared.update);
  write(outDir, "traceability-merge-receipt.json", merged.receipt);
  write(outDir, "traceability-graph-snapshot.json", merged.snapshot);
  integrationResults.push({ workItemId, sourceCommit, expectedTargetCommit: currentCommit, postCommit: sourceCommit, outcome: result.outcome, adapterCalls: effectCalls, replayAdapterCalls: replay.effectCalls, integratedChange: ref(recordRef.artifactId, recordRef.digest), graphRevision: merged.snapshot.revision, graphDigest: merged.snapshotRef.digest });
  currentCommit = sourceCommit;
}

const summary = {
  apiVersion: API,
  kind: "Rp001ReleaseCatalogRepairIntegrationSummary",
  targetRef,
  baseCommit,
  finalCommit: currentCommit,
  results: integrationResults,
  resultGraph: graph.captureBase().ref,
};
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeFileSync(resolve(outRoot, "integration-summary.json"), `${api.canonicalJson(summary)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
