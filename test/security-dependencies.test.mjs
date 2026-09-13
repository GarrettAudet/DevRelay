import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import Ajv from "ajv";
import uri from "fast-uri";
import yaml from "js-yaml";

const require = createRequire(import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

test("the active install and lockfile retain the reviewed security-patch pins", () => {
  const manifest = readJson("package.json");
  const lock = readJson("package-lock.json");
  assert.equal(manifest.overrides["fast-uri"], "3.1.7");
  for (const [name, version] of [["fast-uri", "3.1.7"], ["js-yaml", "4.3.2"]]) {
    const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    assert.ok(entries.length > 0, name);
    for (const [, entry] of entries) {
      assert.equal(entry.version, version);
      assert.equal(entry.resolved, `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
      assert.match(entry.integrity, /^sha512-/u);
    }
    assert.equal(require(`${name}/package.json`).version, version);
  }
});

test("fast-uri normalization cannot turn an encoded scheme into a new authority", () => {
  for (const value of ["%2f%2fevil.example:/pwn", "%u002f%u002fevil.example:/pwn"]) {
    const normalized = uri.normalize(value);
    assert.equal(normalized, value);
    assert.equal(uri.parse(normalized).host, undefined);
    assert.equal(normalized.includes("\r"), false);
    assert.equal(normalized.includes("\n"), false);
  }
  assert.equal(uri.normalize("https://example.com/safe"), "https://example.com/safe");
});

test("js-yaml charges empty merge mappings against the configured budget", () => {
  const source = "arr: &arr [{}, {}, {}]\ntargets:\n  - <<: *arr\n  - <<: *arr\n";
  assert.throws(() => yaml.load(source, { maxTotalMergeKeys: 5 }), /maxTotalMergeKeys/u);
  assert.deepEqual(yaml.load("base: &base {safe: true}\ntarget: {<<: *base}\n").target, { safe: true });
});

test("the patched URI resolver preserves Ajv reference validation", () => {
  const ajv = new Ajv({ strict: true });
  ajv.addSchema({ $id: "https://example.com/contracts/id.json", type: "string", minLength: 1 });
  const validate = ajv.compile({
    $id: "https://example.com/contracts/request.json",
    type: "object", properties: { id: { $ref: "id.json" } }, required: ["id"], additionalProperties: false,
  });
  assert.equal(validate({ id: "safe" }), true);
  assert.equal(validate({ id: "" }), false);
  assert.equal(validate({ id: 1 }), false);
});
