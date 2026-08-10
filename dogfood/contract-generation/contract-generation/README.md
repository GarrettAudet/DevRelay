# ContractGeneration dogfood run

This directory is the deterministic `establish-contracts` execution over the
approved DevRelay requirements, ProjectOverview, and architecture baselines.
Core selected the operation because 14 interface intents require contracts and
no ContractBaseline exists.

`materialize.mjs` invokes the configured live JSON Schema generator once,
independently validates all native draft 2020-12 schemas, computes the canonical
initial diff, proves zero-call checkpoint replay, merges the trusted candidate
traceability projection, and emits `contract-gate-candidate.json`.

No file here grants approval. `ContractGate` promotion requires owner approval
bound to the exact candidate, review, checkpoint, and evidence digests.
