# DevRelay current implementation status

Last reconciled: 2026-09-18 CST
Protected branch: main
Working branch: codex/modular-zeroshot (isolated MES-001 construction worktree)
Released version: 0.11.0-rc.3
Candidate version: 0.11.0-rc.4 (unreleased, not yet accepted)
Latest published tag commit: 0284fb781d38aaba7538cb62fb82a1a022280eb9
Release boundary: GitHub source plus a deterministic installable tarball operated through ChatGPT/Codex Desktop on Windows

## Status

### Modular engineering build — 2026-09-18

MES-001 carries the owner's modular DevRelay vision: ready-made workflows with
swappable Modules/adapters/agent configurations, native Desktop workers on
Windows orchestrated by pinned Zeroshot, bounded Meta-Harness executable-code
experiments, and the existing lifecycle, traceability, ProjectMemory and controls.

The actual Requirements Gate has approved the paired project baseline version
2.9.0; its exact bytes and deterministic `ProjectOverview.md` are now published
in this worktree's project files, with the prior 2.8.0 pair preserved in history.
Architecture Gate approved the MES change in the durable lifecycle store.
Zeroshot's independent acceptance and correctness reviewers accepted the repaired
contracts; ContractGate approved and activated `CB-DEVRELAY-MES-001`, preserving
94 prior schemas and adding nine interfaces. The WorkBreakdown, dependency and
assignment Gates have now approved and activated 11 new deliverables alongside
nine retained items, covering all 23 MES acceptance criteria. The approved
planning baselines and their actual Gate records are published in this worktree;
`project/modular-engineering-publication.json` records the exact projections.
The unchanged quality policy is activated in the construction store.

Core derived the initial ready frontier from an empty current completion ledger:
MES composition, change handoff, recovery, and the retained RP artifact contracts.
Historical acceptance has not been imported as current completion. Recovery is
selected first to diagnose the prior long-running host lease failure and prove
bounded restart/ownership behavior before broader native execution. Its actual
Zeroshot worker and two independent reviewers have finished successfully.
WorkExecution recorded a 12-file proposal with one executor call and zero-call
replay; its trusted traceability update was checkpointed and merged. Independent
checks passed 75 focused tests and seven bounded Desktop host tests. The old
failed full-host run remains failed; its measured event-loop gap does not prove
OS sleep. No MES work item is yet formally verified or integrated.

The recovery candidate adds controlled host clocks/scheduling, sticky ownership
failure diagnostics, queue/readiness reconciliation, unique acquisition tokens,
commit-time expiry rollback, and a fresh ownership check before native dispatch.
The exact-byte verification/integration handoff needs a compatibility repair:
five current approved baseline byte digests differ from the canonical hashes
assumed by the older input helpers. Preserve their exact approved references.
The complete host fixture, full regression, formal verification/integration,
installed assurance and BusinessAcceptance remain outstanding.

The owner requested a GitHub update. The construction branch is published at
`codex/modular-zeroshot`; these are reviewable implementation candidates, not a
new accepted release. Compact recovery evidence is indexed in
`dogfood/modular-engineering-20260918/publication/recovery/candidate.json`.
Full native records and the durable construction store are retained locally;
the compact publication is not a portable replay bundle. GitHub's push response
also reported 13 high-severity dependency alerts on the default branch; those
alerts require separate triage and are not a claim about this candidate's cause
or exploitability.

A bounded candidate fix maps the existing-project repository snapshot into the
unreleased v3 assignment input, rejecting ambiguous roles without rewriting
approved work bytes. Its 13 runtime/Gate tests pass. This bootstrap correction
has now passed the actual current-baseline assignment handoff. It remains subject
to later work verification and is not a completed WorkExecution item.

Evidence is under `dogfood/modular-engineering-20260918/`. Construction drivers
invoke actual Module runtimes and owning Gates but do not establish the complete
installed product flow. Preserved rc.4 source candidates remain unaccepted;
implementation reconciliation, source verification, integration, installed
Windows execution and BusinessAcceptance remain outstanding. Earlier status
entries below are retained as history, not current MES baseline authority.

### Resume checkpoint — 2026-09-18

Owner authorized lifecycle reconciliation and dependency-safe parallel work.
The approved requirements/overview preservation check passed again (1/1).
Architecture and downstream planning still require existing-project change
lineage; the fresh-project host handoffs cannot substitute for this route.
See `docs/specs/runtime-dogfood-reconciliation.md` for the concrete recovery path.

The saved expanded host test `full-host-claim-current-20260914.log` is terminal:
**FAIL 1/1**, 12445783.0596ms, DR4924 during lease renewal at the assertion on
`test/desktop-local-host.test.mjs:650`. Diagnosis is pending. Earlier pending-run
notes below are historical, not current status. No release acceptance is claimed.

### Current release checkpoint — 2026-09-14

The runtime release is **not complete**. The ordinary user experience is intended
to be describe the work, approve its plan and decisions, follow progress, and
receive verified results. Modules, worktrees and evidence remain inspectable
implementation details, not separate systems the operator must manually manage.
The local visual workspace remains the next stage, not a current release claim.

Dogfooding audit: recent runtime host edits were made directly and verified with
tests, not fully orchestrated through DevRelay's lifecycle. Current project work
planning still binds historical RP-001 requirements rather than the current
HO-001 pair. See `docs/specs/runtime-dogfood-reconciliation.md`. Do not count these
edits as accepted lifecycle work or retrofit approvals to their test evidence.

Current-source memory regression passed **44/44** (7709.9292ms), covering memory
artifacts, context, conclusion, traceability, Module contracts, QC memory closeout,
and validation of the retained historical Desktop acceptance proof. This is not
a fresh live Desktop acceptance run. Conclusion now rejects mismatched canonical
input references, cross-task candidate substitution, worker promotion, and
memory-only approval of changes routed to another owning Module/Gate.
Exact conclusion replay also rejects changed graph, provider or source evidence
without performing another commit; a regression reproduced the prior bypass.

Bootstrap passed against ProjectMemory baseline `PMB-MUC-7A172C974C0158E7`
(1.0.11), and the prior session is concluded. The obsolete rc.1 next-action still
requires RoadmapManagement resolution and supported memory ingestion: integrity
of recovered bytes does not establish freshness of their meaning.

The long host preparation test passed **1/1** (3151884.5803ms, about 52.5 minutes),
including assignment activation, queue preparation, read-only queue verification,
quality preparation/verification/replay and unchanged-queue quality preservation.
It loaded source before the latest memory/worktree/validation and request-reuse
changes, so it is not frozen-source release evidence. A new current-source run
is active in `full-host-quality-current-20260914.log`; its result is pending.
Late verification takes minutes; acceptable operator latency remains unproven.
This fixture ends at preparation: it does not execute an actual Desktop worker,
review/integrate its code, or establish full business acceptance.

Remaining release work includes composing actual Desktop dispatch and worktree
claims with current quality authority, execution/review/integration through
system verification and acceptance, memory freshness and recovery, human
controls, security triage, current-source installed-package acceptance, and
final source/package sealing and publication. Component tests do not substitute
for that composed workflow.

### Earlier implementation checkpoints (historical, not cumulative release proof)

Full no-contract host verification through dependency activation passed 1/1
(1255357ms, about21min). This includes work/dependency context preparation,
execution, approval, activation and read-only/replay assertions; it does not include
the newer assignment CLI assertions. The expanded assignment-Gate run is active.

Durable assignment activation now checkpoints graph preparation before merge,
reserves the pending baseline head, publishes the raw baseline and atomically
records its activation. Interruption after merge and storage reopen recover with
one total merge. Current/stale/pending head and historical-replay tests pass in
the 27-test suite (26282ms). The host now registers the opt-in assignment contributor
and exposes explicit activation plus read-only evidence verification; full host
activation assertions are added but unrun. Existing-assignment replacement/change
activation remains a separate missing contract; the new transaction handles initial
activation and exact replay, not an inferred replacement.

The opt-in assignment activation contributor now projects approved work-to-profile
edges from the exact v3 Gate baseline/draft and pinned specialist catalog. Profile
details come from the catalog, not the first work item's requirements. Real graph
preparation passes with approved work endpoints and leaves the live graph unchanged.
The 27-test suite passes (21045ms); existing specialist/traceability tests also pass
5/5 (3740ms). The contributor is not yet registered in the live host: checkpointed
activation, publication, current-head checks and interruption recovery remain open.

Assignment native execution and approval preparation now have separate CLI
controls. Execution requires an explicitly configured exact v3 Module and native
binding, an exact handoff, and durable checkpoint verification. Gate preparation
requires the current context plus explicit owner approval and evidence; it stops
at awaiting-assignment-activation. Evidence/read-only verification covers both
records. The related 27-test suite passes (19519ms), and the execution command
boundary test passes (1/1,29095ms). The full host fixture includes these new
assertions but has not yet executed them. Graph activation and agent dispatch
are not implied by this implementation checkpoint.

Assignment preparation/publication now have closed CLI submission and resume
controls, sealed context records, and evidence/read-only verification paths.
The host verifies the exact activated dependency context before preparing the
next session. Resume returns the latest published configuration directly. The
focused facade regression passed 1/1 (33002ms), including mixed-command rejection.
The full host fixture now includes assignment context publication and startup,
but those newly added assertions have not yet run; current end-to-end evidence
must not be inferred from component or command-shape tests.
The related work/dependency/assignment regression now passes 27/27 (20961ms).

Assignment context publication now writes the exact handoff artifacts and session
before publishing the next host configuration. It supports no-clobber recovery,
repeat publication and read-only verification while preserving configured modules
and grants. The host recognizes the explicit specialist-assignment contract set;
this does not install a provider or activate assignment graph facts. The combined
26-test regression passes (12932ms), including interrupted-copy recovery. CLI
commands for assignment handoff/execution/approval are still required.

Newest assignment integration: the opt-in version-3 native runtime now preserves
approved raw bytes and ArtifactRefs, validates full checkpoint derivation, and
returns genuine replay receipts. Its new approval Gate requires a closed,
versioned owner approval with exact candidate/checkpoint/fingerprint binding and
digest-checked evidence. Version-1/version-2 runtime behavior remains unchanged.
The v3 Module definition passes generic registry validation; complete release
catalog/conformance integration is not yet established.

Local assignment planning/context now pin v3, and a durable execution wrapper
uses exact upstream activation proof, an explicit native binding and storage
checkpoints. Work/dependency/assignment tests pass 26/26 (8451ms), including
independent storage reread, unchanged approved IDs, corruption rejection, and
pending-approval fresh-execution blocking with historical replay. These tests
use synthetic upstream/approval fixtures and do not prove live agent dispatch.
CLI publication, assignment baseline graph activation and downstream work remain
unfinished. A fresh no-contract full-host test is running with a durable log;
the prior handle disappeared without a captured result and is not counted green.

Latest local integration checkpoint: the full no-contract host test failed at
work activation because the separate-command allowlist omitted the public
facade's sessionContext, configurationDigest and host bindings (1/1 failed,
1058268ms). The allowlist is now corrected for work activation and dependency
controls; the focused real-facade regression passed 1/1 (22408ms), including
mixed-command rejection and unchanged checkpoint proof. The complete host flow
still needs a fresh successful run. This does not change release readiness.

Assignment input planning now binds the activated dependency baseline and its
approved work lineage to the seven inputs of specialist-assignment 2.0.0. It
preserves the exact overview, capability catalog and repository context, requires
an explicit specialist catalog and assignment policy, and rejects fresh planning
while dependency approval is pending. Historical verification does not clear the
pending approval. Work/dependency regression tests pass 15/15 (14336ms), including
this new input handoff. Assignment execution, session publication and downstream
host integration remain unfinished; no agents were dispatched by this test.

The assignment session handoff now has closed boundary/handoff schemas and a
fresh session receipt. It retains the exact memory, synopsis, traceability and
approved project bindings, replaces the prior lifecycle boundary, and rejects a
repository revision that differs from the session. Historical handoff verification
does not authorize progression during pending approval. The work/dependency
suite passes 15/15 (18574ms) with this coverage. These are synthetic fixture
bindings, not a new live Desktop memory acceptance test.

Assignment execution compatibility remains open: the published v2 runtime
validates input digests against canonicalized objects and derives a repository
artifact ID from repository name/revision. The local host must retain approved
raw-byte digests and ArtifactRefs. Do not rename or reserialize approved inputs
to make that runtime accept them; address this in an explicitly versioned binding.
The new assignment context is not yet exposed through CLI publication/dispatch.

The latest in-process host fixture now passes discovery through architecture,
native contract generation, candidate traceability, ContractGate preparation,
approved contract graph/state activation, read-only verification and replay.
It passed 1/1 in 614184ms; this runtime cost remains a release performance concern.
Approval data is synthetic test evidence, not human acceptance. The zero-contract
host approval branch also passed (1/1,352999ms). Its new durable graph/state
activation recovered after an interrupted merge and reopened storage (1/1,27871ms).
Desktop activation wiring and read-only/replay verification now pass the
zero-contract host fixture (1/1,2123746ms, about35min). This is functional
fixture evidence, not an acceptable performance result or release acceptance.
Downstream WorkBreakdown/lifecycle integration and final frozen-source release
verification remain open. The new work is uncommitted and unsealed.

The Windows CLI discovery-through-architecture-activation fixture passed in
339933ms (1/1, no skips). Durable interruption/reopen tests now cover both before
and after graph merge, exact prepared-checkpoint reuse, zero repeated design
calls and historical replay without head rollback. The related runtime/activation
regression suite passes 39/39. This is synthetic integration evidence, not human
release acceptance. Downstream lifecycle composition remains incomplete; final
frozen-source package and release verification are still required.

The latest in-process fixture now passes discovery through ArchitectureDesign,
owning ArchitectureGate preparation, approved graph/state activation, read-only
verification and exact activation replay (1/1, no skips). Sixteen focused tests
cover contributor binding, Gate authority, pending-state restart guards and the
closed activation record contract. This uses synthetic approval evidence, not
human release acceptance. A Windows CLI rerun is underway. Activation crash
injection, downstream lifecycle composition and final release verification remain
open; earlier paragraphs below describe historical candidate milestones.

ArchitectureGate preparation is now connected to the host. The latest in-process
fixture completes discovery, approval, activation, context publication, all three
ArchitectureDesign steps, Core verification/replay and exact owner-evidence Gate
preparation. It also rejects a wrong repository revision and verifies the sealed
Gate read-only. Forty-two focused architecture/Gate tests pass. The complete
Windows executable rerun is pending; an earlier run exceeded the test harness's
60-second terminal-process budget, now bounded at 180 seconds. Runtime lease
expiry checks remain unchanged. Performance, baseline activation, remaining
lifecycle stages and final package/release verification are still open.

The latest in-process integration fixture completes the full ArchitectureDesign
designer/modeler/decision-recorder chain after discovery approval, activation
and context publication, with Core verification and exact replay. The extended
Windows executable test is running. ArchitectureGate host approval is not yet
connected. A Gate outcome mismatch (drafted versus released baseline_drafted)
was corrected; 41 architecture runtime/change tests pass. A terminal run exposed
the fixed 30-second host lease limit; bounded renewal now preserves exact lease
ownership and rejects expired/stale renewals. Eleven storage/lease checks pass.
These uncommitted additions still need full host and package verification.

Discovery Gate preparation is committed in draft PR #34 at d7c14959. Final checks
passed: 31 focused tests, all seven Windows host tests, static verification and
472 exact installed-package files with 237 exports. These remain bounded fixture
and component proofs, not complete lifecycle acceptance.

The current uncommitted addition implements explicit discovery-state activation:
owning Gate revalidation, exact state-byte persistence, an atomic state-head and
journal transition, read-only verification and stale-state rejection for new
runs. The expanded Windows activation test passed (1/1, no skips), as did two
authority/head guard tests and twelve baseline/provenance/history checks.
Downstream configuration
publication, actual ArchitectureDesign execution and full release acceptance
remain incomplete. The package results above do not cover this new addition.

The subsequent context-handoff addition now publishes immutable downstream
configuration files and derives the ArchitectureDesign route through Core. The
in-process fixture passed through discovery, approval, activation, publication,
read-only verification and a real pending Desktop designer step. Two Windows
attempts exposed fixture-native provenance gaps, which were corrected without
weakening validation. The corrected Windows executable rerun is pending.
This does not yet complete the designer/modeler/recorder chain or ArchitectureGate.

The handoff candidate submitted in draft PR #33 validates the complete materialized
discovery evidence bundle and preserves exact prior gaps during reevaluation.
An explicit candidate interpretation now binds observational findings to a
structured design-input snapshot, with exhaustive observation/gap dispositions,
source provenance and unchanged gap materiality. The broader host, interpretation,
gap and ArchitectureDesign regression passed 56 tests with no failures or skips.
Subsequent exact-predecessor revision history passed the Windows CLI test;
mapping-target and attached-content validation passed nine focused checks.
The host now accepts a separate interpretation submission against the genuine
Core discovery receipt, persists candidate evidence, and stops for approval.
Restart verification and immutable replay pass the focused host test. Its exact
candidate package verified 468 files and 234 exports; static checks passed.
PR #32 and PR #33 now both have all eleven checks passing.

The current uncommitted discovery Gate addition binds owner evidence to the
latest interpretation and genuine Core receipt, blocks unresolved/material gaps,
and prepares an observational next state. The host persists the Gate commit,
rejects replacement after sealing, and rederives the decision on read-only
verification. Focused baseline/ArchitectureDesign/receipt/closure/history/gap
checks pass 31/31. The expanded Windows CLI preparation/replay/restart test,
including closed commit validation and approval/evidence negatives, passed on
retry (1/1, zero skips). An earlier attempt timed out during candidate submission.
Broader host regression and package checks remain pending. Durable next-stage activation and full
lifecycle acceptance remain unconnected. Prior package verification does not
cover this uncommitted Gate addition.

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
