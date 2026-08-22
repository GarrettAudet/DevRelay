# Next actions

1. Regenerate the handoff manifest and tracked-source release catalog around implementation commit `c4c45ceaced6012bb9631f1dd09354865e00df52`.
2. Run the authoritative release check over the exact status/catalog seal.
3. Push `codex/v0.10.0-rc.3-release-followup` and open a protected-main PR.
4. Require CodeQL, dependency review, and all Node 22/24 x Ubuntu/Windows checks to pass before merge.
5. Require canonical-main verify, CodeQL, and scorecard to pass after GitHub's linear-history rewrite.
6. Run ProjectMemory `/conclude` to make the published release and automation closure first-load context.
7. Begin ReleasePreparation/ReleaseVerification through RequirementsGathering and the full released circuit.
