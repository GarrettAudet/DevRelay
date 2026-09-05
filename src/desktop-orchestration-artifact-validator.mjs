import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI = "https://devrelay.dev/contracts/desktop-orchestration-artifacts.schema.json";
const validator = compileArtifactSchema(JSON.parse(readFileSync(new URL("../contracts/desktop-orchestration-artifacts.schema.json", import.meta.url), "utf8")));

export class DesktopOrchestrationArtifactValidationError extends Error {
  constructor(message) {
    super(`desktop orchestration artifact is invalid: ${message}`);
    this.name = "DesktopOrchestrationArtifactValidationError";
    this.code = "DR6150";
  }
}

const fail = (message) => { throw new DesktopOrchestrationArtifactValidationError(message); };
const digestField = Object.freeze({
  DesktopOrchestrationPlan: "planDigest",
  DesktopTaskReceipt: "receiptDigest",
  DesktopOperatorSnapshot: "snapshotDigest",
});

export function validateDesktopOrchestrationArtifact(value) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const field = digestField[value.kind];
  if (field) {
    const { [field]: digest, ...material } = value;
    if (digest !== canonicalJsonDigest(material)) fail(`${field} does not bind canonical content`);
  }
  if (value.kind === "DesktopOrchestrationPlan") {
    const ids = new Set(value.workItems.map(({ id }) => id));
    if (ids.size !== value.workItems.length) fail("work item identities repeat");
    for (const item of value.workItems) for (const dependency of item.dependencies) if (!ids.has(dependency)) fail(`dependency ${dependency} is unresolved`);
  }
  return value;
}
