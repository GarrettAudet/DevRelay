import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { verifyLocalWorkBaselineActivation, assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { buildWorkBreakdownAnalysisSnapshot } from "./work-dependency-snapshot.mjs";
import { validateWorkDependencyArtifact, WORK_DEPENDENCY_ARTIFACT_CONTRACTS } from "./work-dependency-artifact-validator.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);

// Host composition only: explicit context and policy, no inferred edges,
// adapter invocation, assignment, or approval of a dependency candidate.
async function deriveState({ contextSliceSet, policyBundle, boundary, ...request }, current) {
  const activation = await verifyLocalWorkBaselineActivation(request);
  if (current) {
    assertLocalWorkBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: activation.baseline });
    assertLocalWorkContextCurrent({ storage: request.storage, namespace: request.namespace, boundary,
      state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
  }
  if (!contextSliceSet || !policyBundle) throw new TypeError("dependency planning requires explicit context slices and policy bundle");
  const load = ref => loadArtifactContent(ref, { load: request.loadArtifact });
  const workBreakdown = await load(activation.baseline);
  const overviewRef = request.checkpointReplay.loadedInputs["project-overview-baseline"][0].ref;
  const overviewBinding = workBreakdown.value.inputBindings.filter(entry => entry.role === "project-overview-baseline");
  if (overviewBinding.length !== 1 || !same(overviewBinding[0].artifact, overviewRef)) throw new TypeError("dependency planning changes the approved project overview");
  const projectOverview = await load(overviewRef);
  const slices = await load(contextSliceSet);
  const policy = await load(policyBundle);
  for (const [loaded, kind] of [[slices, "ContextSliceSet"], [policy, "OpaPolicyBundle"]]) {
    validateWorkDependencyArtifact(loaded.value, { ref: loaded.ref });
    if (loaded.value.kind !== kind) throw new TypeError(`dependency planning expected ${kind}`);
  }
  await loadArtifactBytes(policy.value.wasm, { load: request.loadArtifact });
  const snapshot = await buildWorkBreakdownAnalysisSnapshot({ workBreakdown, projectOverview, contextSliceSet: slices, resolveArtifact: load });
  validateWorkDependencyArtifact(snapshot);
  const binding = { workBreakdownBaseline: activation.baseline, projectOverviewBaseline: overviewRef, contextSliceSet, policyBundle };
  const value = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectWorkDependencyState",
    stateId: `PWDS-${canonicalJsonDigest({ activation, binding }).slice(7).toUpperCase()}`, state: "ready", ...binding };
  validateWorkDependencyArtifact(value);
  const bytes = Buffer.from(canonicalJson(value));
  const ref = { artifactId: value.stateId, ...WORK_DEPENDENCY_ARTIFACT_CONTRACTS.ProjectWorkDependencyState,
    digest: sha256Digest(bytes), uri: `artifact://work-dependency-planning/${value.stateId}` };
  return { ref, bytes, snapshot, activation };
}

export async function prepareLocalWorkDependencyState(request) { return deriveState(request, true); }

async function deriveRoute({ registry, ...request }, current) {
  const state = await deriveState(request, current);
  const route = await registry.selectOperation({ id: "work-dependency-analysis", version: "0.1.0" }, state.ref,
    { artifacts: { load: ref => same(ref, state.ref) ? state.bytes : request.loadArtifact(ref) } });
  if (route.selection.kind !== "operation" || route.selection.operation !== "analyze-dependencies") throw new TypeError("dependency state did not select dependency analysis");
  return { state, route };
}

export async function prepareLocalWorkDependencyRoute(request) { return deriveRoute(request, true); }

// Observation only: exact rederivation does not bypass current-head guards on
// any fresh preparation or invocation, even when historical proof remains valid.
export async function verifyLocalWorkDependencyRoute({ expectedState, ...request }) {
  const result = await deriveRoute(request, false);
  if (!expectedState || !same(result.state.ref, expectedState.ref) ||
      !result.state.bytes.equals(Buffer.from(expectedState.bytes))) throw new TypeError("historical dependency state differs from exact derivation");
  return result;
}
