# Lifecycle Run Report

## Executive summary

13 lifecycle components were observed: 12 completed, 0 active, 0 failed, and 1 skipped. Next action: none.

- Run: `desktop-auth-dogfood-31676437994`
- Snapshot ID: `LRS-AUTH-DESKTOP-001`
- Ledger: [RUN-LEDGER-AUTH](devrelay-artifact://RUN-LEDGER-AUTH?digest=8d486c9f3b5e9b25b52e51876c5c441ad02cfa176328928cdf5b675b1a516a86)
- Traceability graph: [traceability-graph-auth-001](devrelay-artifact://traceability-graph-auth-001?digest=f7905eaaf4a0c314a61d536ab285cfdccac8e3f8813609b8cf95c2a6ad5d8f72)

## Stages

| Stage | Operation | Adapters | Outcome | Gate | Rework | Performance | Important outputs | Source facts | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. `RequirementsGathering` | `establish-requirements` | `openspec` `0.1.0` | approved | approved | 2 attempts, resumed | Unavailable | [requirements-baseline-001](devrelay-artifact://requirements-baseline-001?digest=ea4df7d7c79999c22d139b333c01634ae9c8443bcaec01dcb3c1502a7acbd147) | [EVIDENCE-01](devrelay-artifact://EVIDENCE-01?digest=871269b7c4b783bb78878ad83a2cb5c306ff3fdf453c1537325c178d0ec76f09) | none |
| 2. `ArchitectureDiscovery` | `not-applicable` | None | skipped | not-applicable | 1 attempt | Unavailable | [architecture-baseline-001](devrelay-artifact://architecture-baseline-001?digest=7cb65e9628e2e4bba95b415cb2ad4af325dce129fbd39c93d96afe561f856a4c) | [EVIDENCE-02](devrelay-artifact://EVIDENCE-02?digest=6d5ac1c1bc5ce2fbe8713f262e2c9b2781e72760619e41c2791a957968c171ad) | none |
| 3. `ArchitectureDesign` | `establish-baseline` | None | approved | approved | 1 attempt | Unavailable | [architecture-baseline-001](devrelay-artifact://architecture-baseline-001?digest=7cb65e9628e2e4bba95b415cb2ad4af325dce129fbd39c93d96afe561f856a4c) | [EVIDENCE-03](devrelay-artifact://EVIDENCE-03?digest=d30be1f22b53eae8b2bef010a27f69bb005ef71a6abace003dad7a9cd3457df1) | none |
| 4. `ContractGeneration` | `establish-contracts` | `json-schema-contract-generator` `0.1.0` | approved | approved | 1 attempt | Unavailable | [CD-AUTH-DESKTOP-001](devrelay-artifact://CD-AUTH-DESKTOP-001?digest=720206fe58ffe2fcf31071dd0167a6f614e8ece71ba346150393203a41d26081) | [EVIDENCE-04](devrelay-artifact://EVIDENCE-04?digest=4c151142008fab719ce9ba3d599179aa1733b8907a0333b526eb573edd555cd9) | none |
| 5. `WorkBreakdown` | `establish-breakdown` | `spec-kit-tasks` `0.1.0` | approved | approved | 1 attempt | Unavailable | [WBB-AUTH-001](devrelay-artifact://WBB-AUTH-001?digest=0ea05982b66f2fe2e54764da3f39ffc1a9f13d9cd6becfdcb956adb647f4e8af) | [EVIDENCE-05](devrelay-artifact://EVIDENCE-05?digest=f6ca02d5c5b83e75cd85434c6b33045c5a7e8ad165bb4a1a69c847d64258cd45) | none |
| 6. `WorkDependencyAnalysis` | `establish-dependencies` | None | approved | approved | 1 attempt | Unavailable | [WDB-AUTH-DESKTOP-001](devrelay-artifact://WDB-AUTH-DESKTOP-001?digest=38e8d7cb9f058f7d7e129e84378ac15f578b1e79332ed1d1c26dc2127d0079b4) | [EVIDENCE-06](devrelay-artifact://EVIDENCE-06?digest=39fd5eefb872bfa96e3bfdbce3f8cdeed34c15f2897646591e59a31a083135e1) | none |
| 7. `SpecialistAssignment` | `assign-specialists` | None | approved | approved | 1 attempt | Unavailable | [SAB-0FC99DBACB77102B](devrelay-artifact://SAB-0FC99DBACB77102B?digest=6715aea2e74a7efa9ac644e44211bb81eaf6fbd2f4649f962ad485740dc317e7) | [EVIDENCE-07](devrelay-artifact://EVIDENCE-07?digest=b63b990f1e34c3143da5a281dd2d917903ac428615f160f75d54e5ea95d58365) | none |
| 8. `WorkExecution` | `execute-ready-frontier` | None | completed | not-applicable | 1 attempt | Unavailable | [AUTH-SOURCE](devrelay-artifact://AUTH-SOURCE?digest=e7c1dbc56978d324c8fbc94130b6a38477f5498193b20498e391ff7f076f26f0) | [EVIDENCE-08](devrelay-artifact://EVIDENCE-08?digest=bc49ed12a243e12bb0ec288d79fc271c67f8cfc4b90ad7537c6f76f6ca97c4cc) | none |
| 9. `WorkItemVerification` | `verify-work-items` | None | approved | approved | 1 attempt | Unavailable | [AUTH-TESTS](devrelay-artifact://AUTH-TESTS?digest=77fa100d038e501da14c91ef54b0787dd37318a5751506fb437637cf167a03d4) | [EVIDENCE-09](devrelay-artifact://EVIDENCE-09?digest=a01943a513fa3f1691ebe44d43f0004ada6629cf0c7c6d5fe2c9f85f34c41f8d) | none |
| 10. `ChangeIntegration` | `integrate-change` | `local-git-integration` `0.1.0` | completed | not-applicable | 1 attempt | Unavailable | [AUTH-COMMIT](devrelay-artifact://AUTH-COMMIT?digest=43d78f16d51a75d5b389c5dd836b3ca6490ddb1a000000000000000000000000) | [EVIDENCE-10](devrelay-artifact://EVIDENCE-10?digest=83456c7253666658f8bf618c9d032c2adebe062111a684afab042fdfe4c6790e) | none |
| 11. `TraceabilityGraph` | `merge-lifecycle-links` | None | completed | not-applicable | 1 attempt | Unavailable | [traceability-graph-auth-001](devrelay-artifact://traceability-graph-auth-001?digest=f7905eaaf4a0c314a61d536ab285cfdccac8e3f8813609b8cf95c2a6ad5d8f72) | [EVIDENCE-11](devrelay-artifact://EVIDENCE-11?digest=872c193c3a7df9f1a20e19e6acb2e4add76d52b0d47d14b1793b6c7ab72eb738) | none |
| 12. `SystemVerification` | `verify-integrated-system` | None | completed | not-applicable | 1 attempt | 4 count (measured) | [SYSTEM-EVIDENCE-AUTH](devrelay-artifact://SYSTEM-EVIDENCE-AUTH?digest=18a76a17c91285e7c2ed4083294213406040821c7f111dd17498ad14de9e3ecd) | [EVIDENCE-12](devrelay-artifact://EVIDENCE-12?digest=b336f19eb2a1a25e0be34f61c095cba2dede3d5c21027d39853604a0194dbf8e) | none |
| 13. `BusinessAcceptance` | `accept-system` | None | approved | approved | 1 attempt | Unavailable | [BUSINESS-ACCEPTANCE-AUTH](devrelay-artifact://BUSINESS-ACCEPTANCE-AUTH?digest=18a76a17c91285e7c2ed4083294213406040821c7f111dd17498ad14de9e3ecd) | [EVIDENCE-13](devrelay-artifact://EVIDENCE-13?digest=7d35539cce5c4edd2028d480882ff69784ce386d14bf48cd5579c331387dcf6d) | none |

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
- [AUTH-SOURCE](devrelay-artifact://AUTH-SOURCE?digest=e7c1dbc56978d324c8fbc94130b6a38477f5498193b20498e391ff7f076f26f0)
- [AUTH-TESTS](devrelay-artifact://AUTH-TESTS?digest=77fa100d038e501da14c91ef54b0787dd37318a5751506fb437637cf167a03d4)

## Next action

none

---

Generated by DevRelay LifecycleRunReport renderer 1.0.0. This report is a read-only projection; linked canonical artifacts remain authoritative.
