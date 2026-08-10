import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const taskDir = resolve(root, "dogfood/lifecycle-run-report/execution/task-contracts");
mkdirSync(taskDir, { recursive:true });
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const breakdown = readJson("dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json");
const assignments = readJson("dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json");
const completion = readJson("dogfood/lifecycle-run-report/execution/integrated-completion-facts/WI-RUN-CONTRACTS.json");
const definitions = {
  "WI-RUN-CONTENT-POLICY": {
    allowedWritePaths:["src/lifecycle-run-report-content-policy.mjs","test/lifecycle-run-report-content-policy.test.mjs"],
    evidenceKind:"lifecycle-run-report/content-policy-tests",
    command:"node --test test/lifecycle-run-report-content-policy.test.mjs",
  },
  "WI-RUN-LEDGER": {
    allowedWritePaths:["src/lifecycle-run-report-ledger.mjs","test/lifecycle-run-report-ledger.test.mjs"],
    evidenceKind:"lifecycle-run-report/ledger-tests",
    command:"node --test test/lifecycle-run-report-ledger.test.mjs",
  },
  "WI-RUN-OBSERVATIONS": {
    allowedWritePaths:["src/lifecycle-run-report-observations.mjs","test/lifecycle-run-report-observations.test.mjs"],
    evidenceKind:"lifecycle-run-report/observation-tests",
    command:"node --test test/lifecycle-run-report-observations.test.mjs",
  },
};

for (const [workItemId, definition] of Object.entries(definitions)) {
  const workItem = breakdown.workItems.find(({ id }) => id === workItemId);
  const assignment = assignments.assignments.find(({ workItemRef }) => workItemRef === workItemId);
  if (!workItem || !assignment) throw new Error(`missing approved work item or assignment for ${workItemId}`);
  const executionId = `WE-RUN-DOGFOOD-${workItemId}-ATTEMPT-001`;
  const contract = {
    apiVersion:"devrelay.dev/v1alpha1",
    kind:"BootstrapWorkExecutionTaskContract",
    contractId:`WETC-${workItemId}-001`,
    executionId,
    workItemId,
    attempt:1,
    status:"prepared",
    readyFrontier:{ frontierId:"RUN-FRONTIER-002", prerequisiteCompletion:{ artifactId:completion.completionId, digest:completion.completionDigest } },
    assignment,
    authority:{
      allowedWritePaths:definition.allowedWritePaths,
      forbiddenActions:[
        "Do not change any file outside allowedWritePaths.",
        "Do not change src/index.mjs; public-surface fan-in is owned by a downstream integration work item.",
        "Do not alter approved baselines, contracts, dependency DAG, assignments, graph, evidence, release, or project artifacts.",
        "Do not commit, merge, promote, integrate, or claim verification or progression authority.",
      ],
    },
    contextPaths:[
      "ProjectOverview.md",
      "project/requirements-baseline.json",
      "project/architecture-baseline.json",
      "project/contract-baseline.json",
      "project/contract-disposition.json",
      "dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json",
      "dogfood/lifecycle-run-report/dependency-analysis/work-dependency-baseline.json",
      "dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json",
      "dogfood/lifecycle-run-report/execution/integrated-completion-facts/WI-RUN-CONTRACTS.json",
      "contracts/lifecycle-run-report-artifacts.schema.json",
      "src/lifecycle-run-report-artifact-validator.mjs",
      "test/lifecycle-run-report-contracts.test.mjs",
    ],
    verification:{ acceptance:workItem["verification-plan"].checks[0].successCriteria, commands:[definition.command], requiredEvidence:workItem["required-evidence"] },
    stopConditions:[
      "Stop with clarify only if the approved artifacts leave a material product or authority decision unresolved.",
      "Stop with fix if the focused suite fails or implementation cannot stay within allowedWritePaths.",
      "Stop after the exact bounded handoff; Core owns WorkItemVerification, ChangeIntegration, traceability, and frontier progression.",
    ],
    hostRuntimeSupply:{ dependencyResolver:{ mode:"bare-package-resolution-only", path:"C:/Users/garre/OneDrive/Documents/Portable Best Practices/.tmp-devrelay-dependency-loader.mjs", digest:"sha256:7806bde635ad93006403a185c925b09f3187bc9de582d6266910f9df9a31bcd5" }, dependencyTree:{ authority:"host-read-supply", path:"C:/tmp/DevRelay-v04-work-dependency-analysis/node_modules", repositoryWriteGrant:false } },
    handoff:{ integrationAuthority:false, requiredShape:{ apiVersion:"devrelay.dev/v1alpha1", kind:"BootstrapWorkItemHandoff", executionId, workItemId, outcome:"pass | fix | diagnose | clarify | block", changedFiles:["relative/path"], verification:[{command:"exact command",exitCode:0,summary:"bounded result"}], evidence:[{kind:definition.evidenceKind,relativePath:"relative/path",digest:"sha256:<64 lowercase hex>"}], notes:"concise implementation handoff", residualRisks:["none or bounded risk"] } },
    workItem,
  };
  const path = resolve(taskDir, `${workItemId}.attempt-001.task.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ workItemId, path, digest:sha256(readFileSync(path)) }));
}
