# Controlled release acceptance pickup

This package is the active resume point for the DevRelay controlled Windows source/library release.

The exact verified release-source target is `9d2b0d8e6b358dd6aed922de420224fe9efc320c`. The corrected 25-file candidate artifact is fully materialized and validated, but it is not yet persisted in the remote repository.

Persistence run `31566991321` passed candidate validation, the 842-test release gate, catalog verification, and installed-package verification. Its push was rejected because the GitHub App attempted to modify a workflow file without workflow-file permission. Runner-local commit `6f7a84a` is not remote history.

Current boundary: persist the exact candidate package, finalize workflow cleanup through an authorized path, regenerate the release catalog, and pass the four-job matrix. Exact owner approval follows persistence, not before it.

Read in this order:

1. `CURRENT_STATE.md`
2. `EVIDENCE_INDEX.md`
3. `NEXT_ACTIONS.md`
4. `PICKUP_PROMPT.md`
5. `handoff.yaml`

`MANIFEST.json` and `SHA256SUMS` bind the handoff bytes. `candidate-materializer.wip.txt` is preserved implementation provenance, not current authority.

The release boundary excludes public npm publication, a one-click ChatGPT Desktop plug-in, a hosted backend, deployment, and production-service operation.

The package under `handoff/2026-08-10-lifecycle-run-report-pickup/` remains immutable historical context.
