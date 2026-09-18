import { loadArtifactContent } from "./artifact-runtime.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { COMPOSITION_SCHEMA, CompositionError, closed, immutable, unique, validateCompositionArtifact } from "./workflow-composition-artifact-validator.mjs";
import { preflightWorkflowComposition, same, validateCurrentCompositionHost } from "./workflow-composition-preflight.mjs";

function artifact(kind, value, schema = `https://devrelay.dev/host/composition/${kind}/v1`) {
  const bytes = Buffer.from(canonicalJson(value));
  const digest = sha256Digest(bytes);
  return { bytes, ref: { artifactId: `composition-${kind}-${digest.slice(7, 31)}`, schema,
    mediaType: "application/json", digest, uri: `artifact://composition/${kind}/${digest.slice(7)}` } };
}

function requireSame(actual, expected, label) {
  if (!same(actual, expected)) throw new CompositionError("stale-input", `${label} differs from exact host binding`, "stale");
}

function failure(request, error) {
  const code = error instanceof CompositionError ? error.code :
    ["DR2102", "DR2103", "DR2106"].includes(error.code) ? "stale-input" : error.code === "DR1609" ? "grant-exceeded" : "schema-mismatch";
  return immutable(validateCompositionArtifact({ kind: "CompositionDiagnostics", artifactId: `diagnostics-${request.digest.slice(7, 31)}`,
    request, outcome: error.outcome ?? (code === "stale-input" ? "stale" : "incompatible"), effectsStarted: false,
    findings: [{ slotId: error.slotId ?? "workflow", code, message: String(error.message).slice(0, 2000), evidence: [request] }] }));
}

export function createWorkflowCompositionRuntime(suppliedHost) {
  for (const method of ["load", "put"]) if (typeof suppliedHost.artifacts?.[method] !== "function") throw new TypeError(`artifacts.${method} is required`);
  for (const method of ["read", "commit"]) if (typeof suppliedHost.checkpoints?.[method] !== "function") throw new TypeError(`checkpoints.${method} is required`);
  validateCompositionArtifact(suppliedHost.checkpoints.pin, "Pin");
  const host = { ...suppliedHost };
  for (const key of ["preset", "bindingCatalog", "hostCapabilities", "projectOverview"]) host[key] = immutable(suppliedHost[key]);
  for (const key of ["modules", "plugins", "services", "artifactContracts"]) {
    if (!Array.isArray(host[key])) throw new TypeError(`${key} registrations are required`);
    host[key] = host[key].map((entry) => ({ ...entry,
      ...(entry.pin ? { pin: immutable(entry.pin) } : {}), ...(entry.definition ? { definition: immutable(entry.definition) } : {}) }));
    unique(host[key].map((entry) => entry.pin ? `${entry.category ?? key}:${entry.pin.id}@${entry.pin.version}` : entry.schema), key);
  }
  const hostIdentity = { preset: host.preset, bindingCatalog: host.bindingCatalog, hostCapabilities: host.hostCapabilities, projectOverview: host.projectOverview,
    checkpointProvider: immutable(host.checkpoints.pin),
    artifactValidators: host.artifactContracts.map((entry) => ({ schema: entry.schema, pin: entry.pin ?? null, representation: entry.representation ?? "json" })),
    registrations: ["modules", "plugins", "services"].flatMap((key) => host[key].map((entry) => ({ category: entry.category ?? key, pin: entry.pin }))) };
  const hostDigest = canonicalJsonDigest(hostIdentity);

  async function readCheckpoint(runId) {
    const bytes = await host.checkpoints.read(runId);
    if (bytes == null) return undefined;
    if (!(bytes instanceof Uint8Array)) throw new CompositionError("stale-input", "Checkpoint store must return exact bytes", "stale");
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    closed(value, ["kind", "version", "runId", "hostDigest", "request", "fingerprint", "inputs", "generated", "body"], "composition checkpoint");
    if (value.kind !== "CompositionCheckpoint" || value.version !== "1.0.0" || value.runId !== runId || !Array.isArray(value.inputs) || !Array.isArray(value.generated)) {
      throw new CompositionError("stale-input", "Invalid checkpoint identity", "stale");
    }
    requireSame(Buffer.from(bytes).toString("utf8"), canonicalJson(value), "Checkpoint encoding");
    return { value, ...artifact("checkpoint", value) };
  }

  async function replay(stored, requestRef) {
    const record = stored.value;
    requireSame(record.request, requestRef, "Checkpoint request");
    requireSame(record.hostDigest, hostDigest, "Checkpoint host");
    requireSame(record.fingerprint, canonicalJsonDigest({ request: requestRef, hostDigest }), "Checkpoint fingerprint");
    for (const ref of record.inputs) await loadArtifactContent(ref, host.artifacts);
    for (const generated of record.generated) {
      closed(generated, ["ref", "value"], "generated receipt");
      const loaded = await loadArtifactContent(generated.ref, host.artifacts);
      requireSame(loaded.value, generated.value, "Stored compatibility receipt");
    }
    const request = validateCompositionArtifact((await loadArtifactContent(requestRef, host.artifacts)).value, "WorkflowConfigurationRequest");
    await validateCurrentCompositionHost({ host, selections: request.selections,
      load: async (ref) => (await loadArtifactContent(ref, host.artifacts)).value });
    for (const key of ["runId", "preset", "bindingCatalog", "hostCapabilities", "projectOverview", "selections", "qualityProfile", "lineage"]) requireSame(record.body[key], request[key], `Checkpoint ${key}`);
    const result = validateCompositionArtifact({ ...record.body, checkpoint: stored.ref }, "ResolvedWorkflowConfiguration");
    const checkpointContent = await loadArtifactContent(stored.ref, host.artifacts);
    requireSame(checkpointContent.value, record, "Checkpoint artifact");
    return immutable(result);
  }

  async function verify(configurationRef) {
    if (configurationRef.schema !== COMPOSITION_SCHEMA) throw new CompositionError("schema-mismatch", "Configuration schema must be composition v1");
    const loaded = await loadArtifactContent(configurationRef, host.artifacts);
    const value = validateCompositionArtifact(loaded.value, "ResolvedWorkflowConfiguration");
    const stored = await readCheckpoint(value.runId);
    if (!stored) throw new CompositionError("stale-input", "Configuration is not checkpointed", "stale");
    const replayed = await replay(stored, value.request);
    requireSame(value, replayed, "Resolved configuration");
    return replayed;
  }

  async function resolve(requestRef) {
    validateCompositionArtifact(requestRef, "ArtifactRef");
    const inputs = new Map();
    const generated = [];
    const load = async (ref) => {
      validateCompositionArtifact(ref, "ArtifactRef");
      const loaded = await loadArtifactContent(ref, host.artifacts);
      inputs.set(canonicalJsonDigest(ref), ref);
      return loaded.value;
    };
    const record = (kind, value) => {
      const output = artifact(kind, value);
      generated.push({ ref: output.ref, value });
      return output.ref;
    };
    let request;
    let body;
    try {
      if (requestRef.schema !== COMPOSITION_SCHEMA) throw new CompositionError("schema-mismatch", "Request schema must be composition v1");
      request = validateCompositionArtifact(await load(requestRef), "WorkflowConfigurationRequest");
      for (const key of ["preset", "bindingCatalog", "hostCapabilities", "projectOverview"]) requireSame(request[key], host[key], key);
      const existing = await readCheckpoint(request.runId);
      if (existing) return await replay(existing, requestRef);
      await load(request.projectOverview);
      const provider = closed(await load(hostIdentity.checkpointProvider.artifact), ["id", "version"], "checkpoint provider manifest");
      requireSame(provider, { id: hostIdentity.checkpointProvider.id, version: hostIdentity.checkpointProvider.version }, "Checkpoint provider");
      await validateCurrentCompositionHost({ host, load, selections: request.selections });
      if (request.lineage.mode === "new-run-swap") {
        const lineage = request.lineage;
        if (lineage.predecessorRunId === request.runId) throw new CompositionError("stale-input", "An active run cannot swap its configuration", "stale");
        const predecessor = validateCompositionArtifact(await load(lineage.predecessorConfiguration), "ResolvedWorkflowConfiguration");
        const prior = await readCheckpoint(lineage.predecessorRunId);
        if (!prior || predecessor.runId !== lineage.predecessorRunId) throw new CompositionError("stale-input", "Swap predecessor has no exact checkpoint", "stale");
        // Previous runs may have a different catalog; validate their exact persisted result without granting current execution authority.
        requireSame(predecessor, { ...prior.value.body, checkpoint: prior.ref }, "Swap predecessor");
        await load(prior.ref);
        const swap = closed(await load(lineage.swapRequest), ["kind", "predecessorRunId", "predecessorConfiguration", "newRunId"], "swap request");
        requireSame(swap, { kind: "CompositionSwapRequest", predecessorRunId: lineage.predecessorRunId,
          predecessorConfiguration: lineage.predecessorConfiguration, newRunId: request.runId }, "Swap request");
      }
      const proofs = await preflightWorkflowComposition({ request, host, load, record });
      body = { ...request, kind: "ResolvedWorkflowConfiguration", artifactId: `resolved-${requestRef.digest.slice(7, 31)}`,
        version: "1.0.0", request: requestRef, ...proofs };
    } catch (error) { return failure(requestRef, error); }

    // Storage failures are not pre-effect diagnostics: persistence may have started.
    const checkpoint = artifact("checkpoint", { kind: "CompositionCheckpoint", version: "1.0.0", runId: request.runId,
      hostDigest, request: requestRef, fingerprint: canonicalJsonDigest({ request: requestRef, hostDigest }),
      inputs: [...inputs.values()], generated, body });
    const result = immutable(validateCompositionArtifact({ ...body, checkpoint: checkpoint.ref }, "ResolvedWorkflowConfiguration"));
    for (const output of generated) await host.artifacts.put(output.ref, Buffer.from(canonicalJson(output.value)));
    await host.artifacts.put(checkpoint.ref, checkpoint.bytes);
    const resultArtifact = artifact("resolved", result, COMPOSITION_SCHEMA);
    await host.artifacts.put(resultArtifact.ref, resultArtifact.bytes);
    await host.checkpoints.commit(request.runId, checkpoint.bytes);
    const stored = await readCheckpoint(request.runId);
    if (!stored || stored.ref.digest !== checkpoint.ref.digest) throw new CompositionError("stale-input", "Durable checkpoint readback differs", "stale");
    return replay(stored, requestRef);
  }

  return Object.freeze({ resolve, verify });
}
