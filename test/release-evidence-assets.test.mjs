import assert from "node:assert/strict";
import test from "node:test";

import {
  ReleaseEvidenceAssetError,
  createReleaseEvidenceManifest,
  createReleaseEvidenceUploadRequest,
  scanReleaseEvidenceSecrets,
  verifyReleaseEvidenceRetrieval,
} from "../src/release-evidence-assets.mjs";

const commit = "a".repeat(40);
const asset = (name = "evidence.json", text = '{"outcome":"pass"}') => ({
  name,
  mediaType: "application/json",
  bytes: Buffer.from(text),
  provenance: { runId: "RUN-1", artifactId: name },
});
const preview = () =>
  createReleaseEvidenceManifest({
    candidateId: "CANDIDATE-1",
    release: { tag: "v1.0.0-preview.1", targetCommit: commit },
    assets: [asset()],
  });

test("creates a deterministic preview manifest with exact digest, size, media type, and provenance", () => {
  const first = preview();
  const second = preview();
  assert.deepEqual(first, second);
  assert.equal(first.assets[0].byteCount, 18);
  assert.match(first.assets[0].digest, /^sha256:/u);
  assert.equal(first.channel, "preview");
});

test("stable manifests require independent approval bound to the exact candidate", () => {
  const candidate = preview();
  const stable = createReleaseEvidenceManifest({
    candidateId: candidate.candidateId,
    release: candidate.release,
    assets: [asset()],
    channel: "stable",
    reviewApproval: {
      outcome: "approved",
      candidateDigest: candidate.candidateDigest,
      reviewer: "reviewer",
      producer: "producer",
      approvalDigest: `sha256:${"b".repeat(64)}`,
    },
  });
  assert.equal(stable.reviewDisposition.outcome, "approved");
  assert.throws(
    () => createReleaseEvidenceManifest({ candidateId: "CANDIDATE-1", release: candidate.release, assets: [asset()], channel: "stable" }),
    ReleaseEvidenceAssetError,
  );
});

test("rejects secret-bearing evidence", () => {
  assert.equal(scanReleaseEvidenceSecrets(Buffer.from("password=supersecretvalue"))[0].kind, "credential-assignment");
  assert.throws(
    () => createReleaseEvidenceManifest({ candidateId: "C", release: { tag: "v1", targetCommit: commit }, assets: [asset("bad.txt", "github_pat_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456")] }),
    /blocked secret material/u,
  );
});

test("rejects missing media type, duplicate names, and invalid release identity", () => {
  assert.throws(() => createReleaseEvidenceManifest({ candidateId: "C", release: { tag: "v1", targetCommit: commit }, assets: [{ ...asset(), mediaType: "" }] }));
  assert.throws(() => createReleaseEvidenceManifest({ candidateId: "C", release: { tag: "v1", targetCommit: commit }, assets: [asset(), asset()] }), /unique/u);
  assert.throws(() => createReleaseEvidenceManifest({ candidateId: "C", release: { tag: "v1", targetCommit: "HEAD" }, assets: [asset()] }), /exact 40-character/u);
});

test("upload request is append-only and rejects history rewrite", () => {
  const manifest = preview();
  const request = createReleaseEvidenceUploadRequest({ manifest, repository: "GarrettAudet/DevRelay" });
  assert.equal(request.immutable, true);
  assert.equal(request.overwrite, false);
  assert.throws(() => createReleaseEvidenceUploadRequest({ manifest, repository: "GarrettAudet/DevRelay", replaceExisting: true }), /cannot be rewritten/u);
});

test("clean retrieval verifies every exact byte and media type", async () => {
  const manifest = preview();
  const receipt = await verifyReleaseEvidenceRetrieval({
    manifest,
    retrieve: async () => ({ mediaType: "application/json", bytes: asset().bytes }),
  });
  assert.equal(receipt.outcome, "verified");
  assert.equal(receipt.results[0].digest, manifest.assets[0].digest);
});

test("retrieval fails closed on missing, stale, or wrong-media assets", async () => {
  const manifest = preview();
  await assert.rejects(() => verifyReleaseEvidenceRetrieval({ manifest, retrieve: async () => undefined }), /unavailable/u);
  await assert.rejects(() => verifyReleaseEvidenceRetrieval({ manifest, retrieve: async () => ({ mediaType: "text/plain", bytes: asset().bytes }) }), /media type changed/u);
  await assert.rejects(() => verifyReleaseEvidenceRetrieval({ manifest, retrieve: async () => ({ mediaType: "application/json", bytes: Buffer.from("stale") }) }), /bytes changed/u);
});
