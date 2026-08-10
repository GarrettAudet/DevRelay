# ArchitectureDiscovery RequirementsGathering clarification

Status: `needs_clarification`

RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and ArchitectureDiscovery design and implementation are blocked until every question below is answered.

1. **Should every discovery run begin with a mandatory deterministic local repository inventory, with dependency-cruiser, SCIP, or similar analyzers contributing only optional bounded observations?**

   - Require a version-pinned native inventory adapter; treat specialized analyzers as optional contributors (recommended)
   - Require each selected external analyzer to provide the entire discovery result

   Why it matters: A stable minimum inventory prevents analyzer availability from changing the module contract while keeping specialized analysis replaceable.

2. **How should incomplete or low-confidence discovery affect progression to ArchitectureDesign?**

   - Block only on declared material gaps; preserve non-blocking low-confidence findings and require explicit Gate disposition (recommended)
   - Block ArchitectureDesign whenever any discovery finding is low-confidence or unknown

   Why it matters: Treating uncertainty as certainty can create an incorrect baseline, while blocking on every minor unknown can make discovery unusable.

3. **What repository-access and privacy boundary should ArchitectureDiscovery use by default?**

   - Analyze tracked or explicitly declared files offline, respect ignore and secret rules, and require opt-in before source content leaves the host (recommended)
   - Allow configured analyzers to inspect or transmit any repository content allowed by their host credentials

   Why it matters: Discovery may inspect proprietary source, generated output, ignored files, secrets, and dependency metadata, so its default boundary must be explicit.
