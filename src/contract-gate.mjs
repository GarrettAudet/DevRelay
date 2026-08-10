import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  CONTRACT_GENERATION_ARTIFACT_CONTRACTS,
  validateContractGenerationArtifact,
} from "./contract-generation-artifact-validator.mjs";
import { assertVerifiedContractGenerationReceipt } from "./contract-generation-runtime.mjs";
import {
  validateWorkBreakdownArtifact,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
} from "./work-breakdown-artifact-validator.mjs";

export const CONTRACT_GATE_APPROVAL_CONTRACT = Object.freeze({
  schema: "https://devrelay.dev/evidence/contract-gate-approval/v1",
  mediaType: "application/vnd.devrelay.contract-gate-approval+json",
});

export class ContractGateValidationError extends Error {
  constructor(message) {
    super(`contract gate rejected candidate: ${message}`);
    this.name = "ContractGateValidationError";
    this.code = "DR4060";
  }
}

function fail(message) {
  throw new ContractGateValidationError(message);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest,
  );
}

function exactLoaded(loaded, label, contract) {
  if (
    !loaded?.ref ||
    loaded.value === undefined ||
    (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array))
  ) {
    fail(`${label} requires parsed value, ref, and exact raw bytes`);
  }
  const bytes = Buffer.from(loaded.bytes);
  if (
    sha256Digest(bytes) !== loaded.ref.digest ||
    loaded.ref.schema !== contract.schema ||
    loaded.ref.mediaType !== contract.mediaType
  ) {
    fail(`${label} bytes or published contract do not match its ref`);
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} is not exact UTF-8 JSON`);
  }
  if (canonicalJsonDigest(parsed) !== canonicalJsonDigest(loaded.value)) {
    fail(`${label} parsed object differs from its raw bytes`);
  }
  return parsed;
}

function validateApproval(approval, candidateRef) {
  const value = exactLoaded(approval, "approval", CONTRACT_GATE_APPROVAL_CONTRACT);
  const keys = Object.keys(value).sort();
  const expected = [
    "apiVersion",
    "approvalId",
    "authority",
    "breakingChangeApproved",
    "candidate",
    "decision",
    "kind",
    "policyVersion",
    "requiredEvidence",
  ].sort();
  if (
    canonicalJson(keys) !== canonicalJson(expected) ||
    value.apiVersion !== "devrelay.dev/v1alpha1" ||
    value.kind !== "ContractGateApproval" ||
    value.decision !== "approve" ||
    value.authority !== "project-owner" ||
    value.policyVersion !== "contract-gate/0.1.0" ||
    typeof value.approvalId !== "string" ||
    typeof value.breakingChangeApproved !== "boolean" ||
    !sameRef(value.candidate, candidateRef) ||
    !Array.isArray(value.requiredEvidence) ||
    value.requiredEvidence.length === 0
  ) {
    fail("approval is not a closed exact approval of this candidate");
  }
  return value;
}

async function verifyEvidence(refs, resolver) {
  if (typeof resolver !== "function") fail("approval evidence resolver is required");
  for (const ref of refs) {
    const loaded = await resolver(structuredClone(ref));
    if (!loaded || !sameRef(loaded.ref, ref)) fail("required approval evidence did not resolve exactly");
    if (sha256Digest(Buffer.from(loaded.bytes)) !== ref.digest) {
      fail("required approval evidence bytes do not match their ref");
    }
  }
}

function checkpointArtifact(checkpoint, name) {
  const record = checkpoint.artifacts?.[name];
  if (!record?.ref || record.value === undefined) fail(`verified checkpoint omits ${name}`);
  return record;
}

export async function promoteContractBaseline({
  replayReceipt,
  baseline,
  baselineRef,
  baselineBytes,
  approval,
  evidenceResolver,
}) {
  const checkpoint = assertVerifiedContractGenerationReceipt(replayReceipt);
  if (
    checkpoint.outcome !== "generated" ||
    checkpoint.progressionAllowed !== true ||
    !new Set(["establish-contracts", "generate-contract-change"]).has(checkpoint.operation)
  ) {
    fail("checkpoint is not a progression-eligible generated contract candidate");
  }
  const candidateRecord = checkpointArtifact(checkpoint, "candidate");
  const validationRecord = checkpointArtifact(checkpoint, "validationSet");
  const diffRecord = checkpointArtifact(checkpoint, "canonicalDiff");
  const candidate = candidateRecord.value;
  if (
    validationRecord.value.status !== "pass" ||
    validationRecord.value.results.length !== candidate.contracts.length ||
    diffRecord.value.resultingContractsDigest !== canonicalJsonDigest(candidate.contracts)
  ) {
    fail("Core format validation and canonical diff do not authorize the candidate");
  }
  const required = candidate.requiredInterfaceIntentIds;
  const covered = candidate.contracts.map(({ interfaceIntentId }) => interfaceIntentId).sort();
  if (canonicalJson(required) !== canonicalJson(covered)) {
    fail("candidate has incomplete or unscoped interface coverage");
  }
  const approvalValue = validateApproval(approval, candidateRecord.ref);
  if (diffRecord.value.status === "breaking" && !approvalValue.breakingChangeApproved) {
    fail("breaking contract changes require explicit approval");
  }
  await verifyEvidence(approvalValue.requiredEvidence, evidenceResolver);
  const baselineValue = exactLoaded(
    { value: baseline, ref: baselineRef, bytes: baselineBytes },
    "ContractBaseline",
    CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ContractBaseline,
  );
  validateContractGenerationArtifact(baselineValue, { ref: baselineRef });
  const architectureBinding = candidate.inputBindings.find(({ role }) => role === "architecture-baseline")?.artifact;
  const overviewBinding = candidate.inputBindings.find(({ role }) => role === "project-overview-baseline")?.artifact;
  const priorBinding = candidate.inputBindings.find(({ role }) => role === "current-contract-baseline")?.artifact;
  if (
    baselineValue.kind !== "ContractBaseline" ||
    !sameRef(baselineValue.approvedCandidate, candidateRecord.ref) ||
    !sameRef(baselineValue.architectureBaseline, architectureBinding) ||
    !sameRef(baselineValue.projectOverviewBaseline, overviewBinding) ||
    canonicalJson(baselineValue.contracts) !== canonicalJson(candidate.contracts) ||
    baselineValue.contractsDigest !== canonicalJsonDigest(candidate.contracts) ||
    !baselineValue.approvalEvidence.some((ref) => sameRef(ref, approval.ref))
  ) {
    fail("ContractBaseline is not an exact promotion of the approved candidate");
  }
  if (
    (checkpoint.operation === "establish-contracts" && baselineValue.supersedes !== undefined) ||
    (checkpoint.operation === "generate-contract-change" && !sameRef(baselineValue.supersedes, priorBinding))
  ) {
    fail("ContractBaseline supersession lineage does not match the operation");
  }
  const contractDisposition = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractDisposition",
    dispositionId: `CD-${baselineValue.baselineId.slice(3)}`,
    mode: "baseline",
    contractBaseline: structuredClone(baselineRef),
    contractTargets: baselineValue.contracts.map((entry) => ({
      id: entry.id,
      kind: "data-schema",
      description: `${entry.contractKind} contract for ${entry.interfaceIntentId}`,
    })),
  };
  validateWorkBreakdownArtifact(contractDisposition);
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGatePromotionCommit",
    candidate: candidateRecord.ref,
    approval: approval.ref,
    baseline: baselineValue,
    baselineRef: structuredClone(baselineRef),
    contractDisposition,
    checkpointDigest: checkpoint.checkpointDigest,
    progressionAllowed: true,
  });
}

export async function approveContractsNotApplicable({ state, architecture, approval, evidenceResolver }) {
  const stateValue = exactLoaded(
    state,
    "ProjectContractState",
    CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ProjectContractState,
  );
  validateContractGenerationArtifact(stateValue, { ref: state.ref });
  if (stateValue.state !== "not-applicable" || stateValue.requiredInterfaceIntentIds.length !== 0) {
    fail("not-applicable requires a state with zero required interface intents");
  }
  const interfaces = architecture.value?.sections?.interfaceIntent?.content?.interfaces ?? [];
  if (interfaces.some((entry) => entry.contractGeneration?.required === true)) {
    fail("ArchitectureBaseline still contains a required contract intent");
  }
  const approvalValue = exactLoaded(
    approval,
    "ApprovedNotApplicable",
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ApprovedNotApplicable,
  );
  validateWorkBreakdownArtifact(approvalValue, { ref: approval.ref });
  if (approvalValue.purpose !== "contract-disposition") fail("not-applicable approval has the wrong purpose");
  await verifyEvidence(approvalValue.approvalEvidence, evidenceResolver);
  const disposition = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractDisposition",
    dispositionId: `CD-${approvalValue.approvalId.slice(4)}`,
    mode: "not-applicable",
    notApplicable: approvalValue,
  };
  validateWorkBreakdownArtifact(disposition);
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGateNotApplicableCommit",
    architectureBaseline: structuredClone(stateValue.architectureBaseline),
    approval: structuredClone(approval.ref),
    contractDisposition: disposition,
    progressionAllowed: true,
  });
}
