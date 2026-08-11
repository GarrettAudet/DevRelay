import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const immutableCrLfArtifacts = new Map([
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-CONTRACTS.revision-004.receipt.json",
    "4e8fe70cb0da47ac335eda220449532b70f419291e0f064f364a9dda515c4da3",
  ],
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-EVIDENCE-NORMALIZATION.revision-002.receipt.json",
    "6b8b620e13bfe5cc919cd094a593c1a1fb29723313b903410a1a3902b10c684f",
  ],
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-VERIFIER-ADAPTERS.revision-003.receipt.json",
    "c90e2b70656aa4c0e52b3460cf7bf11cd6de96c713f8aa34fb8040017f5a3a0b",
  ],
  [
    "dogfood/work-item-verification/execution/task-contracts/WI-WIV-CONTRACTS.attempt-005.task.json",
    "6777959778d00829e81e1cfd90a8379ea01d03884e49440376991b3c8b0523fa",
  ],
  [
    "dogfood/work-item-verification/execution/task-contracts/WI-WIV-POLICY-GATE.attempt-001.task.json",
    "0f90bf51be7ad18a8cce81d0daba662b68fcbd67d2b18aee9fcb39f26348bc33",
  ],
]);

test("approval-bound CRLF artifacts retain exact raw bytes on every checkout", () => {
  const attributes = readFileSync(resolve(".gitattributes"), "utf8");
  for (const [path, expectedDigest] of immutableCrLfArtifacts) {
    assert.equal(attributes.includes(`${path} -text`), true);
    const bytes = readFileSync(resolve(path));
    assert.equal(bytes.includes(13), true);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedDigest);
  }
});