import assert from "node:assert/strict";
import test from "node:test";
import {
  releaseManifestRelativePath,
  releaseRepositoryFiles,
} from "../scripts/release-catalog.mjs";

test("release inventory excludes Git administration in directories and linked worktrees", () => {
  const files = releaseRepositoryFiles();
  assert.equal(files.includes(".git"), false);
  assert.equal(files.some((path) => path.startsWith(".git/")), false);
  assert.equal(files.includes(releaseManifestRelativePath), false);
});
