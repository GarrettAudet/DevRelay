import Ajv2020 from "ajv/dist/2020.js";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

export const JSON_SCHEMA_VALIDATOR = Object.freeze({
  id: "devrelay.json-schema-2020-12-validator",
  version: "0.1.0",
  dialect: "https://json-schema.org/draft/2020-12/schema",
});

export class ContractFormatValidationError extends Error {
  constructor(message) {
    super(`contract format validation failed: ${message}`);
    this.name = "ContractFormatValidationError";
    this.code = "DR4050";
  }
}

function diagnostic(code, subject, message) {
  return { code, severity: "error", subject, message };
}

function exactJson(bytes) {
  const raw = Buffer.from(bytes);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (!Buffer.from(text, "utf8").equals(raw)) throw new Error("non-canonical UTF-8");
  const parsed = JSON.parse(text);
  if (!raw.equals(Buffer.from(canonicalJson(parsed), "utf8"))) {
    throw new Error("JSON bytes are not canonical");
  }
  return parsed;
}

function validateJsonSchema(bytes, entry) {
  const diagnostics = [];
  try {
    const schema = exactJson(bytes);
    if (schema.$schema !== JSON_SCHEMA_VALIDATOR.dialect) {
      diagnostics.push(
        diagnostic(
          "CG_UNSUPPORTED_JSON_SCHEMA_DIALECT",
          entry.id,
          `expected ${JSON_SCHEMA_VALIDATOR.dialect}`,
        ),
      );
    } else {
      const ajv = new Ajv2020({ strict: true, allErrors: true });
      if (!ajv.validateSchema(schema)) {
        diagnostics.push(
          diagnostic(
            "CG_INVALID_JSON_SCHEMA",
            entry.id,
            ajv.errorsText(ajv.errors, { separator: "; " }),
          ),
        );
      } else {
        ajv.compile(schema);
      }
    }
  } catch (error) {
    diagnostics.push(
      diagnostic("CG_INVALID_JSON_SCHEMA", entry.id, String(error.message ?? error)),
    );
  }
  return {
    contractId: entry.id,
    interfaceIntentId: entry.interfaceIntentId,
    contractKind: entry.contractKind,
    artifact: entry.artifact,
    validator: { id: JSON_SCHEMA_VALIDATOR.id, version: JSON_SCHEMA_VALIDATOR.version },
    status: diagnostics.length === 0 ? "pass" : "fail",
    diagnostics,
  };
}

export function createContractFormatRegistry({ validators = {} } = {}) {
  const implementations = new Map([
    ["json-schema", validateJsonSchema],
    ...Object.entries(validators),
  ]);
  const descriptors = [...implementations.keys()]
    .sort()
    .map((kind) => ({
      kind,
      validator:
        kind === "json-schema"
          ? JSON_SCHEMA_VALIDATOR
          : { id: `configured.${kind}-validator`, version: "0.1.0" },
    }));
  const registryDigest = canonicalJsonDigest(descriptors);
  return Object.freeze({
    registryDigest,
    supportedKinds: Object.freeze(descriptors.map(({ kind }) => kind)),
    validate({ entry, bytes }) {
      const implementation = implementations.get(entry.contractKind);
      if (!implementation) {
        return {
          contractId: entry.id,
          interfaceIntentId: entry.interfaceIntentId,
          contractKind: entry.contractKind,
          artifact: entry.artifact,
          validator: { id: "devrelay.unsupported-validator", version: "0.1.0" },
          status: "fail",
          diagnostics: [
            diagnostic(
              "CG_UNSUPPORTED_CONTRACT_KIND",
              entry.id,
              `no pinned validator exists for ${entry.contractKind}`,
            ),
          ],
        };
      }
      if (sha256Digest(Buffer.from(bytes)) !== entry.artifact.digest) {
        throw new ContractFormatValidationError(`${entry.id} bytes do not match artifact`);
      }
      return implementation(Buffer.from(bytes), entry);
    },
  });
}

export function createJsonSchemaContractBundle(request, producer = {}) {
  const descriptor = {
    id: producer.id ?? "devrelay.json-schema-contract-generator",
    version: producer.version ?? "0.1.0",
  };
  const entries = request.interfaceIntents.map((intent) => {
    const id = `CT-${intent.id}`;
    const schema = {
      $schema: JSON_SCHEMA_VALIDATOR.dialect,
      $id: `https://devrelay.dev/generated/${intent.id.toLowerCase()}/v1`,
      title: `${intent.name} contract`,
      type: "object",
      additionalProperties: false,
      required: ["apiVersion", "interfaceIntentId", "inputs", "outputs"],
      properties: {
        apiVersion: { const: "devrelay.dev/v1alpha1" },
        interfaceIntentId: { const: intent.id },
        inputs: { type: "object" },
        outputs: { type: "object" },
      },
      description: intent.purpose,
    };
    return {
      id,
      interfaceIntentId: intent.id,
      contractKind: request.contractKind,
      schema: JSON_SCHEMA_VALIDATOR.dialect,
      mediaType: "application/schema+json",
      bytesBase64: Buffer.from(canonicalJson(schema), "utf8").toString("base64"),
    };
  });
  const material = { requestId: request.requestId, producer: descriptor, entries };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "GeneratedContractBundle",
    bundleId: `GCB-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    requestId: request.requestId,
    producer: descriptor,
    entries,
    diagnostics: [],
  };
}
