import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createDesktopStepExchange, DesktopStepRequired } from "../src/desktop-step-exchange.mjs";

test("Desktop exchange preserves exact pending identity and append-only candidate corrections", async (t) => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-step-exchange-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const contextDigest = canonicalJsonDigest({ session: "fixture-only" });
  const create = (context = contextDigest) => createDesktopStepExchange({ storage, namespace: "fixture", contextDigest: context });
  const exchange = create();
  const invocation = JSON.parse(readFileSync(new URL("../examples/invocations/requirements-openspec.invocation.json", import.meta.url)));
  const result = JSON.parse(readFileSync(new URL("../examples/results/requirements-openspec.result.json", import.meta.url)));
  const producer = { invocationId: invocation.invocationId, plugin: invocation.plugin, step: "single-adapter",
    invocationFingerprint: canonicalJsonDigest(invocation), chainFingerprint: canonicalJsonDigest(invocation), stepInvocationDigest: canonicalJsonDigest({ invocation, step: "single-adapter" }) };
  let request;
  await assert.rejects(exchange.adapter.invoke(invocation, {}, producer), (error) => {
    assert.ok(error instanceof DesktopStepRequired); request = error.request; return true;
  });
  assert.deepEqual(exchange.readRequest(request.requestId), request);
  storage.close(); storage = createLocalHostStorage({ rootDirectory });
  const reopened = create();
  await assert.rejects(reopened.adapter.invoke(invocation, {}, producer), (error) => {
    assert.deepEqual(error.request, request); return true;
  });
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse", requestId: request.requestId,
    requestDigest: canonicalJsonDigest(request), result };
  for (const invalid of [
    { ...response, requestDigest: `sha256:${"f".repeat(64)}` },
    { ...response, result: { ...result, invocationId: "substituted" } },
    { ...response, approved: true },
  ]) assert.throws(() => reopened.submit(invalid), { code: "DR4952" });
  assert.throws(() => create(canonicalJsonDigest({ session: "other" })).readRequest(request.requestId), { code: "DR4952" });
  reopened.submit(response);
  assert.deepEqual(await reopened.adapter.invoke(invocation, {}, producer), result);
  const revised = { ...response, result: { ...result, outcome: "candidate_correction" } };
  reopened.submit(revised);
  assert.deepEqual(await reopened.adapter.invoke(invocation, {}, producer), revised.result);
  // The exchange does not claim semantic acceptance. Integration tests prove
  // that Core rejects an undeclared candidate outcome before completing work.
  assert.equal(storage.listRuns({ prefix: "local-checkpoint:" }).filter(({ state }) => state.namespace.endsWith("/responses")).length, 2);
  await assert.rejects(reopened.adapter.invoke(invocation, {}), { code: "DR4950" });
});
