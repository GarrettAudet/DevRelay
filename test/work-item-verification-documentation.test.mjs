import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const doc = read("docs/work-item-verification.md");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json"));

const required = (text, patterns) => {
  for (const pattern of patterns) assert.match(text, pattern, `missing documentation contract: ${pattern}`);
};

test("WIV documentation fixes the lifecycle and trust boundary", () => {
  required(doc, [
    /WorkExecution -> WorkItemVerification -> ChangeIntegration/,
    /neither performs implementation nor integrates a change/,
    /validated subject\/input bindings[\s\S]*obligation expansion[\s\S]*independent verifier binding[\s\S]*checkpointed verifier invocation[\s\S]*raw result[\s\S]*canonical evidence normalization[\s\S]*version-pinned policy evaluation[\s\S]*candidate-only Gate artifact[\s\S]*exact Gate approval[\s\S]*candidate\/approved trace projection[\s\S]*Core atomic graph merge[\s\S]*downstream ChangeIntegration remains separate/,
    /Core \/ Gate[\s\S]*Verifier adapters[\s\S]*Host[\s\S]*TraceabilityGraph contributor[\s\S]*ChangeIntegration/,
  ]);
});

test("WIV documentation distinguishes outcomes from operator routes", () => {
  required(doc, [
    /exactly these outcomes:[\s\S]*`verified`[\s\S]*`failed`[\s\S]*`needs-evidence`/,
    /`baseline-drift` and `unable-to-proceed` are output-free, pre-evaluation Module\s+outcomes/,
    /`pass`, `fix`, `diagnose`, `clarify`, `block`, `retry`, and `resume` are outer[\s\S]*not additional WIV Gate outcomes/,
  ]);
});

test("WIV documentation fixes replay, traceability, and integration semantics", () => {
  required(doc, [
    /zero additional verifier calls/,
    /Changed inputs require a new attempt identity and fingerprint/,
    /Candidate traceability is evidence-only[\s\S]*cannot emit `verified-by`/,
    /Approved traceability requires the exact canonical[\s\S]*`WorkItemVerificationGateApproval`/,
    /AcceptanceCriterion -> verified-by -> Evidence[\s\S]*WorkItem\s+-> verified-by -> Evidence/,
    /no inverse edges, integration facts, completion facts, or arbitrary/,
    /ChangeIntegration as a separate, not-started handoff/,
  ]);
});

test("WIV documentation states adapter maturity and bootstrap provenance honestly", () => {
  required(doc, [
    /fixture-conformant, not live-provider\s+conformant/,
    /Self-verification, aliased producer identity/,
    /`fixture-conformant` until live-provider conformance is separately proven/,
    /exact historical `WI-WE-CONTRACTS` host receipt/,
    /does \*\*not\*\* claim they were historical WorkExecution\s+runtime outputs/,
  ]);
});

test("README exposes WIV documentation and includes WIV in the current release inventory", () => {
  assert.match(readme, /\[WorkItemVerification 0\.1\.0 operator and adapter guide\]\(docs\/work-item-verification\.md\)/);
  const releaseStatus = readme.match(/## Release status[\s\S]*?## Source setup and verification/)?.[0] ?? "";
  assert.ok(releaseStatus.includes(`DevRelay \`${packageJson.version}\``));
  assert.match(releaseStatus, /`work-item-verification@0\.1\.0`/);
});
