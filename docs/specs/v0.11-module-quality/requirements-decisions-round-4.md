# RequirementsGathering decision record - round 4

Date: 2026-08-13

Status: owner-approved

## RG-MQ-D007 - Godot compatibility authority

Decision: approved.

The optional Godot pack derives support exclusively from a version-pinned,
live-attested compatibility matrix for the selected Godot AI, GdUnit4, Godot,
Windows, and DevRelay adapter versions.

The matrix distinguishes upstream-declared compatibility from DevRelay-tested
compatibility. DevRelay claims support only for combinations exercised by its
conformance and end-to-end tests. No unrelated project, ambient workspace,
floating version, or unexecuted upstream claim can establish support.

Changing a provider or engine version creates a new compatibility candidate
and requires fresh provider receipts, conformance evidence, and controlled
promotion.

## RequirementsGathering result

All presently applicable product decisions are resolved. Continue to the
deterministic closure assessment and RequirementsGate candidate generation.
