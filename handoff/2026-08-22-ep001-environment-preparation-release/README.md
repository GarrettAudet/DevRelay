# EP-001 EnvironmentPreparation release pickup

DevRelay `v0.10.0-rc.3` is published from protected main and its catalog, installable tarball, SBOM, and checksum ledger have been independently redownloaded and hash-verified. No published asset was rebuilt or substituted.

The publication automation repair is integrated through PR #13 at `d17bc7dada964c3b669c29407cdabfbfe37c2651`; canonical verify, CodeQL, and scorecard passed. ProjectMemory `/conclude` promoted baseline 1.0.3, recorded the exact release state, and retained ReleasePreparation as the next action.

Remaining bounded work is to seal and promote the conclusion artifacts. The next product increment then begins with RequirementsGathering for ReleasePreparation and ReleaseVerification.