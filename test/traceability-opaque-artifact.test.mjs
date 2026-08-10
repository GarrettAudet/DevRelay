import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const bytes=Buffer.from([0,255,1,2,3]);
const ref={artifactId:"opaque-source",schema:"https://devrelay.dev/evidence/repository-file/v1",mediaType:"application/octet-stream",digest:sha256Digest(bytes),uri:"memory://opaque-source"};
let resolved;
const contributor={
  metadata:{id:"test.opaque",version:"1.0.0"},authority:"candidate",scope:"test/opaque",
  ownership:{authority:"candidate",scope:"test/opaque",nodeKinds:[],edgeKinds:[]},
  match:()=>true,
  async project(context){resolved=await context.resolveArtifact(ref);return{horizon:"requirements",nodes:[],edges:[],reason:"Opaque resolver boundary regression only."};},
};
const context={invocation:{invocationId:"opaque",module:{id:"opaque",version:"1",operation:"observe"}},invocationFingerprint:`sha256:${"a".repeat(64)}`,moduleResult:{invocationId:"opaque",status:"completed",outcome:"observed",outputs:{},evidence:[]}};

test("opaque evidence preserves exact bytes without JSON decoding or semantic value injection",async()=>{
  const service=createTraceabilityGraphService({graphId:"opaque",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[contributor]});
  await service.prepare({...context,baseGraph:service.captureBase(),resolveArtifact:async exact=>{assert.deepEqual(exact,ref);return{ref,bytes};},resolvedArtifacts:[{ref}]});
  assert.deepEqual(Buffer.from(resolved.bytes),bytes);
  assert.deepEqual(resolved.value,{artifactId:ref.artifactId,digest:ref.digest,mediaType:ref.mediaType,opaque:true});
});

test("opaque evidence rejects a caller-supplied decoded value",async()=>{
  const service=createTraceabilityGraphService({graphId:"opaque-value",projectId:"devrelay",store:createInMemoryTraceabilityStore(),contributors:[contributor]});
  await assert.rejects(service.prepare({...context,baseGraph:service.captureBase(),resolveArtifact:async()=>({ref,bytes,value:{trusted:false}}),resolvedArtifacts:[{ref}]}),error=>error.code==="TG_OPAQUE_VALUE_FORBIDDEN");
});
