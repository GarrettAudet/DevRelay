import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest } from '../../../../src/content-digest.mjs';

// Construction-only, read-only validation. This is not a ContractGate or a
// native-execution attestation; semantic runtime checks remain mandatory.
const directory = import.meta.dirname;
const root = path.resolve(directory, '../../../..');
const cycle = path.resolve(directory, '../..');
const MAX_BYTES = 2 * 1024 * 1024;
function bytes(filename) {
  assert.ok(statSync(filename).size <= MAX_BYTES, `input exceeds ${MAX_BYTES} bytes: ${filename}`);
  return readFileSync(filename);
}
const json = filename => JSON.parse(bytes(filename));
const proposal = json(path.join(directory, 'proposal.json'));
const fixtures = json(path.join(directory, 'fixtures.json'));
const priorBytes = bytes(path.join(cycle, 'composition/preflight/approved-contract.json'));
const prior = JSON.parse(priorBytes);
const schema = proposal.schema;

assert.equal(proposal.kind, 'CompositionContractAmendmentProposal');
assert.equal(proposal.status, 'candidate');
assert.equal(proposal.authority, 'candidate-only');
assert.equal(proposal.interfaceIntentId, 'IF-MES-COMPOSITION');
assert.equal(proposal.priorSchemaDigest, 'sha256:dd21401b933fbfb2e76f4a5b1bee7fb5f9debaaa335febc2a2eeb374baf28b99');
assert.equal(sha256Digest(priorBytes), proposal.priorSchemaDigest);
assert.equal(proposal.priorSchema.digest, proposal.priorSchemaDigest);
assert.equal(proposal.schemaIdentity, 'https://devrelay.dev/generated/if-mes-composition/v2');
assert.equal(proposal.schemaVersion, '2.0.0');
assert.equal(proposal.compatibility.approved, false);
assert.equal(proposal.compatibility.decisionAuthority, 'ContractGate');
assert.equal(schema.$id, proposal.schemaIdentity);
assert.equal(sha256Digest(Buffer.from(canonicalJson(schema))), proposal.schemaDigest);

const baselinePath = path.join(root, 'project/contract-baseline.json');
const baselineBytes = bytes(baselinePath);
const baseline = JSON.parse(baselineBytes);
assert.equal(proposal.priorContractBaseline.artifactId, baseline.baselineId);
assert.equal(proposal.priorContractBaselineVersion, baseline.version);
assert.equal(proposal.priorContractBaseline.digest, sha256Digest(baselineBytes));
assert.equal(path.resolve(fileURLToPath(proposal.priorContractBaseline.uri)), baselinePath);
assert.deepEqual(proposal.architectureBaseline, baseline.architectureBaseline);
assert.equal(proposal.architectureDigest, baseline.architectureBaseline.digest);
assert.equal(proposal.architectureDigest, sha256Digest(bytes(path.join(root, 'project/architecture-baseline.json'))));
const boundContract = baseline.contracts.find(entry => entry.interfaceIntentId === proposal.interfaceIntentId);
assert.ok(boundContract, 'current baseline must own IF-MES-COMPOSITION');
assert.deepEqual(proposal.priorSchema, boundContract.artifact);
assert.equal(boundContract.contentDigest, proposal.priorSchemaDigest);

// A structural inclusion proof complements the finite examples: the complete
// prior selection is an unchanged union branch, with all referenced definitions
// unchanged. No existing root rule is narrowed.
const rootValidation = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['$id', '$defs', 'title', 'description'].includes(key)));
assert.deepEqual(rootValidation(schema), rootValidation(prior));
assert.deepEqual(Object.keys(schema.$defs).sort(), [...Object.keys(prior.$defs), 'AgentSlotSelection', 'NativeSlotSelection'].sort());
for (const [name, definition] of Object.entries(prior.$defs)) {
  if (name !== 'SlotSelection') assert.deepEqual(schema.$defs[name], definition, `existing definition ${name} changed`);
}
assert.deepEqual(schema.$defs.AgentSlotSelection, prior.$defs.SlotSelection);
assert.deepEqual(schema.$defs.SlotSelection, { oneOf: [{ $ref: '#/$defs/AgentSlotSelection' }, { $ref: '#/$defs/NativeSlotSelection' }] });
const expectedNative = structuredClone(prior.$defs.SlotSelection);
expectedNative.properties.agents = { type: 'array', maxItems: 0 };
expectedNative.properties.harness = { type: 'null' };
expectedNative.properties.execution = {
  type: 'object', additionalProperties: false,
  properties: { kind: { const: 'native' }, executor: { $ref: '#/$defs/Pin' } },
  required: ['kind', 'executor'],
};
expectedNative.required.push('execution');
assert.deepEqual(schema.$defs.NativeSlotSelection, expectedNative);

function checkClosedObjects(value, label = 'schema') {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object') assert.equal(value.additionalProperties, false, `${label} must be closed`);
  for (const [name, child] of Object.entries(value)) {
    if (['const', 'enum', 'examples', 'default'].includes(name)) continue;
    if (child && typeof child === 'object') checkClosedObjects(child, `${label}/${name}`);
  }
}
checkClosedObjects(schema);
assert.equal(fixtures.kind, 'CompositionContractAmendmentFixtures');
assert.equal(fixtures.authority, 'fixture-only');
assert.equal(fixtures.priorSchemaDigest, proposal.priorSchemaDigest);
assert.equal(fixtures.schemaId, schema.$id);
const legacyPath = path.join(root, 'dogfood/modular-engineering-20260918/contracts/contract-proposals.json');
assert.equal(path.resolve(root, fixtures.legacySource.path), legacyPath);
const legacyBytes = bytes(legacyPath);
assert.equal(sha256Digest(legacyBytes), fixtures.legacySource.digest);
const legacy = JSON.parse(legacyBytes).entries.find(entry => entry.interfaceIntentId === proposal.interfaceIntentId);
assert.deepEqual(legacy.schema, prior);
assert.deepEqual(fixtures.legacyPositiveFixtures, legacy.positiveFixtures);
assert.deepEqual(fixtures.legacyNegativeFixtures, legacy.negativeFixtures);

const lists = ['legacyPositiveFixtures', 'legacyNegativeFixtures', 'positiveFixtures', 'negativeFixtures'];
const names = new Set();
for (const name of lists) {
  assert.ok(Array.isArray(fixtures[name]) && fixtures[name].length > 0 && fixtures[name].length <= 128);
  for (const fixture of fixtures[name]) {
    assert.equal(typeof fixture.name, 'string');
    assert.ok(fixture.name.length > 0 && !names.has(fixture.name), 'fixture names must be nonempty and unique');
    names.add(fixture.name);
  }
}
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validatePrior = ajv.compile(prior);
const validateCandidate = ajv.compile(schema);
const validateAgent = ajv.compile({ $ref: `${schema.$id}#/$defs/AgentSlotSelection` });
const validateNative = ajv.compile({ $ref: `${schema.$id}#/$defs/NativeSlotSelection` });
let assertions = 0;
function check(validator, fixture, expected, label) {
  const actual = validator(fixture.value);
  assert.equal(actual, expected, `${label}/${fixture.name}: ${ajv.errorsText(validator.errors)}`);
  assertions += 1;
}
for (const fixture of fixtures.legacyPositiveFixtures) {
  check(validatePrior, fixture, true, 'v1');
  check(validateCandidate, fixture, true, 'v2');
}
for (const fixture of fixtures.legacyNegativeFixtures) {
  check(validatePrior, fixture, false, 'v1');
  check(validateCandidate, fixture, false, 'v2');
}
for (const fixture of fixtures.positiveFixtures) {
  check(validateCandidate, fixture, true, 'v2');
  const hasNativeSelection = fixture.value.selections.some(selection => Object.hasOwn(selection, 'execution'));
  check(validatePrior, fixture, !hasNativeSelection, 'v1-forward-boundary');
}
for (const fixture of fixtures.negativeFixtures) check(validateCandidate, fixture, false, 'v2');
let disjointSelections = 0;
for (const fixture of [...fixtures.legacyPositiveFixtures, ...fixtures.positiveFixtures]) {
  for (const selection of fixture.value.selections ?? []) {
    assert.equal(Number(validateAgent(selection)) + Number(validateNative(selection)), 1, `${fixture.name}: selection must match exactly one closed branch`);
    disjointSelections += 1;
  }
}
const files = ['proposal.json', 'fixtures.json', 'validate.mjs', 'assessment.md'].map(name => ({ name, digest: sha256Digest(bytes(path.join(directory, name))) }));
console.log(JSON.stringify({
  outcome: 'pass', schemaId: schema.$id, schemaDigest: proposal.schemaDigest,
  legacyPositive: fixtures.legacyPositiveFixtures.length, legacyNegative: fixtures.legacyNegativeFixtures.length,
  newPositive: fixtures.positiveFixtures.length, newNegative: fixtures.negativeFixtures.length,
  schemaAssertions: assertions, disjointSelections,
  v1AgentBranchPreservedExactly: true, otherPriorDefinitionsPreservedExactly: true,
  projectBaselineDigestsVerified: true, files,
  scope: 'Candidate schema/fixture conformance only; no native execution, ContractGate approval, or baseline mutation.',
}));
