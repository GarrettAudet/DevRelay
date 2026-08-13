# Governance

DevRelay is currently maintained by the repository owner, Garrett Audet. The
maintainer is responsible for scope, architecture, security response, release
approval, and repository administration.

## Decision process

Routine changes are decided through reviewed pull requests. Changes to public
APIs, deterministic guarantees, security boundaries, licensing, governance, or
release policy require an issue describing alternatives and an explicit
maintainer decision recorded in the repository.

## Merge policy

Changes enter the canonical branch through pull requests after:

- at least one approving review;
- all required checks pass;
- DCO sign-off is present on every commit;
- security and compatibility impact are documented;
- stale approvals are renewed after material changes.

Force pushes and branch deletion are prohibited on the canonical release
branch. Release tags are signed and immutable.

## Maintainers

Additional maintainers may be appointed after sustained, high-quality
contributions and demonstrated stewardship. Appointment or removal is recorded
in a pull request updating this document and `CODEOWNERS`.

## Releases

Only a maintainer may authorize a release. A release binds an exact commit,
tag, checksums, package artifact, SBOM, provenance, compatibility statement,
verification evidence, and release notes. The repository's deterministic
acceptance artifacts remain evidence; they do not replace GitHub branch and
release controls.
