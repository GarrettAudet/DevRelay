import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  deriveReadyFrontier,
  validateLifecycleRunReportArtifact,
} from "../../src/index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = fileURLToPath(new URL("./frontier-2/", import.meta.url));
const readJson = (relativePath) =>
  JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
const writeJson = (name, value) => {
  const target = resolve(outputRoot, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${canonicalJson(value)}\n`, "utf8");
};
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});

const baseline = readJson("project/work-dependency-baseline.json");
const breakdown = readJson("project/work-breakdown-baseline.json");
const execution = readJson(
  "dogfood/sim-001-simplification/execution-frontier-1/execution-summary.json",
);
const verification = readJson(
  "dogfood/sim-001-simplification/verification-frontier-1/verification-summary.json",
);
const integration = readJson(
  "dogfood/sim-001-simplification/integration-frontier-1/integration-summary.json",
);

const completionFacts = integration.results
  .map((integrated) => {
    const executed = execution.executions.find(
      ({ workItemId }) => workItemId === integrated.workItemId,
    );
    const verified = verification.results.find(
      ({ workItemId }) => workItemId === integrated.workItemId,
    );
    const workItem = breakdown.workItems.find(
      ({ id }) => id === integrated.workItemId,
    );
    if (!executed || !verified || !workItem || integrated.outcome !== "integrated") {
      throw new Error(`incomplete integration closure for ${integrated.workItemId}`);
    }
    const fact = seal(
      {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "IntegratedCompletionFact",
        completionId: `COMPLETION-${integrated.workItemId}-001`,
        workItem: {
          artifactId: workItem.id,
          digest: canonicalJsonDigest(workItem),
        },
        changeSet: {
          artifactId: executed.changeSet.artifactId,
          digest: executed.changeSet.digest,
        },
        verification: verified.gateApproval,
        integration: integrated.integratedChange,
        status: "verified-and-integrated",
        authority: "factual-completion",
      },
      "completionDigest",
    );
    validateLifecycleRunReportArtifact(fact);
    return fact;
  })
  .sort((left, right) => left.completionId.localeCompare(right.completionId, "en"));

const readyFrontier = deriveReadyFrontier({
  baseline,
  completionFacts,
  frontierId: "FRONTIER-SIM-001-002",
});
const executionFacts = completionFacts.map((fact) => ({
  workItemId: fact.workItem.artifactId,
  authority: "approved",
  integrationRef: fact.integration,
  evidence: [fact.verification],
}));
const executionFactSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "IntegratedCompletionFactSet",
  facts: executionFacts,
  factsDigest: canonicalJsonDigest(executionFacts),
};

for (const fact of completionFacts) {
  writeJson(`${fact.completionId}.json`, fact);
}
writeJson("integrated-completion-fact-set.json", executionFactSet);
writeJson("ready-frontier.json", readyFrontier);
process.stdout.write(`${JSON.stringify(readyFrontier, null, 2)}\n`);
