import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/chatgpt-desktop-runtime-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema);

export const CHATGPT_DESKTOP_RUNTIME_CONTRACT_BASELINE_VERSION = "1.8.0";
export const CHATGPT_DESKTOP_RUNTIME_INTERFACE_INTENT_IDS = Object.freeze([
  "IF-DESKTOP-CAPABILITY-RESOLUTION",
  "IF-DESKTOP-INSTALLATION",
  "IF-DESKTOP-MCP-COMMANDS",
  "IF-DESKTOP-RUN-STATE",
  "IF-DESKTOP-RUN-VIEW",
  "IF-DESKTOP-TASK-LIFECYCLE",
]);

const approved = new Map([
  ["IF-DESKTOP-CAPABILITY-RESOLUTION", { contractId: "CT-IF-DESKTOP-CAPABILITY-RESOLUTION", contentDigest: "sha256:fc362bfa6a748b80ac45550126785f28e6b6d48ee282cc46da51eaa0ec8f137d" }],
  ["IF-DESKTOP-INSTALLATION", { contractId: "CT-IF-DESKTOP-INSTALLATION", contentDigest: "sha256:c5a29275e51bf955e939beb85c6b3d1e44756b161c7e9bb327caafb736f7f8b9" }],
  ["IF-DESKTOP-MCP-COMMANDS", { contractId: "CT-IF-DESKTOP-MCP-COMMANDS", contentDigest: "sha256:e9dd5bbe98db41c563c6136614bf4c646ab70ea1ad8dde77e6f0e16098cf1450" }],
  ["IF-DESKTOP-RUN-STATE", { contractId: "CT-IF-DESKTOP-RUN-STATE", contentDigest: "sha256:2f44b9160545da878266b3c6759a23876642c814d7545c05867b40bf8d1b6f9b" }],
  ["IF-DESKTOP-RUN-VIEW", { contractId: "CT-IF-DESKTOP-RUN-VIEW", contentDigest: "sha256:e1a2a3ae210225dac3ce2af9ab0465721895b47108d9ec1f03c918fb7fbbe3ac" }],
  ["IF-DESKTOP-TASK-LIFECYCLE", { contractId: "CT-IF-DESKTOP-TASK-LIFECYCLE", contentDigest: "sha256:87fa260e71fbe0f0653a9acc62062ca87fee3258968678f5106a80e33d5db60f" }],
].map(([interfaceIntentId, contract]) => [interfaceIntentId, Object.freeze(contract)]));

export const CHATGPT_DESKTOP_RUNTIME_APPROVED_CONTRACTS = Object.freeze(Object.fromEntries(approved));

export class ChatGptDesktopRuntimeArtifactValidationError extends Error {
  constructor(message) {
    super(`ChatGPT Desktop runtime artifact is invalid: ${message}`);
    this.name = "ChatGptDesktopRuntimeArtifactValidationError";
    this.code = "DR4090";
  }
}

export function validateChatGptDesktopRuntimeArtifact(value) {
  if (!validator(value)) throw new ChatGptDesktopRuntimeArtifactValidationError(validationDetail(validator));
  if (!approved.has(value.interfaceIntentId)) throw new ChatGptDesktopRuntimeArtifactValidationError("interface is not approved by ContractBaseline 1.7.0");
  return value;
}

export function canonicalChatGptDesktopRuntimeArtifact(value) {
  return canonicalJson(validateChatGptDesktopRuntimeArtifact(value));
}

export function canonicalChatGptDesktopRuntimeArtifactDigest(value) {
  return canonicalJsonDigest(validateChatGptDesktopRuntimeArtifact(value));
}

export function chatGptDesktopRuntimeArtifactEvidence(value) {
  const bytes = Buffer.from(canonicalChatGptDesktopRuntimeArtifact(value), "utf8");
  return Object.freeze({ bytes, digest: sha256Digest(bytes), contract: approved.get(value.interfaceIntentId) });
}
