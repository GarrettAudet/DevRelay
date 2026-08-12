import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { normalizeA2AAgentCard } from "../../../src/specialist-assignment.mjs";
import { createSpecialistAssignmentRuntime } from "../../../src/specialist-assignment-runtime.mjs";
import { promoteSpecialistAssignmentBaseline } from "../../../src/specialist-assignment-gate.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const write = (name, value) => writeFileSync(new URL(name, import.meta.url), canonicalJson(value) + "\n");
const workBreakdown = read("../../../project/work-breakdown-baseline.json");
const workDependency = read("../../../project/work-dependency-baseline.json");
const projectOverview = read("../../../project/project-overview-baseline.json");
const repositoryContext = read("../work-breakdown-revision/repository-snapshot.json");

const capabilities = [
  ["CAP-CONTRACT-AUTHORING", [], []],
  ["CAP-NODEJS-ENGINEERING", ["TOOL-NODE"], ["GRANT-REPOSITORY-WRITE"]],
  ["CAP-RELEASE-ENGINEERING", ["TOOL-NPM"], ["GRANT-PROCESS-SPAWN"]],
  ["CAP-TECHNICAL-WRITING", [], []],
  ["CAP-TEST-ENGINEERING", ["TOOL-NODE"], ["GRANT-PROCESS-SPAWN"]],
].map(([id, requiredToolIds, requiredGrantIds]) => ({ id, requiredToolIds, requiredGrantIds }));
const capabilityCatalog = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "CapabilityCatalog",
  catalogId: "CC-DESKTOP-DOGFOOD-001",
  version: "1.0.0",
  capabilities,
};

const agentCard = {
  protocolVersion: "1.0",
  name: "DevRelay Desktop Documentation Specialist",
  description: "Produces bounded technical documentation.",
  version: "1.0.0",
  supportedInterfaces: [{ url: "https://invalid.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  capabilities: {},
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/markdown"],
  skills: [{ id: "technical-documentation", name: "Technical documentation", description: "Document approved behavior.", tags: ["documentation"] }],
};
const a2aSnapshot = {
  source: {
    version: "1.0",
    digest: canonicalJsonDigest(agentCard),
    uri: "fixture://devrelay/a2a/chatgpt-desktop-documentation-specialist-card.json",
  },
  agentCard,
  toolIds: [],
  grantIds: [],
};
const a2aProfile = normalizeA2AAgentCard({
  snapshot: a2aSnapshot,
  mappings: [{ skillId: "technical-documentation", capabilityIds: ["CAP-TECHNICAL-WRITING"] }],
});
const nativeSourceDigest = canonicalJsonDigest({
  source: "devrelay-desktop-native-specialist-catalog",
  version: "1.0.0",
});
function nativeProfile(id, name, capabilityIds, toolIds, grantIds) {
  return {
    id,
    name,
    source: { type: "native-catalog", version: "1.0.0", digest: nativeSourceDigest },
    capabilityIds: [...capabilityIds].sort(),
    toolIds: [...toolIds].sort(),
    grantIds: [...grantIds].sort(),
    evidence: [{ kind: "catalog-declaration", sourceDigest: nativeSourceDigest }],
  };
}
const nativeProfiles = [
  nativeProfile("PROFILE-DESKTOP-CONTRACT-ENGINEER", "Provider-neutral contract engineer", ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"], ["TOOL-NODE"], ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"]),
  nativeProfile("PROFILE-DESKTOP-RUNTIME-ENGINEER", "Provider-neutral runtime engineer", ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"], ["TOOL-NODE"], ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"]),
  nativeProfile("PROFILE-DESKTOP-RELEASE-ENGINEER", "Provider-neutral release engineer", ["CAP-NODEJS-ENGINEERING", "CAP-RELEASE-ENGINEERING", "CAP-TECHNICAL-WRITING", "CAP-TEST-ENGINEERING"], ["TOOL-NODE", "TOOL-NPM"], ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"]),
  nativeProfile("PROFILE-DESKTOP-DOCUMENTATION-SPECIALIST", "Provider-neutral documentation specialist", ["CAP-TECHNICAL-WRITING"], [], []),
];
const specialistCatalog = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistCatalog",
  catalogId: "SC-DESKTOP-DOGFOOD-002",
  version: "1.0.0",
  profiles: [...nativeProfiles, a2aProfile].sort((a, b) => a.id.localeCompare(b.id)),
};
const profileIds = specialistCatalog.profiles.map(({ id }) => id).sort();
const desiredProfileByWorkItem = new Map([
  ["WI-DESKTOP-APP-SERVER", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-CAPABILITY-RESOLVER", "PROFILE-DESKTOP-CONTRACT-ENGINEER"],
  ["WI-DESKTOP-CLEAN-RUN", "PROFILE-DESKTOP-RELEASE-ENGINEER"],
  ["WI-DESKTOP-CONTRACTS", "PROFILE-DESKTOP-CONTRACT-ENGINEER"],
  ["WI-DESKTOP-DOCUMENTATION", "PROFILE-DESKTOP-DOCUMENTATION-SPECIALIST"],
  ["WI-DESKTOP-INSTALL", "PROFILE-DESKTOP-RELEASE-ENGINEER"],
  ["WI-DESKTOP-LIFECYCLE", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-LIST-RUNS-STORE", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-LIST-RUNS-MCP", "PROFILE-DESKTOP-CONTRACT-ENGINEER"],
  ["WI-DESKTOP-LIST-RUNS-TESTS", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-LIST-RUNS-DOCS", "PROFILE-DESKTOP-DOCUMENTATION-SPECIALIST"],

  ["WI-DESKTOP-MCP-BRIDGE", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-PLUGIN", "PROFILE-DESKTOP-RELEASE-ENGINEER"],
  ["WI-DESKTOP-RUN-STORE", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-TASK-SUPERVISOR", "PROFILE-DESKTOP-RUNTIME-ENGINEER"],
  ["WI-DESKTOP-VERIFICATION", "PROFILE-DESKTOP-RELEASE-ENGINEER"],
]);
if (desiredProfileByWorkItem.size !== workBreakdown.workItems.length) {
  throw new Error("Desktop assignment policy must cover every WorkItem exactly once");
}
const assignmentPolicy = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "AssignmentPolicy",
  policyId: "AP-DESKTOP-DOGFOOD-002",
  version: "1.0.0",
  workItemRules: [...desiredProfileByWorkItem].map(([workItemId, selectedProfileId]) => ({
    workItemId,
    deniedProfileIds: profileIds.filter((id) => id !== selectedProfileId),
  })).sort((a, b) => a.workItemId.localeCompare(b.workItemId)),
  profilePriorities: nativeProfiles.map(({ id }) => ({ profileId: id, priority: 100 })).concat([{ profileId: a2aProfile.id, priority: 10 }]).sort((a, b) => a.profileId.localeCompare(b.profileId)),
  rationale: "Select the narrowest provider-neutral native profile for each Desktop WorkItem. Retain the A2A documentation profile as a fixture-conformant discoverable alternative until a live endpoint is configured.",
};
const bindings = [
  ["work-breakdown-baseline", workBreakdown.baselineId, canonicalJsonDigest(workBreakdown)],
  ["work-dependency-baseline", workDependency.baselineId, canonicalJsonDigest(workDependency)],
  ["capability-catalog", capabilityCatalog.catalogId, canonicalJsonDigest(capabilityCatalog)],
  ["specialist-catalog", specialistCatalog.catalogId, canonicalJsonDigest(specialistCatalog)],
  ["assignment-policy", assignmentPolicy.policyId, canonicalJsonDigest(assignmentPolicy)],
  [
    "project-overview-baseline",
    projectOverview.baselineId,
    canonicalJsonDigest(projectOverview),
  ],
  [
    "repository-context",
    `repository-snapshot-devrelay-${repositoryContext.revision.slice(0, 7)}`,
    canonicalJsonDigest(repositoryContext),
  ],
].map(([role, artifactId, digest]) => ({
  role,
  artifact: { artifactId, digest },
}));

const values = new Map();
const checkpointStore = {
  get: async (key) => values.get(key),
  put: async (key, value) => values.set(key, structuredClone(value)),
};
const runtime = createSpecialistAssignmentRuntime({ checkpointStore });
const invocation = {
  executionId: "SA-DESKTOP-LIST-RUNS-001",
  workBreakdown,
  workDependency,
  capabilityCatalog,
  specialistCatalog,
  assignmentPolicy,
  projectOverview,
  repositoryContext,
  inputBindings: bindings,
};
const first = await runtime.execute(invocation);
const replay = await runtime.execute(invocation);
if (first.outcome !== "assigned" || !replay.replayed) throw new Error("SpecialistAssignment dogfood did not assign and replay");
const approval = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentGateApproval",
  decision: "approve",
  candidate: { artifactId: first.draft.ref.artifactId, digest: first.draft.ref.digest },
  approvedBy: "owner-standing-approval",
  rationale: "Exact deterministic dogfood candidate satisfies the approved SpecialistAssignment contracts and standing routine-change approval.",
};
const baseline = promoteSpecialistAssignmentBaseline({
  draft: first.draft.value,
  draftRef: first.draft.ref,
  exactDraftBytes: Buffer.from(first.draft.bytesBase64, "base64"),
  approval,
  version: "1.0.0",
});
const proof = {
  module: "SpecialistAssignment",
  operation: "assign-specialists",
  outcome: first.outcome,
  executionFingerprint: first.executionFingerprint,
  candidateDigest: first.draft.ref.digest,
  baselineDigest: sha256Digest(Buffer.from(canonicalJson(baseline), "utf8")),
  workItemCount: workBreakdown.workItems.length,
  assignmentCount: baseline.assignments.length,
  a2aProfileId: a2aProfile.id,
  a2aAssignedWorkItems: baseline.assignments.filter(({ specialistProfileRef }) => specialistProfileRef === a2aProfile.id).map(({ workItemRef }) => workItemRef),
  replayedWithoutAdapterCall: replay.replayed,
};
write("capability-catalog.json", capabilityCatalog);
write("a2a-agent-card-snapshot.json", a2aSnapshot);
write("specialist-catalog.json", specialistCatalog);
write("assignment-policy.json", assignmentPolicy);
write("eligibility-evaluation-set.json", first.draft ? values.values().next().value.artifacts[0].value : {});
write("specialist-assignment-draft.json", first.draft.value);
write("specialist-assignment-gate-owner-approval.json", approval);
write("specialist-assignment-baseline.json", baseline);
write("specialist-assignment-dogfood-proof.json", proof);
console.log(JSON.stringify(proof, null, 2));


