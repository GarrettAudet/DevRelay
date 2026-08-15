# DevRelay SIM-001 simplification architecture change

## Context

The V0.11 runtime is deterministic and deeply evidenced, but ordinary use exposes internal contracts, the root API is broad, repository evidence is heavy, and no durable local host turns the library into a practical ChatGPT Desktop runtime.

## Decision

Add a thin public facade, immutable risk-scaled workflow profiles, explicit advanced and compat/v1 API tiers, checksum-bound release-asset evidence distribution, and a Windows local reference host using SQLite, content-addressed artifacts, isolated Git worktrees, explicit grants, one exact Desktop executor, crash recovery, and a deterministic CLI. Keep domain capabilities in optional packs and preserve all existing Core authority.

## Contract consequence

Facade configuration, profile policy, CLI requests/results, host state, artifact manifests, recovery journals, executor bindings, evidence assets, compatibility metadata, and performance observations require machine-validatable contracts before WorkBreakdown.

## Boundaries

Profiles never bypass validation or Gates. The host supplies effects but does not own lifecycle progression. Git history and the verified V0.11 evidence pair remain immutable. Stable release remains blocked without independent human review.
