import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

test("DevRelay canonical JSON ignores object key order, not array order", () => {
  const first = {
    z: [1, 2],
    a: {
      second: true,
      first: "value",
    },
  };
  const reorderedKeys = {
    a: {
      first: "value",
      second: true,
    },
    z: [1, 2],
  };
  const reorderedArray = {
    a: {
      first: "value",
      second: true,
    },
    z: [2, 1],
  };

  assert.equal(canonicalJson(first), canonicalJson(reorderedKeys));
  assert.equal(
    canonicalJsonDigest(first),
    canonicalJsonDigest(reorderedKeys),
  );
  assert.notEqual(
    canonicalJsonDigest(first),
    canonicalJsonDigest(reorderedArray),
  );
});

test("raw byte and canonical JSON digests use explicit sha256 identity", () => {
  assert.equal(
    sha256Digest(Buffer.from("DevRelay", "utf8")),
    "sha256:6d763a909d8b9b50f8809270fb79652b98c004d46eab63528f7a56b482ac683d",
  );
});

test("change-set expectedRequirementsDigest binds the complete canonical baseline body", async () => {
  const [baseline, changeSet] = await Promise.all([
    readJson("examples/artifacts/requirements-baseline-001.json"),
    readJson("examples/artifacts/requirements-change-set-001.json"),
  ]);

  assert.equal(
    changeSet.expectedRequirementsDigest,
    canonicalJsonDigest(baseline.requirements),
  );
});
