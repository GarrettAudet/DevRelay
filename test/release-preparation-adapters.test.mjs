import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  ReleasePreparationAdapterError,
  approveReleaseEffects,
  assertReleaseAdapterMaturity,
  createInMemoryReleaseAdapterCheckpointStore,
  createReleaseAdapterCheckpointController,
  createReleaseAdapterInvocation,
  createReleaseEffectReview,
  defineReleaseAdapterManifest,
  selectReleaseAdapter,
} from "../src/release-preparation-adapters.mjs";

const D = canonicalJsonDigest;
const manifest = defineReleaseAdapterManifest({
  id: "fixture.release-verifier", version: "1.2.3", capabilities: ["verify", "inspect"], configurationDigest: D("config"), maturity: "fixture-conformant",
  effectDemands: [{ capability: "verify", kind: "process.spawn", scope: "node:test", purpose: "Run the pinned test command." }],
});
const selection = selectReleaseAdapter({ catalog: [manifest], configuredAdapterId: manifest.id, capability: "verify" });
const request = { candidateDigest: D("candidate") };
const invocationFingerprint = D({ invocationId: "RPA-1", adapter: manifest.manifestDigest, capability: "verify", request });
const review = createReleaseEffectReview({ reviewId: "RPR-1", selection, invocationFingerprint });
const approval = approveReleaseEffects({ review, approvedEffectIds: review.effects.map(({ id }) => id) });
const invocation = createReleaseAdapterInvocation({ invocationId: "RPA-1", selection, request, effectReview: review, effectApproval: approval });

test("release adapter selection is explicit and never silently substitutes a provider", () => {
  assert.equal(selection.manifest.id, manifest.id);
  assert.throws(() => selectReleaseAdapter({ catalog: [], configuredAdapterId: manifest.id, capability: "verify" }), /unavailable/u);
  assert.throws(() => selectReleaseAdapter({ catalog: [manifest], configuredAdapterId: manifest.id, capability: "attest" }), /does not provide/u);
});

test("effect review and approval bind the exact capability grants", () => {
  assert.deepEqual(invocation.grants, [{ kind: "process.spawn", scope: "node:test", purpose: "Run the pinned test command." }]);
  assert.throws(() => approveReleaseEffects({ review, approvedEffectIds: [] }), /exact reviewed effect set/u);
  assert.throws(() => createReleaseAdapterInvocation({ invocationId: "RPA-1", selection, request: { candidateDigest: D("other") }, effectReview: review, effectApproval: approval }), /does not bind/u);
});

test("release preparation refuses signing, tags, and remote writes", () => {
  const unsafe = defineReleaseAdapterManifest({ id: "unsafe", version: "1", capabilities: ["attest"], configurationDigest: D("unsafe"), effectDemands: [{ capability: "attest", kind: "signing.use", scope: "key:release", purpose: "Sign." }] });
  const unsafeSelection = selectReleaseAdapter({ catalog: [unsafe], configuredAdapterId: "unsafe", capability: "attest" });
  const fingerprint = D({ invocationId: "RPA-UNSAFE", adapter: unsafe.manifestDigest, capability: "attest", request: {} });
  const unsafeReview = createReleaseEffectReview({ reviewId: "RPR-UNSAFE", selection: unsafeSelection, invocationFingerprint: fingerprint });
  assert.throws(() => approveReleaseEffects({ review: unsafeReview, approvedEffectIds: unsafeReview.effects.map(({ id }) => id) }), /cannot approve/u);
});

test("checkpoint replay invokes the external adapter zero times", async () => {
  let calls = 0;
  const controller = createReleaseAdapterCheckpointController({ manifest, checkpoints: createInMemoryReleaseAdapterCheckpointStore(), hostExecute: async (input) => { calls += 1; return { invocationFingerprint: input.invocationFingerprint, status: "completed", evidence: [], diagnostics: [], observations: [{ status: "pass" }] }; } });
  const first = await controller.execute(invocation);
  const replay = await controller.execute(invocation);
  assert.equal(calls, 1);
  assert.equal(first.hostCalls, 1);
  assert.equal(replay.hostCalls, 0);
  assert.equal(replay.replayed, true);
});

test("malformed, authority-bearing, and secret-bearing adapter results fail closed", async () => {
  const run = (raw) => createReleaseAdapterCheckpointController({ manifest, checkpoints: createInMemoryReleaseAdapterCheckpointStore(), hostExecute: async () => raw }).execute(invocation);
  await assert.rejects(() => run({ status: "completed", evidence: [], diagnostics: [] }), /malformed/u);
  await assert.rejects(() => run({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", evidence: [], diagnostics: [], gateDecision: "ready" }), /authority/u);
  await assert.rejects(() => run({ invocationFingerprint: invocation.invocationFingerprint, status: "completed", evidence: [], diagnostics: [], token: "secret" }), /sensitive/u);
});

test("live maturity claims require an exact provider receipt", () => {
  const live = defineReleaseAdapterManifest({ id: "live", version: "2", capabilities: ["inspect"], configurationDigest: D("live"), maturity: "live-conformant" });
  assert.throws(() => assertReleaseAdapterMaturity({ manifest: live, requiredMaturity: "live-conformant" }), /provider receipt/u);
  assert.equal(assertReleaseAdapterMaturity({ manifest: live, requiredMaturity: "fixture-conformant", liveReceipt: { adapterId: "live", adapterVersion: "2", manifestDigest: live.manifestDigest, receiptDigest: D("receipt") } }), live);
  assert.throws(() => assertReleaseAdapterMaturity({ manifest, requiredMaturity: "live-conformant" }), ReleasePreparationAdapterError);
});
