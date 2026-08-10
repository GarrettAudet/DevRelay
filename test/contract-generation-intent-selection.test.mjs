import assert from "node:assert/strict";
import test from "node:test";

import { selectRequiredContractGenerationIntents } from "../src/contract-generation-intent-selection.mjs";

test("ContractGeneration selector includes only explicit nested true dispositions", () => {
  const architecture = { sections: { interfaceIntent: { content: { interfaces: [
    { id: "IF-TRUE", required: false, contractGeneration: { required: true, suggestedKinds: ["json-schema"] } },
    { id: "IF-FALSE", required: true, contractGeneration: { required: false, suggestedKinds: [] } },
    { id: "IF-MISSING", required: true },
  ] } } } };
  assert.deepEqual(selectRequiredContractGenerationIntents(architecture).map(({ id }) => id), ["IF-TRUE"]);
});

test("ContractGeneration selector rejects a missing architecture interface set", () => {
  assert.throws(() => selectRequiredContractGenerationIntents({}), /omits interface intents/);
});
