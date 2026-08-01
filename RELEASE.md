# DevRelay source release

## Release identity

This repository packages DevRelay Core, `requirements-gathering@0.1.0`, and
`architecture-design@0.1.0` as one private source release, version `0.2.0`.
The source package adds `TraceabilityGraph` without changing either immutable
Module contract version.

`package.json` intentionally retains `"private": true` and
`"license": "UNLICENSED"`. Do not run `npm publish`. The local package tarball
is a verification and controlled-distribution artifact, not a public npm
release.

## Supported release surface

- Node.js 20 and 22.
- The public JavaScript API exported by `src/index.mjs`.
- JSON Schema contracts under `contracts/`.
- Versioned module and bounded adapter manifests under `examples/modules/` and
  `examples/plugins/`.
- OpenSpec bridge schemas under `openspec/`.
- Typed requirements, deterministic ProjectOverview projection/rendering,
  atomic paired Requirements Gate validation, and ArchitectureDesign's explicit
  project-overview context contract through the public JavaScript API.
- Closed TraceabilityGraph snapshot, update, receipt, diagnostic-report, and
  ModuleExecutionRecord contracts through the public JavaScript API.
- Trusted RequirementsGathering and ArchitectureDesign contributors, exact
  provenance, checkpoint-first idempotent application, optimistic disjoint
  rebase, forward/reverse traversal, and lifecycle coverage diagnostics.
- Explicit assumption blocking/source provenance, checkpoint-only gate proof
  through an in-process unforgeable replay receipt, and raw-byte-bound baseline
  commit payloads. Portable cross-process verification receipts are not
  included in V1.

The bundled graph and traceability checkpoint stores are in-memory reference
implementations. Production hosts must supply durable atomic stores. This
release does not include approval-gate contributors, so draft graph facts
remain candidates; it never infers approval from a successful module result.

Live OpenSpec, GitHub Spec Kit, Structurizr, and MADR command adapters are not
included. The manifests define bounded capabilities and the tests exercise
contract adapters and fixtures. Release notes and user-facing descriptions
must preserve that distinction. `ArchitectureDiscovery` is a required
prerequisite contract when an existing system lacks a validated current
architecture snapshot; an executable discovery Module is not included.

## Reproduce the release checks

From a clean checkout:

```sh
npm ci
npm run release:check
```

`release:check` performs all of the following without leaving a tarball in the
working tree:

1. Parses every repository JSON file.
2. syntax-checks every `.mjs` file.
3. rejects CR or CRLF in versioned text.
4. runs the complete test suite.
5. verifies the mandatory final release digest catalog.
6. builds an allowlisted package in a temporary directory.
7. installs that tarball offline and smoke-tests the package root,
   TraceabilityGraph surface, and both module manifests from a disposable
   consumer.

Use `npm run verify` for the static checks and test suite without packaging.

## Release checklist

- [ ] Work from a clean checkout of the intended commit.
- [ ] Confirm package, RequirementsGathering, and ArchitectureDesign versions.
- [ ] Confirm paired Requirements/ProjectOverview promotion and explicit
      ArchitectureDesign project-overview input coverage.
- [ ] Confirm graph-aware execution checkpoints before merge, retries without
      adapter reinvocation, and proves the exact applied update.
- [ ] Confirm candidate/approved scope separation, contributor ownership, and
      orphan/unscoped/missing-evidence diagnostics.
- [ ] Confirm `npm run release:check` passes on Node 20 and Node 22.
- [ ] Review the package file list and mandatory release digest catalog.
- [ ] Confirm the no-live-command-adapters limitation remains visible.
- [ ] Review `CHANGELOG.md`, security guidance, and residual risks.
- [ ] Merge through the normal review process.
- [ ] Create any source archive and checksum only from the reviewed commit.

Publishing, pushing, tagging, or attaching a release is a separate,
owner-authorized action.
