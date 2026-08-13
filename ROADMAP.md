# DevRelay roadmap

DevRelay's roadmap prioritizes trustworthy operation over adding more semantic
modules. The supported release-defining environment is ChatGPT Desktop on
Windows, distributed from GitHub as source plus a deterministic installable
tarball. Public npm publication, a hosted backend, and a one-click Desktop
plug-in are not current release claims.

## `v0.10.0-rc.1` — trustworthy GitHub prerelease

Status: in release verification.

- Reconcile canonical status and release evidence.
- Make SpecialistAssignment `2.0.0` promotion depend on an unforgeable,
  checkpoint-replayed candidate and exact content-addressed owner approval.
- Retain SpecialistAssignment `1.0.0` as an immutable compatibility contract.
- Fail the release when the Git tag is not exactly `v` plus package version.
- Generate CycloneDX from the lockfile-owned tool without ignored npm errors.
- Pass the complete package, catalog, Windows/Linux Node 22/24, security, and
  fresh-install gates before publishing the annotated GitHub prerelease.

Exit: the exact protected-`main` commit is tagged `v0.10.0-rc.1`, the GitHub
prerelease and attested assets exist, and a clean Windows consumer installs and
uses the released tarball.

## `0.11` — durable local reference host and executor

Planned after the prerelease; estimated 14–22 focused hours for the first MVP.

- Durable artifact, execution-checkpoint, traceability-checkpoint, and graph
  stores with schema migrations, compare-and-swap, backup, and restore.
- A bounded general-purpose local WorkExecution adapter and isolated workspace
  manager for one approved work item.
- Operator CLI for initialize, run, resume, inspect, diagnose, and export.
- Kill/restart/recover conformance and crash-boundary evidence.
- Fast, integration, serial-conformance, release, performance, and
  fault-injection verification lanes with published regression budgets.
- Read-only MCP inspection surface for ChatGPT Desktop.
- Common Gate authority vocabulary where module semantics permit it:
  checkpoint replay, candidate byte binding, approval binding, promotion
  payload, and substitution diagnostics.

Exit: one complete local lifecycle can survive interruption and resume from
durable state with zero duplicate external effects and human-readable evidence.

## `0.12` — ChatGPT Desktop integration adapters

Planned after `0.11`; estimated 10–16 focused hours for the first supported
integration slice.

- ChatGPT Desktop/Codex executor binding through explicit capability demands.
- MCP commands for starting, resuming, inspecting, and exporting a run while
  preserving Core authority.
- GitHub source, pull-request, check, and release adapters with exact identity
  and permission boundaries.
- End-to-end Desktop dogfood against a small production-quality software goal.

Exit: a Windows Desktop user can initiate and inspect the complete deterministic
circuit without manually assembling internal artifacts.

## Stable production-quality line

A stable claim follows operational evidence, not a calendar label: documented
performance envelopes, durable recovery, supported migrations, fault
injection, security review, API stability tiers or declarations, and repeated
end-to-end adopters. Additional lifecycle modules are deferred until they solve
measured workflow gaps without weakening the existing authority boundaries.
