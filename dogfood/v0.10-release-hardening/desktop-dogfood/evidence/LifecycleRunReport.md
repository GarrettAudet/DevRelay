# Lifecycle Run Report

## Executive summary

13 lifecycle components were observed: 12 completed, 0 active, 0 failed, and 1 skipped. Next action: none.

- Run: `desktop-auth-dogfood-31676437994`
- Snapshot ID: `LRS-AUTH-DESKTOP-001`
- Ledger: [RUN-LEDGER-AUTH](devrelay-artifact://RUN-LEDGER-AUTH?digest=bcda5a0a2c75d619ed0cade0a44b979eb88d61ad1a4b2e8b31928e6564bf9153)
- Traceability graph: [traceability-graph-auth-001](devrelay-artifact://traceability-graph-auth-001?digest=f7905eaaf4a0c314a61d536ab285cfdccac8e3f8813609b8cf95c2a6ad5d8f72)

## Stages

| Stage | Operation | Adapters | Outcome | Gate | Rework | Performance | Important outputs | Source facts | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. `RequirementsGathering` | `establish-requirements` | `openspec` `0.1.0` | approved | approved | 2 attempts, resumed | Unavailable | [requirements-baseline-001](devrelay-artifact://requirements-baseline-001?digest=ea4df7d7c79999c22d139b333c01634ae9c8443bcaec01dcb3c1502a7acbd147) | [EVIDENCE-01](devrelay-artifact://EVIDENCE-01?digest=871269b7c4b783bb78878ad83a2cb5c306ff3fdf453c1537325c178d0ec76f09) | none |
| 2. `ArchitectureDiscovery` | `not-applicable` | None | skipped | not-applicable | 1 attempt | Unavailable | [architecture-baseline-001](devrelay-artifact://architecture-baseline-001?digest=7cb65e9628e2e4bba95b415cb2ad4af325dce129fbd39c93d96afe561f856a4c) | [EVIDENCE-02](devrelay-artifact://EVIDENCE-02?digest=6d5ac1c1bc5ce2fbe8713f262e2c9b2781e72760619e41c2791a957968c171ad) | none |
| 3. `ArchitectureDesign` | `establish-baseline` | None | approved | approved | 1 attempt | Unavailable | [architecture-baseline-001](devrelay-artifact://architecture-baseline-001?digest=7cb65e9628e2e4bba95b415cb2ad4af325dce129fbd39c93d96afe561f856a4c) | [EVIDENCE-03](devrelay-artifact://EVIDENCE-03?digest=d30be1f22b53eae8b2bef010a27f69bb005ef71a6abace003dad7a9cd3457df1) | none |
| 4. `ContractGeneration` | `establish-contracts` | `json-schema-contract-generator` `0.1.0` | approved | approved | 1 attempt | Unavailable | [CD-AUTH-DESKTOP-001](devrelay-artifact://CD-AUTH-DESKTOP-001?digest=0b74729e22910820718c5db6866405203f2691e0bd7848009cb08d949c8f6414) | [EVIDENCE-04](devrelay-artifact://EVIDENCE-04?digest=4a7e18ae0f6fd040c1ad268d491283a30b5701982f085645c7d98a0d139d2ce9) | none |
| 5. `WorkBreakdown` | `establish-breakdown` | `spec-kit-tasks` `0.1.0` | approved | approved | 1 attempt | Unavailable | [WBB-AUTH-001](devrelay-artifact://WBB-AUTH-001?digest=0ea05982b66f2fe2e54764da3f39ffc1a9f13d9cd6becfdcb956adb647f4e8af) | [EVIDENCE-05](devrelay-artifact://EVIDENCE-05?digest=f6ca02d5c5b83e75cd85434c6b33045c5a7e8ad165bb4a1a69c847d64258cd45) | none |
| 6. `WorkDependencyAnalysis` | `establish-dependencies` | None | approved | approved | 1 attempt | Unavailable | [WDB-AUTH-DESKTOP-001](devrelay-artifact://WDB-AUTH-DESKTOP-001?digest=38e8d7cb9f058f7d7e129e84378ac15f578b1e79332ed1d1c26dc2127d0079b4) | [EVIDENCE-06](devrelay-artifact://EVIDENCE-06?digest=39fd5eefb872bfa96e3bfdbce3f8cdeed34c15f2897646591e59a31a083135e1) | none |
| 7. `SpecialistAssignment` | `assign-specialists` | None | approved | approved | 1 attempt | Unavailable | [SAB-0FC99DBACB77102B](devrelay-artifact://SAB-0FC99DBACB77102B?digest=6715aea2e74a7efa9ac644e44211bb81eaf6fbd2f4649f962ad485740dc317e7) | [EVIDENCE-07](devrelay-artifact://EVIDENCE-07?digest=b63b990f1e34c3143da5a281dd2d917903ac428615f160f75d54e5ea95d58365) | none |
| 8. `WorkExecution` | `execute-ready-frontier` | None | completed | not-applicable | 1 attempt | Unavailable | [AUTH-SOURCE](devrelay-artifact://AUTH-SOURCE?digest=80cd60e77a9608a401c94b4907152b0e34d3dfd417d47c67b2f82b0c678c4759) | [EVIDENCE-08](devrelay-artifact://EVIDENCE-08?digest=e5665bbad176a56dd752c1cc95efef55341bcc15293a75f69b4ece48894536eb) | none |
| 9. `WorkItemVerification` | `verify-work-items` | None | approved | approved | 1 attempt | Unavailable | [AUTH-TESTS](devrelay-artifact://AUTH-TESTS?digest=34361b63250c2df08abbc54eaecc18f9cf4b9d8d541b04c2a9fa46c93a60cb89) | [EVIDENCE-09](devrelay-artifact://EVIDENCE-09?digest=48c54f552e095e5cde7a72debf3d559b17b19b8f50e06b7e569fca3171a0d6f7) | none |
| 10. `ChangeIntegration` | `integrate-change` | `local-git-integration` `0.1.0` | completed | not-applicable | 1 attempt | Unavailable | [AUTH-COMMIT](devrelay-artifact://AUTH-COMMIT?digest=9c13e9b6d0675b689f68ea10d48a58a33353ded3000000000000000000000000) | [EVIDENCE-10](devrelay-artifact://EVIDENCE-10?digest=7a00e0b550edea1d14feea07c0ed2e9e87b4bc0c69f1237efd4d30afa0f3c471) | none |
| 11. `TraceabilityGraph` | `merge-lifecycle-links` | None | completed | not-applicable | 1 attempt | Unavailable | [traceability-graph-auth-001](devrelay-artifact://traceability-graph-auth-001?digest=f7905eaaf4a0c314a61d536ab285cfdccac8e3f8813609b8cf95c2a6ad5d8f72) | [EVIDENCE-11](devrelay-artifact://EVIDENCE-11?digest=50de0cdb4d5b3931f84ba2fc179688f3982b1d4a56021fb781a72ec56278de79) | none |
| 12. `SystemVerification` | `verify-integrated-system` | None | completed | not-applicable | 1 attempt | 4 count (measured) | [SYSTEM-EVIDENCE-AUTH](devrelay-artifact://SYSTEM-EVIDENCE-AUTH?digest=27f8b567706f72bb0959709905ff288bf86b7ff04455e86a563115bb71a645de) | [EVIDENCE-12](devrelay-artifact://EVIDENCE-12?digest=c2b1a713917db8ab2909d4bc68b74f4c0658af88632e549be2a5890c0330da23) | none |
| 13. `BusinessAcceptance` | `accept-system` | None | approved | approved | 1 attempt | Unavailable | [BUSINESS-ACCEPTANCE-AUTH](devrelay-artifact://BUSINESS-ACCEPTANCE-AUTH?digest=27f8b567706f72bb0959709905ff288bf86b7ff04455e86a563115bb71a645de) | [EVIDENCE-13](devrelay-artifact://EVIDENCE-13?digest=22819227e4c498fc15b9f4bc6675dab2d22ee47740b21dcb12508a0cac7689d2) | none |

## Run performance

- functional-tests: 4 count (measured)

## Adapter maturity

- local-git-integration 0.1.0: live-conformant
- openspec 0.1.0: fixture-conformant

## Traceability

- No active traceability path was projected.

## Diagnostics

- No diagnostics were reported.

## Important artifacts

- [AUTH-RUNBOOK](devrelay-artifact://AUTH-RUNBOOK?digest=f4d8d8acd3e9ff14586934afbbb8b9127e70ecbd33856d24fdda86f38d79c315)
- [AUTH-SOURCE](devrelay-artifact://AUTH-SOURCE?digest=80cd60e77a9608a401c94b4907152b0e34d3dfd417d47c67b2f82b0c678c4759)
- [AUTH-TESTS](devrelay-artifact://AUTH-TESTS?digest=34361b63250c2df08abbc54eaecc18f9cf4b9d8d541b04c2a9fa46c93a60cb89)

## Next action

none

---

Generated by DevRelay LifecycleRunReport renderer 1.0.0. This report is a read-only projection; linked canonical artifacts remain authoritative.
