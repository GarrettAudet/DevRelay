import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  canonicalJson,
  canonicalJsonDigest,
} from "../../../../src/content-digest.mjs";
import { validateWorkExecutionArtifact } from "../../../../src/work-execution-artifact-validator.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const EXECUTION_ROOT = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
const digestBytes = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const ref = (value, artifactId, relativePath) => ({
  artifactId,
  digest: canonicalJsonDigest(value),
  uri: new URL(relativePath, ROOT).href,
});
const bodySeal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const listSeal = (value, field, materialField) => ({
  ...value,
  [field]: canonicalJsonDigest(value[materialField]),
});
const selfSeal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(value),
});
const writeJson = (url, value) =>
  writeFileSync(url, `${canonicalJson(value)}\n`);

const workBreakdown = read("project/work-breakdown-baseline.json");
const workDependency = read("project/work-dependency-baseline.json");
const assignmentBaseline = read("project/specialist-assignment-baseline.json");
const requirements = read("project/requirements-baseline.json");
const projectOverview = read("project/project-overview-baseline.json");
const architecture = read("project/architecture-baseline.json");
const contractBaseline = read("project/contract-baseline.json");

const workItem = workBreakdown.workItems.find(
  ({ id }) => id === "WI-DESKTOP-CONTRACTS",
);
const assignment = assignmentBaseline.assignments.find(
  ({ workItemRef }) => workItemRef === workItem?.id,
);
if (!workItem || !assignment) {
  throw new Error("approved Desktop work item or assignment is unavailable");
}

const completionFacts = listSeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "IntegratedCompletionFactSet",
    facts: [],
  },
  "factsDigest",
  "facts",
);
const completedWorkItemIds = completionFacts.facts.map(({ workItemId }) => workItemId);
const readyWorkItemIds = workDependency.nodes
  .filter(
    (id) =>
      !completedWorkItemIds.includes(id) &&
      workDependency.edges
        .filter(({ dependentId }) => dependentId === id)
        .every(({ prerequisiteId }) => completedWorkItemIds.includes(prerequisiteId)),
  )
  .sort();
if (readyWorkItemIds.length !== 1 || readyWorkItemIds[0] !== workItem.id) {
  throw new Error(
    `Core-derived initial frontier is not WI-DESKTOP-CONTRACTS: ${readyWorkItemIds.join(",")}`,
  );
}

const currentRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: new URL(".", ROOT),
  encoding: "utf8",
}).trim();
const treeBytes = execFileSync(
  "git",
  ["ls-tree", "-r", "--full-tree", currentRevision],
  { cwd: new URL(".", ROOT) },
);
const repositorySnapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: "https://github.com/GarrettAudet/DevRelay.git",
  revision: currentRevision,
  treeDigest: digestBytes(treeBytes),
  includedPaths: [
    "AGENTS.md",
    "ProjectOverview.md",
    "contracts/**",
    "dogfood/chatgpt-desktop-runtime/**",
    "examples/**",
    "project/**",
    "src/**",
    "test/**",
    "package.json",
  ],
  excludedPaths: [".git/**", "node_modules/**"],
};

const workBreakdownRef = ref(
  workBreakdown,
  workBreakdown.baselineId,
  "project/work-breakdown-baseline.json",
);
const workDependencyRef = ref(
  workDependency,
  workDependency.baselineId,
  "project/work-dependency-baseline.json",
);
const assignmentRef = ref(
  assignmentBaseline,
  assignmentBaseline.baselineId,
  "project/specialist-assignment-baseline.json",
);
const overviewRef = ref(
  projectOverview,
  projectOverview.baselineId,
  "project/project-overview-baseline.json",
);
const repositoryRef = ref(
  repositorySnapshot,
  `repository-snapshot-devrelay-${currentRevision.slice(0, 12)}`,
  "dogfood/chatgpt-desktop-runtime/execution/repository-snapshot.json",
);

const frontier = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RunnableFrontierProof",
    workItemId: workItem.id,
    workBreakdownBaseline: workBreakdownRef,
    workDependencyBaseline: workDependencyRef,
    dependencyGraphDigest: workDependency.graphDigest,
    prerequisiteCompletionFacts: [],
  },
  "readinessDigest",
);
const policy = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionPolicy",
    policyId: "desktop-local-codex-worktree-v1",
    version: "1.0.0",
    timeoutMilliseconds: 7_200_000,
    allowedPermissions: [
      { kind: "filesystem.read", scope: { values: ["**"] } },
      {
        kind: "filesystem.write",
        scope: {
          values: [
            "contracts/chatgpt-desktop-runtime-artifacts.schema.json",
            "src/chatgpt-desktop-runtime-artifact-validator.mjs",
            "src/index.mjs",
            "test/chatgpt-desktop-runtime-contracts.test.mjs",
            "package.json",
          ],
        },
      },
      { kind: "process.spawn", scope: { values: ["node", "npm.cmd"] } },
    ],
    outputPolicy: {
      maxEvidenceBytes: 2_000_000,
      maxNativeArtifactBytes: 2_000_000,
    },
  },
  "policyDigest",
);
const executor = { id: "executor.codex-desktop-task", version: "1.0.0" };
const executionConfiguration = {
  transport: "codex-app-server",
  taskIsolation: "worktree",
  resultContract: "BootstrapWorkItemHandoff",
};
const binding = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionBinding",
    bindingId: "BIND-DESKTOP-CONTRACTS-001",
    workItemId: workItem.id,
    specialistProfileId: assignment.specialistProfileRef,
    assignmentBaseline: assignmentRef,
    executor,
    requiredCapabilities: assignment.capabilityCoverage,
    requiredTools: assignment.requiredTools,
    permissionDemands: policy.allowedPermissions,
    executionPolicy: ref(
      policy,
      policy.policyId,
      "dogfood/chatgpt-desktop-runtime/execution/execution-policy.json",
    ),
    configurationDigest: canonicalJsonDigest(executionConfiguration),
  },
  "bindingDigest",
);

const attemptId = "ATT-DESKTOP-CONTRACTS-001";
const authoritativeInputs = [
  { name: "work-breakdown-baseline", artifact: workBreakdownRef },
  { name: "work-dependency-baseline", artifact: workDependencyRef },
  { name: "specialist-assignment-baseline", artifact: assignmentRef },
  {
    name: "requirements-baseline",
    artifact: ref(requirements, requirements.baselineId, "project/requirements-baseline.json"),
  },
  {
    name: "architecture-baseline",
    artifact: ref(architecture, architecture.baselineId, "project/architecture-baseline.json"),
  },
  {
    name: "contract-baseline",
    artifact: ref(contractBaseline, contractBaseline.baselineId, "project/contract-baseline.json"),
  },
];
const invocation = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutorInvocation",
    attemptId,
    workItem,
    authoritativeInputs,
    readinessProof: ref(
      frontier,
      "frontier-desktop-contracts-001",
      "dogfood/chatgpt-desktop-runtime/execution/runnable-frontier-proof.json",
    ),
    executionBinding: ref(
      binding,
      binding.bindingId,
      "dogfood/chatgpt-desktop-runtime/execution/execution-binding.json",
    ),
    executionPolicy: binding.executionPolicy,
    projectOverviewBaseline: overviewRef,
    repositorySnapshot: repositoryRef,
    workspaceBaseDigest: repositorySnapshot.treeDigest,
  },
  "invocationFingerprint",
);

for (const artifact of [completionFacts, frontier, policy, binding, invocation]) {
  validateWorkExecutionArtifact(artifact);
}

const task = selfSeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "BootstrapWorkExecutionTaskContract",
    contractId: "WETC-WI-DESKTOP-CONTRACTS-001",
    executionId: attemptId,
    status: "prepared",
    workItem,
    assignment,
    artifacts: { completionFacts, frontier, policy, binding, invocation },
    contextPaths: [
      "AGENTS.md",
      "README.md",
      "ProjectOverview.md",
      "project/requirements-baseline.json",
      "project/project-overview-baseline.json",
      "project/architecture-baseline.json",
      "project/contract-baseline.json",
      "project/work-breakdown-baseline.json",
      "project/work-dependency-baseline.json",
      "project/specialist-assignment-baseline.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-capability-resolution.schema.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-installation.schema.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-mcp-commands.schema.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-run-state.schema.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-run-view.schema.json",
      "dogfood/chatgpt-desktop-runtime/contract-generation/native/ct-if-desktop-task-lifecycle.schema.json",
      "contracts/work-execution-artifacts.schema.json",
      "src/work-execution-artifact-validator.mjs",
      "src/index.mjs",
    ],
    authority: {
      allowedReadPaths: ["**"],
      allowedWritePaths: policy.allowedPermissions.find(
        ({ kind }) => kind === "filesystem.write",
      ).scope.values,
      forbiddenActions: [
        "Do not start Codex tasks, route modules, approve gates, mutate project baselines, or integrate the proposed change.",
        "Do not edit Desktop plug-in, MCP bridge, run store, task supervisor, installation, documentation, or release evidence.",
        "Do not change approved native contract semantics; implement and validate their exact closed public surface.",
        "Do not create commits, branches, tags, or pull requests.",
      ],
    },
    verification: {
      commands: [
        "node --check src/chatgpt-desktop-runtime-artifact-validator.mjs",
        "node --test test/chatgpt-desktop-runtime-contracts.test.mjs",
      ],
      requiredEvidence: workItem["required-evidence"],
      acceptance: workItem["verification-plan"].checks[0].successCriteria,
    },
    handoff: {
      requiredShape: {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "BootstrapWorkItemHandoff",
        executionId: attemptId,
        workItemId: workItem.id,
        outcome: "pass | fix | clarify | block",
        changedFiles: ["relative/path"],
        verification: [
          { command: "exact command", exitCode: 0, summary: "bounded result" },
        ],
        evidence: [
          {
            kind: "chatgpt-desktop/contracts-conformance",
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
      "Stop with clarify if approved artifacts conflict or a public contract decision is missing.",
      "Stop with block if exact context cannot be read or required verification cannot run.",
      "Stop after the bounded handoff; do not begin dependent work items.",
    ],
  },
  "contentDigest",
);

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(EXECUTION_ROOT, { recursive: true });
writeJson(new URL("integrated-completion-facts.json", EXECUTION_ROOT), completionFacts);
writeJson(new URL("runnable-frontier-proof.json", EXECUTION_ROOT), frontier);
writeJson(new URL("execution-policy.json", EXECUTION_ROOT), policy);
writeJson(new URL("execution-binding.json", EXECUTION_ROOT), binding);
writeJson(new URL("executor-invocation.json", EXECUTION_ROOT), invocation);
writeJson(new URL("repository-snapshot.json", EXECUTION_ROOT), repositorySnapshot);
writeJson(new URL("WI-DESKTOP-CONTRACTS.attempt-001.task.json", OUTPUT), task);

const prompt = `# DevRelay WorkExecution: WI-DESKTOP-CONTRACTS

Execute only the exact task contract at:

\`dogfood/chatgpt-desktop-runtime/execution/task-contracts/WI-DESKTOP-CONTRACTS.attempt-001.task.json\`

Read \`AGENTS.md\` first. Verify the task contract \`contentDigest\` by
recomputing \`canonicalJsonDigest\` after omitting that field, then read every
declared context path before editing. Implement only the bounded work item and
only within its allowed write paths.

Do not route downstream work, mutate approved project artifacts, approve or
integrate your own change, or create Git commits. Run the two exact focused
verification commands and return only the closed \`BootstrapWorkItemHandoff\`
shape declared in the task contract, with exact changed paths, exit codes,
evidence digest, and residual risks. The parent task retains verification and
integration authority.`;
writeFileSync(
  new URL("WI-DESKTOP-CONTRACTS.attempt-001.prompt.md", OUTPUT),
  `${prompt}\n`,
);

console.log(
  JSON.stringify(
    {
      contractId: task.contractId,
      contentDigest: task.contentDigest,
      invocationFingerprint: invocation.invocationFingerprint,
      bindingDigest: binding.bindingDigest,
      repositoryRevision: repositorySnapshot.revision,
      readyWorkItemIds,
      assignedProfile: assignment.specialistProfileRef,
    },
    null,
    2,
  ),
);
