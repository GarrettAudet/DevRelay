import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { validateVerifierBindingSet, WorkItemVerificationVerifierBindingError } from "../src/work-item-verification-verifier-binding.mjs";

const D = `sha256:${"1".repeat(64)}`;
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind"].includes(key)))) });
const base = { apiVersion:"devrelay.dev/v1alpha1" };
const subject = seal({ ...base, kind:"ValidatedVerificationSubject", subjectId:"SUB-1", workItemId:"WI-X", workItem:ref("WI"), executionAttempt:ref("EA"), changeSetDraft:ref("CS"), executionEvidenceBundle:ref("EB"), verificationPolicy:ref("POL"), requirementsBaseline:ref("REQ"), projectOverviewBaseline:ref("PO"), architectureBaseline:ref("ARCH"), contractDisposition:ref("CD"), workBreakdownBaseline:ref("WB"), workDependencyBaseline:ref("WD"), specialistAssignmentBaseline:ref("SA"), repositoryBase:ref("REPO"), candidateWorkspace:ref("WS") }, "subjectDigest");
const obligations = seal({ ...base, kind:"VerificationObligationSet", obligationSetId:"OBS-BINDING", subject:ref(subject.subjectId, subject.subjectDigest), obligations:[
  { obligationId:"OB-REVIEW", kind:"acceptance-criterion", sourceRef:"AC-X", requiredEvidenceKinds:["review"] },
  { obligationId:"OB-TEST", kind:"work-item-plan", sourceRef:"VC-X", requiredEvidenceKinds:["test-log"] },
] }, "obligationSetDigest");
const permission = [{ kind:"process.spawn", values:["node"] }];
const registry = { entries:[
  { verifier:{ id:"verifier.review", version:"1.0.0" }, configurationDigest:D, capabilities:["CAP-REVIEW"], tools:["TOOL-REVIEW"], supportedEvidenceKinds:["review"], permissionDemand:[], identityAliases:["reviewer.one"] },
  { verifier:{ id:"verifier.test", version:"1.2.0" }, configurationDigest:D, capabilities:["CAP-TEST"], tools:["TOOL-NODE"], supportedEvidenceKinds:["test-log"], permissionDemand:permission, identityAliases:["tester.one"] },
] };
const policy = { independenceRequired:true, evidenceKinds:{ review:{ requiredCapabilities:["CAP-REVIEW"], requiredTools:["TOOL-REVIEW"] }, "test-log":{ requiredCapabilities:["CAP-TEST"], requiredTools:["TOOL-NODE"] } } };
const partitions = [
  { verifier:{ id:"verifier.review", version:"1.0.0" }, configurationDigest:D, obligationIds:["OB-REVIEW"], grants:[] },
  { verifier:{ id:"verifier.test", version:"1.2.0" }, configurationDigest:D, obligationIds:["OB-TEST"], grants:permission },
];
const evidence = ref("INDEPENDENCE");
const invoke = (overrides={}) => validateVerifierBindingSet({ bindingId:"BIND-1", subject, obligationSet:obligations, executorIdentity:"executor.one", changeProducerIdentities:["producer.one"], verificationPolicy:policy, verifierRegistry:registry, proposedPartitions:partitions, independenceEvidence:evidence, ...overrides });
const rejects = (overrides, pattern) => assert.throws(() => invoke(overrides), pattern ?? WorkItemVerificationVerifierBindingError);

test("emits one canonical independent binding with exact complete coverage", () => {
  const one = invoke(); const two = invoke();
  assert.deepEqual(one, two);
  assert.equal(one.partitions.length, 2);
  assert.deepEqual(one.partitions.flatMap(({obligationIds}) => obligationIds).sort(), ["OB-REVIEW", "OB-TEST"]);
  assert.deepEqual(one.partitions[1].permissionDemand, permission);
  assert.deepEqual(one.independence, { required:true, satisfied:true, evidence });
});

test("canonical binding output is independent of proposed partition order", () => {
  const canonical = invoke();
  const reordered = invoke({ proposedPartitions:[...partitions].reverse() });
  assert.deepEqual(reordered, canonical);
  assert.equal(reordered.bindingDigest, canonical.bindingDigest);
});

test("overlapping evidence requirements deduplicate shared capabilities and tools", () => {
  const overlapObligations = seal({ ...base, kind:"VerificationObligationSet", obligationSetId:"OBS-OVERLAP", subject:ref(subject.subjectId, subject.subjectDigest), obligations:[{ obligationId:"OB-BOTH", kind:"work-item-plan", sourceRef:"VC-BOTH", requiredEvidenceKinds:["review", "test-log"] }] }, "obligationSetDigest");
  const overlapPolicy = { independenceRequired:true, evidenceKinds:{ review:{ requiredCapabilities:["CAP-SHARED"], requiredTools:["TOOL-SHARED"] }, "test-log":{ requiredCapabilities:["CAP-SHARED"], requiredTools:["TOOL-SHARED"] } } };
  const overlapRegistry = { entries:[{ verifier:{ id:"verifier.combined", version:"1.0.0" }, configurationDigest:D, capabilities:["CAP-SHARED"], tools:["TOOL-SHARED"], supportedEvidenceKinds:["review", "test-log"], permissionDemand:[], identityAliases:[] }] };
  const result = invoke({ obligationSet:overlapObligations, verificationPolicy:overlapPolicy, verifierRegistry:overlapRegistry, proposedPartitions:[{ verifier:{id:"verifier.combined",version:"1.0.0"}, configurationDigest:D, obligationIds:["OB-BOTH"], grants:[] }] });
  assert.deepEqual(result.partitions[0].obligationIds, ["OB-BOTH"]);
  assert.deepEqual(result.obligationSet, ref("OBS-OVERLAP", overlapObligations.obligationSetDigest));
});

test("rejects self-verification and aliased producer conflicts", () => {
  rejects({ executorIdentity:"verifier.test" }, /conflicts with change producer/);
  rejects({ changeProducerIdentities:["tester.one"] }, /conflicts with change producer/);
});

test("rejects stale configuration and substituted verifier identity or version", () => {
  const stale = structuredClone(partitions); stale[0].configurationDigest = `sha256:${"2".repeat(64)}`;
  rejects({ proposedPartitions:stale }, /stale verifier configuration/);
  const substitute = structuredClone(partitions); substitute[0].verifier.id = "verifier.other";
  rejects({ proposedPartitions:substitute }, /substitutes unregistered verifier/);
  const version = structuredClone(partitions); version[1].verifier.version = "2.0.0";
  rejects({ proposedPartitions:version }, /substitutes unregistered verifier/);
});

test("rejects under-capable and missing-tool registry entries", () => {
  const incapable = structuredClone(registry); incapable.entries[1].capabilities = [];
  rejects({ verifierRegistry:incapable }, /missing capability CAP-TEST/);
  const toolLess = structuredClone(registry); toolLess.entries[1].tools = [];
  rejects({ verifierRegistry:toolLess }, /missing tool TOOL-NODE/);
});

test("rejects over-granted, missing-grant, partial, and duplicate coverage", () => {
  const excessive = structuredClone(partitions); excessive[0].grants = [{kind:"network.connect", values:["example.invalid"]}];
  rejects({ proposedPartitions:excessive }, /grants are missing or excessive/);
  const missingGrant = structuredClone(partitions); missingGrant[1].grants = [];
  rejects({ proposedPartitions:missingGrant }, /grants are missing or excessive/);
  rejects({ proposedPartitions:partitions.slice(0, 1) }, /partial obligation coverage/);
  const duplicate = [...structuredClone(partitions), structuredClone(partitions[1])];
  rejects({ proposedPartitions:duplicate }, /duplicate coverage/);
});

test("rejects missing independence proof and unsupported evidence", () => {
  rejects({ independenceEvidence:undefined }, /independence evidence is missing/);
  const unsupported = structuredClone(registry); unsupported.entries[0].supportedEvidenceKinds = [];
  rejects({ verifierRegistry:unsupported }, /cannot produce required evidence kind review/);
});
