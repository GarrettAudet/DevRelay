# ChatGPT Desktop Windows runtime design

## Context

DevRelay is already a deterministic provider-neutral lifecycle library, but its controlled release is not directly usable through ChatGPT Desktop. The release host must expose the complete workflow without becoming a second authority or a coding-agent wrapper.

## Decision

Ship a repository-backed local marketplace plugin containing a workflow skill and local STDIO MCP server. The MCP bridge delegates typed operations to DevRelay Core. A Codex app-server task supervisor creates one task for each Core-derived runnable work item, persists exact task and handoff identity, and returns all results to WorkExecution, WorkItemVerification, and ChangeIntegration. A local content-addressed run store supports restart-safe replay. Capability resolution requires one release-ready binding per mandatory module while preserving honest maturity labels for alternatives.

## Contract consequence

Desktop command, task lifecycle, durable run state, capability resolution, installation, and human-readable run access interfaces require provider-neutral JSON Schema contracts before WorkBreakdown.

## Boundaries

The plugin, MCP tools, app-server tasks, implementation models, and optional adapters cannot select lifecycle routes, satisfy Gates, mutate TraceabilityGraph directly, self-verify, or self-integrate. V1 is Windows-local and does not claim public directory publication, a hosted backend, or universal live adapter interoperability.
