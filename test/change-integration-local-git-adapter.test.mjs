import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalGitIntegrationAdapter, localGitIntegrationConfigurationDigest } from "../src/change-integration-local-git-adapter.mjs";
import { documentValidators, validationDetail } from "../src/schema-validation.mjs";

const D = `sha256:${"a".repeat(64)}`;
const isolatedRepositoryPath = join(tmpdir(), "devrelay-isolated");
const customGitExecutable = join(tmpdir(), "devrelay-tools", "git-custom");
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const commitFile = async (repo, path, body, message) => { await writeFile(join(repo, path), body); git(repo, "add", path); git(repo, "commit", "-m", message); return git(repo, "rev-parse", "HEAD"); };
const configuration = (repositoryPath) => ({ repositoryPath, gitExecutable: "git", timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 });
const invocationForConfiguration = (expected, source, strategy, adapterConfiguration, overrides = {}) => {
  const body = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "IntegrationAdapterInvocation", invocationId: "INV",
    plan: { artifactId: "PLAN", digest: D }, adapter: { id: "local-git-integration", version: "0.1.0", configurationDigest: localGitIntegrationConfigurationDigest(adapterConfiguration) },
    permissionDemands: [{ kind: "process.spawn", scope: { values: ["git"] } }],
    operation: { operationId: "INV", transition: { targetRef: "refs/heads/main", expectedTargetCommit: expected, sourceCommit: source, strategy } },
    ...overrides,
  };
  return { ...body, invocationFingerprint: canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
};
const invocation = (expected, source, strategy, repositoryPath, overrides = {}) => invocationForConfiguration(expected, source, strategy, configuration(repositoryPath), overrides);
const authorization = (value) => ({ invocationFingerprint: value.invocationFingerprint, targetRef: value.operation.transition.targetRef, expectedTargetCommit: value.operation.transition.expectedTargetCommit });
function evidenceStore() {
  const stored = new Map();
  return {
    stored,
    persistNativeEvidence: async (bytes) => { const digest = `sha256:${(await import("node:crypto")).createHash("sha256").update(bytes).digest("hex")}`; const ref = { artifactId: `E-${stored.size}`, digest, mediaType: "application/vnd.devrelay.local-git-native-evidence+json" }; stored.set(digest, Buffer.from(bytes)); return ref; },
    readNativeEvidence: async (ref) => stored.get(ref.digest),
  };
}
function adapterFor(repositoryPath, options = {}) { return createLocalGitIntegrationAdapter({ ...configuration(repositoryPath), ...evidenceStore(), ...options }); }

async function repositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), "devrelay-adapter-test-"));
  const repo = join(root, "repo");
  execFileSync("git", ["init", "-b", "main", repo]);
  git(repo, "config", "user.name", "Test"); git(repo, "config", "user.email", "test@invalid");
  const base = await commitFile(repo, "base.txt", "base\n", "base");
  return { root, repo, base };
}

for (const strategy of ["fast-forward", "merge-commit", "cherry-pick"]) {
  test(`${strategy} prepares in isolation and atomically advances only the authorized ref`, async () => {
    const fixture = await repositoryFixture();
    try {
      git(fixture.repo, "checkout", "-b", "source");
      const source = await commitFile(fixture.repo, "change.txt", `${strategy}\n`, "change");
      git(fixture.repo, "checkout", "main");
      if (strategy === "merge-commit") await commitFile(fixture.repo, "target.txt", "target\n", "target");
      const expected = git(fixture.repo, "rev-parse", "main");
      const sourceBefore = git(fixture.repo, "rev-parse", "source");
      const request = invocation(expected, source, strategy, fixture.repo);
      const result = await adapterFor(fixture.repo)(request, authorization(request));
      assert.equal(result.terminalState, "integrated"); assert.equal(result.effectState, "applied");
      assert.equal(git(fixture.repo, "rev-parse", "source"), sourceBefore);
      assert.equal(git(fixture.repo, "rev-parse", "main"), result.postState.commit);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
}

test("conflicts return exact paths and leave the target unchanged", async () => {
  const fixture = await repositoryFixture();
  try {
    git(fixture.repo, "checkout", "-b", "source"); const source = await commitFile(fixture.repo, "base.txt", "source\n", "source");
    git(fixture.repo, "checkout", "main"); const expected = await commitFile(fixture.repo, "base.txt", "target\n", "target");
    const request = invocation(expected, source, "cherry-pick", fixture.repo);
    const result = await adapterFor(fixture.repo)(request, authorization(request));
    assert.equal(result.terminalState, "conflict"); assert.equal(result.effectState, "not-applied");
    assert.deepEqual(result.conflictingPaths, ["base.txt"]); assert.equal(git(fixture.repo, "rev-parse", "main"), expected);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("temporary repository cleanup uses bounded Windows lock retries", async () => {
  const fixture = await repositoryFixture();
  let cleanupOptions;
  try {
    git(fixture.repo, "checkout", "-b", "source");
    const source = await commitFile(
      fixture.repo,
      "cleanup.txt",
      "cleanup\n",
      "cleanup",
    );
    git(fixture.repo, "checkout", "main");
    const request = invocation(
      fixture.base,
      source,
      "fast-forward",
      fixture.repo,
    );
    const adapter = adapterFor(fixture.repo, {
      removeWorkDirectory: async (directory, options) => {
        cleanupOptions = structuredClone(options);
        return rm(directory, options);
      },
    });
    const result = await adapter(request, authorization(request));
    assert.equal(result.terminalState, "integrated");
    assert.deepEqual(cleanupOptions, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("malformed and substituted invocations fail before spawning Git", async () => {
  let calls = 0;
  const adapter = adapterFor(isolatedRepositoryPath, { spawnGit: async () => { calls += 1; return {}; } });
  await assert.rejects(adapter({}));
  const validShape = invocation("1".repeat(40), "2".repeat(40), "fast-forward", isolatedRepositoryPath, { adapter: { id: "substitute", version: "0.1.0", configurationDigest: D } });
  await assert.rejects(adapter(validShape, authorization(validShape)), /identity/);
  assert.equal(calls, 0);
});

test("a concurrent ref change cannot be overwritten by the conditional update", async () => {
  const fixture = await repositoryFixture();
  try {
    git(fixture.repo, "checkout", "-b", "source"); const source = await commitFile(fixture.repo, "source.txt", "source\n", "source"); git(fixture.repo, "checkout", "main");
    const expected = fixture.base; let changed = false;
    const adapter = adapterFor(fixture.repo, { spawnGit: async (args) => {
      if (!changed && args.includes("update-ref")) { changed = true; await commitFile(fixture.repo, "racer.txt", "racer\n", "racer"); }
      try { return { exitCode: 0, signal: null, stdout: execFileSync("git", args, { encoding: "utf8" }), stderr: "" }; }
      catch (error) { return { exitCode: error.status, signal: error.signal, stdout: error.stdout?.toString() ?? "", stderr: error.stderr?.toString() ?? "" }; }
    }});
    const request = invocation(expected, source, "fast-forward", fixture.repo);
    const result = await adapter(request, authorization(request));
    assert.equal(result.terminalState, "uncertain"); assert.equal(result.effectState, "unknown");
    assert.notEqual(git(fixture.repo, "rev-parse", "main"), source);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("configuration substitution and missing or changed TARGET-CAS authorization invoke zero Git commands", async () => {
  let calls = 0; const repositoryPath = isolatedRepositoryPath;
  const request = invocation("1".repeat(40), "2".repeat(40), "fast-forward", repositoryPath);
  const adapter = adapterFor(repositoryPath, { spawnGit: async () => { calls += 1; return {}; } });
  const substituted = invocation("1".repeat(40), "2".repeat(40), "fast-forward", repositoryPath, { adapter: { ...request.adapter, configurationDigest: D } });
  await assert.rejects(adapter(substituted, authorization(substituted)), /identity/);
  await assert.rejects(adapter(request), /TARGET-CAS/);
  await assert.rejects(adapter(request, { ...authorization(request), targetRef: "refs/heads/other" }), /TARGET-CAS/);
  const resealed = invocation(request.operation.transition.expectedTargetCommit, request.operation.transition.sourceCommit, "cherry-pick", repositoryPath);
  await assert.rejects(adapter(resealed, authorization(request)), /TARGET-CAS/);
  assert.equal(calls, 0);
});

test("denied spawn and interrupted process fail closed without an effect", async () => {
  const repositoryPath = isolatedRepositoryPath; const request = invocation("1".repeat(40), "2".repeat(40), "fast-forward", repositoryPath);
  for (const [name, response, expected] of [
    ["denied", () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }, { signal: null, timedOut: false }],
    ["timeout", () => ({ exitCode: null, signal: "SIGTERM", timedOut: true, stdout: "", stderr: "timeout" }), { signal: "SIGTERM", timedOut: true }],
  ]) {
    const store = evidenceStore();
    const adapter = createLocalGitIntegrationAdapter({ ...configuration(repositoryPath), ...store, spawnGit: async () => response() });
    const error = await adapter(request, authorization(request)).then(() => assert.fail(`${name} must reject`), (value) => value);
    assert.match(error.message, /pre-state was not fully observed/);
    assert.equal("preState" in error, false);
    assert.equal(error.nativeEvidence.length, 1);
    const material = JSON.parse(store.stored.get(error.nativeEvidence[0].digest).toString("utf8"));
    assert.equal(material.commands.length, 1);
    assert.deepEqual(material.commands[0].args, ["-C", repositoryPath, "rev-parse", "--verify", "refs/heads/main"]);
    assert.equal(material.commands[0].executable, "git");
    assert.equal(material.commands[0].exitCode, null);
    assert.equal(material.commands[0].signal, expected.signal);
    assert.equal(material.commands[0].timedOut, expected.timedOut);
    assert.match(material.commands[0].stdoutDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(material.commands[0].stderrDigest, /^sha256:[0-9a-f]{64}$/);
  }
});

test("tree observation failure cites both attempted commands and never fabricates preState", async () => {
  const repositoryPath = isolatedRepositoryPath; const request = invocation("1".repeat(40), "2".repeat(40), "fast-forward", repositoryPath); const store = evidenceStore();
  let call = 0;
  const adapter = createLocalGitIntegrationAdapter({ ...configuration(repositoryPath), ...store, spawnGit: async () => call++ === 0 ? ({ exitCode: 0, signal: null, stdout: `${"1".repeat(40)}\n`, stderr: "" }) : ({ exitCode: 1, signal: null, stdout: "", stderr: "tree unavailable" }) });
  const error = await adapter(request, authorization(request)).then(() => assert.fail("must reject"), (value) => value);
  assert.equal("preState" in error, false); assert.equal(error.nativeEvidence.length, 1);
  const material = JSON.parse(store.stored.get(error.nativeEvidence[0].digest).toString("utf8"));
  assert.equal(material.commands.length, 2);
  assert.deepEqual(material.commands[1].args, ["-C", repositoryPath, "rev-parse", `${"1".repeat(40)}^{tree}`]);
});

test("custom gitExecutable is recorded exactly for a thrown spawn", async () => {
  const custom = { ...configuration(isolatedRepositoryPath), gitExecutable: customGitExecutable };
  const request = invocationForConfiguration("1".repeat(40), "2".repeat(40), "fast-forward", custom); const store = evidenceStore();
  const adapter = createLocalGitIntegrationAdapter({ ...custom, ...store, spawnGit: async () => { throw new Error("denied"); } });
  const error = await adapter(request, authorization(request)).then(() => assert.fail("must reject"), (value) => value);
  const material = JSON.parse(store.stored.get(error.nativeEvidence[0].digest).toString("utf8"));
  assert.equal(material.commands[0].executable, custom.gitExecutable);
});

test("native evidence must be persisted, retrievable, and byte-exact", async () => {
  const repositoryPath = isolatedRepositoryPath; const request = invocation("1".repeat(40), "2".repeat(40), "fast-forward", repositoryPath);
  const spawnGit = async () => ({ exitCode: 1, signal: null, stdout: "", stderr: "missing" });
  const badRef = createLocalGitIntegrationAdapter({ ...configuration(repositoryPath), spawnGit, persistNativeEvidence: async () => ({ artifactId: "E", digest: D }), readNativeEvidence: async () => Buffer.from("wrong") });
  await assert.rejects(badRef(request, authorization(request)), /digest-mismatched/);
  const store = evidenceStore();
  const unreadable = createLocalGitIntegrationAdapter({ ...configuration(repositoryPath), spawnGit, persistNativeEvidence: store.persistNativeEvidence, readNativeEvidence: async () => Buffer.from("different") });
  await assert.rejects(unreadable(request, authorization(request)), /bytes do not match/);
});

test("the plug-in manifest declares the complete digest-bound bounded configuration", async () => {
  const plugin = JSON.parse(await readFile(new URL("../examples/plugins/local-git-integration.plugin.json", import.meta.url), "utf8"));
  assert.equal(documentValidators.modulePlugin(plugin), true, validationDetail(documentValidators.modulePlugin));
  const schema = plugin.implements[0].operations[0].configSchema;
  assert.deepEqual(schema.required, ["repositoryPath", "gitExecutable", "timeoutMs", "maxOutputBytes"]);
  assert.equal(schema.properties.timeoutMs.maximum, 300000);
  assert.equal(schema.properties.maxOutputBytes.maximum, 16777216);
});
