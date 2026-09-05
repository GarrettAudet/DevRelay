import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  RELEASE_PREPARATION_ARTIFACT_CONTRACTS,
  validateReleasePreparationArtifact,
  withReleasePreparationContentDigest,
} from "./release-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const EMPTY_DIGEST = sha256Digest(Buffer.alloc(0));
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/u;
const REQUIRED_KINDS = Object.freeze([
  "installable-tarball",
  "release-catalog",
  "cyclonedx-sbom",
  "sha256-ledger",
  "release-notes",
  "license-notice",
  "evidence-index",
]);

export class ReleasePreparationMaterializationError extends Error {
  constructor(message, code = "DR5520") {
    super(`release preparation materialization failed: ${message}`);
    this.name = "ReleasePreparationMaterializationError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new ReleasePreparationMaterializationError(message, code);
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
const sameRef = (left, right) => Boolean(
  left && right && left.artifactId === right.artifactId && left.schema === right.schema &&
  left.mediaType === right.mediaType && left.digest === right.digest && left.uri === right.uri,
);
const bytes = (value, label) => {
  if (!(value instanceof Uint8Array)) fail(`${label} must be exact bytes`);
  return Buffer.from(value);
};
const safePath = (value) => {
  const path = String(value ?? "").replaceAll("\\", "/");
  if (!SAFE_PATH.test(path) || path.startsWith(".git/") || path.startsWith("node_modules/") || path === ".git" || path === "node_modules") {
    fail(`unsafe or excluded package path ${JSON.stringify(value)}`);
  }
  return path;
};

function octal(value, width) {
  const text = value.toString(8);
  if (text.length > width - 1) fail("tar entry exceeds the deterministic ustar numeric boundary");
  return `${text.padStart(width - 1, "0")}\0`;
}

function tarName(path) {
  const name = `package/${path}`;
  if (Buffer.byteLength(name) <= 100) return { name, prefix: "" };
  for (let index = name.lastIndexOf("/"); index > 0; index = name.lastIndexOf("/", index - 1)) {
    const prefix = name.slice(0, index);
    const leaf = name.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(leaf) <= 100) return { name: leaf, prefix };
  }
  fail(`package path cannot be represented by deterministic ustar: ${path}`);
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  const fields = tarName(path);
  header.write(fields.name, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, 8, "ascii");
  header.write(octal(0, 8), 108, 8, "ascii");
  header.write(octal(0, 8), 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(0, 12), 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 4, "ascii");
  header.write("root", 297, 4, "ascii");
  if (fields.prefix) header.write(fields.prefix, 345, 155, "utf8");
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

export function createDeterministicNpmTarball(packageFiles) {
  if (!Array.isArray(packageFiles) || packageFiles.length === 0) fail("at least one package file is required");
  const normalized = packageFiles.map((entry) => ({ path: safePath(entry.path), bytes: bytes(entry.bytes, entry.path) }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (new Set(normalized.map(({ path }) => path)).size !== normalized.length) fail("package paths must be unique");
  const chunks = [];
  for (const entry of normalized) {
    chunks.push(tarHeader(entry.path, entry.bytes.byteLength), entry.bytes);
    const padding = (512 - (entry.bytes.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

export function createInMemoryReleaseArtifactStore() {
  const values = new Map();
  return {
    put(exactBytes, metadata) {
      const stored = bytes(exactBytes, metadata?.artifactId ?? "artifact");
      const digest = sha256Digest(stored);
      const prior = values.get(digest);
      if (prior && !prior.bytes.equals(stored)) fail("content-addressed artifact collision", "DR5521");
      const ref = {
        artifactId: metadata.artifactId,
        schema: metadata.schema,
        mediaType: metadata.mediaType,
        digest,
        uri: `memory://devrelay/release-preparation/${encodeURIComponent(metadata.artifactId)}/${digest.slice(7)}`,
      };
      values.set(digest, { bytes: stored, ref });
      return freeze(ref);
    },
    read(ref) {
      const found = values.get(ref?.digest);
      if (!found || !sameRef(found.ref, ref)) fail(`artifact ${ref?.artifactId ?? "unknown"} is missing or substituted`, "DR5521");
      return Buffer.from(found.bytes);
    },
    get size() { return values.size; },
  };
}

export function createInMemoryReleaseMaterializationCheckpointStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) {
      if (values.has(key)) fail(`checkpoint ${key} is immutable`, "DR5522");
      values.set(key, structuredClone(value));
    },
  };
}

export function createNativeNodeWindowsReleaseHost({
  root,
  packagePaths,
  readFile = (path) => readFileSync(resolve(root, path)),
  platform = process.platform,
  maturity = "fixture-conformant",
} = {}) {
  if (platform !== "win32") fail("native V1 release host requires Windows", "DR5523");
  if (typeof root !== "string" || root.length === 0) fail("release host root is required", "DR5523");
  if (!Array.isArray(packagePaths) || packagePaths.length === 0) fail("release host requires an exact package path set", "DR5523");
  const paths = packagePaths.map(safePath).sort((left, right) => left.localeCompare(right, "en"));
  if (new Set(paths).size !== paths.length) fail("release host package paths are ambiguous", "DR5523");
  const descriptor = freeze({ id: "native.node-windows-release-materializer", version: "1.0.0", maturity });
  const configurationDigest = canonicalJsonDigest({ root: root.replaceAll("\\", "/"), packagePaths: paths, platform });
  return Object.freeze({
    descriptor,
    configurationDigest,
    async capture() {
      const files = paths.map((path) => ({ path, bytes: bytes(readFile(path), path) }));
      const byPath = new Map(files.map((entry) => [entry.path, entry.bytes]));
      for (const required of ["package.json", "RELEASE.md", "LICENSE", "NOTICE"]) {
        if (!byPath.has(required)) fail(`package path set omits ${required}`, "DR5523");
      }
      let packageDocument;
      try { packageDocument = JSON.parse(byPath.get("package.json").toString("utf8")); }
      catch { fail("package.json is not valid UTF-8 JSON", "DR5523"); }
      return { files, packageDocument, releaseNotes: byPath.get("RELEASE.md"), license: byPath.get("LICENSE"), notice: byPath.get("NOTICE") };
    },
  });
}

function artifactMetadata(kind, version) {
  const metadata = {
    "installable-tarball": [`devrelay-${version}.tgz`, "application/gzip"],
    "release-catalog": ["release-catalog.json", "application/vnd.devrelay.release-catalog+json"],
    "cyclonedx-sbom": ["devrelay.cdx.json", "application/vnd.cyclonedx+json"],
    "sha256-ledger": ["SHA256SUMS", "text/plain"],
    "release-notes": ["RELEASE.md", "text/markdown"],
    "license-notice": ["LICENSE-NOTICE.txt", "text/plain"],
    "evidence-index": ["release-evidence-index.json", "application/vnd.devrelay.release-evidence-index+json"],
  }[kind];
  return { artifactId: `RP-${kind.toUpperCase()}-${version}`, schema: "https://devrelay.dev/artifacts/release-candidate-file/v1", mediaType: metadata[1], name: metadata[0] };
}

function storeArtifact(store, kind, version, exactBytes) {
  const metadata = artifactMetadata(kind, version);
  const ref = store.put(exactBytes, metadata);
  return { id: metadata.artifactId, kind, name: metadata.name, artifact: ref, bytes: Buffer.from(exactBytes) };
}

function validateCheckpoint(checkpoint, expected, store) {
  if (!checkpoint || checkpoint.kind !== "ReleaseMaterializationCheckpoint") fail("checkpoint is malformed", "DR5522");
  const { checkpointDigest, ...body } = checkpoint;
  if (canonicalJsonDigest(body) !== checkpointDigest || checkpoint.invocationFingerprint !== expected) fail("checkpoint identity or digest drifted", "DR5522");
  for (const artifact of checkpoint.storedArtifacts) {
    const exact = Buffer.from(artifact.bytesBase64, "base64");
    if (exact.toString("base64") !== artifact.bytesBase64 || sha256Digest(exact) !== artifact.ref.digest || !store.read(artifact.ref).equals(exact)) {
      fail("checkpoint contains substituted artifact bytes", "DR5522");
    }
  }
  validateReleasePreparationArtifact(checkpoint.receipt.value, { attempt: checkpoint.attempt, attemptRef: checkpoint.attemptRef });
  validateReleasePreparationArtifact(checkpoint.candidate.value, { attempt: checkpoint.attempt, attemptRef: checkpoint.attemptRef });
  return checkpoint;
}

export async function materializeNativeReleaseCandidate({ invocationId, attempt, attemptRef, host, artifactStore, checkpoints }) {
  validateReleasePreparationArtifact(attempt, { ref: attemptRef });
  if (typeof invocationId !== "string" || invocationId.length === 0) fail("invocationId is required");
  if (!host?.descriptor || typeof host.capture !== "function" || typeof host.configurationDigest !== "string") fail("a configured native host is required");
  if (!artifactStore?.put || !artifactStore?.read) fail("a content-addressed artifact store is required");
  if (!checkpoints?.get || !checkpoints?.put) fail("an immutable checkpoint store is required");
  const invocationFingerprint = canonicalJsonDigest({ invocationId, attempt: attemptRef, host: host.descriptor, configurationDigest: host.configurationDigest });
  const checkpointKey = `release-preparation/${invocationId}/${invocationFingerprint}`;
  const existing = await checkpoints.get(checkpointKey);
  if (existing) {
    const checkpoint = validateCheckpoint(existing, invocationFingerprint, artifactStore);
    return freeze({ invocationId, invocationFingerprint, checkpointKey, replayed: true, effectCalls: 0, receipt: checkpoint.receipt.value, receiptRef: checkpoint.receipt.ref, candidate: checkpoint.candidate.value, candidateRef: checkpoint.candidate.ref });
  }

  const captured = await host.capture();
  if (captured.packageDocument?.name !== "devrelay" || captured.packageDocument?.version !== attempt.packageVersion) {
    fail("package metadata differs from the exact release attempt", "DR5524");
  }
  const files = captured.files.map((entry) => ({ path: safePath(entry.path), bytes: bytes(entry.bytes, entry.path) })).sort((left, right) => left.path.localeCompare(right.path, "en"));
  const tarball = storeArtifact(artifactStore, "installable-tarball", attempt.packageVersion, createDeterministicNpmTarball(files));
  const catalogValue = {
    apiVersion: API,
    kind: "ReleaseCatalog",
    package: { name: "devrelay", version: attempt.packageVersion },
    source: attempt.source,
    files: files.map((entry) => ({ path: entry.path, digest: sha256Digest(entry.bytes), byteCount: entry.bytes.byteLength })),
  };
  const catalog = storeArtifact(artifactStore, "release-catalog", attempt.packageVersion, Buffer.from(canonicalJson(catalogValue), "utf8"));
  const dependencies = Object.entries(captured.packageDocument.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right, "en"));
  const sbomValue = {
    bomFormat: "CycloneDX", specVersion: "1.6", version: 1,
    metadata: { component: { type: "library", name: "devrelay", version: attempt.packageVersion, bomRef: `pkg:npm/devrelay@${attempt.packageVersion}` } },
    components: dependencies.map(([name, version]) => ({ type: "library", name, version, purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}` })),
  };
  const sbom = storeArtifact(artifactStore, "cyclonedx-sbom", attempt.packageVersion, Buffer.from(canonicalJson(sbomValue), "utf8"));
  const notes = storeArtifact(artifactStore, "release-notes", attempt.packageVersion, captured.releaseNotes);
  const legalBytes = Buffer.concat([bytes(captured.license, "LICENSE"), Buffer.from("\n\n--- NOTICE ---\n\n", "utf8"), bytes(captured.notice, "NOTICE")]);
  const legal = storeArtifact(artifactStore, "license-notice", attempt.packageVersion, legalBytes);
  const preLedger = [tarball, catalog, sbom, notes, legal];
  const ledgerBytes = Buffer.from(`${preLedger.map((entry) => `${entry.artifact.digest.slice(7)}  ${entry.name}`).join("\n")}\n`, "utf8");
  const ledger = storeArtifact(artifactStore, "sha256-ledger", attempt.packageVersion, ledgerBytes);
  const operations = [{ operation: "deterministic-node-pack", fingerprint: canonicalJsonDigest({ host: host.descriptor, configurationDigest: host.configurationDigest, files: catalogValue.files }), exitCode: 0, durationMs: 0, stdoutDigest: EMPTY_DIGEST, stderrDigest: EMPTY_DIGEST }];
  const evidenceValue = { apiVersion: API, kind: "ReleaseEvidenceIndex", invocationId, invocationFingerprint, attempt: attemptRef, adapter: host.descriptor, configurationDigest: host.configurationDigest, operations, artifacts: [...preLedger, ledger].map(({ kind, name, artifact }) => ({ kind, name, artifact })) };
  const evidence = storeArtifact(artifactStore, "evidence-index", attempt.packageVersion, Buffer.from(canonicalJson(evidenceValue), "utf8"));
  const artifacts = [tarball, catalog, sbom, ledger, notes, legal, evidence].sort((left, right) => REQUIRED_KINDS.indexOf(left.kind) - REQUIRED_KINDS.indexOf(right.kind));
  const preparedDigest = canonicalJsonDigest({ invocationFingerprint, artifacts: artifacts.map(({ kind, artifact }) => ({ kind, artifact })) });
  const receipt = withReleasePreparationContentDigest({
    apiVersion: API, kind: "ReleaseMaterializationReceipt", receiptId: `RMR-${invocationFingerprint.slice(7, 23).toUpperCase()}`,
    attempt: attemptRef, adapter: host.descriptor,
    grants: [{ kind: "filesystem.read", scope: "exact-package-path-set", purpose: "read exact candidate source bytes" }],
    commands: operations.map(({ fingerprint, exitCode, durationMs, stdoutDigest, stderrDigest }) => ({ fingerprint, exitCode, durationMs, stdoutDigest, stderrDigest })),
    artifacts: artifacts.map(({ artifact }) => artifact), publicationEffects: [], replayed: false, checkpointKey, durationMs: 0,
    evidence: [evidence.artifact], diagnostics: [],
  });
  validateReleasePreparationArtifact(receipt, { attempt, attemptRef });
  const receiptContract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseMaterializationReceipt;
  const receiptBytes = Buffer.from(canonicalJson(receipt), "utf8");
  const receiptRef = artifactStore.put(receiptBytes, { artifactId: receipt.receiptId, ...receiptContract });
  const candidate = withReleasePreparationContentDigest({
    apiVersion: API, kind: "ReleaseCandidate", candidateId: `RC-${preparedDigest.slice(7, 23).toUpperCase()}`,
    attempt: attemptRef, source: attempt.source, packageVersion: attempt.packageVersion,
    artifacts: artifacts.map(({ id, kind, artifact }) => ({ id, kind, artifact })), materializationReceipts: [receiptRef], checkpointDigest: preparedDigest,
    sourceRefs: attempt.sourceRefs,
  });
  validateReleasePreparationArtifact(candidate, { attempt, attemptRef });
  const candidateContract = RELEASE_PREPARATION_ARTIFACT_CONTRACTS.ReleaseCandidate;
  const candidateBytes = Buffer.from(canonicalJson(candidate), "utf8");
  const candidateRef = artifactStore.put(candidateBytes, { artifactId: candidate.candidateId, ...candidateContract });
  const storedArtifacts = [...artifacts.map(({ artifact, bytes: exact }) => ({ ref: artifact, bytesBase64: exact.toString("base64") })), { ref: receiptRef, bytesBase64: receiptBytes.toString("base64") }, { ref: candidateRef, bytesBase64: candidateBytes.toString("base64") }];
  const checkpointBody = { apiVersion: API, kind: "ReleaseMaterializationCheckpoint", checkpointKey, invocationId, invocationFingerprint, preparedDigest, attempt: structuredClone(attempt), attemptRef: structuredClone(attemptRef), storedArtifacts, receipt: { value: receipt, ref: receiptRef }, candidate: { value: candidate, ref: candidateRef } };
  const checkpoint = { ...checkpointBody, checkpointDigest: canonicalJsonDigest(checkpointBody) };
  await checkpoints.put(checkpointKey, checkpoint);
  return freeze({ invocationId, invocationFingerprint, checkpointKey, replayed: false, effectCalls: 1, receipt, receiptRef, candidate, candidateRef });
}
