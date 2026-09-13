# Release completion — repair slice 1

Status: candidate implementation and targeted verification, not release acceptance.
The complete release-completion goal remains open. Starting commit:
`b9fdc997c21269c22ae2c46abbbb544b4e982c32` (after publication-memory PR #24).

## Existing requirements, unchanged authorities

This repairs existing requirements in the approved project-wide 2.8.0 pair,
not a new Module or replacement project overview:

- `AC-SIM-CLI-001`: deterministic commands, machine-readable output and stable
  exit codes. The executable previously interpreted protocol version `v1` as
  the version-display flag, printed its package version and exited successfully
  for ordinary commands. Missing library result dispositions also became pass.
- `AC-DEV-OSS-SECURITY-001`: active dependency/security release hygiene.
  fast-uri 3.1.5 and js-yaml 4.3.1 were vulnerable in the active lockfile.
- `AC-SIM-WINDOWS-E2E-001`: still open for a new installed-product test; this
  slice does not replace that criterion with an unbound-host test.

Baseline identity and exact requirements-to-overview projection are revalidated
by `test/release-completion-baseline.test.mjs`. No paired baseline promotion,
new interview, architecture approval, WorkBreakdown promotion, or final Gate
result is claimed by this repair record. The normal lifecycle/acceptance work
must still be completed for the assembled release. Core, Module manifests,
Gate authority, ProjectMemory, graph checkpoints, and adapter grants are unchanged.

## Candidate interface repair

`--version` is a standalone package-version query. Ordinary commands retain
the existing `version: "v1"` protocol field and cannot take that branch.
`--help` or `<command> --help` renders help. Commands permit one `--json` and
one `--input <JSON object>` in either order; unknown/duplicate arguments,
missing input, non-object input, and conflicting meta-arguments fail with exit 2.

Without a bound host, commands report `DR4771`, exit 70 and no evidence. With
`--json`, failures are machine-readable; otherwise diagnostics go to stderr.
Raw argument values and unexpected exception details are not echoed. The
injected-host library requires an explicit result disposition and observes
nested `outputs.status`, including failures. Missing outcomes return `DR4772`
rather than manufacturing success.
Thrown host errors cannot override the stable nonzero exit-code contract with
zero, a string, an out-of-range value, or a non-integer value.

## Dependency patches and evidence limits

The active override, lockfile, installed dependencies and package verification
pin use fast-uri `3.1.7`; js-yaml is locked at `4.3.2`. Exact tarball integrity
values match the Dependabot changes in [PR #18](https://github.com/GarrettAudet/DevRelay/pull/18)
and [PR #23](https://github.com/GarrettAudet/DevRelay/pull/23).
The root override previously prevented automatic fast-uri remediation.

Targeted regressions exercise encoded-scheme authority confusion, empty YAML
merge budget enforcement, and ordinary Ajv relative-reference validation.
These are regression checks, not a comprehensive new vulnerability audit.
Installation used `--ignore-scripts --no-audit --no-fund`; a fresh npm audit
was not authorized and was not run. GitHub's existing advisory findings were
read instead. Only the two patch packages changed during installation.

The two historical dogfood lockfiles and immutable Git bundles remain exact.
Their outstanding alerts must be explicitly dispositioned as historical evidence
or safely externalized without rewriting their checksums. They must not be used
as current dependency-installation templates. This patch does not dismiss any
GitHub alert, claim zero outstanding findings, or alter published rc.3 assets.

## Verification and next work

- `test/operator-executable.test.mjs`: real child processes for help/version,
  all seven unbound commands, malformed input, and secret-safe diagnostics.
- `test/operator-cli.test.mjs`: injected-host protocol and missing/nested outcomes.
- `test/security-dependencies.test.mjs`: active pins and small offline regressions.
- Existing release automation and governance tests remain applicable.

The first combined targeted run passed 19 tests with zero failures. Full
verification, package checks, CI and independent review must be recorded
separately against the final source state; this count is not release acceptance.

Next required increments remain: a usable connected durable Desktop host and
installed CLI; authoritative roadmap/next-action reconciliation; historical
security finding disposition; fresh installed-product worktree/memory/quality/
human-orchestration execution including interruption/recovery; final independent
human review and BusinessAcceptance; exact new-version release sealing.

## Candidate-only session conclusion

The current task repaired three CLI false-success cases and patched the active
dependency graph. These observations are eligible for later ProjectMemory Gate
review. This document is not a SessionConclusion artifact or memory promotion.
Do not mark the overall goal complete based on this slice.
