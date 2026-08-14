# v0.10.0-rc.1 quality remediation

This dogfood increment applies the complete released circuit through SpecialistAssignment before executing four audit-derived work items.

## Work items

1. `WI-RC-LIVE-PROVIDER-ATTESTATION` - trusted live-provider execution evidence.
2. `WI-RC-GDSCRIPT-DISCOVERY` - deterministic GDScript semantic inventory.
3. `WI-RC-RUN-BINDINGS` - exact operation and plug-in bindings in lifecycle stages.
4. `WI-RC-REPORT-UX` - concise, Windows-safe Markdown after binding projection.

The authoritative dependency DAG has one edge: `WI-RC-RUN-BINDINGS -> WI-RC-REPORT-UX`. The other three work items begin in the first ready frontier.
