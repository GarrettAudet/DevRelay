import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../../../../", import.meta.url).pathname.slice(1));
const taskDirectory = resolve(root, "dogfood/lifecycle-run-report/execution/task-contracts");
const attemptDirectory = resolve(taskDirectory, "attempts");
const verificationDirectory = resolve(root, "dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001");
mkdirSync(attemptDirectory, { recursive:true });
const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rawRef = (artifactId, path) => ({ artifactId, digest:sha256(readFileSync(path)) });
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const writeImmutable = (path, bytes) => {
  try {
    const existing = readFileSync(path);
    if (!existing.equals(bytes)) throw new Error(`immutable artifact already differs: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    writeFileSync(path, bytes);
  }
};

const task1Path = resolve(taskDirectory, "WI-RUN-MARKDOWN.attempt-001.task.json");
const handoffPath = resolve(attemptDirectory, "WI-RUN-MARKDOWN.attempt-001.handoff.raw.json");
const candidatePath = resolve(verificationDirectory, "gate-candidate.json");
const evidencePath = resolve(verificationDirectory, "normalized-evidence.json");
const rejectionPath = resolve(verificationDirectory, "gate-rejection.json");
const checkpointPath = resolve(verificationDirectory, "checkpoint.json");
const adversarialPath = resolve(verificationDirectory, "adversarial-verifier.test.mjs");
const task1 = readJson(task1Path);
const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath);
const rejection = readJson(rejectionPath);
const checkpoint = readJson(checkpointPath);
const fixConditions = [
  "Render byte-identical UTF-8/NFC/LF Markdown for semantically equivalent snapshots whose reorder-insensitive collections are supplied in different orders, while retaining exact digest-bound report access.",
  "Render an exact digest-bound artifact link for every policy-allowed stage sourceFacts reference; omitted or redacted source facts must not leak identifiers or digests.",
  "Apply the exact bound LifecycleRunContentPolicy to every top-level and source link, including /ledger, /traceabilityGraph, snapshot and evidence links, before any identifier, digest, or link bytes enter Markdown."
];
const boundAttempt1 = {
  taskContract:{ ...rawRef(task1.contractId,task1Path) },
  rawHandoff:rawRef("WI-RUN-MARKDOWN.attempt-001.handoff.raw.json",handoffPath),
  candidate:{ ...rawRef(candidate.candidateId,candidatePath), semanticDigest:candidate.candidateDigest },
  evidence:{ ...rawRef(evidence.normalizedEvidenceId,evidencePath), semanticDigest:evidence.evidenceDigest },
  gateRejection:{ ...rawRef("WIVGR-WI-RUN-MARKDOWN-001",rejectionPath), semanticDigest:rejection.rejectionDigest },
  checkpoint:{ ...rawRef(checkpoint.checkpointId??"WIVCP-WI-RUN-MARKDOWN-001",checkpointPath), semanticDigest:checkpoint.checkpointDigest },
  externalVerificationContext:rawRef("WI-RUN-MARKDOWN.attempt-001.adversarial-verifier.test.mjs",adversarialPath)
};
const revisionRequest = {
  apiVersion:"devrelay.dev/v1alpha1",
  kind:"BootstrapWorkItemRevisionRequest",
  requestId:"WIRR-WI-RUN-MARKDOWN-002",
  workItemId:"WI-RUN-MARKDOWN",
  predecessorExecutionId:task1.executionId,
  requestedExecutionId:"WE-RUN-DOGFOOD-WI-RUN-MARKDOWN-ATTEMPT-002",
  route:"fix",
  attempt:2,
  bindings:boundAttempt1,
  fixConditions,
  workerAuthority:{ allowedWritePaths:task1.authority.allowedWritePaths, forbiddenActions:task1.authority.forbiddenActions },
  externalVerification:{ required:true, workerWritable:false, artifact:boundAttempt1.externalVerificationContext },
  progressionAllowed:false,
  authority:"trusted-core-host"
};
const revisionPath = resolve(attemptDirectory,"WI-RUN-MARKDOWN.attempt-002.revision-request.json");
const revisionBytes = Buffer.from(`${JSON.stringify(revisionRequest,null,2)}\n`,"utf8");
writeImmutable(revisionPath,revisionBytes);
const revisionRef = rawRef(revisionRequest.requestId,revisionPath);

const executionId = revisionRequest.requestedExecutionId;
const externalPath = "dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/adversarial-verifier.test.mjs";
const task2 = {
  ...task1,
  contractId:"WETC-WI-RUN-MARKDOWN-002",
  executionId,
  attempt:2,
  contextPaths:[...task1.contextPaths,"dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-MARKDOWN.attempt-001.handoff.raw.json","dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/gate-candidate.json","dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/normalized-evidence.json","dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/gate-rejection.json","dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/checkpoint.json","dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-MARKDOWN.attempt-002.revision-request.json",externalPath],
  handoff:{...task1.handoff,requiredShape:{...task1.handoff.requiredShape,executionId}},
  requiredCorrections:fixConditions,
  externalVerification:{required:true,workerWritable:false,artifact:boundAttempt1.externalVerificationContext,path:externalPath},
  revisionLineage:{route:"fix",classification:"work-item-verification-rejection",revisionRequest:revisionRef,...boundAttempt1}
};
const task2Path = resolve(taskDirectory,"WI-RUN-MARKDOWN.attempt-002.task.json");
const task2Bytes = Buffer.from(`${JSON.stringify(task2,null,2)}\n`,"utf8");
writeImmutable(task2Path,task2Bytes);
console.log(JSON.stringify({revisionRequest:{path:revisionPath,digest:sha256(revisionBytes)},taskContract:{path:task2Path,digest:sha256(task2Bytes)}},null,2));
