# Contributing

DevRelay welcomes issues, documentation improvements, tests, adapters, and
bounded changes to the deterministic Core. By contributing, you agree that
your contribution is licensed under Apache-2.0.

## Developer Certificate of Origin

Every commit must include a `Signed-off-by` trailer certifying the
[Developer Certificate of Origin](DCO.md). Create it with:

```sh
git commit -s
```

The sign-off must use a name and email you are authorized to contribute under.
Pull requests containing unsigned commits cannot be merged.

## Before opening a change

1. Search existing issues and pull requests.
2. Open an issue before broad API, security, data, or workflow changes.
3. Keep the change bounded to one goal and explain its release impact.
4. Do not include secrets, private source, generated credentials, or
   third-party material you are not authorized to redistribute.

## Development checks

Use a maintained Node.js 22 or 24 release and start from a clean branch:

```sh
npm ci
npm run verify
npm run release:check
```

Changes must preserve:

- provider-neutral Module contracts and plug-in-specific adapter boundaries;
- deterministic routing, immutable artifacts, explicit evidence, and
  checkpoint semantics;
- exact module and adapter versions;
- LF-only text and valid JSON;
- the distinction between module validation and human or policy gates;
- explicit documentation when a bridge is only a bounded contract rather than
  a shipped live adapter.

Add positive and negative contract fixtures for semantic changes. Do not add
product identifiers to generic Core branches.

## Pull-request requirements

A pull request must describe its goal, scope, verification evidence, security
impact, compatibility impact, and release impact. At least one approving
review and every required check are required. Stale approvals must be renewed
after material changes. Maintainers may ask that an oversized change be split.

Publishing, tagging, changing repository controls, or creating a GitHub
Release remains owner-authorized release work.
