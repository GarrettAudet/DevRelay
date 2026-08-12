import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/run-tests.mjs", import.meta.url), "utf8");

test("generic test discovery excludes only immutable bootstrap verifier evidence", () => {
  assert.match(source, /fileURLToPath\(new URL\("\.\.\/", import\.meta\.url\)\)/);
  assert.doesNotMatch(source, /\.pathname/);
  assert.doesNotMatch(source, /process\.platform === "win32"/);
  assert.match(source, /attempt-001\/existing-baseline-architecture-revision\.test\.mjs/);
  assert.match(source, /attempt-002-verifier\/independent-baseline-revision\.test\.mjs/);
  assert.doesNotMatch(source, /WI-RUN-MARKDOWN.*adversarial-verifier/);
  assert.doesNotMatch(source, /independent-adversarial/);
  assert.ok(
    source.indexOf("lifecycle-run-report-architecture-promotion-dogfood") <
      source.indexOf("lifecycle-run-report-architecture-design-dogfood"),
  );
});
