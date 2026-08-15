# RM-001 RoadmapManagement tasks

## 1. Canonical artifact contracts

- [ ] Implement and validate roadmap, Gate, baseline, projection, session, receipt, refresh, and traceability contracts.
- [ ] Add strict malformed, drift, substitution, and explicit-input conformance fixtures.

## 2. RoadmapManagement module

- [ ] Implement `triage-candidate`, `review-roadmap`, and `reprioritize` routing.
- [ ] Implement deterministic native scoring and one-of-four disposition recommendations.
- [ ] Preserve optional adapter output without granting it authority.

## 3. RoadmapGate and baseline

- [ ] Validate exact approval-bound candidates and zero-call replay.
- [ ] Atomically promote `RoadmapBaseline`, `Roadmap.md`, and trusted traceability updates.

## 4. Fresh-task session bootstrap

- [ ] Load exact mandatory context for each configured fresh DevRelay task.
- [ ] Emit and validate `SessionContextReceipt` before module execution.
- [ ] Fail closed on drift and refresh at the next module boundary after baseline promotion.

## 5. Integration and documentation

- [ ] Register module/plugin manifests, exports, package files, examples, reports, and operator docs.
- [ ] Keep construction-stage ordering unchanged and document `RoadmapNotInitialized`.

## 6. Regression and performance

- [ ] Add authority, mutation, determinism, replay, projection, installed-package, and Windows tests.
- [ ] Prove cold/warm bootstrap and 1,000-item roadmap-review budgets.

## 7. Windows Desktop end to end

- [ ] From a fresh configured task, establish a roadmap, triage a net-new initiative, approve it, refresh context, and inspect the result.
- [ ] Seal exact lifecycle, traceability, performance, and BusinessAcceptance evidence without starting construction for the roadmap item.
