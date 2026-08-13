import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { TRACEABILITY_VOCABULARY_V1_6 } from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

const loaded = (stableId, label = stableId) => {
  const value = { stableId, label };
  const bytes = Buffer.from(canonicalJson(value));
  return {
    value,
    bytes,
    ref: {
      artifactId: `SOURCE-${stableId}`,
      schema: "https://devrelay.dev/test/append-source/v1",
      mediaType: "application/json",
      digest: sha256Digest(bytes),
      uri: `memory://append/${stableId}`,
    },
  };
};

const contributor = {
  metadata: { id: "fixture.append-only", version: "1.0.0" },
  authority: "candidate",
  scope: "fixture/append-only",
  ownership: {
    authority: "candidate",
    scope: "fixture/append-only",
    nodeKinds: ["execution-attempt"],
    edgeKinds: [],
    retention: "append-only",
  },
  match: () => true,
  async project(context) {
    const source = context.loadedInputs.source[0];
    return {
      horizon: "implementation",
      nodes: [
        {
          kind: "execution-attempt",
          stableId: source.value.stableId,
          label: source.value.label,
          attributes: {},
          sourceLocators: [
            {
              artifact: {
                artifactId: source.ref.artifactId,
                digest: source.ref.digest,
              },
              jsonPointer: "",
              entityDigest: canonicalJsonDigest(source.value),
            },
          ],
        },
      ],
      edges: [],
    };
  },
};

test("append-only contributor scopes accumulate facts and reject identity replacement", async () => {
  const context = (source, invocationId) => ({
    invocation: {
      invocationId,
      module: { id: "fixture", version: "1.0.0", operation: "project" },
    },
    invocationFingerprint: canonicalJsonDigest({ invocationId }),
    moduleResult: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleResult",
      invocationId,
      status: "completed",
      outcome: "proposed",
      outputs: {},
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: { source: [source] },
  });
  const graph = createTraceabilityGraphService({
    graphId: "append-only",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [contributor],
    vocabulary: TRACEABILITY_VOCABULARY_V1_6,
  });
  const firstSource = loaded("ATT-001");
  const first = await graph.prepare({
    ...context(firstSource, "APPEND-001"),
    baseGraph: graph.captureBase(),
  });
  await graph.mergePrepared(first);
  const secondSource = loaded("ATT-002");
  const second = await graph.prepare({
    ...context(secondSource, "APPEND-002"),
    baseGraph: graph.captureBase(),
  });
  const merged = await graph.mergePrepared(second);
  assert.deepEqual(
    merged.snapshot.nodes
      .filter(({ kind, state }) => kind === "execution-attempt" && state === "active")
      .map(({ stableId }) => stableId)
      .sort(),
    ["ATT-001", "ATT-002"],
  );

  const substituted = loaded("ATT-001", "changed identity");
  await assert.rejects(
    graph.prepare({
      ...context(substituted, "APPEND-003"),
      baseGraph: graph.captureBase(),
    }),
    (error) => error?.code === "TG_APPEND_ONLY_CONFLICT",
  );
});
