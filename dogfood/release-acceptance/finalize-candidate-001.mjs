import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../src/content-digest.mjs";
import { executeBusinessAcceptanceGate } from "../../src/business-acceptance-gate.mjs";
import { businessAcceptanceTraceabilityContributor } from "../../src/business-acceptance-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../../src/requirements-traceability-contributor.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
  diagnoseTraceabilityGraph,
} from "../../src/traceability-graph.mjs";

const API = "devrelay.dev/v1alpha1";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OUTPUT = path.join(
  ROOT,
  "dogfood",
  "release-acceptance",
  "candidate-001",
);
const EXPECTED_REQUEST_ID = "BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001";
const EXPECTED_REQUEST_DIGEST =
  "sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e";
const EXPECTED_CANDIDATE_ID = "BA-CANDIDATE-ed2476ac90e1359f796d1ab8";

const jsonBytes = (value) => Buffer.from(canonicalJson(value), "utf8");
const ref = (artifactId, digest) => ({ artifactId, digest });
const seal = (body, field) => ({
  ...body,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(body).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});

function immutableCheckpointStore() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      if (values.has(key))
        throw new Error(`immutable checkpoint already exists: ${key}`);
      values.set(key, structuredClone(value));
    },
  };
}

async function readJson(name) {
  const bytes = await readFile(path.join(OUTPUT, name));
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  assert.equal(
    canonicalJson(value),
    bytes.toString("utf8"),
    `${name} must contain canonical JSON bytes`,
  );
  return { bytes, value };
}

async function readRepositoryJson(relativePath) {
  const bytes = await readFile(path.join(ROOT, relativePath));
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  return { bytes, value };
}

function artifactId(value) {
  return (
    value.baselineId ??
    value.recordId ??
    value.approvalId ??
    value.candidateId ??
    value.evaluationId ??
    value.evidenceSetId ??
    value.policyId ??
    value.coverageId ??
    value.resultId ??
    value.subjectId
  );
}

function loaded(
  file,
  schema = "https://devrelay.dev/artifacts/release-evidence/v1",
  mediaType = "application/json",
) {
  const id = artifactId(file.value);
  assert.ok(id, `loaded artifact ${file.value.kind} requires an identity`);
  return {
    value: file.value,
    bytes: file.bytes,
    ref: {
      artifactId: id,
      digest: sha256Digest(file.bytes),
      schema,
      mediaType,
      uri: `file:///dogfood/release-acceptance/candidate-001/${encodeURIComponent(id)}.json`,
    },
  };
}

function loadedCanonical(
  value,
  schema = "https://devrelay.dev/artifacts/release-evidence/v1",
  mediaType = "application/json",
) {
  return loaded({ value, bytes: jsonBytes(value) }, schema, mediaType);
}

async function persist(name, value) {
  await writeFile(path.join(OUTPUT, name), jsonBytes(value));
}

function acceptedModuleContext({
  integrated,
  verification,
  coverage,
  policy,
  evidence,
  subject,
  evaluation,
  candidate,
  approval,
  record,
}) {
  const invocation = {
    invocationId: "BUSINESS-ACCEPTANCE-GATE-CONTROLLED-WINDOWS-SOURCE-001",
    module: {
      id: "business-acceptance-gate",
      version: "0.1.0",
      operation: "record-acceptance",
    },
  };
  return {
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      apiVersion: API,
      kind: "ModuleResult",
      invocationId: invocation.invocationId,
      status: "completed",
      outcome: "accepted",
      outputs: { "business-acceptance-record": [record.ref] },
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      integrated: [integrated],
      verification: [verification],
      coverage: [coverage],
      policy: [policy],
      evidence: [evidence],
      subject: [subject],
      evaluation: [evaluation],
      candidate: [candidate],
      approval: [approval],
    },
    loadedOutputs: { record: [record] },
    loadedAttachments: {},
  };
}

function businessScopeReconciliationContributor() {
  return Object.freeze({
    metadata: Object.freeze({
      id: "devrelay.requirements-business-scope-reconciliation",
      version: "1.0.0",
    }),
    authority: "approved",
    scope: "requirements/baseline",
    ownership: Object.freeze({
      authority: "approved",
      scope: "requirements/baseline",
      nodeKinds: Object.freeze(["business-scope"]),
      edgeKinds: Object.freeze(["defines"]),
    }),
    match: (context) =>
      context?.invocation?.module?.id === "architecture-design" &&
      context?.invocation?.module?.version === "0.1.0" &&
      Array.isArray(context?.loadedInputs?.["requirements-baseline"]) &&
      Array.isArray(context?.loadedInputs?.["project-overview-baseline"]),
    async project(context) {
      const projection =
        await requirementsBaselineObserverContributor.project(context);
      return {
        horizon: projection.horizon,
        nodes: projection.nodes.filter(({ kind }) => kind === "business-scope"),
        edges: projection.edges.filter(
          ({ kind, target }) =>
            kind === "defines" && target?.kind === "business-scope",
        ),
      };
    },
  });
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const [
    releaseEvidenceFile,
    releaseSnapshotFile,
    integratedFile,
    requirementsFile,
    overviewFile,
    verificationFile,
    policyFile,
    evidenceFile,
    coverageFile,
    subjectFile,
    evaluationFile,
    candidateFile,
    requestFile,
    graphFile,
    reconciliationUpdateFile,
    verificationUpdateFile,
    integrationUpdateFile,
  ] = await Promise.all([
    readJson("00-release-evidence.json"),
    readJson("01-repository-release-snapshot.json"),
    readJson("06-integrated-system-candidate.json"),
    readRepositoryJson(path.join("project", "requirements-baseline.json")),
    readRepositoryJson(path.join("project", "project-overview-baseline.json")),
    readJson("13-system-verification-result.json"),
    readJson("17-business-acceptance-policy.json"),
    readJson("18-business-acceptance-evidence.json"),
    readJson("19-business-acceptance-technical-coverage.json"),
    readJson("20-business-acceptance-subject.json"),
    readJson("21-business-acceptance-evaluation.json"),
    readJson("22-business-acceptance-candidate.json"),
    readJson("23-business-acceptance-approval-request.json"),
    readJson("16-system-verification-graph.json"),
    readJson("03-reconciliation-update.json"),
    readJson("14-system-verification-update.json"),
    (async () => {
      const relativePath = path.join(
        ROOT,
        "dogfood",
        "lifecycle-run-report",
        "traceability-reconciliation",
        "correction-001",
        "10-change-integration",
        "traceability-update.json",
      );
      const persistedBytes = await readFile(relativePath);
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(persistedBytes),
      );
      const bytes = jsonBytes(value);
      assert.equal(
        persistedBytes.toString("utf8"),
        `${bytes.toString("utf8")}\n`,
        "historical update may differ only by its persisted trailing newline",
      );
      assert.equal(
        sha256Digest(bytes),
        "sha256:cbdf9f6f8a9828f29a8e6e841ab87aba20a50a047aed86ad7b3ba54d084512cc",
      );
      return { bytes, value };
    })(),
  ]);

  const request = requestFile.value;
  assert.equal(request.requestId, EXPECTED_REQUEST_ID);
  assert.equal(request.requestDigest, EXPECTED_REQUEST_DIGEST);
  assert.equal(request.candidate.artifactId, EXPECTED_CANDIDATE_ID);
  assert.equal(request.status, "awaiting-exact-owner-approval");
  assert.equal(request.requestedDecision, "approved");
  assert.equal(candidateFile.value.candidateId, EXPECTED_CANDIDATE_ID);
  assert.equal(sha256Digest(candidateFile.bytes), request.candidateRawDigest);
  assert.deepEqual(
    request.candidate,
    ref(candidateFile.value.candidateId, candidateFile.value.candidateDigest),
  );
  assert.deepEqual(
    request.technicalCoverage,
    ref(coverageFile.value.coverageId, coverageFile.value.coverageDigest),
  );
  assert.equal(releaseEvidenceFile.value.targetCommit, request.targetCommit);

  const ownerApproval = seal(
    {
      apiVersion: API,
      kind: "BusinessAcceptanceOwnerApproval",
      approvalId: "BA-APPROVAL-CONTROLLED-WINDOWS-SOURCE-001",
      candidate: request.candidate,
      candidateRawDigest: request.candidateRawDigest,
      decision: "approved",
      owner: { ownerId: "GarrettAudet", authority: "business-owner" },
      approvedContext: {
        subject: candidateFile.value.subject,
        policy: candidateFile.value.policy,
        evidence: candidateFile.value.evidence,
        technicalCoverage: request.technicalCoverage,
      },
    },
    "approvalDigest",
  );
  const ownerApprovalBytes = jsonBytes(ownerApproval);

  const gateCheckpoints = immutableCheckpointStore();
  let ownerCalls = 0;
  const gateInput = {
    checkpointId: "DEVRELAY-CONTROLLED-WINDOWS-SOURCE-001",
    candidateRawBytes: candidateFile.bytes,
    candidate: candidateFile.value,
    evaluation: evaluationFile.value,
    subject: subjectFile.value,
    policy: policyFile.value,
    evidence: evidenceFile.value,
    technicalCoverage: coverageFile.value,
    subjectContext: {
      integratedSystemCandidate: integratedFile.value,
      systemVerificationResult: verificationFile.value,
      technicalCoverage: coverageFile.value,
      policy: policyFile.value,
      evidence: evidenceFile.value,
      repositoryReleaseSnapshot: ref(
        releaseSnapshotFile.value.snapshotId,
        releaseSnapshotFile.value.snapshotDigest,
      ),
      traceabilityCheckpoint: request.traceabilityCheckpoint,
    },
    checkpoints: gateCheckpoints,
    invokeOwner: () => {
      ownerCalls += 1;
      return { approvalRawBytes: ownerApprovalBytes };
    },
  };
  const gate = await executeBusinessAcceptanceGate(gateInput);
  const gateReplay = await executeBusinessAcceptanceGate(gateInput);
  assert.equal(ownerCalls, 1);
  assert.equal(gate.gateCalls, 1);
  assert.equal(gate.replayed, false);
  assert.equal(gateReplay.gateCalls, 0);
  assert.equal(gateReplay.replayed, true);
  assert.deepEqual(gateReplay.approval, gate.approval);
  assert.deepEqual(gateReplay.record, gate.record);
  assert.equal(gate.record.outcome, "accepted");
  assert.equal(gate.record.lifecycleDisposition, "construction-complete");
  const checkpoint = [...gateCheckpoints.values.values()][0];
  assert.equal(checkpoint.checkpointDigest, gate.checkpointDigest);

  const integratedLoaded = loaded(integratedFile);
  const verificationLoaded = loaded(verificationFile);
  const coverageLoaded = loaded(coverageFile);
  const policyLoaded = loaded(policyFile);
  const evidenceLoaded = loaded(evidenceFile);
  const subjectLoaded = loaded(subjectFile);
  const evaluationLoaded = loaded(evaluationFile);
  const candidateLoaded = loaded(candidateFile);
  const approvalLoaded = loadedCanonical(gate.approval);
  const recordLoaded = loadedCanonical(gate.record);
  const context = acceptedModuleContext({
    integrated: integratedLoaded,
    verification: verificationLoaded,
    coverage: coverageLoaded,
    policy: policyLoaded,
    evidence: evidenceLoaded,
    subject: subjectLoaded,
    evaluation: evaluationLoaded,
    candidate: candidateLoaded,
    approval: approvalLoaded,
    record: recordLoaded,
  });

  const graphRef = request.traceabilityCheckpoint;
  assert.equal(sha256Digest(graphFile.bytes), graphRef.digest);
  assert.equal(graphFile.value.graphId, "devrelay/work-breakdown");
  const updateFiles = [
    integrationUpdateFile,
    reconciliationUpdateFile,
    verificationUpdateFile,
  ];
  const updateEntries = graphFile.value.appliedUpdates.map((updateRef) => {
    const file = updateFiles.find(
      ({ bytes }) => sha256Digest(bytes) === updateRef.digest,
    );
    assert.ok(file, `missing persisted applied update ${updateRef.digest}`);
    return { value: file.value, bytes: file.bytes, ref: updateRef };
  });
  const graphStore = createInMemoryTraceabilityStore();
  graphStore.restore(
    graphFile.value.graphId,
    [
      { value: graphFile.value, bytes: graphFile.bytes, ref: graphRef },
      ...updateEntries,
    ],
    graphRef,
  );
  const graph = createTraceabilityGraphService({
    graphId: graphFile.value.graphId,
    projectId: graphFile.value.projectId,
    store: graphStore,
    contributors: [
      businessScopeReconciliationContributor(),
      businessAcceptanceTraceabilityContributor,
    ],
  });
  const requirementsLoaded = loaded(
    requirementsFile,
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  );
  const overviewLoaded = loaded(
    overviewFile,
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  );
  assert.deepEqual(
    ref(requirementsLoaded.ref.artifactId, requirementsLoaded.ref.digest),
    integratedFile.value.requirementsBaseline,
  );
  assert.deepEqual(
    ref(overviewLoaded.ref.artifactId, overviewLoaded.ref.digest),
    integratedFile.value.projectOverviewBaseline,
  );
  const requirementsInvocation = {
    invocationId: "REQUIREMENTS-BASELINE-OBSERVE-RELEASE-001",
    module: {
      id: "architecture-design",
      version: "0.1.0",
      operation: "establish-baseline",
    },
  };
  const requirementsContext = {
    invocation: requirementsInvocation,
    invocationFingerprint: canonicalJsonDigest(requirementsInvocation),
    moduleResult: {
      apiVersion: API,
      kind: "ModuleResult",
      invocationId: requirementsInvocation.invocationId,
      status: "completed",
      outcome: "designed",
      outputs: {},
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      "requirements-baseline": [requirementsLoaded],
      "project-overview-baseline": [overviewLoaded],
    },
    loadedOutputs: {},
    loadedAttachments: {},
  };
  const requirementsPrepared = await graph.prepare({
    ...requirementsContext,
    baseGraph: graph.captureBase(),
  });
  const requirementsMerged = await graph.mergePrepared(requirementsPrepared);
  const requirementsReplay = await graph.mergePrepared(requirementsPrepared);
  assert.deepEqual(requirementsReplay.receipt, requirementsMerged.receipt);
  assert.equal(
    requirementsMerged.snapshot.nodes.filter(
      ({ kind, state }) => kind === "business-scope" && state === "active",
    ).length,
    request.coverage.businessScopes,
  );
  const prepared = await graph.prepare({
    ...context,
    baseGraph: graph.captureBase(),
  });
  const merged = await graph.mergePrepared(prepared);
  const mergedReplay = await graph.mergePrepared(prepared);
  assert.deepEqual(mergedReplay.receipt, merged.receipt);
  assert.deepEqual(mergedReplay.snapshot, merged.snapshot);
  assert.equal(merged.snapshot.horizon, "acceptance");
  const diagnostics = diagnoseTraceabilityGraph(merged.snapshot);
  const blockingDiagnostics = diagnostics.filter(
    ({ blocking }) => blocking === true,
  );
  assert.deepEqual(blockingDiagnostics, []);

  const replayProof = seal(
    {
      apiVersion: API,
      kind: "BusinessAcceptanceReplayProof",
      proofId: "BA-REPLAY-PROOF-CONTROLLED-WINDOWS-SOURCE-001",
      request: ref(request.requestId, sha256Digest(requestFile.bytes)),
      requestDigest: request.requestDigest,
      candidate: request.candidate,
      candidateRawDigest: request.candidateRawDigest,
      checkpointDigest: gate.checkpointDigest,
      firstExecution: { gateCalls: gate.gateCalls, replayed: gate.replayed },
      replayExecution: {
        gateCalls: gateReplay.gateCalls,
        replayed: gateReplay.replayed,
      },
      ownerCalls,
      record: ref(gate.record.recordId, gate.record.recordDigest),
      outcome: gate.record.outcome,
    },
    "proofDigest",
  );

  const diagnosticsRecord = seal(
    {
      apiVersion: API,
      kind: "BusinessAcceptanceTraceabilityDiagnostics",
      diagnosticsId: "BA-TRACE-DIAGNOSTICS-CONTROLLED-WINDOWS-SOURCE-001",
      graph: merged.snapshotRef,
      total: diagnostics.length,
      blocking: blockingDiagnostics.length,
      diagnostics,
      outcome: "pass",
    },
    "diagnosticsDigest",
  );

  const finalProof = seal(
    {
      apiVersion: API,
      kind: "ControlledSourceReleaseAcceptanceProof",
      proofId: "DEVRELAY-CONTROLLED-SOURCE-RELEASE-ACCEPTANCE-001",
      targetCommit: request.targetCommit,
      approvalRequest: ref(request.requestId, sha256Digest(requestFile.bytes)),
      approvalRequestDigest: request.requestDigest,
      ownerApproval: ref(
        gate.approval.approvalId,
        gate.approval.approvalDigest,
      ),
      businessAcceptanceRecord: ref(
        gate.record.recordId,
        gate.record.recordDigest,
      ),
      gateCheckpointDigest: gate.checkpointDigest,
      gateReplay: {
        ownerCalls,
        replayGateCalls: gateReplay.gateCalls,
        replayed: gateReplay.replayed,
      },
      traceability: {
        requirementsBaselineUpdate: requirementsPrepared.updateRef,
        requirementsBaselineMergeReceipt: requirementsMerged.receiptRef,
        update: prepared.updateRef,
        mergeReceipt: merged.receiptRef,
        resultGraph: merged.snapshotRef,
        replayDisposition: mergedReplay.disposition,
        blockingDiagnostics: blockingDiagnostics.length,
      },
      coverage: request.coverage,
      exclusions: request.exclusions,
      releaseDisposition: "controlled-source-library-accepted",
      externalPromotionCheck: {
        workflow: "verify-source-release",
        requiredMatrix: [
          "Node 20 / Windows",
          "Node 22 / Windows",
          "Node 20 / Ubuntu",
          "Node 22 / Ubuntu",
        ],
        authority: "github-actions-check-suite-on-final-commit",
      },
    },
    "proofDigest",
  );

  await Promise.all([
    persist("25-business-acceptance-owner-approval.json", gate.approval),
    persist("26-business-acceptance-gate-checkpoint.json", checkpoint),
    persist("27-business-acceptance-record.json", gate.record),
    persist("28-business-acceptance-replay-proof.json", replayProof),
    persist(
      "29-requirements-baseline-observer-update.json",
      requirementsPrepared.update,
    ),
    persist(
      "30-requirements-baseline-observer-merge-receipt.json",
      requirementsMerged.receipt,
    ),
    persist("31-business-acceptance-traceability-update.json", prepared.update),
    persist("32-business-acceptance-merge-receipt.json", merged.receipt),
    persist("33-business-acceptance-graph.json", merged.snapshot),
    persist(
      "34-business-acceptance-traceability-diagnostics.json",
      diagnosticsRecord,
    ),
    persist("35-controlled-source-release-acceptance-proof.json", finalProof),
  ]);

  console.log(
    JSON.stringify(
      {
        request: { id: request.requestId, digest: request.requestDigest },
        candidate: request.candidate,
        ownerApproval: ref(
          gate.approval.approvalId,
          gate.approval.approvalDigest,
        ),
        record: ref(gate.record.recordId, gate.record.recordDigest),
        checkpointDigest: gate.checkpointDigest,
        replay: {
          ownerCalls,
          gateCalls: gateReplay.gateCalls,
          replayed: gateReplay.replayed,
        },
        traceability: {
          update: prepared.updateRef,
          receipt: merged.receiptRef,
          graph: merged.snapshotRef,
          blockingDiagnostics: blockingDiagnostics.length,
        },
        finalProof: ref(finalProof.proofId, finalProof.proofDigest),
      },
      null,
      2,
    ),
  );
}

await main();
