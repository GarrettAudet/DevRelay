import { sha256Digest } from "./content-digest.mjs";

export class ArtifactRuntimeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ArtifactRuntimeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ArtifactRuntimeError(code, message);
}

function immutableCopy(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) {
        freeze(child);
      }
    }
    return item;
  };
  return freeze(copy);
}

function asBytes(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  fail("DR2102", "artifact loader must return raw bytes");
}

function decodeUtf8(bytes, artifactId) {
  try {
    return new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch (error) {
    fail(
      "DR2106",
      `artifact "${artifactId}" is not valid UTF-8: ${error.message}`,
    );
  }
}

export function createArtifactContractRegistry(contracts = []) {
  if (!Array.isArray(contracts)) {
    fail("DR1503", "artifactContracts must be an array");
  }
  const registry = new Map();
  for (const [index, contract] of contracts.entries()) {
    if (
      contract === null ||
      typeof contract !== "object" ||
      Array.isArray(contract)
    ) {
      fail("DR1503", `artifactContracts[${index}] must be an object`);
    }
    if (typeof contract.schema !== "string" || contract.schema.length === 0) {
      fail(
        "DR1503",
        `artifactContracts[${index}].schema must be a non-empty string`,
      );
    }
    if (typeof contract.validate !== "function") {
      fail(
        "DR1503",
        `artifactContracts[${index}].validate must be a function`,
      );
    }
    if (registry.has(contract.schema)) {
      fail(
        "DR1504",
        `artifact contract "${contract.schema}" is registered more than once`,
      );
    }
    registry.set(
      contract.schema,
      Object.freeze({
        schema: contract.schema,
        validate: contract.validate,
      }),
    );
  }
  return registry;
}

export function requireArtifactContracts(schemas, contracts) {
  for (const schema of schemas) {
    if (!contracts.has(schema)) {
      fail("DR2101", `no trusted artifact validator is registered for ${schema}`);
    }
  }
}

export function requireArtifactLoader(artifacts) {
  if (
    artifacts === null ||
    typeof artifacts !== "object" ||
    typeof artifacts.load !== "function"
  ) {
    fail("DR2100", "execution requires context.artifacts.load(ref)");
  }
}

export async function loadArtifactBytes(ref, artifacts) {
  requireArtifactLoader(artifacts);
  let supplied;
  try {
    supplied = await artifacts.load(immutableCopy(ref));
  } catch (error) {
    fail(
      "DR2102",
      `artifact "${ref.artifactId}" could not be loaded: ${error.message}`,
    );
  }
  const bytes = asBytes(supplied);
  const actualDigest = sha256Digest(bytes);
  if (actualDigest !== ref.digest) {
    fail(
      "DR2103",
      `artifact "${ref.artifactId}" bytes do not match ${ref.digest}`,
    );
  }
  return Object.freeze({
    ref: immutableCopy(ref),
    bytes,
  });
}

export async function loadArtifactContent(ref, artifacts) {
  const loaded = await loadArtifactBytes(ref, artifacts);
  let value;
  try {
    value = JSON.parse(decodeUtf8(loaded.bytes, ref.artifactId));
  } catch (error) {
    if (error instanceof ArtifactRuntimeError) {
      throw error;
    }
    fail(
      "DR2104",
      `artifact "${ref.artifactId}" is not valid JSON: ${error.message}`,
    );
  }
  return Object.freeze({
    ...loaded,
    value: immutableCopy(value),
  });
}

export async function validateLoadedArtifact(
  loaded,
  contracts,
  validationContext,
) {
  const contract = contracts.get(loaded.ref.schema);
  if (!contract) {
    fail(
      "DR2101",
      `no trusted artifact validator is registered for ${loaded.ref.schema}`,
    );
  }
  try {
    await contract.validate(loaded.value, {
      ...validationContext,
      ref: loaded.ref,
    });
  } catch (error) {
    if (error instanceof ArtifactRuntimeError) {
      throw error;
    }
    fail(
      "DR2104",
      `artifact "${loaded.ref.artifactId}" validation failed: ${error.message}`,
    );
  }
  return loaded;
}

export async function loadAndValidateArtifact(
  ref,
  contracts,
  artifacts,
  validationContext = {},
) {
  const loaded = await loadArtifactContent(ref, artifacts);
  return validateLoadedArtifact(loaded, contracts, validationContext);
}

export function rethrowArtifactRuntime(error, failWithContractError) {
  if (error instanceof ArtifactRuntimeError) {
    const prefix = `${error.code}: `;
    failWithContractError(
      error.code,
      error.message.startsWith(prefix)
        ? error.message.slice(prefix.length)
        : error.message,
    );
  }
  throw error;
}
