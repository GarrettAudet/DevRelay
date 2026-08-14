# RequirementsGathering decision record - round 1

Date: 2026-08-13

Status: owner-approved requirements decisions

## RG-MQ-D001 - Adaptive depth with mandatory closure

Decision: approved.

RequirementsGathering uses adaptive interview depth. New, large, ambiguous,
high-risk, or weakly evidenced work activates more decision domains and deeper
follow-ups. Small, well-understood changes may take a shorter path. Every path
still requires mandatory closure before RequirementsGate progression.

The owner's phrase "99% confidence" is normalized into a deterministic
`RequirementsClosureAssessment`, not a model self-confidence claim:

- every applicable blocking decision is `resolved`, `approved-assumption`, or
  `not-applicable`;
- no contradiction, missing approval, or blocking unknown remains;
- weighted decision-domain coverage is at least `0.99`;
- the uncovered weight, if any, is non-blocking, explicitly identified, and
  accepted through policy;
- the assessment records its catalog version, weights, inputs, dispositions,
  score, and digest so Core can reproduce it.

A score below `0.99` or any blocking unresolved domain produces `clarify`.
RequirementsGate independently validates the closure proof.

## RG-MQ-D002 - Strategy plug-ins

Decision: approved as capability candidates, subject to adapter evaluation.

DevRelay will evaluate and support bounded requirements strategies from:

- GitHub Spec Kit: clarify, checklist, analyze, and specification-quality
  patterns;
- BMAD Method: coached discovery, product brief, pressure-testing, PRD
  validation, and readiness patterns;
- GSD: adaptive discussion, assumption surfacing, codebase-aware questions,
  and persisted interview logs;
- Superpowers: one-question-at-a-time discovery, alternatives, trade-offs,
  design presentation, and explicit approval;
- OpenSpec: brownfield exploration, proposals, delta requirements, and
  scenario-oriented specifications.

DevRelay adopts capabilities, not upstream lifecycle ownership. Each provider
must have a separately version-pinned adapter evaluation, permissions review,
Windows Desktop execution plan, native-artifact contract, and honest maturity
status before live invocation.

Core owns decision domains, question admission, deduplication, contradiction
detection, depth selection, coverage scoring, closure, Gate input, and
progression. Strategy adapters may propose questions, follow-ups, assumptions,
examples, and native artifacts only.

## RG-MQ-D003 - Godot packaging

Decision: approved.

Godot is the first official optional domain pack. DevRelay Core, semantic
Modules, Gates, evidence contracts, and TraceabilityGraph remain domain-neutral.
The pack may bind Godot AI and GdUnit4 capabilities to existing Module ports.

## RG-MQ-D004 - ChatGPT Desktop skill distribution

Decision: approved.

The four DevRelay skills will be committed under repository-scoped
`.agents/skills` for consistent behavior from a GitHub source checkout in
ChatGPT Desktop on Windows:

- `devrelay-cycle`;
- `devrelay-godot-release`;
- `devrelay-plugin-conformance`;
- `devrelay-trace-query`.

The skills remain thin operating surfaces over released DevRelay contracts and
must not duplicate or silently override Core policy. A separately packaged
Codex plug-in remains a future distribution option.

## Result

RequirementsGathering remains `clarify`. Product intent, provider-acquisition,
receipt privacy, compatibility, telemetry, and release-acceptance decisions
remain open for the next interview round.
