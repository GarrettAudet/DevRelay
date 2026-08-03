# WorkBreakdown dogfood

This package runs DevRelay's released `WorkBreakdown` module against the exact approved RequirementsGathering and ArchitectureDesign baselines for WorkBreakdown 0.1.0.

The existing repository has no `WorkBreakdownBaseline`, so Core derives `establish-breakdown`. Configuration selects `openspec-tasks@0.1.0`. The adapter is represented by the bounded `tasks.md` fixture; the OpenSpec CLI is deliberately not invoked. The fixture is normalized into one canonical `WorkBreakdownDraft`, validated, projected through trusted traceability contributors, atomically merged, and promoted by the WorkBreakdown Gate to `WorkBreakdownBaseline`.

`materialize.mjs` regenerates all JSON and Gate evidence deterministically, proves checkpoint replay without a second adapter call, verifies all 10 acceptance criteria and all 12 architecture elements have planned coverage, and exercises a stale-state `baseline_drift` path with zero adapter calls. `work-breakdown-dogfood-proof.json` is the concise execution summary.

Limitations: this package proves the DevRelay adapter boundary and canonical normalization contract with checked-in bytes. It does not claim that a live OpenSpec installation was executed, that dependency hints form an authoritative DAG, or that any work item was assigned, implemented, built, or completed.
