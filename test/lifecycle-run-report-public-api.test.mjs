import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "../src/index.mjs";
import * as contentPolicy from "../src/lifecycle-run-report-content-policy.mjs";
import * as frontier from "../src/lifecycle-run-report-frontier.mjs";
import * as ledger from "../src/lifecycle-run-report-ledger.mjs";
import * as markdown from "../src/lifecycle-run-report-markdown.mjs";
import * as observations from "../src/lifecycle-run-report-observations.mjs";
import * as snapshot from "../src/lifecycle-run-report-snapshot.mjs";

const expected = {
  applyLifecycleRunReportContentPolicy: contentPolicy.applyLifecycleRunReportContentPolicy,
  createIntegratedCompletionRegistry: frontier.createIntegratedCompletionRegistry,
  createLifecycleRunReportAccess: markdown.createLifecycleRunReportAccess,
  createRunLedger: ledger.createRunLedger,
  createRunLedgerCheckpoint: ledger.createRunLedgerCheckpoint,
  deriveReadyFrontier: frontier.deriveReadyFrontier,
  evaluateRunComparability: observations.evaluateRunComparability,
  ingestRunHostObservation: observations.ingestRunHostObservation,
  ingestRunHostObservations: observations.ingestRunHostObservations,
  projectLifecycleRunSnapshot: snapshot.projectLifecycleRunSnapshot,
  renderLifecycleRunReport: markdown.renderLifecycleRunReport,
  renderLifecycleRunReportMarkdown: markdown.renderLifecycleRunReportMarkdown,
  renderLifecycleRunReportMarkdownBytes: markdown.renderLifecycleRunReportMarkdownBytes,
  resolveAdapterMaturity: observations.resolveAdapterMaturity,
  verifyRunLedgerCheckpoint: ledger.verifyRunLedgerCheckpoint,
};

test("installed package root exposes the complete read-only LifecycleRunReport host surface", () => {
  for (const [name, implementation] of Object.entries(expected)) {
    assert.equal(publicApi[name], implementation, name);
  }
  assert.equal(publicApi.LIFECYCLE_RUN_REPORT_RENDERER_VERSION, "1.0.0");
});
