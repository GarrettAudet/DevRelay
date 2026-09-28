import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDigestExample, digestPluginDefinitions } from "./digest.mjs";

export async function main(args = process.argv.slice(2)) {
  const [file, contextDirectory, plugin = "node-sha256"] = args;
  if (file === "--list" && args.length === 1) {
    console.log(JSON.stringify(digestPluginDefinitions.map(({ metadata }) => metadata), null, 2));
  } else if (!file || !contextDirectory || args.length > 3) {
    console.error("Usage: node examples/modular/run.mjs <UTF-8-file> <context-directory> [node-sha256|webcrypto-sha256]");
    console.error("Context directory contains requirements-baseline.json, project-overview-baseline.json and ProjectOverview.md.");
    process.exitCode = 2;
  } else {
    try {
      const [bytes, requirementsBytes, overviewBytes, overviewMarkdownBytes] = await Promise.all([
        readFile(resolve(file)),
        readFile(resolve(contextDirectory, "requirements-baseline.json")),
        readFile(resolve(contextDirectory, "project-overview-baseline.json")),
        readFile(resolve(contextDirectory, "ProjectOverview.md")),
      ]);
      const example = createDigestExample({ requirementsBytes, overviewBytes, overviewMarkdownBytes });
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const { result, value } = await example.execute({ plugin, text });
      console.log(JSON.stringify({ plugin, digest: value.text, outcome: result.outcome,
        catalog: example.catalog.list().map(entry => entry.plugin), evidence: result.evidence }, null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
