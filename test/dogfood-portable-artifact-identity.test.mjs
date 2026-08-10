import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import {
  repositoryArtifactUri,
  repositoryArtifactUriFromUrl,
  normalizeRepositoryArtifactUri,
} from "../dogfood/_support/repository-artifact-uri.mjs";

const ROOT = new URL("../", import.meta.url);
const MANIFEST = JSON.parse(
  await readFile(new URL("dogfood/_support/portable-artifact-digest-manifest.json", ROOT)),
);

test("repository artifact URI mapping is provider-neutral and rejects unsafe paths", () => {
  assert.equal(
    repositoryArtifactUri("project/project-contract-state.json"),
    "devrelay://repository/project/project-contract-state.json",
  );
  assert.equal(
    repositoryArtifactUriFromUrl(
      ROOT,
      new URL("dogfood/contract-generation/contract-generation/contract-draft-set.json", ROOT),
    ),
    "devrelay://repository/dogfood/contract-generation/contract-generation/contract-draft-set.json",
  );
  for (const unsafe of ["", "/absolute", "C:/absolute", "../escape", "a/../b", "a//b", "a\\b", "a?b", "a#b"]) {
    assert.throws(() => repositoryArtifactUri(unsafe));
  }
  assert.throws(() => repositoryArtifactUriFromUrl(ROOT, new URL("../outside.json", ROOT)));
  assert.equal(
    normalizeRepositoryArtifactUri("file:///C:/tmp/DevRelay-v04-work-dependency-analysis/project/contract-baseline.json"),
    "devrelay://repository/project/contract-baseline.json",
  );
  for (const unrelated of [
    "file:///C:/unrelated/project/contract-baseline.json",
    "file:///D:/scratch/dogfood/result.json",
    "file:///C:/users/example/test/output.json",
  ]) {
    assert.throws(() => normalizeRepositoryArtifactUri(unrelated), /not repository-owned/);
  }
});

test("portable candidate and replay bytes match the fixed cross-root digest manifest", async () => {
  const checkoutRoot = decodeURIComponent(ROOT.pathname).replace(/^\/[A-Za-z]:/, (value) => value.slice(1));
  const normalizedRoot = checkoutRoot.replaceAll("\\", "/").replace(/\/$/, "");
  for (const artifact of MANIFEST.artifacts) {
    const bytes = await readFile(new URL(artifact.path, ROOT));
    assert.equal(sha256Digest(bytes), artifact.digest, artifact.path);
    const text = bytes.toString("utf8").replaceAll("\\", "/");
    assert.equal(text.includes("file:///"), false, `${artifact.path} contains a local file URI`);
    assert.equal(text.includes(normalizedRoot), false, `${artifact.path} leaks the checkout root`);
  }
});
