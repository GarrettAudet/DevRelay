import assert from "node:assert/strict";
import test from "node:test";
import { createProviderExecutionAttestation } from "../src/provider-execution-attestation.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  evaluateRunComparability,
  ingestRunHostObservation,
  ingestRunHostObservations,
  resolveAdapterMaturity
} from "../src/lifecycle-run-report-observations.mjs";

const d = char => `sha256:${char.repeat(64)}`;
const source = char => ({kind:"host-observation",artifact:{artifactId:`observation-${char}`,digest:d(char)}});
const adapter = {id:"adapter-a",version:"1.0.0",configurationDigest:d("a")};
const comparabilityUnavailable = {disposition:"unavailable",reason:"No comparison run was supplied."};
const dimensions = char => Object.fromEntries(["module","operation","inputs","policy","circuit","host"].map(name => [name,d(char)]));

test("ingests complete and partial metric sets with exact availability dispositions", () => {
  const observations = ingestRunHostObservations([
    {observationId:"duration",runId:"run-1",metric:{name:"duration",availability:"measured",value:10,unit:"milliseconds",provenance:source("a")}},
    {observationId:"calls",runId:"run-1",metric:{name:"adapter-calls",availability:"estimated",value:2,unit:"count",provenance:source("b")}},
    {observationId:"tokens",runId:"run-1",metric:{name:"tokens",availability:"unavailable",absenceReason:"Host did not report tokens."}},
    {observationId:"cost",runId:"run-1",metric:{name:"cost",availability:"not-applicable",absenceReason:"The configured adapter has no monetary charge."}},
    {observationId:"wait",runId:"run-1",metric:{name:"human-wait",availability:"measured",value:3,unit:"milliseconds",provenance:source("c")}},
    {observationId:"retry",runId:"run-1",metric:{name:"retries",availability:"measured",value:0,unit:"count",provenance:source("d")}},
    {observationId:"checkpoint",runId:"run-1",metric:{name:"checkpoint-hits",availability:"measured",value:1,unit:"count",provenance:source("e")}}
  ]);
  assert.deepEqual(observations.map(value => value.metric.availability), ["measured","estimated","unavailable","not-applicable","measured","measured","measured"]);
  assert.ok(observations.every(value => value.authority === "non-authoritative-observation"));
  assert.ok(observations.every(value => value.observationDigest.startsWith("sha256:")));
});

test("absence is never inferred as zero and measured or estimated values retain provenance", () => {
  assert.throws(() => ingestRunHostObservation({observationId:"missing",runId:"run-1",metric:{name:"tokens",availability:"unavailable",value:0,unit:"tokens",absenceReason:"Missing."}}), /absence cannot carry/);
  assert.throws(() => ingestRunHostObservation({observationId:"estimated",runId:"run-1",metric:{name:"cost",availability:"estimated",value:12,unit:"currency-minor-units"}}), /requires exact provenance/);
});

test("resolves only evidence-backed maturity for the exact adapter binding", () => {
  const evidence = [
    {adapter,maturity:"contract-defined",artifact:{artifactId:"contract",digest:d("b")}},
    {adapter,maturity:"fixture-conformant",artifact:{artifactId:"fixtures",digest:d("c")}}
  ];
  const resolved = resolveAdapterMaturity({adapter,evidence,comparability:comparabilityUnavailable});
  assert.equal(resolved.assessment.maturity,"fixture-conformant");
  assert.deepEqual(resolved.evidence,evidence.map(value => value.artifact));
  assert.throws(() => resolveAdapterMaturity({adapter,evidence:[{adapter:{...adapter,version:"2.0.0"},maturity:"live-conformant",artifact:{artifactId:"live",digest:d("d")}}],comparability:comparabilityUnavailable}), /does not match/);
  assert.throws(() => resolveAdapterMaturity({adapter,evidence:[{adapter,maturity:"implemented",artifact:{artifactId:"claim",digest:d("e")}}],comparability:comparabilityUnavailable}), /unsupported/);
});

test("comparison is deterministic for reordered source dimensions", () => {
  const left = dimensions("a");
  const right = Object.fromEntries(Object.entries(dimensions("a")).reverse());
  const decision = evaluateRunComparability({decisionId:"comparison-1",leftRunId:"run-1",rightRunId:"run-2",left,right});
  assert.equal(decision.disposition,"comparable");
  assert.deepEqual(decision.dimensions.map(value => value.name), ["module","operation","inputs","policy","circuit","host"]);
  assert.deepEqual(decision.reasons,[]);
});

test("any exact dimension mismatch is explicitly non-comparable", () => {
  const left = dimensions("a");
  const right = {...dimensions("a"),host:d("b"),policy:d("c")};
  const decision = evaluateRunComparability({decisionId:"comparison-2",leftRunId:"run-1",rightRunId:"run-2",left,right});
  assert.equal(decision.disposition,"not-comparable");
  assert.deepEqual(decision.reasons,["policy digest differs","host digest differs"]);
});


test("live maturity requires the exact trusted provider execution attestation",()=>{
  const observer={id:"desktop-host",version:"1.0.0",configurationDigest:canonicalJsonDigest("observer"),authority:"host-trusted-observer"};
  const request={artifactId:"request-live",digest:canonicalJsonDigest("request-live")};
  const attestation=createProviderExecutionAttestation({attestationId:"live-attestation",binding:adapter,capability:"requirements.gather",request,tool:{name:"OpenSpec",version:"1.0.0"},command:{executable:"openspec",arguments:["requirements.gather"],workingDirectoryDigest:canonicalJsonDigest("cwd")},execution:{startedAt:"2026-08-13T10:00:00.000Z",completedAt:"2026-08-13T10:00:01.000Z",exitCode:0,stdoutDigest:canonicalJsonDigest("stdout"),stderrDigest:canonicalJsonDigest("stderr")},nativeArtifacts:[{artifactId:"proposal.md",digest:canonicalJsonDigest("proposal")}],observer});
  const evidence={adapter,maturity:"live-conformant",artifact:{artifactId:attestation.attestationId,digest:attestation.attestationDigest},attestation};
  assert.equal(resolveAdapterMaturity({adapter,evidence:[evidence],comparability:comparabilityUnavailable,trustedObservers:[observer]}).assessment.maturity,"live-conformant");
  assert.throws(()=>resolveAdapterMaturity({adapter,evidence:[evidence],comparability:comparabilityUnavailable}),/not in the Core\/host trust configuration/);
  const claim=structuredClone(evidence);delete claim.attestation;
  assert.throws(()=>resolveAdapterMaturity({adapter,evidence:[claim],comparability:comparabilityUnavailable,trustedObservers:[observer]}),/trusted provider execution attestation/);
});
