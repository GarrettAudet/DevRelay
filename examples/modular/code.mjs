import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCodingWorkflow } from "./coding.mjs";
import { codingPluginDefinitions } from "./coding-contracts.mjs";

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--list") {
    console.log(JSON.stringify(codingPluginDefinitions({}).map(definition => ({
      ...definition.metadata, binding: definition.implements[0],
    })), null, 2));
    return;
  }
  if (args.length !== 3) {
    console.error("Usage: node examples/modular/code.mjs <workspace> <context-directory> <request.json>");
    process.exitCode = 2;
    return;
  }
  let host;
  try {
    const [workspace, contextDirectory, requestPath] = args.map(value => resolve(value));
    const [requirementsBytes, overviewBytes, overviewMarkdownBytes, requestBytes] = await Promise.all([
      readFile(join(contextDirectory, "requirements-baseline.json")),
      readFile(join(contextDirectory, "project-overview-baseline.json")),
      readFile(join(contextDirectory, "ProjectOverview.md")),
      readFile(requestPath, "utf8"),
    ]);
    host = createCodingWorkflow({ workspace,
      stateDirectory: join(workspace, ".devrelay", "modular-coding"),
      requirementsBytes, overviewBytes, overviewMarkdownBytes });
    const result = await host.execute(JSON.parse(requestBytes));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.currentWorkspaceMatches && result.result.outcome === "verified" ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 2;
  } finally { host?.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
