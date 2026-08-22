# Current state

- Public prerelease: `v0.10.0-rc.3` at `https://github.com/GarrettAudet/DevRelay/releases/tag/v0.10.0-rc.3`.
- Protected-main tag commit: `dc0f4094ce0e178757984e363836d05cfcc0037d`.
- Exact published assets remain independently verified and were not rebuilt or substituted.
- Publication automation repair: PR #13 merged at `d17bc7dada964c3b669c29407cdabfbfe37c2651`.
- Canonical-main verify `32592205364`, CodeQL `32592205360`, and scorecard `32592205344`: passed.
- ProjectMemory `/conclude`: passed and promoted baseline 1.0.3.
- Result baseline: `sha256:adf6829dce8a18b27bad2b30c7d4c18f3c557d052a103c96d408847ff0cae6ac`.
- CurrentSynopsis: `sha256:e2cf40d9bc18ef8f057decf3e633364a792f3622a4aafdccc4957a3668170520`.
- Fresh-task load order: synopsis, baseline, traceability context; replay provider calls: zero.
- Active branch: `codex/v0.10.0-rc.3-release-conclusion`.
- Next gate: seal and promote the conclusion artifacts, then start ReleasePreparation through RequirementsGathering.

Supported scope remains GitHub source plus an installable deterministic library operated through ChatGPT/Codex Desktop on Windows.