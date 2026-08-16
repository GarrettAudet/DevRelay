# RM-001: RoadmapManagement and session context bootstrap

## Status

Release candidate complete through accepted BusinessAcceptance on implementation commit `a812b6e9764f2ed27f6beef7a7832f9406b98bdb`.

## Boundary

`RoadmapManagement` is cross-cutting, not a construction stage. It owns `triage-candidate`, `review-roadmap`, and `reprioritize`. Detection can propose but cannot mutate the roadmap. Adaptive RequirementsGathering closes the idea first; the module recommends `keep`, `defer`, `merge`, or `discard`; human `RoadmapGate` approves changes.

The authoritative artifact is a content-addressed `RoadmapBaseline`; `Roadmap.md` is its deterministic projection. Explicit scoring covers alignment, value, urgency, risk reduction, effort, dependencies, and confidence. V1 excludes dates, staffing, scheduling, execution, and work-item status.

`DevRelaySessionBootstrap` runs at every fresh configured DevRelay task. It loads exact project, roadmap, baseline, lifecycle, gate, frontier, clarification, drift, and blocker context. Invalid or stale context fails closed. `RoadmapNotInitialized` routes to establishment. Approved changes refresh at the next module boundary; snapshots never replace invocation inputs or grant authority.

## Verification

- 993 tests: 991 passed, 0 failed, 2 intentional environment skips.
- Performance, catalog (7,756 digests), package (364 files), and installed exports (186) passed.
- Full Windows Desktop dogfood passed.
- Seven work items verified and integrated; frontier empty.
- SystemVerification verified; BusinessAcceptance accepted.
- Graph revision 19 has zero blockers.

See [MILESTONE.md](MILESTONE.md) and `dogfood/rm-001-roadmap-management/release/`.

## Next

The direct-child evidence commit and two-phase seal are verified. Run the clean branch-tip gate, push RC3, and promote through protected `main`. Every additional idea enters as a RequirementsGathering-backed roadmap candidate.
