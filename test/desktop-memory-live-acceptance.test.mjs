import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadProjectMemoryArtifact, renderCurrentSynopsis, validateProjectMemoryArtifact } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

test("final Desktop proof is concluded into a fresh-task-readable memory baseline", () => {
  const baseline = json("project/project-memory-baseline.json");
  const proof = json("project/project-memory-promotion.commit.json");
  const live = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-acceptance/03-live-desktop-memory-acceptance-receipt.json");
  const verification = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-remediation/01-canonical-verification-receipt.json");
  const review = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-remediation/02-independent-adversarial-review-receipt.json");
  validateProjectMemoryArtifact(baseline);
  validateProjectMemoryArtifact(proof);
  assert.equal(baseline.version, "1.0.6");
  assert.equal(proof.status, "promoted");
  assert.equal(proof.projectMemoryBaseline.digest, loadProjectMemoryArtifact(baseline).ref.digest);
  assert.equal(renderCurrentSynopsis(baseline).bytes.equals(fs.readFileSync(path.join(root, "project", "CurrentSynopsis.md"))), true);
  assert.deepEqual(verification.testSummary, { tests: 1169, passed: 1167, failed: 0, skipped: 2, durationMs: 969743.3967 });
  assert.equal(review.disposition, "pass");
  assert.equal(review.blockingFindings, 0);
  assert.equal(review.priorFindings.every(({ disposition }) => disposition === "closed"), true);
  assert.equal(live.firstToolWasBootstrap, true);
  assert.equal(live.nodeModulesPresent, false);
  assert.equal(live.alternateCheckoutUsed, false);
  assert.equal(live.outcome, "pass");

  const output = JSON.parse(execFileSync(process.execPath, [path.join(root, "plugins", "devrelay-desktop", "scripts", "memory-bootstrap.mjs"), "--task-id", "MEMORY-READ-AFTER-WRITE-TEST", "--repository-revision", "c".repeat(40)], { cwd: root, encoding: "utf8", windowsHide: true }));
  assert.equal(output.receipt.projectMemoryBaseline.artifactId, baseline.baselineId);
  assert.match(output.synopsis, /MEMORY-PROBE-20260906-B/u);
  assert.match(output.synopsis, /independent adversarial review closed the memory-plan provenance and review-subject lineage findings/u);
  assert.match(output.synopsis, /supported Desktop startup boundary remains AGENTS\.md plus the managed task prompt/u);
});
