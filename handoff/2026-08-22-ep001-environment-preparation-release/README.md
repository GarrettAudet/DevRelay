# EP-001 EnvironmentPreparation release pickup

DevRelay `v0.10.0-rc.3` is published from protected main and its catalog, installable tarball, SBOM, and checksum ledger have been independently redownloaded and hash-verified. The tagged workflow successfully built, verified, attested, and uploaded the assets; only its no-checkout publication command failed repository inference. The exact assets were recovered with an explicit repository target.

Implementation commit `c4c45ceaced6012bb9631f1dd09354865e00df52` permanently adds that explicit target and a regression assertion. Local focused and full verification pass. Remaining work is catalog sealing, protected-main promotion, canonical-main verification, and ProjectMemory `/conclude`.
