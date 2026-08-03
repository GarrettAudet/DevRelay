import assert from "node:assert/strict";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import {
  ContractError,
  createModuleRegistry,
} from "../src/module-registry.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

const STATE_SCHEMA = "https://devrelay.dev/artifacts/input-guard-test-state/v1";
const JSON_MEDIA_TYPE = "application/json";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function statePort() {
  return {
    name: "state",
    schema: STATE_SCHEMA,
    mediaTypes: [JSON_MEDIA_TYPE],
    cardinality: "one",
    required: true,
  };
}

function resultContract(status, diagnosticsRequired) {
  return {
    status,
    requiredInputs: ["state"],
    forbiddenInputs: [],
    requiredOutputs: [],
    allowedOutputs: [],
    requiredEvidence: [],
    diagnosticsRequired,
  };
}

const guardedModule = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleDefinition",
  metadata: {
    id: "input-guard-test",
    version: "0.1.0",
    description: "Exercises a generic registered input guard.",
  },
  operations: [
    {
      id: "plan",
      description: "Returns a terminal control result or enters the adapter.",
      inputs: [statePort()],
      outputs: [],
      inputRules: [],
      outcomes: [
        "baseline_drift",
        "unable_to_proceed",
        "execution_failed",
      ],
      resultContracts: {
        baseline_drift: resultContract("completed", true),
        unable_to_proceed: resultContract("completed", true),
        execution_failed: resultContract("failed", true),
      },
      evidence: [],
      optionsSchema: {
        type: "object",
        additionalProperties: false,
      },
    },
  ],
};

const guardedPlugin = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModulePlugin",
  metadata: {
    id: "input-guard-test-plugin",
    version: "0.1.0",
    description: "A pure adapter that must remain behind the input guard.",
  },
  implements: [
    {
      module: {
        id: "input-guard-test",
        version: "0.1.0",
      },
      operations: [
        {
          id: "plan",
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

function diagnostic(code, message) {
  return {
    severity: "error",
    code,
    message,
  };
}

function moduleResult(invocationId, outcome) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId,
    status: outcome === "execution_failed" ? "failed" : "completed",
    outcome,
    outputs: {},
    evidence: [],
    diagnostics: [
      diagnostic(
        outcome.toUpperCase(),
        outcome === "baseline_drift"
          ? "The approved baseline no longer matches the supplied state."
          : "The adapter could not proceed.",
      ),
    ],
  };
}

function createArtifactStore(value = { kind: "State", drift: true }) {
  const bytes = Buffer.from(JSON.stringify(value) + "\n", "utf8");
  const ref = {
    artifactId: "input-guard-state",
    schema: STATE_SCHEMA,
    mediaType: JSON_MEDIA_TYPE,
    digest: sha256Digest(bytes),
    uri: "artifact://input-guard-tests/state",
  };
  return {
    ref,
    artifacts: {
      async load(candidate) {
        assert.deepEqual(candidate, ref);
        return Buffer.from(bytes);
      },
    },
  };
}

function invocation(ref) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: "input-guard-invocation",
    runId: "input-guard-run",
    nodeId: "input-guard-node",
    module: {
      id: "input-guard-test",
      version: "0.1.0",
      operation: "plan",
    },
    plugin: {
      id: "input-guard-test-plugin",
      version: "0.1.0",
    },
    inputs: {
      state: [ref],
    },
    options: {},
    config: {},
    grants: [],
  };
}

function createCheckpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return clone(values.get(key));
      },
      async put(key, value) {
        values.set(key, clone(value));
      },
    },
  };
}

function createTraceabilityCheckpointStore() {
  const values = new Map();
  return {
    values,
    store: {
      async get(key) {
        return clone(values.get(key));
      },
      async putIfAbsent(key, value) {
        if (!values.has(key)) {
          values.set(key, clone(value));
        }
        return clone(values.get(key));
      },
    },
  };
}

function harness({
  guarded = true,
  guardOutcomes = ["baseline_drift"],
  evaluate,
  adapterOutcome = "unable_to_proceed",
} = {}) {
  const artifactStore = createArtifactStore();
  const adapterCalls = [];
  const adapterContexts = [];
  const suppliedGuard = guarded
    ? {
        id: "state-lineage-guard",
        version: "0.1.0",
        outcomes: guardOutcomes,
        async evaluate(context) {
          return evaluate(context);
        },
      }
    : undefined;
  const artifactContract = {
    schema: STATE_SCHEMA,
    validate(value) {
      assert.equal(value.kind, "State");
    },
    ...(suppliedGuard === undefined ? {} : { inputGuard: suppliedGuard }),
  };
  const registry = createModuleRegistry({
    modules: [guardedModule],
    plugins: [
      {
        definition: guardedPlugin,
        adapter: {
          async invoke(activeInvocation, adapterContext) {
            adapterCalls.push(activeInvocation.invocationId);
            adapterContexts.push(adapterContext);
            return moduleResult(
              activeInvocation.invocationId,
              adapterOutcome,
            );
          },
        },
      },
    ],
    artifactContracts: [artifactContract],
  });
  return {
    registry,
    invocation: invocation(artifactStore.ref),
    artifacts: artifactStore.artifacts,
    adapterCalls,
    adapterContexts,
    suppliedGuard,
  };
}

async function expectContractError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("terminal input guard checkpoints baseline drift and never enters the adapter", async () => {
  let guardCalls = 0;
  let immutableRequest = false;
  const active = harness({
    evaluate(context) {
      guardCalls += 1;
      immutableRequest =
        Object.isFrozen(context) &&
        Object.isFrozen(context.invocation) &&
        Object.isFrozen(context.operation) &&
        Object.isFrozen(context.loadedInputs) &&
        Object.isFrozen(context.loadedInputs.state) &&
        Object.isFrozen(context.loadedInputs.state[0]) &&
        Object.isFrozen(context.loadedInputs.state[0].value);
      return moduleResult(context.invocation.invocationId, "baseline_drift");
    },
  });
  const checkpoints = createCheckpointStore();
  let contextCreations = 0;
  const context = {
    artifacts: active.artifacts,
    checkpoints: checkpoints.store,
    async createAdapterContext() {
      contextCreations += 1;
      return {};
    },
  };

  const first = await active.registry.execute(active.invocation, context);
  const replay = await active.registry.execute(active.invocation, context);

  assert.deepEqual(replay, first);
  assert.equal(first.outcome, "baseline_drift");
  assert.equal(active.adapterCalls.length, 0);
  assert.equal(contextCreations, 0);
  assert.equal(guardCalls, 2);
  assert.equal(immutableRequest, true);
  assert.equal(checkpoints.values.size, 1);

  const checkpoint = checkpoints.values.values().next().value;
  assert.equal(checkpoint.kind, "ModuleInputGuardCheckpoint");
  assert.equal(checkpoint.producer.kind, "input-guard");
  assert.equal("plugin" in checkpoint.producer, false);
  assert.deepEqual(checkpoint.guard, {
    id: "state-lineage-guard",
    version: "0.1.0",
  });
  assert.deepEqual(checkpoint.moduleResult, first);
});

test("guard replay fails closed when trusted evaluation diverges", async () => {
  let drifted = true;
  const active = harness({
    evaluate(context) {
      return drifted
        ? moduleResult(context.invocation.invocationId, "baseline_drift")
        : undefined;
    },
  });
  const checkpoints = createCheckpointStore();
  const context = {
    artifacts: active.artifacts,
    checkpoints: checkpoints.store,
  };

  await active.registry.execute(active.invocation, context);
  drifted = false;

  await expectContractError(
    active.registry.execute(active.invocation, context),
    "DR2404",
  );
  assert.equal(active.adapterCalls.length, 0);
});

test("tampered guard checkpoint is rejected before adapter entry", async () => {
  const active = harness({
    evaluate(context) {
      return moduleResult(context.invocation.invocationId, "baseline_drift");
    },
  });
  const checkpoints = createCheckpointStore();
  const context = {
    artifacts: active.artifacts,
    checkpoints: checkpoints.store,
  };

  await active.registry.execute(active.invocation, context);
  const key = checkpoints.values.keys().next().value;
  const tampered = clone(checkpoints.values.get(key));
  tampered.producer.guard.version = "9.9.9";
  checkpoints.values.set(key, tampered);

  await expectContractError(
    active.registry.execute(active.invocation, context),
    "DR2404",
  );
  assert.equal(active.adapterCalls.length, 0);
});

test("guard terminal outcome must be declared by both guard and operation", async () => {
  const active = harness({
    guardOutcomes: ["baseline_drift"],
    evaluate(context) {
      return moduleResult(context.invocation.invocationId, "unable_to_proceed");
    },
  });
  const checkpoints = createCheckpointStore();

  await expectContractError(
    active.registry.execute(active.invocation, {
      artifacts: active.artifacts,
      checkpoints: checkpoints.store,
    }),
    "DR2403",
  );
  assert.equal(active.adapterCalls.length, 0);
  assert.equal(checkpoints.values.size, 0);
});

test("an actually loaded guarded input requires a checkpoint store", async () => {
  let guardCalls = 0;
  const active = harness({
    evaluate() {
      guardCalls += 1;
      return undefined;
    },
  });

  await expectContractError(
    active.registry.execute(active.invocation, {
      artifacts: active.artifacts,
    }),
    "DR2200",
  );
  assert.equal(guardCalls, 0);
  assert.equal(active.adapterCalls.length, 0);
});

test("legacy unguarded pure execution remains checkpoint-free", async () => {
  const active = harness({
    guarded: false,
    evaluate() {
      throw new Error("unguarded execution must not evaluate a guard");
    },
  });

  const result = await active.registry.execute(active.invocation, {
    artifacts: active.artifacts,
    async createAdapterContext(descriptor) {
      assert.deepEqual(descriptor.plugin, active.invocation.plugin);
      return { legacy: true };
    },
  });

  assert.deepEqual(
    result,
    moduleResult(active.invocation.invocationId, "unable_to_proceed"),
  );
  assert.equal(active.adapterCalls.length, 1);
  assert.deepEqual(active.adapterContexts, [{ legacy: true }]);
});

test("adapter results cannot claim an outcome owned by the active input guard", async () => {
  const active = harness({
    evaluate() {
      return undefined;
    },
    adapterOutcome: "baseline_drift",
  });
  const checkpoints = createCheckpointStore();

  await expectContractError(
    active.registry.execute(active.invocation, {
      artifacts: active.artifacts,
      checkpoints: checkpoints.store,
    }),
    "DR2405",
  );
  assert.equal(active.adapterCalls.length, 1);
});

test("graph-aware guard replay records and reuses an empty control update", async () => {
  let guardCalls = 0;
  const active = harness({
    evaluate(context) {
      guardCalls += 1;
      return moduleResult(context.invocation.invocationId, "baseline_drift");
    },
  });
  const checkpoints = createCheckpointStore();
  const traceabilityCheckpoints = createTraceabilityCheckpointStore();
  const graph = createTraceabilityGraphService({
    graphId: "graph-input-guard",
    projectId: "project-input-guard",
    store: createInMemoryTraceabilityStore(),
    contributors: [],
  });
  const context = {
    artifacts: active.artifacts,
    checkpoints: checkpoints.store,
    traceabilityGraph: graph,
    traceabilityCheckpoints: traceabilityCheckpoints.store,
  };

  const first = await active.registry.executeWithTraceability(
    active.invocation,
    context,
  );
  const replay = await active.registry.executeWithTraceability(
    active.invocation,
    context,
  );

  assert.equal(validateModuleExecutionRecord(first), first);
  assert.deepEqual(replay, first);
  assert.equal(first.kind, "ModuleExecutionRecord");
  assert.equal(first.moduleResult.outcome, "baseline_drift");
  assert.deepEqual(first.traceabilityUpdate.nodeChanges, []);
  assert.deepEqual(first.traceabilityUpdate.edgeChanges, []);
  assert.equal(first.traceabilityUpdate.scopes.length, 1);
  assert.equal(first.traceabilityUpdate.scopes[0].scope, "core/non-contributing");
  assert.equal(active.adapterCalls.length, 0);
  assert.equal(guardCalls, 3);
  assert.equal(checkpoints.values.size, 1);
});
