# DevRelay current implementation status

Last reconciled: 2026-09-14 CST
Protected branch: main
Working branch: codex/discovery-design-handoff
Released version: 0.11.0-rc.3
Candidate version: 0.11.0-rc.4 (unreleased, not yet accepted)
Latest published tag commit: 0284fb781d38aaba7538cb62fb82a1a022280eb9
Release boundary: GitHub source plus a deterministic installable tarball operated through ChatGPT/Codex Desktop on Windows

## Status

The current uncommitted handoff candidate validates the complete materialized
discovery evidence bundle and preserves exact prior gaps during reevaluation.
An explicit candidate interpretation now binds observational findings to a
structured design-input snapshot, with exhaustive observation/gap dispositions,
source provenance and unchanged gap materiality. The broader host, interpretation,
gap and ArchitectureDesign regression passed 56 tests with no failures or skips.
Subsequent exact-predecessor revision history passed the Windows CLI test;
mapping-target and attached-content validation passed nine focused checks.
The host now accepts a separate interpretation submission against the genuine
Core discovery receipt, persists candidate evidence, and stops for approval.
Restart verification and immutable replay pass the focused host test. Review,
durable next-stage activation and full lifecycle acceptance remain unconnected.
Package/static evidence below describes the prior PR #32
candidate, not these uncommitted additions.

The next local candidate connects explicit offline native architecture discovery
through the Windows CLI, Core, durable inventory checkpoints and traceability.
Discovery 0.1.1 declares its required paired requirements input; released 0.1.0
remains unchanged. A matching contributor 1.1.0 is isolated from its predecessor.
Source evidence uses explicit UTF-8 text contracts with strict byte digests and
opaque graph projection. The native subprocess flow passed including missing-
grant rejection, read-only verification, exact replay and new-run source drift
rejection. Broader Core regression passed 59 tests; combined regression passed
88 tests with zero failures or skips. Installed-package verification passed
463 exact catalog-bound files and 232 installed export targets, including native
discovery, checkpoint replay and source-drift rejection. These use fixture
context, not a production-code acceptance run. Downstream ArchitectureDesign/Gate
connection and full code-production acceptance remain incomplete.

The full release-completion goal is active. The current repair slice removes
false-success CLI behavior and patches the active dependency graph to fast-uri
3.1.7 and js-yaml 4.3.2. Subprocess CLI tests, offline security regressions and
the exact approved requirements/overview pair pass targeted verification.
Full installed-host integration is still incomplete; neither these tests nor
the existing injected-host library tests establish final product acceptance.
See [the current repair record](dogfood/release-completion-20260913/README.md).

The repair commit `630116f937a73689855ad7f5ebb6c721419b1362` is submitted in
draft PR #26; all eleven GitHub checks passed. The next integration candidate
adds an immutable Core/traceability checkpoint bridge over the existing
SQLite/CAS host. Thirty-three targeted tests pass, including Core checkpoint
verification in a separate process with zero fixture-adapter calls during
replay, and exact trace-checkpoint recovery after reopening storage. This does
not yet connect the full CLI. All eleven checks for its commit
`1d1d05fbaf7d7d7c98bb9256282f951ef784ec82` (PR #27) have now passed.
The subsequent candidate adds durable graph storage with atomic head/receipt
publication, indexed journal lookup and actual cross-process recovery tests.
Full installed Desktop workflow acceptance remains open; see
`docs/local-host-traceability.md` for the exact component boundary.
All eleven checks passed for the durable graph commit
`f68b04a8e74590f86878043992fcf5323cfc3c02` in PR #28.
The next candidate connects all seven executable commands to the real public
facade and Core through an explicitly configured Windows local host. It adds
durable Desktop step requests, candidate response ingestion, exact checkpoint
resume, read-only inspection and genuine Core/graph verification. It validates
the paired project context, ProjectMemory and prior-session disposition before
opening state. Its supported scope is individual module invocations, not yet
the complete lifecycle scheduler, managed worktree dispatch or operator view.
See [the connection guide](docs/desktop-local-host.md) and
[candidate evidence](dogfood/release-completion-20260913/desktop-cli-host.md).
The owner reconfirmed that Desktop remains the agent operator; no independent
agent-launching service or new credential connection is in scope.

The in-progress requirements Gate host increment accepts a separate, exact
change-pair submission after Core completes. It checkpoints both baseline byte
strings and the rendered overview together, revalidates saved records through
the owning Gate on read-only verification, and preserves the run version on
exact replay. Every cited approval must resolve to its exact nonempty bytes,
which are preserved with the pair and used during restart verification.
An explicit activation resume now revalidates the saved pair, checkpoints the
trusted versioned graph update before merge, and returns `requirements-activated`.
An explicit observer 1.1.0 host configuration is required; existing configurations
retain observer 1.0.0. Candidate facts remain separate, and read-only verification
checks the exact activation receipt. Refreshed session context and downstream
lifecycle progression remain incomplete.
Project-wide activation reservation prevents competing Gates from overwriting the
same old pair, recovers interruptions on both sides of graph merge, and blocks new
module work from stale sessions while retaining historical inspection.
Twenty-four targeted tests pass, including the change/Gate/activation/replay/verify sequence in
independent Windows CLI processes and the unchanged real project pair. See
[the scoped evidence](dogfood/release-completion-20260913/desktop-requirements-gate.md).
This candidate is not yet release-sealed; full integration verification is pending.

The Gate increment is submitted in draft PR #30 at
`b58d3c6ecf8521705621b0a23a91b4b1efa7f800`; its final offline package check passed
456 catalog-bound files and 228 installed export targets. The next local candidate
adds an explicitly requested requirements-context handoff after activation. It
preserves historical session/memory bindings, exposes invalidated downstream work,
and rederives the new snapshot and receipt on verification. Explicit immutable
next-configuration materialization is implemented, with no-clobber publication,
interruption retry and read-only file verification. The Windows flow reached
new-configuration initialization and correctly rejected adopting the old run.
Its final historical inspection exposed an existing CLI bug: an omitted subject
was forwarded as undefined and rejected by strict canonical hashing. A focused
regression reproduced the defect; the repair now passes all 35 combined tests.
Static verification passed, and offline package verification passed 462 exact
catalog-bound files and 232 installed export targets, including context refresh,
new initialization and historical inspection. See
[the scoped evidence](dogfood/release-completion-20260913/desktop-context-handoff.md).
Normal downstream lifecycle routing remains incomplete,
so no agent dispatch or full installed-product acceptance is claimed.

ProjectMemory is now baseline `PMB-MUC-7A172C974C0158E7`, version 1.0.11,
digest `sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4`.
The publication session is concluded and the fresh bootstrap passed on this
branch. The obsolete rc.1 next action remains pending RoadmapManagement; it is
not silently treated as current release direction.

## Accepted HO-001 slice — historical evidence

HO-001 is implementation-complete, system-verified, and owner-accepted for controlled rc.3 candidate sealing. It adds `human-orchestration@0.1.0` as an independently versioned cross-cutting Module without changing the deterministic construction lifecycle or acquiring Gate, verification, integration, traceability, semantic-memory, or owner authority.

The deterministic `HumanOrchestrationView` composes the complete agent/sub-agent tree, dependency-safe work queue, active work, blockers, quality obligations and evidence, pending approvals, durable worktree leases, and ProjectMemory sessions. It derives readiness from the existing Desktop/Core frontier and records the exact source-bundle and view digests.

Nine typed requests—message, handoff, pause, resume, cancel, retry, approve, reject, and reprioritize—route only to the Desktop task adapter, Desktop orchestrator, target Gate, or WorkDependencyAnalysis boundary that already owns the action. Every request pins the displayed view digest and durable state version; stale, unsupported, failed, and replayed outcomes are explicit receipts, and exact replay dispatches no duplicate effect.

The pre-conclusion acceptance suite completed 1,204 tests with 1,202 passing, zero failures, and two intentional environment-dependent skips in 795,808.5969 milliseconds. After adding the exact ProjectMemory fresh-task proof, the final `release:check` completed 1,205 tests with 1,203 passing, zero failures, and two intentional skips in 615,271.9174 milliseconds. The local projection proof covered 1,000 work items and 1,000 task observations in 131.1791 milliseconds against the 500 millisecond threshold. Installed-package verification passed 437 exact catalog-bound files and 218 installed export targets, including a real HumanOrchestration view/control/replay smoke.

The personal `devrelay-desktop@personal` plug-in is installed, enabled, and validated at `0.1.1+codex.20260909185701`. Its installed `devrelay-orchestrate` skill is byte-identical to the repository skill and now exposes the human operator view and typed intervention workflow. ChatGPT Desktop project instructions and the managed task prompt remain the supported startup boundary; no undeclared automatic hook is claimed.

ProjectMemory Gate promoted baseline `PMB-MUC-D4C52E4B6B7371E5` version 1.0.10 with digest `sha256:d36f50386a2c876aee924fe39e235001377dece11a941b5a2bec09d0b521fa0e`. A fresh task recovered `MEM-DEVRELAY-STATUS-HO001-RC3-CANDIDATE` from synopsis digest `sha256:911ed122691dcc589499ead0cd33f7bd6cddc5184cea941d5b37604257d4034c`; exact replay made zero provider calls. The graph checkpoint remains `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee` because HumanOrchestration contributes candidate-only lineage. Replacing the obsolete rc.1 next-action is explicitly pending as `CHANGE-HO001-NEXT-ACTION-REPLACE` for RoadmapManagement rather than being promoted by the wrong authority.

## HO-001 lifecycle at its acceptance boundary

RequirementsGathering / RequirementsGate                  promoted paired project baseline 2.8.0
ArchitectureDiscovery                                     deterministic skip; current inventory sufficient
ArchitectureDesign / ArchitectureGate                     cross-cutting operator/control design approved
ContractGeneration / ContractGate                         HumanOrchestration schema and Module contract approved
WorkBreakdown / WorkDependencyAnalysis                    seven deliverables in an acyclic dependency plan
SpecialistAssignment                                      bounded implementation, verification, Desktop, traceability, and documentation roles
WorkExecution / WorkItemVerification                      implementation sealed at 119c08560273657f8d1720c9e459c033313faf50
ChangeIntegration                                         candidate branch contains the exact implementation and evidence
SystemVerification                                        final release gate: 1,205 tests; 1,203 pass; zero fail; two intentional skips
BusinessAcceptance                                        accepted for controlled 0.11.0-rc.3 candidate sealing
ProjectMemory /conclude                                   baseline 1.0.10 promoted; fresh-task read and zero-call replay passed
ReleasePreparation                                        release:check passed; 11,528 repository digests, 437 package paths, and 218 installed exports verified

## Published evidence retained

- Release: https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.3
- Release pull request: https://github.com/GarrettAudet/DevRelay/pull/22
- Protected-main release tag commit: `0284fb781d38aaba7538cb62fb82a1a022280eb9`
- Release workflow run: `34469983856`
- Publication-memory follow-up: https://github.com/GarrettAudet/DevRelay/pull/24 (merged at `b9fdc997c21269c22ae2c46abbbb544b4e982c32`)

## Next action

Complete the durable Desktop host/installed CLI integration; reconcile roadmap
and historical security findings; run a fresh installed-product change through
memory, isolated worktrees, quality, human orchestration and crash recovery;
then obtain independent human review and BusinessAcceptance before sealing a
new release. rc.4 is not yet ready to tag or publish.

The owner requested a connected visual memory/requirements/lifecycle/work
workspace and explicitly chose **runtime release first, visual workspace next**.
The [deferred visual-workspace intake](docs/specs/visual-workspace-intake.md)
preserves the request and proposed acceptance checks. It does not add a visual
application to the current runtime release or mark one implemented.

This candidate does not claim public npm publication, one-click managed plug-in distribution, a hosted backend, non-Windows support, live upstream interoperability from fixture evidence, or guaranteed defect-free output.
