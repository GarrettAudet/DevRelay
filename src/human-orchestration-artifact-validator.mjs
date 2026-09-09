import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI = "https://devrelay.dev/contracts/human-orchestration-artifacts.schema.json";
const validator = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/human-orchestration-artifacts.schema.json", import.meta.url), "utf8")));
const digestFields = Object.freeze({
  HumanOrchestrationSourceBundle: "bundleDigest",
  HumanOrchestrationView: "viewDigest",
  HumanInterventionRequest: "requestDigest",
  HumanInterventionReceipt: "receiptDigest",
});

export class HumanOrchestrationArtifactValidationError extends Error {
  constructor(message) {
    super(`human orchestration artifact is invalid: ${message}`);
    this.name = "HumanOrchestrationArtifactValidationError";
    this.code = "DR7450";
  }
}

export function validateHumanOrchestrationArtifact(value) {
  if (!validator(value)) throw new HumanOrchestrationArtifactValidationError(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const field = digestFields[value.kind];
  const { apiVersion, kind, [field]: digest, ...material } = value;
  void apiVersion; void kind;
  if (digest !== canonicalJsonDigest(material)) throw new HumanOrchestrationArtifactValidationError(`${field} does not bind canonical content`);
  return value;
}
