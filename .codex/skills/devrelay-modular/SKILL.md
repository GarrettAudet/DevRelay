---
name: devrelay-modular
description: Inspect or exercise DevRelay's modular plug-in developer preview, explain exact plug-in compatibility, or develop a bounded adapter. Use for the modular catalog and wrapper, not for running the full engineering lifecycle.
---

Use the selected repository's own instructions and startup boundary. Read `docs/modular-quickstart.md` and, for support questions, `docs/supported-plugins.md` from that checkout.

For a catalog demonstration, run `node examples/modular/run.mjs --list`. This is read-only and does not execute plug-ins. To exercise a registered example, use the requested UTF-8 file, an explicitly identified baseline-context directory and an exact plug-in ID with the documented runner. Keep execution inside the Desktop workspace using the bundled Node runtime if node is absent from PATH.

For adapter work, use the existing Module/ModulePlugin/Invocation/Result contracts. Inspect declared schemas, execution mode and grants before selecting an implementation. The catalog is descriptive; the registry validates the actual invocation. Do not install providers, dispatch coding agents or invent adapter availability from a catalog row.

Report the exact result and test evidence. Distinguish live local examples, fixtures and external integrations. Respect existing Gate and traceability ownership. The pure example's in-memory store is not a durable effect host, and invocation success is not business acceptance.

For a coding request, read `docs/modular-coding-quickstart.md`. Follow the repository bootstrap and applicable lifecycle policy. Use the existing Core chain through `examples/modular/code.mjs`: inspect, apply an explicit Desktop-authored change, then run trusted Node tests. Read the actual relevant files first. Supply exact preimage digests, complete proposed contents, explicit test files and the exact project-context triplet; use null preimages only for new files. Keep each request bounded and give changed work a new request ID. Do not create a second coding agent or invoke an external coding CLI.

For a new project, the same workflow creates files in an explicitly selected empty directory. The packaged historical context and greeting request are demonstrations only; never present them as that user's approved project baseline. Show the user the actual diff, test exit code/output, and replay/current-workspace flags. Stop for diagnosis on failed tests or quarantine. A stored passing result is historical evidence, and local test success does not approve a lifecycle Gate.
