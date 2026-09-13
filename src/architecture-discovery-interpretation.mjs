import { readFileSync } from "node:fs";
import { canonicalJson } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";
import { validateArchitectureArtifact, validateArchitectureDiscoveryHandoff } from "./architecture-artifact-validator.mjs";
import { loadMaterializedArchitectureDiscoveryClosure } from "./architecture-discovery-materialized-closure.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const schema = read("architecture-discovery-interpretation.schema.json");
const validate = compileArtifactSchema(schema, [read("module-result.schema.json")]);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = message => { throw new TypeError(`discovery interpretation: ${message}`); };
const pointer = (value, path) => {
  if (/~(?:[^01]|$)/u.test(path)) fail("invalid JSON pointer escape");
  for (const part of path.slice(1).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) fail(`unresolved target ${path}`);
    value = value[part];
  }
  return value;
};

// Validates a candidate interpretation only. No state transition, approval or
// model-derived architecture claim becomes authoritative through this function.
export async function loadArchitectureDiscoveryInterpretation({ interpretationRef, loadArtifact }) {
  if (interpretationRef.schema !== schema.$id) fail("wrong interpretation schema");
  const interpretation = await loadArtifactContent(interpretationRef, { load: loadArtifact });
  const candidate = interpretation.value;
  if (!validate(candidate)) fail(validationDetail(validate));
  if (candidate.interpretationId !== interpretationRef.artifactId) fail("interpretation identity mismatch");
  const closure = await loadMaterializedArchitectureDiscoveryClosure({ snapshotRef: candidate.discoverySnapshot, loadArtifact });
  const state = await loadArtifactContent(candidate.projectArchitectureState, { load: loadArtifact });
  const structured = await loadArtifactContent(candidate.structuredSnapshot, { load: loadArtifact });
  const attached = new Map();
  const targetView = structuredClone(structured.value);
  for (const name of ["architectureModel", "diagrams", "interfaceIntent", "architectureConstraints", "decisionRecords", "nativeArtifacts"]) {
    const section = structured.value[name];
    if (section?.mode === "attached") {
      const loaded = await loadArtifactContent(section.artifact, { load: loadArtifact });
      attached.set(canonicalJson(section.artifact), loaded);
      // Logical content pointers are identical for embedded and attached
      // sections. This is a derived read-only view, never a rewritten snapshot.
      targetView[name] = { mode: "embedded", content: loaded.value };
    }
  }
  validateArchitectureArtifact(structured.value, { resolveAttached: ref => attached.get(canonicalJson(ref)) });
  if (candidate.projectArchitectureState.schema !== "https://devrelay.dev/artifacts/project-architecture-state/v1" || candidate.structuredSnapshot.schema !== "https://devrelay.dev/artifacts/current-architecture-snapshot/v1") fail("wrong state or structured snapshot schema");
  if (state.value.stateId !== state.ref.artifactId || structured.value.snapshotId !== structured.ref.artifactId) fail("state or snapshot identity mismatch");
  if (!same(state.value.requirementsBaseline, candidate.requirementsBaseline) || !same(state.value.projectOverviewBaseline, candidate.projectOverviewBaseline)) fail("interpretation differs from the state project pair");
  validateArchitectureDiscoveryHandoff({ projectArchitectureState: state.value, projectArchitectureStateRef: state.ref, repositorySnapshot: closure.repository.value, currentArchitectureSnapshot: structured.value });
  if (!same(structured.value.repositorySnapshot, closure.snapshot.value.repositorySnapshot)) fail("interpretation substitutes discovery repository");
  if (!structured.value.sourceRefs.some(source => same(source.artifact, candidate.discoverySnapshot))) fail("structured snapshot omits original discovery provenance");
  const expected = new Map(closure.observations.map(entry => [entry.ref.artifactId, entry.ref]));
  const seen = new Set();
  for (const entry of candidate.observations) {
    if (seen.has(entry.observation.artifactId) || !expected.has(entry.observation.artifactId) || !same(entry.observation, expected.get(entry.observation.artifactId))) fail("observation coverage is duplicated or substituted");
    seen.add(entry.observation.artifactId);
    if ((entry.disposition === "mapped") !== (entry.targetPointers.length > 0)) fail("only mapped observations require nonempty targets");
    for (const target of entry.targetPointers) pointer(targetView, target);
  }
  if (seen.size !== expected.size) fail("interpretation omits observations");
  const expectedGaps = new Map(closure.gaps.map(entry => [entry.ref.artifactId, entry]));
  const seenGaps = new Set();
  const targets = new Set();
  for (const entry of candidate.gaps) {
    const original = expectedGaps.get(entry.gap.artifactId);
    const target = structured.value.gaps.find(gap => gap.id === entry.structuredGapId);
    if (!original || !same(original.ref, entry.gap) || seenGaps.has(entry.gap.artifactId) || targets.has(entry.structuredGapId)) fail("gap coverage is duplicated or substituted");
    if (!target || target.blocking !== original.value.material || target.statement !== original.value.reason) fail("structured gap loses materiality or reason");
    seenGaps.add(entry.gap.artifactId); targets.add(entry.structuredGapId);
  }
  if (seenGaps.size !== expectedGaps.size) fail("interpretation omits gaps");
  if (closure.snapshot.value.warnings.some(warning => !structured.value.warnings.includes(warning))) fail("structured snapshot omits discovery warnings");
  return Object.freeze({ interpretation, closure, state, structured, authority: "candidate" });
}
