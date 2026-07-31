import assert from "node:assert/strict";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import {
  MODULE_ROUTE_DECISION_MEDIA_TYPE,
  MODULE_ROUTE_DECISION_SCHEMA,
  RoutingError,
  assertInvocationMatchesRoute,
  selectModuleRoute,
  validateModuleRouting,
} from "../src/operation-router.mjs";

const stateSchema = "https://example.test/artifacts/project-state/v1";
const stateMediaType = "application/vnd.example.project-state+json";

function port(name, schema, mediaType) {
  return {
    name,
    schema,
    mediaTypes: [mediaType],
    cardinality: "one",
    required: true,
  };
}

function moduleDefinition() {
  const routingInputs = [
    port("project-state", stateSchema, stateMediaType),
    port(
      "route-decision",
      MODULE_ROUTE_DECISION_SCHEMA,
      MODULE_ROUTE_DECISION_MEDIA_TYPE,
    ),
  ];
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleDefinition",
    metadata: {
      id: "example-module",
      version: "0.1.0",
      description: "Routing fixture",
    },
    routing: {
      stateInput: "project-state",
      stateSchema,
      decisionInput: "route-decision",
      discriminator: "/state",
      rules: [
        {
          value: "new",
          reasonCode: "NEW_REQUIRES_ESTABLISH",
          operation: "establish",
        },
        {
          value: "known",
          reasonCode: "KNOWN_REQUIRES_CHANGE",
          operation: "change",
        },
        {
          value: "unknown",
          reasonCode: "UNKNOWN_REQUIRES_DISCOVERY",
          prerequisite: {
            module: {
              id: "example-discovery",
              version: "0.1.0",
            },
            operation: "discover",
            outputSchema: "https://example.test/artifacts/snapshot/v1",
          },
        },
      ],
    },
    operations: [
      {
        id: "establish",
        inputs: structuredClone(routingInputs),
      },
      {
        id: "change",
        inputs: structuredClone(routingInputs),
      },
    ],
  };
}

function stateInput(state) {
  const bytes = Buffer.from(`${JSON.stringify({ state }, null, 2)}\n`, "utf8");
  return {
    stateArtifactBytes: bytes,
    stateArtifactRef: {
      artifactId: `project-state-${state}`,
      schema: stateSchema,
      mediaType: stateMediaType,
      digest: sha256Digest(bytes),
      uri: `artifact://test/project-state-${state}`,
    },
    validateStateArtifact(value) {
      assert.equal(value.state, state);
    },
  };
}

function expectRoutingError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof RoutingError);
    assert.equal(error.code, code);
    return true;
  });
}

async function expectRoutingRejection(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof RoutingError);
    assert.equal(error.code, code);
    return true;
  });
}

test("digest-verified state selects an operation without model discretion", async () => {
  const decision = await selectModuleRoute(
    moduleDefinition(),
    stateInput("new"),
  );

  assert.equal(decision.kind, "ModuleRouteDecision");
  assert.deepEqual(decision.selection, {
    kind: "operation",
    operation: "establish",
  });
  assert.equal(decision.discriminator.value, "new");
  assert.equal(decision.reasonCode, "NEW_REQUIRES_ESTABLISH");
  assert.deepEqual(Object.keys(decision.state).sort(), [
    "artifactId",
    "digest",
    "schema",
  ]);
  assert.equal(Object.isFrozen(decision), true);
});

test("an unresolved current system selects a declared prerequisite", async () => {
  const decision = await selectModuleRoute(
    moduleDefinition(),
    stateInput("unknown"),
  );

  assert.deepEqual(decision.selection, {
    kind: "prerequisite",
    module: {
      id: "example-discovery",
      version: "0.1.0",
    },
    operation: "discover",
    outputSchema: "https://example.test/artifacts/snapshot/v1",
  });
});

test("routing rejects duplicate, missing, and undeclared selections", async () => {
  const duplicate = moduleDefinition();
  duplicate.routing.rules[1].value = "new";
  expectRoutingError(() => validateModuleRouting(duplicate), "DR2007");

  const unmatched = moduleDefinition();
  await expectRoutingRejection(
    selectModuleRoute(unmatched, stateInput("improvised")),
    "DR2015",
  );

  const undeclared = moduleDefinition();
  undeclared.routing.rules[0].operation = "invented";
  expectRoutingError(() => validateModuleRouting(undeclared), "DR2009");

  const missingDecisionPort = moduleDefinition();
  missingDecisionPort.operations[0].inputs.pop();
  expectRoutingError(
    () => validateModuleRouting(missingDecisionPort),
    "DR2018",
  );
});

test("routing verifies exact raw bytes before reading state", async () => {
  const input = stateInput("known");
  input.stateArtifactBytes = Buffer.from('{"state":"known"}\n', "utf8");
  await expectRoutingRejection(
    selectModuleRoute(moduleDefinition(), input),
    "DR2103",
  );
});

test("an invocation must match the exact deterministic route", async () => {
  const decision = await selectModuleRoute(
    moduleDefinition(),
    stateInput("known"),
  );
  const invocation = {
    module: {
      id: "example-module",
      version: "0.1.0",
      operation: "change",
    },
  };

  assert.equal(assertInvocationMatchesRoute(decision, invocation), invocation);

  const mismatch = structuredClone(invocation);
  mismatch.module.operation = "establish";
  expectRoutingError(
    () => assertInvocationMatchesRoute(decision, mismatch),
    "DR2017",
  );
});


test("routing accepts only raw bytes and decodes UTF-8 fatally", async () => {
  const stringInput = stateInput("new");
  stringInput.stateArtifactBytes = '{"state":"new"}';
  await expectRoutingRejection(
    selectModuleRoute(moduleDefinition(), stringInput),
    "DR2021",
  );

  const malformed = Buffer.from([0xc3, 0x28]);
  const malformedInput = stateInput("new");
  malformedInput.stateArtifactBytes = malformed;
  malformedInput.stateArtifactRef.digest = sha256Digest(malformed);
  await expectRoutingRejection(
    selectModuleRoute(moduleDefinition(), malformedInput),
    "DR2024",
  );
});
