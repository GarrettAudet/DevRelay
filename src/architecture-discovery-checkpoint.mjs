import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

const PREFIX = "architecture-discovery/checkpoints";
export class ArchitectureDiscoveryCheckpointError extends Error {
  constructor(message, code = "DR4316") { super(`architecture discovery checkpoint failed: ${message}`); this.name="ArchitectureDiscoveryCheckpointError"; this.code=code; }
}
const fail = (message, code) => { throw new ArchitectureDiscoveryCheckpointError(message, code); };
const immutable = (value) => { const copy=structuredClone(value); const freeze=(entry)=>{ if(entry&&typeof entry==="object"&&!ArrayBuffer.isView(entry)&&!Object.isFrozen(entry)){for(const child of Object.values(entry))freeze(child);Object.freeze(entry)} return entry }; return freeze(copy) };
const sameAdapter = (a,b) => a?.id===b?.id && a?.version===b?.version && a?.configurationDigest===b?.configurationDigest;
const checkpointKey = (invocationId, step) => `${PREFIX}/${encodeURIComponent(invocationId)}/${step}`;

function requireStore(store) { if (!store || typeof store.get!=="function" || typeof store.put!=="function") fail("checkpoint store must provide immutable get and put operations", "DR4317"); }
function stepFor(invocation) { if (invocation?.kind==="RepositoryInventoryInvocation") return "inventory"; if (invocation?.kind==="ArchitectureAnalyzerInvocation") return "analyzer"; fail("invocation kind is not checkpointable"); }
function resultField(result) { return result.kind==="NativeRepositoryInventory" ? [result.invocationId, result.inventoryDigest, "native-inventory"] : [result.invocationId, result.resultDigest, "analyzer-result"]; }
function bytesOf(value) { if (Buffer.isBuffer(value)||value instanceof Uint8Array||typeof value==="string") return Buffer.from(value); return Buffer.from(canonicalJson(value),"utf8"); }
function parse(bytes, invocation) { let value; try { value=JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`result bytes are not JSON: ${error.message}`, "DR4318"); } try { validateArchitectureDiscoveryArtifact(value,{invocation}); } catch(error){ fail(error.message,"DR4318") } return value; }

function validateEnvelope(value, invocation, step) {
  if (!value || value.apiVersion!=="devrelay.dev/v1alpha1" || value.kind!=="ArchitectureDiscoveryCheckpointEntry") fail("stored checkpoint entry is malformed", "DR4319");
  if (value.entryDigest!==canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key])=>key!=="entryDigest")))) fail("stored checkpoint entry digest is invalid", "DR4319");
  const expected=canonicalJsonDigest({invocationId:invocation.invocationId,invocationFingerprint:invocation.invocationFingerprint,repositorySnapshot:invocation.repositorySnapshot,step,adapter:invocation.adapter});
  if (value.identityDigest!==expected) fail("checkpoint identity is bound to different inputs", "DR4320");
  try { validateArchitectureDiscoveryArtifact(value.checkpoint,{invocation}); } catch(error){ fail(error.message,"DR4319") }
  const bytes=Buffer.from(value.resultBytesBase64,"base64");
  if (sha256Digest(bytes)!==value.resultBytesDigest) fail("stored result bytes do not match their digest", "DR4319");
  const result=parse(bytes,invocation);
  if (value.checkpoint.result.digest!==(result.inventoryDigest??result.resultDigest)) fail("checkpoint substitutes its exact result", "DR4319");
  return {bytes,result};
}

export function createArchitectureDiscoveryCheckpointController({ adapter } = {}) {
  if (typeof adapter!=="function") fail("a callable adapter is required");
  async function execute({ invocation, checkpoints } = {}) {
    try { validateArchitectureDiscoveryArtifact(invocation); } catch(error){ fail(error.message) }
    requireStore(checkpoints);
    const step=stepFor(invocation), key=checkpointKey(invocation.invocationId,step);
    let loaded; try { loaded=await checkpoints.get(key) } catch(error){ fail(`checkpoint read failed: ${error.message}`,"DR4317") }
    if (loaded!==undefined&&loaded!==null) {
      const replay=validateEnvelope(immutable(loaded),invocation,step);
      return immutable({replayed:true,adapterCalls:0,checkpointKey:key,checkpoint:loaded.checkpoint,checkpointDigest:loaded.checkpoint.checkpointDigest,nativeBytes:replay.bytes,result:replay.result});
    }
    const returned=await adapter(immutable(invocation));
    const bytes=bytesOf(returned), result=parse(bytes,invocation);
    const [resultId,resultDigest,resultKind]=resultField(result);
    const resultRef={artifactId:`architecture-discovery-${resultKind}-${resultId}`,digest:resultDigest};
    const body={apiVersion:"devrelay.dev/v1alpha1",kind:"ArchitectureDiscoveryCheckpoint",checkpointId:`${invocation.invocationId}:${step}:durable`,invocationId:invocation.invocationId,invocationFingerprint:invocation.invocationFingerprint,repositorySnapshot:structuredClone(invocation.repositorySnapshot),step,adapter:structuredClone(invocation.adapter),result:resultRef,state:"durable"};
    const checkpoint={...body,checkpointDigest:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([name])=>!["apiVersion","kind"].includes(name))))};
    try { validateArchitectureDiscoveryArtifact(checkpoint,{invocation}); } catch(error){ fail(error.message) }
    const identityDigest=canonicalJsonDigest({invocationId:invocation.invocationId,invocationFingerprint:invocation.invocationFingerprint,repositorySnapshot:invocation.repositorySnapshot,step,adapter:invocation.adapter});
    const envelopeBody={apiVersion:"devrelay.dev/v1alpha1",kind:"ArchitectureDiscoveryCheckpointEntry",identityDigest,checkpoint,resultBytesDigest:sha256Digest(bytes),resultBytesBase64:bytes.toString("base64")};
    const envelope=immutable({...envelopeBody,entryDigest:canonicalJsonDigest(envelopeBody)});
    try { await checkpoints.put(key,envelope) } catch(error){ fail(`immutable checkpoint write failed: ${error.message}`,"DR4317") }
    return immutable({replayed:false,adapterCalls:1,checkpointKey:key,checkpoint,checkpointDigest:checkpoint.checkpointDigest,nativeBytes:bytes,result});
  }
  return Object.freeze({execute});
}

export { checkpointKey as architectureDiscoveryCheckpointKey };
