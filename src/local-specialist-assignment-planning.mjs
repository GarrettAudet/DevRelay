import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { verifyLocalDependencyBaselineActivation, assertLocalDependencyBaselineCurrent } from "./local-dependency-baseline-activation.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";
import { selectAssignmentRepositoryBinding } from "./specialist-assignment-repository-binding.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-specialist-assignment-inputs.schema.json"), [read("module-result.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`assignment planning: ${message}`); };

// The released assignment module declares a fixed operation, not a state-based
// route. This binds its inputs only: no ranker, scheduling, dispatch or approval.
async function derive({ specialistCatalog, assignmentPolicy, ...request }, current) {
  const activation = await verifyLocalDependencyBaselineActivation(request);
  const workRef = request.record.baseline.ref;
  if (current) {
    assertLocalDependencyBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: activation.baseline });
    assertLocalWorkBaselineCurrent({ storage: request.storage, namespace: request.namespace, baseline: workRef });
    assertLocalWorkContextCurrent({ storage: request.storage, namespace: request.namespace, boundary: request.boundary,
      state: request.checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref });
  }
  if (!specialistCatalog || !assignmentPolicy) fail("explicit specialist catalog and assignment policy are required");
  const load = ref => loadArtifactContent(ref, { load: request.loadArtifact });
  const work = await load(workRef);
  const dependency = await load(activation.baseline);
  if (!same(dependency.value.workBreakdownBaseline, workRef)) fail("dependency baseline changes the approved work lineage");
  const inputs = { "work-breakdown-baseline": workRef, "work-dependency-baseline": activation.baseline };
  for (const role of ["project-overview-baseline", "capability-catalog"]) {
    const bindings = work.value.inputBindings.filter(entry => entry.role === role);
    const prior = request.checkpointReplay.loadedInputs[role];
    if (bindings.length !== 1 || prior?.length !== 1 || !same(bindings[0].artifact, prior[0].ref)) fail(`approved ${role} lineage differs`);
    inputs[role] = bindings[0].artifact;
  }
  const repositoryBinding = selectAssignmentRepositoryBinding(work.value);
  const priorRepository = request.checkpointReplay.loadedInputs[repositoryBinding.role];
  if (priorRepository?.length !== 1 || !same(repositoryBinding.artifact, priorRepository[0].ref)) {
    fail("approved repository lineage differs");
  }
  if (repositoryBinding.role === "current-repository-snapshot" && priorRepository[0].value.kind !== "RepositorySnapshot") {
    fail("existing-project repository binding requires a RepositorySnapshot");
  }
  inputs["repository-context"] = repositoryBinding.artifact;
  inputs["specialist-catalog"] = specialistCatalog;
  inputs["assignment-policy"] = assignmentPolicy;
  const plan = { kind: "LocalSpecialistAssignmentInputs", module: { id: "specialist-assignment", version: "3.0.0" },
    operation: "assign-specialists", dependencyActivationDigest: canonicalJsonDigest(activation), inputs, lifecycleComplete: false };
  if (!validate(plan)) fail("input plan violates its contract");
  const loadedInputs = Object.fromEntries(await Promise.all(Object.entries(inputs).map(async ([role, ref]) => [role, [await load(ref)]])));
  for (const [role, kind, id] of [["specialist-catalog", "SpecialistCatalog", "catalogId"], ["assignment-policy", "AssignmentPolicy", "policyId"]]) {
    const { ref, value } = loadedInputs[role][0];
    if (value.kind !== kind || value[id] !== ref.artifactId || ref.schema !== `https://devrelay.dev/artifacts/${role}/v1` ||
        ref.mediaType !== `application/vnd.devrelay.${role}+json`) fail(`${role} has an incompatible identity or contract`);
  }
  return { plan, loadedInputs };
}

export async function prepareLocalSpecialistAssignmentInputs(request) { return derive(request, true); }

// Exact historical observation does not authorize a new assignment against a
// superseded or pending baseline. Fresh preparation always checks every head.
export async function verifyLocalSpecialistAssignmentInputs({ expectedPlan, ...request }) {
  if (!validate(expectedPlan)) fail("historical input plan violates its contract");
  const result = await derive(request, false);
  if (!same(result.plan, expectedPlan)) fail("historical input plan differs from exact derivation");
  return result;
}
