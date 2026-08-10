# ArchitectureDiscovery requirements

- Require a version-pinned native inventory adapter; treat specialized analyzers as optional contributors (recommended)
- Block only on declared material gaps; preserve non-blocking low-confidence findings and require explicit Gate disposition (recommended)
- Analyze tracked or explicitly declared files offline, respect ignore and secret rules, and require opt-in before source content leaves the host (recommended)

The module produces an observational CurrentArchitectureSnapshot only. ArchitectureDesign owns intended architecture and ArchitectureGate owns baseline promotion.
