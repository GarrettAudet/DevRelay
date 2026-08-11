import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { resolveChatGptDesktopCapabilities } from "../src/chatgpt-desktop-capability-resolver.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const ref = (artifactId, contentDigest = digest("a")) => ({ artifactId, digest: contentDigest });
const moduleEntry = (capabilities = ["CAP-A"], version = "1.0.0") => {
  const manifest = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopModuleCapabilityManifest", moduleId: "module-a", version, capabilities };
  return { artifact: ref(`module-a-${version}`, canonicalJsonDigest(manifest)), manifest };
};
const adapterEntry = (maturity = "release-ready", { capabilities = ["CAP-A"], moduleVersion = "1.0.0", id = "adapter-a" } = {}) => {
  const manifest = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopAdapterCapabilityManifest", adapterId: id, version: "1.0.0", module: { id: "module-a", version: moduleVersion }, capabilities, maturity };
  return { artifact: ref(id, canonicalJsonDigest(manifest)), manifest };
};
const input = (adapters, requiredCapabilities = ["CAP-A"], modules = [moduleEntry()]) => ({
  host: { platform: "win32", architecture: "x64", chatGptDesktopVersion: "1.0.0", codexVersion: "codex", nodeVersion: "v22.0.0" },
  circuit: ref("circuit", digest("b")), modules, adapters, policy: ref("policy", digest("c")), requiredCapabilities,
});

test("resolves one exact release-ready binding deterministically", () => {
  const result = resolveChatGptDesktopCapabilities(input([adapterEntry("release-ready")]));
  assert.equal(result.outputs.outcome, "resolved");
  assert.deepEqual(result.outputs.bindings.map(({ capability, maturity }) => ({ capability, maturity })), [{ capability: "CAP-A", maturity: "release-ready" }]);
  assert.match(result.outputs.resolutionDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("fixture-only and missing capabilities fail closed", () => {
  const fixture = resolveChatGptDesktopCapabilities(input([adapterEntry("fixture-conformant")]));
  assert.equal(fixture.outputs.outcome, "blocked");
  assert.equal(fixture.outputs.missing[0].observedMaturity, "fixture-only");
  const absent = resolveChatGptDesktopCapabilities(input([], ["CAP-A"]));
  assert.equal(absent.outputs.missing[0].observedMaturity, "absent");
});

test("rejects duplicate release bindings, incompatible versions, and tampered manifests", () => {
  assert.throws(() => resolveChatGptDesktopCapabilities(input([adapterEntry(), adapterEntry("release-ready", { id: "adapter-b" })])), /duplicate release-ready/u);
  assert.throws(() => resolveChatGptDesktopCapabilities(input([adapterEntry("release-ready", { moduleVersion: "2.0.0" })])), /incompatible module version/u);
  const tampered = adapterEntry(); tampered.manifest.version = "9.0.0";
  assert.throws(() => resolveChatGptDesktopCapabilities(input([tampered])), /pinned digest/u);
});

test("rejects capability drift and returns stable ordering", () => {
  assert.throws(() => resolveChatGptDesktopCapabilities(input([adapterEntry("release-ready", { capabilities: ["CAP-B"] })])), /outside its module contract/u);
  const modules = [moduleEntry(["CAP-A", "CAP-B"])];
  const result = resolveChatGptDesktopCapabilities(input([
    adapterEntry("release-ready", { capabilities: ["CAP-B"], id: "adapter-b" }),
    adapterEntry("release-ready", { capabilities: ["CAP-A"], id: "adapter-a" }),
  ], ["CAP-B", "CAP-A"], modules));
  assert.deepEqual(result.outputs.bindings.map(({ capability }) => capability), ["CAP-A", "CAP-B"]);
});
