import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const sourceUrl = new URL("WI-RUN-SNAPSHOT.attempt-002.task.json", directory);
const handoffUrl = new URL(
  "attempts/WI-RUN-SNAPSHOT.attempt-002.handoff.raw.json",
  directory,
);
const reviewUrl = new URL(
  "attempts/WI-RUN-SNAPSHOT.attempt-002.wiv.json",
  directory,
);
const targetUrl = new URL("WI-RUN-SNAPSHOT.attempt-003.task.json", directory);

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const source = JSON.parse(readFileSync(sourceUrl, "utf8"));

const target = {
  ...source,
  contractId: "WETC-WI-RUN-SNAPSHOT-003",
  executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-003",
  attempt: 3,
  contextPaths: [
    ...source.contextPaths,
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-002.handoff.raw.json",
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-002.wiv.json",
  ],
  handoff: {
    ...source.handoff,
    requiredShape: {
      ...source.handoff.requiredShape,
      executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-003",
    },
  },
  requiredCorrections: [
    "Validate the TraceabilityGraphSnapshot contract and require canonicalJsonDigest(snapshot) to equal the supplied exact graph reference digest.",
    "Reject stageDetails claims that lack digest-bound sourceFacts; merge those refs into each stage sourceFacts. Read stage performance from explicit contract-valid detail.performance rather than the nonexistent RunHostObservation.componentId field.",
    "Reject every RunHostObservation whose runId differs from the ledger checkpoint runId.",
    "Use canonical total-order keys for every unordered adapter-assessment and metric collection so reordered equivalent sets are byte-identical.",
    "Add positive and negative fixtures for graph substitution, unbound stage details, stage performance, cross-run observations, and tied sort keys.",
  ],
  revisionLineage: {
    route: "fix",
    classification: "verification-semantic-defect",
    predecessorTaskContract: {
      artifactId: source.contractId,
      digest: sha256(readFileSync(sourceUrl)),
    },
    predecessorHandoff: {
      artifactId: "WI-RUN-SNAPSHOT.attempt-002.handoff.raw.json",
      digest: sha256(readFileSync(handoffUrl)),
    },
    verificationReview: {
      artifactId: "WIV-WI-RUN-SNAPSHOT-ATTEMPT-002",
      digest: sha256(readFileSync(reviewUrl)),
    },
  },
};

writeFileSync(targetUrl, `${JSON.stringify(target, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    target: targetUrl.pathname,
    digest: sha256(readFileSync(targetUrl)),
  }),
);
