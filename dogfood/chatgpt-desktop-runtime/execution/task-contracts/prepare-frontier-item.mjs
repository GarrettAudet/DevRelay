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
const requestedWorkItemId = process.argv[2];
const configurations = {
  "WI-DESKTOP-APP-SERVER": {
    allowedWritePaths: [
      "src/chatgpt-desktop-app-server-client.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-app-server-client.test.mjs",
      "test/fixtures/chatgpt-desktop-app-server/**",
      "package.json",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-app-server-client.mjs",
      "node --test test/chatgpt-desktop-app-server-client.test.mjs",
    ],
  },
  "WI-DESKTOP-CAPABILITY-RESOLVER": {
    allowedWritePaths: [
      "src/chatgpt-desktop-capability-resolver.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-capability-resolver.test.mjs",
      "test/fixtures/chatgpt-desktop-capabilities/**",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-capability-resolver.mjs",
      "node --test test/chatgpt-desktop-capability-resolver.test.mjs",
    ],
  },
  "WI-DESKTOP-MCP-BRIDGE": {
    allowedWritePaths: [
      "src/chatgpt-desktop-mcp-server.mjs",
      "src/chatgpt-desktop-mcp-transport.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-mcp-server.test.mjs",
      "test/fixtures/chatgpt-desktop-mcp/**",
      "package.json",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-mcp-server.mjs",
      "node --check src/chatgpt-desktop-mcp-transport.mjs",
      "node --test test/chatgpt-desktop-mcp-server.test.mjs",
    ],
  },
  "WI-DESKTOP-PLUGIN": {
    allowedWritePaths: [
      "plugins/devrelay/**",
      ".agents/plugins/marketplace.json",
      "test/chatgpt-desktop-plugin.test.mjs",
    ],
    processTools: ["node", "python", "python3"],
    verificationCommands: [
      "python C:/Users/garre/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/devrelay",
      "node --test test/chatgpt-desktop-plugin.test.mjs",
    ],
    requiredSkill: "plugin-creator",
  },
  "WI-DESKTOP-RUN-STORE": {
    allowedWritePaths: [
      "src/chatgpt-desktop-run-store.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-run-store.test.mjs",
      "test/fixtures/chatgpt-desktop-run-store/**",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-run-store.mjs",
      "node --test test/chatgpt-desktop-run-store.test.mjs",
    ],
  },
  "WI-DESKTOP-TASK-SUPERVISOR": {
    allowedWritePaths: [
      "src/chatgpt-desktop-task-supervisor.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-task-supervisor.test.mjs",
      "test/fixtures/chatgpt-desktop-task-supervisor/**",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-task-supervisor.mjs",
      "node --test test/chatgpt-desktop-task-supervisor.test.mjs",
    ],
  },
  "WI-DESKTOP-LIFECYCLE": {
    allowedWritePaths: [
      "src/chatgpt-desktop-lifecycle-controller.mjs",
      "src/index.mjs",
      "test/chatgpt-desktop-lifecycle-controller.test.mjs",
      "test/fixtures/chatgpt-desktop-lifecycle/**",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --check src/chatgpt-desktop-lifecycle-controller.mjs",
      "node --test test/chatgpt-desktop-lifecycle-controller.test.mjs",
    ],
  },
  "WI-DESKTOP-INSTALL": {
    allowedWritePaths: [
      "scripts/install-chatgpt-desktop-plugin.ps1",
      "scripts/chatgpt-desktop-plugin-health-check.ps1",
      "test/chatgpt-desktop-install.test.mjs",
      "test/fixtures/chatgpt-desktop-install/**",
      "package.json",
    ],
    processTools: ["node", "npm.cmd", "powershell"],
    verificationCommands: [
      "node --test test/chatgpt-desktop-install.test.mjs",
    ],
  },
  "WI-DESKTOP-VERIFICATION": {
    allowedWritePaths: [
      "scripts/verify-chatgpt-desktop-release.mjs",
      "test/chatgpt-desktop-release-verification.test.mjs",
      "test/fixtures/chatgpt-desktop-release/**",
      "release/chatgpt-desktop/**",
      "package.json",
    ],
    processTools: ["node", "npm.cmd", "powershell"],
    verificationCommands: [
      "node --check scripts/verify-chatgpt-desktop-release.mjs",
      "node --test test/chatgpt-desktop-release-verification.test.mjs",
    ],
  },
  "WI-DESKTOP-DOCUMENTATION": {
    allowedWritePaths: [
      "docs/chatgpt-desktop-windows.md",
      "plugins/devrelay/README.md",
      "README.md",
      "test/chatgpt-desktop-documentation.test.mjs",
    ],
    processTools: ["node", "npm.cmd"],
    verificationCommands: [
      "node --test test/chatgpt-desktop-documentation.test.mjs",
    ],
  },
};
const configuration = configurations[requestedWorkItemId];
if (!configuration) {
  throw new Error(
    `requested WorkItem is not in the authoritative Desktop frontier: ${requestedWorkItemId ?? "<missing>"}`,
  );
}
const workItem = workBreakdown.workItems.find(
  ({ id }) => id === requestedWorkItemId,
);
const workSlug = workItem.id.replace(/^WI-DESKTOP-/u, "");
const itemArtifactPath = (name) =>
  `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItem.id}/${name}`;
const itemOutput = new URL(`./${workItem.id}/`, OUTPUT);
const assignment = assignmentBaseline.assignments.find(
  ({ workItemRef }) => workItemRef === workItem?.id,
);
if (!workItem || !assignment) {
  throw new Error("approved Desktop work item or assignment is unavailable");
}

const completionFacts = read(
  "dogfood/chatgpt-desktop-runtime/execution/integrated-completion-facts.json",
);
const prerequisiteWorkItemIds = workDependency.edges
  .filter(({ dependentId }) => dependentId === workItem.id)
  .map(({ prerequisiteId }) => prerequisiteId)
  .sort();
const prerequisiteCompletionFacts = completionFacts.facts
  .filter(({ workItemId }) => prerequisiteWorkItemIds.includes(workItemId))
  .sort(({ workItemId: left }, { workItemId: right }) =>
    left.localeCompare(right),
  );
if (prerequisiteCompletionFacts.length !== prerequisiteWorkItemIds.length) {
  throw new Error("exact prerequisite completion facts are unavailable");
}
for (const prerequisiteWorkItemId of prerequisiteWorkItemIds) {
  const prerequisiteCompletion = read(
    `dogfood/chatgpt-desktop-runtime/execution/integration/${prerequisiteWorkItemId}/integrated-completion-fact.json`,
  );
  const compactFact = prerequisiteCompletionFacts.find(
    ({ workItemId }) => workItemId === prerequisiteWorkItemId,
  );
  if (
    !compactFact ||
    compactFact.integrationRef.artifactId !==
      prerequisiteCompletion.integration.artifactId ||
    compactFact.integrationRef.digest !== prerequisiteCompletion.integration.digest
  ) {
    throw new Error(`completion set does not match ${prerequisiteWorkItemId}`);
  }
}
const completedWorkItemIds = completionFacts.facts.map(
  ({ workItemId }) => workItemId,
);
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
if (!readyWorkItemIds.includes(workItem.id)) {
  throw new Error(
    `requested WorkItem is not Core-ready: ${workItem.id}; frontier=${readyWorkItemIds.join(",")}`,
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
    "plugins/**",
    ".agents/**",
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
  itemArtifactPath("repository-snapshot.json"),
);

const frontier = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RunnableFrontierProof",
    workItemId: workItem.id,
    workBreakdownBaseline: workBreakdownRef,
    workDependencyBaseline: workDependencyRef,
    dependencyGraphDigest: workDependency.graphDigest,
    prerequisiteCompletionFacts,
  },
  "readinessDigest",
);
const policy = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionPolicy",
    policyId: `desktop-local-codex-worktree-${workItem.id.toLowerCase()}-v1`,
    version: "1.0.0",
    timeoutMilliseconds: 7_200_000,
    allowedPermissions: [
      { kind: "filesystem.read", scope: { values: ["**"] } },
      {
        kind: "filesystem.write",
        scope: {
          values: configuration.allowedWritePaths,
        },
      },
      { kind: "process.spawn", scope: { values: configuration.processTools } },
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
  workItemId: workItem.id,
  allowedWritePaths: configuration.allowedWritePaths,
  verificationCommands: configuration.verificationCommands,
  requiredSkill: configuration.requiredSkill ?? "none",
};
const binding = bodySeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionBinding",
    bindingId: `BIND-DESKTOP-${workSlug}-001`,
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
      itemArtifactPath("execution-policy.json"),
    ),
    configurationDigest: canonicalJsonDigest(executionConfiguration),
  },
  "bindingDigest",
);

const attemptId = `ATT-DESKTOP-${workSlug}-001`;
const authoritativeInputs = [
  { name: "work-breakdown-baseline", artifact: workBreakdownRef },
  { name: "work-dependency-baseline", artifact: workDependencyRef },
  { name: "specialist-assignment-baseline", artifact: assignmentRef },
  {
    name: "requirements-baseline",
    artifact: ref(
      requirements,
      requirements.baselineId,
      "project/requirements-baseline.json",
    ),
  },
  {
    name: "architecture-baseline",
    artifact: ref(
      architecture,
      architecture.baselineId,
      "project/architecture-baseline.json",
    ),
  },
  {
    name: "contract-baseline",
    artifact: ref(
      contractBaseline,
      contractBaseline.baselineId,
      "project/contract-baseline.json",
    ),
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
      `frontier-desktop-${workSlug.toLowerCase()}-001`,
      itemArtifactPath("runnable-frontier-proof.json"),
    ),
    executionBinding: ref(
      binding,
      binding.bindingId,
      itemArtifactPath("execution-binding.json"),
    ),
    executionPolicy: binding.executionPolicy,
    projectOverviewBaseline: overviewRef,
    repositorySnapshot: repositoryRef,
    workspaceBaseDigest: repositorySnapshot.treeDigest,
  },
  "invocationFingerprint",
);

for (const artifact of [
  completionFacts,
  frontier,
  policy,
  binding,
  invocation,
]) {
  validateWorkExecutionArtifact(artifact);
}

const task = selfSeal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "BootstrapWorkExecutionTaskContract",
    contractId: `WETC-${workItem.id}-001`,
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
      "contracts/chatgpt-desktop-runtime-artifacts.schema.json",
      "src/work-execution-artifact-validator.mjs",
      "src/chatgpt-desktop-runtime-artifact-validator.mjs",
      "src/index.mjs",
      "dogfood/chatgpt-desktop-runtime/execution/integrated-completion-facts.json",
      "dogfood/chatgpt-desktop-runtime/execution/ready-frontier-current.json",
      ...prerequisiteWorkItemIds.map(
        (prerequisiteWorkItemId) =>
          `dogfood/chatgpt-desktop-runtime/execution/integration/${prerequisiteWorkItemId}/integrated-completion-fact.json`,
      ),
    ],
    authority: {
      allowedReadPaths: ["**"],
      allowedWritePaths: policy.allowedPermissions.find(
        ({ kind }) => kind === "filesystem.write",
      ).scope.values,
      forbiddenActions: [
        "Do not start Codex tasks, route modules, approve gates, mutate project baselines, or integrate the proposed change.",
        "Do not edit files outside the exact allowedWritePaths in this task contract.",
        "Do not change approved requirements, architecture, dependency, assignment, or contract semantics.",
        "Do not create commits, branches, tags, or pull requests.",
      ],
    },
    verification: {
      commands: configuration.verificationCommands,
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
            kind: workItem["required-evidence"][0].kind,
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
      "Stop after the bounded handoff; do not begin dependent or sibling work items.",
    ],
  },
  "contentDigest",
);

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(itemOutput, { recursive: true });
writeJson(new URL("runnable-frontier-proof.json", itemOutput), frontier);
writeJson(new URL("execution-policy.json", itemOutput), policy);
writeJson(new URL("execution-binding.json", itemOutput), binding);
writeJson(new URL("executor-invocation.json", itemOutput), invocation);
writeJson(new URL("repository-snapshot.json", itemOutput), repositorySnapshot);
writeJson(new URL(`${workItem.id}.attempt-001.task.json`, OUTPUT), task);

const prompt = `# DevRelay WorkExecution: ${workItem.id}

Execute only the exact task contract at:

\`dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItem.id}.attempt-001.task.json\`

Read \`AGENTS.md\` first. Verify the task contract \`contentDigest\` by
recomputing \`canonicalJsonDigest\` after omitting that field, then read every
declared context path before editing. Implement only the bounded work item and
only within its allowed write paths.
${configuration.requiredSkill ? `Use the \`${configuration.requiredSkill}\` skill and follow its validation workflow for this task.\n` : ""}

Do not route downstream work, mutate approved project artifacts, approve or
integrate your own change, or create Git commits. Run every exact focused
verification command and return only the closed \`BootstrapWorkItemHandoff\`
shape declared in the task contract, with exact changed paths, exit codes,
evidence digest, and residual risks. The parent task retains verification and
integration authority.`;
writeFileSync(
  new URL(`${workItem.id}.attempt-001.prompt.md`, OUTPUT),
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
