import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const SECRET_PATTERNS = Object.freeze([
  { kind: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { kind: "github-token", pattern: /\b(?:gh[opsu]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/u },
  { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { kind: "credential-assignment", pattern: /\b(?:password|passwd|api[_-]?key|secret)\s*[:=]\s*["']?[^\s"']{8,}/iu },
]);

export class ReleaseEvidenceAssetError extends Error {
  constructor(message, code = "DR4720") {
    super(`release evidence asset: ${message}`);
    this.name = "ReleaseEvidenceAssetError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new ReleaseEvidenceAssetError(message, code);
};
const freeze = (value) => {
  const copy = structuredClone(value);
  const visit = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) visit(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return visit(copy);
};
const bytesOf = (bytes, label) => {
  if (!(bytes instanceof Uint8Array)) fail(`${label} bytes must be a Uint8Array`);
  return Buffer.from(bytes);
};

export function scanReleaseEvidenceSecrets(bytes) {
  const exact = bytesOf(bytes, "evidence");
  const text = exact.toString("utf8");
  return freeze(
    SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ kind }) => ({
      kind,
      disposition: "blocked",
    })),
  );
}

function normalizeAsset(asset) {
  if (!SAFE_NAME.test(asset?.name ?? "")) fail("asset name is invalid");
  if (typeof asset.mediaType !== "string" || !asset.mediaType.includes("/")) {
    fail(`asset ${asset.name} media type is required`);
  }
  if (typeof asset.provenance !== "object" || asset.provenance === null) {
    fail(`asset ${asset.name} provenance is required`);
  }
  const bytes = bytesOf(asset.bytes, `asset ${asset.name}`);
  const findings = scanReleaseEvidenceSecrets(bytes);
  if (findings.length > 0) fail(`asset ${asset.name} contains blocked secret material`, "DR4721");
  return {
    name: asset.name,
    mediaType: asset.mediaType,
    digest: sha256Digest(bytes),
    byteCount: bytes.byteLength,
    provenance: structuredClone(asset.provenance),
  };
}

export function createReleaseEvidenceManifest({
  candidateId,
  release,
  assets,
  channel = "preview",
  reviewApproval,
}) {
  if (typeof candidateId !== "string" || candidateId.length === 0) fail("candidateId is required");
  if (!release || typeof release.tag !== "string" || !/^[0-9a-f]{40}$/u.test(release.targetCommit ?? "")) {
    fail("release tag and exact 40-character target commit are required");
  }
  if (!Array.isArray(assets) || assets.length === 0) fail("at least one evidence asset is required");
  if (!new Set(["preview", "stable"]).has(channel)) fail("channel must be preview or stable");
  const entries = assets.map(normalizeAsset).sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (new Set(entries.map(({ name }) => name)).size !== entries.length) fail("asset names must be unique");
  const candidateDigest = canonicalJsonDigest({ candidateId, release, entries });
  if (channel === "stable") {
    if (
      reviewApproval?.outcome !== "approved" ||
      reviewApproval.candidateDigest !== candidateDigest ||
      reviewApproval.reviewer === reviewApproval.producer
    ) {
      fail("stable evidence requires independent exact-candidate review approval", "DR4722");
    }
  }
  const body = {
    candidateId,
    release: { tag: release.tag, targetCommit: release.targetCommit },
    channel,
    assets: entries,
    candidateDigest,
    reviewDisposition:
      channel === "stable"
        ? { outcome: "approved", reviewer: reviewApproval.reviewer, approvalDigest: reviewApproval.approvalDigest }
        : { outcome: "preview-not-independently-approved" },
    historyPolicy: "append-only-no-replacement",
  };
  return freeze({
    apiVersion: API_VERSION,
    kind: "ReleaseEvidenceManifest",
    ...body,
    manifestDigest: canonicalJsonDigest(body),
  });
}

export function createReleaseEvidenceUploadRequest({ manifest, repository, replaceExisting = false }) {
  if (manifest?.kind !== "ReleaseEvidenceManifest" || !DIGEST.test(manifest.manifestDigest ?? "")) {
    fail("valid evidence manifest is required");
  }
  if (replaceExisting) fail("release evidence history cannot be rewritten", "DR4723");
  if (typeof repository !== "string" || !/^[^/]+\/[^/]+$/u.test(repository)) fail("GitHub owner/repository is required");
  const body = {
    repository,
    tag: manifest.release.tag,
    targetCommit: manifest.release.targetCommit,
    manifest: { artifactId: manifest.candidateId, digest: manifest.manifestDigest },
    assets: manifest.assets,
    immutable: true,
    overwrite: false,
  };
  return freeze({
    apiVersion: API_VERSION,
    kind: "GitHubReleaseAssetUploadRequest",
    ...body,
    requestDigest: canonicalJsonDigest(body),
  });
}

export async function verifyReleaseEvidenceRetrieval({ manifest, retrieve }) {
  if (manifest?.kind !== "ReleaseEvidenceManifest" || typeof retrieve !== "function") {
    fail("manifest and retrieval function are required");
  }
  const results = [];
  for (const expected of manifest.assets) {
    const observed = await retrieve(expected.name);
    if (!observed) fail(`asset ${expected.name} is unavailable`, "DR4724");
    if (observed.mediaType !== expected.mediaType) fail(`asset ${expected.name} media type changed`, "DR4724");
    const bytes = bytesOf(observed.bytes, `retrieved asset ${expected.name}`);
    const digest = sha256Digest(bytes);
    if (digest !== expected.digest || bytes.byteLength !== expected.byteCount) {
      fail(`asset ${expected.name} bytes changed`, "DR4724");
    }
    results.push({ name: expected.name, mediaType: expected.mediaType, digest, byteCount: bytes.byteLength });
  }
  const body = {
    candidateId: manifest.candidateId,
    manifestDigest: manifest.manifestDigest,
    release: manifest.release,
    results,
    outcome: "verified",
  };
  return freeze({
    apiVersion: API_VERSION,
    kind: "ReleaseEvidenceRetrievalReceipt",
    ...body,
    receiptDigest: canonicalJsonDigest(body),
  });
}

