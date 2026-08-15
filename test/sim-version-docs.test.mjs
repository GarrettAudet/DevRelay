import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (name) => readFile(new URL(name, root), "utf8");
const json = async (name) => JSON.parse(await text(name));

test("SIM-001 release identity is consistently 0.10.0-rc.2", async () => {
  const [assetManifest, evidenceSet, changelog, notes] = await Promise.all([
    json("dogfood/sim-001-simplification/release-assets-manifest.json"),
    json("dogfood/sim-001-simplification/final-acceptance/00-release-candidate-evidence-set.json"),
    text("CHANGELOG.md"),
    text("docs/releases/0.10.0-rc.2.md"),
  ]);
  assert.equal(assetManifest.release, "0.10.0-rc.2");
  assert.equal(assetManifest.implementationCommit, "53760e86617fcc28286a916200866448a441d4c8");
  assert.equal(evidenceSet.implementationCommit, assetManifest.implementationCommit);
  assert.equal(evidenceSet.releaseCatalog.artifactId, "devrelay-release-catalog-0.10.0-rc.2");
  for (const value of [changelog, notes]) assert.match(value, /0\.10\.0-rc\.2/u);
});

test("SIM-001 docs preserve preview, API tier, and deferred-host boundaries", async () => {
  const [policy, migration, notes] = await Promise.all([
    text("docs/version-policy.md"),
    text("docs/migrations/compat-v1-to-facade.md"),
    text("docs/releases/0.10.0-rc.2.md"),
  ]);
  assert.match(policy, /Preview for ChatGPT Desktop on Windows/u);
  assert.match(policy, /Module versions are independent/u);
  assert.match(policy, /Independent human review/u);
  assert.match(policy, /0\.11 milestone/u);
  assert.match(migration, /devrelay\/advanced/u);
  assert.match(migration, /0\.11\.x-prerelease/u);
  assert.match(notes, /one-click ChatGPT Desktop plug-in/u);
  assert.match(notes, /GitHub source and an installable tarball/u);
});
