# Independent ChatGPT Desktop Windows dogfood

This package is the bounded evidence for `WI-REL-DESKTOP-DOGFOOD`. ChatGPT
Desktop on Windows used an installed DevRelay tarball to build and verify a
separate in-memory authentication project. The project is not part of the
DevRelay source tree and was integrated in its own Git repository.

The first run installed the exact artifact from GitHub Actions run
`31676437994`, commit `430cb5c09f1aa69b60f48fb37b06f3c3d7d8213d`, tarball digest
`sha256:9b7a7b3bf1f45a3c939106b32b0a2a86901331b7f078dcd9fec92f7244325720`.
It failed the required human-readable run-report check because the package root
did not expose the ledger, frontier, snapshot, content-policy, and renderer
operations. That failure caused the scoped public-API correction in this release
candidate.

The restarted run installed the corrected candidate tarball with digest
`sha256:e570192759e7e2a4dec23be0f3424e01ad8cc220d8187dde6398fd57c68fff41`.
It then:

1. validated approved requirements, overview, architecture, and work breakdown;
2. generated and validated a content-addressed authentication contract;
3. produced the authoritative DAG with the native proposer and Graphology-DAG;
4. assigned the ChatGPT Desktop specialist deterministically;
5. built the application, tests, runbook, and contract;
6. passed four functional, failure-uniformity, expiry, and performance tests;
7. integrated the result in a separate Git repository;
8. recorded and replayed the lifecycle ledger;
9. rendered a policy-filtered human-readable LifecycleRunReport; and
10. recorded SystemVerification and BusinessAcceptance evidence.

Exact replay preserved application commit
`9c13e9b6d0675b689f68ea10d48a58a33353ded3`, ledger checkpoint
`sha256:bcda5a0a2c75d619ed0cade0a44b979eb88d61ad1a4b2e8b31928e6564bf9153`,
and report digest
`sha256:1bb0df45da2d364cf91b4f5bea872e495317c9c1bab172b0e8c080d1cfb4884f`.

Adapter maturity remains explicit. OpenSpec, Spec Kit, Structurizr, and MADR are
fixture-conformant in this run. The native dependency proposer, Core DAG
analysis, native assignment, installed package API, tests, local Git
integration, ledger replay, and report renderer executed live.
