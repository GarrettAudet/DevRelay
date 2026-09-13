import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { prepareDiscoveryInterpretationRevision, readDiscoveryInterpretationHistory } from "../src/discovery-interpretation-history.mjs";

const candidate = name => ({ interpretationRef: { artifactId: name, digest: canonicalJsonDigest(name) }, authority: "candidate" });
test("exact-predecessor revisions retain immutable history and replay without another record", () => {
  const records = new Map();
  const readRecord = key => records.get(key);
  const first = prepareDiscoveryInterpretationRevision({ candidate: candidate("first"), readRecord });
  records.set(first.key, first.record);
  const secondInput = { candidate: candidate("second"), headKey: first.key, replacesInterpretation: first.record.interpretationRef, readRecord };
  const second = prepareDiscoveryInterpretationRevision(secondInput);
  records.set(second.key, second.record);
  assert.deepEqual(readDiscoveryInterpretationHistory({ headKey: second.key, readRecord }).map(entry => entry.record.interpretationRef.artifactId), ["second", "first"]);
  const replay = prepareDiscoveryInterpretationRevision({ ...secondInput, headKey: second.key });
  assert.equal(replay.replayed, true);
  assert.equal(replay.key, second.key);
  assert.equal(records.size, 2);
  assert.throws(() => prepareDiscoveryInterpretationRevision({ candidate: candidate("third"), headKey: second.key, replacesInterpretation: first.record.interpretationRef, readRecord }), /exact current/);
  assert.throws(() => prepareDiscoveryInterpretationRevision({ candidate: candidate("first"), headKey: second.key, replacesInterpretation: second.record.interpretationRef, readRecord }), /historical candidate/);
  records.set(first.key, { ...first.record, authority: "approved" });
  assert.throws(() => readDiscoveryInterpretationHistory({ headKey: second.key, readRecord }), /substituted/);
});

test("initial submissions and replay cannot invent or change revision lineage", () => {
  const records = new Map();
  const readRecord = key => records.get(key);
  assert.throws(() => prepareDiscoveryInterpretationRevision({ candidate: candidate("first"), replacesInterpretation: candidate("absent").interpretationRef, readRecord }), /absent/);
  const first = prepareDiscoveryInterpretationRevision({ candidate: candidate("first"), readRecord }); records.set(first.key, first.record);
  assert.throws(() => prepareDiscoveryInterpretationRevision({ candidate: candidate("second"), headKey: first.key, readRecord }), /exact current/);
  assert.throws(() => prepareDiscoveryInterpretationRevision({ candidate: candidate("first"), headKey: first.key, replacesInterpretation: candidate("absent").interpretationRef, readRecord }), /lineage/);
});
