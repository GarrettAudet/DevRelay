import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { canonicalJsonDigest } from "../../src/content-digest.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) => execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
const tree = git("rev-parse", `${revision}^{tree}`);
const snapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: "C:/repos/DevRelay",
  revision,
  treeDigest: canonicalJsonDigest({ commit: revision, tree }),
  includedPaths: [
    ".agents/**", ".github/**", "AGENTS.md", "README.md", "contracts/**",
    "docs/**", "dogfood/**", "examples/**", "handoff/**", "openspec/**",
    "project/**", "release/**", "scripts/**", "src/**", "test/**",
    "CHANGELOG.md", "CONTRIBUTING.md", "LICENSE", "RELEASE.md", "SECURITY.md",
    "package.json", "package-lock.json"
  ],
  excludedPaths: [".git/**", "node_modules/**"]
};
await writeFile(new URL("repository-snapshot.json", import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ revision, treeDigest: snapshot.treeDigest }, null, 2)}\n`);
