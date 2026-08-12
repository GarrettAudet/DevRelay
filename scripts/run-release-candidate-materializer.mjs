import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SOURCE = path.join(
  ROOT,
  "handoff",
  "2026-08-11-controlled-release-acceptance-pickup",
  "candidate-materializer.wip.txt",
);
const TEMPORARY = path.join(ROOT, ".devrelay-release-candidate-materializer.mjs");

const restoreReplacement = String.raw`async function collectHistoricalUpdateEntries(expectedRefs) {
  const { readdir } = await import("node:fs/promises");
  const expectedByDigest = new Map(expectedRefs.map((expectedRef) => [expectedRef.digest, expectedRef]));
  const resolvedByDigest = new Map();

  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(ROOT, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().includes("update") || !entry.name.endsWith(".json")) {
        continue;
      }
      const bytes = await readFile(path.join(ROOT, relativePath));
      let value;
      try {
        value = JSON.parse(bytes.toString("utf8"));
      } catch {
        continue;
      }
      for (const candidateBytes of [bytes, jsonBytes(value)]) {
        const digest = sha256Digest(candidateBytes);
        if (expectedByDigest.has(digest) && !resolvedByDigest.has(digest)) {
          resolvedByDigest.set(digest, { bytes: candidateBytes, value });
        }
      }
    }
  }

  await visit("dogfood");
  await visit("project");
  const missing = expectedRefs.filter(({ digest }) => !resolvedByDigest.has(digest));
  assert.deepEqual(
    missing.map(({ artifactId, digest }) => ({ artifactId, digest })),
    [],
    "every applied TraceabilityUpdate must be restored from exact repository bytes",
  );
  return expectedRefs.map((expectedRef) => ({
    ref: expectedRef,
    ...resolvedByDigest.get(expectedRef.digest),
  }));
}

async function restoreTraceability(contributors) {
  const seedPath = "dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/graph-recovery-epoch/revision-002/candidate-seed-snapshot.json";
  const headPath = "dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/10-change-integration/result-graph.json";
  const receiptPath = "dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/10-change-integration/atomic-merge-receipt.json";
  const seed = await readJson(seedPath);
  const head = await readJson(headPath);
  const receipt = await readJson(receiptPath);
  const seedRef = head.value.parentGraph;
  assert.equal(sha256Digest(seed.bytes), seedRef.digest, "recovery seed raw digest drift");
  const headBytes = jsonBytes(head.value);
  const headRef = receipt.value.resultGraph;
  assert.equal(sha256Digest(headBytes), headRef.digest, "integration graph canonical digest drift");
  const historicalUpdates = await collectHistoricalUpdateEntries(head.value.appliedUpdates);
  const store = createInMemoryTraceabilityStore();
  store.restore(head.value.graphId, [
    { value: seed.value, bytes: seed.bytes, ref: seedRef },
    ...historicalUpdates,
    { value: head.value, bytes: headBytes, ref: headRef },
  ], headRef);
  const service = createTraceabilityGraphService({ graphId: head.value.graphId, projectId: head.value.projectId, store, contributors });
  assert.equal(service.captureBase().ref.digest, headRef.digest);
  return { service, sourceHead: head.value, sourceHeadRef: headRef };
}`;

let source = await readFile(SOURCE, "utf8");
const restoreStart = source.indexOf("async function restoreTraceability(contributors) {");
const restoreEnd = source.indexOf("\n\nfunction moduleContext", restoreStart);
if (restoreStart < 0 || restoreEnd < 0) {
  throw new Error("candidate materializer restoreTraceability boundary was not found");
}
source = `${source.slice(0, restoreStart)}${restoreReplacement}${source.slice(restoreEnd)}`;
source = source.replaceAll(
  "requirementsBaseline: requirementsLoaded.ref",
  "requirementsBaseline: ref(requirementsLoaded.ref.artifactId, requirementsLoaded.ref.digest)",
);
source = source.replace(
  'postReconciliationDiagnostics.filter(({ code }) => code === "TG_MISSING_ARCHITECTURE_REALIZATION" && ({ blocking: true }))',
  'postReconciliationDiagnostics.filter(({ code, blocking }) => code === "TG_MISSING_ARCHITECTURE_REALIZATION" && blocking === true)',
);
await writeFile(TEMPORARY, source, "utf8");
try {
  await import(`${pathToFileURL(TEMPORARY).href}?run=${Date.now()}`);
} finally {
  await unlink(TEMPORARY).catch(() => undefined);
}
