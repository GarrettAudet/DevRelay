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
  const finalAcceptanceBaseline = json("project/history/project-memory/1.0.6/project-memory-baseline.json");
  const proof = json("project/project-memory-promotion.commit.json");
  const live = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-acceptance/03-live-desktop-memory-acceptance-receipt.json");
  const verification = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-remediation/01-canonical-verification-receipt.json");
  const review = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-remediation/02-independent-adversarial-review-receipt.json");
  const finalLiveRead = json("dogfood/do-001-desktop-orchestration/gap-remediation/final-remediation/11-final-live-read-proof.json");
  validateProjectMemoryArtifact(baseline);
  validateProjectMemoryArtifact(finalAcceptanceBaseline);
  validateProjectMemoryArtifact(proof);
  assert.equal(baseline.version, "1.0.8");
  assert.equal(proof.status, "promoted");
  assert.equal(proof.projectMemoryBaseline.digest, loadProjectMemoryArtifact(baseline).ref.digest);
  assert.equal(renderCurrentSynopsis(baseline).bytes.equals(fs.readFileSync(path.join(root, "project", "CurrentSynopsis.md"))), true);
  assert.deepEqual(verification.testSummary, { tests: 1169, passed: 1167, failed: 0, skipped: 2, durationMs: 969743.3967 });
  assert.equal(review.disposition, "pass");
  assert.equal(review.blockingFindings, 0);
  assert.equal(review.priorFindings.every(({ disposition }) => disposition === "closed"), true);
  assert.equal(finalLiveRead.outcome, "pass");
  assert.equal(finalLiveRead.firstCommandWasBootstrap, true);
  assert.equal(finalLiveRead.promptDisclosedMarkerOrStatement, false);
  assert.equal(finalLiveRead.nodeModulesPresent, false);
  assert.equal(finalLiveRead.projectMemoryBaseline.digest, loadProjectMemoryArtifact(finalAcceptanceBaseline).ref.digest);
  assert.match(finalLiveRead.recoveredMemory.statement, /MEMORY-PROBE-20260906-B/u);
  assert.deepEqual(finalLiveRead.statusChecks, {
    "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V2": "superseded",
    "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V3": "active",
  });
  assert.equal(live.firstToolWasBootstrap, true);
  assert.equal(live.nodeModulesPresent, false);
  assert.equal(live.alternateCheckoutUsed, false);
  assert.equal(live.outcome, "pass");

  const output = JSON.parse(execFileSync(process.execPath, [path.join(root, "plugins", "devrelay-desktop", "scripts", "memory-bootstrap.mjs"), "--task-id", "MEMORY-READ-AFTER-WRITE-TEST", "--repository-revision", "c".repeat(40)], { cwd: root, encoding: "utf8", windowsHide: true }));
  assert.equal(output.receipt.projectMemoryBaseline.artifactId, baseline.baselineId);
  assert.match(output.synopsis, /MEMORY-PROBE-20260906-B/u);
  assert.match(output.synopsis, /DevRelay v0\.11\.0-rc\.1 is published/u);
  assert.match(output.synopsis, /release workflow 34034582831 passed/u);
  assert.match(output.synopsis, /0\.11\.0-rc\.2 Quality Continuity/u);
});
