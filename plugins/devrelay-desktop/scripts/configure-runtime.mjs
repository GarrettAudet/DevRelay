import { readFileSync, writeFileSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";

export const entrypoint = "examples/modular/desktop.mjs";
export function runtimeIdentity(runtimeRoot) {
  const root = realpathSync(resolve(runtimeRoot));
  const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (packageInfo.name !== "devrelay" || typeof packageInfo.version !== "string") throw new Error("Expected an installed DevRelay source or package directory");
  return {formatVersion:1, runtimeRoot:root, version:packageInfo.version,
    entrypointDigest:"sha256:" + createHash("sha256").update(readFileSync(join(root, entrypoint))).digest("hex")};
}
export function configureRuntime(runtimeRoot, {pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."), replace = false} = {}) {
  const identity = runtimeIdentity(runtimeRoot);
  const destination = join(pluginRoot, "runtime.json");
  const bytes = JSON.stringify(identity, null, 2) + "\n";
  if (!replace) writeFileSync(destination, bytes, {encoding:"utf8", flag:"wx"});
  else {
    const temporary = destination + "." + randomUUID();
    try {
      writeFileSync(temporary, bytes, {encoding:"utf8", flag:"wx"});
      renameSync(temporary, destination);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  return identity;
}
export function main(args = process.argv.slice(2)) {
  try {
    if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== "--replace")) {
      throw new Error("Usage: configure-runtime.mjs <DevRelay runtime directory> [--replace]");
    }
    console.log(JSON.stringify(configureRuntime(args[0], {replace:args[1] === "--replace"}), null, 2));
  } catch (error) {
    console.error(JSON.stringify({error:error.message}));
    process.exitCode = 2;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
