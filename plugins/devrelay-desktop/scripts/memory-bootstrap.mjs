import { execFileSync } from "node:child_process";
import path from "node:path";

import { loadDesktopProjectMemoryBootstrap } from "../../../src/desktop-project-memory-bootstrap.mjs";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const projectRoot = path.resolve(valueFor("--project-root") ?? process.cwd());
const taskId = valueFor("--task-id");
if (!taskId) throw new Error("--task-id is required");
let revision = valueFor("--repository-revision");
if (!revision) {
  try { revision = execFileSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(); }
  catch { revision = "working-tree"; }
}
const result = loadDesktopProjectMemoryBootstrap({ projectRoot, taskId, repositoryRevision: revision });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
