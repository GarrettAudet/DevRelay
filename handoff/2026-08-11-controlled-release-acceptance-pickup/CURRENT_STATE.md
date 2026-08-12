# Current state

## Exact repository position

- Branch: `codex/lifecycle-run-report-completion`
- Latest checkpoint before this update: `dbd85ba1bdb0dd6ec93824b93aa1eec5fec95f64`
- Active boundary: catalog-only source stabilization and exact verify binding
- No authoritative final acceptance record exists yet

## What is complete

The V1 construction circuit through BusinessAcceptance is implemented. Release
catalog and installed-package checks are portable across Windows/Linux and Node
20/22. Java 21 is provisioned and bound on both operating-system families.

The final pre-approval circuit has executed successfully through released APIs:

- recovery of the complete persisted TraceabilityGraph history;
- atomic merge of the two owner-authorized designed-by links;
- 99-obligation SystemVerification through test and review adapters;
- exact zero-call SystemVerification replay;
- trusted SystemVerification traceability merge;
- exhaustive BusinessAcceptance technical-coverage derivation;
- BusinessAcceptance evaluation and exact zero-call replay.

The trusted SystemVerification contributor now marks passing evidence nodes with
`verificationStatus: "pass"`, closing the graph traversal defect that previously
blocked BusinessAcceptance.

## Current bootstrap evidence

Commit `dbd85ba` added a guarded source-catalog bootstrap. Workflow run
`31564333006` generated and uploaded the exact source catalog as artifact
`9128889947`. The catalog records 3,467 raw-byte file digests, 11 modules, 24
plug-ins, and 281 npm-package files. The job then stopped at the committed-file
check before verify binding or candidate generation, as designed.

The next workflow revision will commit only `release/0.9.0.json` after checking
that no other tracked file changed, explicitly dispatch `verify` for that new
catalog commit, and continue only after all four jobs pass for the exact SHA.

## What is not complete

The successful pre-approval candidate generated earlier names source commit
`477e7a4` and cannot be promoted after the passing-evidence correction. No
corrected candidate is yet persisted against a same-commit successful verify
run.

No exact corrected owner approval, BusinessAcceptanceGate record, acceptance
traceability merge, final release evidence commit, or final supported-matrix
proof exists yet.

## Approval state

The owner authorized the controlled source/library release scope, satisfaction
accounting for 81 acceptance criteria, 18 NFRs, 8 business objectives, 9 success
metrics, and 32 scope identities, and the two designed-by links from
`US-DEV-SPECIFY-001` and `NFR-DEV-DETERMINISM-001` to `EL-DEVRELAY-CORE`.

The earlier exact approval named superseded source. BusinessAcceptanceGate must
not reuse it silently. The corrected candidate must expose its exact target
commit, semantic digest, raw digest, technical-coverage digest, and exclusions.

## Safe continuation

```text
commit self-bootstrapping workflow and current-state update
-> commit exact generated catalog only under branch compare-and-swap
-> dispatch verify workflow for resulting commit
-> require Ubuntu/Windows and Node 20/22 success
-> materialize corrected candidate with exact SHA/run binding
-> inspect and persist exact approval request
-> execute BusinessAcceptanceGate only with exact owner decision
-> merge trusted acceptance traceability
-> require zero blocking diagnostics
-> persist final evidence, catalog, handoff, and release metadata
-> run final release check and four-job matrix
```

## Trust boundary

Do not hand-author SystemVerificationResult, technical coverage,
BusinessAcceptanceCandidate, owner approval, BusinessAcceptanceRecord,
traceability updates, merge receipts, or final completion claims. The released
Core, Gate, contributor, graph, and checkpoint APIs must produce them.
