# Migrate from compat/v1 to the DevRelay facade

The prerelease compatibility path is deprecated and is supported only through
`0.11.x-prerelease`. It will be removed at the next prerelease major boundary.

Replace broad imports from `devrelay/compat/v1` with one of these explicit tiers:

- Use `devrelay` for `createDevRelay`, `createLocalHost`, `defineModule`,
  `definePlugin`, `run`, `resume`, `verify`, and `inspect`.
- Use `devrelay/advanced` only for provider-neutral low-level contracts.
- Use `devrelay/packs/<name>` only for a separately conformant optional pack.

The facade is the supported default. Compatibility imports must not be added to
new code, and a consumer must not import files beneath `devrelay/src`.
