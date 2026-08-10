import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJsonDigest } from "../../../../../src/content-digest.mjs";

const root=resolve(new URL("../../../../../",import.meta.url).pathname.slice(1));
const sha256=bytes=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rel=path=>resolve(root,path);
const fixturePath=rel("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/adversarial-verifier.test.mjs");
const priorPath=rel("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/fixture-history/adversarial-verifier.attempt-002-rejection.raw.mjs");
const expectedOld="sha256:a0192e7313be5975b328d026943858a8cc9ac9f2798372e86f01ab804ccd61cc";
const mode=process.argv[2];
if(mode==="preserve"){
  const bytes=readFileSync(fixturePath);if(sha256(bytes)!==expectedOld)throw new Error("fixture is not the diagnosed original bytes");
  mkdirSync(resolve(priorPath,".."),{recursive:true});
  try{const existing=readFileSync(priorPath);if(!existing.equals(bytes))throw new Error("immutable prior fixture differs");}catch(error){if(error.code!=="ENOENT")throw error;writeFileSync(priorPath,bytes);}
  console.log(JSON.stringify({priorPath,oldFixtureDigest:sha256(bytes)}));
}else if(mode==="materialize"){
  const prior=readFileSync(priorPath),current=readFileSync(fixturePath);if(sha256(prior)!==expectedOld)throw new Error("prior fixture evidence mismatch");
  const json=p=>JSON.parse(readFileSync(rel(p),"utf8"));
  const rejected={candidate:json("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-002/gate-candidate.json"),evidence:json("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-002/normalized-evidence.json"),gate:json("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-002/gate-rejection.json"),checkpoint:json("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-002/checkpoint.json")};
  const refs={task:{path:"dogfood/lifecycle-run-report/execution/task-contracts/WI-RUN-MARKDOWN.attempt-002.task.json",digest:"sha256:33461a9742d6fc9f5bcb5b34a93b694c0b8f0feca6645a6c5b54f2a48dcde39c"},revision:{path:"dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-MARKDOWN.attempt-002.revision-request.json",digest:"sha256:8429c5e2c1c093a8c0bb6c6bd731adca9071240cc169bddecb3ec9e73a968a0b"},rawHandoff:{path:"dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-MARKDOWN.attempt-002.handoff.raw.json",digest:"sha256:809b259eb8c495d6088e1c5c991fe5867fb7c565158d57cb2fa5167d0e34d9cb"}};
  const body={correctionId:"VFC-WI-RUN-MARKDOWN-002-001",workItemId:"WI-RUN-MARKDOWN",attempt:2,diagnosis:{classification:"verifier-fixture-invalid-snapshot",rootCause:"The adversarial fixture reversed digest-bound snapshot arrays without resealing snapshotDigest, so released validation rejected the fixture before rendering.",independentOwner:"trusted-core-host/work-item-verification",candidateSourceDisposition:"unchanged",taskContractDisposition:"unchanged"},priorFixture:{path:"dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/fixture-history/adversarial-verifier.attempt-002-rejection.raw.mjs",digest:sha256(prior)},correctedFixture:{path:"dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/attempt-001/adversarial-verifier.test.mjs",digest:sha256(current)},authorizedCorrection:"After reordering only, delete snapshotDigest and recompute it from the exact body excluding apiVersion, kind, and snapshotDigest using canonicalJsonDigest. No assertion or requirement changes are authorized.",rejectedEvaluation:{candidateDigest:rejected.candidate.candidateDigest,evidenceDigest:rejected.evidence.evidenceDigest,gateRejectionDigest:rejected.gate.rejectionDigest,checkpointDigest:rejected.checkpoint.checkpointDigest},lineage:refs,closure:{candidateSourceChanged:false,taskContractChanged:false,assertionsChanged:false,requirementWeakened:false,priorRejectionPreserved:true},authority:"verification-fixture-owner"};
  const artifact={apiVersion:"devrelay.dev/v1alpha1",kind:"VerificationFixtureCorrection",...body,correctionDigest:canonicalJsonDigest(body)};
  const target=rel("dogfood/lifecycle-run-report/execution/verification/WI-RUN-MARKDOWN/fixture-corrections/VFC-WI-RUN-MARKDOWN-002-001.json");mkdirSync(resolve(target,".."),{recursive:true});const bytes=Buffer.from(`${JSON.stringify(artifact,null,2)}\n`);writeFileSync(target,bytes);console.log(JSON.stringify({target,rawDigest:sha256(bytes),correctionDigest:artifact.correctionDigest,oldFixtureDigest:sha256(prior),newFixtureDigest:sha256(current)},null,2));
}else throw new Error("use preserve or materialize");
