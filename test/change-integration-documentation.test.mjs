import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const doc = read("docs/change-integration.md");
const readme = read("README.md");
const examples = read("examples/README.md");
const required = (text, patterns) => {
  for (const pattern of patterns) assert.match(text, pattern, `missing documentation contract: ${pattern}`);
};

test("ChangeIntegration documentation fixes lifecycle and CAS boundaries", () => {
  required(doc, [
    /WorkItemVerification -> ChangeIntegration -> SystemVerification -> BusinessAcceptance/,
    /does not verify the integrated system, deploy software, or accept business/,
    /`integrate-change` operation receives exactly three explicit required[\s\S]*`ProjectOverviewBaseline`[\s\S]*`VerifiedWorkItemSubject`[\s\S]*`IntegrationInputBinding`/,
    /direct `ProjectOverviewBaseline` input is[\s\S]*mandatory in addition to the project-overview baseline reference nested in[\s\S]*`IntegrationInputBinding`; nested data is not a substitute/,
    /validates the directly loaded `ProjectOverviewBaseline` bytes and digest[\s\S]*exact `projectOverviewBaseline` reference already bound in[\s\S]*`IntegrationInputBinding`/,
    /conversationally[\s\S]*inferred, or otherwise implicit project overview is invalid[\s\S]*never injects[\s\S]*ambient project context/,
    /VerifiedWorkItemSubject[\s\S]*IntegrationInputBinding[\s\S]*IntegrationPlan/,
    /input binding -> plan -> TARGET-CAS -> integration adapter[\s\S]*checkpoint\/recovery -> result validation/,
    /git update-ref <target-ref> <candidate-commit> <expected-target-commit>/,
    /`fast-forward`, `merge-commit`, or `cherry-pick`/,
  ]);
});

test("ChangeIntegration documentation fixes conflict and recovery behavior", () => {
  required(doc, [
    /There is no automatic conflict resolution/,
    /freshly proving the target unchanged/,
    /persists `prepared` before effect execution[\s\S]*`effect-recorded` before interpretation/,
    /fresh target observation and[\s\S]*immutable observation evidence/,
    /exact resume reuses the stored checkpoint and raw bytes with zero adapter[\s\S]*calls/,
    /Retry[\s\S]*new identity/,
  ]);
});

test("ChangeIntegration documentation distinguishes outcomes and downstream authority", () => {
  required(doc, [
    /exactly these Module outcomes:[\s\S]*`integrated`[\s\S]*`integration-conflict`[\s\S]*`baseline-drift`[\s\S]*`unable-to-proceed`[\s\S]*`execution-failed`/,
    /Operator routes are not extra Module outcomes:[\s\S]*`pass`[\s\S]*`fix`[\s\S]*`diagnose`[\s\S]*`clarify`[\s\S]*`block`[\s\S]*`retry`[\s\S]*`resume`/,
    /Adapters never receive the graph service and[\s\S]*never author graph operations/,
    /SystemVerification as a separate, not-started[\s\S]*handoff/,
    /not remote-provider[\s\S]*conformant/,
  ]);
});

test("README surfaces link to the canonical ChangeIntegration guide", () => {
  const link = /\[ChangeIntegration 0\.1\.0 operator and adapter guide\]\(docs\/change-integration\.md\)/;
  assert.match(readme, link);
  assert.match(examples, /\[ChangeIntegration 0\.1\.0 operator and adapter guide\]\(\.\.\/docs\/change-integration\.md\)/);
});
