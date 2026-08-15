# SIM-001 ContractGate candidate

Status: eligible for exact owner approval

The approved architecture introduces seven provider-neutral contract intents. ContractGeneration retained all 59 current contracts and generated seven additions, yielding a 66-contract compatible candidate with no removals or modifications.

## Added contracts

- `IF-SIM-FACADE`
- `IF-SIM-PROFILE`
- `IF-SIM-API-TIERS`
- `IF-SIM-EVIDENCE-ASSET`
- `IF-SIM-HOST-STATE`
- `IF-SIM-HOST-EXECUTOR`
- `IF-SIM-CLI`

## Exact approval identity

- ContractChangeSetDraft: `sha256:3ef22bc3e36c902a0d3c80aa269acf1f99a1a51f33b49f620f65a1afb67f578d`
- ContractGate review: `sha256:67073f6d85b49e337459082c427c1e318bc51466c753dd0d9c1fea5d2bc45e12`
- ContractGate candidate: `sha256:6d638167804337ca1601bc06cf1125f8c8dbb89ac4a17ae99de70ff0a0bda97e`
- Terminal checkpoint: `sha256:fd2b9b9df303345c264f0885ab478ecbee00977d811a90a8a4fd85548522f7ea`
- TraceabilityUpdateSet: `sha256:937739872bdcb68d9eef524142bae7b8300ab0ecbc390ed212afe3a4e2c15d0a`
- ModuleExecutionRecord: `sha256:752b6f34df6d8c3722f2048b1fc00a1691920d44533ac82a68b43d05232a603d`

## Evidence

- All 66 JSON Schema 2020-12 artifacts passed independent validation.
- The canonical diff contains seven backward-compatible additions only.
- Traceability was validated and atomically merged.
- Exact checkpoint replay invoked the generator zero additional times.
- Focused ContractGeneration regression suite: 12 passed, 0 failed.
- Repository gate: 908 passed, 5 failed, 2 skipped. The five failures are transition failures from historical tests coupled to the previously current V0.11 baselines; they must be resolved as explicit SIM-001 work before release acceptance.

Approval is limited to the exact artifacts and digests above. Any byte change requires a new candidate.
