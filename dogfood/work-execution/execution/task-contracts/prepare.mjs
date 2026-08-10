import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  canonicalJson,
  canonicalJsonDigest,
} from "../../../../src/content-digest.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
const ref = (value, artifactId, relativePath) => ({
  artifactId,
  digest: canonicalJsonDigest(value),
  relativePath,
});

const workBreakdown = read(
  "dogfood/work-execution/work-breakdown/work-breakdown-baseline.json",
);
const workDependency = read("project/work-dependency-baseline.json");
const assignmentBaseline = read("project/specialist-assignment-baseline.json");
const requirements = read("project/requirements-baseline.json");
const projectOverview = read("project/project-overview-baseline.json");
const architecture = read("project/architecture-baseline.json");
const contractBaseline = read("project/contract-baseline.json");
const repository = read("dogfood/work-execution/repository-snapshot.json");

const workItem = workBreakdown.workItems.find(
  ({ id }) => id === "WI-WE-CONTRACTS",
);
const assignment = assignmentBaseline.assignments.find(
  ({ workItemRef }) => workItemRef === workItem.id,
);
if (!workItem || !assignment) {
  throw new Error("approved ready work item or assignment is unavailable");
}
const incomingEdges = workDependency.edges.filter(
  ({ dependentId }) => dependentId === workItem.id,
);
const completedWorkItemIds = [];
const readyWorkItemIds = workDependency.nodes
  .filter(
    (id) =>
      !completedWorkItemIds.includes(id) &&
      workDependency.edges
        .filter(({ dependentId }) => dependentId === id)
        .every(({ prerequisiteId }) =>
          completedWorkItemIds.includes(prerequisiteId),
        ),
  )
  .sort();
if (
  incomingEdges.length !== 0 ||
  readyWorkItemIds.length !== 1 ||
  readyWorkItemIds[0] !== workItem.id
) {
  throw new Error("approved DAG does not expose the expected initial frontier");
}

const upstream = {
  workBreakdownBaseline: ref(
    workBreakdown,
    workBreakdown.baselineId,
    "dogfood/work-execution/work-breakdown/work-breakdown-baseline.json",
  ),
  workDependencyBaseline: ref(
    workDependency,
    workDependency.baselineId,
    "project/work-dependency-baseline.json",
  ),
  specialistAssignmentBaseline: ref(
    assignmentBaseline,
    assignmentBaseline.baselineId,
    "project/specialist-assignment-baseline.json",
  ),
  requirementsBaseline: ref(
    requirements,
    requirements.baselineId,
    "project/requirements-baseline.json",
  ),
  projectOverviewBaseline: ref(
    projectOverview,
    projectOverview.baselineId,
    "project/project-overview-baseline.json",
  ),
  architectureBaseline: ref(
    architecture,
    architecture.baselineId,
    "project/architecture-baseline.json",
  ),
  contractBaseline: ref(
    contractBaseline,
    contractBaseline.baselineId,
    "project/contract-baseline.json",
  ),
  repositorySnapshot: ref(
    repository,
    `repository-snapshot-devrelay-${repository.revision.slice(0, 7)}`,
    "dogfood/work-execution/repository-snapshot.json",
  ),
};

const readinessMaterial = {
  workItemId: workItem.id,
  dependencyBaseline: upstream.workDependencyBaseline,
  completedWorkItemIds,
  incomingEdges,
  readyWorkItemIds,
};
const task = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "BootstrapWorkExecutionTaskContract",
  contractId: "WETC-WI-WE-CONTRACTS-001",
  executionId: "WE-BOOTSTRAP-FRONTIER-001-WI-WE-CONTRACTS",
  status: "prepared",
  bootstrapDisposition: {
    reason:
      "WorkExecution is the module being built; the external Codex task host temporarily performs the declared executor-port role.",
    authority:
      "The task may propose only this work item's code change and evidence. This integration-owner task retains readiness, verification, graph, and integration authority.",
  },
  workItem,
  assignment,
  upstream,
  readinessProof: {
    ...readinessMaterial,
    readinessDigest: canonicalJsonDigest(readinessMaterial),
  },
  contextPaths: [
    "AGENTS.md",
    "README.md",
    "ProjectOverview.md",
    "contracts/module-definition.schema.json",
    "contracts/module-invocation.schema.json",
    "contracts/module-result.schema.json",
    "contracts/contract-generation-artifacts.schema.json",
    "contracts/specialist-assignment-artifacts.schema.json",
    "examples/modules/specialist-assignment.module.json",
    "src/artifact-runtime.mjs",
    "src/specialist-assignment-artifact-validator.mjs",
    "test/specialist-assignment-runtime.test.mjs",
    "dogfood/work-execution/architecture-design/architecture-baseline.json",
    "dogfood/work-execution/contract-generation/contract-baseline.json",
  ],
  authority: {
    allowedReadPaths: ["**"],
    allowedWritePaths: [
      "contracts/work-execution-artifacts.schema.json",
      "examples/modules/work-execution.module.json",
      "test/work-execution-artifact-validator.test.mjs",
      "src/work-execution-artifact-validator.mjs",
    ],
    forbiddenActions: [
      "Do not implement readiness calculation, binding, checkpointing, adapters, result assembly, verification, integration, or graph mutation.",
      "Do not edit project baselines, dogfood evidence, release manifests, unrelated modules, or package exports.",
      "Do not create commits, branches, tags, or pull requests.",
    ],
  },
  verification: {
    commands: [
      "node --check src/work-execution-artifact-validator.mjs",
      "node --test test/work-execution-artifact-validator.test.mjs",
    ],
    requiredEvidence: workItem["required-evidence"],
    acceptance:
      workItem["verification-plan"].checks[0].successCriteria,
  },
  handoff: {
    requiredShape: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "BootstrapWorkItemHandoff",
      executionId: "WE-BOOTSTRAP-FRONTIER-001-WI-WE-CONTRACTS",
      workItemId: "WI-WE-CONTRACTS",
      outcome: "pass | fix | clarify | block",
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
          kind: "work-execution/contract-tests",
          relativePath: "relative/path",
          digest: "sha256:<64 lowercase hex>",
        },
      ],
      residualRisks: ["none or bounded risk"],
      notes: "concise implementation summary",
    },
    integrationAuthority: false,
  },
  stopConditions: [
    "Stop with clarify if the approved artifacts conflict or a public contract decision is missing.",
    "Stop with block if exact context cannot be read or required verification cannot run.",
    "Stop after producing the bounded handoff; do not begin dependent work items.",
  ],
};
task.contentDigest = canonicalJsonDigest(task);

mkdirSync(OUTPUT, { recursive: true });
writeFileSync(
  new URL("WI-WE-CONTRACTS.task.json", OUTPUT),
  canonicalJson(task) + "\n",
);

const prompt = `# WorkExecution bootstrap task: WI-WE-CONTRACTS

Execute only the exact task contract at:

\`dogfood/work-execution/execution/task-contracts/WI-WE-CONTRACTS.task.json\`

Repository: \`C:\\\\tmp\\\\DevRelay-v04-work-dependency-analysis\`
Branch/worktree: \`codex/v0.5-lifecycle-run-report\`

Read \`AGENTS.md\` first, then verify the task contract's
\`contentDigest\` by recomputing the digest with the repository's
\`canonicalJsonDigest\` after omitting that field. Read every declared
context path before editing.

Implement only \`WI-WE-CONTRACTS\` within its allowed write paths. Preserve
all unrelated dirty-worktree changes. Do not run downstream work, mutate project
baselines, alter the DAG, perform integration, or claim verification authority.

Return the exact \`BootstrapWorkItemHandoff\` shape declared by the task
contract. Include precise changed files, command exit codes, evidence paths and
digests, residual risks, and one of the closed outcomes. The parent task is the
integration owner.
`;
writeFileSync(new URL("WI-WE-CONTRACTS.prompt.md", OUTPUT), prompt);
console.log(
  JSON.stringify(
    {
      contractId: task.contractId,
      contentDigest: task.contentDigest,
      readyWorkItemIds,
      assignedProfile: assignment.specialistProfileRef,
    },
    null,
    2,
  ),
);
