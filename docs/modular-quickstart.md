# Modular developer preview

This branch exposes the existing generic Module registry through `devrelay/modular`, with an immutable registration catalog. Superpowers was used as development tooling. It is not a DevRelay runtime dependency.

The preview runs from a ChatGPT Desktop workspace on Windows using Node >=22. The larger requirements-to-acceptance workflow remains available through existing APIs, but is not required to register and invoke a generic capability. Governed SDLC work still follows its applicable policies.

## List and run the included plug-ins

From this checkout:

```powershell
node examples/modular/run.mjs --list
node examples/modular/run.mjs README.md examples/modular/context node-sha256
node examples/modular/run.mjs README.md examples/modular/context webcrypto-sha256
```

Both implementations return SHA-256 for the exact UTF-8 file content. The example context directory above contains a historical sample baseline pair and its rendered overview. It is explicitly demonstration context, not the active project's approved context. For real governed work, supply a directory containing the exact paired `requirements-baseline.json`, `project-overview-baseline.json` and `ProjectOverview.md`. The host binds these as declared inputs; Core checks their bytes, schemas, pairing and projection. Files with invalid UTF-8 reject.

A new project can supply a file and its declared context to the same example. This preview does not create complete applications or generate approved project baselines.

## Register your own capability

```js
import { createPluginCatalog } from "devrelay/modular";

const catalog = createPluginCatalog({
  modules: [moduleDefinition],
  plugins: [{ definition: pluginDefinition, adapter }],
  artifactContracts,
  // traceability: { graph, checkpoints } when required by your workflow
});

const choices = catalog.list({
  module: { id: "your-capability", version: "1.0.0" },
  operation: "your-operation",
});
const result = await catalog.registry.execute(invocation, {
  artifacts,  // load(ref) returns raw bytes; Core checks the digest
  checkpoints, // get/put for effectful operations; host must make these durable
});
```

The example identifiers above are placeholders for your explicit manifests; see [the complete runnable host](../examples/modular/digest.mjs) for concrete definitions. `list()` lists all registered bindings. Filters match exact Module ID/version, operation and optional chain step. Filtering describes declared compatibility only; `registry.resolve(invocation)` validates an actual configuration and grant set before execution. There is no implicit default plug-in.

## The wrapper contract

Use [the existing Module contract](module-contract.md). A Module defines semantics and artifact schemas. A ModulePlugin pins the implemented Module/version/operation (and chain step), configuration schema, pure/effect mode and capability demands. The host explicitly registers its adapter's `invoke` function. An invocation selects exact versions, options, artifacts and grants. Results include only declared outcomes, output ArtifactRefs, evidence and diagnostics.

The registry snapshots manifests and binds the callable at registration. Catalog metadata is frozen and contains no executable functions. A changed plug-in requires a new explicit registration/run; editing an object after registration does not update it.

A common JSON envelope alone does not make unrelated tools interchangeable. Both implementations must satisfy the same semantic inputs, outputs, evidence and effects. Adapters return observations; owning Gates retain approval authority.

## Host boundaries

- This library validates grants; it does not sandbox arbitrary JavaScript. Register trusted code or provide appropriate process/tool isolation for untrusted implementations.
- Pure examples use an in-memory artifact store. That store is not a persistent effect host.
- Effectful adapters require a checkpoint store. Completed, validated checkpoints can be replayed without invoking the adapter. Interrupted effects before a durable checkpoint need host reconciliation; never infer exactly-once execution from this example.
- A graph-aware registry must receive its trusted contributors, graph and checkpoint services. The catalog forwards that configuration without disabling or substituting it. Adapters never receive graph authority.
- The catalog lists registrations, not certifications. See [support status](supported-plugins.md).
- No external coding-agent CLI, model provider, network call or provider key is used by the included example.

## Conformance kit

Run `node --test test/plugin-catalog.test.mjs test/modular-example.test.mjs` in the source checkout. These tests are the starting adapter-author kit: known independent vectors, replacement, composition, raw-byte tampering, incompatible versions, malformed filters, immutable bindings, malformed results, permission rejection and checkpoint replay.

For another adapter, supply real representative inputs and independently derived expected outputs. Include invalid inputs, missing/excess grants, failure outcomes and recovery checks for its actual effects. Fixture passes prove only those fixtures. Record tool/version/environment and real execution evidence before advertising live conformance.

The public package also retains `devrelay/advanced` and all prior lifecycle APIs. This preview does not claim a public npm release or completion of the existing full-product acceptance milestones.
