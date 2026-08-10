import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { selectArchitectureDiscoveryRoute, ArchitectureDiscoveryRoutingError } from "../src/architecture-discovery-routing.mjs";
import { bindArchitectureDiscoveryInputs, ArchitectureDiscoveryInputGuardError } from "../src/architecture-discovery-input-guard.mjs";

const ref = (artifact, bytes) => ({ artifactId:artifact.artifactId ?? artifact.stateId ?? artifact.baselineId ?? artifact.snapshotId, digest:sha256Digest(bytes), schema:"https://devrelay.dev/test/v1", mediaType:"application/json", uri:`artifact://test/${artifact.artifactId ?? artifact.stateId ?? artifact.baselineId ?? artifact.snapshotId}` });
const binding = (artifact) => { const rawBytes=Buffer.from(`${JSON.stringify(artifact)}\n`); return { artifact, rawBytes, reference:ref(artifact, rawBytes) }; };
function state(kind) {
  const pointer=(id,n)=>({artifactId:id,digest:`sha256:${n.repeat(64)}`,schema:"https://devrelay.dev/test/v1",mediaType:"application/json",uri:`artifact://test/${id}`});
  const repository=pointer("repo-snapshot","1");
  const body={ apiVersion:"devrelay.dev/v1alpha1", kind:"ProjectArchitectureState", stateId:`state-${kind}`, projectLifecycle:kind.startsWith("greenfield")?"greenfield":"existing", state:kind, projectContext:pointer("context","9"), requirementsBaseline:pointer("requirements","a"), projectOverviewBaseline:pointer("overview","b") };
  if (kind !== "greenfield-unbaselined") body.repositorySnapshot=repository;
  if (kind === "existing-discovered-unbaselined") body.currentArchitectureSnapshot=pointer("current","2");
  if (kind === "baselined") body.architectureBaseline=pointer("baseline","3");
  return body;
}
function routed(kind, requestedOperation) { const value=state(kind); const raw=Buffer.from(`${JSON.stringify(value)}\n`); return selectArchitectureDiscoveryRoute({ projectArchitectureState:value, projectArchitectureStateRef:ref(value,raw), projectArchitectureStateBytes:raw, requestedOperation }); }

test("Core alone routes only exact existing-undiscovered state", () => {
  assert.deepEqual(routed("existing-undiscovered").selection,{kind:"operation",operation:"discover"});
  for (const kind of ["greenfield-unbaselined","existing-discovered-unbaselined","baselined"]) assert.deepEqual(routed(kind).selection,{kind:"bypass"});
  assert.throws(()=>routed("baselined","discover"),ArchitectureDiscoveryRoutingError);
});
test("routing rejects stale bytes and contradictory approved state", () => {
  const value=state("existing-undiscovered"), raw=Buffer.from(`${JSON.stringify(value)}\n`), stale=structuredClone(value); stale.state="baselined";
  assert.throws(()=>selectArchitectureDiscoveryRoute({projectArchitectureState:stale,projectArchitectureStateRef:ref(value,raw),projectArchitectureStateBytes:raw}),ArchitectureDiscoveryRoutingError);
});
test("privacy guard accepts tracked or declared offline scope", () => {
  const stateBinding=binding(state("existing-undiscovered"));
  const repo=binding({apiVersion:"devrelay.dev/v1alpha1",kind:"RepositorySnapshot",artifactId:"repo-snapshot",revision:"a".repeat(40),treeDigest:`sha256:${"4".repeat(64)}`});
  stateBinding.artifact.repositorySnapshot=repo.reference; stateBinding.rawBytes=Buffer.from(`${JSON.stringify(stateBinding.artifact)}\n`); stateBinding.reference=ref(stateBinding.artifact,stateBinding.rawBytes);
  const overview=binding({apiVersion:"devrelay.dev/v1alpha1",kind:"ProjectOverviewBaseline",artifactId:"overview"});
  const route=selectArchitectureDiscoveryRoute({projectArchitectureState:stateBinding.artifact,projectArchitectureStateRef:stateBinding.reference,projectArchitectureStateBytes:stateBinding.rawBytes});
  const guarded=bindArchitectureDiscoveryInputs({projectOverview:overview,projectArchitectureState:stateBinding,repositorySnapshot:repo,routeDecision:route,sourceEntries:[{path:"src/a.mjs",tracked:true},{path:"docs/declared.md",declared:true}],adapterBindings:[{id:"native",version:"1.0.0",configurationDigest:canonicalJsonDigest({offline:true})}]});
  assert.deepEqual(guarded.allowedPaths,["docs/declared.md","src/a.mjs"]);
  assert.equal(Object.isFrozen(guarded),true);
});
test("privacy guard rejects ignored, secret, broad untracked, and binding drift", () => {
  const stateBinding=binding(state("existing-undiscovered")); const repo=binding({artifactId:"repo-snapshot"}); stateBinding.artifact.repositorySnapshot=repo.reference; stateBinding.rawBytes=Buffer.from(`${JSON.stringify(stateBinding.artifact)}\n`); stateBinding.reference=ref(stateBinding.artifact,stateBinding.rawBytes); const overview=binding({artifactId:"overview"}); const route=selectArchitectureDiscoveryRoute({projectArchitectureState:stateBinding.artifact,projectArchitectureStateRef:stateBinding.reference,projectArchitectureStateBytes:stateBinding.rawBytes});
  const base={projectOverview:overview,projectArchitectureState:stateBinding,repositorySnapshot:repo,routeDecision:route,adapterBindings:[{id:"native",version:"1.0.0",configurationDigest:`sha256:${"5".repeat(64)}`}]};
  for (const source of [{path:"ignored",tracked:true,ignored:true},{path:"secret",tracked:true,secretLike:true},{path:"loose",tracked:false,declared:false}]) assert.throws(()=>bindArchitectureDiscoveryInputs({...base,sourceEntries:[source]}),ArchitectureDiscoveryInputGuardError);
  assert.throws(()=>bindArchitectureDiscoveryInputs({...base,sourceEntries:[{path:"src/a",tracked:true}],transmission:{mode:"external",grant:{explicit:true,sourceContent:true,policyDigest:`sha256:${"6".repeat(64)}`,adapterBindings:[{...base.adapterBindings[0],version:"2.0.0"}]}}}),ArchitectureDiscoveryInputGuardError);
});
test("external source transmission needs exact explicit consent", () => {
  const stateBinding=binding(state("existing-undiscovered")); const repo=binding({artifactId:"repo-snapshot"}); stateBinding.artifact.repositorySnapshot=repo.reference; stateBinding.rawBytes=Buffer.from(`${JSON.stringify(stateBinding.artifact)}\n`); stateBinding.reference=ref(stateBinding.artifact,stateBinding.rawBytes); const overview=binding({artifactId:"overview"}); const route=selectArchitectureDiscoveryRoute({projectArchitectureState:stateBinding.artifact,projectArchitectureStateRef:stateBinding.reference,projectArchitectureStateBytes:stateBinding.rawBytes}); const adapters=[{id:"analyzer",version:"2.1.0",configurationDigest:`sha256:${"7".repeat(64)}`}];
  const result=bindArchitectureDiscoveryInputs({projectOverview:overview,projectArchitectureState:stateBinding,repositorySnapshot:repo,routeDecision:route,sourceEntries:[{path:"src/a",tracked:true}],adapterBindings:adapters,transmission:{mode:"external",grant:{explicit:true,sourceContent:true,policyDigest:`sha256:${"8".repeat(64)}`,adapterBindings:adapters}}});
  assert.equal(result.transmission.mode,"external");
});
