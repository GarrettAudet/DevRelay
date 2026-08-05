# WorkDependencyAnalysis requirements

- Use one full-snapshot analyze-dependencies operation for every exact WorkBreakdownBaseline.
- A proposer returns a candidate; trusted Core validates graph mechanics; WorkDependencyGate verifies semantic completeness and owns promotion.
- Supply the full immutable candidate work-breakdown snapshot plus only declared relevant context slices, each pinned to an exact artifact version, content digest, or repository commit.
- Persist only the authoritative DAG; downstream runtime state derives the runnable frontier.
- Use a native structured proposer, OPA policy evaluation, Graphology-DAG for Core-owned graph mechanics, Spec Kit as a consistency reviewer, and optional Task Master or OpenSpec proposal adapters.

The full approved WorkBreakdownBaseline snapshot is the work-item universe. Context slices are explicit and version-pinned. Proposers and reviewers remain untrusted. Core owns deterministic graph mechanics; OPA decisions and semantic Gate review are required before promotion.
