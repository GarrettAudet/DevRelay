import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { selectArchitectureDiscoveryRoute } from "../src/architecture-discovery-routing.mjs";
import { bindArchitectureDiscoveryInputs } from "../src/architecture-discovery-input-guard.mjs";
import { createNativeArchitectureInventory } from "../src/architecture-discovery-native-inventory.mjs";
import { createArchitectureDiscoveryCheckpointController } from "../src/architecture-discovery-checkpoint.mjs";
import { normalizeArchitectureDiscoveryObservations } from "../src/architecture-discovery-observation-normalizer.mjs";
import { evaluateArchitectureDiscoveryGapPolicy } from "../src/architecture-discovery-gap-policy.mjs";
import { architectureDiscoveryTraceabilityContributor } from "../src/architecture-discovery-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const root = new URL("../", import.meta.url);
const fullRef = (artifactId, digest, schema="https://devrelay.dev/test/v1") => ({artifactId,digest,schema,mediaType:"application/json",uri:`artifact://release/${artifactId}`});
const loaded = (value, artifactId) => { const bytes=Buffer.from(canonicalJson(value)); return {value,bytes,ref:fullRef(artifactId,sha256Digest(bytes))}; };
const seal = (body, field) => ({...body,[field]:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key])=>!["apiVersion","kind",field].includes(key))))});

test("the pinned DevRelay repository completes the offline discovery circuit and safely reaches ArchitectureDesign", async () => {
  const repositoryValue=JSON.parse(await readFile(new URL("dogfood/architecture-discovery/repository-snapshot.json",root),"utf8"));
  const repository=loaded(repositoryValue,"repository-snapshot-devrelay-ad");
  const overviewValue=JSON.parse(await readFile(new URL("project/project-overview-baseline.json",root),"utf8"));
  const overview=loaded(overviewValue,overviewValue.baselineId);
  const stateValue={apiVersion:"devrelay.dev/v1alpha1",kind:"ProjectArchitectureState",stateId:"AD-RELEASE-STATE",projectLifecycle:"existing",state:"existing-undiscovered",projectContext:fullRef("project-context",`sha256:${"1".repeat(64)}`),requirementsBaseline:fullRef("requirements-baseline",`sha256:${"2".repeat(64)}`),projectOverviewBaseline:overview.ref,repositorySnapshot:repository.ref};
  const state=loaded(stateValue,stateValue.stateId);
  const route=selectArchitectureDiscoveryRoute({projectArchitectureState:state.value,projectArchitectureStateRef:state.ref,projectArchitectureStateBytes:state.bytes});
  assert.deepEqual(route.selection,{kind:"operation",operation:"discover"});

  const paths=["package.json","src/architecture-discovery-routing.mjs","src/architecture-discovery-native-inventory.mjs"];
  const files=await Promise.all(paths.map(async path=>({path,bytes:await readFile(new URL(path,root))})));
  const adapter={id:"native-architecture-discovery",version:"0.1.0",configurationDigest:canonicalJsonDigest({offline:true})};
  const asBinding=entry=>({artifact:entry.value,rawBytes:entry.bytes,reference:entry.ref});
  const guarded=bindArchitectureDiscoveryInputs({projectOverview:asBinding(overview),projectArchitectureState:asBinding(state),repositorySnapshot:asBinding(repository),routeDecision:route,sourceEntries:paths.map(path=>({path,tracked:true})),adapterBindings:[adapter],transmission:{mode:"offline"}});
  assert.deepEqual(guarded.allowedPaths,[...paths].sort());
  assert.equal(JSON.stringify(guarded).includes("sourceContent"),false);

  const invocation=seal({apiVersion:"devrelay.dev/v1alpha1",kind:"RepositoryInventoryInvocation",invocationId:"AD-RELEASE-INVENTORY-001",repositorySnapshot:repository.ref,allowedPaths:guarded.allowedPaths,policy:fullRef("AD-OFFLINE-PRIVACY",canonicalJsonDigest({mode:"offline"})),adapter},"invocationFingerprint");
  let calls=0; const values=new Map();
  const checkpoints={get:key=>values.get(key),put:(key,value)=>{assert.equal(values.has(key),false);values.set(key,structuredClone(value));}};
  const controller=createArchitectureDiscoveryCheckpointController({adapter:async exact=>{calls++;return createNativeArchitectureInventory({invocation:exact,files});}});
  const first=await controller.execute({invocation,checkpoints});
  const replay=await controller.execute({invocation,checkpoints});
  assert.equal(calls,1); assert.equal(replay.replayed,true); assert.deepEqual(replay.nativeBytes,first.nativeBytes);

  const normalized=normalizeArchitectureDiscoveryObservations({snapshotId:"AD-RELEASE-SNAPSHOT-001",nativeInventory:first.result});
  const policySnapshot={...normalized.snapshot,observations:normalized.observations.map(value=>({...normalized.snapshot.observations.find(ref=>ref.artifactId===value.observationId),digest:value.observationDigest}))};
  delete policySnapshot.snapshotDigest;
  policySnapshot.snapshotDigest=canonicalJsonDigest(Object.fromEntries(Object.entries(policySnapshot).filter(([key])=>!["apiVersion","kind","snapshotDigest"].includes(key))));
  const decision=evaluateArchitectureDiscoveryGapPolicy({snapshot:policySnapshot,observations:normalized.observations,rules:[]});
  assert.equal(decision.outcome,"discovered"); assert.equal(decision.snapshot.authority,"observational");
  const snapshot=loaded(normalized.snapshot,normalized.snapshot.snapshotId);
  const inventory=loaded(first.result,normalized.snapshot.nativeInventory.artifactId);
  inventory.ref=normalized.snapshot.nativeInventory;
  const observations=normalized.observations.map(value=>{const entry=loaded(value,value.observationId);entry.ref=normalized.snapshot.observations.find(ref=>ref.artifactId===value.observationId);return entry;});
  const sourceEvidence=first.result.nativeEvidence.map(ref=>({ref,bytes:files.find(file=>sha256Digest(file.bytes)===ref.digest).bytes}));
  const artifacts=new Map([[`${repository.ref.artifactId}:${repository.ref.digest}`,repository],[`${inventory.ref.artifactId}:${inventory.ref.digest}`,inventory],...observations.map(value=>[`${value.ref.artifactId}:${value.ref.digest}`,value]),...sourceEvidence.map(value=>[`${value.ref.artifactId}:${value.ref.digest}`,value])]);
  const graph=createTraceabilityGraphService({graphId:"ad-release",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[architectureDiscoveryTraceabilityContributor]});
  const moduleInvocation={invocationId:"AD-RELEASE-001",module:{id:"architecture-discovery",version:"0.1.0",operation:"discover"}};
  const prepared=await graph.prepare({baseGraph:graph.captureBase(),invocation:moduleInvocation,invocationFingerprint:canonicalJsonDigest(moduleInvocation),moduleResult:{invocationId:moduleInvocation.invocationId,status:"completed",outcome:"discovered",outputs:{"current-architecture-snapshot":[snapshot.ref]},evidence:[]},loadedOutputs:{"current-architecture-snapshot":[snapshot]},resolveArtifact:async ref=>artifacts.get(`${ref.artifactId}:${ref.digest}`)});
  const merged=await graph.mergePrepared(prepared); const graphReplay=await graph.mergePrepared(prepared);
  assert.equal(merged.receipt.disposition,"merged"); assert.deepEqual(graphReplay.receipt,merged.receipt);
  assert.ok(merged.snapshot.edges.length>0); assert.equal(merged.snapshot.edges.every(edge=>edge.authority==="candidate"),true);

  const progressedState={...state.value,state:"existing-discovered-unbaselined",currentArchitectureSnapshot:snapshot.ref};
  const progressed=loaded(progressedState,progressedState.stateId);
  assert.deepEqual(selectArchitectureDiscoveryRoute({projectArchitectureState:progressed.value,projectArchitectureStateRef:progressed.ref,projectArchitectureStateBytes:progressed.bytes}).selection,{kind:"bypass"});
  assert.equal("architectureBaseline" in decision.snapshot,false);
  assert.equal("architectureProposal" in decision.snapshot,false);
});
