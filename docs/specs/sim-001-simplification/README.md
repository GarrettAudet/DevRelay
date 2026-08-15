# SIM-001: DevRelay simplification and durable local host

## Goal

Make the verified deterministic runtime easy to adopt from ChatGPT Desktop on Windows through a small facade, explicit profiles, compact verifiable evidence, and a durable local host.

## Current stage

RequirementsGathering wave 1 is closed. The exact paired baseline candidate is being materialized for Requirements Gate approval. No architecture or implementation is authorized until that Gate promotes the pair.

## Approved decisions

- **Q-SIM-PR-001:** Preserve the verified V0.11 candidate, build stacked replacement changes from its evidence-sealed baseline, and close the superseded oversized pull request only after replacement pull requests exist.
- **Q-SIM-VERSION-001:** Target 0.10.0-rc.2 as the simplified advanced open-source preview and reserve 0.11 for the durable local reference host.
- **Q-SIM-HOST-001:** Keep ChatGPT Desktop on Windows as the primary supported product surface and provide a deterministic CLI beneath it as the host and operator boundary.
- **Q-SIM-PROFILES-001:** Provide quick, standard, assurance, and inspect workflow profiles; make standard the default and prohibit every profile from bypassing Core validation or required Gates.
- **Q-SIM-CLOSURE-001:** Require adaptive requirements interviewing with mandatory 0.99 closure in every profile while scaling question depth to risk, size, ambiguity, and change impact.
- **Q-SIM-FACADE-001:** Expose a small public facade centered on createDevRelay, createLocalHost, defineModule, definePlugin, run, resume, verify, and inspect.
- **Q-SIM-API-TIERS-001:** Move advanced contracts behind explicit package subpaths first and defer physical workspace package splitting until conformance proves the boundaries.
- **Q-SIM-EVIDENCE-001:** Keep minimal fixtures and compact dogfood evidence in Git, publish full checksum-bound evidence as GitHub Release assets, and do not rewrite repository history.
- **Q-SIM-PACKS-001:** Keep Godot and GdUnit4 in an optional domain pack and use the same pack boundary later for a TypeScript web-service reference pack.
- **Q-SIM-COMPAT-001:** Retain displaced public APIs under compat/v1 for one prerelease cycle with explicit deprecation metadata and migration guidance.
- **Q-SIM-REVIEW-001:** Require independent human review before a stable release; when unavailable, label the artifact as a preview rather than weakening the Gate.
- **Q-SIM-LOCAL-HOST-001:** Scope the durable local host to SQLite state, content-addressed artifacts, isolated Git worktrees, explicit grants, one Desktop/Codex executor, crash recovery, CLI commands, and measured performance budgets.
