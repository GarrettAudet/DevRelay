import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = message => { throw new TypeError(`discovery interpretation history: ${message}`); };
export const discoveryInterpretationRecordKey = record => `discovery-interpretation:${canonicalJsonDigest(record)}`;

// Immutable host history only. The caller must validate each candidate against
// the genuine Core discovery receipt; this helper grants no semantic authority.
export function readDiscoveryInterpretationHistory({ headKey, readRecord }) {
  const history = [];
  const keys = new Set();
  const candidates = new Set();
  let key = headKey;
  while (key) {
    if (keys.has(key)) fail("cyclic history");
    keys.add(key);
    const record = readRecord(key);
    if (!record || discoveryInterpretationRecordKey(record) !== key) fail("missing or substituted history record");
    const identity = canonicalJson(record.interpretationRef);
    if (candidates.has(identity)) fail("candidate identity appears more than once");
    candidates.add(identity);
    history.push({ key, record });
    key = record.previousInterpretationKey ?? null;
  }
  return history;
}

export function prepareDiscoveryInterpretationRevision({ candidate, headKey = null, replacesInterpretation, readRecord }) {
  const history = readDiscoveryInterpretationHistory({ headKey, readRecord });
  const current = history[0]?.record;
  if (current && same(current.interpretationRef, candidate.interpretationRef)) {
    const { previousInterpretationKey, ...body } = current;
    if (!same(body, candidate)) fail("candidate record changed for the same identity");
    if (replacesInterpretation !== undefined) {
      const prior = history[1]?.record;
      if (!prior || !same(prior.interpretationRef, replacesInterpretation)) fail("replay revision lineage differs");
    }
    return { key: headKey, record: current, replayed: true };
  }
  if (current) {
    if (!replacesInterpretation || !same(current.interpretationRef, replacesInterpretation)) fail("revision requires the exact current interpretation");
    if (history.some(entry => same(entry.record.interpretationRef, candidate.interpretationRef))) fail("historical candidate cannot be reactivated as a new revision");
  } else if (replacesInterpretation !== undefined) fail("initial submission cannot replace an absent candidate");
  const record = { ...structuredClone(candidate), previousInterpretationKey: headKey };
  return { key: discoveryInterpretationRecordKey(record), record, replayed: false };
}
