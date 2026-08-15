# SIM-001 simplification milestone

## Goal

Make DevRelay practical from ChatGPT Desktop on Windows through a small facade, deterministic profiles, a durable local host, compact evidence, and an end-to-end production-shaped dogfood.

## Shipped

- Eight-operation public facade and seven-command CLI.
- Durable SQLite/content-addressed-artifact/Git-worktree host with recovery and explicit grants.
- Optional Godot/GdUnit4 pack plus live-attested OpenSpec, Spec Kit, Structurizr, and MADR capabilities.
- Complete 20-component installed-package lifecycle run against a minimal Godot project.
- Six execution/verification/integration frontiers closing all 12 approved work items.
- Final SystemVerification and BusinessAcceptance with revision-41 traceability and zero blockers.

## Verification

- Focused final-acceptance and Windows reconstruction tests: 6 passed, 0 failed.
- Canonical release gate: 983 tests, 981 passed, 0 failed, 2 expected skips.
- SystemVerification: `sha256:11e45310627ef60f6e1f62cc40fd06d1c782135aea736baed27f36306ff9510e`.
- BusinessAcceptance: `sha256:2f102e5aeabe6d37d34bd86a8f07416b5f16e990f10cff8955992c9d36088869`.
- Windows dogfood: `sha256:2e27beb3ed1dc0bc82f4efb09d91608866bf652fe72327b82c623b92afdec902`.

## Residual boundary

The preview is GitHub source plus an installable package operated through ChatGPT Desktop on Windows. It does not claim public npm publication, one-click Desktop installation, a hosted backend, or non-Windows support. Independent human review remains required before a stable release.

## Next

Seal and promote RC2, then run the complete released circuit for RM-001 RoadmapManagement and mandatory DevRelay session bootstrap.
