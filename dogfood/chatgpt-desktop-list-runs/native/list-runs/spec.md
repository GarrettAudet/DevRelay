# devrelay_list_runs requirements

- devrelay_list_runs returns each readable run's run ID, revision, lifecycle state, checkpoint identity when present, recovery status, and created/updated timestamps.
- Run summaries are ordered newest-first with run ID as the deterministic tie-breaker.
- Run listing uses bounded cursor pagination with a default page size of 50 and rejects out-of-range limits or malformed cursors.
- Run summaries never expose prompts, source content, credentials, artifact bytes, or raw evidence.
- Unreadable and corrupt run records are reported with bounded diagnostics and no storage mutation.
- The Desktop MCP server exposes devrelay_list_runs as one closed read-only command without route, Gate, execution, graph, or repair authority.
