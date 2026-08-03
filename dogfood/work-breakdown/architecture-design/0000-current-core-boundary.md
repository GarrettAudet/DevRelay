---
status: accepted
date: 2026-08-02
---

# Preserve a generic Core and trusted traceability boundary

DevRelay Core remains independent of module, operation, adapter, and product identity. Semantic modules declare provider-neutral contracts and exact routing metadata. Adapters are bounded capability implementations and cannot access or mutate TraceabilityGraph. Trusted versioned contributors project only validated canonical artifacts, while Core validates and checkpoints updates before atomic merge.

This record is observational evidence of the architecture already enforced by repository contracts and tests at revision `7d3b9c16d4c197bf80dce8279e027b953e32f21a`; it is not a new WorkBreakdown decision.
