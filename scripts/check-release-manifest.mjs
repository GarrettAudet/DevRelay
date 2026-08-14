import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalModules,
  canonicalPlugins,
  compatibilityModules,
  compatibilityPlugins,
  comparePortablePaths,
  excludedReleaseDirectories,
  expectedPackagedPaths,
  npmPackPaths,
  parseReleaseManifest,
  rawDigest,
  releaseManifestRelativePath,
  releaseRepositoryFiles,
  repositoryRoot,
  roleFor,
  sourceReleaseVersion,
} from "./release-catalog.mjs";

function fail(message) {
  throw new Error("release manifest invalid: " + message);
}

function exact(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(message);
  }
}

function loadJson(path) {
  return JSON.parse(
    readFileSync(join(repositoryRoot, ...path.split("/")), "utf8"),
  );
}

function matchingFiles(relativeDirectory, suffix) {
  const found = [];
  function visit(relativePath) {
    const absolute = join(repositoryRoot, ...relativePath.split("/"));
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = relativePath + "/" + entry.name;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(child);
    }
  }
  visit(relativeDirectory);
  return found.sort(comparePortablePaths);
}

const manifest = parseReleaseManifest();
if (
  manifest.apiVersion !== "devrelay.dev/v1alpha1" ||
  manifest.kind !== "ReleaseCatalog"
) {
  fail("identity must be devrelay.dev/v1alpha1 ReleaseCatalog");
}
exact(
  manifest.metadata,
  {
    name: "devrelay",
    version: sourceReleaseVersion,
    releaseType: "github-source-prerelease",
  },
  `metadata does not identify the DevRelay ${sourceReleaseVersion} GitHub source prerelease`,
);
exact(
  manifest.scope,
  {
    root: ".",
    inclusion: "all-regular-files-recursive",
    excludedDirectories: excludedReleaseDirectories,
    selfExclusion: {
      path: releaseManifestRelativePath,
      reason: "A release catalog cannot contain its own stable raw-byte digest.",
      npmPackaged: true,
    },
  },
  "scope or self-exclusion metadata is not canonical",
);
if (manifest.digestAlgorithm !== "sha256-raw-bytes") {
  fail("digestAlgorithm must be sha256-raw-bytes");
}
exact(
  manifest.modules,
  canonicalModules,
  "module IDs, versions, operation surfaces, steps, or plugin set changed",
);
exact(
  manifest.plugins,
  canonicalPlugins,
  "plugin IDs, versions, module owners, or operation/step/role bindings changed",
);
exact(manifest.compatibilityModules, compatibilityModules, "compatibility module set changed");
exact(manifest.compatibilityPlugins, compatibilityPlugins, "compatibility plugin set changed");
if (!Array.isArray(manifest.files)) {
  fail("files must be an array");
}

const expectedRepositoryPaths = releaseRepositoryFiles();
const catalogPaths = manifest.files.map(({ path }) => path);
exact(
  catalogPaths,
  expectedRepositoryPaths,
  "repository catalog has extras, omissions, or non-deterministic ordering",
);
if (new Set(catalogPaths).size !== catalogPaths.length) {
  fail("repository catalog contains duplicate paths");
}

for (const entry of manifest.files) {
  if (
    entry === null ||
    typeof entry !== "object" ||
    Object.keys(entry).sort().join(",") !==
      "digest,packaged,path,role"
  ) {
    fail("file entry for " + (entry?.path ?? "<unknown>") + " has invalid fields");
  }
  if (entry.role !== roleFor(entry.path)) {
    fail(entry.path + " has a non-canonical role");
  }
  if (typeof entry.packaged !== "boolean") {
    fail(entry.path + " packaged must be boolean");
  }
  if (entry.digest !== rawDigest(entry.path)) {
    fail(entry.path + " raw-byte digest mismatch");
  }
}

const actualPackagePaths = npmPackPaths();
exact(
  actualPackagePaths,
  expectedPackagedPaths(manifest),
  "npm package set differs from packaged catalog entries plus the self-excluded catalog",
);

for (const expected of canonicalModules) {
  const definition = loadJson(expected.definition);
  if (
    definition.metadata?.id !== expected.id ||
    definition.metadata?.version !== expected.version
  ) {
    fail(expected.definition + " metadata does not match its canonical identity");
  }
  const actualOperations = (definition.operations ?? [])
    .map((operation) => ({
      id: operation.id,
      steps: (operation.adapterChain?.steps ?? []).map(({ id }) => id),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  exact(
    actualOperations,
    expected.operations,
    expected.definition + " operation/step surface changed",
  );
}

for (const expected of compatibilityModules) {
  const definition = loadJson(expected.definition);
  if (definition.metadata?.id !== expected.id || definition.metadata?.version !== expected.version) fail(expected.definition + " compatibility identity changed");
}
for (const expected of compatibilityPlugins) {
  const plugin = loadJson(expected.manifest);
  if (plugin.metadata?.id !== expected.id || plugin.metadata?.version !== expected.version || plugin.implements?.length !== 1) fail(expected.manifest + " compatibility identity changed");
  exact(plugin.implements[0].module, expected.module, expected.manifest + " compatibility owner changed");
}

const canonicalModuleIds = new Set(canonicalModules.map(({ id }) => id));
const canonicalModulePaths = matchingFiles(
  "examples/modules",
  ".module.json",
).flatMap((path) => {
  const definition = loadJson(path);
  return canonicalModuleIds.has(definition.metadata?.id)
    ? [{ id: definition.metadata.id, path }]
    : [];
});
exact(
  canonicalModulePaths.sort((left, right) =>
    comparePortablePaths(left.id + ":" + left.path, right.id + ":" + right.path),
  ),
  [...canonicalModules, ...compatibilityModules]
    .map(({ id, definition }) => ({ id, path: definition }))
    .sort((left, right) =>
      comparePortablePaths(left.id + ":" + left.path, right.id + ":" + right.path),
    ),
  "canonical module IDs must exist at exactly their declared paths",
);

const compatibilityPluginPaths = new Set(compatibilityPlugins.map(({ manifest }) => manifest));
const canonicalPluginIds = canonicalPlugins
  .map(({ id }) => id)
  .sort(comparePortablePaths);
const pluginsForCanonicalModules = [];
for (const path of matchingFiles("examples/plugins", ".plugin.json")) {
  if (compatibilityPluginPaths.has(path)) continue;
  const plugin = loadJson(path);
  if (
    (plugin.implements ?? []).some(({ module }) =>
      canonicalModuleIds.has(module?.id),
    )
  ) {
    pluginsForCanonicalModules.push(plugin.metadata?.id);
  }
}
exact(
  pluginsForCanonicalModules.sort(comparePortablePaths),
  canonicalPluginIds,
  "canonical modules have extra, missing, or duplicate plugin IDs",
);

for (const expected of canonicalPlugins) {
  const plugin = loadJson(expected.manifest);
  if (
    plugin.metadata?.id !== expected.id ||
    plugin.metadata?.version !== expected.version ||
    plugin.implements?.length !== 1
  ) {
    fail(expected.manifest + " metadata or implementation count changed");
  }
  const implementation = plugin.implements[0];
  exact(
    implementation.module,
    expected.module,
    expected.manifest + " module owner changed",
  );
  const actualBindings = (implementation.operations ?? [])
    .map(({ id, step, role }) => ({
      operation: id,
      step: step ?? null,
      ...(role ? { role } : {}),
    }))
    .sort((left, right) => {
      const leftKey = `${left.operation}:${left.step ?? ""}:${left.role ?? ""}`;
      const rightKey = `${right.operation}:${right.step ?? ""}:${right.role ?? ""}`;
      return leftKey.localeCompare(rightKey, "en");
    });
  exact(
    actualBindings,
    expected.bindings,
    expected.manifest + " operation/step/role bindings changed",
  );
}

console.log(
  "Release catalog verified: " +
    manifest.files.length +
    " exact repository digests, " +
    actualPackagePaths.length +
    " exact npm-package paths, " +
    canonicalModules.length +
    " active modules, " +
    canonicalPlugins.length +
    " active plugins, " +
    compatibilityModules.length +
    " compatibility modules, and " +
    compatibilityPlugins.length +
    " compatibility plugins.",
);
