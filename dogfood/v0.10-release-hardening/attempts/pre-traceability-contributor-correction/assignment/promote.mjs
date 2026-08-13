import {
  closeSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
  writeSync,
} from "node:fs";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import {
  specialistAssignmentBaselineTraceabilityContributor,
  specialistAssignmentCandidateTraceabilityContributor,
} from "../../../src/specialist-assignment-traceability-contributor.mjs";

const OUTPUT = new URL("./replay-v3/", import.meta.url);

const read = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

function exactFileBytes(value) {
  return Buffer.from(canonicalJson(value) + "\n", "utf8");
}

function openMutableProjectFile(filePath) {
  return openSync(filePath, "a+");
}

function readDescriptorBytes(descriptor) {
  const bytes = Buffer.alloc(fstatSync(descriptor).size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(
      descriptor,
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (count === 0)
      throw new Error("assignment project file ended during descriptor read");
    offset += count;
  }
  return bytes;
}

function replaceDescriptorBytes(descriptor, bytes) {
  ftruncateSync(descriptor, 0);
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(
      descriptor,
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
  }
  fsyncSync(descriptor);
}

function writeExclusiveOrVerify(filePath, bytes, mismatchMessage) {
  try {
    writeFileSync(filePath, bytes, { flag: "wx" });
    return;
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "EEXIST")) {
      throw error;
    }
  }
  if (!readFileSync(filePath).equals(bytes)) {
    throw new Error(mismatchMessage);
  }
}

function writeExact(relativePath, value) {
  const url =
    relativePath instanceof URL
      ? relativePath
      : new URL(relativePath.replace(/^\.\//u, ""), OUTPUT);
  const bytes = exactFileBytes(value);
  mkdirSync(new URL(".", url), { recursive: true });
  writeExclusiveOrVerify(
    url,
    bytes,
    "immutable assignment artifact already differs: " + url.pathname,
  );
}

function preserveAndReplaceProject(
  relativePath,
  value,
  historyName,
  identityOf,
) {
  const currentUrl = new URL(relativePath, import.meta.url);
  const nextBytes = exactFileBytes(value);
  mkdirSync(new URL(".", currentUrl), { recursive: true });
  const descriptor = openMutableProjectFile(currentUrl);
  try {
    const currentBytes = readDescriptorBytes(descriptor);
    if (currentBytes.length > 0) {
      if (currentBytes.equals(nextBytes)) return;
      const current = JSON.parse(currentBytes);
      const identity = identityOf(current);
      if (
        typeof identity !== "string" ||
        !/^[A-Za-z0-9._-]+$/u.test(identity)
      ) {
        throw new Error(
          "current assignment artifact lacks a safe history identity",
        );
      }
      const historyUrl = new URL(
        `../../../project/history/specialist-assignment/${identity}/${historyName}`,
        import.meta.url,
      );
      const historyBytes = exactFileBytes(current);
      mkdirSync(new URL(".", historyUrl), { recursive: true });
      writeExclusiveOrVerify(
        historyUrl,
        historyBytes,
        "assignment history already differs: " + historyUrl.pathname,
      );
    }
    replaceDescriptorBytes(descriptor, nextBytes);
  } finally {
    closeSync(descriptor);
  }
}

const loaded = (value, schema, mediaType, artifactId, uri) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: {
      artifactId,
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri,
    },
  };
};

const priorGraph = read(
  "../dependency-analysis/replay-v3/traceability-graph-snapshot.json",
);
const priorProof = read(
  "../dependency-analysis/replay-v3/work-dependency-gate-promotion-proof.json",
);
const draftValue = read("./specialist-assignment-draft.json");
const baselineValue = read("./specialist-assignment-baseline.json");
const store = createInMemoryTraceabilityStore();
const priorBytes = Buffer.from(canonicalJson(priorGraph), "utf8");
const priorLoaded = {
  value: priorGraph,
  bytes: priorBytes,
  ref: priorProof.traceability.resultingGraph,
};
if (sha256Digest(priorBytes) !== priorLoaded.ref.digest) {
  throw new Error("prior graph bytes do not match promotion proof");
}

const historicalUpdateSourcePaths = [
  "../../../project/history/traceability/updates/00920a6f6f2cf849510888a69a6e22cf1747c0889ac3d5d9d5226aff905d0b3c.json",
  "../../../project/history/traceability/updates/4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067.json",
  "../../../project/history/traceability/updates/d8fde060e3a21be13c5d90307dca6bda5a44e95055a31e292175dee99fabf37a.json",
  "../../../project/history/traceability/updates/b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822.json",
  "../../change-integration/work-breakdown/traceability-update.json",
  "../../../project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json",
  "../../architecture-discovery/work-breakdown/traceability-update.json",
  "../../lifecycle-run-report/work-breakdown/replay-v1/traceability-update.json",
  "../work-breakdown/traceability-update.json",
  "../../architecture-discovery/dependency-analysis/traceability-update.json",
  "../dependency-analysis/replay-v3/traceability-update.json",
];
const historicalPaths = new Map(
  historicalUpdateSourcePaths.map((relativePath) => {
    const update = read(relativePath);
    return [
      sha256Digest(Buffer.from(canonicalJson(update), "utf8")),
      relativePath,
    ];
  }),
);
const historicalUpdates = priorGraph.appliedUpdates.map((ref) => {
  const relativePath = historicalPaths.get(ref.digest);
  if (!relativePath) {
    throw new Error(`historical update ${ref.digest} has no source locator`);
  }
  const update = read(relativePath);
  const bytes = Buffer.from(canonicalJson(update), "utf8");
  if (sha256Digest(bytes) !== ref.digest) {
    throw new Error(`historical update ${ref.digest} bytes are unavailable`);
  }
  return { ref, bytes, value: update };
});
store.restore(
  priorGraph.graphId,
  [priorLoaded, ...historicalUpdates],
  priorLoaded.ref,
);

const service = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store,
  contributors: [
    specialistAssignmentCandidateTraceabilityContributor,
    specialistAssignmentBaselineTraceabilityContributor,
  ],
});

async function merge({ invocation, outcome, name, artifact }) {
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      invocationId: invocation.invocationId,
      status: "completed",
      outcome,
      outputs: { [name]: [artifact.ref] },
      evidence: [],
    },
    loadedOutputs: { [name]: [artifact] },
  });
  const merged = await service.mergePrepared(prepared);
  return { prepared, merged };
}

const draft = loaded(
  draftValue,
  "https://devrelay.dev/artifacts/specialist-assignment-draft/v1",
  "application/vnd.devrelay.specialist-assignment-draft+json",
  draftValue.draftId,
  "file:///dogfood/v0.10-release-hardening/assignment/specialist-assignment-draft.json",
);
const candidate = await merge({
  invocation: {
    invocationId: "SA-REL-DOGFOOD-001",
    module: {
      id: "specialist-assignment",
      version: "1.0.0",
      operation: "assign-specialists",
    },
  },
  outcome: "assigned",
  name: "specialist-assignment-draft",
  artifact: draft,
});

const baseline = loaded(
  baselineValue,
  "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1",
  "application/vnd.devrelay.specialist-assignment-baseline+json",
  baselineValue.baselineId,
  "file:///project/specialist-assignment-baseline.json",
);
const approved = await merge({
  invocation: {
    invocationId: "SA-REL-GATE-DOGFOOD-001",
    module: {
      id: "specialist-assignment-gate",
      version: "1.0.0",
      operation: "promote-baseline",
    },
  },
  outcome: "promoted",
  name: "specialist-assignment-baseline",
  artifact: baseline,
});

const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentPromotionProof",
  approvedBaseline: baseline.ref,
  candidateTraceabilityUpdate: candidate.prepared.updateRef,
  candidateTraceabilityReceipt: candidate.merged.receiptRef,
  approvedTraceabilityUpdate: approved.prepared.updateRef,
  approvedTraceabilityReceipt: approved.merged.receiptRef,
  resultingGraph: approved.merged.snapshotRef,
  resultingGraphRevision: approved.merged.snapshot.revision,
  nextModule: "WorkExecution",
};

writeExact("./candidate-traceability-update.json", candidate.prepared.update);
writeExact(
  "./candidate-traceability-merge-receipt.json",
  candidate.merged.receipt,
);
writeExact("./approved-traceability-update.json", approved.prepared.update);
writeExact(
  "./approved-traceability-merge-receipt.json",
  approved.merged.receipt,
);
writeExact("./traceability-graph-snapshot.json", approved.merged.snapshot);
writeExact("./specialist-assignment-promotion-proof.json", proof);

preserveAndReplaceProject(
  "../../../project/specialist-assignment-baseline.json",
  baselineValue,
  "specialist-assignment-baseline.json",
  (current) => current.baselineId,
);
preserveAndReplaceProject(
  "../../../project/specialist-assignment-promotion.commit.json",
  proof,
  "specialist-assignment-promotion.commit.json",
  (current) => current.approvedBaseline?.artifactId,
);

console.log(
  JSON.stringify(
    {
      baselineDigest: baseline.ref.digest,
      graphRevision: proof.resultingGraphRevision,
      graphDigest: proof.resultingGraph.digest,
      nextModule: proof.nextModule,
    },
    null,
    2,
  ),
);
