import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalJsonDigest,
  renderCurrentSynopsis,
  sha256Digest,
  validateProjectMemoryArtifact,
} from "../src/index.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const bytes=(p)=>fs.readFileSync(path.join(root,p));
const json=(p)=>JSON.parse(bytes(p));

test("the accepted ProjectMemory baseline preserves PM-001 and the latest concluded release",()=>{
  const baseline=json("project/project-memory-baseline.json");
  validateProjectMemoryArtifact(baseline);
  assert.equal(baseline.kind,"ProjectMemoryBaseline");
  assert.equal(baseline.version,"1.0.2");
  assert.equal(baseline.records.some(({id,status})=>id==="MEM-DEVRELAY-STATUS-EP001-RELEASE-READY"&&status==="active"),true);
  assert.equal(baseline.records.some(({id,status})=>id==="MEM-DEVRELAY-STATUS-PM001-RELEASE-READY"&&status==="active"),true);
  assert.equal(baseline.records.some(({id,status})=>id==="MEM-DEVRELAY-STATUS-PM001-CANDIDATE"&&status==="superseded"),true);
  const synopsis=renderCurrentSynopsis(baseline);
  assert.equal(sha256Digest(bytes("project/CurrentSynopsis.md")),synopsis.ref.digest);
  assert.equal(bytes("project/CurrentSynopsis.md").equals(synopsis.bytes),true);

  const final=json("dogfood/pm-001-project-memory/final-acceptance/final-acceptance-summary.json");
  const system=json("dogfood/pm-001-project-memory/final-acceptance/system-verification-result.json");
  const acceptance=json("dogfood/pm-001-project-memory/final-acceptance/business-acceptance-record.json");
  assert.equal(system.outcome,"verified");
  assert.equal(acceptance.outcome,"accepted");
  assert.equal(final.blockingDiagnostics,0);
  assert.deepEqual(final.coverage,{acceptanceCriteria:150,nonFunctionalRequirements:41,businessObjectives:18,successMetrics:25,businessScopes:51,integratedWorkItems:9});

  const conclusion=json("dogfood/pm-001-project-memory/final-conclusion/final-conclusion-summary.json");
  const {summaryDigest,...material}=conclusion;
  assert.equal(summaryDigest,canonicalJsonDigest(material));
  assert.equal(conclusion.outcome,"pass");
  assert.equal(conclusion.atomicCommits,1);
  assert.equal(conclusion.freshTaskReplayed,true);
  assert.equal(conclusion.freshTaskProviderOutcome,"native-equivalent");
  assert.deepEqual(conclusion.freshTaskLoadOrder,["current-synopsis","project-memory-baseline","traceability-context"]);
  const installed=json("dogfood/pm-001-project-memory/windows-e2e/installed-package-verification-receipt.json");
  assert.equal(installed.scenario.provider.maturity,"live-conformant");
  assert.equal(installed.scenario.restart.zeroCallReplay,true);
});