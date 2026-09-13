import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";
import { normalizeArchitectureDiscoveryObservations } from "./architecture-discovery-observation-normalizer.mjs";

const schema = kind => `https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/${kind}`;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = message => { throw new TypeError(`materialized discovery closure: ${message}`); };

// Read-only validation, not a route decision or Gate approval. Every referenced
// artifact must resolve to its original bytes; models receive no graph authority.
export async function loadMaterializedArchitectureDiscoveryClosure({ snapshotRef, loadArtifact }) {
  const artifacts = { load: loadArtifact };
  const load = async (ref, definition, kind) => {
    if (ref?.schema !== schema(definition)) fail(`expected exact ${definition} schema`);
    const loaded = await loadArtifactContent(ref, artifacts);
    validateArchitectureDiscoveryArtifact(loaded.value);
    if (loaded.value.kind !== kind) fail(`expected ${kind}`);
    return loaded;
  };
  const snapshot = await load(snapshotRef, "snapshot", "CurrentArchitectureSnapshot");
  const value = snapshot.value;
  if (snapshot.ref.artifactId !== value.snapshotId) fail("snapshot identity differs from its reference");
  const repository = await loadArtifactContent(value.repositorySnapshot, artifacts);
  const inventory = await load(value.nativeInventory, "nativeInventory", "NativeRepositoryInventory");
  const analyzers = await Promise.all(value.analyzerResults.map(ref => load(ref, "analyzerResult", "ArchitectureAnalyzerResult")));
  const observations = await Promise.all(value.observations.map(ref => load(ref, "observation", "ArchitectureObservation")));
  const gaps = await Promise.all(value.gaps.map(ref => load(ref, "gap", "ArchitectureDiscoveryGap")));
  if (new Set(gaps.map(entry => entry.value.gapId)).size !== gaps.length) fail("duplicate gap identities");
  for (const gap of gaps) if (gap.ref.artifactId !== gap.value.gapId) fail("gap identity differs from its reference");
  // Normalization's historical input protocol uses intrinsic producer digests;
  // the stored references above always use raw file digests. Translate only
  // that input binding for rederivation, never the persisted artifact bytes.
  const normalizationInputs = analyzers.map(entry => {
    if (!same(entry.value.nativeInventory, value.nativeInventory)) fail("analyzer substitutes native inventory");
    const copy = structuredClone(entry.value);
    copy.nativeInventory = { ...copy.nativeInventory, digest: inventory.value.inventoryDigest };
    copy.resultDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(copy).filter(([key]) => !["apiVersion", "kind", "resultDigest"].includes(key))));
    return copy;
  });
  const derived = normalizeArchitectureDiscoveryObservations({ snapshotId: value.snapshotId, nativeInventory: inventory.value, analyzerResults: normalizationInputs });
  if (!same(value.repositorySnapshot, inventory.value.repositorySnapshot)) fail("snapshot repository differs from native inventory");
  if (!same(value.observations, derived.snapshot.observations) || !same(observations.map(entry => entry.value), derived.observations)) fail("observations do not match exact producer findings");
  if (!same(value.sourceRefs, derived.snapshot.sourceRefs) || !same(value.discoveryMethods, derived.snapshot.discoveryMethods)) fail("snapshot loses source provenance or discovery methods");
  if (derived.snapshot.warnings.some(warning => !value.warnings.includes(warning))) fail("snapshot omits producer warnings");
  const refs = [...inventory.value.nativeEvidence, ...analyzers.flatMap(entry => entry.value.nativeEvidence), ...gaps.flatMap(entry => entry.value.sources.map(source => source.artifact))];
  const unique = new Map(refs.map(ref => [canonicalJson(ref), ref]));
  const evidence = await Promise.all([...unique.values()].map(ref => loadArtifactBytes(ref, artifacts)));
  return Object.freeze({ snapshot, repository, inventory, analyzers: Object.freeze(analyzers), observations: Object.freeze(observations), gaps: Object.freeze(gaps), evidence: Object.freeze(evidence) });
}
