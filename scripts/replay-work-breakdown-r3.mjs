import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canonicalJson,
  sha256Digest,
} from "../src/content-digest.mjs";

const EXPECTED_DIGEST =
  "sha256:093d92c0abb05bac94e682af9c72289a04620866d3842a217f97962d9296b2ed";
const basePath =
  "dogfood/work-dependency-analysis/work-breakdown/traceability-graph-snapshot.json";
const updatePath =
  "project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json";
const resultPath =
  "dogfood/work-execution/work-breakdown/traceability-graph-snapshot.json";
const outputPath =
  "project/history/traceability/snapshots/093d92c0abb05bac94e682af9c72289a04620866d3842a217f97962d9296b2ed.json";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const base = readJson(basePath);
const update = readJson(updatePath);
const laterResult = readJson(resultPath);

const baseDigest = sha256Digest(Buffer.from(canonicalJson(base), "utf8"));
assert.equal(baseDigest, update.baseGraph.digest);
assert.equal(update.baseGraph.digest,
  "sha256:23772842d3227bc2a2aed0c5ef54fded6c449f3e70e62e92d85022649f68c2d6");
assert.equal(laterResult.parentGraph.digest, EXPECTED_DIGEST);

const updateDigest = sha256Digest(Buffer.from(canonicalJson(update), "utf8"));
const updateRef = laterResult.appliedUpdates.find(
  ({ digest }) => digest === updateDigest,
);
assert.ok(updateRef);

function applyChanges(records, changes, kind) {
  const idField = kind === "node" ? "nodeId" : "edgeId";
  const valueField = kind;
  const byId = new Map(records.map((record) => [record[idField], record]));
  for (const change of changes) {
    const desired = change[valueField];
    const before = byId.get(desired[idField]);
    if (change.precondition.state === "absent") {
      assert.equal(before, undefined, `${kind} ${desired[idField]} must be absent`);
    } else {
      assert.equal(
        before?.contentDigest,
        change.precondition.contentDigest,
        `${kind} ${desired[idField]} precondition drift`,
      );
    }
    byId.set(desired[idField], desired);
  }
  return [...byId.values()].sort((left, right) =>
    left[idField].localeCompare(right[idField], "en"),
  );
}

const appliedUpdates = [
  ...base.appliedUpdates.filter(({ digest }) => digest !== updateRef.digest),
  updateRef,
].sort((left, right) => {
  const key = (ref) =>
    [ref.artifactId, ref.schema, ref.mediaType, ref.digest, ref.uri].join("\u0000");
  return key(left).localeCompare(key(right), "en");
});

const reconstructed = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityGraphSnapshot",
  graphId: base.graphId,
  projectId: base.projectId,
  revision: base.revision + 1,
  horizon: "implementation",
  vocabulary: update.vocabulary,
  parentGraph: update.baseGraph,
  lastAppliedUpdate: updateRef,
  appliedUpdates,
  nodes: applyChanges(base.nodes, update.nodeChanges, "node"),
  edges: applyChanges(base.edges, update.edgeChanges, "edge"),
};

const actualDigest = sha256Digest(
  Buffer.from(canonicalJson(reconstructed), "utf8"),
);
assert.equal(actualDigest, EXPECTED_DIGEST);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${canonicalJson(reconstructed)}\n`);
console.log(`${outputPath} ${actualDigest}`);
