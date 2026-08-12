import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../src/index.mjs";
import { createInMemoryTraceabilityStore } from "../../src/traceability-graph.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const outputRoot = resolve(
  root,
  "dogfood/chatgpt-desktop-runtime/execution/integration/_LIST-RUNS-BASELINE-REBASE",
);
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const canonicalBytes = (value) => Buffer.from(api.canonicalJson(value), "utf8");
const ref = (artifactId, digest, extras = {}) => ({ artifactId, digest, ...extras });
const write = (name, value) => {
  const path = resolve(outputRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, api.canonicalJson(value), "utf8");
};
const sourceLocator = (loaded, jsonPointer, entity) => ({
  artifact: {
    artifactId: loaded.ref.artifactId,
    digest: loaded.ref.digest,
  },
  jsonPointer,
  entityDigest: api.canonicalJsonDigest(entity),
});
const endpoint = ({ kind, stableId, authority, scope }) => ({
  kind,
  stableId,
  authority,
  scope,
});
const nodeKey = ({ kind, stableId, authority, scope }) =>
  [kind, stableId, authority, scope].join("\u0000");
const relationKey = (kind, source, target, qualifier = "", authority, scope) =>
  [kind, nodeKey(source), nodeKey(target), qualifier, authority, scope].join("\u0000");

const integrationRoot = resolve(
  root,
  "dogfood/chatgpt-desktop-runtime/execution/integration",
);
const candidates = [];
for (const entry of readdirSync(integrationRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "_LIST-RUNS-BASELINE-REBASE") continue;
  const path = resolve(integrationRoot, entry.name, "traceability-graph-snapshot.json");
  if (existsSync(path)) candidates.push(JSON.parse(readFileSync(path, "utf8")));
}
const currentGraph = candidates.sort((left, right) => right.revision - left.revision)[0];
if (!currentGraph) throw new Error("current integration traceability graph is unavailable");
const currentGraphBytes = canonicalBytes(currentGraph);
const currentGraphRef = ref(
  `traceability-graph-${currentGraph.graphId.replace(/[^A-Za-z0-9._-]/gu, "-")}-r${currentGraph.revision}`,
  api.sha256Digest(currentGraphBytes),
  {
    schema: "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
    mediaType: "application/vnd.devrelay.traceability-graph+json",
    uri: `memory://devrelay/traceability/list-runs-rebase/r${currentGraph.revision}.json`,
  },
);
const required = new Set(currentGraph.appliedUpdates.map(({ digest }) => digest));
const indexed = new Map();
function indexJson(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) indexJson(path);
    else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        const digest = api.sha256Digest(canonicalBytes(value));
        if (required.has(digest) && !indexed.has(digest)) indexed.set(digest, value);
      } catch {}
    }
  }
}
indexJson(resolve(root, "dogfood"));
indexJson(resolve(root, "project/history/traceability/updates"));
const closure = currentGraph.appliedUpdates.map((reference) => {
  const value = indexed.get(reference.digest);
  if (!value) throw new Error(`traceability update closure is missing ${reference.digest}`);
  return { ref: reference, bytes: canonicalBytes(value), value };
});
const store = createInMemoryTraceabilityStore();
store.restore(
  currentGraph.graphId,
  [...closure, { ref: currentGraphRef, bytes: currentGraphBytes, value: currentGraph }],
  currentGraphRef,
);

const desiredValue = readJson(
  "dogfood/chatgpt-desktop-list-runs/work-breakdown/traceability-graph-snapshot.json",
);
const desiredBytes = canonicalBytes(desiredValue);
const desired = {
  value: desiredValue,
  bytes: desiredBytes,
  ref: ref(
    "traceability-graph-devrelay-list-runs-wb-r1",
    api.sha256Digest(desiredBytes),
    {
      schema: "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
      mediaType: "application/vnd.devrelay.traceability-graph+json",
      uri: "devrelay://repository/dogfood/chatgpt-desktop-list-runs/work-breakdown/traceability-graph-snapshot.json",
    },
  ),
};
const baselinePath = resolve(root, "project/work-breakdown-baseline.json");
const baselineBytes = readFileSync(baselinePath);
const baselineValue = JSON.parse(baselineBytes);
const baseline = {
  value: baselineValue,
  bytes: baselineBytes,
  ref: ref(
    baselineValue.baselineId,
    api.sha256Digest(baselineBytes),
    {
      schema: "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
      mediaType: "application/vnd.devrelay.work-breakdown-baseline+json",
      uri: "devrelay://repository/project/work-breakdown-baseline.json",
    },
  ),
};
const listRunIds = new Set([
  "WI-DESKTOP-LIST-RUNS-STORE",
  "WI-DESKTOP-LIST-RUNS-MCP",
  "WI-DESKTOP-LIST-RUNS-TESTS",
  "WI-DESKTOP-LIST-RUNS-DOCS",
]);
const currentNodeById = new Map(currentGraph.nodes.map((node) => [node.nodeId, node]));
const currentKeys = new Set(currentGraph.nodes.map(nodeKey));
const desiredNodeById = new Map(desired.value.nodes.map((node) => [node.nodeId, node]));
const groups = new Map();
const groupFor = (scope, authority) => {
  const key = `${authority}\u0000${scope}`;
  if (!groups.has(key)) groups.set(key, { key, scope, authority, nodes: [], edges: [] });
  return groups.get(key);
};
const excludedDesiredNodeIds = new Set(
  desired.value.nodes
    .filter(({ kind, stableId }) => kind === "work-item" && listRunIds.has(stableId))
    .map(({ nodeId }) => nodeId),
);
for (const [position, node] of desired.value.nodes.entries()) {
  if (
    node.authority === "reference" ||
    node.kind === "artifact-reference" ||
    excludedDesiredNodeIds.has(node.nodeId) ||
    currentKeys.has(nodeKey(node))
  ) continue;
  groupFor(node.scope, node.authority).nodes.push({
    kind: node.kind,
    stableId: node.stableId,
    label: node.label,
    attributes: {
      ...structuredClone(node.attributes),
      approvedRebaseSource: desired.ref,
    },
    sourceLocators: [sourceLocator(desired, `/nodes/${position}`, node)],
  });
}
const currentRelations = new Set(
  currentGraph.edges.map((edge) => {
    const source = currentNodeById.get(edge.sourceNodeId);
    const target = currentNodeById.get(edge.targetNodeId);
    return relationKey(
      edge.kind,
      source,
      target,
      edge.qualifier,
      edge.authority,
      edge.scope,
    );
  }),
);
for (const [position, edge] of desired.value.edges.entries()) {
  if (
    excludedDesiredNodeIds.has(edge.sourceNodeId) ||
    excludedDesiredNodeIds.has(edge.targetNodeId)
  ) continue;
  const source = desiredNodeById.get(edge.sourceNodeId);
  const target = desiredNodeById.get(edge.targetNodeId);
  if (!source || !target) throw new Error("desired traceability edge is dangling");
  if (source.kind === "artifact-reference" || target.kind === "artifact-reference") continue;
  const key = relationKey(
    edge.kind,
    source,
    target,
    edge.qualifier,
    edge.authority,
    edge.scope,
  );
  const touchesMissing = !currentKeys.has(nodeKey(source)) || !currentKeys.has(nodeKey(target));
  if (currentRelations.has(key) || !touchesMissing) continue;
  groupFor(edge.scope, edge.authority).edges.push({
    kind: edge.kind,
    source: endpoint(source),
    target: endpoint(target),
    qualifier: edge.qualifier,
    rationale: edge.rationale,
    attributes: {
      ...structuredClone(edge.attributes),
      approvedRebaseSource: desired.ref,
    },
    sourceLocators: [sourceLocator(desired, `/edges/${position}`, edge)],
  });
}

const workGroup = groupFor("work-breakdown/candidate", "candidate");
const finalItems = baseline.value.workItems
  .map((item, position) => ({ item, position }))
  .filter(({ item }) => listRunIds.has(item.id));
if (finalItems.length !== listRunIds.size) {
  throw new Error("final WorkBreakdownBaseline does not contain all list-runs work items");
}
for (const { item, position } of finalItems) {
  const locator = sourceLocator(baseline, `/workItems/${position}`, item);
  workGroup.nodes.push({
    kind: "work-item",
    stableId: item.id,
    label: item.objective,
    attributes: { workItem: structuredClone(item) },
    sourceLocators: [locator],
  });
  const target = {
    kind: "work-item",
    stableId: item.id,
    authority: "candidate",
    scope: "work-breakdown/candidate",
  };
  const mappings = [
    ["acceptance-criterion-refs", "planned-by", "acceptance-criterion", "requirements/baseline", "The approved acceptance criterion is planned by this candidate work item."],
    ["architecture-refs", "implementation-planned-by", "architecture-element", "architecture/baseline", "Implementation of the approved architecture element is planned by this candidate work item."],
    ["contract-refs", "realization-planned-by", "contract", "contracts/baseline", "Realization of the approved contract is planned by this candidate work item."],
  ];
  for (const [field, kind, sourceKind, scope, rationale] of mappings) {
    for (const stableId of item[field]) {
      workGroup.edges.push({
        kind,
        source: { kind: sourceKind, stableId, authority: "approved", scope },
        target,
        rationale,
        sourceLocators: [locator],
      });
    }
  }
}
const contributors = [...groups.values()]
  .filter(({ nodes, edges }) => nodes.length > 0 || edges.length > 0)
  .sort((left, right) => left.key.localeCompare(right.key))
  .map((group, index) => {
    const projection = {
      horizon: "implementation",
      nodes: group.nodes,
      edges: group.edges,
    };
    return Object.freeze({
      metadata: Object.freeze({
        id: `devrelay.approved-list-runs-snapshot-rebase.${index + 1}`,
        version: "1.0.0",
      }),
      match: () => true,
      scope: group.scope,
      authority: group.authority,
      ownership: Object.freeze({
        scope: group.scope,
        authority: group.authority,
        nodeKinds: [...new Set(group.nodes.map(({ kind }) => kind))].sort(),
        edgeKinds: [...new Set(group.edges.map(({ kind }) => kind))].sort(),
      }),
      project: async () => structuredClone(projection),
    });
  });
const availableNodeIds = new Set(currentGraph.nodes.map(({ nodeId }) => nodeId));
for (const group of groups.values()) {
  for (const node of group.nodes) {
    availableNodeIds.add(api.traceabilityNodeId({
      graphId: currentGraph.graphId,
      kind: node.kind,
      stableId: node.stableId,
      authority: group.authority,
      scope: group.scope,
    }));
  }
}
const dangling = [];
for (const group of groups.values()) {
  for (const edge of group.edges) {
    for (const [side, value] of [["source", edge.source], ["target", edge.target]]) {
      const nodeId = api.traceabilityNodeId({ graphId: currentGraph.graphId, ...value });
      if (!availableNodeIds.has(nodeId)) dangling.push({ group: group.key, edgeKind: edge.kind, side, endpoint: value, nodeId });
    }
  }
}
if (dangling.length > 0) throw new Error("rebase projection has dangling endpoints: " + JSON.stringify(dangling.slice(0, 20)));
const graph = api.createTraceabilityGraphService({
  graphId: currentGraph.graphId,
  projectId: currentGraph.projectId,
  store,
  contributors,
});
const invocation = {
  invocationId: "traceability-list-runs-approved-snapshot-rebase-v1",
  module: { id: "traceability-graph", version: "1.0.0", operation: "rebase-approved-snapshot" },
  plugin: { id: "native-structured-rebase", version: "1.0.0" },
};
const moduleResult = {
  invocationId: invocation.invocationId,
  status: "completed",
  outcome: "merged",
  outputs: {},
  evidence: [desired.ref, baseline.ref],
  diagnostics: [],
};
const prepared = await graph.prepare({
  invocation,
  invocationFingerprint: api.canonicalJsonDigest(invocation),
  moduleResult,
  loadedInputs: {
    "approved-list-runs-traceability-snapshot": [desired],
    "current-work-breakdown-baseline": [baseline],
  },
  loadedOutputs: {},
  baseGraph: graph.captureBase(),
});
const merged = await graph.mergePrepared(prepared);
const replay = await graph.mergePrepared(prepared);
graph.assertApplied(prepared.updateRef);
if (api.canonicalJson(merged.receipt) !== api.canonicalJson(replay.receipt)) {
  throw new Error("traceability rebase replay drifted");
}
for (const id of listRunIds) {
  if (!merged.snapshot.nodes.some(({ stableId }) => stableId === id)) {
    throw new Error(`rebased graph is missing ${id}`);
  }
}
api.validateTraceabilityGraphSnapshot(merged.snapshot);
write("traceability-update.json", prepared.update);
write("traceability-merge-receipt.json", merged.receipt);
write("traceability-graph-snapshot.json", merged.snapshot);
const proofBody = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityGraphRebaseProof",
  proofId: "TGRP-DESKTOP-LIST-RUNS-001",
  baseGraph: currentGraphRef,
  approvedSourceGraph: desired.ref,
  workBreakdownBaseline: baseline.ref,
  update: prepared.updateRef,
  resultingGraph: merged.snapshotRef,
  requiredWorkItems: [...listRunIds].sort(),
  outcome: "merged",
  rationale:
    "Merge only missing approved identities and relations from the list-runs module snapshot, then materialize the final revised work-item set, without taking ownership of existing graph assertions.",
};
write("rebase-proof.json", {
  ...proofBody,
  proofDigest: api.canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(proofBody).filter(([key]) => !["apiVersion", "kind"].includes(key)),
    ),
  ),
});
console.log(JSON.stringify({
  outcome: "merged",
  revisionBefore: currentGraph.revision,
  revisionAfter: merged.snapshot.revision,
  nodesAdded: prepared.update.nodeChanges.length,
  edgesAdded: prepared.update.edgeChanges.length,
  groups: contributors.map(({ metadata, scope, authority }) => ({
    contributor: metadata.id,
    scope,
    authority,
  })),
  requiredWorkItems: [...listRunIds].sort(),
}, null, 2));
