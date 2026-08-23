# EP-001 EnvironmentPreparation release pickup

DevRelay `v0.10.0-rc.3` is published from protected main and its catalog, installable tarball, SBOM, and checksum ledger have been independently redownloaded and hash-verified. No published asset was rebuilt or substituted.

The publication automation repair is integrated through PR #13 at `d17bc7dada964c3b669c29407cdabfbfe37c2651`; canonical verify, CodeQL, and scorecard passed. ProjectMemory `/conclude` promoted baseline 1.0.3, recorded the exact release state, and retained ReleasePreparation as the next action. The conclusion was integrated through PR #14 at protected-main commit `57459b6d10da277c85e1396343cdb989fd5a9e54`, and its canonical verify, CodeQL, and scorecard runs also passed.

No scoped release blocker remains. The next product increment begins with a visible RequirementsGathering interview for the kept `ReleasePreparation and ReleaseVerification` roadmap initiative. See `NEXT_ACTIONS.md` and `PICKUP_PROMPT.md` for the exact resume contract.
