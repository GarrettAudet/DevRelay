import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const taskDir = resolve(root, "dogfood/lifecycle-run-report/execution/task-contracts");
const attemptDir = resolve(taskDir, "attempts");
mkdirSync(attemptDir, { recursive:true });
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const definitions = {
  "WI-RUN-CONTENT-POLICY": {
    task1:"sha256:4a655c0f30485de4fe534b2b7d273952d8ef88efc0b8e0cd911d60e22ac3e49c",
    worker:"C:/Users/garre/.codex/worktrees/cc70/DevRelay-v04-work-dependency-analysis",
    tests:6,
    finding:{ code:"RUN_CONTENT_POLICY_SOURCE_PASSTHROUGH", requirementRefs:["AC-DEV-RUN-SECURITY-001"], architectureRefs:["EL-RUN-CONTENT-POLICY","IF-RUN-CONTENT-POLICY"], detail:"Policy evaluation copies field.source into safe renderer output without validating or classifying it, allowing arbitrary secret-bearing or undeclared bytes to bypass the value disposition." },
    corrections:[
      "Preserve the exact version-pinned policy binding, deterministic ordering, and allow/omit/redact behavior.",
      "Do not copy arbitrary source metadata into safe output. Admit only a closed exact provenance reference shape, or omit source metadata entirely.",
      "Reject secret-bearing, unknown-field, malformed-digest, and substituted provenance; add focused negative fixtures proving no source metadata can bypass content policy.",
    ],
  },
  "WI-RUN-LEDGER": {
    task1:"sha256:b147cf350127fd026954c604206080a3927574fb12a2599aa6e5c963b267f7f0",
    worker:"C:/Users/garre/.codex/worktrees/a0f4/DevRelay-v04-work-dependency-analysis",
    tests:5,
    finding:{ code:"RUN_LEDGER_APPEND_LINEAGE_MISSING", requirementRefs:["AC-DEV-RUN-DYNAMIC-001","AC-DEV-RUN-TRACE-JOIN-001"], architectureRefs:["CON-RUN-LEDGER-IMMUTABILITY","EL-RUN-LEDGER","IF-RUN-WORKFLOW-FACTS"], detail:"Each checkpoint is built from an unconstrained fact set with no predecessor or cumulative-lineage enforcement, so a later append can omit earlier facts and still validate despite the approved append-only exact RunLedger lineage." },
    corrections:[
      "Preserve canonical fact validation, content-addressed raw records, duplicate rejection, replay suppression, and non-authority.",
      "Make every non-genesis append bind the exact predecessor checkpoint and derive cumulative records without omission, mutation, reordering, or divergent duplicate identities.",
      "Expose and verify an exact current checkpoint lineage suitable for deterministic snapshot projection; add negative fixtures for omitted history, wrong predecessor, fork/substitution, and mutated prior bytes.",
    ],
  },
};

for (const [workItemId, definition] of Object.entries(definitions)) {
  const handoffName = `${workItemId}.attempt-001.handoff.raw.json`;
  const handoffPath = resolve(attemptDir, handoffName);
  const handoffDigest = sha256(readFileSync(handoffPath));
  const task1Path = resolve(taskDir, `${workItemId}.attempt-001.task.json`);
  const task1 = readJson(task1Path);
  const outputDigests = Object.fromEntries(task1.authority.allowedWritePaths.map((path) => [path, sha256(readFileSync(resolve(definition.worker, path)))]));
  const review = {
    apiVersion:"devrelay.dev/v1alpha1", kind:"BootstrapWorkItemVerificationReview",
    reviewId:`WIV-${workItemId}-ATTEMPT-001`, executionId:task1.executionId, workItemId,
    taskContract:{ artifactId:task1.contractId, digest:definition.task1 },
    rawHandoff:{ artifactId:handoffName, digest:handoffDigest },
    changedFiles:task1.authority.allowedWritePaths,
    focusedVerification:{ command:task1.verification.commands[0], hostSupply:"declared-node-loader", exitCode:0, tests:definition.tests },
    outcome:"fix", findings:[definition.finding], outputDigests,
    progressionAllowed:false, nextRoute:"fix",
  };
  const reviewPath = resolve(attemptDir, `${workItemId}.attempt-001.wiv.json`);
  writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  const executionId = `WE-RUN-DOGFOOD-${workItemId}-ATTEMPT-002`;
  const task2 = {
    ...task1,
    contractId:`WETC-${workItemId}-002`, executionId, attempt:2,
    contextPaths:[...task1.contextPaths, `dogfood/lifecycle-run-report/execution/task-contracts/attempts/${handoffName}`, `dogfood/lifecycle-run-report/execution/task-contracts/attempts/${workItemId}.attempt-001.wiv.json`],
    handoff:{ ...task1.handoff, requiredShape:{ ...task1.handoff.requiredShape, executionId } },
    requiredCorrections:definition.corrections,
    revisionLineage:{ route:"fix", predecessorTaskContract:{ artifactId:task1.contractId, digest:definition.task1 }, predecessorHandoff:{ artifactId:handoffName, digest:handoffDigest }, verificationReview:{ artifactId:`${workItemId}.attempt-001.wiv.json`, digest:sha256(readFileSync(reviewPath)) } },
  };
  const task2Path = resolve(taskDir, `${workItemId}.attempt-002.task.json`);
  writeFileSync(task2Path, `${JSON.stringify(task2, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ workItemId, handoffDigest, reviewDigest:sha256(readFileSync(reviewPath)), task2Digest:sha256(readFileSync(task2Path)) }));
}
