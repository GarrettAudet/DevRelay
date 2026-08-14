import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const API="devrelay.dev/v1alpha1";
const KIND="ProviderExecutionAttestation";
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const MATURITY=new Set(["live-conformant","release-ready"]);
const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join("\0")===[...keys].sort().join("\0");
const same=(left,right)=>canonicalJson(left)===canonicalJson(right);
const clone=value=>structuredClone(value);

export class ProviderExecutionAttestationError extends Error {
  constructor(message){super(`provider execution attestation is invalid: ${message}`);this.name="ProviderExecutionAttestationError";this.code="DR4440";}
}
const fail=message=>{throw new ProviderExecutionAttestationError(message);};
const ref=value=>value&&exactKeys(value,["artifactId","digest"])&&typeof value.artifactId==="string"&&value.artifactId&&DIGEST.test(value.digest);
const binding=value=>value&&exactKeys(value,["id","version","configurationDigest"])&&typeof value.id==="string"&&value.id&&typeof value.version==="string"&&value.version&&DIGEST.test(value.configurationDigest);
const observer=value=>value&&exactKeys(value,["id","version","configurationDigest","authority"])&&value.authority==="host-trusted-observer"&&typeof value.id==="string"&&value.id&&typeof value.version==="string"&&value.version&&DIGEST.test(value.configurationDigest);
const material=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!["apiVersion","kind","attestationDigest"].includes(key)));

export function validateProviderExecutionAttestation(value,{expectedBinding,expectedObserver,expectedRequest}={}){
  const keys=["apiVersion","kind","attestationId","binding","capability","request","tool","command","execution","nativeArtifacts","observer","maturity","authority","attestationDigest"];
  if(!exactKeys(value,keys)||value.apiVersion!==API||value.kind!==KIND) fail("envelope drifted");
  if(typeof value.attestationId!=="string"||!value.attestationId) fail("attestationId is required");
  if(!binding(value.binding)) fail("exact adapter binding is required");
  if(typeof value.capability!=="string"||!value.capability) fail("capability is required");
  if(!ref(value.request)) fail("exact request reference is required");
  if(!exactKeys(value.tool,["name","version"])||!value.tool.name||!value.tool.version) fail("exact tool identity is required");
  if(!exactKeys(value.command,["executable","arguments","workingDirectoryDigest"])||!value.command.executable||!Array.isArray(value.command.arguments)||!DIGEST.test(value.command.workingDirectoryDigest)||value.command.arguments.some(argument=>typeof argument!=="string")) fail("exact observed command is required");
  if(!exactKeys(value.execution,["startedAt","completedAt","exitCode","stdoutDigest","stderrDigest"])||!Number.isInteger(value.execution.exitCode)||value.execution.exitCode!==0||!DIGEST.test(value.execution.stdoutDigest)||!DIGEST.test(value.execution.stderrDigest)||!Number.isFinite(Date.parse(value.execution.startedAt))||!Number.isFinite(Date.parse(value.execution.completedAt))||Date.parse(value.execution.completedAt)<Date.parse(value.execution.startedAt)) fail("successful exact execution observation is required");
  if(!Array.isArray(value.nativeArtifacts)||value.nativeArtifacts.length===0||value.nativeArtifacts.some(item=>!ref(item))) fail("at least one exact native artifact is required");
  if(!observer(value.observer)) fail("host-trusted observer identity is required");
  if(!MATURITY.has(value.maturity)) fail("attestation maturity must be live-conformant or release-ready");
  if(value.authority!=="host-observed-execution") fail("provider-authored authority is forbidden");
  if(value.attestationDigest!==canonicalJsonDigest(material(value))) fail("attestation digest drifted");
  if(expectedBinding&&!same(value.binding,expectedBinding)) fail("adapter binding does not match the trusted expectation");
  if(expectedObserver&&!same(value.observer,expectedObserver)) fail("observer does not match the trusted host configuration");
  if(expectedRequest&&!same(value.request,expectedRequest)) fail("request does not match the trusted invocation");
  return value;
}

export function createProviderExecutionAttestation(input={}){
  const body={
    attestationId:input.attestationId,
    binding:clone(input.binding),
    capability:input.capability,
    request:clone(input.request),
    tool:clone(input.tool),
    command:clone(input.command),
    execution:clone(input.execution),
    nativeArtifacts:clone(input.nativeArtifacts),
    observer:clone(input.observer),
    maturity:input.maturity??"live-conformant",
    authority:"host-observed-execution",
  };
  const result={apiVersion:API,kind:KIND,...body,attestationDigest:canonicalJsonDigest(body)};
  validateProviderExecutionAttestation(result,{expectedBinding:input.binding,expectedObserver:input.observer,expectedRequest:input.request});
  return Object.freeze(result);
}
