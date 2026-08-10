import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const expectedExports = [
  "ARCHITECTURE_HOST_EXECUTOR_CAPABILITIES",
  "ARCHITECTURE_DISCOVERY_ANALYZER_PORT_VERSION",
  "ARCHITECTURE_DISCOVERY_ARTIFACT_KINDS",
  "applyArchitectureDiscoveryGapPolicy",
  "architectureDiscoveryCheckpointKey",
  "architectureDiscoveryTraceabilityContributor",
  "bindArchitectureDiscoveryInputs",
  "createArchitectureDiscoveryAnalyzerRegistry",
  "createArchitectureDiscoveryCheckpointController",
  "createArchitectureDiscoveryTraceabilityContributor",
  "createArchitectureDesignHostExecutorRegistry",
  "createCurrentArchitectureSnapshot",
  "createMadrHostExecutorAdapter",
  "createNativeArchitectureInventory",
  "createOpenSpecDesignHostExecutorAdapter",
  "createStructurizrHostExecutorAdapter",
  "evaluateArchitectureDiscoveryGapPolicy",
  "guardArchitectureDiscoveryInputs",
  "normalizeArchitectureDiscoveryObservations",
  "routeArchitectureDiscovery",
  "runNativeArchitectureInventory",
  "selectArchitectureDiscoveryRoute",
  "validateArchitectureDiscoveryArtifact",
  "ArchitectureHostExecutorAdapterError",
];

const expectedHostExecutorSubpathExports = [
  "ARCHITECTURE_HOST_EXECUTOR_CAPABILITIES",
  "ArchitectureHostExecutorAdapterError",
  "createArchitectureDesignHostExecutorRegistry",
  "createMadrHostExecutorAdapter",
  "createOpenSpecDesignHostExecutorAdapter",
  "createStructurizrHostExecutorAdapter",
];

test("public package exposes only the verified ArchitectureDiscovery building blocks", async () => {
  const source = await read("src/index.mjs");
  const sectionStart = source.indexOf("ARCHITECTURE_DISCOVERY_ARTIFACT_KINDS");
  const sectionEnd = source.indexOf("LIFECYCLE_RUN_REPORT_ARTIFACT_KINDS", sectionStart);
  const architectureDiscoverySection = source.slice(sectionStart, sectionEnd);
  for (const name of expectedExports) assert.match(architectureDiscoverySection, new RegExp(`\\b${name}\\b`), `missing public export ${name}`);
  const exposed = [...architectureDiscoverySection.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((match) => match[1]);
  assert.deepEqual([...new Set(exposed)].sort(), expectedExports.sort());
});

test("architecture host executors expose the exact root slice and package subpath surface", async () => {
  const source = await read("src/index.mjs");
  const sectionStart = source.indexOf("ARCHITECTURE_DISCOVERY_ARTIFACT_KINDS");
  const sectionEnd = source.indexOf("routeArchitectureDiscovery", sectionStart);
  const rootHostSection = source.slice(sectionStart, sectionEnd);
  const rootHostExports = [...rootHostSection.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((match) => match[1]).filter((name) => expectedHostExecutorSubpathExports.includes(name));
  assert.deepEqual([...new Set(rootHostExports)].sort(), [...expectedHostExecutorSubpathExports].sort());

  const subpath = await import("devrelay/adapters/architecture-host-executors");
  assert.deepEqual(Object.keys(subpath).sort(), [...expectedHostExecutorSubpathExports].sort());
});

test("operator guide states exact privacy, authority, maturity, and scenario boundaries", async () => {
  const [guide, readme] = await Promise.all([
    read("docs/architecture-discovery.md"),
    read("README.md"),
  ]);
  for (const text of [
    'transmission: { mode: "offline" }',
    "explicit grant",
    "observational",
    "needs_clarification",
    "baseline_drift",
    "adapterCalls: 0",
    "live upstream command adapter is shipped",
    "Complete:",
    "Uncertain:",
    "Blocked:",
    "Drifted:",
    "Resumed:",
    "Analyzer-swapped:",
  ]) assert.match(guide, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(guide, /does\s+not propose intended architecture/);
  assert.match(guide, /Adapters cannot declare materiality, make a Gate\s+decision, author graph operations/);
  assert.match(guide, /no live upstream command adapter is shipped/);
  assert.match(readme, /docs\/architecture-discovery\.md/);
  assert.doesNotMatch(readme, /does not ship an executable ArchitectureDiscovery Module/);
});
