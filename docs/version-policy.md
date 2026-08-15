# Version and compatibility policy

DevRelay package versions and lifecycle Module versions are independent. The package version identifies the assembled distribution; each Module version identifies an immutable semantic contract. A package release can therefore change the facade, host, CLI, packs, or documentation without renumbering unchanged Modules.

## Active matrix

| Surface | Version or window | Status |
| --- | --- | --- |
| GitHub source/library preview | 0.10.0-rc.2 | Preview for ChatGPT Desktop on Windows |
| Root facade | 0.10 prerelease | Supported default; eight operations |
| Advanced API | 0.10 prerelease | Supported explicit low-level tier |
| compat/v1 | Through 0.11.x prerelease | Deprecated; migration required |
| Optional packs | Independently versioned | Must pass pack conformance |
| Durable local reference host | 0.11 milestone | Not claimed complete by rc.2 |

Independent human review must be recorded exactly before preview status can be removed. GitHub source plus the deterministic installable tarball are the supported distribution channels; public npm publication, a hosted backend, and a one-click Desktop plug-in are outside rc.2 scope.

Consumers should import `devrelay` by default, use `devrelay/advanced` only for low-level host integration, and use `devrelay/packs/<name>` only for separately conformant optional packs. See [the migration guide](migrations/compat-v1-to-facade.md).
