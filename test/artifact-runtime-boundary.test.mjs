import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactRuntimeError,
  loadArtifactContent,
} from "../src/artifact-runtime.mjs";
import { sha256Digest } from "../src/content-digest.mjs";

function ref(bytes) {
  return {
    artifactId: "artifact-runtime-boundary",
    schema: "https://example.test/artifact/v1",
    mediaType: "application/json",
    digest: sha256Digest(bytes),
    uri: "artifact://test/artifact-runtime-boundary",
  };
}

async function expectRuntimeError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ArtifactRuntimeError);
    assert.equal(error.code, code);
    return true;
  });
}

test("authoritative artifact loaders must return bytes, never strings", async () => {
  const source = '{"kind":"Example"}\n';
  const bytes = Buffer.from(source, "utf8");
  await expectRuntimeError(
    loadArtifactContent(ref(bytes), {
      async load() {
        return source;
      },
    }),
    "DR2102",
  );
});

test("artifact JSON decoding rejects malformed UTF-8 after digest verification", async () => {
  const malformed = Buffer.from([0xc3, 0x28]);
  await expectRuntimeError(
    loadArtifactContent(ref(malformed), {
      async load() {
        return malformed;
      },
    }),
    "DR2106",
  );

  const wrongDigest = {
    ...ref(Buffer.from("different", "utf8")),
    artifactId: "wrong-digest-before-decode",
  };
  await expectRuntimeError(
    loadArtifactContent(wrongDigest, {
      async load() {
        return malformed;
      },
    }),
    "DR2103",
  );
});

test("a Uint8Array remains a valid raw-byte artifact source", async () => {
  const bytes = Buffer.from('{"kind":"Example"}\n', "utf8");
  const loaded = await loadArtifactContent(ref(bytes), {
    async load() {
      return new Uint8Array(bytes);
    },
  });
  assert.equal(loaded.value.kind, "Example");
});
