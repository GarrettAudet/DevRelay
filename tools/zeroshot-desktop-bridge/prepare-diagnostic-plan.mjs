// For read-only bridge diagnostics only. This does not authorize product work.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDesktopTaskPlan } from "../../src/desktop-task-adapter.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../../src/desktop-project-memory-bootstrap.mjs";
import { digest, publish, readBytes } from "./broker.mjs";

const [queueDirectory, requestId, gitExecutable] = process.argv.slice(2);
if (!/^[1-9][0-9]*$/u.test(requestId ?? "") || !gitExecutable) throw new Error("usage: prepare-diagnostic-plan.mjs QUEUE ID GIT_EXECUTABLE");
const queue = path.resolve(queueDirectory);
const configuration = JSON.parse(readBytes(path.join(queue, "configuration.json")));
const request = JSON.parse(readBytes(path.join(queue, "requests", `${requestId}.json`)));
const projectRoot = realpathSync(configuration.workspace);
const revision = execFileSync(gitExecutable, ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
if (revision !== configuration.submission.source.revision) throw new Error("starting revision drifted");
const taskId = `${configuration.runId}-execution-${requestId}`;
// Run the required worktree-local, dependency-free startup command before the
// full loader binds the receipt into the actual DesktopTaskPlan.
const bootstrapBytes = execFileSync(process.execPath, ["plugins/devrelay-desktop/scripts/memory-bootstrap.mjs", "--task-id", taskId],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
const bootstrap = JSON.parse(bootstrapBytes);
if (bootstrap.receipt.outcome !== "pass") throw new Error("ProjectMemory bootstrap failed");
publish(path.join(queue, "bootstrap", `${requestId}.json`), bootstrap);
const memoryBootstrap = loadDesktopProjectMemoryBootstrap({ projectRoot, taskId, repositoryRevision: revision });
const promptFile = path.join(queue, "requests", `${requestId}.json`);
const workItemId = `${configuration.runId}-node-${requestId}`;
const plan = createDesktopTaskPlan({
  runId: configuration.runId, workItem: { id: workItemId }, projectId: "devrelay", startingRevision: revision,
  // This is the parent coordinator's retained, already allocated Git worktree.
  // It is not a lease issued by the production durable-worktree manager.
  worktreeLease: { apiVersion: "devrelay.dev/v1alpha1", kind: "WorktreeLease", attemptId: taskId,
    runId: configuration.runId, workItemId, revision, observedRevision: revision,
    workspace: projectRoot, status: "active", cleanupDisposition: "retain" },
  assignment: { profile: "read-only-bridge-diagnostic", role: request.role },
  executor: { id: "codex.desktop.collaboration", version: "host-provided", modelSelection: "inherit" },
  grants: [{ kind: "filesystem.read", scope: projectRoot }],
  promptArtifact: { artifactId: `ZEROSHOT-PROMPT-${taskId}`, schema: "https://devrelay.dev/experimental/zeroshot-prompt/v1",
    mediaType: "text/plain", digest: digest(Buffer.from(request.prompt, "utf8")), uri: `${pathToFileURL(promptFile).href}#prompt` },
  memoryBootstrap,
});
publish(path.join(queue, "prepared", `${requestId}.json`), plan);
process.stdout.write(`${JSON.stringify({ planFile: path.join(queue, "prepared", `${requestId}.json`),
  planDigest: plan.planDigest, bootstrapReceipt: memoryBootstrap.receipt, memoryContextDigest: plan.memoryContextDigest }, null, 2)}\n`);
