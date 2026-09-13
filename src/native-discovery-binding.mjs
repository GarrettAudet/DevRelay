import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { selectArchitectureDiscoveryRoute } from "./architecture-discovery-routing.mjs";
import { bindArchitectureDiscoveryInputs } from "./architecture-discovery-input-guard.mjs";
import { createNativeArchitectureInventory } from "./architecture-discovery-native-inventory.mjs";
import { createArchitectureDiscoveryCheckpointController } from "./architecture-discovery-checkpoint.mjs";
import { normalizeArchitectureDiscoveryObservations } from "./architecture-discovery-observation-normalizer.mjs";
import { evaluateMaterializedArchitectureDiscoveryGapPolicy } from "./architecture-discovery-gap-policy.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

const digest = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const portablePath = { type: "string", pattern: "^(?!/)(?!.*\\\\)(?!.*:)(?!.*(?:^|/)\\.\\.?(?:/|$)).+$" };
export const nativeDiscoveryPlugin = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "ModulePlugin",
  metadata: { id: "native-architecture-discovery", version: "1.0.0", description: "Explicit offline native inventory binding; observational outputs only." },
  implements: [{ module: { id: "architecture-discovery", version: "0.1.1" }, operations: [{
    id: "discover", role: "proposer", execution: "effect", capabilities: [{ kind: "filesystem.read", scope: "config:sourceRoot" }],
    configSchema: { type: "object", additionalProperties: false, required: ["sourceRoot", "sources"], properties: {
      sourceRoot: { anyOf: [{ const: "." }, portablePath] },
      sources: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["path", "digest"], properties: { path: portablePath, digest } } },
    } },
  }] }],
};

const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = (message) => { throw new TypeError(`native discovery binding: ${message}`); };
const seal = (body, field) => ({ ...body, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });

// Bounded adapter dependencies deliberately exclude graph and Gate services.
// The caller supplies existing host confinement, exact artifact storage and
// immutable checkpoints; Core still validates and checkpoints the Module result.
export function createNativeDiscoveryBinding({ loadArtifact, readSource, saveArtifact, checkpoints, requirementsRef, overviewRef, repositoryRevision }) {
  return Object.freeze({ async invoke(invocation) {
    if (invocation.kind !== "ModuleInvocation" || !same(invocation.plugin, { id: nativeDiscoveryPlugin.metadata.id, version: nativeDiscoveryPlugin.metadata.version }) ||
        !same(invocation.module, { id: "architecture-discovery", version: "0.1.1", operation: "discover" })) fail("unexpected operation binding");
    const load = async (port) => {
      const refs = invocation.inputs[port];
      if (refs?.length !== 1) fail(`exact ${port} input required`);
      const rawBytes = Buffer.from(await loadArtifact(refs[0]));
      if (sha256Digest(rawBytes) !== refs[0].digest) fail("input bytes drifted");
      return { artifact: JSON.parse(rawBytes), rawBytes, reference: refs[0] };
    };
    const projectOverview = await load("project-overview-baseline");
    const projectArchitectureState = await load("project-architecture-state");
    const repositorySnapshot = await load("repository-snapshot");
    if (!same(projectOverview.reference, overviewRef) || !same(projectArchitectureState.artifact.projectOverviewBaseline, overviewRef) ||
        !same(projectArchitectureState.artifact.requirementsBaseline, requirementsRef)) fail("discovery state does not bind the current project pair");
    const routeDecision = selectArchitectureDiscoveryRoute({ projectArchitectureState: projectArchitectureState.artifact,
      projectArchitectureStateRef: projectArchitectureState.reference, projectArchitectureStateBytes: projectArchitectureState.rawBytes });
    const config = invocation.config;
    if (repositorySnapshot.artifact.revision !== repositoryRevision) fail("repository snapshot differs from session revision");
    const covers = (scope, file) => scope === "." || file === scope || file.startsWith(`${scope}/`);
    if (config.sources.some(entry => !repositorySnapshot.artifact.includedPaths.some(scope => covers(scope, entry.path)) ||
        repositorySnapshot.artifact.excludedPaths.some(scope => covers(scope, entry.path)))) fail("source is outside the pinned repository scope");
    if (config.sources.some(entry => !covers(config.sourceRoot, entry.path))) fail("source escapes its declared read scope");
    const adapter = { id: nativeDiscoveryPlugin.metadata.id, version: nativeDiscoveryPlugin.metadata.version, configurationDigest: canonicalJsonDigest(config) };
    const guarded = bindArchitectureDiscoveryInputs({ projectOverview, projectArchitectureState, repositorySnapshot, routeDecision,
      sourceEntries: config.sources.map(({ path }) => ({ path, declared: true })), adapterBindings: [adapter], transmission: { mode: "offline" } });
    const policy = { artifactId: `native-discovery-policy-${adapter.configurationDigest.slice(7)}`, digest: canonicalJsonDigest(guarded) };
    const inventoryInvocation = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "RepositoryInventoryInvocation",
      invocationId: `${invocation.invocationId}:native`, repositorySnapshot: repositorySnapshot.reference,
      allowedPaths: guarded.allowedPaths, policy, adapter }, "invocationFingerprint");
    const files = [];
    for (const entry of config.sources) {
      const bytes = Buffer.from(await readSource(entry.path));
      if (sha256Digest(bytes) !== entry.digest) fail("declared source bytes drifted");
      files.push({ path: entry.path, bytes });
    }
    const controller = createArchitectureDiscoveryCheckpointController({ adapter: exact => createNativeArchitectureInventory({ invocation: exact, files }) });
    const inventory = (await controller.execute({ invocation: inventoryInvocation, checkpoints })).result;
    const normalized = normalizeArchitectureDiscoveryObservations({ snapshotId: `discovery-${invocation.invocationId}`, nativeInventory: inventory });
    const save = async (ref, value) => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(canonicalJson(value));
      if (sha256Digest(bytes) !== ref.digest) fail("output reference does not bind materialized bytes");
      await saveArtifact(ref, bytes);
      return ref;
    };
    const inventoryRef = { ...normalized.snapshot.nativeInventory, digest: canonicalJsonDigest(inventory) };
    inventoryRef.uri = `artifact://native-discovery/${inventoryRef.digest.slice(7)}`;
    await save(inventoryRef, inventory);
    for (const ref of inventory.nativeEvidence) {
      const file = files.find(entry => sha256Digest(entry.bytes) === ref.digest);
      if (!file) fail("native source evidence is unavailable");
      await save(ref, file.bytes);
    }
    for (const observation of normalized.observations) await save(normalized.snapshot.observations.find(ref => ref.artifactId === observation.observationId), observation);
    const materializedSnapshot = seal({ ...normalized.snapshot, nativeInventory: inventoryRef }, "snapshotDigest");
    const decision = evaluateMaterializedArchitectureDiscoveryGapPolicy({ snapshot: materializedSnapshot, observations: normalized.observations, rules: [] });
    validateArchitectureDiscoveryArtifact(decision.snapshot);
    const snapshotRef = { artifactId: decision.snapshot.snapshotId, digest: canonicalJsonDigest(decision.snapshot),
      schema: "https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/snapshot",
      mediaType: "application/vnd.devrelay.current-architecture-snapshot+json", uri: `artifact://native-discovery/${decision.snapshot.snapshotId}` };
    await save(snapshotRef, decision.snapshot);
    return { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: invocation.invocationId,
      status: "completed", outcome: "discovered", outputs: { "current-architecture-snapshot": [snapshotRef] },
      evidence: [{ kind: "architecture-discovery/native-inventory", subject: snapshotRef.artifactId, status: "pass", artifact: inventoryRef }], diagnostics: [] };
  } });
}
