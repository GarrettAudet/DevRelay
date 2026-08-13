import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { bindChangeIntegrationInputs } from "../../../src/change-integration-input-guard.mjs";
import { buildChangeIntegrationPlan } from "../../../src/change-integration-plan-builder.mjs";
import { authorizeChangeIntegrationEffect } from "../../../src/change-integration-target-cas.mjs";
import {
  createLocalGitIntegrationAdapter,
  localGitIntegrationConfigurationDigest,
} from "../../../src/change-integration-local-git-adapter.mjs";
import { createChangeIntegrationCheckpointController } from "../../../src/change-integration-checkpoint.mjs";
import { validateChangeIntegrationResult } from "../../../src/change-integration-result-validator.mjs";
import { validateLifecycleRunReportArtifact } from "../../../src/lifecycle-run-report-artifact-validator.mjs";
import { validateWorkItemVerificationArtifact } from "../../../src/work-item-verification-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const writeJson = (relativePath, value) => {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${canonicalJson(value)}\n`, "utf8");
  return target;
};
const ref = (artifactId, digest) => ({ artifactId, digest });
const fullRef = (
  artifactId,
  digest,
  schema = "https://devrelay.dev/test/v1",
  mediaType = "application/json",
) => ({
  artifactId,
  schema,
  mediaType,
  digest,
  uri: `memory://devrelay/integration/${encodeURIComponent(artifactId)}/${digest.slice(7)}`,
});
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const loaded = (value, artifactId, schema = "https://devrelay.dev/test/v1") => {
  const bytes = Buffer.from(canonicalJson(value));
  return { value, bytes, ref: fullRef(artifactId, sha256Digest(bytes), schema) };
};
const artifactBinding = (entry) => ({ artifact: entry.value, reference: entry.ref });
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

function artifactStore() {
  const values = new Map();
  return {
    values,
    put(bytes, {
      artifactId,
      schema = "https://devrelay.dev/test/v1",
      mediaType = "application/json",
    }) {
      const buffer = Buffer.from(bytes);
      const digest = sha256Digest(buffer);
      const reference = fullRef(artifactId, digest, schema, mediaType);
      values.set(digest, buffer);
      return reference;
    },
    async persistArtifact(bytes, metadata) {
      return this.put(bytes, metadata);
    },
    async readArtifact(reference) {
      const bytes = values.get(reference.digest);
      if (!bytes) throw new Error(`missing artifact ${reference.artifactId}`);
      return Buffer.from(bytes);
    },
  };
}

function checkpointStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      if (values.has(key)) throw new Error(`immutable checkpoint overwrite: ${key}`);
      values.set(key, structuredClone(value));
    },
  };
}

function createSourceCommit(parent, files, workItemId) {
  const index = path.join(
    os.tmpdir(),
    `devrelay-v010-${process.pid}-${workItemId.replaceAll(/[^A-Za-z0-9]/gu, "-")}.index`,
  );
  fs.rmSync(index, { force: true });
  const env = {
    ...process.env,
    GIT_INDEX_FILE: index,
    GIT_AUTHOR_NAME: "DevRelay",
    GIT_AUTHOR_EMAIL: "garrett.audet@gmail.com",
    GIT_COMMITTER_NAME: "DevRelay",
    GIT_COMMITTER_EMAIL: "garrett.audet@gmail.com",
    GIT_AUTHOR_DATE: "2026-08-12T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-08-12T00:00:00Z",
  };
  const run = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    run("read-tree", parent);
    run("add", "--", ...files);
    const tree = run("write-tree");
    const commit = run(
      "commit-tree",
      tree,
      "-p",
      parent,
      "-m",
      `Integrate ${workItemId}`,
    );
    return { commit, tree };
  } finally {
    fs.rmSync(index, { force: true });
  }
}

const targetRef = "refs/heads/codex/v0.10-first-frontier-integration";
const releaseHead = git("rev-parse", "HEAD");
git("update-ref", targetRef, releaseHead);

const workBreakdown = readJson("project/work-breakdown-baseline.json");
const baselineDefinitions = [
  ["requirementsBaseline", "project/requirements-baseline.json", "baselineId"],
  ["projectOverviewBaseline", "project/project-overview-baseline.json", "baselineId"],
  ["architectureBaseline", "project/architecture-baseline.json", "baselineId"],
  ["contractDisposition", "project/contract-disposition.json", "dispositionId"],
  ["workBreakdownBaseline", "project/work-breakdown-baseline.json", "baselineId"],
  ["workDependencyBaseline", "project/work-dependency-baseline.json", "baselineId"],
  ["specialistAssignmentBaseline", "project/specialist-assignment-baseline.json", "baselineId"],
];
const baselineValues = Object.fromEntries(
  baselineDefinitions.map(([name, relativePath]) => [name, readJson(relativePath)]),
);
const jobs = [
  {
    workItemId: "WI-REL-WORK-EXECUTION-RUNTIME",
    attemptId: "ATT-REL-WORK-EXECUTION-RUNTIME-001",
    files: [
      "src/work-execution-runtime.mjs",
      "src/work-execution-traceability-contributor.mjs",
      "src/work-execution-artifact-validator.mjs",
      "src/traceability-artifact-validator.mjs",
      "src/traceability-graph.mjs",
      "src/index.mjs",
      "test/work-execution-runtime.test.mjs",
      "test/work-execution-traceability.test.mjs",
      "test/traceability-append-only.test.mjs",
      "README.md",
      "RELEASE.md",
    ],
  },
  {
    workItemId: "WI-REL-GOVERNANCE",
    attemptId: "ATT-REL-GOVERNANCE-001",
    files: [
      "LICENSE",
      "NOTICE",
      "DCO.md",
      "CONTRIBUTING.md",
      "GOVERNANCE.md",
      "CODE_OF_CONDUCT.md",
      "SUPPORT.md",
      "SECURITY.md",
      ".github/CODEOWNERS",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/pull_request_template.md",
      ".github/dependabot.yml",
      "test/release-governance.test.mjs",
    ],
  },
];
const summary = {
  apiVersion: API,
  kind: "ReleaseFirstFrontierIntegrationSummary",
  targetRef,
  initialCommit: releaseHead,
  integrations: [],
};

for (const job of jobs) {
  const verification = `dogfood/v0.10-release-hardening/verification/${job.workItemId}`;
  const execution = `dogfood/v0.10-release-hardening/execution/${job.workItemId}`;
  const workItem = workBreakdown.workItems.find(({ id }) => id === job.workItemId);
  if (!workItem) throw new Error(`missing work item ${job.workItemId}`);
  const verificationSubject = readJson(`${verification}/subject.json`);
  const verificationCandidate = readJson(`${verification}/gate-candidate.json`);
  const gateApproval = readJson(`${verification}/gate-approval.json`);
  const normalizedEvidence = readJson(`${verification}/normalized-evidence.json`);
  const policyEvaluation = readJson(`${verification}/evaluation.json`);
  const verifierBinding = readJson(`${verification}/binding.json`);
  const obligations = readJson(`${verification}/obligation-set.json`);
  validateWorkItemVerificationArtifact(verificationSubject);
  validateWorkItemVerificationArtifact(verificationCandidate, {
    policyEvaluation,
    binding: verifierBinding,
    subject: verificationSubject,
    obligations,
    normalizedEvidence,
  });
  validateWorkItemVerificationArtifact(gateApproval, {
    candidate: verificationCandidate,
    policyEvaluation,
    binding: verifierBinding,
    subject: verificationSubject,
    obligations,
    normalizedEvidence,
  });
  const baselines = Object.fromEntries(
    Object.entries(baselineValues).map(([name, artifact]) => [
      name,
      { artifact, reference: structuredClone(verificationSubject[name]) },
    ]),
  );
  const verifiedChange = readJson(`${execution}/change-set-draft.json`);
  const verifiedChangeBytes = Buffer.from(canonicalJson(verifiedChange));
  const workItemRef = structuredClone(verificationSubject.workItem);
  const verifiedChangeRef = structuredClone(verificationSubject.changeSetDraft);
  const expectedCommit = git("rev-parse", targetRef);
  const expectedTree = git("rev-parse", `${expectedCommit}^{tree}`);
  const source = createSourceCommit(expectedCommit, job.files, job.workItemId);
  const targetSnapshot = {
    apiVersion: API,
    kind: "RepositorySnapshot",
    repository: root,
    revision: expectedCommit,
    treeDigest: canonicalJsonDigest({ commit: expectedCommit, tree: expectedTree }),
    includedPaths: ["**"],
    excludedPaths: [".git"],
  };
  const targetLoaded = loaded(targetSnapshot, `PRE-${job.workItemId}`);
  const integrationPolicy = {
    kind: "IntegrationPolicy",
    version: "1.0.0",
    strategy: "fast-forward",
    targetRef,
  };
  const integrationPolicyBytes = Buffer.from(canonicalJson(integrationPolicy));
  const integrationPolicyRef = fullRef(
    `CI-POL-${job.workItemId}`,
    sha256Digest(integrationPolicyBytes),
  );
  const configuration = {
    repositoryPath: root,
    gitExecutable: "git",
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
  };
  const adapterIdentity = {
    id: "local-git-integration",
    version: "0.1.0",
    configurationDigest: localGitIntegrationConfigurationDigest(configuration),
  };
  const permissionDemands = [
    { kind: "process.spawn", scope: { values: ["git"] } },
  ];
  const validatedInput = bindChangeIntegrationInputs({
    subjectId: `CI-SUB-${job.workItemId}-001`,
    bindingId: `CI-BIND-${job.workItemId}-001`,
    workItem,
    workItemRef,
    verificationSubject,
    verificationCandidate,
    verificationContext: {
      policyEvaluation,
      subject: verificationSubject,
      obligations,
      binding: verifierBinding,
      normalizedEvidence,
    },
    gateApproval,
    verifiedChange,
    verifiedChangeRef,
    verifiedChangeBytes,
    verificationEvidence: gateApproval.acceptedEvidence,
    baselines,
    target: artifactBinding(targetLoaded),
    targetRef,
    expectedCommit,
    integrationPolicy,
    integrationPolicyRef,
    integrationPolicyBytes,
    adapter: adapterIdentity,
    permissionDemands,
    hostGrants: permissionDemands,
    idempotencyKey: `CI-REL-${job.workItemId}-001`,
  });
  const plan = buildChangeIntegrationPlan({
    planId: `CI-PLAN-${job.workItemId}-001`,
    validatedInput,
    verifiedChangeBytes,
    sourceCommit: source.commit,
    strategy: "fast-forward",
  });
  const artifacts = artifactStore();
  const rawArtifacts = artifactStore();
  const nativeArtifacts = artifactStore();
  let effectCalls = 0;
  const localAdapter = createLocalGitIntegrationAdapter({
    ...configuration,
    persistNativeEvidence: async (bytes) =>
      nativeArtifacts.put(bytes, {
        artifactId: `NATIVE-${job.workItemId}-${nativeArtifacts.values.size}`,
        mediaType: "application/vnd.devrelay.local-git-native-evidence+json",
      }),
    readNativeEvidence: nativeArtifacts.readArtifact.bind(nativeArtifacts),
  });
  const checkpoints = checkpointStore();
  const controller = createChangeIntegrationCheckpointController({
    effect: async (request) => {
      effectCalls += 1;
      return localAdapter(request, {
        invocationFingerprint: request.invocationFingerprint,
        targetRef,
        expectedTargetCommit: expectedCommit,
      });
    },
    persistRawResult: async (bytes) =>
      rawArtifacts.put(bytes, {
        artifactId: `RAW-CI-${job.workItemId}-001`,
        schema:
          "https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult",
        mediaType: "application/vnd.devrelay.raw-integration-effect-result+json",
      }),
    readRawResult: rawArtifacts.readArtifact.bind(rawArtifacts),
  });
  let casCallbacks = 0;
  const coordinated = await authorizeChangeIntegrationEffect({
    plan,
    invocationId: `CI-INV-${job.workItemId}-001`,
    observeTarget: async () => ({ ref: targetRef, commit: git("rev-parse", targetRef) }),
    applyAtomicConditionalEffect: async ({ invocation }) => {
      casCallbacks += 1;
      return controller.execute({ plan, invocation, checkpoints });
    },
  });
  if (coordinated.outcome !== "authorized-effect-result") {
    throw new Error(`TARGET-CAS did not authorize ${job.workItemId}`);
  }
  const invocation = coordinated.invocation;
  const first = coordinated.effectResult;
  const replay = await controller.execute({ plan, invocation, checkpoints });
  if (
    first.rawResult?.terminalState !== "integrated" ||
    effectCalls !== 1 ||
    casCallbacks !== 1 ||
    replay.effectCalls !== 0
  ) {
    throw new Error(`integration/replay failed for ${job.workItemId}`);
  }
  const postCommit = git("rev-parse", targetRef);
  const postTree = git("rev-parse", `${postCommit}^{tree}`);
  const postSnapshot = {
    ...targetSnapshot,
    revision: postCommit,
    treeDigest: first.rawResult.postState.treeDigest,
  };
  const postBytes = Buffer.from(canonicalJson(postSnapshot));
  const postRef = artifacts.put(postBytes, {
    artifactId: `POST-${job.workItemId}`,
    schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
    mediaType: "application/vnd.devrelay.repository-snapshot+json",
  });
  const incorporationProof = {
    apiVersion: API,
    kind: "RepositoryIncorporationProof",
    invocationId: invocation.invocationId,
    invocationFingerprint: invocation.invocationFingerprint,
    targetRef,
    strategy: "fast-forward",
    expectedTargetCommit: expectedCommit,
    sourceCommit: source.commit,
    postCommit,
    postTreeDigest: first.rawResult.postState.treeDigest,
    parentCommits: [expectedCommit],
    sourceIncorporated: true,
  };
  const proofBytes = Buffer.from(canonicalJson(incorporationProof));
  const proofRef = artifacts.put(proofBytes, {
    artifactId: `PROOF-${job.workItemId}`,
    schema:
      "https://devrelay.dev/internal/change-integration/repository-incorporation-proof/v1",
    mediaType: "application/vnd.devrelay.repository-incorporation-proof+json",
  });
  const rawResultRef = replay.checkpoint.rawResult;
  const readArtifact = async (reference) => {
    const bytes =
      artifacts.values.get(reference.digest) ??
      rawArtifacts.values.get(reference.digest) ??
      nativeArtifacts.values.get(reference.digest);
    if (!bytes) throw new Error(`missing artifact ${reference.artifactId}`);
    return Buffer.from(bytes);
  };
  const moduleResult = await validateChangeIntegrationResult({
    subject: validatedInput.subject,
    plan,
    invocation,
    checkpointReplay: replay,
    rawResultArtifact: fullRef(
      rawResultRef.artifactId,
      rawResultRef.digest,
      "https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult",
      "application/vnd.devrelay.raw-integration-effect-result+json",
    ),
    preRepositorySnapshot: targetSnapshot,
    postRepositorySnapshotRef: postRef,
    postRepositorySnapshotBytes: postBytes,
    incorporationProofRef: proofRef,
    incorporationProofBytes: proofBytes,
    persistArtifact: artifacts.persistArtifact.bind(artifacts),
    readArtifact,
  });
  if (moduleResult.outcome !== "integrated") {
    throw new Error(`ChangeIntegration result is ${moduleResult.outcome}`);
  }
  const recordRef = moduleResult.outputs["integrated-change-record"][0];
  const record = JSON.parse((await artifacts.readArtifact(recordRef)).toString("utf8"));
  const completion = seal(
    {
      apiVersion: API,
      kind: "IntegratedCompletionFact",
      completionId: `ICF-${job.workItemId}-001`,
      workItem: ref(workItem.id, canonicalJsonDigest(workItem)),
      changeSet: ref(verifiedChangeRef.artifactId, verifiedChangeRef.digest),
      verification: ref(gateApproval.approvalId, gateApproval.approvalDigest),
      integration: ref(record.recordId, record.recordDigest),
      status: "verified-and-integrated",
      authority: "factual-completion",
    },
    "completionDigest",
  );
  validateLifecycleRunReportArtifact(completion);
  writeJson(`${job.workItemId}/verified-work-item-subject.json`, validatedInput.subject);
  writeJson(`${job.workItemId}/integration-input-binding.json`, validatedInput.binding);
  writeJson(`${job.workItemId}/integration-plan.json`, plan);
  writeJson(`${job.workItemId}/integration-adapter-invocation.json`, invocation);
  writeJson(`${job.workItemId}/raw-integration-effect-result.json`, first.rawResult);
  writeJson(`${job.workItemId}/integration-checkpoint.json`, replay.checkpoint);
  writeJson(`${job.workItemId}/repository-incorporation-proof.json`, incorporationProof);
  writeJson(`${job.workItemId}/post-repository-snapshot.json`, postSnapshot);
  writeJson(`${job.workItemId}/integrated-change-record.json`, record);
  writeJson(`${job.workItemId}/module-result.json`, moduleResult);
  writeJson(`${job.workItemId}/integrated-completion-fact.json`, completion);
  writeJson(`${job.workItemId}/integration-proof.json`, {
    workItemId: job.workItemId,
    targetRef,
    expectedCommit,
    sourceCommit: source.commit,
    postCommit,
    postTree,
    moduleOutcome: moduleResult.outcome,
    effectCalls,
    replayEffectCalls: replay.effectCalls,
    casCallbacks,
    recordDigest: record.recordDigest,
    completionDigest: completion.completionDigest,
  });
  summary.integrations.push({
    workItemId: job.workItemId,
    expectedCommit,
    sourceCommit: source.commit,
    postCommit,
    postTree,
    outcome: moduleResult.outcome,
    recordDigest: record.recordDigest,
    completionDigest: completion.completionDigest,
    effectCalls,
    replayEffectCalls: replay.effectCalls,
  });
}
summary.finalCommit = git("rev-parse", targetRef);
summary.summaryDigest = canonicalJsonDigest(summary.integrations);
writeJson("integration-summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
