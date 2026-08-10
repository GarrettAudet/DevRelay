import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const sourceUrl = new URL("WI-RUN-SNAPSHOT.attempt-004.task.json", directory);
const targetUrl = new URL("WI-RUN-SNAPSHOT.attempt-005.task.json", directory);
const reviewUrl = new URL("attempts/WI-RUN-SNAPSHOT.attempt-004.wiv.json", directory);
const handoffUrl = new URL("attempts/WI-RUN-SNAPSHOT.attempt-005.handoff.raw.json", directory);
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const review = {
  apiVersion:"devrelay.dev/v1alpha1", kind:"BootstrapWorkItemVerificationReview",
  reviewId:"WIV-WI-RUN-SNAPSHOT-ATTEMPT-004", executionId:"WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-004", workItemId:"WI-RUN-SNAPSHOT",
  taskContract:{artifactId:"WETC-WI-RUN-SNAPSHOT-004",digest:"sha256:d84f40b10c63919d9fb4530790b9bd4caa84abb2e75471a4033c444faf82b220"},
  rawHandoff:{artifactId:"WI-RUN-SNAPSHOT.attempt-004.handoff.raw.json",digest:"sha256:dec86912ca4011f2dff3197df014a0caffc748ee48b8cffffcf02463938fe09c"},
  changedFiles:["src/lifecycle-run-report-snapshot.mjs","test/lifecycle-run-report-snapshot.test.mjs"],
  focusedVerification:{command:"node --experimental-loader=file:///C:/Users/garre/OneDrive/Documents/Portable%20Best%20Practices/.tmp-devrelay-snapshot-dependency-loader.mjs --test test/lifecycle-run-report-snapshot.test.mjs",hostSupply:"ajv-8.20.0-read-only-fallback",exitCode:0,tests:6},
  outcome:"fix",
  findings:[{code:"RUN_SNAPSHOT_TRACE_ENTITY_IDENTITY_COLLAPSED",requirementRefs:["AC-DEV-RUN-TRACE-JOIN-001"],architectureRefs:["EL-RUN-SNAPSHOT-PROJECTOR","CON-RUN-DYNAMIC-PROJECTION","IF-RUN-LIFECYCLE-SNAPSHOT"],detail:"Revision 4 used shared source-artifact refs for TraceabilityPath endpoints, collapsing distinct baseline entities."}],
  outputDigests:{"src/lifecycle-run-report-snapshot.mjs":"sha256:ac1aaf7f807c9dbea058026dc7924b1e9f83a6351b3035d29301571ea70cbae4","test/lifecycle-run-report-snapshot.test.mjs":"sha256:c3335f514fb505c8965ca8bf2b53598284504fb87346cd00711288188c5981e1"},
  progressionAllowed:false,nextRoute:"fix"
};
writeFileSync(reviewUrl, `${JSON.stringify(review,null,2)}\n`, "utf8");

const source = JSON.parse(readFileSync(sourceUrl,"utf8"));
const target = {
  ...source, contractId:"WETC-WI-RUN-SNAPSHOT-005", executionId:"WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-005", attempt:5,
  verification:{...source.verification,commands:["node --experimental-loader=file:///C:/Users/garre/OneDrive/Documents/Portable%20Best%20Practices/.tmp-devrelay-snapshot-dependency-loader.mjs --test test/lifecycle-run-report-snapshot.test.mjs"]},
  contextPaths:[...source.contextPaths,"dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-004.handoff.raw.json","dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-004.wiv.json"],
  handoff:{...source.handoff,requiredShape:{...source.handoff.requiredShape,executionId:"WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-005"}},
  requiredCorrections:[
    "Preserve every revision-4 correction and all six passing focused fixtures.",
    "Use artifactId node:<kind>:<stableId> with digest node.contentDigest for every TraceabilityPath endpoint while retaining source artifact references as important-artifact evidence.",
    "Emit one canonical traceability path segment per active graph edge.",
    "Replace collapsed source-artifact assertions with exact intermediate entity segments while retaining all released graph diagnostics."
  ],
  revisionLineage:{route:"fix",classification:"verification-acceptance-gap",predecessorTaskContract:{artifactId:"WETC-WI-RUN-SNAPSHOT-004",digest:"sha256:d84f40b10c63919d9fb4530790b9bd4caa84abb2e75471a4033c444faf82b220"},predecessorHandoff:{artifactId:"WI-RUN-SNAPSHOT.attempt-004.handoff.raw.json",digest:"sha256:dec86912ca4011f2dff3197df014a0caffc748ee48b8cffffcf02463938fe09c"},verificationReview:{artifactId:"WIV-WI-RUN-SNAPSHOT-ATTEMPT-004",digest:sha256(readFileSync(reviewUrl))}}
};
writeFileSync(targetUrl, `${JSON.stringify(target,null,2)}\n`, "utf8");

const handoff = `{ "apiVersion": "devrelay.dev/v1alpha1", "kind": "BootstrapWorkItemHandoff", "executionId": "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-005", "workItemId": "WI-RUN-SNAPSHOT", "outcome": "pass", "changedFiles": [ "src/lifecycle-run-report-snapshot.mjs", "test/lifecycle-run-report-snapshot.test.mjs" ], "verification": [ { "command": "node --experimental-loader=file:///C:/Users/garre/OneDrive/Documents/Portable%20Best%20Practices/.tmp-devrelay-snapshot-dependency-loader.mjs --test test/lifecycle-run-report-snapshot.test.mjs", "exitCode": 0, "summary": "All 6 focused behavioral tests passed." }, { "command": "node --check src/lifecycle-run-report-snapshot.mjs", "exitCode": 0, "summary": "Implementation module passed Node.js syntax validation." }, { "command": "node --check test/lifecycle-run-report-snapshot.test.mjs", "exitCode": 0, "summary": "Focused test module passed Node.js syntax validation." } ], "evidence": [ { "kind": "lifecycle-run-report/snapshot-tests", "relativePath": "test/lifecycle-run-report-snapshot.test.mjs", "digest": "sha256:a8d2780a9e2328d24c11a4930d335f46131fc6cf2f77e873328dc9f45d6a7470" } ], "notes": "Preserved all revision-4 behavior and tests. Traceability paths now use exact graph-entity identities and content digests, emit one canonical segment per active edge, retain source artifacts as important-artifact evidence, and assert every intermediate chain segment alongside all required graph diagnostics.", "residualRisks": [ "none" ] }`;
writeFileSync(handoffUrl, `${handoff}\n`, "utf8");
console.log(JSON.stringify({reviewDigest:sha256(readFileSync(reviewUrl)),taskDigest:sha256(readFileSync(targetUrl)),handoffDigest:sha256(readFileSync(handoffUrl))},null,2));
