import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("public OSS governance surface is complete and internally consistent", () => {
  const packageDocument = JSON.parse(text("package.json"));
  assert.equal(packageDocument.license, "Apache-2.0");

  const license = text("LICENSE");
  assert.match(license, /Apache License\s+Version 2\.0/u);
  assert.equal(license.split(/\r?\n/u).find((line) => line.trim().startsWith("http:"))?.trim(), "http://www.apache.org/licenses/");

  assert.match(text("NOTICE"), /DevRelay/u);
  assert.match(text("DCO.md"), /Developer Certificate of Origin,?\s+Version 1\.1/u);
  assert.match(text("CONTRIBUTING.md"), /Signed-off-by/u);
  assert.match(text("CONTRIBUTING.md"), /DCO/u);
  assert.match(text("GOVERNANCE.md"), /Garrett Audet/u);
  assert.match(text("CODE_OF_CONDUCT.md"), /Expected behavior/u);
  assert.match(text("CODE_OF_CONDUCT.md"), /Enforcement/u);
  assert.match(text("SUPPORT.md"), /public issue/iu);

  const security = text("SECURITY.md");
  assert.match(security, /garrett\.audet@gmail\.com/u);
  assert.match(security, /privat/iu);

  assert.equal(text(".github/CODEOWNERS").trim(), "* @GarrettAudet");
  assert.match(text(".github/pull_request_template.md"), /DCO/u);
  assert.match(text(".github/ISSUE_TEMPLATE/bug_report.yml"), /Bug report/u);
  assert.match(text(".github/ISSUE_TEMPLATE/feature_request.yml"), /Feature request/u);
  assert.match(text(".github/dependabot.yml"), /package-ecosystem:\s*npm/u);
});
