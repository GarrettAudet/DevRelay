import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { ContractError, createModuleRegistry } from "../src/module-registry.mjs";
import {
  MODULE_ROUTE_DECISION_SCHEMA,
  assertInvocationMatchesRoute,
} from "../src/operation-router.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const [workBreakdownModule, specKitTasks, openSpecTasks] = await Promise.all([
  readJson("examples/modules/work-breakdown.module.json"),
  readJson("examples/plugins/spec-kit-tasks.plugin.json"),
  readJson("examples/plugins/openspec-tasks.plugin.json"),
]);

const STATE_SCHEMA =
  "https://devrelay.dev/artifacts/project-work-breakdown-state/v1";
const REPOSITORY_SCHEMA =
  "https://devrelay.dev/artifacts/repository-snapshot/v1";
const NOT_APPLICABLE_SCHEMA =
  "https://devrelay.dev/artifacts/approved-not-applicable/v1";
const OUTCOMES = [
  "decomposed",
  "needs_clarification",
  "baseline_drift",
  "unable_to_proceed",
  "execution_failed",
];
const COMMON_INPUTS = [
  "project-work-breakdown-state",
  "routing-decision",
  "requirements-baseline",
  "project-overview-baseline",
  "architecture-baseline",
  "contract-disposition",
  "capability-catalog",
];
const CONTROL_INPUTS = [
  "clarification-request",
  "clarification-responses",
  "continuation",
  "revision-request",
];

const adapter = {
  async invoke() {
    throw new Error("not executed by module surface tests");
  },
};

function makeRegistry() {
  return createModuleRegistry({
    modules: [workBreakdownModule],
    plugins: [specKitTasks, openSpecTasks].map((definition) => ({
      definition,
      adapter,
    })),
    artifactContracts: [
      {
        schema: STATE_SCHEMA,
        validate(value) {
          if (!["unbaselined", "baselined"].includes(value?.state)) {
            throw new Error("invalid work-breakdown state");
          }
        },
      },
    ],
  });
}

function operation(id) {
  return workBreakdownModule.operations.find((candidate) => candidate.id === id);
}

function portByName(ports, name) {
  return ports.find((port) => port.name === name);
}

function artifactRef(name, schema, mediaType) {
  return {
    artifactId: `${name}-001`,
    schema,
    mediaType,
    digest: `sha256:${"a".repeat(64)}`,
    uri: `artifact://test/${name}-001`,
  };
}

function establishInvocation(repositorySchema, repositoryMediaType) {
  const inputs = Object.fromEntries(
    [
      [
        "project-work-breakdown-state",
        STATE_SCHEMA,
        "application/vnd.devrelay.project-work-breakdown-state+json",
      ],
      [
        "routing-decision",
        MODULE_ROUTE_DECISION_SCHEMA,
        "application/vnd.devrelay.module-route-decision+json",
      ],
      [
        "requirements-baseline",
        "https://devrelay.dev/artifacts/requirements-baseline/v1",
        "application/vnd.devrelay.requirements-baseline+json",
      ],
      [
        "project-overview-baseline",
        "https://devrelay.dev/artifacts/project-overview-baseline/v1",
        "application/vnd.devrelay.project-overview-baseline+json",
      ],
      [
        "architecture-baseline",
        "https://devrelay.dev/artifacts/architecture-baseline/v1",
        "application/vnd.devrelay.architecture-baseline+json",
      ],
      [
        "contract-disposition",
        "https://devrelay.dev/artifacts/contract-disposition/v1",
        "application/vnd.devrelay.contract-disposition+json",
      ],
      [
        "capability-catalog",
        "https://devrelay.dev/artifacts/capability-catalog/v1",
        "application/vnd.devrelay.capability-catalog+json",
      ],
      ["repository-context", repositorySchema, repositoryMediaType],
    ].map(([name, schema, mediaType]) => [
      name,
      [artifactRef(name, schema, mediaType)],
    ]),
  );

  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: "work-breakdown-establish-001",
    runId: "work-breakdown-run-001",
    nodeId: "work-breakdown",
    module: {
      id: "work-breakdown",
      version: "0.1.0",
      operation: "establish-breakdown",
    },
    plugin: {
      id: "spec-kit-tasks",
      version: "0.1.0",
    },
    inputs,
    options: {},
    config: {
      projectRoot: "/workspace",
      planningOutputRoot: "/workspace/.devrelay/planning",
      toolName: "GitHub Spec Kit",
      toolVersion: "pinned-by-lock-record",
      nativeOperation: "work.decompose",
      command: "/speckit.tasks",
      featureName: "work-breakdown",
      bridge: "agent-command",
    },
    grants: [
      { kind: "filesystem.read", scope: "/workspace" },
      {
        kind: "filesystem.write",
        scope: "/workspace/.devrelay/planning",
      },
      { kind: "network.connect", scope: "host:implementation-engine" },
    ],
  };
}

async function select(state) {
  const bytes = Buffer.from(`${JSON.stringify({ state })}\n`, "utf8");
  const ref = {
    artifactId: `project-work-breakdown-state-${state}`,
    schema: STATE_SCHEMA,
    mediaType: "application/vnd.devrelay.project-work-breakdown-state+json",
    digest: sha256Digest(bytes),
    uri: `artifact://test/project-work-breakdown-state-${state}`,
  };
  return makeRegistry().selectOperation(
    { id: "work-breakdown", version: "0.1.0" },
    ref,
    {
      artifacts: {
        async load() {
          return bytes;
        },
      },
    },
  );
}

test("WorkBreakdown is one provider-neutral Module with two state-routed operations", () => {
  assert.deepEqual(workBreakdownModule.metadata, {
    id: "work-breakdown",
    version: "0.1.0",
    description: workBreakdownModule.metadata.description,
  });
  assert.deepEqual(
    workBreakdownModule.operations.map(({ id }) => id),
    ["establish-breakdown", "decompose-change"],
  );
  assert.deepEqual(workBreakdownModule.routing, {
    stateSchema: STATE_SCHEMA,
    discriminator: "/state",
    rules: [
      {
        value: "unbaselined",
        operation: "establish-breakdown",
        reasonCode: "WORK_BREAKDOWN_BASELINE_ABSENT",
      },
      {
        value: "baselined",
        operation: "decompose-change",
        reasonCode: "WORK_BREAKDOWN_BASELINE_PRESENT",
      },
    ],
    stateInput: "project-work-breakdown-state",
    decisionInput: "routing-decision",
  });

  for (const item of workBreakdownModule.operations) {
    assert.equal("adapterChain" in item, false);
    assert.equal("execution" in item, false);
    assert.equal("configSchema" in item, false);
    assert.equal("capabilities" in item, false);
  }

  const registry = makeRegistry();
  assert.equal(registry.moduleCount, 1);
  assert.equal(registry.pluginCount, 2);
});

test("digest-verified state deterministically selects the WorkBreakdown operation", async () => {
  const establish = await select("unbaselined");
  const change = await select("baselined");
  assert.deepEqual(establish.selection, {
    kind: "operation",
    operation: "establish-breakdown",
  });
  assert.deepEqual(change.selection, {
    kind: "operation",
    operation: "decompose-change",
  });
  assert.equal(
    assertInvocationMatchesRoute(change, {
      module: {
        id: "work-breakdown",
        version: "0.1.0",
        operation: "decompose-change",
      },
    }).module.operation,
    "decompose-change",
  );
});

test("operations expose the exact common, operation-specific, and control inputs", () => {
  const establish = operation("establish-breakdown");
  const change = operation("decompose-change");
  assert.deepEqual(
    establish.inputs.map(({ name }) => name),
    [...COMMON_INPUTS, "repository-context", ...CONTROL_INPUTS],
  );
  assert.deepEqual(
    change.inputs.map(({ name }) => name),
    [
      ...COMMON_INPUTS,
      "current-work-breakdown-baseline",
      "approved-change-package",
      "current-repository-snapshot",
      ...CONTROL_INPUTS,
    ],
  );

  for (const item of [establish, change]) {
    for (const name of COMMON_INPUTS) {
      assert.equal(portByName(item.inputs, name).required, true, name);
    }
    for (const name of CONTROL_INPUTS) {
      assert.equal(portByName(item.inputs, name).required, false, name);
    }
    assert.deepEqual(item.inputRules, [
      {
        ifPresent: "clarification-request",
        require: ["clarification-responses", "continuation"],
      },
      {
        ifPresent: "clarification-responses",
        require: ["clarification-request", "continuation"],
      },
      {
        ifPresent: "continuation",
        require: ["clarification-request", "clarification-responses"],
      },
      {
        ifPresent: "revision-request",
        require: [],
        forbid: [
          "clarification-request",
          "clarification-responses",
          "continuation",
        ],
      },
    ]);
    assert.equal(item.inputs.some(({ name }) => name === "previous-draft"), false);
  }
});

test("repository-context is one required artifact from an exact provider-neutral schema union", () => {
  const port = portByName(operation("establish-breakdown").inputs, "repository-context");
  assert.deepEqual(port, {
    name: "repository-context",
    variants: [
      {
        schema: REPOSITORY_SCHEMA,
        mediaTypes: ["application/vnd.devrelay.repository-snapshot+json"],
      },
      {
        schema: NOT_APPLICABLE_SCHEMA,
        mediaTypes: ["application/vnd.devrelay.approved-not-applicable+json"],
      },
    ],
    cardinality: "one",
    required: true,
  });
  assert.equal("schema" in port, false);
  assert.equal("mediaTypes" in port, false);
});

test("direct invocation accepts either repository-context union member and rejects a third schema", () => {
  const registry = makeRegistry();
  for (const [schema, mediaType] of [
    [REPOSITORY_SCHEMA, "application/vnd.devrelay.repository-snapshot+json"],
    [
      NOT_APPLICABLE_SCHEMA,
      "application/vnd.devrelay.approved-not-applicable+json",
    ],
  ]) {
    assert.equal(
      registry.resolve(establishInvocation(schema, mediaType)).operationDefinition.id,
      "establish-breakdown",
    );
  }

  assert.throws(
    () =>
      registry.resolve(
        establishInvocation(
          "https://devrelay.dev/artifacts/repository-archive/v1",
          "application/vnd.devrelay.repository-snapshot+json",
        ),
      ),
    (error) => error instanceof ContractError && error.code === "DR1402",
  );

  assert.throws(
    () =>
      registry.resolve(
        establishInvocation(
          NOT_APPLICABLE_SCHEMA,
          "application/vnd.devrelay.repository-snapshot+json",
        ),
      ),
    (error) => error instanceof ContractError && error.code === "DR1403",
  );
});

test("revision control is mutually exclusive with the clarification triad", () => {
  const registry = makeRegistry();
  const active = establishInvocation(
    REPOSITORY_SCHEMA,
    "application/vnd.devrelay.repository-snapshot+json",
  );
  active.inputs["revision-request"] = [
    artifactRef(
      "revision-request",
      "https://devrelay.dev/artifacts/work-breakdown-revision-request/v1",
      "application/vnd.devrelay.work-breakdown-revision-request+json",
    ),
  ];
  assert.equal(registry.resolve(active).operationDefinition.id, "establish-breakdown");

  active.inputs["clarification-request"] = [
    artifactRef(
      "clarification-request",
      "https://devrelay.dev/artifacts/work-breakdown-clarification-request-set/v1",
      "application/vnd.devrelay.work-breakdown-clarification-request-set+json",
    ),
  ];
  active.inputs["clarification-responses"] = [
    artifactRef(
      "clarification-responses",
      "https://devrelay.dev/artifacts/work-breakdown-clarification-response-set/v1",
      "application/vnd.devrelay.work-breakdown-clarification-response-set+json",
    ),
  ];
  active.inputs.continuation = [
    artifactRef(
      "continuation",
      "https://devrelay.dev/artifacts/work-breakdown-continuation/v1",
      "application/vnd.devrelay.work-breakdown-continuation+json",
    ),
  ];
  assert.throws(
    () => registry.resolve(active),
    (error) => {
      assert.ok(error instanceof ContractError);
      assert.equal(error.code, "DR1407");
      return true;
    },
  );
});

test("success has one candidate output with contract-validation and source-closure evidence", () => {
  const expected = new Map([
    ["establish-breakdown", "work-breakdown-draft"],
    ["decompose-change", "work-breakdown-change-set-draft"],
  ]);
  for (const item of workBreakdownModule.operations) {
    assert.deepEqual(item.outcomes, OUTCOMES);
    const candidate = expected.get(item.id);
    assert.deepEqual(item.resultContracts.decomposed.requiredOutputs, [candidate]);
    assert.deepEqual(item.resultContracts.decomposed.allowedOutputs, [candidate]);
    assert.deepEqual(item.resultContracts.decomposed.requiredEvidence, [
      {
        kind: "work-breakdown/contract-validation",
        statuses: ["pass"],
        artifactOutput: candidate,
      },
      {
        kind: "work-breakdown/source-closure",
        statuses: ["pass"],
        artifactOutput: candidate,
      },
    ]);
    assert.deepEqual(item.evidence, [
      "work-breakdown/contract-validation",
      "work-breakdown/source-closure",
    ]);
  }
});

test("baseline_drift is a completed diagnostic-only terminal result", () => {
  for (const item of workBreakdownModule.operations) {
    assert.deepEqual(item.resultContracts.baseline_drift, {
      status: "completed",
      requiredInputs: [],
      forbiddenInputs: [],
      requiredOutputs: [],
      allowedOutputs: [],
      requiredEvidence: [],
      diagnosticsRequired: true,
    });
  }
});

test("native planner artifacts are subordinate, never another Module output", () => {
  for (const item of workBreakdownModule.operations) {
    const names = item.outputs.map(({ name }) => name);
    assert.equal(names.includes("native-artifact-bundle"), false);
    assert.equal(names.includes("native-source-bundle"), false);
    assert.equal(names.includes("diagnostics"), false);
  }
});
