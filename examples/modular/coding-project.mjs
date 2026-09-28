import { lstatSync, readdirSync, realpathSync, writeFileSync, openSync, closeSync, fstatSync, readSync, constants } from "node:fs";
import { resolve, join, parse, relative } from "node:path";
import { sha256Digest, canonicalJson } from "../../src/content-digest.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { ensurePlainDirectory } from "./coding-files.mjs";

const contextFiles = ["requirements-baseline.json", "project-overview-baseline.json", "ProjectOverview.md"];
const configName = "modular-project.json";
const maximumBytes = 16 * 1024 * 1024;

// Local host configuration is trusted. Reject accidental links and partial state;
// these checks do not isolate a hostile process with access to the same directory.
function plainPath(path, allowMissing = false) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Project path contains a link: " + current);
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return absolute;
}
function readBytes(path) {
  plainPath(path);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximumBytes) throw new Error("Expected a plain file within the 16 MiB limit: " + path);
    const buffer = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > maximumBytes) throw new Error("Project file exceeds the 16 MiB limit");
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}
async function validateContext(bytes) {
  const [requirementsBytes, overviewBytes, overviewMarkdownBytes] = bytes;
  const requirements = JSON.parse(requirementsBytes.toString("utf8"));
  const overview = JSON.parse(overviewBytes.toString("utf8"));
  if (requirements.kind !== "RequirementsBaseline" || overview.kind !== "ProjectOverviewBaseline") {
    throw new Error("Setup requires an approved RequirementsBaseline and ProjectOverviewBaseline pair");
  }
  const contracts = requirementsRuntimeArtifactContracts();
  const context = {phase:"input", loadedInputs: {
    "requirements-baseline": [{ref: {artifactId:requirements.baselineId, digest:sha256Digest(requirementsBytes)}, value:requirements}],
  }, loadBytes: async ref => {
    if (ref.digest !== sha256Digest(overviewMarkdownBytes)) throw new Error("ProjectOverview.md digest mismatch");
    return overviewMarkdownBytes;
  }};
  await contracts.find(item => item.schema === "https://devrelay.dev/artifacts/requirements-baseline/v1").validate(requirements, context);
  await contracts.find(item => item.schema === "https://devrelay.dev/artifacts/project-overview-baseline/v1").validate(overview, context);
  return {requirementsBytes, overviewBytes, overviewMarkdownBytes};
}
export async function setupCodingProject({mode, workspace, contextDirectory}) {
  if (!["new", "existing"].includes(mode)) throw new Error("Setup mode must be new or existing");
  const bytes = contextFiles.map(name => readBytes(join(contextDirectory, name)));
  await validateContext(bytes);
  const absolute = plainPath(workspace, mode === "new");
  if (mode === "new") {
    try {
      if (readdirSync(absolute).length) throw new Error("New project directory must be empty");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  } else if (!lstatSync(absolute).isDirectory()) throw new Error("Existing workspace must be a directory");
  // Validate all existing path components before the first creation.
  plainPath(join(absolute, ".devrelay", configName), true);
  const snapshot = contextFiles.map((name, index) => ({name, digest:sha256Digest(bytes[index]), bytes:bytes[index].toString("base64")}));
  // Reserve path/format overhead so the complete snapshot is bounded before creation.
  if (Buffer.byteLength(canonicalJson(snapshot)) > maximumBytes - 32768) throw new Error("Combined project context exceeds the 16 MiB limit");
  ensurePlainDirectory(absolute);
  const root = realpathSync(absolute);
  const config = {formatVersion:1, workspace:root, context:snapshot};
  const serialized = canonicalJson(config) + "\n";
  const state = ensurePlainDirectory(join(root, ".devrelay"));
  const path = join(state, configName);
  try { writeFileSync(path, serialized, {encoding:"utf8", flag:"wx"}); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (readBytes(path).toString("utf8") !== serialized) throw new Error("Project is already configured with different context; choose a new workspace for this preview");
  }
  return {configured:true, workspace:root, context:config.context.map(({name,digest}) => ({name,digest}))};
}
export async function loadCodingProject(workspace) {
  const root = realpathSync(plainPath(workspace));
  const config = JSON.parse(readBytes(join(root, ".devrelay", configName)).toString("utf8"));
  if (config.formatVersion !== 1 || config.workspace !== root || !Array.isArray(config.context) || config.context.length !== contextFiles.length) {
    throw new Error("Saved project configuration does not match this workspace");
  }
  const bytes = config.context.map((item, index) => {
    if (item.name !== contextFiles[index] || typeof item.bytes !== "string") throw new Error("Invalid saved project context");
    const value = Buffer.from(item.bytes, "base64");
    if (value.toString("base64") !== item.bytes || sha256Digest(value) !== item.digest) throw new Error("Saved project context digest mismatch");
    return value;
  });
  return {workspace:root, stateDirectory:join(root, ".devrelay", "modular-coding"), ...await validateContext(bytes)};
}
