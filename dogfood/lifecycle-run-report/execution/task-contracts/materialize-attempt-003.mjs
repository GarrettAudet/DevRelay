import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const sourceUrl = new URL("WI-RUN-CONTRACTS.attempt-002.task.json", directory);
const reviewUrl = new URL("attempts/WI-RUN-CONTRACTS.attempt-002.wiv.json", directory);
const targetUrl = new URL("WI-RUN-CONTRACTS.attempt-003.task.json", directory);

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const source = JSON.parse(readFileSync(sourceUrl, "utf8"));
const reviewDigest = sha256(readFileSync(reviewUrl));

const target = {
  ...source,
  contractId: "WETC-WI-RUN-CONTRACTS-003",
  executionId: "WE-RUN-DOGFOOD-WI-RUN-CONTRACTS-ATTEMPT-003",
  attempt: 3,
  contextPaths: [
    ...source.contextPaths,
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-CONTRACTS.attempt-002.handoff.raw.json",
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-CONTRACTS.attempt-002.wiv.json",
  ],
  handoff: {
    ...source.handoff,
    requiredShape: {
      ...source.handoff.requiredShape,
      executionId: "WE-RUN-DOGFOOD-WI-RUN-CONTRACTS-ATTEMPT-003",
    },
  },
  requiredCorrections: [
    "Preserve every revision-2 correction and all eight closed provider-neutral interfaces.",
    "Replace adapter maturity values with exactly contract-defined, fixture-conformant, live-conformant, and release-ready; reject every unsupported value.",
    "Do not represent Core-owned implementation status as adapter maturity.",
    "Add positive and negative fixtures proving the exact approved vocabulary and rejection behavior.",
  ],
  revisionLineage: {
    route: "fix",
    sourceFinding: "Independent WorkItemVerification passed nine mechanics tests but found one approved architecture vocabulary defect; no revision-2 bytes were integrated.",
    predecessorTaskContract: {
      artifactId: "WETC-WI-RUN-CONTRACTS-002",
      digest: "sha256:3cb56e62a7779ddf8cb263084aa2df5f26e38dc05f9dd89fbe98c55bebfe3488",
    },
    predecessorHandoff: {
      artifactId: "WI-RUN-CONTRACTS.attempt-002.handoff.raw.json",
      digest: "sha256:d440ef137240af479d6e8603e964c20270931672bc2c26c8bdeae9c0062a15ca",
    },
    verificationReview: {
      artifactId: "WI-RUN-CONTRACTS.attempt-002.wiv.json",
      digest: reviewDigest,
    },
  },
};

writeFileSync(targetUrl, `${JSON.stringify(target, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ target: targetUrl.pathname, digest: sha256(readFileSync(targetUrl)) }));
