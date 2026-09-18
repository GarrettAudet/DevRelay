import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cycleDirectory, createCycleArtifactStore, readJson } from '../artifact-store.mjs';
import { canonicalJsonDigest, sha256Digest } from '../../../src/content-digest.mjs';

const store = createCycleArtifactStore('publication/parallel-construction');
const base = 'continuity';
const inspected = readJson(path.join(cycleDirectory, base, 'observations/inspect/summary.json'));
const applied = readJson(path.join(cycleDirectory, base, 'observations/apply/summary.json'));
const replay = readJson(path.join(cycleDirectory, base, 'observations/replay/summary.json'));
const review = readJson(path.join(cycleDirectory, base, 'independent-review.json'));
const tests = readJson(path.join(cycleDirectory, base, 'parent-test-observation.json'));
assert.equal(review.helperDigest, applied.helperDigest);
assert.equal(tests.helperDigest, applied.helperDigest);
assert.equal(review.verdict, 'accepted-for-bounded-construction-settlement');
assert.equal(tests.passed, 22);
assert.equal(tests.failed, 0);
assert.equal(inspected.continuityVersion, 2);
assert.equal(applied.continuityVersion, 8);
assert.equal(replay.continuityVersion, 8);
assert.equal(inspected.protectedStateDigest, applied.protectedStateDigest);
assert.equal(applied.protectedStateDigest, replay.protectedStateDigest);
assert.ok(applied.results.every(result => result.status === 'completed' && result.appliedTransitions === 3 && result.completionAuthority === false));
assert.ok(replay.results.every(result => result.appliedTransitions === 0 && result.executorCalls === 0));
const names = ['settle-bridge-attempt.mjs', 'settlement-assessment.md', 'run-settlement.mjs',
  'independent-review.json', 'parent-test-observation.json', 'prepare-publication.mjs',
  'observations/inspect/summary.json', 'observations/apply/summary.json', 'observations/replay/summary.json'];
const files = names.map(name => ({ path: `dogfood/modular-engineering-20260918/${base}/${name}`,
  digest: sha256Digest(readFileSync(path.join(cycleDirectory, base, name))) }));
const capsule = { kind: 'MESParallelConstructionPublication', sourceBaseRevision: '848b0ca3914e8645a1219090eec315f5c3784a22',
  constructionHelper: { digest: applied.helperDigest, independentReviewer: review.agentId, planDigest: review.planDigest },
  executionSettlement: applied, zeroWriteReplay: replay, localFixtureTests: tests, files,
  fileManifestDigest: canonicalJsonDigest(files),
  scope: 'Reviewed construction recovery and parallel native preparation/review evidence; no installed product dispatch claim',
  limitations: ['Local fixture test and full archived native artifacts are retained locally; test is not added to automatic repository discovery',
    'Settlement completion is execution-attempt evidence only; formal verification and integration remain pending',
    'Full modular workflow execution, Meta-Harness optimization and product acceptance remain outstanding'] };
store.save('candidate.json', capsule);
const prior = readFileSync(path.join(cycleDirectory, 'publication/native-composition/paths.nul'), 'utf8').split('\0').filter(Boolean);
store.save('paths.nul', Buffer.from([...new Set([...prior, ...files.map(file => file.path),
  'dogfood/modular-engineering-20260918/publication/parallel-construction/candidate.json'])].sort().join('\0') + '\0'));
console.log(JSON.stringify({ status: 'publication-prepared', paths: prior.length + files.length + 1,
  continuityVersion: replay.continuityVersion, formalVerificationApproved: false, integrated: false }));
