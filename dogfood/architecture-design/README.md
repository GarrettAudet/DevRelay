# ArchitectureDesign dogfood run

This directory is the authoritative RequirementsGathering run used to define
ArchitectureDesign 0.1.0 before implementation.

Flow:

```text
Goal + ProjectContext + RepositorySnapshot
  -> bounded OpenSpec devrelay-requirements agent-command bridge
  -> four visible clarification exchanges
  -> RequirementsDraft + deterministic ProjectOverviewDraft
  -> digest-bound ProjectOverview.md + terminal execution checkpoint
  -> checkpoint-only verification receipt (no adapter invocation)
  -> Requirements Gate: paired pass
  -> RequirementsBaseline + ProjectOverviewBaseline
```

The release regression in
`test/architecture-design-dogfood.test.mjs` executes the declared invocation,
persists its exact terminal checkpoint, then has the host replay that checkpoint
with `registry.verifyCheckpointedExecution`. Replay invokes no adapter and returns
an unforgeable in-process receipt. The gate consumes that receipt and binds the
exact invocation, result, requirements candidate, project-overview candidate,
rendered Markdown bytes, raw baseline JSON bytes, native-source bundle, and
clarification transcript.
The receipt is not serialized; portable cross-process proof is not shipped in
V1. The two baselines carry the same approval evidence
and version. OpenSpec CLI execution is deliberately not claimed; OpenSpec
performed only bounded requirements work, and DevRelay derived the overview.

- Approved RequirementsBaseline digest: `sha256:62bb8760efd5a7b9877dfb9f828b2a9cbad2f6625d51d1275ea588b530a306bc`
- Approved ProjectOverviewBaseline digest: `sha256:12d7f6d244184753a3915f0cf99e11e7a51a4387624ab2832af4d0e4bd107b1b`
- ProjectOverview.md digest: `sha256:fa6e6f96669bed0e6567b979cbf0c4c51d23ab51c1aca662bce07472b3756bad`
