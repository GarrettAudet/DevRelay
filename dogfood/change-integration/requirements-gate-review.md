# Requirements Gate candidate: ChangeIntegration module

Status: **owner-approved boundary; exact candidate pending atomic promotion**

## Exact bindings

- RequirementsBaseline: sha256:f9ea89ac760902ee1f3285b9816603dd82ecf47c2451a6b4558b51772c939438
- ProjectOverviewBaseline: sha256:5c5a6678356be97ff75a68b357262e1a49b50fe010f4401897fed497b682b886
- Confirmed design basis: sha256:c6d5b29ebae2f48d91c3d64d468e915d46b27009f2199ef6051ddd51b4c51036
- RequirementsChangeSet: sha256:93043c78b2944448944dabb4cb11d85bb2dffa9a6d609b1c699bc34f7e786376
- ProjectOverviewChangeSetDraft: sha256:f65918dd938868783f07472ffb20558325b52bdcd45513278afbf03fdf89b66c
- Candidate ProjectOverview.md: sha256:68aae534df2040f2f5ae6ea090917ece9e631eafa022e1cdc4b162206d3f2069
- NativeSourceBundle: sha256:8e775c865c3a2009d9cf4bfde9c73560e08f9d5e418f68b60f80dafa628c55e2
- Terminal checkpoint: sha256:4f641f6d630721e411da3deca5509a6c2f07c2b3a9f0d910a2bbb24ab8faf30f
- Execution proof: sha256:6f7676d9cebcd7af9ba50cac587716927a16b04894f79fb3b92507c17c1448c2

## Gate findings

- PASS: the user's four ChangeIntegration decisions close the product boundary without further clarification.
- PASS: the candidate preserves every unchanged requirement and adds only ChangeIntegration-specific lifecycle requirements.
- PASS: one invocation binds one exact verified work item, verified change, target repository snapshot, target ref, expected target commit, and integration policy.
- PASS: Core owns compare-and-swap and validation; the configured local Git adapter performs only the bounded effect under host-enforced grants.
- PASS: drift and conflicts leave the target unchanged; conflict reconciliation requires new WorkExecution and WorkItemVerification evidence.
- PASS: success returns exact integrated-change and post-state evidence, while SystemVerification and BusinessAcceptance remain downstream.
- PASS: ProjectOverview is a deterministic projection of the exact replacement requirements.

## Approval boundary

Approval must bind the exact paired change, candidate Markdown, native bundle, and terminal checkpoint. Any modification requires a new Requirements Gate candidate.
