import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { TRACEABILITY_VOCABULARY_V1_6 } from "../../../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import { workItemVerificationTraceabilityContributors } from "../../../src/work-item-verification-traceability-contributor.mjs";
import { changeIntegrationTraceabilityContributor } from "../../../src/change-integration-traceability-contributor.mjs";

const API = "devrelay.dev/v1alpha1";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const writeJson = (relativePath, value) => {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${canonicalJson(value)}\n`, "utf8");
};
const ref = (artifactId, digest) => ({ artifactId, digest });
const fullRef = (artifactId, digest, schema = "https://devrelay.dev/test/v1", mediaType = "application/json") => ({
  artifactId,
  schema,
  mediaType,
  digest,
  uri: `memory://devrelay/traceability-input/${encodeURIComponent(artifactId)}/${digest.slice(7)}`,
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
const loaded = (value, reference) => {
  const bytes = Buffer.from(canonicalJson(value));
  const actual = sha256Digest(bytes);
  const resolved =
    reference === undefined
      ? fullRef(value.approvalId ?? value.subjectId ?? value.kind, actual)
      : { ...fullRef(reference.artifactId, reference.digest), ...structuredClone(reference) };
  if (resolved.digest !== actual) {
    throw new Error(`loaded reference ${resolved.artifactId} does not bind canonical bytes`);
  }
  return { value, bytes, ref: resolved };
};
const rawLoaded = (value, artifactId) => {
  const bytes = Buffer.from(canonicalJson(value));
  return { value, bytes, ref: fullRef(artifactId, sha256Digest(bytes)) };
};

function findAppliedUpdates(head) {
  const wanted = new Map(head.appliedUpdates.map((entry) => [entry.digest, entry]));
  const found = new Map();
  const visit = (entry) => {
    for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
      const target = path.join(entry, child.name);
      if (child.isDirectory()) visit(target);
      else if (child.name.endsWith(".json")) {
        try {
          const value = JSON.parse(fs.readFileSync(target, "utf8"));
          const bytes = Buffer.from(canonicalJson(value));
          const digest = sha256Digest(bytes);
          if (wanted.has(digest) && !found.has(digest)) {
            found.set(digest, { value, bytes, ref: wanted.get(digest) });
          }
        } catch {}
      }
    }
  };
  visit(path.join(root, "dogfood"));
  visit(path.join(root, "project"));
  const missing = [...wanted.keys()].filter((digest) => !found.has(digest));
  if (missing.length > 0) throw new Error(`missing applied updates: ${missing.join(", ")}`);
  return [...found.values()];
}

const headPath =
  "dogfood/v0.10-release-hardening/execution/WI-REL-GITHUB-AUTOMATION/traceability-graph-snapshot.json";
const headValue = readJson(headPath);
const headBytes = Buffer.from(canonicalJson(headValue));
const headRef = fullRef(
  `traceability-graph-devrelay-work-breakdown-r${headValue.revision}`,
  sha256Digest(headBytes),
  "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
  "application/vnd.devrelay.traceability-graph+json",
);
headRef.uri = `memory://devrelay/traceability/devrelay%2Fwork-breakdown/snapshots/${headRef.digest.slice(7)}.json`;
const store = createInMemoryTraceabilityStore();
store.restore(
  headValue.graphId,
  [{ value: headValue, bytes: headBytes, ref: headRef }, ...findAppliedUpdates(headValue)],
  headRef,
);
const graph = createTraceabilityGraphService({
  graphId: headValue.graphId,
  projectId: headValue.projectId,
  store,
  contributors: [
    ...workItemVerificationTraceabilityContributors,
    changeIntegrationTraceabilityContributor,
  ],
  vocabulary: TRACEABILITY_VOCABULARY_V1_6,
});

const jobs = ["WI-REL-GITHUB-AUTOMATION"];
const summary = {
  apiVersion: API,
  kind: "ReleaseFirstFrontierTraceabilitySummary",
  inputGraph: headRef,
  updates: [],
};

const wivFiles = {
  subject: "ValidatedVerificationSubject",
  "obligation-set": "VerificationObligationSet",
  binding: "ValidatedVerifierBindingSet",
  invocation: "VerifierInvocation",
  "raw-verifier-result": "RawVerifierResult",
  "normalized-evidence": "NormalizedVerificationEvidence",
  policy: "VerificationPolicy",
  evaluation: "VerificationPolicyEvaluation",
  "gate-candidate": "WorkItemVerificationGateCandidate",
};

for (const workItemId of jobs) {
  const base = `dogfood/v0.10-release-hardening/verification/${workItemId}`;
  const entries = Object.entries(wivFiles).map(([name]) => {
    const value = readJson(`${base}/${name}.json`);
    return rawLoaded(value, `${workItemId}-${name}`);
  });
  const candidateTrace = readJson(`${base}/candidate-traceability.json`);
  const candidateContext = {
    invocation: {
      invocationId: `WIV-TRACE-CANDIDATE-${workItemId}`,
      module: { id: "work-item-verification", version: "0.1.0", operation: "verify-work-item" },
    },
    invocationFingerprint: canonicalJsonDigest({ workItemId, authority: "candidate" }),
    moduleResult: {
      apiVersion: API,
      kind: "ModuleResult",
      invocationId: `WIV-TRACE-CANDIDATE-${workItemId}`,
      status: "completed",
      outcome: "verified",
      outputs: {},
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      artifacts: [...entries, rawLoaded(candidateTrace, `${workItemId}-candidate-trace`)],
    },
    loadedOutputs: {},
  };
  const candidatePrepared = await graph.prepare({
    ...candidateContext,
    baseGraph: graph.captureBase(),
  });
  const candidateMerged = await graph.mergePrepared(candidatePrepared);
  writeJson(`${workItemId}/candidate-traceability-update.json`, candidatePrepared.update);
  writeJson(`${workItemId}/candidate-traceability-merge-receipt.json`, candidateMerged.receipt);
  const approval = readJson(`${base}/gate-approval.json`);
  const approvalBytes = Buffer.from(canonicalJson(approval));
  const approvalLoaded = loaded(
    approval,
    fullRef(approval.approvalId, sha256Digest(approvalBytes)),
  );
  const approvedTrace = readJson(`${base}/approved-traceability.json`);
  const approvedContext = {
    invocation: {
      invocationId: `WIV-TRACE-APPROVED-${workItemId}`,
      module: { id: "work-item-verification", version: "0.1.0", operation: "verify-work-item" },
    },
    invocationFingerprint: canonicalJsonDigest({ workItemId, authority: "approved" }),
    moduleResult: {
      apiVersion: API,
      kind: "ModuleResult",
      invocationId: `WIV-TRACE-APPROVED-${workItemId}`,
      status: "completed",
      outcome: "verified",
      outputs: {},
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      artifacts: [
        ...entries,
        approvalLoaded,
        rawLoaded(approvedTrace, `${workItemId}-approved-trace`),
      ],
    },
    loadedOutputs: {},
  };
  const approvedPrepared = await graph.prepare({
    ...approvedContext,
    baseGraph: graph.captureBase(),
  });
  const approvedMerged = await graph.mergePrepared(approvedPrepared);
  writeJson(`${workItemId}/approved-traceability-update.json`, approvedPrepared.update);
  writeJson(`${workItemId}/approved-traceability-merge-receipt.json`, approvedMerged.receipt);
  summary.updates.push({
    workItemId,
    stage: "WorkItemVerification",
    candidateUpdate: candidatePrepared.updateRef,
    approvedUpdate: approvedPrepared.updateRef,
    resultGraph: approvedMerged.snapshotRef,
  });
}

for (const workItemId of jobs) {
  const integration = `dogfood/v0.10-release-hardening/integration/${workItemId}`;
  const verification = `dogfood/v0.10-release-hardening/verification/${workItemId}`;
  const execution = `dogfood/v0.10-release-hardening/execution/${workItemId}`;
  const moduleResult = readJson(`${integration}/module-result.json`);
  const adapterInvocation = readJson(`${integration}/integration-adapter-invocation.json`);
  const subject = readJson(`${integration}/verified-work-item-subject.json`);
  const binding = readJson(`${integration}/integration-input-binding.json`);
  const record = readJson(`${integration}/integrated-change-record.json`);
  const snapshot = readJson(`${integration}/post-repository-snapshot.json`);
  const workItem = readJson(`${execution}/work-item.json`);
  const changeSet = readJson(`${execution}/change-set-draft.json`);
  const architecture = readJson("project/architecture-baseline.json");
  const contracts = readJson("project/contract-disposition.json");
  const recordRef = moduleResult.outputs["integrated-change-record"][0];
  const snapshotRef = moduleResult.outputs["repository-snapshot"][0];
  const trace = seal(
    {
      apiVersion: API,
      kind: "ChangeIntegrationTraceabilityInput",
      integratedChange: ref(recordRef.artifactId, recordRef.digest),
      subject: ref(subject.subjectId, subject.subjectDigest),
      repositorySnapshot: ref(snapshotRef.artifactId, snapshotRef.digest),
      authority: "approved",
      scope: "change-integration/integrated",
    },
    "traceabilityDigest",
  );
  const resultLoaded = rawLoaded(moduleResult, `${workItemId}-ci-result`);
  const context = {
    invocation: {
      invocationId: adapterInvocation.invocationId,
      module: { id: "change-integration", version: "0.1.0", operation: "integrate-change" },
    },
    invocationFingerprint: adapterInvocation.invocationFingerprint,
    moduleResult,
    loadedInputs: {
      "verified-work-item-subject": [rawLoaded(subject, `${workItemId}-ci-subject`)],
      "integration-input-binding": [rawLoaded(binding, `${workItemId}-ci-binding`)],
    },
    loadedOutputs: {
      "integrated-change-record": [loaded(record, recordRef)],
      "repository-snapshot": [loaded(snapshot, snapshotRef)],
    },
    loadedAttachments: {
      result: resultLoaded,
      trace: rawLoaded(trace, `${workItemId}-ci-trace`),
      workItem: loaded(workItem, subject.workItem),
      changeSet: loaded(changeSet, subject.changeSet),
      architecture: loaded(architecture, binding.baselines.architectureBaseline),
      contracts: loaded(contracts, binding.baselines.contractDisposition),
    },
  };
  const prepared = await graph.prepare({ ...context, baseGraph: graph.captureBase() });
  const merged = await graph.mergePrepared(prepared);
  const replay = await graph.mergePrepared(prepared);
  if (canonicalJson(merged.receipt) !== canonicalJson(replay.receipt)) {
    throw new Error(`ChangeIntegration traceability replay changed for ${workItemId}`);
  }
  writeJson(`${workItemId}/integration-traceability-input.json`, trace);
  writeJson(`${workItemId}/integration-traceability-update.json`, prepared.update);
  writeJson(`${workItemId}/integration-traceability-merge-receipt.json`, merged.receipt);
  summary.updates.push({
    workItemId,
    stage: "ChangeIntegration",
    update: prepared.updateRef,
    resultGraph: merged.snapshotRef,
  });
}

const final = graph.captureBase();
const active = (kind) =>
  final.snapshot.nodes.filter((node) => node.kind === kind && node.state === "active");
for (const [kind, expected] of [
  ["execution-attempt", 5],
  ["integrated-change-record", 5],
]) {
  if (active(kind).length < expected) {
    throw new Error(`living graph lost ${kind} facts`);
  }
}
summary.resultGraph = final.ref;
summary.activeExecutionAttempts = active("execution-attempt").map(({ stableId }) => stableId).sort();
summary.activeIntegratedChanges = active("integrated-change-record").map(({ stableId }) => stableId).sort();
summary.summaryDigest = canonicalJsonDigest(summary.updates);
writeJson("github-traceability-graph-snapshot.json", final.snapshot);
writeJson("github-traceability-summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
