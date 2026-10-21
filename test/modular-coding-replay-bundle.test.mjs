import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { sha256Digest } from "../src/content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "../src/module-registry.mjs";
import { validateCodingReplayBundle } from "../examples/modular/coding-replay-bundle.mjs";
import { createGovernedCodingFixture } from "./governed-coding-fixture.mjs";

// These source approvals are synthetic conformance data, not owner acceptance.
const fixture = await createGovernedCodingFixture();
const copy = () => structuredClone(fixture.bundle);

test("durable source bundle reconstructs genuine Gate receipts, not serialized authority", async () => {
  const result = await validateCodingReplayBundle(JSON.parse(JSON.stringify(fixture.bundle)));
  for (const name of ["requirements", "architecture", "workBreakdown"]) {
    assert.equal(assertVerifiedCheckpointReplayReceipt(result.governance[name].checkpointReplay), result.governance[name].checkpointReplay);
  }
  assert.deepEqual(result.heads, fixture.heads);
  assert.match(result.catalogDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal((await result.preflight.assertCurrent()).acceptance, "not-recorded");
});

test("fresh process imports only bytes and verifies without fixture adapters", async t => {
  const directory = await mkdtemp(join(tmpdir(), "devrelay-replay-bundle-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "bundle.json");
  await writeFile(path, JSON.stringify(fixture.bundle));
  const source = `import {readFile} from 'node:fs/promises';
    import {validateCodingReplayBundle} from ${JSON.stringify(new URL("../examples/modular/coding-replay-bundle.mjs", import.meta.url).href)};
    const result = await validateCodingReplayBundle(JSON.parse(await readFile(process.argv[1], 'utf8')));
    console.log(JSON.stringify({heads:result.heads, approvalDigest:result.approvalDigest}));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, path], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).heads, fixture.heads);
});

test("Git-bound synthetic fixture coherently rebinds all upstream lineage before execution", async () => {
  const revision = "1".repeat(40);
  const treeDigest = "sha256:" + "2".repeat(64);
  const synthetic = await createGovernedCodingFixture(undefined, { repositoryRevision: revision, repositoryTreeDigest: treeDigest });
  const result = await validateCodingReplayBundle(synthetic.bundle);
  assert.equal(result.repositorySnapshot.revision, revision);
  assert.equal(result.repositorySnapshot.treeDigest, treeDigest);
  assert.notEqual(result.approvalDigest, (await validateCodingReplayBundle(fixture.bundle)).approvalDigest);
});

test("closed bounded bundle rejects substituted authority, unknown fields and oversized bytes", async () => {
  await assert.rejects(validateCodingReplayBundle({ ...copy(), checkpointReplay: {} }), /invalid format/);
  await assert.rejects(validateCodingReplayBundle({ ...copy(), formatVersion: 2 }), /invalid format/);
  const large = copy();
  large.artifacts[0].bytesBase64 = "A".repeat(16 * 1024 * 1024);
  await assert.rejects(validateCodingReplayBundle(large), /16 MiB/);
  const mutable = copy();
  mutable.invocations.requirements.adapter = () => true;
  await assert.rejects(validateCodingReplayBundle(mutable), /JSON value/);
});

test("checkpoint-only replay fails closed instead of invoking missing or substituted adapters", async () => {
  const missing = copy();
  missing.checkpoints.pop();
  await assert.rejects(validateCodingReplayBundle(missing), /exact terminal checkpoint/);
  const changed = copy();
  changed.invocations.requirements.plugin.version = "99.0.0";
  await assert.rejects(validateCodingReplayBundle(changed), /not registered|unregistered|unknown/i);
  const duplicate = copy();
  duplicate.checkpoints.push(structuredClone(duplicate.checkpoints[0]));
  await assert.rejects(validateCodingReplayBundle(duplicate), /duplicate checkpoint/);
});

test("opaque approval, native bytes and full reference aliases must all resolve exactly", async () => {
  const missingApproval = copy();
  missingApproval.artifacts = missingApproval.artifacts.filter(entry => entry.ref.artifactId !== "requirements-approval-001");
  await assert.rejects(validateCodingReplayBundle(missingApproval), /missing exact.*requirements-approval-001/);
  const corrupt = copy();
  corrupt.artifacts[0].bytesBase64 = Buffer.from("substituted").toString("base64");
  await assert.rejects(validateCodingReplayBundle(corrupt), /bytes or digest mismatch/);
  const alias = copy();
  const index = alias.artifacts.findIndex(entry => entry.ref.uri);
  alias.artifacts[index].ref.uri += "/substitution";
  await assert.rejects(validateCodingReplayBundle(alias), /missing exact referenced artifact/);
  const extra = copy();
  const bytes = Buffer.from("unreferenced");
  extra.artifacts.push({ ref: { artifactId: "extra", digest: sha256Digest(bytes) }, bytesBase64: bytes.toString("base64") });
  await assert.rejects(validateCodingReplayBundle(extra), /unreferenced artifact/);
});

test("mutation of the supplied bundle cannot change validated preflight authority", async () => {
  const input = copy();
  const result = await validateCodingReplayBundle(input);
  input.gates.workBreakdown.baseline.digest = "sha256:" + "0".repeat(64);
  input.artifacts[0].bytesBase64 = "";
  assert.deepEqual(result.heads, fixture.heads);
  assert.equal((await result.preflight.assertCurrent()).status, "eligible");
});
