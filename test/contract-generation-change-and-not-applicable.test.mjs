import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createContractCanonicalDiff } from "../src/contract-canonical-diff.mjs";
import { createJsonSchemaContractBundle } from "../src/contract-format-registry.mjs";
import { approveContractsNotApplicable } from "../src/contract-gate.mjs";
import { createContractGenerationRuntime, deriveContractGenerationRoute } from "../src/contract-generation-runtime.mjs";

const ROOT = new URL("../", import.meta.url);

function loaded(value, schema, mediaType, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, ref: { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `memory://test/${artifactId}.json` }, bytes };
}

async function file(path, schema, mediaType, idField) {
  const bytes = await readFile(new URL(path, ROOT));
  const value = JSON.parse(bytes);
  return { value, ref: { artifactId: value[idField], schema, mediaType, digest: sha256Digest(bytes), uri: `file:///test/${path}` }, bytes };
}

function store() {
  const entries = new Map();
  return { async get(key) { return entries.get(key); }, async put(key, value) { entries.set(key, structuredClone(value)); } };
}

async function baseInputs() {
  const architecture = await file("project/architecture-baseline.json", "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", "baselineId");
  const projectOverview = await file("project/project-overview-baseline.json", "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", "baselineId");
  const ids = architecture.value.sections.interfaceIntent.content.interfaces.filter(({ contractGeneration }) => contractGeneration.required).map(({ id }) => id).sort();
  const state = loaded({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectContractState", stateId: "PCS-CHANGE-SEED", state: "unbaselined", architectureBaseline: architecture.ref, projectOverviewBaseline: projectOverview.ref, requiredInterfaceIntentIds: ids }, "https://devrelay.dev/artifacts/project-contract-state/v1", "application/vnd.devrelay.project-contract-state+json", "PCS-CHANGE-SEED");
  return { architecture, projectOverview, state, ids };
}

test("baselined state preserves historical lineage while producing an exact change draft for a newer architecture", async () => {
  const inputs = await baseInputs();
  const generator = { id: "test.change-generator", version: "0.1.0", async generate(request) { return createJsonSchemaContractBundle(request, this); } };
  const runtime = createContractGenerationRuntime({ generators: { "json-schema": generator } });
  const initial = await runtime.execute({ executionId: "CG-CHANGE-SEED", ...inputs, checkpoints: store() });
  const baselineValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractBaseline",
    baselineId: "CB-CHANGE-SEED",
    version: "1.0.0",
    approvedCandidate: initial.candidateRef,
    architectureBaseline: { ...inputs.architecture.ref, artifactId: "architecture-baseline-prior", digest: `sha256:${"a".repeat(64)}` },
    projectOverviewBaseline: { ...inputs.projectOverview.ref, artifactId: "project-overview-prior", digest: `sha256:${"b".repeat(64)}` },
    contracts: initial.candidate.contracts,
    contractsDigest: canonicalJsonDigest(initial.candidate.contracts),
    approvalEvidence: [inputs.state.ref],
    sourceRefs: initial.candidate.sourceRefs,
  };
  const baseline = loaded(baselineValue, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json", baselineValue.baselineId);
  const state = loaded({ ...inputs.state.value, stateId: "PCS-CHANGE-BASELINED", state: "baselined", contractBaseline: baseline.ref }, "https://devrelay.dev/artifacts/project-contract-state/v1", "application/vnd.devrelay.project-contract-state+json", "PCS-CHANGE-BASELINED");
  const route = deriveContractGenerationRoute({ state: state.value, architectureBaseline: inputs.architecture.value });
  assert.equal(route.operation, "generate-contract-change");
  const change = await runtime.execute({ executionId: "CG-CHANGE-001", state, architecture: inputs.architecture, projectOverview: inputs.projectOverview, currentBaseline: baseline, checkpoints: store() });
  assert.equal(change.candidate.kind, "ContractChangeSetDraft");
  assert.ok(change.candidate.contracts.every(({ compatibility }) => compatibility === "not-applicable"));
});

test("canonical diff records adds, removals, prior digests, target digests, and breaking impact", () => {
  const entry = (id, digest) => ({ id, interfaceIntentId: `IF-${id.slice(3)}`, contractKind: "json-schema", artifact: { artifactId: id, schema: "https://json-schema.org/draft/2020-12/schema", mediaType: "application/schema+json", digest, uri: `memory:///${id}` }, contentDigest: digest, compatibility: "initial" });
  const one = `sha256:${"1".repeat(64)}`;
  const two = `sha256:${"2".repeat(64)}`;
  const three = `sha256:${"3".repeat(64)}`;
  const current = { ref: { artifactId: "CB-DIFF", schema: "https://devrelay.dev/artifacts/contract-baseline/v1", mediaType: "application/vnd.devrelay.contract-baseline+json", digest: `sha256:${"a".repeat(64)}`, uri: "memory:///baseline" }, contracts: [entry("CT-A", one), entry("CT-B", two)] };
  const diff = createContractCanonicalDiff({ operation: "generate-contract-change", currentBaseline: current, contracts: [entry("CT-A", three), entry("CT-C", three)] });
  assert.equal(diff.status, "breaking");
  assert.deepEqual(diff.changes.map(({ changeType }) => changeType), ["modify", "remove", "add"]);
  assert.equal(diff.changes[0].expectedPriorDigest, one);
  assert.equal(diff.changes[0].targetDigest, three);
  assert.equal(diff.changes[1].compatibility, "breaking");
  assert.equal(diff.changes[2].compatibility, "backward-compatible");
});

test("ContractGate alone approves not-applicable when architecture has zero required intents", async () => {
  const inputs = await baseInputs();
  const architectureValue = structuredClone(inputs.architecture.value);
  for (const intent of architectureValue.sections.interfaceIntent.content.interfaces) {
    intent.contractGeneration = { required: false, suggestedKinds: [] };
  }
  const architecture = loaded(architectureValue, inputs.architecture.ref.schema, inputs.architecture.ref.mediaType, "architecture-no-contracts");
  const state = loaded({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectContractState", stateId: "PCS-NOT-APPLICABLE", state: "not-applicable", architectureBaseline: architecture.ref, projectOverviewBaseline: inputs.projectOverview.ref, requiredInterfaceIntentIds: [] }, "https://devrelay.dev/artifacts/project-contract-state/v1", "application/vnd.devrelay.project-contract-state+json", "PCS-NOT-APPLICABLE");
  const evidence = loaded({ decision: "approve" }, "https://devrelay.dev/evidence/approval/v1", "application/json", "CG-NA-EVIDENCE");
  const approval = loaded({ apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable", approvalId: "ANA-CONTRACTS-NOT-REQUIRED", purpose: "contract-disposition", rationale: "The exact approved architecture contains zero required contract intents.", authority: { id: "project-owner", role: "human-approver" }, approvalEvidence: [evidence.ref] }, "https://devrelay.dev/artifacts/approved-not-applicable/v1", "application/vnd.devrelay.approved-not-applicable+json", "ANA-CONTRACTS-NOT-REQUIRED");
  const commit = await approveContractsNotApplicable({ state, architecture, approval, evidenceResolver: async () => evidence });
  assert.equal(commit.progressionAllowed, true);
  assert.equal(commit.contractDisposition.mode, "not-applicable");
});
