import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const workflows = [
  ".github/workflows/verify.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/scorecard.yml",
  ".github/workflows/release.yml",
];

test("every GitHub Action is bound to a recorded immutable commit", () => {
  const pinSet = JSON.parse(text("release/action-pins.json"));
  const pins = new Map(pinSet.actions.map((entry) => [entry.action, entry.sha]));
  const seen = new Set();
  for (const workflow of workflows) {
    const source = text(workflow);
    for (const match of source.matchAll(/uses:\s+([^@\s]+)@([0-9a-f]{40})/gu)) {
      const [, action, sha] = match;
      const family = action.startsWith("github/codeql-action/")
        ? "github/codeql-action"
        : action;
      assert.equal(sha, pins.get(family), `${workflow} uses an unrecorded pin for ${action}`);
      seen.add(family);
    }
    assert.doesNotMatch(source, /uses:\s+[^\s]+@(v|main|master|REPLACE_)/u);
  }
  assert.deepEqual([...seen].sort(), [...pins.keys()].sort());
});

test("automation has bounded permissions and never publishes to npm", () => {
  const all = workflows.map(text).join("\n");
  assert.doesNotMatch(all, /npm\s+publish/u);
  assert.match(text(".github/workflows/verify.yml"), /permissions:\s*\n\s*contents:\s*read/u);
  assert.match(text(".github/workflows/dependency-review.yml"), /fail-on-severity:\s*moderate/u);
  assert.match(text(".github/workflows/codeql.yml"), /security-events:\s*write/u);
  assert.match(text(".github/workflows/scorecard.yml"), /publish_results:\s*true/u);
  const release = text(".github/workflows/release.yml");
  assert.match(release, /npm run release:check/u);
  assert.match(release, /npm sbom --sbom-format=cyclonedx/u);
  assert.match(release, /sha256sum/u);
  assert.match(release, /attest-build-provenance/u);
  assert.match(release, /gh release create/u);
  assert.doesNotMatch(release, /registry-url/u);
});
