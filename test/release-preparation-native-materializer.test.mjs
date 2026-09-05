import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { withReleasePreparationContentDigest } from "../src/release-preparation-artifact-validator.mjs";
import {
  ReleasePreparationMaterializationError,
  createDeterministicNpmTarball,
  createInMemoryReleaseArtifactStore,
  createInMemoryReleaseMaterializationCheckpointStore,
  createNativeNodeWindowsReleaseHost,
  materializeNativeReleaseCandidate,
} from "../src/release-preparation-native-materializer.mjs";

const API = "devrelay.dev/v1alpha1";
const D = (value) => canonicalJsonDigest(value);
const ref = (artifactId, schema = `https://devrelay.dev/artifacts/${artifactId.toLowerCase()}/v1`, mediaType = "application/json", digest = D(artifactId)) => ({ artifactId, schema, mediaType, digest, uri: `memory://fixture/${artifactId}` });
const attempt = withReleasePreparationContentDigest({ apiVersion: API, kind: "ReleasePreparationAttempt", attemptId: "RPA-NATIVE", source: { commit: "a".repeat(40), tree: D("tree") }, baselines: [ref("REQ")], packageVersion: "0.10.0-rc.3", releaseConfigurationDigest: D("config"), toolchain: [{ id: "node", version: "22.18.0", digest: D("node") }], environmentReadinessReceipt: ref("ENV"), ownerIntent: ref("OWNER"), fingerprint: D("attempt"), sourceRefs: [{ role: "requirements", artifact: ref("REQ") }] });
const attemptBytes = Buffer.from(canonicalJson(attempt), "utf8");
const attemptRef = ref(attempt.attemptId, "https://devrelay.dev/artifacts/release-preparation-attempt/v1", "application/vnd.devrelay.release-preparation-attempt+json", sha256Digest(attemptBytes));
const fileMap = new Map([
  ["package.json", Buffer.from(canonicalJson({ name: "devrelay", version: "0.10.0-rc.3", dependencies: { ajv: "8.20.0", graphology: "0.26.0" } }), "utf8")],
  ["src/index.mjs", Buffer.from("export const ready = true;\n", "utf8")],
  ["RELEASE.md", Buffer.from("# Release\n\nDeterministic candidate.\n", "utf8")],
  ["LICENSE", Buffer.from("Apache License 2.0\n", "utf8")],
  ["NOTICE", Buffer.from("DevRelay notice\n", "utf8")],
]);
const packagePaths = [...fileMap.keys()];
const makeHost = (overrides = {}) => createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths, readFile: (path) => fileMap.get(path), platform: "win32", ...overrides });
const run = (overrides = {}) => materializeNativeReleaseCandidate({ invocationId: "RP-MATERIALIZE-001", attempt, attemptRef, host: makeHost(), artifactStore: createInMemoryReleaseArtifactStore(), checkpoints: createInMemoryReleaseMaterializationCheckpointStore(), ...overrides });

test("deterministic native materialization produces the complete exact candidate set", async () => {
  const first = await run();
  const second = await run();
  assert.deepEqual(first.candidate, second.candidate);
  assert.deepEqual(first.candidate.artifacts.map(({ kind }) => kind), ["installable-tarball", "release-catalog", "cyclonedx-sbom", "sha256-ledger", "release-notes", "license-notice", "evidence-index"]);
  assert.equal(first.receipt.publicationEffects.length, 0);
  assert.equal(first.receipt.adapter.id, "native.node-windows-release-materializer");
});

test("deterministic tarball has stable gzip and ustar bytes independent of input order", () => {
  const entries = packagePaths.map((path) => ({ path, bytes: fileMap.get(path) }));
  const first = createDeterministicNpmTarball(entries);
  const second = createDeterministicNpmTarball([...entries].reverse());
  assert.deepEqual(first, second);
  const tar = gunzipSync(first);
  assert.equal(tar.subarray(257, 263).toString("ascii"), "ustar\0");
  assert.equal(tar.subarray(0, 20).toString("utf8").startsWith("package/LICENSE"), true);
});

test("checkpoint replay performs zero host calls and returns the exact stored candidate", async () => {
  let calls = 0;
  const base = makeHost();
  const host = { ...base, capture: async () => { calls += 1; return base.capture(); } };
  const artifactStore = createInMemoryReleaseArtifactStore();
  const checkpoints = createInMemoryReleaseMaterializationCheckpointStore();
  const input = { invocationId: "RP-REPLAY", attempt, attemptRef, host, artifactStore, checkpoints };
  const first = await materializeNativeReleaseCandidate(input);
  const replay = await materializeNativeReleaseCandidate(input);
  assert.equal(calls, 1);
  assert.equal(first.effectCalls, 1);
  assert.equal(replay.effectCalls, 0);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.candidate, first.candidate);
});

test("catalog, CycloneDX SBOM, ledger, legal, and evidence index bind exact stored bytes", async () => {
  const store = createInMemoryReleaseArtifactStore();
  const result = await run({ artifactStore: store });
  const byKind = new Map(result.candidate.artifacts.map((entry) => [entry.kind, entry.artifact]));
  const catalog = JSON.parse(store.read(byKind.get("release-catalog")));
  const sbom = JSON.parse(store.read(byKind.get("cyclonedx-sbom")));
  const ledger = store.read(byKind.get("sha256-ledger")).toString("utf8");
  const legal = store.read(byKind.get("license-notice")).toString("utf8");
  const evidence = JSON.parse(store.read(byKind.get("evidence-index")));
  assert.equal(catalog.files.length, packagePaths.length);
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.equal(sbom.specVersion, "1.6");
  assert.match(ledger, /devrelay-0\.10\.0-rc\.3\.tgz/u);
  assert.match(legal, /Apache License 2\.0[\s\S]*DevRelay notice/u);
  assert.equal(evidence.operations[0].operation, "deterministic-node-pack");
  assert.equal(evidence.artifacts.length, 6);
});

test("materialization rejects wrong version, missing legal inputs, unsafe paths, and non-Windows hosts", async () => {
  const wrong = new Map(fileMap); wrong.set("package.json", Buffer.from(canonicalJson({ name: "devrelay", version: "9.0.0" }), "utf8"));
  await assert.rejects(() => run({ host: createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths, readFile: (path) => wrong.get(path), platform: "win32" }) }), /package metadata differs/u);
  assert.throws(() => createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths: packagePaths.filter((path) => path !== "NOTICE"), readFile: (path) => fileMap.get(path), platform: "linux" }), /requires Windows/u);
  assert.throws(() => createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths: ["../secret"], readFile: () => Buffer.alloc(0), platform: "win32" }), /unsafe/u);
  const missing = createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths: packagePaths.filter((path) => path !== "NOTICE"), readFile: (path) => fileMap.get(path), platform: "win32" });
  await assert.rejects(() => run({ host: missing }), /omits NOTICE/u);
});

test("artifact store is content-addressed and rejects substituted references", () => {
  const store = createInMemoryReleaseArtifactStore();
  const metadata = { artifactId: "A", schema: "https://example.com/a", mediaType: "text/plain" };
  const stored = store.put(Buffer.from("exact"), metadata);
  assert.equal(store.read(stored).toString("utf8"), "exact");
  assert.throws(() => store.read({ ...stored, artifactId: "B" }), /substituted/u);
});

test("checkpoint identity is invocation-, attempt-, host-, and configuration-bound", async () => {
  const store = createInMemoryReleaseArtifactStore();
  const checkpoints = createInMemoryReleaseMaterializationCheckpointStore();
  const first = await run({ artifactStore: store, checkpoints });
  const otherHost = makeHost({ maturity: "live-conformant" });
  const second = await materializeNativeReleaseCandidate({ invocationId: "RP-MATERIALIZE-001", attempt, attemptRef, host: otherHost, artifactStore: store, checkpoints });
  assert.notEqual(first.invocationFingerprint, second.invocationFingerprint);
  assert.equal(second.replayed, false);
});

test("closed inputs prevent publication effects and ambiguous package files", async () => {
  assert.equal((await run()).receipt.grants.some(({ kind }) => kind === "network.connect"), false);
  assert.equal((await run()).receipt.grants.some(({ kind }) => kind === "secrets.read"), false);
  assert.throws(() => createNativeNodeWindowsReleaseHost({ root: "C:/fixture", packagePaths: [...packagePaths, packagePaths[0]], readFile: (path) => fileMap.get(path), platform: "win32" }), /ambiguous/u);
  assert.throws(() => createDeterministicNpmTarball([]), ReleasePreparationMaterializationError);
});
