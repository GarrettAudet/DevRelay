import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, canonicalJsonDigest, deriveReadyFrontier, validateLifecycleRunReportArtifact } from "../../src/index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = fileURLToPath(new URL("./frontier-7/", import.meta.url));
const readJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
const writeJson = (name, value) => {
  const target = resolve(outputRoot, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${canonicalJson(value)}\n`, "utf8");
};
const compact = ({ artifactId, digest }) => ({ artifactId, digest });
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))),
});

const baseline = readJson("project/work-dependency-baseline.json");
const breakdown = readJson("project/work-breakdown-baseline.json");
const firstFacts = [
  "WI-SIM-API-COMPAT",
  "WI-SIM-CLI",
  "WI-SIM-EVIDENCE-ASSETS",
  "WI-SIM-FACADE",
  "WI-SIM-HOST-EXECUTION",
  "WI-SIM-HOST-ISOLATION",
  "WI-SIM-HOST-STORAGE",
  "WI-SIM-PACK-CONFORMANCE",
  "WI-SIM-PROFILES",
  "WI-SIM-REGRESSION-GATES",
  "WI-SIM-VERSION-DOCS",
].map((id) => readJson(`dogfood/sim-001-simplification/frontier-6/COMPLETION-${id}-001.json`))
const execution = readJson("dogfood/sim-001-simplification/execution-frontier-6/execution-summary.json");
const verification = readJson("dogfood/sim-001-simplification/verification-frontier-6/verification-summary.json");
const integration = readJson("dogfood/sim-001-simplification/integration-frontier-6/integration-summary.json");
const integratedRefs = new Map(integration.results.map((entry) => [entry.workItemId, entry.integratedChange]));

const newFacts = [...integratedRefs].map(([workItemId, integration]) => {
  const workItem = breakdown.workItems.find(({ id }) => id === workItemId);
  const executed = execution.executions.find((entry) => entry.workItemId === workItemId);
  const verified = verification.results.find((entry) => entry.workItemId === workItemId);
  if (!workItem || !executed || !verified) throw new Error(`incomplete closure for ${workItemId}`);
  const fact = seal({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "IntegratedCompletionFact",
    completionId: `COMPLETION-${workItemId}-001`,
    workItem: { artifactId: workItem.id, digest: canonicalJsonDigest(workItem) },
    changeSet: compact(executed.changeSet),
    verification: compact(verified.gateApproval),
    integration: compact(integration),
    status: "verified-and-integrated",
    authority: "factual-completion",
  }, "completionDigest");
  validateLifecycleRunReportArtifact(fact);
  return fact;
});
const completionFacts = [...firstFacts, ...newFacts].sort((left, right) => left.completionId.localeCompare(right.completionId, "en"));
const readyFrontier = deriveReadyFrontier({ baseline, completionFacts, frontierId: "FRONTIER-SIM-001-007" });
const executionFacts = completionFacts.map((fact) => ({ workItemId: fact.workItem.artifactId, authority: "approved", integrationRef: fact.integration, evidence: [fact.verification] }));
const executionFactSet = { apiVersion: "devrelay.dev/v1alpha1", kind: "IntegratedCompletionFactSet", facts: executionFacts, factsDigest: canonicalJsonDigest(executionFacts) };
for (const fact of completionFacts) writeJson(`${fact.completionId}.json`, fact);
writeJson("integrated-completion-fact-set.json", executionFactSet);
writeJson("ready-frontier.json", readyFrontier);
process.stdout.write(`${JSON.stringify(readyFrontier, null, 2)}\n`);
