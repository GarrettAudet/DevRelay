import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import {
  ContractError,
  createInvocationFingerprint,
  createModuleRegistry,
} from "../src/module-registry.mjs";

const SOURCE_SCHEMA = "https://devrelay.dev/artifacts/source/v1";
const DRAFT_SCHEMA = "https://devrelay.dev/artifacts/draft/v1";
const REFINED_SCHEMA = "https://devrelay.dev/artifacts/refined/v1";
const PRODUCT_SCHEMA = "https://devrelay.dev/artifacts/product/v1";
const JSON_MEDIA_TYPE = "application/json";

function port(name, schema) {
  return {
    name,
    schema,
    mediaTypes: [JSON_MEDIA_TYPE],
    cardinality: "one",
    required: true,
  };
}

const moduleDefinition = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleDefinition",
  metadata: {
    id: "document-build",
    version: "0.1.0",
    description: "Build a document through an ordered adapter chain.",
  },
  operations: [
    {
      id: "build",
      description: "Build a checked document.",
      inputs: [port("source", SOURCE_SCHEMA)],
      outputs: [port("product", PRODUCT_SCHEMA)],
      inputRules: [],
      outcomes: ["built", "needs_input", "execution_failed"],
      resultContracts: {
        built: {
          status: "completed",
          requiredInputs: ["source"],
          forbiddenInputs: [],
          requiredOutputs: ["product"],
          allowedOutputs: ["product"],
          requiredEvidence: [],
          diagnosticsRequired: false,
        },
        needs_input: {
          status: "waiting",
          requiredInputs: ["source"],
          forbiddenInputs: [],
          requiredOutputs: [],
          allowedOutputs: [],
          requiredEvidence: [],
          diagnosticsRequired: true,
        },
        execution_failed: {
          status: "failed",
          requiredInputs: ["source"],
          forbiddenInputs: [],
          requiredOutputs: [],
          allowedOutputs: [],
          requiredEvidence: [],
          diagnosticsRequired: true,
        },
      },
      evidence: [],
      optionsSchema: {
        type: "object",
        additionalProperties: false,
      },
      adapterChain: {
        earlyTerminalOutcomes: ["needs_input", "execution_failed"],
        steps: [
          {
            id: "draft",
            kind: "handoff",
            outputs: [port("draft", DRAFT_SCHEMA)],
          },
          {
            id: "refine",
            kind: "handoff",
            outputs: [port("refined", REFINED_SCHEMA)],
          },
          {
            id: "finalize",
            kind: "terminal",
          },
        ],
      },
    },
  ],
};

function pluginDefinition(id, step, execution = "effect") {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModulePlugin",
    metadata: {
      id,
      version: "0.1.0",
      description: `Adapter for the ${step} step.`,
    },
    implements: [
      {
        module: {
          id: "document-build",
          version: "0.1.0",
        },
        operations: [
          {
            id: "build",
            step,
            execution,
            configSchema: {
              type: "object",
              additionalProperties: false,
              required: ["marker"],
              properties: {
                marker: {
                  type: "string",
                },
              },
            },
            capabilities:
              execution === "pure"
                ? []
                : [
                    {
                      kind: "process.spawn",
                      scope: `${step}-tool`,
                    },
                  ],
          },
        ],
      },
    ],
  };
}

function pluginDefinitions(execution = "effect") {
  return [
    pluginDefinition("draft-adapter", "draft", execution),
    pluginDefinition("refine-adapter", "refine", execution),
    pluginDefinition("finalize-adapter", "finalize", execution),
  ];
}

function artifactStore() {
  const bytesById = new Map();
  const add = (artifactId, schema, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    const ref = {
      artifactId,
      schema,
      mediaType: JSON_MEDIA_TYPE,
      digest: sha256Digest(bytes),
      uri: `artifact://test/${artifactId}`,
    };
    bytesById.set(artifactId, bytes);
    return ref;
  };
  return {
    bytesById,
    add,
    artifacts: {
      async load(ref) {
        if (!bytesById.has(ref.artifactId)) {
          throw new Error(`missing ${ref.artifactId}`);
        }
        return bytesById.get(ref.artifactId);
      },
    },
  };
}

function fixtureArtifacts(store) {
  return {
    source: store.add("source-1", SOURCE_SCHEMA, {
      kind: "Source",
      text: "source",
    }),
    draft: store.add("draft-1", DRAFT_SCHEMA, {
      kind: "Draft",
      text: "draft",
    }),
    refined: store.add("refined-1", REFINED_SCHEMA, {
      kind: "Refined",
      text: "refined",
    }),
    product: store.add("product-1", PRODUCT_SCHEMA, {
      kind: "Product",
      text: "product",
    }),
  };
}

const expectedKinds = new Map([
  [SOURCE_SCHEMA, "Source"],
  [DRAFT_SCHEMA, "Draft"],
  [REFINED_SCHEMA, "Refined"],
  [PRODUCT_SCHEMA, "Product"],
]);

const artifactContracts = [...expectedKinds].map(([schema, expectedKind]) => ({
  schema,
  validate(value) {
    assert.equal(value.kind, expectedKind);
  },
}));

function invocationFor(artifacts, invocationId = "build-001") {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId,
    runId: "run-001",
    nodeId: "document-build",
    module: {
      id: "document-build",
      version: "0.1.0",
      operation: "build",
    },
    adapters: ["draft", "refine", "finalize"].map((step) => ({
      step,
      plugin: {
        id: `${step}-adapter`,
        version: "0.1.0",
      },
      config: {
        marker: `${step}-config`,
      },
      grants: [
        {
          kind: "process.spawn",
          scope: `${step}-tool`,
        },
      ],
    })),
    inputs: {
      source: [artifacts.source],
    },
    options: {},
  };
}

function continueResult(stepInvocation, outputs) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: structuredClone(stepInvocation.plugin),
    disposition: "continue",
    outputs,
    evidence: [],
    diagnostics: [],
  };
}

function moduleResult(invocationId, artifacts, outcome = "built") {
  if (outcome === "built") {
    return {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleResult",
      invocationId,
      status: "completed",
      outcome,
      outputs: {
        product: [artifacts.product],
      },
      evidence: [],
      diagnostics: [],
    };
  }
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId,
    status: outcome === "needs_input" ? "waiting" : "failed",
    outcome,
    outputs: {},
    evidence: [],
    diagnostics: [
      {
        severity: outcome === "needs_input" ? "warning" : "error",
        code: outcome.toUpperCase(),
        message: `The chain ended with ${outcome}.`,
      },
    ],
  };
}

function terminalResult(stepInvocation, artifacts, outcome = "built") {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: structuredClone(stepInvocation.plugin),
    disposition: "terminal",
    moduleResult: moduleResult(
      stepInvocation.invocationId,
      artifacts,
      outcome,
    ),
  };
}

function memoryCheckpoints(events = []) {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        events.push(`get:${key}`);
        return values.get(key);
      },
      async put(key, value) {
        events.push(`put:${key}`);
        values.set(key, value);
      },
    },
  };
}

function registryWith(adapters, execution = "effect") {
  return createModuleRegistry({
    modules: [moduleDefinition],
    plugins: pluginDefinitions(execution).map((definition) => ({
      definition,
      adapter: adapters[definition.metadata.id],
    })),
    artifactContracts,
  });
}

function defaultAdapters(artifacts, calls = []) {
  return {
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.push("draft");
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
        });
      },
    },
    "refine-adapter": {
      async invoke(stepInvocation) {
        calls.push("refine");
        return continueResult(stepInvocation, {
          refined: [artifacts.refined],
        });
      },
    },
    "finalize-adapter": {
      async invoke(stepInvocation) {
        calls.push("finalize");
        return terminalResult(stepInvocation, artifacts);
      },
    },
  };
}

function expectContractError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

async function expectContractRejection(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("step contracts use JSON Schema draft 2020-12", async () => {
  const schemas = await Promise.all(
    [
      "module-step-invocation.schema.json",
      "module-step-result.schema.json",
    ].map(async (name) =>
      JSON.parse(
        await readFile(new URL(`../contracts/${name}`, import.meta.url), "utf8"),
      ),
    ),
  );
  for (const schema of schemas) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(schema.additionalProperties, false);
  }
  assert.ok(schemas[1].required.includes("invocationFingerprint"));
  assert.ok(schemas[0].required.includes("chainFingerprint"));
  assert.ok(schemas[0].required.includes("stepInvocationDigest"));
  assert.ok(schemas[1].required.includes("chainFingerprint"));
  assert.ok(schemas[1].required.includes("stepInvocationDigest"));
  assert.ok(schemas[1].required.includes("plugin"));
});

test("registry resolves an immutable exact-order chain plan", () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const adapters = defaultAdapters(artifacts);
  const registry = registryWith(adapters);
  const resolution = registry.resolve(invocation);

  assert.equal(resolution.mode, "chain");
  assert.deepEqual(
    resolution.steps.map(({ stepDefinition }) => stepDefinition.id),
    ["draft", "refine", "finalize"],
  );
  assert.equal(Object.isFrozen(resolution), true);
  assert.equal(Object.isFrozen(resolution.steps[0].binding.config), true);

  const changedConfig = structuredClone(invocation);
  changedConfig.adapters[1].config.marker = "changed";
  assert.notEqual(
    createInvocationFingerprint(invocation),
    createInvocationFingerprint(changedConfig),
  );
});

test("runner validates bytes, checkpoints effects, and passes ordered handoffs", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const calls = [];
  const checkpointEvents = [];
  const checkpoints = memoryCheckpoints(checkpointEvents);
  const registry = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.push(stepInvocation.step);
        assert.deepEqual(stepInvocation.priorResults, []);
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
        });
      },
    },
    "refine-adapter": {
      async invoke(stepInvocation) {
        calls.push(stepInvocation.step);
        assert.equal(stepInvocation.priorResults[0].step, "draft");
        return continueResult(stepInvocation, {
          refined: [artifacts.refined],
        });
      },
    },
    "finalize-adapter": {
      async invoke(stepInvocation) {
        calls.push(stepInvocation.step);
        assert.deepEqual(
          stepInvocation.priorResults.map(({ step }) => step),
          ["draft", "refine"],
        );
        return terminalResult(stepInvocation, artifacts);
      },
    },
  });

  const result = await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });

  assert.deepEqual(calls, ["draft", "refine", "finalize"]);
  assert.equal(result.outcome, "built");
  assert.equal(checkpointEvents.filter((event) => event.startsWith("put:")).length, 3);
});

test("resolution rejects missing, reordered, and incompatible step bindings", () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const registry = registryWith(defaultAdapters(artifacts));

  const missing = structuredClone(invocation);
  missing.adapters.pop();
  expectContractError(() => registry.resolve(missing), "DR1612");

  const reordered = structuredClone(invocation);
  [reordered.adapters[0], reordered.adapters[1]] = [
    reordered.adapters[1],
    reordered.adapters[0],
  ];
  expectContractError(() => registry.resolve(reordered), "DR1613");

  const incompatible = structuredClone(invocation);
  incompatible.adapters[1].plugin = structuredClone(
    incompatible.adapters[0].plugin,
  );
  expectContractError(() => registry.resolve(incompatible), "DR1603");
});

test("registration rejects a chain plug-in without an explicit step", () => {
  const definitions = pluginDefinitions();
  const invalidPlugin = structuredClone(definitions[0]);
  delete invalidPlugin.implements[0].operations[0].step;
  expectContractError(
    () =>
      createModuleRegistry({
        modules: [moduleDefinition],
        plugins: [
          {
            definition: invalidPlugin,
            adapter: {
              async invoke() {},
            },
          },
        ],
        artifactContracts,
      }),
    "DR1310",
  );
});

test("invalid handoff shape or content stops before downstream work and persistence", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const calls = [];
  const checkpoints = memoryCheckpoints();
  const invalidShape = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.push("draft");
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
          unexpected: [artifacts.draft],
        });
      },
    },
    "refine-adapter": defaultAdapters(artifacts)["refine-adapter"],
    "finalize-adapter": defaultAdapters(artifacts)["finalize-adapter"],
  });
  await expectContractRejection(
    invalidShape.execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: checkpoints.store,
    }),
    "DR1804",
  );
  assert.deepEqual(calls, ["draft"]);
  assert.equal(checkpoints.values.size, 0);

  const invalidContentRef = structuredClone(artifacts.draft);
  invalidContentRef.digest = `sha256:${"f".repeat(64)}`;
  const invalidContent = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        return continueResult(stepInvocation, {
          draft: [invalidContentRef],
        });
      },
    },
    "refine-adapter": defaultAdapters(artifacts)["refine-adapter"],
    "finalize-adapter": defaultAdapters(artifacts)["finalize-adapter"],
  });
  await expectContractRejection(
    invalidContent.execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: memoryCheckpoints().store,
    }),
    "DR2103",
  );
});

test("declared early terminal outcome stops remaining steps", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const calls = [];
  const registry = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.push("draft");
        return terminalResult(stepInvocation, artifacts, "needs_input");
      },
    },
    "refine-adapter": {
      async invoke() {
        calls.push("refine");
      },
    },
    "finalize-adapter": {
      async invoke() {
        calls.push("finalize");
      },
    },
  });

  const result = await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: memoryCheckpoints().store,
  });
  assert.equal(result.outcome, "needs_input");
  assert.deepEqual(calls, ["draft"]);
});

test("step results bind the exact fingerprint and plug-in", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const makeRegistry = (mutate) =>
    registryWith({
      "draft-adapter": {
        async invoke(stepInvocation) {
          const result = continueResult(stepInvocation, {
            draft: [artifacts.draft],
          });
          mutate(result);
          return result;
        },
      },
      "refine-adapter": defaultAdapters(artifacts)["refine-adapter"],
      "finalize-adapter": defaultAdapters(artifacts)["finalize-adapter"],
    });

  await expectContractRejection(
    makeRegistry((result) => {
      result.invocationFingerprint = `sha256:${"e".repeat(64)}`;
    }).execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: memoryCheckpoints().store,
    }),
    "DR1808",
  );

  await expectContractRejection(
    makeRegistry((result) => {
      result.plugin.version = "9.9.9";
    }).execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: memoryCheckpoints().store,
    }),
    "DR1809",
  );
});

test("effectful chains require a complete checkpoint store before loading or invoking", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  let loads = 0;
  let calls = 0;
  const registry = registryWith(
    Object.fromEntries(
      Object.entries(defaultAdapters(artifacts)).map(([id]) => [
        id,
        {
          async invoke() {
            calls += 1;
          },
        },
      ]),
    ),
  );
  await expectContractRejection(
    registry.execute(invocation, {
      artifacts: {
        async load(ref) {
          loads += 1;
          return store.artifacts.load(ref);
        },
      },
    }),
    "DR2200",
  );
  assert.equal(loads, 0);
  assert.equal(calls, 0);
});

test("an interrupted chain resumes from validated effect checkpoints", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const calls = { draft: 0, refine: 0, finalize: 0 };
  let failRefine = true;
  const checkpoints = memoryCheckpoints();
  const registry = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.draft += 1;
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
        });
      },
    },
    "refine-adapter": {
      async invoke(stepInvocation) {
        calls.refine += 1;
        if (failRefine) {
          throw new Error("interrupted");
        }
        return continueResult(stepInvocation, {
          refined: [artifacts.refined],
        });
      },
    },
    "finalize-adapter": {
      async invoke(stepInvocation) {
        calls.finalize += 1;
        return terminalResult(stepInvocation, artifacts);
      },
    },
  });

  await assert.rejects(
    registry.execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: checkpoints.store,
    }),
    /interrupted/,
  );
  assert.deepEqual(calls, { draft: 1, refine: 1, finalize: 0 });
  assert.equal(checkpoints.values.size, 1);

  failRefine = false;
  const result = await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });
  assert.equal(result.outcome, "built");
  assert.deepEqual(calls, { draft: 1, refine: 2, finalize: 1 });
});

test("a completed terminal checkpoint is reusable only by the exact invocation", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const calls = [];
  const checkpoints = memoryCheckpoints();
  const registry = registryWith(defaultAdapters(artifacts, calls));
  const invocation = invocationFor(artifacts);

  await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });
  await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });
  assert.deepEqual(calls, ["draft", "refine", "finalize"]);

  await registry.execute(invocationFor(artifacts, "build-002"), {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });
  assert.deepEqual(calls, [
    "draft",
    "refine",
    "finalize",
    "draft",
    "refine",
    "finalize",
  ]);
});

test("a corrupt checkpoint fails closed instead of rerunning the effect", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  const checkpoints = memoryCheckpoints();
  const calls = [];
  const registry = registryWith(defaultAdapters(artifacts, calls));
  await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpoints.store,
  });
  const [firstKey, firstValue] = checkpoints.values.entries().next().value;
  const corrupt = structuredClone(firstValue);
  corrupt.invocationFingerprint = `sha256:${"e".repeat(64)}`;
  checkpoints.values.set(firstKey, corrupt);

  await expectContractRejection(
    registry.execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: checkpoints.store,
    }),
    "DR1808",
  );
  assert.deepEqual(calls, ["draft", "refine", "finalize"]);
});

test("terminal artifact validation and checkpoint writes precede progression", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const badProduct = store.add("product-bad", PRODUCT_SCHEMA, {
    kind: "NotProduct",
  });
  const invocation = invocationFor(artifacts);
  const checkpoints = memoryCheckpoints();
  const registry = registryWith({
    ...defaultAdapters(artifacts),
    "finalize-adapter": {
      async invoke(stepInvocation) {
        const result = terminalResult(stepInvocation, artifacts);
        result.moduleResult.outputs.product = [badProduct];
        return result;
      },
    },
  });

  await expectContractRejection(
    registry.execute(invocation, {
      artifacts: store.artifacts,
      checkpoints: checkpoints.store,
    }),
    "DR2104",
  );
  assert.equal(checkpoints.values.size, 2);
});

test("execution uses an immutable invocation snapshot across awaits", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  let release;
  let firstLoad = true;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const observed = [];
  const registry = registryWith({
    "draft-adapter": {
      async invoke(stepInvocation) {
        observed.push({
          operation: stepInvocation.module.operation,
          marker: stepInvocation.config.marker,
          source: stepInvocation.inputs.source[0].artifactId,
        });
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
        });
      },
    },
    "refine-adapter": defaultAdapters(artifacts)["refine-adapter"],
    "finalize-adapter": defaultAdapters(artifacts)["finalize-adapter"],
  });

  const execution = registry.execute(invocation, {
    artifacts: {
      async load(ref) {
        if (firstLoad) {
          firstLoad = false;
          await gate;
        }
        return store.artifacts.load(ref);
      },
    },
    checkpoints: memoryCheckpoints().store,
  });
  invocation.module.operation = "mutated";
  invocation.adapters[0].config.marker = "mutated";
  invocation.inputs.source[0].artifactId = "mutated";
  release();

  const result = await execution;
  assert.equal(result.outcome, "built");
  assert.deepEqual(observed, [
    {
      operation: "build",
      marker: "draft-config",
      source: "source-1",
    },
  ]);
});

test("all-pure chains may run without checkpoint storage", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const invocation = invocationFor(artifacts);
  invocation.adapters.forEach((binding) => {
    binding.grants = [];
  });
  const calls = [];
  const registry = registryWith(defaultAdapters(artifacts, calls), "pure");
  const result = await registry.execute(invocation, {
    artifacts: store.artifacts,
  });
  assert.equal(result.outcome, "built");
  assert.deepEqual(calls, ["draft", "refine", "finalize"]);
});


test("a changed pure handoff cannot replay a stale downstream effect checkpoint", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const alternateDraft = store.add("draft-2", DRAFT_SCHEMA, {
    kind: "Draft",
    text: "changed draft",
  });
  let selectedDraft = artifacts.draft;
  const calls = [];
  const adapters = {
    "draft-adapter": {
      async invoke(stepInvocation) {
        calls.push("draft");
        return continueResult(stepInvocation, {
          draft: [selectedDraft],
        });
      },
    },
    "refine-adapter": {
      async invoke(stepInvocation) {
        calls.push("refine");
        return continueResult(stepInvocation, {
          refined: [artifacts.refined],
        });
      },
    },
    "finalize-adapter": {
      async invoke(stepInvocation) {
        calls.push("finalize");
        return terminalResult(stepInvocation, artifacts);
      },
    },
  };
  const definitions = [
    pluginDefinition("draft-adapter", "draft", "pure"),
    pluginDefinition("refine-adapter", "refine", "effect"),
    pluginDefinition("finalize-adapter", "finalize", "pure"),
  ];
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: definitions.map((definition) => ({
      definition,
      adapter: adapters[definition.metadata.id],
    })),
    artifactContracts,
  });
  const invocation = invocationFor(artifacts);
  const checkpointStore = memoryCheckpoints();

  await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpointStore.store,
  });
  selectedDraft = alternateDraft;
  await registry.execute(invocation, {
    artifacts: store.artifacts,
    checkpoints: checkpointStore.store,
  });

  assert.deepEqual(calls, [
    "draft",
    "refine",
    "finalize",
    "draft",
    "refine",
    "finalize",
  ]);
  assert.equal(checkpointStore.values.size, 2);
});

test("each adapter receives a distinct immutable data context", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const contexts = [];
  const adapters = {
    "draft-adapter": {
      async invoke(stepInvocation, context) {
        contexts.push(context);
        assert.equal(Object.isFrozen(context), true);
        assert.equal(Object.isFrozen(context.scratch), true);
        assert.throws(() => context.scratch.push("hidden-handoff"));
        return continueResult(stepInvocation, {
          draft: [artifacts.draft],
        });
      },
    },
    "refine-adapter": {
      async invoke(stepInvocation, context) {
        contexts.push(context);
        assert.deepEqual(context.scratch, []);
        return continueResult(stepInvocation, {
          refined: [artifacts.refined],
        });
      },
    },
    "finalize-adapter": {
      async invoke(stepInvocation, context) {
        contexts.push(context);
        assert.deepEqual(context.scratch, []);
        return terminalResult(stepInvocation, artifacts);
      },
    },
  };
  const registry = registryWith(adapters, "pure");
  await registry.execute(invocationFor(artifacts), {
    artifacts: store.artifacts,
    createAdapterContext() {
      return { scratch: [] };
    },
  });

  assert.equal(contexts.length, 3);
  assert.notEqual(contexts[0], contexts[1]);
  assert.notEqual(contexts[1], contexts[2]);
});


test("adapter contexts reject shared memory before the first adapter runs", async () => {
  const store = artifactStore();
  const artifacts = fixtureArtifacts(store);
  const calls = [];
  const registry = registryWith(defaultAdapters(artifacts, calls), "pure");
  const shared = new SharedArrayBuffer(8);

  await expectContractRejection(
    registry.execute(invocationFor(artifacts), {
      artifacts: store.artifacts,
      createAdapterContext() {
        return { shared };
      },
    }),
    "DR2301",
  );
  assert.deepEqual(calls, []);
});
