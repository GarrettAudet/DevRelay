import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { createOpenSpecRequirementsAdapter } from "../../src/openspec-requirements-adapter.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { requirementsTraceabilityContributor } from "../../src/requirements-traceability-contributor.mjs";

const root = new URL("../../", import.meta.url);
const here = new URL("./", import.meta.url);
const API = "devrelay.dev/v1alpha1";
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });
const exactRef = (artifactId, schema, mediaType, bytes, uri) => ({
  artifactId,
  schema,
  mediaType,
  digest: sha256Digest(bytes),
  uri,
});

const files = new Map();
const bytesById = new Map();
function keep(name, ref, bytes) {
  const copy = Buffer.from(bytes);
  files.set(name, copy);
  bytesById.set(ref.artifactId, copy);
  return ref;
}
function keepJson(name, artifactId, schema, mediaType, value) {
  const bytes = jsonBytes(value);
  return keep(name, exactRef(artifactId, schema, mediaType, bytes, `devrelay://dogfood/chatgpt-desktop-list-runs/${name}`), bytes);
}

const [moduleDefinition, pluginDefinition, priorRequirementsBytes, priorOverviewBytes, priorMarkdownBytes] = await Promise.all([
  readFile(new URL("examples/modules/requirements-gathering.module.json", root), "utf8").then(JSON.parse),
  readFile(new URL("examples/plugins/openspec.plugin.json", root), "utf8").then(JSON.parse),
  readFile(new URL("project/requirements-baseline.json", root)),
  readFile(new URL("project/project-overview-baseline.json", root)),
  readFile(new URL("ProjectOverview.md", root)),
]);
const priorRequirements = JSON.parse(priorRequirementsBytes);
const priorOverview = JSON.parse(priorOverviewBytes);
if (priorRequirements.baselineId === "requirements-baseline-devrelay-v1-chatgpt-desktop-list-runs-001") {
  process.stdout.write(`${JSON.stringify({ outcome: "checkpoint-replay", requirementsBaseline: sha256Digest(priorRequirementsBytes), projectOverviewBaseline: sha256Digest(priorOverviewBytes), gate: "pass" }, null, 2)}\n`);
  process.exit(0);
}
const priorRequirementsRef = exactRef(priorRequirements.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", priorRequirementsBytes, "devrelay://project/requirements-baseline.json");
const priorOverviewRef = exactRef(priorOverview.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", priorOverviewBytes, "devrelay://project/project-overview-baseline.json");
bytesById.set(priorRequirementsRef.artifactId, priorRequirementsBytes);
bytesById.set(priorOverviewRef.artifactId, priorOverviewBytes);
bytesById.set(priorOverview.renderedDocument.artifact.artifactId, priorMarkdownBytes);

const goal = {
  apiVersion: API,
  kind: "GoalArtifact",
  goalId: "goal-chatgpt-desktop-list-runs-v1",
  statement: "Add a deterministic, read-only devrelay_list_runs command to the local ChatGPT Desktop on Windows plugin.",
  objectives: [
    "Let a Desktop operator discover persisted DevRelay runs before selecting one to inspect or resume.",
    "Return bounded privacy-safe run summaries with stable ordering and pagination.",
    "Report corrupt or unreadable run records without repairing, deleting, or otherwise mutating them.",
  ],
  constraints: [
    "The command is local to the current configured project/store and is read-only.",
    "Newest-first ordering uses run identity as the deterministic tie-breaker.",
    "The default page size is 50 and every page is bounded.",
    "Summaries cannot expose prompts, source content, credentials, or raw evidence.",
    "The public Desktop MCP contract must be generated and gated before implementation.",
  ],
  acceptanceCriteria: [
    "The command returns run ID, revision, lifecycle state, checkpoint, recovery status, and timestamps for readable runs.",
    "Pagination is bounded, stable, and newest-first with run ID as the deterministic tie-breaker.",
    "Unreadable or corrupt runs are reported diagnostically and left byte-for-byte unchanged.",
    "The MCP surface accepts only the declared list-runs inputs and returns only the declared safe output.",
  ],
  assumptions: ["The project owner approved the exact list-runs scope in chat."],
};
const context = {
  apiVersion: API,
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay has an approved ChatGPT Desktop runtime baseline with a persistent local run store and seven typed MCP commands; this change adds safe run discovery as the eighth command.",
  stakeholders: ["DevRelay product owner", "ChatGPT Desktop Windows operators", "DevRelay maintainers", "Security and release reviewers"],
  domainConstraints: [
    "Core remains the lifecycle and authority owner.",
    "The operation cannot mutate run state or TraceabilityGraph.",
    "The response is metadata-only and local to the configured store.",
  ],
  conventions: [
    "Use exact SHA-256 artifact identities and version-pinned baselines.",
    "Use explicit bounded pagination and closed MCP request/response schemas.",
    "Fail closed on malformed inputs while reporting per-run storage corruption without mutation.",
  ],
  sourceRefs: [],
};
const goalRef = keepJson("goal.json", goal.goalId, "https://devrelay.dev/artifacts/goal/v1", "application/vnd.devrelay.goal+json", goal);
const contextRef = keepJson("project-context.json", "project-context-chatgpt-desktop-list-runs-v1", "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", context);
const sources = [
  { role: "goal", artifact: pointer(goalRef), location: "Project owner approved the exact list-runs scope in chat." },
  { role: "requirements-baseline", artifact: pointer(priorRequirementsRef) },
];

const replacement = structuredClone(priorRequirements.requirements);
const AC = [
  ["AC-DEV-DESKTOP-LIST-RUNS-001", "devrelay_list_runs returns each readable run's run ID, revision, lifecycle state, checkpoint identity when present, recovery status, and created/updated timestamps.", "Create multiple persisted runs and compare the typed response to their exact latest valid revisions and lifecycle states."],
  ["AC-DEV-DESKTOP-LIST-RUNS-ORDER-001", "Run summaries are ordered newest-first with run ID as the deterministic tie-breaker.", "Fix run timestamps including equal timestamps and assert byte-stable ordering across repeated calls and process restarts."],
  ["AC-DEV-DESKTOP-LIST-RUNS-PAGE-001", "Run listing uses bounded cursor pagination with a default page size of 50 and rejects out-of-range limits or malformed cursors.", "Exercise default, minimum, maximum, continuation, terminal, and malformed pagination cases through the MCP command."],
  ["AC-DEV-DESKTOP-LIST-RUNS-PRIVACY-001", "Run summaries never expose prompts, source content, credentials, artifact bytes, or raw evidence.", "Seed sensitive canaries in stored artifacts and assert that neither structured output nor diagnostics contain them."],
  ["AC-DEV-DESKTOP-LIST-RUNS-CORRUPTION-001", "Unreadable and corrupt run records are reported with bounded diagnostics and no storage mutation.", "Hash the store before and after listing a mixed healthy/corrupt fixture and prove identical bytes and metadata."],
  ["AC-DEV-DESKTOP-LIST-RUNS-MCP-001", "The Desktop MCP server exposes devrelay_list_runs as one closed read-only command without route, Gate, execution, graph, or repair authority.", "Validate tools/list and positive/negative tools/call cases and prove unsupported fields and authority-bearing inputs are rejected."],
].map(([id, statement, verification]) => ({ id, statement, verification, sourceRefs: structuredClone(sources) }));
replacement.acceptanceCriteria.push(...AC);
const acIds = AC.map(({ id }) => id).sort((left, right) => left.localeCompare(right));
replacement.capabilities.push({
  id: "CAP-DEV-DESKTOP-RUN-DISCOVERY-001",
  name: "ChatGPT Desktop run discovery",
  description: "Discover and page through persisted local DevRelay runs using deterministic privacy-safe summaries without mutating run state.",
  businessObjectiveIds: ["BO-DEV-DETERMINISM-001", "BO-DEV-OBSERVABILITY-001", "BO-DEV-QUALITY-001"],
  userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
  audience: "user-facing",
  key: true,
  priority: "must",
  sourceRefs: structuredClone(sources),
});
const desktopJourney = replacement.userJourneys.find(({ id }) => id === "UJ-DEV-DESKTOP-GOAL-TO-ACCEPTANCE-001");
desktopJourney.capabilityIds = [...new Set([...desktopJourney.capabilityIds, "CAP-DEV-DESKTOP-RUN-DISCOVERY-001"])];
replacement.userStories.push({
  id: "US-DEV-DESKTOP-LIST-RUNS-001",
  userId: "USR-DEV-WORKFLOW-AUTHOR-001",
  capabilityId: "CAP-DEV-DESKTOP-RUN-DISCOVERY-001",
  userJourneyIds: ["UJ-DEV-DESKTOP-GOAL-TO-ACCEPTANCE-001"],
  need: "List persisted local runs before choosing the exact run to inspect or resume.",
  benefit: "The Desktop workflow remains operable across restarts and multiple concurrent or historical runs without guessing run identities.",
  priority: "must",
  acceptanceCriterionIds: acIds,
  sourceRefs: structuredClone(sources),
});
for (const [id, additions] of [
  ["NFR-DEV-DESKTOP-DETERMINISM-001", ["AC-DEV-DESKTOP-LIST-RUNS-ORDER-001", "AC-DEV-DESKTOP-LIST-RUNS-PAGE-001"]],
  ["NFR-DEV-RUN-REPORT-PRIVACY-001", ["AC-DEV-DESKTOP-LIST-RUNS-PRIVACY-001"]],
]) {
  const item = replacement.nonFunctionalRequirements.find((entry) => entry.id === id);
  item.acceptanceCriterionIds = [...new Set([...item.acceptanceCriterionIds, ...additions])];
}
replacement.scope.push({ id: "SCOPE-DEV-DESKTOP-LIST-RUNS-001", statement: "A read-only, paginated, privacy-safe local Desktop command for persisted run discovery.", sourceRefs: structuredClone(sources) });
replacement.deliverables.push("A typed devrelay_list_runs Desktop MCP command with deterministic run-store discovery, lifecycle summaries, tests, documentation, and acceptance evidence.");
replacement.requiredEvidence.push("desktop/list-runs-store-conformance", "desktop/list-runs-mcp-conformance", "desktop/list-runs-privacy", "desktop/list-runs-corruption-nonmutation");
replacement.currentStatus = { lifecycle: "existing", phase: "implementation", summary: "The controlled ChatGPT Desktop Windows release is building devrelay_list_runs as its clean end-to-end production feature proof.", sourceRefs: structuredClone(sources) };
for (const field of ["capabilities", "userStories", "acceptanceCriteria", "scope"]) replacement[field].sort((left, right) => left.id.localeCompare(right.id));
desktopJourney.capabilityIds.sort((left, right) => left.localeCompare(right));
for (const item of replacement.nonFunctionalRequirements) item.acceptanceCriterionIds.sort((left, right) => left.localeCompare(right));
replacement.deliverables.sort((left, right) => left.localeCompare(right));
replacement.requiredEvidence.sort((left, right) => left.localeCompare(right));

const invocation = {
  apiVersion: API,
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-chatgpt-desktop-list-runs-v1",
  runId: "desktop-clean-run-list-runs-v1",
  nodeId: "requirements-gathering",
  module: { id: "requirements-gathering", version: "0.1.0", operation: "gather" },
  plugin: { id: "openspec", version: "0.1.0" },
  inputs: { goal: [goalRef], "project-context": [contextRef], "requirements-baseline": [priorRequirementsRef], "project-overview-baseline": [priorOverviewRef] },
  options: {},
  config: { projectRoot: "C:/repos/DevRelay", toolName: "OpenSpec", toolVersion: "conversation-contract-v1", nativeOperation: "requirements.gather", changeName: "chatgpt-desktop-list-runs", schema: "devrelay-requirements", bridge: "agent-command" },
  grants: [
    { kind: "filesystem.read", scope: "C:/repos/DevRelay" },
    { kind: "filesystem.write", scope: "C:/repos/DevRelay/openspec/changes" },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ],
};
const checkpoints = new Map();
const adapter = createOpenSpecRequirementsAdapter({
  loadArtifact: async (ref) => Buffer.from(bytesById.get(ref.artifactId) ?? []),
  persistArtifact: async ({ artifactId, schema, mediaType, digest, bytes }) => {
    const ref = { artifactId, schema, mediaType, digest, uri: `devrelay://dogfood/chatgpt-desktop-list-runs/artifacts/${artifactId}` };
    bytesById.set(artifactId, Buffer.from(bytes));
    return ref;
  },
  executeCapability: async (request) => ({
    apiVersion: API,
    kind: "OpenSpecRequirementsProposal",
    binding: request.binding,
    requirements: replacement,
    nativeArtifacts: [
      { role: "proposal", path: "openspec/changes/chatgpt-desktop-list-runs/proposal.md", mediaType: "text/markdown", content: "# List persisted Desktop runs\n\nAdd a bounded read-only command for deterministic privacy-safe local run discovery.\n" },
      { role: "specification", path: "openspec/changes/chatgpt-desktop-list-runs/specs/list-runs/spec.md", mediaType: "text/markdown", content: `# devrelay_list_runs requirements\n\n${AC.map(({ statement }) => `- ${statement}`).join("\n")}\n` },
    ],
  }),
});
const registry = createModuleRegistry({ modules: [moduleDefinition], plugins: [{ definition: pluginDefinition, adapter }], artifactContracts: requirementsRuntimeArtifactContracts() });
const runtime = {
  artifacts: { load: async (ref) => { const bytes = bytesById.get(ref.artifactId); if (!bytes) throw new Error(`Missing ${ref.artifactId}`); return Buffer.from(bytes); } },
  checkpoints: { get: async (key) => checkpoints.get(key), put: async (key, value) => checkpoints.set(key, structuredClone(value)) },
};
const result = await registry.execute(invocation, runtime);
const replay = await registry.verifyCheckpointedExecution(invocation, runtime);
const changeRef = result.outputs["requirements-change-set"][0];
const overviewChangeRef = result.outputs["project-overview-change-set-draft"][0];
const nativeBundleRef = result.outputs["native-source-bundle"][0];
const change = JSON.parse(bytesById.get(changeRef.artifactId));
const overviewChange = JSON.parse(bytesById.get(overviewChangeRef.artifactId));
const markdownBytes = bytesById.get(overviewChange.renderedDocument.artifact.artifactId);
const approval = { apiVersion: API, kind: "RequirementsGateApproval", approvalId: "requirements-gate-approval-chatgpt-desktop-list-runs-v1", authority: "project-owner", decision: "approve", source: { channel: "chat", statement: "approve list runs" }, approvedCandidate: { requirementsChangeSet: changeRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, nativeSourceBundle: nativeBundleRef.digest }, modificationPolicy: "Any changed artifact requires a new Gate candidate." };
const approvalBytes = jsonBytes(approval);
const approvalRef = { artifactId: approval.approvalId, digest: sha256Digest(approvalBytes) };
const requirementsBaseline = { apiVersion: API, kind: "RequirementsBaseline", baselineId: "requirements-baseline-devrelay-v1-chatgpt-desktop-list-runs-001", version: "1.9.0", approvedCandidate: pointer(changeRef), supersedes: pointer(priorRequirementsRef), requirements: change.replacement, approvalEvidence: [approvalRef] };
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = exactRef(requirementsBaseline.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBaselineBytes, "devrelay://project/requirements-baseline.json");
const overviewBaseline = { apiVersion: API, kind: "ProjectOverviewBaseline", baselineId: "project-overview-baseline-devrelay-v1-chatgpt-desktop-list-runs-001", version: "1.9.0", approvedOverviewCandidate: pointer(overviewChangeRef), supersedes: pointer(priorOverviewRef), requirementsBaseline: pointer(requirementsBaselineRef), projection: overviewChange.projection, overview: overviewChange.overview, renderedDocument: overviewChange.renderedDocument, approvalEvidence: [approvalRef] };
const overviewBaselineBytes = jsonBytes(overviewBaseline);
const overviewBaselineRef = exactRef(overviewBaseline.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBaselineBytes, "devrelay://project/project-overview-baseline.json");
const promotion = validateRequirementsGatePromotion({ checkpointReplay: replay, requirementsBaseline, requirementsBaselineRef, requirementsBaselineBytes, projectOverviewBaseline: overviewBaseline, projectOverviewBaselineRef: overviewBaselineRef, projectOverviewBaselineBytes: overviewBaselineBytes, projectOverviewMarkdownBytes: markdownBytes });
const traceabilityUpdate = await requirementsTraceabilityContributor.project({ ...replay, projectId: "devrelay" });
const gateCandidate = { apiVersion: API, kind: "RequirementsGateCandidate", status: "approved", exactBindings: { requirementsChangeSet: changeRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, projectOverviewMarkdown: sha256Digest(markdownBytes), nativeSourceBundle: nativeBundleRef.digest }, approval: approvalRef, progressionAllowed: true };

for (const [name, value] of [
  ["requirements-gathering.invocation.json", invocation], ["requirements-gathering.result.json", result],
  ["requirements-change-set.json", change], ["project-overview-change-set-draft.json", overviewChange],
  ["native-source-bundle.json", JSON.parse(bytesById.get(nativeBundleRef.artifactId))],
  ["requirements-gate-owner-approval.json", approval], ["requirements-gate-candidate.json", gateCandidate],
  ["requirements-baseline.json", requirementsBaseline], ["project-overview-baseline.json", overviewBaseline],
  ["traceability-update.json", traceabilityUpdate],
  ["requirements-gate-promotion-proof.json", { apiVersion: API, kind: "RequirementsGatePromotionProof", status: "pass", replay: { invocationDigest: canonicalJsonDigest(invocation), resultDigest: canonicalJsonDigest(result), adapterCallsOnReplay: 0 }, approval: approvalRef, commitPayloadDigest: canonicalJsonDigest(promotion.commitPayload), promoted: { requirementsBaseline: pointer(requirementsBaselineRef), projectOverviewBaseline: pointer(overviewBaselineRef) }, progression: "architecture-design" }],
]) files.set(name, jsonBytes(value));
files.set("candidate/ProjectOverview.md", Buffer.from(markdownBytes));
for (const source of JSON.parse(bytesById.get(nativeBundleRef.artifactId)).sources) files.set(`native/${source.path.split("/").slice(-2).join("/")}`, Buffer.from(bytesById.get(source.artifact.artifactId)));

await mkdir(here, { recursive: true });
for (const [name, bytes] of files) { const target = new URL(name, here); await mkdir(new URL("./", target), { recursive: true }); await writeFile(target, bytes); }
await mkdir(new URL("project/history/1.8.0/", root), { recursive: true });
await Promise.all([
  writeFile(new URL("project/history/1.8.0/requirements-baseline.json", root), priorRequirementsBytes),
  writeFile(new URL("project/history/1.8.0/project-overview-baseline.json", root), priorOverviewBytes),
  writeFile(new URL("project/history/1.8.0/ProjectOverview.md", root), priorMarkdownBytes),
  writeFile(new URL("project/requirements-baseline.json", root), requirementsBaselineBytes),
  writeFile(new URL("project/project-overview-baseline.json", root), overviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", root), markdownBytes),
]);
process.stdout.write(`${JSON.stringify({ outcome: result.outcome, requirementsBaseline: requirementsBaselineRef.digest, projectOverviewBaseline: overviewBaselineRef.digest, gate: "pass", changedSections: change.changedSections, traceabilityNodes: traceabilityUpdate.nodes.length, traceabilityEdges: traceabilityUpdate.edges.length }, null, 2)}\n`);
