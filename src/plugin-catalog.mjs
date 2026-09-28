import { createModuleRegistry } from "./module-registry.mjs";

function frozenCopy(value) {
  const copy = structuredClone(value);
  const freeze = item => {
    if (item !== null && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function validateFilter(filter) {
  if (filter === null || typeof filter !== "object" || Array.isArray(filter)) {
    throw new TypeError("catalog filter must be an object");
  }
  if (Object.keys(filter).some(key => !["module", "operation", "step"].includes(key))) {
    throw new TypeError("catalog filter supports only module, operation and step");
  }
  for (const key of ["operation", "step"]) {
    if (Object.hasOwn(filter, key) && (typeof filter[key] !== "string" || filter[key].length === 0)) {
      throw new TypeError(`catalog ${key} must be a non-empty string`);
    }
  }
  if (Object.hasOwn(filter, "module")) {
    const module = filter.module;
    if (module === null || typeof module !== "object" || Array.isArray(module)
      || Object.keys(module).length !== 2
      || typeof module.id !== "string" || module.id.length === 0
      || typeof module.version !== "string" || module.version.length === 0) {
      throw new TypeError("catalog module filter requires only an exact id and version");
    }
  }
}

/**
 * Describe explicitly registered implementations. Registration and execution
 * remain owned by Core. A listing is not an attestation of live conformance.
 */
export function createPluginCatalog({
  modules = [], plugins = [], artifactContracts = [], traceability,
} = {}) {
  // Validate and bind adapters before exposing any metadata.
  const registry = createModuleRegistry({ modules, plugins, artifactContracts, traceability });
  const entries = [];
  for (const { definition } of plugins) {
    for (const implementation of definition.implements) {
      for (const operation of implementation.operations) {
        entries.push(frozenCopy({
          plugin: { id: definition.metadata.id, version: definition.metadata.version },
          description: definition.metadata.description,
          module: implementation.module,
          operation: operation.id,
          ...(operation.step === undefined ? {} : { step: operation.step }),
          execution: operation.execution,
          configSchema: operation.configSchema,
          capabilities: operation.capabilities,
        }));
      }
    }
  }
  const key = entry => [entry.module.id, entry.module.version, entry.operation,
    entry.step ?? "", entry.plugin.id, entry.plugin.version].join("\0");
  entries.sort((left, right) => key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0);

  return Object.freeze({
    registry,
    list(filter = {}) {
      validateFilter(filter);
      return Object.freeze(entries.filter(entry =>
        (filter.module === undefined || (entry.module.id === filter.module.id
          && entry.module.version === filter.module.version))
        && (filter.operation === undefined || entry.operation === filter.operation)
        && (filter.step === undefined || entry.step === filter.step)));
    },
  });
}
