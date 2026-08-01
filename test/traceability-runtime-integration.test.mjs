import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  ContractError,
  createModuleRegistry,
} from "../src/module-registry.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";

const SOURCE_SCHEMA = "https://devrelay.dev/artifacts/trace-test-source/v1";
const DRAFT_SCHEMA = "https://devrelay.dev/artifacts/trace-test-draft/v1";
const PRODUCT_SCHEMA = "https://devrelay.dev/artifacts/trace-test-product/v1";
const JSON_MEDIA_TYPE = "application/json";

function clone(value) {
  return structuredClone(value);
}

function port(name, schema) {
  return {
    name,
    schema,
    mediaTypes: [JSON_MEDIA_TYPE],
    cardinality: "one",
    required: true,
  };
}

function resultContract({ status, inputs, outputs, diagnosticsRequired = false }) {
  return {
    status,
    requiredInputs: inputs,
    forbiddenInputs: [],
    requiredOutputs: outputs,
    allowedOutputs: outputs,
    requiredEvidence: [],
    diagnosticsRequired,
  };
}

const singleModule = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleDefinition",
  metadata: {
    id: "trace-test",
    version: "0.1.0",
    description: "A provider-neutral pure module used to test graph-aware execution.",
  },
  operations: [
    {
      id: "build",
      description: "Build one product from one source.",
      inputs: [port("source", SOURCE_SCHEMA)],
      outputs: [port("product", PRODUCT_SCHEMA)],
      inputRules: [],
      outcomes: ["built", "execution_failed"],
      resultContracts: {
        built: resultContract({
          status: "completed",
          inputs: ["source"],
          outputs: ["product"],
        }),
        execution_failed: resultContract({
          status: "failed",
          inputs: ["source"],
          outputs: [],
          diagnosticsRequired: true,
        }),
      },
      evidence: [],
      optionsSchema: {
        type: "object",
        additionalProperties: false,
      },
    },
  ],
};

const singlePlugin = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModulePlugin",
  metadata: {
    id: "trace-test-plugin",
    version: "0.1.0",
    description: "Pure test adapter for graph-aware registry execution.",
  },
  implements: [
    {
      module: {
        id: "trace-test",
        version: "0.1.0",
      },
      operations: [
        {
          id: "build",
          execution: "pure",
          configSchema: {
            type: "object",
            additionalProperties: false,
          },
          capabilities: [],
        },
      ],
    },
  ],
};

const chainModule = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleDefinition",
  metadata: {
    id: "trace-chain",
    version: "0.1.0",
    description: "A two-adapter pure chain used to test graph-aware replay.",
  },
  operations: [
    {
      id: "build",
      description: "Draft and finalize one product.",
      inputs: [port("source", SOURCE_SCHEMA)],
      outputs: [port("product", PRODUCT_SCHEMA)],
      inputRules: [],
      outcomes: ["built", "execution_failed"],
      resultContracts: {
        built: resultContract({
          status: "completed",
          inputs: ["source"],
          outputs: ["product"],
        }),
        execution_failed: resultContract({
          status: "failed",
          inputs: ["source"],
          outputs: [],
          diagnosticsRequired: true,
        }),
      },
      evidence: [],
      optionsSchema: {
        type: "object",
        additionalProperties: false,
      },
      adapterChain: {
        earlyTerminalOutcomes: ["execution_failed"],
        steps: [
          {
            id: "draft",
            kind: "handoff",
            outputs: [port("draft", DRAFT_SCHEMA)],
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

function chainPlugin(id, step) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModulePlugin",
    metadata: {
      id,
      version: "0.1.0",
      description: `Pure ${step} adapter for graph-aware chain replay.`,
    },
    implements: [
      {
        module: {
          id: "trace-chain",
          version: "0.1.0",
        },
        operations: [
          {
            id: "build",
            step,
            execution: "pure",
            configSchema: {
              type: "object",
              additionalProperties: false,
            },
            capabilities: [],
          },
        ],
      },
    ],
  };
}

const chainPlugins = [
  chainPlugin("trace-draft-plugin", "draft"),
  chainPlugin("trace-finalize-plugin", "finalize"),
];

function createArtifactStore() {
  const bytesById = new Map();

  function add(artifactId, schema, value) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    const ref = {
      artifactId,
      schema,
      mediaType: JSON_MEDIA_TYPE,
      digest: sha256Digest(bytes),
      uri: `artifact://trace-tests/${artifactId}`,
    };
    bytesById.set(artifactId, bytes);
    return ref;
  }

  return {
    add,
    replaceBytes(artifactId, bytes) {
      bytesById.set(artifactId, Buffer.from(bytes));
    },
    artifacts: {
      async load(ref) {
        const bytes = bytesById.get(ref.artifactId);
        if (bytes === undefined) {
          throw new Error(`missing artifact ${ref.artifactId}`);
        }
        return Buffer.from(bytes);
      },
    },
  };
}

function addFixtureArtifacts(store, prefix = "fixture") {
  return {
    source: store.add(`${prefix}-source`, SOURCE_SCHEMA, {
      kind: "Source",
      text: "source",
    }),
    draft: store.add(`${prefix}-draft`, DRAFT_SCHEMA, {
      kind: "Draft",
      text: "draft",
    }),
    product: store.add(`${prefix}-product`, PRODUCT_SCHEMA, {
      kind: "Product",
      text: "product",
    }),
  };
}

const artifactContracts = [
  [SOURCE_SCHEMA, "Source"],
  [DRAFT_SCHEMA, "Draft"],
  [PRODUCT_SCHEMA, "Product"],
].map(([schema, kind]) => ({
  schema,
  validate(value) {
    assert.equal(value.kind, kind);
  },
}));

function moduleResult(invocationId, product) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId,
    status: "completed",
    outcome: "built",
    outputs: {
      product: [product],
    },
    evidence: [],
    diagnostics: [],
  };
}

function singleInvocation(artifacts, invocationId = "trace-invocation-1") {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId,
    runId: "trace-run-1",
    nodeId: "trace-test-node",
    module: {
      id: "trace-test",
      version: "0.1.0",
      operation: "build",
    },
    plugin: {
      id: "trace-test-plugin",
      version: "0.1.0",
    },
    inputs: {
      source: [artifacts.source],
    },
    options: {},
    config: {},
    grants: [],
  };
}

function chainInvocation(artifacts, invocationId = "trace-chain-invocation-1") {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId,
    runId: "trace-chain-run-1",
    nodeId: "trace-chain-node",
    module: {
      id: "trace-chain",
      version: "0.1.0",
      operation: "build",
    },
    adapters: [
      {
        step: "draft",
        plugin: {
          id: "trace-draft-plugin",
          version: "0.1.0",
        },
        config: {},
        grants: [],
      },
      {
        step: "finalize",
        plugin: {
          id: "trace-finalize-plugin",
          version: "0.1.0",
        },
        config: {},
        grants: [],
      },
    ],
    inputs: {
      source: [artifacts.source],
    },
    options: {},
  };
}

function continueResult(stepInvocation, draft) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: clone(stepInvocation.plugin),
    disposition: "continue",
    outputs: {
      draft: [draft],
    },
    evidence: [],
    diagnostics: [],
  };
}

function terminalResult(stepInvocation, product) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepResult",
    invocationId: stepInvocation.invocationId,
    invocationFingerprint: stepInvocation.invocationFingerprint,
    chainFingerprint: stepInvocation.chainFingerprint,
    stepInvocationDigest: stepInvocation.stepInvocationDigest,
    step: stepInvocation.step,
    plugin: clone(stepInvocation.plugin),
    disposition: "terminal",
    moduleResult: moduleResult(stepInvocation.invocationId, product),
  };
}

function createContributor(moduleId, projectCalls) {
  return {
    metadata: {
      id: `devrelay.traceability/test-${moduleId}`,
      version: "1.0.0",
    },
    match: {
      moduleId,
      moduleVersion: "0.1.0",
      operation: "build",
      outcomes: ["built"],
    },
    scope: `test/${moduleId}`,
    authority: "candidate",
    ownership: {
      scope: `test/${moduleId}`,
      authority: "candidate",
      nodeKinds: ["project"],
      edgeKinds: [],
    },
    async project(context) {
      projectCalls.push({
        invocationId: context.invocation.invocationId,
        outputDigest: context.loadedOutputs.product[0].ref.digest,
      });
      const loaded = context.loadedOutputs.product[0];
      return {
        horizon: "requirements",
        nodes: [
          {
            kind: "project",
            stableId: context.projectId,
            label: `Project ${context.projectId}`,
            attributes: {
              outputDigest: loaded.ref.digest,
            },
            sourceLocators: [
              {
                artifact: {
                  artifactId: loaded.ref.artifactId,
                  digest: loaded.ref.digest,
                },
                jsonPointer: "",
                entityDigest: canonicalJsonDigest(loaded.value),
              },
            ],
          },
        ],
        edges: [],
      };
    },
  };
}

function createTraceCheckpointStore(events, { divergentCheckpoint = false } = {}) {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        events.push({ type: "trace-get", key });
        const value = values.get(key);
        return value === undefined ? undefined : clone(value);
      },
      async putIfAbsent(key, value) {
        events.push({ type: "trace-put", key, kind: value.kind });
        if (!values.has(key)) {
          let winner = clone(value);
          if (
            divergentCheckpoint &&
            value.kind === "ModuleTraceabilityCheckpoint"
          ) {
            winner = {
              ...winner,
              invocationId: `${winner.invocationId}-racing-writer`,
            };
          }
          values.set(key, winner);
        }
        return clone(values.get(key));
      },
    },
  };
}

function findStored(store, kind) {
  return [...store.values.entries()].find(([, value]) => value.kind === kind);
}

function instrumentGraph(service, events, controls = {}) {
  let mergeFailures = controls.mergeFailures ?? 0;
  let assertionFailures = controls.assertionFailures ?? 0;
  return Object.freeze({
    graphId: service.graphId,
    projectId: service.projectId,
    captureBase() {
      events.push({ type: "graph-capture" });
      return service.captureBase();
    },
    async prepare(request) {
      events.push({ type: "graph-prepare" });
      return service.prepare(request);
    },
    async validatePrepared(request) {
      events.push({ type: "graph-validate" });
      return service.validatePrepared(request);
    },
    async mergePrepared(prepared) {
      events.push({
        type: "graph-merge",
        updateRef: clone(prepared.updateRef),
      });
      if (mergeFailures > 0) {
        mergeFailures -= 1;
        throw new Error("forced graph merge outage");
      }
      return service.mergePrepared(prepared);
    },
    async assertApplied(updateRef) {
      events.push({
        type: "graph-assert",
        updateRef: clone(updateRef),
      });
      if (assertionFailures > 0) {
        assertionFailures -= 1;
        throw new Error("forced application-proof outage");
      }
      return service.assertApplied(updateRef);
    },
  });
}

function graphRuntime(moduleId, events, controls = {}) {
  const projectCalls = [];
  const service = createTraceabilityGraphService({
    graphId: `graph-${moduleId}`,
    projectId: `project-${moduleId}`,
    store: createInMemoryTraceabilityStore(),
    contributors: [createContributor(moduleId, projectCalls)],
  });
  const traceStore = createTraceCheckpointStore(events, controls);
  return {
    graph: instrumentGraph(service, events, controls),
    service,
    projectCalls,
    traceStore,
  };
}

function singleHarness(controls = {}) {
  const events = [];
  const calls = [];
  const adapterContexts = [];
  const producerArguments = [];
  const artifactStore = createArtifactStore();
  const artifacts = addFixtureArtifacts(artifactStore, "single");
  const graph = graphRuntime("trace-test", events, controls);
  const configuredSources = {
    graph: { ...graph.graph },
    checkpoints: { ...graph.traceStore.store },
  };
  const registry = createModuleRegistry({
    modules: [singleModule],
    plugins: [
      {
        definition: singlePlugin,
        adapter: {
          async invoke(invocation, adapterContext, producer) {
            calls.push(invocation.invocationId);
            adapterContexts.push(adapterContext);
            producerArguments.push(producer);
            assert.equal("traceabilityGraph" in adapterContext, false);
            assert.equal("traceabilityCheckpoints" in adapterContext, false);
            return moduleResult(invocation.invocationId, artifacts.product);
          },
        },
      },
    ],
    artifactContracts,
    ...(controls.configureRegistry
      ? {
          traceability: configuredSources,
        }
      : {}),
  });
  const invocation = singleInvocation(artifacts);
  const ordinaryContext = {
    artifacts: artifactStore.artifacts,
    async createAdapterContext(descriptor) {
      assert.equal("traceabilityGraph" in descriptor, false);
      assert.equal("traceabilityCheckpoints" in descriptor, false);
      return {
        purpose: "adapter-data-only",
      };
    },
  };
  const context = {
    ...ordinaryContext,
    traceabilityGraph: graph.graph,
    traceabilityCheckpoints: graph.traceStore.store,
  };
  return {
    events,
    calls,
    adapterContexts,
    producerArguments,
    artifactStore,
    artifacts,
    graph,
    registry,
    invocation,
    context,
    ordinaryContext,
    configuredSources,
  };
}

function chainHarness(controls = {}) {
  const events = [];
  const calls = [];
  const adapterContexts = [];
  const artifactStore = createArtifactStore();
  const artifacts = addFixtureArtifacts(artifactStore, "chain");
  const graph = graphRuntime("trace-chain", events, controls);
  const adapters = {
    "trace-draft-plugin": {
      async invoke(stepInvocation, adapterContext) {
        calls.push("draft");
        adapterContexts.push(adapterContext);
        assert.equal("traceabilityGraph" in adapterContext, false);
        return continueResult(stepInvocation, artifacts.draft);
      },
    },
    "trace-finalize-plugin": {
      async invoke(stepInvocation, adapterContext) {
        calls.push("finalize");
        adapterContexts.push(adapterContext);
        assert.equal("traceabilityGraph" in adapterContext, false);
        return terminalResult(stepInvocation, artifacts.product);
      },
    },
  };
  const registry = createModuleRegistry({
    modules: [chainModule],
    plugins: chainPlugins.map((definition) => ({
      definition,
      adapter: adapters[definition.metadata.id],
    })),
    artifactContracts,
  });
  return {
    events,
    calls,
    adapterContexts,
    artifactStore,
    artifacts,
    graph,
    registry,
    invocation: chainInvocation(artifacts),
    context: {
      artifacts: artifactStore.artifacts,
      traceabilityGraph: graph.graph,
      traceabilityCheckpoints: graph.traceStore.store,
    },
  };
}

function eventIndex(events, type, kind) {
  return events.findIndex(
    (event) => event.type === type && (kind === undefined || event.kind === kind),
  );
}

async function expectContractError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("configured execute makes traceability mandatory and the explicit seam is consistent", async () => {
  const harness = singleHarness({ configureRegistry: true });

  const record = await harness.registry.execute(
    harness.invocation,
    harness.ordinaryContext,
  );

  assert.equal(record.kind, "ModuleExecutionRecord");
  assert.equal(record.moduleResult.outcome, "built");
  assert.deepEqual(record.traceCheckpoint.moduleResult, record.moduleResult);
  assert.deepEqual(
    record.traceCheckpoint.preparedCheckpoint.update,
    record.traceabilityUpdate,
  );
  assert.equal(harness.calls.length, 1);
  assert.ok(
    eventIndex(
      harness.events,
      "trace-put",
      "ModuleTraceabilityCheckpoint",
    ) < eventIndex(harness.events, "graph-merge"),
  );

  const explicit = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.ordinaryContext,
  );
  assert.deepEqual(explicit, record);
  assert.equal(harness.calls.length, 1);
});

test("configured traceability is snapshotted and context cannot replace or disable it", async () => {
  const harness = singleHarness({ configureRegistry: true });
  harness.configuredSources.graph.graphId = "tampered-graph";
  harness.configuredSources.graph.captureBase = () => {
    throw new Error("mutated graph method was used");
  };
  harness.configuredSources.checkpoints.get = () => {
    throw new Error("mutated checkpoint method was used");
  };

  const record = await harness.registry.execute(
    harness.invocation,
    harness.ordinaryContext,
  );
  assert.equal(record.graphId, harness.graph.graph.graphId);

  const replacement = {
    ...harness.ordinaryContext,
    traceabilityGraph: undefined,
  };
  await expectContractError(
    harness.registry.execute(harness.invocation, replacement),
    "DR2505",
  );
  await expectContractError(
    harness.registry.executeWithTraceability(harness.invocation, {
      ...harness.ordinaryContext,
      traceabilityCheckpoints: harness.graph.traceStore.store,
    }),
    "DR2505",
  );
  assert.equal(harness.calls.length, 1);
});

test("graph-aware execution checkpoints the exact prepared update before merge", async () => {
  const harness = singleHarness();

  const record = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.context,
  );

  assert.equal(record.kind, "ModuleExecutionRecord");
  assert.equal(record.moduleResult.outcome, "built");
  assert.equal(record.graphId, harness.graph.graph.graphId);
  assert.equal(record.projectId, harness.graph.graph.projectId);
  assert.equal(record.mergeReceipt.disposition, "merged");
  assert.equal(record.mergeReceipt.snapshot.nodes.length, 1);
  assert.equal(record.traceabilityUpdate.nodeChanges.length, 1);
  assert.equal(record.traceabilityUpdate.sourceArtifacts.length, 2);
  assert.deepEqual(record.traceCheckpoint.moduleResult, record.moduleResult);
  assert.deepEqual(
    record.traceCheckpoint.preparedCheckpoint.updateRef,
    record.traceabilityUpdateRef,
  );
  assert.equal(validateModuleExecutionRecord(record), record);
  assert.equal(Object.isFrozen(record), true);
  assert.deepEqual(harness.calls, [harness.invocation.invocationId]);
  assert.deepEqual(harness.adapterContexts, [
    {
      purpose: "adapter-data-only",
    },
  ]);
  assert.deepEqual(harness.producerArguments, [undefined]);

  const checkpointPut = eventIndex(
    harness.events,
    "trace-put",
    "ModuleTraceabilityCheckpoint",
  );
  const merge = eventIndex(harness.events, "graph-merge");
  const proof = eventIndex(harness.events, "graph-assert");
  const recordPut = eventIndex(
    harness.events,
    "trace-put",
    "ModuleExecutionRecord",
  );
  assert.ok(checkpointPut >= 0);
  assert.ok(checkpointPut < merge, "trace checkpoint must precede graph merge");
  assert.ok(merge < proof, "merge must precede exact application proof");
  assert.ok(proof < recordPut, "application proof must precede progress record");

  const [, checkpoint] = findStored(
    harness.graph.traceStore,
    "ModuleTraceabilityCheckpoint",
  );
  assert.deepEqual(checkpoint.moduleResult, record.moduleResult);
  assert.deepEqual(
    checkpoint.preparedCheckpoint.updateRef,
    record.traceabilityUpdateRef,
  );
  assert.equal(
    checkpoint.preparedCheckpointDigest,
    canonicalJsonDigest(checkpoint.preparedCheckpoint),
  );
});

test("retry after merge failure reuses the exact trace checkpoint without invoking the adapter", async () => {
  const harness = singleHarness({ mergeFailures: 1 });

  await assert.rejects(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    /forced graph merge outage/,
  );
  assert.equal(harness.calls.length, 1);
  assert.equal(
    findStored(harness.graph.traceStore, "ModuleExecutionRecord"),
    undefined,
  );
  const [, firstCheckpoint] = findStored(
    harness.graph.traceStore,
    "ModuleTraceabilityCheckpoint",
  );
  const exactCheckpoint = clone(firstCheckpoint);

  const record = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.context,
  );

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(
    findStored(harness.graph.traceStore, "ModuleTraceabilityCheckpoint")[1],
    exactCheckpoint,
  );
  assert.deepEqual(record.traceabilityUpdateRef, exactCheckpoint.updateRef);
  const mergeEvents = harness.events.filter(({ type }) => type === "graph-merge");
  assert.equal(mergeEvents.length, 2);
  assert.deepEqual(mergeEvents[0].updateRef, mergeEvents[1].updateRef);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-capture").length,
    1,
  );

  const replayed = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.context,
  );
  assert.deepEqual(replayed, record);
  assert.equal(harness.calls.length, 1);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-merge").length,
    2,
    "a committed execution record must not merge again",
  );
});

test("a corrupted trace checkpoint fails closed before adapter or graph merge replay", async () => {
  const harness = singleHarness({ mergeFailures: 1 });

  await assert.rejects(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    /forced graph merge outage/,
  );
  const [, checkpoint] = findStored(
    harness.graph.traceStore,
    "ModuleTraceabilityCheckpoint",
  );
  checkpoint.moduleResult.outcome = "corrupted";
  const mergeCount = harness.events.filter(({ type }) => type === "graph-merge").length;

  await expectContractError(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    "DR2502",
  );
  assert.equal(harness.calls.length, 1);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-merge").length,
    mergeCount,
  );
});

test("retry revalidates exact artifact bytes before accepting a checkpointed update", async () => {
  const harness = singleHarness({ mergeFailures: 1 });

  await assert.rejects(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    /forced graph merge outage/,
  );
  harness.artifactStore.replaceBytes(
    harness.artifacts.product.artifactId,
    Buffer.from('{"kind":"Product","text":"tampered"}\n', "utf8"),
  );
  const mergeCount = harness.events.filter(({ type }) => type === "graph-merge").length;

  await expectContractError(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    "DR2103",
  );
  assert.equal(harness.calls.length, 1);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-merge").length,
    mergeCount,
  );
});

test("a divergent atomic trace-checkpoint winner prevents merge progression", async () => {
  const harness = singleHarness({ divergentCheckpoint: true });

  await expectContractError(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    "DR2502",
  );

  assert.equal(harness.calls.length, 1);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-merge").length,
    0,
  );
  assert.equal(
    findStored(harness.graph.traceStore, "ModuleExecutionRecord"),
    undefined,
  );
});

test("no progress record is returned without exact application proof and merge replay is idempotent", async () => {
  const harness = singleHarness({ assertionFailures: 1 });

  await assert.rejects(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    /forced application-proof outage/,
  );
  assert.equal(harness.calls.length, 1);
  assert.equal(
    findStored(harness.graph.traceStore, "ModuleExecutionRecord"),
    undefined,
  );
  assert.equal(harness.graph.service.captureBase().revision, 1);

  const record = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.context,
  );

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.graph.service.captureBase().revision, 1);
  assert.equal(record.mergeReceipt.snapshot.revision, 1);
  assert.deepEqual(
    record.applicationProof.resultGraphRef,
    record.mergeReceipt.snapshotRef,
  );
  const merges = harness.events.filter(({ type }) => type === "graph-merge");
  assert.equal(merges.length, 2);
  assert.deepEqual(merges[0].updateRef, merges[1].updateRef);
});

test("pure adapter chains replay their exact handoffs without ordinary checkpoints", async () => {
  const harness = chainHarness({ mergeFailures: 1 });

  await assert.rejects(
    harness.registry.executeWithTraceability(harness.invocation, harness.context),
    /forced graph merge outage/,
  );
  assert.deepEqual(harness.calls, ["draft", "finalize"]);
  const [, checkpoint] = findStored(
    harness.graph.traceStore,
    "ModuleTraceabilityCheckpoint",
  );
  assert.equal(checkpoint.executionContext.priorResults.length, 1);
  assert.equal(checkpoint.executionContext.priorResults[0].step, "draft");

  const record = await harness.registry.executeWithTraceability(
    harness.invocation,
    harness.context,
  );

  assert.equal(record.kind, "ModuleExecutionRecord");
  assert.deepEqual(harness.calls, ["draft", "finalize"]);
  assert.equal(record.module.id, "trace-chain");
  assert.equal(record.mergeReceipt.snapshot.nodes.length, 1);
  assert.equal(
    harness.events.filter(({ type }) => type === "graph-capture").length,
    1,
  );
});

test("legacy execute keeps its plain ModuleResult semantics and never touches graph state", async () => {
  const harness = singleHarness();

  const result = await harness.registry.execute(
    harness.invocation,
    harness.context,
  );

  assert.equal(result.kind, "ModuleResult");
  assert.equal(result.outcome, "built");
  assert.equal("traceabilityUpdate" in result, false);
  assert.equal("mergeReceipt" in result, false);
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.producerArguments, [undefined]);
  assert.equal(harness.events.length, 0);
  assert.equal(harness.graph.traceStore.values.size, 0);
  assert.equal(harness.graph.service.captureBase().revision, 0);
});
