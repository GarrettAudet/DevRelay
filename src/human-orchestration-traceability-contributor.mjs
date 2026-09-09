import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateHumanOrchestrationArtifact } from "./human-orchestration-artifact-validator.mjs";

const SCOPE = "human-orchestration/candidate";
const KINDS = new Set(["HumanOrchestrationSourceBundle", "HumanOrchestrationView", "HumanInterventionRequest", "HumanInterventionReceipt"]);
const OPERATIONS = new Set(["project-operator-view", "request-intervention"]);
const fail = (message) => { throw new TypeError(`human orchestration traceability contributor: ${message}`); };
const immutable = (value) => Object.freeze(structuredClone(value));

function values(context, name) {
  return Object.values(context?.[name] ?? {}).flat();
}
function exact(item) {
  if (!item?.ref || (!Buffer.isBuffer(item.bytes) && !(item.bytes instanceof Uint8Array))) fail("exact artifact bytes and reference are required");
  const bytes = Buffer.from(item.bytes);
  if (sha256Digest(bytes) !== item.ref.digest || bytes.toString("utf8") !== canonicalJson(item.value)) fail("artifact bytes or digest drifted");
  validateHumanOrchestrationArtifact(item.value);
  return item;
}
const locator = (item) => ({ artifact: { artifactId: item.ref.artifactId, digest: item.ref.digest }, jsonPointer: "", entityDigest: canonicalJsonDigest(item.value) });
const stableId = (item) => canonicalJsonDigest({ schema: item.ref.schema, artifactId: item.ref.artifactId, digest: item.ref.digest });
const node = (item) => ({ kind: "artifact-reference", attributes: { artifact: immutable(item.ref) }, sourceLocators: [locator(item)] });
const endpoint = (item) => ({ kind: "artifact-reference", stableId: stableId(item), authority: "reference", scope: "core/artifact-reference" });
const sorted = (items) => items.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));

export const humanOrchestrationCandidateTraceabilityContributor = Object.freeze({
  metadata: immutable({ id: "devrelay.human-orchestration-candidate", version: "1.0.0" }),
  authority: "candidate",
  scope: SCOPE,
  ownership: immutable({ authority: "candidate", scope: SCOPE, nodeKinds: [], edgeKinds: ["derived-from"], retention: "append-only" }),
  match(context) {
    const module = context?.invocation?.module;
    return module?.id === "human-orchestration"
      && module?.version === "0.1.0"
      && OPERATIONS.has(module.operation)
      && values(context, "loadedOutputs").some((item) => KINDS.has(item?.value?.kind));
  },
  async project(context) {
    if (!this.match(context)) fail("project called for a nonmatching execution");
    const outputs = values(context, "loadedOutputs").filter((item) => KINDS.has(item?.value?.kind)).map(exact);
    if (!outputs.length) fail("matching execution has no exact outputs");
    const inputs = values(context, "loadedInputs").filter((item) => item?.ref && (Buffer.isBuffer(item.bytes) || item.bytes instanceof Uint8Array));
    const nodes = outputs.map(node);
    const edges = [];
    for (const output of outputs) {
      for (const input of inputs) {
        if (sha256Digest(Buffer.from(input.bytes)) !== input.ref.digest) fail("input artifact bytes or digest drifted");
        nodes.push({ kind: "artifact-reference", attributes: { artifact: immutable(input.ref) } });
        edges.push({ kind: "derived-from", source: endpoint(output), target: endpoint(input), rationale: "The validated human-orchestration artifact is deterministically derived from this exact declared input.", sourceLocators: [locator(output)] });
      }
    }
    return {
      horizon: "verification",
      nodes: sorted(nodes),
      edges: sorted(edges),
      ...(edges.length ? {} : { reason: "The validated artifact has no loaded artifact inputs." }),
    };
  },
});

export const humanOrchestrationTraceabilityContributors = Object.freeze([humanOrchestrationCandidateTraceabilityContributor]);
