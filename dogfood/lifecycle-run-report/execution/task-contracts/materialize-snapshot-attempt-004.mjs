import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const sourceUrl = new URL("WI-RUN-SNAPSHOT.attempt-003.task.json", directory);
const handoffUrl = new URL(
  "attempts/WI-RUN-SNAPSHOT.attempt-003.handoff.raw.json",
  directory,
);
const reviewUrl = new URL(
  "attempts/WI-RUN-SNAPSHOT.attempt-003.wiv.json",
  directory,
);
const targetUrl = new URL("WI-RUN-SNAPSHOT.attempt-004.task.json", directory);

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const source = JSON.parse(readFileSync(sourceUrl, "utf8"));

const target = {
  ...source,
  contractId: "WETC-WI-RUN-SNAPSHOT-004",
  executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-004",
  attempt: 4,
  contextPaths: [
    ...source.contextPaths,
    "src/traceability-graph.mjs",
    "test/traceability-diagnostics.test.mjs",
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-003.handoff.raw.json",
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-003.wiv.json",
  ],
  handoff: {
    ...source.handoff,
    requiredShape: {
      ...source.handoff.requiredShape,
      executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-004",
    },
  },
  requiredCorrections: [
    "Preserve every revision-3 correction and all five passing regression fixtures.",
    "Invoke the released diagnoseTraceabilityGraph capability on the exact validated graph snapshot.",
    "Normalize graph diagnostics into the closed LifecycleRunSnapshot diagnostic contract with the exact graph reference as source, merge any projection-specific diagnostics, deduplicate, and apply a canonical total order.",
    "Add focused fixtures proving TG_ORPHAN_REQUIREMENT, TG_UNSCOPED_WORK, and TG_MISSING_EVIDENCE remain visible, and restore an exact readable trace-path assertion.",
  ],
  revisionLineage: {
    route: "fix",
    classification: "verification-acceptance-gap",
    predecessorTaskContract: {
      artifactId: source.contractId,
      digest: sha256(readFileSync(sourceUrl)),
    },
    predecessorHandoff: {
      artifactId: "WI-RUN-SNAPSHOT.attempt-003.handoff.raw.json",
      digest: sha256(readFileSync(handoffUrl)),
    },
    verificationReview: {
      artifactId: "WIV-WI-RUN-SNAPSHOT-ATTEMPT-003",
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
