import { readFileSync } from "node:fs";
import { dirname, resolve, join, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeIdentity, entrypoint } from "./configure-runtime.mjs";

export async function main(args = process.argv.slice(2)) {
  try {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), "../runtime.json");
    let saved;
    try { saved = JSON.parse(readFileSync(path, "utf8")); }
    catch (error) { throw new Error("Run this plug-in's scripts/configure-runtime.mjs with an explicit DevRelay runtime directory first", {cause:error}); }
    if (saved.formatVersion !== 1 || typeof saved.runtimeRoot !== "string" || !isAbsolute(saved.runtimeRoot)) {
      throw new Error("Invalid configured DevRelay runtime");
    }
    const current = runtimeIdentity(saved.runtimeRoot);
    if (current.runtimeRoot !== saved.runtimeRoot || current.version !== saved.version) throw new Error("Configured runtime path or version changed; explicitly reconfigure and reinstall");
    if (current.entrypointDigest !== saved.entrypointDigest) throw new Error("Configured runtime entry-point digest changed; explicitly reconfigure and reinstall");
    const runtime = await import(pathToFileURL(join(current.runtimeRoot, entrypoint)).href);
    await runtime.main(args);
  } catch (error) {
    console.error(JSON.stringify({error:error.message}));
    process.exitCode = 2;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
