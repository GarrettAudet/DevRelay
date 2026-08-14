import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createProviderExecutionAttestation,validateProviderExecutionAttestation,ProviderExecutionAttestationError } from "../src/provider-execution-attestation.mjs";

const d=value=>canonicalJsonDigest(value);
const binding={id:"openspec-design",version:"0.2.0",configurationDigest:d("binding")};
const observer={id:"chatgpt-desktop-host",version:"1.0.0",configurationDigest:d("observer"),authority:"host-trusted-observer"};
const request={artifactId:"request-1",digest:d("request")};
const input={attestationId:"attestation-1",binding,capability:"architecture.design-change",request,tool:{name:"OpenSpec",version:"1.0.0"},command:{executable:"openspec",arguments:["design","--change","quality"],workingDirectoryDigest:d("cwd")},execution:{startedAt:"2026-08-13T10:00:00.000Z",completedAt:"2026-08-13T10:00:01.000Z",exitCode:0,stdoutDigest:d("stdout"),stderrDigest:d("stderr")},nativeArtifacts:[{artifactId:"design.md",digest:d("design")}],observer};

test("trusted host creates a content-addressed live-provider attestation",()=>{
  const value=createProviderExecutionAttestation(input);
  assert.equal(value.maturity,"live-conformant");
  assert.equal(validateProviderExecutionAttestation(value,{expectedBinding:binding,expectedObserver:observer,expectedRequest:request}),value);
});

test("provider self-attestation, substitutions, failed execution, and digest drift fail closed",()=>{
  const value=createProviderExecutionAttestation(input);
  const mutations=[
    candidate=>{candidate.authority="provider-self-attested";},
    candidate=>{candidate.execution.exitCode=1;},
    candidate=>{candidate.nativeArtifacts[0].digest=d("substituted");},
    candidate=>{candidate.observer.configurationDigest=d("other-host");},
  ];
  for(const mutate of mutations){const candidate=structuredClone(value);mutate(candidate);assert.throws(()=>validateProviderExecutionAttestation(candidate,{expectedBinding:binding,expectedObserver:observer,expectedRequest:request}),ProviderExecutionAttestationError);}
});
