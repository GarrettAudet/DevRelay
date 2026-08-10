import { readFileSync } from "node:fs";

import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/contract-generation-artifacts.schema.json";
const validateDocument = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/contract-generation-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export const CONTRACT_GENERATION_ARTIFACT_CONTRACTS = Object.freeze({
  ProjectContractState: Object.freeze({
    schema: "https://devrelay.dev/artifacts/project-contract-state/v1",
    mediaType: "application/vnd.devrelay.project-contract-state+json",
  }),
  ContractGeneratorRequest: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-generator-request/v1",
    mediaType: "application/vnd.devrelay.contract-generator-request+json",
  }),
  GeneratedContractBundle: Object.freeze({
    schema: "https://devrelay.dev/artifacts/generated-contract-bundle/v1",
    mediaType: "application/vnd.devrelay.generated-contract-bundle+json",
  }),
  ContractFormatValidationSet: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-format-validation-set/v1",
    mediaType: "application/vnd.devrelay.contract-format-validation-set+json",
  }),
  ContractCanonicalDiff: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-canonical-diff/v1",
    mediaType: "application/vnd.devrelay.contract-canonical-diff+json",
  }),
  ContractDraftSet: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-draft-set/v1",
    mediaType: "application/vnd.devrelay.contract-draft-set+json",
  }),
  ContractChangeSetDraft: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-change-set-draft/v1",
    mediaType: "application/vnd.devrelay.contract-change-set-draft+json",
  }),
  ContractBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/contract-baseline/v1",
    mediaType: "application/vnd.devrelay.contract-baseline+json",
  }),
});

export class ContractGenerationArtifactValidationError extends Error {
  constructor(message) {
    super(`contract generation artifact is invalid: ${message}`);
    this.name = "ContractGenerationArtifactValidationError";
    this.code = "DR4040";
  }
}

function fail(message) {
  throw new ContractGenerationArtifactValidationError(message);
}

function stableId(value) {
  return {
    ProjectContractState: value.stateId,
    ContractGeneratorRequest: value.requestId,
    GeneratedContractBundle: value.bundleId,
    ContractFormatValidationSet: value.validationSetId,
    ContractCanonicalDiff: value.diffId,
    ContractDraftSet: value.draftSetId,
    ContractChangeSetDraft: value.changeSetId,
    ContractBaseline: value.baselineId,
  }[value.kind];
}

function strictOrder(values, keyOf, label) {
  const keys = values.map(keyOf);
  if (new Set(keys).size !== keys.length) fail(`${label} repeats an identity`);
  if (canonicalJson(keys) !== canonicalJson([...keys].sort())) {
    fail(`${label} must use deterministic lexical order`);
  }
}

function validateContractEntries(value) {
  strictOrder(value.contracts, ({ id }) => id, `${value.kind} contracts`);
  strictOrder(
    value.requiredInterfaceIntentIds,
    (id) => id,
    `${value.kind} requiredInterfaceIntentIds`,
  );
  const required = value.requiredInterfaceIntentIds;
  const covered = value.contracts.map(({ interfaceIntentId }) => interfaceIntentId).sort();
  if (canonicalJson(required) !== canonicalJson(covered)) {
    fail(`${value.kind} must cover every required interface exactly once`);
  }
  for (const contract of value.contracts) {
    if (contract.contentDigest !== contract.artifact.digest) {
      fail(`${contract.id} contentDigest must equal its native artifact digest`);
    }
  }
}

export function validateContractGenerationArtifact(value, context = {}) {
  if (!validateDocument(value)) {
    fail(`${validationDetail(validateDocument)} (${CONTRACT_URI})`);
  }
  const contract = CONTRACT_GENERATION_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`unsupported kind ${value.kind}`);
  if (
    context.ref &&
    (context.ref.artifactId !== stableId(value) ||
      context.ref.schema !== contract.schema ||
      context.ref.mediaType !== contract.mediaType)
  ) {
    fail(`${value.kind} ArtifactRef does not identify its published contract`);
  }
  switch (value.kind) {
    case "ProjectContractState":
      strictOrder(
        value.requiredInterfaceIntentIds,
        (id) => id,
        "ProjectContractState requiredInterfaceIntentIds",
      );
      break;
    case "ContractGeneratorRequest":
      strictOrder(value.interfaceIntents, ({ id }) => id, "generator interface intents");
      strictOrder(value.inputBindings, ({ role }) => role, "generator input bindings");
      break;
    case "GeneratedContractBundle":
      strictOrder(value.entries, ({ id }) => id, "generated contract entries");
      break;
    case "ContractFormatValidationSet":
      strictOrder(value.results, ({ contractId }) => contractId, "format results");
      if (
        (value.status === "pass") !==
        value.results.every(({ status }) => status === "pass")
      ) {
        fail("format validation status does not match its results");
      }
      break;
    case "ContractCanonicalDiff":
      strictOrder(value.changes, ({ contractId }) => contractId, "canonical changes");
      break;
    case "ContractDraftSet":
    case "ContractChangeSetDraft":
      validateContractEntries(value);
      strictOrder(value.inputBindings, ({ role }) => role, `${value.kind} input bindings`);
      break;
    case "ContractBaseline":
      strictOrder(value.contracts, ({ id }) => id, "baseline contracts");
      if (value.contractsDigest !== canonicalJsonDigest(value.contracts)) {
        fail("ContractBaseline contractsDigest does not bind its contracts");
      }
      for (const entry of value.contracts) {
        if (entry.compatibility === "initial" && value.supersedes) {
          fail("a superseding baseline cannot retain initial compatibility");
        }
      }
      break;
    default:
      break;
  }
  return value;
}

export function contractGenerationRuntimeArtifactContracts() {
  return Object.entries(CONTRACT_GENERATION_ARTIFACT_CONTRACTS).map(
    ([kind, contract]) => ({
      schema: contract.schema,
      validate(value, context) {
        if (value.kind !== kind) fail(`expected ${kind}`);
        return validateContractGenerationArtifact(value, context);
      },
    }),
  );
}
