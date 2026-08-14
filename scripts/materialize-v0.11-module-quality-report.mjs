import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../src/content-digest.mjs";
import { createModuleQualityReport, renderModuleQualityReportMarkdown } from "../src/module-quality-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const exists = (relative) => fs.existsSync(path.join(root, relative));
const integrationDirs = ["integration-v2", "integration-v3", "integration-v4"].map((name) => path.join(root, "dogfood/v0.11-module-quality", name));
const byWorkItem = new Map();
for (const integrationDir of integrationDirs) {
  if (!fs.existsSync(integrationDir)) continue;
  for (const entry of fs.readdirSync(integrationDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const recordPath = path.join(integrationDir, entry.name, "integrated-change-record.json");
    if (!fs.existsSync(recordPath)) continue;
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    byWorkItem.set(entry.name, { workItemId: entry.name, outcome: "integrated", integratedChange: { digest: record.recordDigest } });
  }
}
const providers = exists("dogfood/v0.11-module-quality/providers/live-provider-evidence.json") ? read("dogfood/v0.11-module-quality/providers/live-provider-evidence.json") : null;
const godot = exists("dogfood/v0.11-module-quality/providers/godot-adapter-evidence.json") ? read("dogfood/v0.11-module-quality/providers/godot-adapter-evidence.json") : null;
const providerRows = [
  ["OpenSpec", providers ? "live-conformant" : "contract-defined", "providers/live-provider-evidence.json"],
  ["Spec Kit", providers ? "live-conformant" : "contract-defined", "providers/live-provider-evidence.json"],
  ["Structurizr", providers ? "live-conformant" : "fixture-conformant", "providers/live-provider-evidence.json"],
  ["MADR", providers ? "live-conformant" : "fixture-conformant", "providers/live-provider-evidence.json"],
  ["Godot AI MCP", godot ? "live-conformant" : "contract-defined", "providers/godot-adapter-evidence.json"],
  ["GdUnit4", godot ? "live-conformant" : "contract-defined", "providers/godot-adapter-evidence.json"],
].map(([id, maturity, evidence]) => ({ id, maturity, evidence }));
const systemVerified = exists("dogfood/v0.11-module-quality/final-acceptance/system-verification-result.json");
const businessAccepted = exists("dogfood/v0.11-module-quality/final-acceptance/business-acceptance-record.json");
const rows = [
  ["RequirementsGathering", "gather-change", "OpenSpec + Spec Kit strategies", "live-conformant", "promoted", "requirements promotion"],
  ["RequirementsGate", "promote-pair", "Core", "core-owned", "promoted", "requirements Gate"],
  ["ArchitectureDesign", "design-change", "OpenSpec + Structurizr + MADR", "live-conformant", "promoted", "architecture generation 2"],
  ["ArchitectureGate", "promote-baseline", "Core", "core-owned", "promoted", "architecture Gate"],
  ["ContractGeneration", "generate-change", "native JSON Schema", "core-owned", "promoted", "contract baseline"],
  ["ContractGate", "promote-baseline", "Core", "core-owned", "promoted", "contract Gate"],
  ["WorkBreakdown", "decompose-change", "native structured proposer", "core-owned", "promoted", "work breakdown baseline"],
  ["WorkDependencyAnalysis", "analyze-dependencies", "native proposer + Graphology-DAG + OPA", "core-owned", "promoted", "dependency baseline"],
  ["SpecialistAssignment", "assign-specialists", "A2A + native ranker", "core-owned", "promoted", "assignment baseline"],
  ["WorkExecution", "execute-work-item", "ChatGPT Desktop executor", "core-owned", byWorkItem.size ? "passed" : "pending", "execution-v2"],
  ["WorkItemVerification", "verify-work-item", "test verifier + live provider evidence", "core-owned", byWorkItem.size ? "verified" : "pending", "verification-v2"],
  ["ChangeIntegration", "integrate-change", "local Git adapter", "core-owned", byWorkItem.size ? "integrated" : "pending", "integration-v2"],
  ["SystemVerification", "verify-system", "test and review verifiers", "core-owned", systemVerified ? "verified" : "pending", systemVerified ? "final acceptance evidence" : "not run"],
  ["BusinessAcceptance", "accept-release", "owner Gate", "core-owned", businessAccepted ? "accepted" : "pending", businessAccepted ? "final acceptance record" : "not requested"],
];
const stages = rows.map((row, index) => ({ sequence: index + 1, module: row[0], operation: row[1], plugin: row[2], maturity: row[3], outcome: row[4], evidence: row[5] }));
const workItems = [...byWorkItem.values()].map((result) => ({ id: result.workItemId, outcome: result.outcome, evidence: result.integratedChange.digest }));
const report = createModuleQualityReport({
  reportId: "MQR-DEVRELAY-V011",
  runId: "v0.11-module-quality-generation-4",
  stages,
  workItems,
  providers: providerRows,
  metrics: [
    { name: "integratedWorkItems", value: byWorkItem.size, provenance: "canonical integration-v2/v3/v4 records" },
    { name: "liveProviderOperations", value: providers?.operations?.length ?? 0, provenance: "live provider evidence" },
    { name: "godotAdapterOperations", value: godot?.operations?.length ?? 0, provenance: "Godot adapter evidence" },
  ],
  nextAction: businessAccepted ? "Promote the sealed V0.11 release candidate." : byWorkItem.size === 16 ? "Run SystemVerification and BusinessAcceptance." : "Execute the next Core-derived ready DAG frontier.",
});
const markdown = renderModuleQualityReportMarkdown(report);
const out = path.join(root, "dogfood/v0.11-module-quality/lifecycle-report");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "module-quality-report.json"), canonicalJson(report) + "\n", "utf8");
fs.writeFileSync(path.join(out, "module-quality-report.md"), markdown, "utf8");
process.stdout.write(JSON.stringify({ reportDigest: report.reportDigest, integratedWorkItems: byWorkItem.size, providerCount: report.providers.length }, null, 2) + "\n");
