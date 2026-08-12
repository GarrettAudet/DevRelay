# Current state

## Exact repository position

- Branch: `codex/lifecycle-run-report-completion`
- Latest checkpoint before this update: `d3090aaca2e5198c5b71b467a4cf742af58d3825`
- Active boundary: exact same-commit verification binding and candidate persistence
- Working tree represented by GitHub commits; no uncommitted release claim exists

## What is complete

The V1 construction circuit through BusinessAcceptance is implemented. Release
catalog and installed-package checks are portable across Windows/Linux and Node
20/22. Java 21 is provisioned and bound on both operating-system families.

The final pre-approval circuit has been executed successfully through released
APIs. Proven stages include:

- recovery of the complete persisted TraceabilityGraph history;
- atomic merge of the two owner-authorized designed-by links;
- 99-obligation SystemVerification through the test and review adapters;
- exact zero-call SystemVerification replay;
- trusted SystemVerification traceability merge;
- exhaustive BusinessAcceptance technical-coverage derivation;
- BusinessAcceptance evaluation and exact zero-call replay.

The trusted SystemVerification contributor was corrected so passing evidence
nodes carry the graph-level `verificationStatus: "pass"` required by
BusinessAcceptance traversal.

## What is not complete

The successful pre-approval candidate named an older verified source commit and
cannot be promoted. A corrected candidate has not yet been persisted against
one exact commit that passed the four-job verify matrix.

Commit `d3090aa` correctly made target commit and CI run mandatory, but workflow
run `31563855621` failed closed because those environment bindings were absent.
No Gate, owner-approval, acceptance-record, acceptance traceability, publication,
or deployment authority was exercised.

## Active repair

The materialization workflow is being made self-binding. It will:

1. regenerate and upload the source release catalog;
2. require that catalog to be committed exactly;
3. wait for the `verify` run for the same `GITHUB_SHA`;
4. require that run to complete successfully;
5. bind the exact SHA and run ID to the materializer;
6. execute and upload the corrected candidate package.

Because the workflow and status bytes themselves change the content-addressed
source catalog, the first run is expected to upload the exact replacement
catalog and stop. Committing only that self-excluded catalog should produce the
stable source checkpoint used for verification and materialization.

## Approval state

The owner authorized the controlled source/library release scope, satisfaction
accounting for 81 acceptance criteria, 18 NFRs, 8 business objectives, 9 success
metrics, and 32 scope identities, and the two designed-by links from
`US-DEV-SPECIFY-001` and `NFR-DEV-DETERMINISM-001` to `EL-DEVRELAY-CORE`.

The earlier exact approval named superseded source. BusinessAcceptanceGate must
not reuse it silently. The corrected candidate must first expose its exact
target commit, semantic digest, raw digest, technical-coverage digest, and
exclusions.

## Safe continuation

```text
finish self-binding workflow
-> commit generated source catalog only
-> require exact four-job verify success
-> retrieve corrected candidate artifact
-> inspect exact owner-approval request
-> execute BusinessAcceptanceGate only with exact owner decision
-> merge trusted acceptance traceability
-> require zero blocking diagnostics
-> persist final candidate, acceptance evidence, release catalog, and handoff
-> run final release check and four-job matrix
```

## Trust boundary

Do not hand-author SystemVerificationResult, technical coverage,
BusinessAcceptanceCandidate, owner approval, BusinessAcceptanceRecord,
traceability updates, merge receipts, or final completion claims. The released
Core, Gate, contributor, graph, and checkpoint APIs must produce them.
