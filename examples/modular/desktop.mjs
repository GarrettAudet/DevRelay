import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setupCodingProject, loadCodingProject } from "./coding-project.mjs";
import { createCodingWorkflow } from "./coding.mjs";
import { main as codingMain } from "./code.mjs";
import { summarizeCodingResult } from "./coding-summary.mjs";

export async function main(args = process.argv.slice(2)) {
  let host;
  try {
    const [command, ...values] = args;
    if (command === "list" && values.length === 0) return await codingMain(["--list"]);
    if (command === "setup" && values.length === 3) {
      const [mode, workspace, contextDirectory] = values;
      console.log(JSON.stringify(await setupCodingProject({mode, workspace, contextDirectory}), null, 2));
      return;
    }
    if (command !== "run" || values.length !== 2) {
      throw new Error("Usage: desktop.mjs setup <new|existing> <workspace> <context-directory> | run <workspace> <request.json> | list");
    }
    const config = await loadCodingProject(values[0]);
    const request = JSON.parse(await readFile(resolve(values[1]), "utf8"));
    host = createCodingWorkflow(config);
    const result = await host.execute(request);
    console.log(JSON.stringify({...result, summary:summarizeCodingResult(result)}, null, 2));
    process.exitCode = result.currentWorkspaceMatches && result.result.outcome === "verified" ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({error:error.message}));
    process.exitCode = 2;
  } finally { host?.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
