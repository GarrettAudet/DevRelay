# DevRelay project baseline

This directory contains the canonical project-wide RequirementsBaseline and ProjectOverviewBaseline pair for DevRelay V1, plus the exact RequirementsGathering invocation, checkpoint, candidate, native evidence, Gate decision, and execution proof that produced it.

The root `ProjectOverview.md` is the deterministic readable projection of this pair. Existing module-specific dogfood overviews remain immutable historical evidence and are not the current project context. Future feature and module requirements must evolve this pair through RequirementsChangeSet and ProjectOverviewChangeSetDraft artifacts.

Regenerate and validate the pair from the repository root with:

```powershell
node project\materialize.mjs
```
