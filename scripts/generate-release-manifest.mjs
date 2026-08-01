import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  canonicalModules,
  canonicalPlugins,
  excludedReleaseDirectories,
  npmPackPaths,
  rawDigest,
  releaseManifestPath,
  releaseManifestRelativePath,
  releaseRepositoryFiles,
  roleFor,
  sourceReleaseVersion,
  comparePortablePaths,
} from "./release-catalog.mjs";

const repositoryFiles = releaseRepositoryFiles();
const currentPackagePaths = new Set(npmPackPaths());
currentPackagePaths.delete(releaseManifestRelativePath);

for (const path of currentPackagePaths) {
  if (!repositoryFiles.includes(path)) {
    throw new Error(
      "npm package path is outside the release repository catalog: " + path,
    );
  }
}

const manifest = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ReleaseCatalog",
  metadata: {
    name: "devrelay",
    version: sourceReleaseVersion,
    releaseType: "private-source",
  },
  scope: {
    root: ".",
    inclusion: "all-regular-files-recursive",
    excludedDirectories: excludedReleaseDirectories,
    selfExclusion: {
      path: releaseManifestRelativePath,
      reason: "A release catalog cannot contain its own stable raw-byte digest.",
      npmPackaged: true,
    },
  },
  digestAlgorithm: "sha256-raw-bytes",
  modules: canonicalModules,
  plugins: canonicalPlugins,
  files: repositoryFiles.map((path) => ({
    path,
    role: roleFor(path),
    packaged: currentPackagePaths.has(path),
    digest: rawDigest(path),
  })),
};

mkdirSync(dirname(releaseManifestPath), { recursive: true });
writeFileSync(
  releaseManifestPath,
  JSON.stringify(manifest, null, 2) + "\n",
);

const finalPackagePaths = npmPackPaths();
const expectedPackagePaths = [
  ...manifest.files
    .filter(({ packaged }) => packaged)
    .map(({ path }) => path),
  releaseManifestRelativePath,
].sort(comparePortablePaths);
if (JSON.stringify(finalPackagePaths) !== JSON.stringify(expectedPackagePaths)) {
  throw new Error(
    "generated catalog package flags do not match npm pack; rerun after stabilizing package metadata",
  );
}

console.log(
  "Generated " +
    releaseManifestRelativePath +
    " with " +
    manifest.files.length +
    " raw-byte digests (" +
    finalPackagePaths.length +
    " npm-package files including the self-excluded catalog).",
);
