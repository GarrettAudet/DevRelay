import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const doc = read("docs/system-verification.md");
const readme = read("README.md");
const examples = read("examples/README.md");
const required = (text, patterns) => {
  for (const pattern of patterns) assert.match(text, pattern, `missing documentation contract: ${pattern}`);
};

test("SystemVerification documentation fixes exact inputs and immutable subject semantics", () => {
  required(doc, [
    /ChangeIntegration -> SystemVerification -> BusinessAcceptanceGate/,
    /exactly three required inputs:[\s\S]*`integrated-system-candidate`[\s\S]*`system-verification-policy`[\s\S]*`project-overview-baseline`/,
    /final `RepositorySnapshot`[\s\S]*every required `IntegratedChangeRecord`[\s\S]*`integratedCompletionFactSet`[\s\S]*requirements,[\s\S]*project-overview,[\s\S]*architecture,[\s\S]*contract-disposition,[\s\S]*work-breakdown,[\s\S]*work-dependency,[\s\S]*specialist-assignment baselines/,
    /`integratedChangeRecords` array may be empty[\s\S]*valid zero-change\s+case/,
    /`VerificationEnvironmentSnapshot`, or an[\s\S]*`approved-not-applicable` environment disposition/,
  ]);
});

test("SystemVerification documentation fixes obligation, evidence, and policy semantics", () => {
  required(doc, [
    /all approved system-level acceptance criteria[\s\S]*every applicable non-functional requirement/,
    /adapters cannot add, remove, waive, or[\s\S]*redefine obligations/,
    /Typed evidence bindings and native provenance are different/,
    /`evidenceBindings` connect a specific obligation[\s\S]*`nativeEvidence` records the digest-bound native/,
    /native test\/review source[\s\S]*does not satisfy an[\s\S]*obligation merely by existing/,
    /exactly one[\s\S]*`satisfied`, `failed`, or `missing-evidence` disposition/,
  ]);
});

test("SystemVerification documentation fixes outcomes, drift, and replay", () => {
  required(doc, [
    /exactly these outcomes:[\s\S]*`verified`[\s\S]*`failed`[\s\S]*`needs-evidence`[\s\S]*`baseline-drift`[\s\S]*`unable-to-proceed`/,
    /Repository, integration-record, completion-fact, baseline,[\s\S]*environment, or policy substitution is `baseline-drift`/,
    /zero additional verifier[\s\S]*calls/,
    /Changed inputs[\s\S]*require a new invocation identity and fingerprint/,
  ]);
});

test("SystemVerification documentation fixes trust, traceability, maturity, and Gate boundary", () => {
  required(doc, [
    /Verifier adapters are proposer-only/,
    /may not[\s\S]*choose obligations,[\s\S]*normalize evidence,[\s\S]*evaluate policy,[\s\S]*select a Module[\s\S]*outcome,[\s\S]*receive the graph service,[\s\S]*author graph[\s\S]*operations/,
    /AcceptanceCriterion -> verified-by -> VerificationEvidence/,
    /no inverse[\s\S]*NFR relationship,[\s\S]*business-acceptance fact/,
    /fixture-conformant, not[\s\S]*live-provider conformant/,
    /`contract-defined` or `fixture-conformant` until real[\s\S]*`live-conformant`/,
    /`BusinessAcceptanceGate` as a separate, not-started[\s\S]*handoff/,
    /SystemVerification neither[\s\S]*implements nor bypasses that Gate/,
  ]);
});

test("both READMEs link the canonical SystemVerification guide", () => {
  assert.match(readme, /\[SystemVerification 0\.1\.0 operator and adapter guide\]\(docs\/system-verification\.md\)/);
  assert.match(examples, /\[SystemVerification 0\.1\.0 operator and adapter guide\]\(\.\.\/docs\/system-verification\.md\)/);
});
