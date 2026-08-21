import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { normalizeA2AAgentCard, rankSpecialistsDeterministically } from "../../../src/specialist-assignment.mjs";
import { createSpecialistAssignmentRuntimeV2 } from "../../../src/specialist-assignment-runtime-v2.mjs";
import { promoteSpecialistAssignmentBaselineV2 } from "../../../src/specialist-assignment-gate-v2.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);

async function read(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function write(name, value) {
  const url = new URL(name, OUTPUT);
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  await writeFile(url, bytes);
  return {
    value,
    bytes,
    ref: {
      artifactId:
        value.baselineId ?? value.draftId ?? value.approvalId ?? value.gateCandidateId ??
        value.catalogId ?? value.policyId ?? value.snapshotSetId ?? value.proofId ?? name.replace(/\.json$/u, ""),
      schema: `https://devrelay.dev/artifacts/${value.kind?.replaceAll(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase() ?? name.replace(/\.json$/u, "")}/v1`,
      mediaType: "application/json",
      digest: sha256Digest(bytes),
      uri: `devrelay-repo:///dogfood/ep-001-environment-preparation/assignment/${name}`,
    },
  };
}

const workBreakdown = await read("project/work-breakdown-baseline.json");
const workDependency = await read("project/work-dependency-baseline.json");
const projectOverview = await read("project/project-overview-baseline.json");
const repositoryContext = await read("dogfood/ep-001-environment-preparation/repository-snapshot.json");

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
  catalogId: "CC-EP-001-001",
  version: "2.0.0",
  capabilities,
};

function a2aProfile({ slug, name, description, capabilityIds, toolIds, grantIds }) {
  const card = {
    protocolVersion: "1.0",
    name,
    description,
    version: "1.0.0",
    supportedInterfaces: [],
    capabilities: {},
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [{
      id: slug,
      name,
      description,
      tags: ["devrelay", "provider-neutral", "bounded"],
    }],
  };
  const snapshot = {
    source: {
      version: "1.0.0",
      digest: canonicalJsonDigest(card),
      uri: `fixture://devrelay/a2a/pm-001/${slug}.json`,
    },
    agentCard: card,
    toolIds,
    grantIds,
  };
  return {
    snapshot,
    profile: normalizeA2AAgentCard({
      snapshot,
      mappings: [{ skillId: slug, capabilityIds }],
    }),
  };
}

const a2aProfiles = [
  a2aProfile({
    slug: "test-engineering",
    name: "Test Engineering Specialist",
    description: "Implements bounded deterministic test and discovery changes.",
    capabilityIds: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    toolIds: ["TOOL-NODE"],
    grantIds: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
  }),
  a2aProfile({
    slug: "specification-engineering",
    name: "Specification Engineering Specialist",
    description: "Implements bounded contracts, provider adapters, and their verification.",
    capabilityIds: ["CAP-CONTRACT-AUTHORING", "CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
    toolIds: ["TOOL-NODE"],
    grantIds: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
  }),
  a2aProfile({
    slug: "release-evidence-engineering",
    name: "Release Evidence Engineering Specialist",
    description: "Implements bounded release tooling and compatibility evidence.",
    capabilityIds: ["CAP-NODEJS-ENGINEERING", "CAP-RELEASE-ENGINEERING", "CAP-TEST-ENGINEERING"],
    toolIds: ["TOOL-NODE", "TOOL-NPM"],
    grantIds: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
  }),
  a2aProfile({
    slug: "technical-documentation-verification",
    name: "Technical Documentation Verification Specialist",
    description: "Produces bounded technical guidance with executable verification.",
    capabilityIds: ["CAP-TECHNICAL-WRITING", "CAP-TEST-ENGINEERING"],
    toolIds: ["TOOL-NODE"],
    grantIds: ["GRANT-PROCESS-SPAWN"],
  }),
];
const nativeProfile = {
  id: "PROFILE-DEVRELAY-INTEGRATION-OWNER",
  name: "Provider-neutral DevRelay integration owner",
  source: {
    type: "native-catalog",
    version: "2.0.0",
    digest: canonicalJsonDigest({ id: "PROFILE-DEVRELAY-INTEGRATION-OWNER", version: "2.0.0" }),
  },
  capabilityIds: capabilities.map(({ id }) => id).sort(),
  toolIds: ["TOOL-GIT", "TOOL-GITHUB", "TOOL-NODE", "TOOL-NPM", "TOOL-POWERSHELL"],
  grantIds: ["GRANT-GITHUB-ADMIN", "GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
  evidence: [{
    kind: "catalog-declaration",
    sourceDigest: canonicalJsonDigest({ id: "PROFILE-DEVRELAY-INTEGRATION-OWNER", version: "2.0.0" }),
  }],
};
const specialistCatalog = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistCatalog",
  catalogId: "SC-EP-001-001",
  version: "2.0.0",
  profiles: [...a2aProfiles.map(({ profile }) => profile), nativeProfile].sort((a, b) => a.id.localeCompare(b.id)),
};
const priorities = [
  ["technical-documentation-verification", 140],
  ["test-engineering", 130],
  ["specification-engineering", 120],
  ["release-evidence-engineering", 110],
].map(([slug, priority]) => ({
  profileId: a2aProfiles.find(({ snapshot }) => snapshot.agentCard.skills[0].id === slug).profile.id,
  priority,
}));
const assignmentPolicy = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "AssignmentPolicy",
  policyId: "AP-EP-001-001",
  version: "2.0.0",
  workItemRules: [{
    workItemId: "WI-EP-WINDOWS-E2E",
    requiredToolIds: ["TOOL-GIT", "TOOL-NODE", "TOOL-NPM", "TOOL-POWERSHELL"],
    requiredGrantIds: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"],
  }],
  profilePriorities: [...priorities, { profileId: nativeProfile.id, priority: 10 }],
  rationale: "Prefer the narrowest eligible A2A-discovered specialist profile; use the provider-neutral integration owner only for cross-capability work. Assignment never schedules or executes work.",
};

const boundInputs = {
  "work-breakdown-baseline": [workBreakdown.baselineId, workBreakdown],
  "work-dependency-baseline": [workDependency.baselineId, workDependency],
  "capability-catalog": [capabilityCatalog.catalogId, capabilityCatalog],
  "specialist-catalog": [specialistCatalog.catalogId, specialistCatalog],
  "assignment-policy": [assignmentPolicy.policyId, assignmentPolicy],
  "project-overview-baseline": [projectOverview.baselineId, projectOverview],
  "repository-context": [`repository-snapshot-devrelay-${repositoryContext.revision.slice(0, 7)}`, repositoryContext],
};
const inputBindings = Object.entries(boundInputs).map(([role, [artifactId, value]]) => ({
  role,
  artifact: { artifactId, digest: canonicalJsonDigest(value) },
}));

const values = new Map();
let rankerCalls = 0;
const checkpointStore = {
  async get(key) { return values.get(key); },
  async put(key, value) {
    if (values.has(key)) throw new Error(`immutable assignment checkpoint ${key} already exists`);
    values.set(key, structuredClone(value));
  },
};
const runtime = createSpecialistAssignmentRuntimeV2({
  checkpointStore,
  ranker: {
    descriptor: { id: "devrelay.native-specialist-ranker", version: "1.0.0" },
    rank(eligibility, policy) {
      rankerCalls += 1;
      return rankSpecialistsDeterministically(eligibility, policy);
    },
  },
});
const invocation = {
  executionId: "SA-EP-001-001",
  workBreakdown,
  workDependency,
  capabilityCatalog,
  specialistCatalog,
  assignmentPolicy,
  projectOverview,
  repositoryContext,
  inputBindings,
};
const first = await runtime.execute(invocation);
const replay = await runtime.execute(invocation);
if (first.outcome !== "assigned" || !replay.replayed || rankerCalls !== 1) {
  throw new Error("SpecialistAssignment did not produce one deterministic replayable candidate");
}
const checkpointReplay = await runtime.verifyCheckpointedExecution({
  executionId: first.executionId,
  executionFingerprint: first.executionFingerprint,
});
const gateCandidate = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentGateCandidate",
  gateCandidateId: "SA-GATE-CANDIDATE-EP-001-001",
  candidate: first.draft.ref,
  checkpointDigest: checkpointReplay.checkpointDigest,
  executionFingerprint: first.executionFingerprint,
  assignmentCount: first.draft.value.assignments.length,
  workItemCount: workBreakdown.workItems.length,
  requestedDecision: "approve-under-standing-lifecycle-authorization",
};
const approval = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentGateApproval",
  approvalId: "SA-GATE-APPROVAL-EP-001-001",
  decision: "approve",
  candidate: { artifactId: first.draft.ref.artifactId, digest: first.draft.ref.digest },
  checkpointDigest: checkpointReplay.checkpointDigest,
  executionFingerprint: first.executionFingerprint,
  approvedBy: "project-owner-standing-lifecycle-authorization",
  rationale: "The owner directed DevRelay to keep building until release-ready and approved necessary non-clarification progression. This exact deterministic assignment changes no product behavior and grants no execution authority.",
};
const approvalBytes = Buffer.from(canonicalJson(approval), "utf8");
const approvalRef = {
  artifactId: approval.approvalId,
  schema: "https://devrelay.dev/evidence/specialist-assignment-gate-approval/v1",
  mediaType: "application/vnd.devrelay.specialist-assignment-gate-approval+json",
  digest: sha256Digest(approvalBytes),
  uri: "devrelay-repo:///dogfood/ep-001-environment-preparation/assignment/specialist-assignment-gate-owner-approval.json",
};
const baseline = promoteSpecialistAssignmentBaselineV2({
  checkpointReplay,
  approval,
  approvalRef,
  exactApprovalBytes: approvalBytes,
});
const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentDogfoodProof",
  proofId: "SA-DOGFOOD-PROOF-EP-001-001",
  operation: "assign-specialists",
  outcome: first.outcome,
  executionFingerprint: first.executionFingerprint,
  checkpointDigest: checkpointReplay.checkpointDigest,
  candidateDigest: first.draft.ref.digest,
  approvalDigest: approvalRef.digest,
  baselineDigest: sha256Digest(Buffer.from(canonicalJson(baseline), "utf8")),
  workItemCount: workBreakdown.workItems.length,
  assignmentCount: baseline.assignments.length,
  a2aProfileCount: a2aProfiles.length,
  a2aAssignedWorkItems: baseline.assignments.filter(({ specialistProfileRef }) => specialistProfileRef.startsWith("A2A-")).map(({ workItemRef }) => workItemRef),
  integrationOwnerAssignedWorkItems: baseline.assignments.filter(({ specialistProfileRef }) => specialistProfileRef === nativeProfile.id).map(({ workItemRef }) => workItemRef),
  rankerCalls,
  replayedWithoutRankerCall: replay.replayed,
  nextModule: "WorkExecution",
};

await write("capability-catalog.json", capabilityCatalog);
await write("a2a-agent-card-snapshot-set.json", {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "A2AAgentCardSnapshotSet",
  snapshotSetId: "A2A-SNAPSHOT-SET-EP-001-001",
  snapshots: a2aProfiles.map(({ snapshot }) => snapshot),
});
await write("specialist-catalog.json", specialistCatalog);
await write("assignment-policy.json", assignmentPolicy);
await write("eligibility-evaluation-set.json", JSON.parse(Buffer.from(checkpointReplay.checkpoint.artifacts[0].bytesBase64, "base64")));
await write("ranker-selection-set.json", JSON.parse(Buffer.from(checkpointReplay.checkpoint.artifacts[1].bytesBase64, "base64")));
await write("specialist-assignment-draft.json", first.draft.value);
await write("specialist-assignment-gate-candidate.json", gateCandidate);
await write("specialist-assignment-gate-owner-approval.json", approval);
await write("specialist-assignment-baseline.json", baseline);
await write("specialist-assignment-checkpoint.json", checkpointReplay.checkpoint);
await write("specialist-assignment-dogfood-proof.json", proof);

process.stdout.write(`${JSON.stringify({
  status: "SPECIALIST_ASSIGNMENT_BASELINE_READY",
  candidate: proof.candidateDigest,
  checkpoint: proof.checkpointDigest,
  approval: proof.approvalDigest,
  baseline: proof.baselineDigest,
  assignments: proof.assignmentCount,
  a2aAssignments: proof.a2aAssignedWorkItems.length,
  integrationOwnerAssignments: proof.integrationOwnerAssignedWorkItems.length,
  rankerCalls,
  replayed: proof.replayedWithoutRankerCall,
}, null, 2)}\n`);
