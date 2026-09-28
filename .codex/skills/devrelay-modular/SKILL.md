---
name: devrelay-modular
description: Inspect or exercise DevRelay's modular plug-in developer preview, explain exact plug-in compatibility, or develop a bounded adapter. Use for the modular catalog and wrapper, not for running the full engineering lifecycle.
---

Use the selected repository's own instructions and startup boundary. Read `docs/modular-quickstart.md` and, for support questions, `docs/supported-plugins.md` from that checkout.

For a catalog demonstration, run `node examples/modular/run.mjs --list`. This is read-only and does not execute plug-ins. To exercise a registered example, use the requested UTF-8 file, an explicitly identified baseline-context directory and an exact plug-in ID with the documented runner. Keep execution inside the Desktop workspace using the bundled Node runtime if node is absent from PATH.

For adapter work, use the existing Module/ModulePlugin/Invocation/Result contracts. Inspect declared schemas, execution mode and grants before selecting an implementation. The catalog is descriptive; the registry validates the actual invocation. Do not install providers, dispatch coding agents or invent adapter availability from a catalog row.

Report the exact result and test evidence. Distinguish live local examples, fixtures and external integrations. Respect existing Gate and traceability ownership. The pure example's in-memory store is not a durable effect host, and invocation success is not business acceptance.
