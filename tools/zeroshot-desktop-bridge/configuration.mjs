import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export function configurationFor({ graph, workspace, revision, snapshotDigest, runId, task, timeoutSeconds = 1800 }) {
  const nodes = {};
  function visit(node) {
    if (node.kind === "step" || node.kind === "verifier") nodes[node.name] = { kind: "agent", model: "desktop-inherited", sessionScope: "execution", connections: {} };
    for (const child of node.children ?? []) visit(child);
    for (const branch of node.branches ?? []) visit(branch.node ?? branch);
    if (node.body) visit(node.body);
    if (node.otherwise) visit(node.otherwise);
  }
  visit(graph.root);
  return { protocol: "devrelay.zeroshot-desktop/1", runId, workspace: path.resolve(workspace), sourceSnapshotDigest: snapshotDigest,
    nodeTimeoutSeconds: timeoutSeconds, submission: { title: "Desktop bridge: software-change", graph, initialInput: { task },
      runtime: { harness: "codex", provider: "openai", size: "medium", nodes },
      source: { repository: "GarrettAudet/DevRelay", branch: "codex/modular-zeroshot", revision }, submissionKey: runId } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [graphFile, workspace, snapshotFile, taskFile, outputFile, runId, gitExecutable] = process.argv.slice(2);
  if (!gitExecutable) throw new Error("usage: configuration.mjs GRAPH WORKSPACE SNAPSHOT TASK OUTPUT RUN_ID GIT_EXECUTABLE");
  const revision = execFileSync(gitExecutable, ["-C", workspace, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  const snapshotDigest = `sha256:${createHash("sha256").update(readFileSync(snapshotFile)).digest("hex")}`;
  const configuration = configurationFor({ graph: JSON.parse(readFileSync(graphFile)), workspace, revision, snapshotDigest, runId, task: readFileSync(taskFile, "utf8") });
  writeFileSync(outputFile, JSON.stringify(configuration), { flag: "wx" });
  process.stdout.write(`${outputFile}\n`);
}
