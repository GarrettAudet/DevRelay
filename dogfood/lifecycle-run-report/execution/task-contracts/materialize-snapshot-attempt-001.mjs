import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const repository = new URL("../../../../", import.meta.url);
const directory = new URL("./", import.meta.url);
const targetUrl = new URL("WI-RUN-SNAPSHOT.attempt-001.task.json", directory);

const readJson = (path) => JSON.parse(readFileSync(new URL(path, repository), "utf8"));
const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const workBreakdown = readJson(
  "dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json",
);
const assignmentBaseline = readJson(
  "dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json",
);
const workItem = workBreakdown.workItems.find(({ id }) => id === "WI-RUN-SNAPSHOT");
const assignment = assignmentBaseline.assignments.find(
  ({ workItemRef }) => workItemRef === "WI-RUN-SNAPSHOT",
);

if (!workItem || !assignment) {
  throw new Error("Approved Snapshot work item or assignment is missing.");
}

const completionDirectory = new URL(
  "dogfood/lifecycle-run-report/execution/integrated-completion-facts/",
  repository,
);
const completionFacts = readdirSync(completionDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => readJson(`dogfood/lifecycle-run-report/execution/integrated-completion-facts/${entry.name}`))
  .filter((fact) =>
    [
      "WI-RUN-CONTRACTS",
      "WI-RUN-CONTENT-POLICY",
      "WI-RUN-LEDGER",
      "WI-RUN-OBSERVATIONS",
      "WI-RUN-FRONTIER",
    ].includes(fact.workItem.artifactId),
  )
  .sort((left, right) => left.workItem.artifactId.localeCompare(right.workItem.artifactId))
  .map((fact) => ({
    artifactId: fact.completionId,
    digest: fact.completionDigest,
  }));

if (completionFacts.length !== 5) {
  throw new Error(`Snapshot requires five exact integrated completion facts; found ${completionFacts.length}.`);
}

const frontierTask = readJson(
  "dogfood/lifecycle-run-report/execution/task-contracts/WI-RUN-FRONTIER.attempt-001.task.json",
);

const task = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "BootstrapWorkExecutionTaskContract",
  contractId: "WETC-WI-RUN-SNAPSHOT-001",
  executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-001",
  workItemId: "WI-RUN-SNAPSHOT",
  attempt: 1,
  status: "prepared",
  readyFrontier: {
    frontierId: "RUN-FRONTIER-004",
    completionFacts,
  },
  assignment,
  authority: {
    allowedWritePaths: [
      "src/lifecycle-run-report-snapshot.mjs",
      "test/lifecycle-run-report-snapshot.test.mjs",
    ],
    forbiddenActions: [
      "Do not change any file outside allowedWritePaths.",
      "Do not change src/index.mjs.",
      "Do not mutate TraceabilityGraph, RunLedger, the approved dependency DAG, or workflow state.",
      "Do not hard-code DevRelay lifecycle module IDs or assume a fixed module count.",
      "Do not commit, integrate, mutate traceability, or claim verification or progression authority.",
    ],
  },
  contextPaths: [
    "ProjectOverview.md",
    "project/requirements-baseline.json",
    "project/architecture-baseline.json",
    "project/contract-baseline.json",
    "dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json",
    "dogfood/lifecycle-run-report/dependency-analysis/work-dependency-baseline.json",
    "dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json",
    "dogfood/lifecycle-run-report/execution/integrated-completion-facts/WI-RUN-FRONTIER.json",
    "contracts/lifecycle-run-report-artifacts.schema.json",
    "src/lifecycle-run-report-artifact-validator.mjs",
    "src/lifecycle-run-report-ledger.mjs",
    "src/lifecycle-run-report-observations.mjs",
    "src/lifecycle-run-report-frontier.mjs",
    "src/traceability-graph.mjs",
    "test/lifecycle-run-report-ledger.test.mjs",
    "test/lifecycle-run-report-observations.test.mjs",
    "test/lifecycle-run-report-frontier.test.mjs",
  ],
  verification: {
    acceptance:
      "Equivalent exact run state always produces one byte-identical snapshot with complete source links and no hard-coded product modules.",
    commands: ["node --test test/lifecycle-run-report-snapshot.test.mjs"],
    requiredEvidence: workItem["required-evidence"],
  },
  stopConditions: [
    "Stop with clarify only if approved artifacts leave a material projection, privacy, or authority decision unresolved.",
    "Stop with fix if the focused suite fails or implementation cannot stay within allowedWritePaths.",
    "Stop after the exact handoff; Core owns verification, integration, traceability, and progression.",
  ],
  hostRuntimeSupply: frontierTask.hostRuntimeSupply,
  handoff: {
    integrationAuthority: false,
    requiredShape: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "BootstrapWorkItemHandoff",
      executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-001",
      workItemId: "WI-RUN-SNAPSHOT",
      outcome: "pass | fix | diagnose | clarify | block",
      changedFiles: ["relative/path"],
      verification: [
        {
          command: "exact command",
          exitCode: 0,
          summary: "bounded result",
        },
      ],
      evidence: [
        {
          kind: "lifecycle-run-report/snapshot-tests",
          relativePath: "relative/path",
          digest: "sha256:<64 lowercase hex>",
        },
      ],
      notes: "concise implementation handoff",
      residualRisks: ["none or bounded risk"],
    },
  },
  workItem,
};

writeFileSync(targetUrl, `${JSON.stringify(task, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    target: targetUrl.pathname,
    digest: sha256(readFileSync(targetUrl)),
    readyFrontier: task.readyFrontier,
  }),
);
