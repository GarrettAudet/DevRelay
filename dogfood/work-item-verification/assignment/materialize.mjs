import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { normalizeA2AAgentCard } from "../../../src/specialist-assignment.mjs";
import { createSpecialistAssignmentRuntime } from "../../../src/specialist-assignment-runtime.mjs";
import { promoteSpecialistAssignmentBaseline } from "../../../src/specialist-assignment-gate.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const write = (name, value) => writeFileSync(new URL(name, import.meta.url), canonicalJson(value) + "\n");
const workBreakdown = read("../work-breakdown/work-breakdown-baseline.json");
const workDependency = read("../dependency-analysis/replay-v2/work-dependency-baseline.json");
const projectOverview = read("../../../project/project-overview-baseline.json");
const repositoryContext = read("../repository-snapshot.json");

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
  catalogId: "CC-WIV-DOGFOOD-001",
  version: "1.0.0",
  capabilities,
};

const agentCard = {
  protocolVersion: "1.0",
  name: "DevRelay Documentation Specialist",
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
    uri: "fixture://devrelay/a2a/work-item-verification-documentation-specialist-card.json",
  },
  agentCard,
  toolIds: [],
  grantIds: [],
};
const a2aProfile = normalizeA2AAgentCard({
  snapshot: a2aSnapshot,
  mappings: [{ skillId: "technical-documentation", capabilityIds: ["CAP-TECHNICAL-WRITING"] }],
});
const specialistCatalog = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistCatalog",
  catalogId: "SC-WIV-DOGFOOD-001",
  version: "1.0.0",
  profiles: [
    {
      id: "PROFILE-DEVRELAY-ENGINEERING",
      name: "Provider-neutral DevRelay engineering specialist",
      source: { type: "native-catalog", version: "1.0.0", digest: "sha256:5b5f0dfec17b46f8cb755b75c68cf13c71487988e0916e6d155cec06018f7857" },
      capabilityIds: capabilities.map(({ id }) => id).sort(),
      toolIds: ["TOOL-NODE", "TOOL-NPM"],
      grantIds: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
      evidence: [{ kind: "catalog-declaration", sourceDigest: "sha256:5b5f0dfec17b46f8cb755b75c68cf13c71487988e0916e6d155cec06018f7857" }],
    },
    a2aProfile,
  ].sort((a, b) => a.id.localeCompare(b.id)),
};
const documentationWorkItem = workBreakdown.workItems.find(({ id }) => id === "WI-WIV-DOCUMENTATION");
const assignmentPolicy = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "AssignmentPolicy",
  policyId: "AP-WIV-DOGFOOD-001",
  version: "1.0.0",
  workItemRules: [],
  profilePriorities: [
    { profileId: a2aProfile.id, priority: 100 },
    { profileId: "PROFILE-DEVRELAY-ENGINEERING", priority: 10 },
  ],
  rationale: `Prefer the A2A documentation profile only when it is eligible for ${documentationWorkItem.id}; use the provider-neutral engineering profile for all implementation and verification work.`,
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
  executionId: "SA-WIV-DOGFOOD-001",
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