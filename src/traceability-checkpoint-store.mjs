function requireKey(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("traceability checkpoint key must be a non-empty string");
  }
}

function immutableCopy(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

export function createInMemoryTraceabilityCheckpointStore() {
  const values = new Map();
  return Object.freeze({
    async get(key) {
      requireKey(key);
      const found = values.get(key);
      return found === undefined ? undefined : immutableCopy(found);
    },
    async putIfAbsent(key, value) {
      requireKey(key);
      if (!values.has(key)) {
        values.set(key, immutableCopy(value));
      }
      return immutableCopy(values.get(key));
    },
  });
}
