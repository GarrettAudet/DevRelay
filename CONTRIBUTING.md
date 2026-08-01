# Contributing

DevRelay is currently a private, source-available project. The repository is
`UNLICENSED`; access to the source and submission of a change do not grant a
license to use or redistribute it. Contributions require maintainer
authorization and remain subject to the repository's licensing terms.

## Development checks

Use Node.js 20 or 22 and start from a clean branch:

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
product identifiers to generic Core branches. Do not publish, tag, or push a
release without explicit owner approval.
