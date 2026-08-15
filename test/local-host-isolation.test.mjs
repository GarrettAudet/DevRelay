import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalHostIsolationError, createCapabilityEnforcer, createGitWorktreeManager } from "../src/local-host-isolation.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
function repositoryFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "devrelay-isolation-"));
  const repository = path.join(root, "repository");
  const worktrees = path.join(root, "worktrees");
  execFileSync("git", ["init", repository], { stdio: "ignore", windowsHide: true });
  git(repository, "config", "user.name", "DevRelay Test");
  git(repository, "config", "user.email", "devrelay@invalid");
  git(repository, "config", "core.autocrlf", "false");
  writeFileSync(path.join(repository, "fixture.txt"), "base\n");
  git(repository, "add", "fixture.txt");
  git(repository, "commit", "-m", "base");
  return { root, repository, worktrees, revision: git(repository, "rev-parse", "HEAD") };
}

test("creates an exact detached worktree and verifies its immutable base", (t) => {
  const fixture = repositoryFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const manager = createGitWorktreeManager({ repositoryPath: fixture.repository, worktreeRoot: fixture.worktrees });
  const record = manager.create({ attemptId: "ATT-1", workItemId: "WI-1", revision: fixture.revision });
  assert.equal(manager.inspect("ATT-1").observedRevision, fixture.revision);
  assert.equal(readFileSync(path.join(record.workspace, "fixture.txt"), "utf8"), "base\n");
});

test("supports concurrent isolated attempts without cross-work mutation", (t) => {
  const fixture = repositoryFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const manager = createGitWorktreeManager({ repositoryPath: fixture.repository, worktreeRoot: fixture.worktrees });
  const left = manager.create({ attemptId: "ATT-LEFT", workItemId: "WI-L", revision: fixture.revision });
  const right = manager.create({ attemptId: "ATT-RIGHT", workItemId: "WI-R", revision: fixture.revision });
  writeFileSync(path.join(left.workspace, "fixture.txt"), "left\n");
  assert.equal(readFileSync(path.join(right.workspace, "fixture.txt"), "utf8"), "base\n");
  assert.equal(manager.list().length, 2);
});

test("rejects unknown revisions, duplicate attempts, and unsafe worktree roots", (t) => {
  const fixture = repositoryFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  assert.throws(() => createGitWorktreeManager({ repositoryPath: fixture.repository, worktreeRoot: path.join(fixture.repository, "nested") }), LocalHostIsolationError);
  const manager = createGitWorktreeManager({ repositoryPath: fixture.repository, worktreeRoot: fixture.worktrees });
  assert.throws(() => manager.create({ attemptId: "ATT-X", workItemId: "WI-X", revision: "f".repeat(40) }), /unavailable/u);
  manager.create({ attemptId: "ATT-X", workItemId: "WI-X", revision: fixture.revision });
  assert.throws(() => manager.create({ attemptId: "ATT-X", workItemId: "WI-X", revision: fixture.revision }), /already/u);
});

test("cleanup removes only the exact managed worktree", (t) => {
  const fixture = repositoryFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const manager = createGitWorktreeManager({ repositoryPath: fixture.repository, worktreeRoot: fixture.worktrees });
  manager.create({ attemptId: "ATT-CLEAN", workItemId: "WI-C", revision: fixture.revision });
  assert.equal(manager.cleanup("ATT-CLEAN").outcome, "removed");
  assert.equal(manager.list().length, 0);
  assert.throws(() => manager.inspect("ATT-CLEAN"), /no managed worktree/u);
});

test("filesystem grants reject path escape and undeclared writes", () => {
  const workspace = path.resolve("fixture-workspace");
  const enforcer = createCapabilityEnforcer({ attemptId: "ATT-FS", workspace, grants: [{ kind: "filesystem.write", values: ["src"] }] });
  assert.doesNotThrow(() => enforcer.authorize({ kind: "filesystem.write", path: "src/file.mjs" }));
  assert.throws(() => enforcer.authorize({ kind: "filesystem.write", path: "../escape.txt" }), /escapes/u);
  assert.throws(() => enforcer.authorize({ kind: "filesystem.write", path: "test/file.mjs" }), /outside declared/u);
});

test("process, network, and secret effects are deny-by-default", async () => {
  const workspace = process.cwd();
  const enforcer = createCapabilityEnforcer({ attemptId: "ATT-DENY", workspace, grants: [{ kind: "process.spawn", values: [process.execPath] }] });
  assert.throws(() => enforcer.authorize({ kind: "network.connect", host: "example.com" }), /undeclared/u);
  assert.throws(() => enforcer.authorize({ kind: "secrets.read", name: "TOKEN" }), /undeclared/u);
  assert.throws(() => enforcer.authorize({ kind: "process.spawn", executable: "git" }), /scope is undeclared/u);
});

test("granted process effects emit digest-bound receipts", () => {
  const receipts = [];
  const enforcer = createCapabilityEnforcer({ attemptId: "ATT-PROC", workspace: process.cwd(), grants: [{ kind: "process.spawn", values: [process.execPath] }], receiptSink: (receipt) => receipts.push(receipt) });
  const result = enforcer.executeProcess({ executable: process.execPath, argv: ["-e", "process.stdout.write('ok')"] });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString(), "ok");
  assert.equal(receipts.length, 1);
  assert.match(receipts[0].observation.outputDigest, /^sha256:/u);
});

test("secret receipts never contain the secret value", async () => {
  const receipts = [];
  const enforcer = createCapabilityEnforcer({ attemptId: "ATT-SECRET", workspace: process.cwd(), grants: [{ kind: "secrets.read", values: ["TOKEN"] }], receiptSink: (receipt) => receipts.push(receipt) });
  const result = await enforcer.readSecret({ name: "TOKEN", action: async () => "super-secret-value" });
  assert.equal(result.value, "super-secret-value");
  assert.equal(JSON.stringify(receipts).includes("super-secret-value"), false);
  assert.equal(receipts[0].effect.scope, "TOKEN");
});
