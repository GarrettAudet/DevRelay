import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const sourceUrl = new URL("WI-RUN-SNAPSHOT.attempt-001.task.json", directory);
const handoffUrl = new URL(
  "attempts/WI-RUN-SNAPSHOT.attempt-001.handoff.raw.json",
  directory,
);
const targetUrl = new URL("WI-RUN-SNAPSHOT.attempt-002.task.json", directory);
const loaderPath =
  "C:/Users/garre/OneDrive/Documents/Portable Best Practices/.tmp-devrelay-snapshot-dependency-loader.mjs";

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const source = JSON.parse(readFileSync(sourceUrl, "utf8"));
const handoffBytes = readFileSync(handoffUrl);
const loaderDigest = sha256(readFileSync(loaderPath));

const target = {
  ...source,
  contractId: "WETC-WI-RUN-SNAPSHOT-002",
  executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-002",
  attempt: 2,
  contextPaths: [
    ...source.contextPaths,
    "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-SNAPSHOT.attempt-001.handoff.raw.json",
  ],
  hostRuntimeSupply: {
    dependencyResolver: {
      mode: "project-first-then-version-pinned-host-fallback",
      path: loaderPath,
      digest: loaderDigest,
    },
    dependencyTrees: [
      {
        authority: "project-read-supply",
        path: "C:/tmp/DevRelay-v04-work-dependency-analysis/node_modules",
        repositoryWriteGrant: false,
      },
      {
        authority: "host-read-supply",
        path: "C:/Users/garre/OneDrive/Documents/Portable Best Practices/node_modules",
        repositoryWriteGrant: false,
        exactPackages: [{ name: "ajv", version: "8.20.0" }],
      },
    ],
  },
  handoff: {
    ...source.handoff,
    requiredShape: {
      ...source.handoff.requiredShape,
      executionId: "WE-RUN-DOGFOOD-WI-RUN-SNAPSHOT-ATTEMPT-002",
    },
  },
  requiredCorrections: [
    "Preserve the bounded attempt-1 Snapshot implementation bytes unless the corrected host supply reveals a concrete implementation defect.",
    "Verify the loader digest before execution and run the focused suite through that exact loader.",
    "Return pass only if all focused behavioral tests and both syntax checks pass.",
  ],
  revisionLineage: {
    route: "fix",
    classification: "environment-or-tooling",
    rootCause:
      "The attempt-1 contract declared Ajv 8.20.0 but its resolver searched only the incomplete project dependency tree; the exact approved host tree contains Ajv 8.20.0.",
    predecessorTaskContract: {
      artifactId: source.contractId,
      digest: sha256(readFileSync(sourceUrl)),
    },
    predecessorHandoff: {
      artifactId: "WI-RUN-SNAPSHOT.attempt-001.handoff.raw.json",
      digest: sha256(handoffBytes),
    },
  },
};

writeFileSync(targetUrl, `${JSON.stringify(target, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    target: targetUrl.pathname,
    digest: sha256(readFileSync(targetUrl)),
    loaderDigest,
  }),
);
