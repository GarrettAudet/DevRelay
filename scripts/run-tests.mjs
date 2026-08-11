import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const archivedVerifierFixtures = new Set([
  "dogfood/bootstrap-open-spec-requirements-adapter/verification/attempt-001/existing-baseline-architecture-revision.test.mjs",
  "dogfood/bootstrap-open-spec-requirements-adapter/verification/attempt-002-verifier/independent-baseline-revision.test.mjs",
]);

const tests = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.name.endsWith(".test.mjs")) {
      const path = relative(root, absolute).split(sep).join("/");
      if (!archivedVerifierFixtures.has(path)) tests.push(path);
    }
  }
};

visit(join(root, "test"));
visit(join(root, "dogfood"));
const beforeMutatingMaterialization = new Map([
  ["test/lifecycle-run-report-architecture-promotion-dogfood.test.mjs", 0],
  ["test/lifecycle-run-report-architecture-design-dogfood.test.mjs", 1],
]);
tests.sort((left, right) => {
  const leftOrder = beforeMutatingMaterialization.get(left);
  const rightOrder = beforeMutatingMaterialization.get(right);
  if (leftOrder !== undefined || rightOrder !== undefined) {
    return (leftOrder ?? 2) - (rightOrder ?? 2);
  }
  return left.localeCompare(right);
});

const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...tests], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
