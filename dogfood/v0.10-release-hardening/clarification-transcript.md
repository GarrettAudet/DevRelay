# V0.10 public OSS preview RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and V0.10 public OSS preview design and implementation are blocked until every question below is answered.

1. **Should V0.10 be published to the public npm registry, or distributed only as GitHub source plus an installable release tarball?**

   - Use GitHub source and an installable release tarball only; do not publish to the public npm registry (recommended)
   - Publish both a GitHub release and a public npm package

   Why it matters: The distribution channel changes package metadata, release automation, credentials, provenance, and what BusinessAcceptance may claim.

2. **Which public contact should SECURITY.md and the Code of Conduct use for private reports?**

   - garrett.audet@gmail.com
   - Use the GitHub owner profile without publishing an email address

   Why it matters: A public open-source project needs a real reporting path and must not invent or publish an unapproved address.

3. **Should main become the protected default branch for the public open-source preview?**

   - Use main as the protected default branch (recommended)
   - Keep the current release branch as the default without protection

   Why it matters: The release promotion boundary depends on a stable default branch and enforceable protection against unverified direct changes.
