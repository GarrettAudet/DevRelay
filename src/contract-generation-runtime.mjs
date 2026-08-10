import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  CONTRACT_GENERATION_ARTIFACT_CONTRACTS,
  validateContractGenerationArtifact,
} from "./contract-generation-artifact-validator.mjs";
import { createContractCanonicalDiff } from "./contract-canonical-diff.mjs";
import {
  createContractFormatRegistry,
  createJsonSchemaContractBundle,
} from "./contract-format-registry.mjs";
import { loadOwnedJsonArtifact } from "./loaded-json-artifact-integrity.mjs";

const VERIFIED_RECEIPTS = new WeakSet();
const MODULE = Object.freeze({ id: "contract-generation", version: "0.1.0" });

export class ContractGenerationRuntimeError extends Error {
  constructor(message, code = "DR4051") {
    super(`contract generation runtime failed: ${message}`);
    this.name = "ContractGenerationRuntimeError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new ContractGenerationRuntimeError(message, code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (ArrayBuffer.isView(entry)) return entry;
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest,
  );
}

function validateLoaded(loaded, label) {
  try {
    return {
      ref: immutable(loaded.ref),
      bytes: Buffer.from(loaded.bytes),
      value: loadOwnedJsonArtifact(loaded, label),
    };
  } catch (error) {
    fail(error.message);
  }
}

function stableId(value) {
  return {
    ContractGeneratorRequest: value.requestId,
    GeneratedContractBundle: value.bundleId,
    ContractFormatValidationSet: value.validationSetId,
    ContractCanonicalDiff: value.diffId,
    ContractDraftSet: value.draftSetId,
    ContractChangeSetDraft: value.changeSetId,
    ContractBaseline: value.baselineId,
  }[value.kind];
}

function artifactRecord(value, uriBase = "memory://devrelay/contract-generation") {
  validateContractGenerationArtifact(value);
  const contract = CONTRACT_GENERATION_ARTIFACT_CONTRACTS[value.kind];
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  const artifactId = stableId(value);
  const ref = {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest,
    uri: `${uriBase}/${artifactId}/${digest.slice(7)}.json`,
  };
  validateContractGenerationArtifact(value, { ref });
  return immutable({ ref, value, bytesBase64: bytes.toString("base64") });
}

function nativeRecord(entry) {
  const bytes = Buffer.from(entry.bytesBase64, "base64");
  if (bytes.toString("base64") !== entry.bytesBase64) {
    fail(`${entry.id} contains invalid base64`);
  }
  const digest = sha256Digest(bytes);
  return immutable({
    ref: {
      artifactId: entry.id,
      schema: entry.schema,
      mediaType: entry.mediaType,
      digest,
      uri: `memory://devrelay/contracts/${entry.id}/${digest.slice(7)}.json`,
    },
    bytesBase64: entry.bytesBase64,
  });
}

function requiredIntents(architecture) {
  const interfaces = architecture?.sections?.interfaceIntent?.content?.interfaces;
  if (!Array.isArray(interfaces)) fail("ArchitectureBaseline omits interface intents");
  return interfaces
    .filter((entry) => entry.contractGeneration?.required === true)
    .map((entry) => {
      if (
        !Array.isArray(entry.contractGeneration.suggestedKinds) ||
        entry.contractGeneration.suggestedKinds.length !== 1
      ) {
        fail(`${entry.id} must select exactly one V1 contract kind`);
      }
      return entry;
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function intentSnapshot(intent) {
  return {
    id: intent.id,
    name: intent.name,
    purpose: intent.purpose,
    semanticInputs: intent.semanticInputs,
    semanticOutputs: intent.semanticOutputs,
    sourceRequirementIds: [...intent.sourceRequirementIds].sort(compareText),
  };
}

function operationForState(state, intentCount) {
  if (intentCount === 0) {
    if (state.state !== "not-applicable") {
      fail("zero required intents must route to ContractGate not-applicable");
    }
    return { kind: "gate", branch: "approve-not-applicable", reasonCode: "NO_REQUIRED_CONTRACT_INTENTS" };
  }
  if (state.state === "unbaselined") {
    return { kind: "module", operation: "establish-contracts", reasonCode: "CONTRACT_BASELINE_ABSENT" };
  }
  if (state.state === "baselined") {
    return { kind: "module", operation: "generate-contract-change", reasonCode: "CONTRACT_BASELINE_PRESENT" };
  }
  fail("required contract intents cannot route through not-applicable state");
}

export function deriveContractGenerationRoute({ state, architectureBaseline }) {
  validateContractGenerationArtifact(state);
  const intents = requiredIntents(architectureBaseline);
  const expectedIds = intents.map(({ id }) => id);
  if (canonicalJson(expectedIds) !== canonicalJson(state.requiredInterfaceIntentIds)) {
    fail("ProjectContractState does not bind the exact required interface intent set");
  }
  return immutable({ ...operationForState(state, intents.length), requiredInterfaceIntentIds: expectedIds });
}

function validateState(inputs, intents) {
  const { state, architecture, projectOverview, currentBaseline } = inputs;
  validateContractGenerationArtifact(state.value, { ref: state.ref });
  if (
    state.value.kind !== "ProjectContractState" ||
    !sameRef(state.value.architectureBaseline, architecture.ref) ||
    !sameRef(state.value.projectOverviewBaseline, projectOverview.ref)
  ) {
    fail("ProjectContractState does not bind the exact architecture and ProjectOverview inputs");
  }
  const ids = intents.map(({ id }) => id);
  if (canonicalJson(ids) !== canonicalJson(state.value.requiredInterfaceIntentIds)) {
    fail("ProjectContractState required intents drifted from ArchitectureBaseline");
  }
  if (state.value.state === "baselined") {
    if (!currentBaseline || !sameRef(state.value.contractBaseline, currentBaseline.ref)) {
      fail("baselined state requires the exact current ContractBaseline");
    }
    validateContractGenerationArtifact(currentBaseline.value, { ref: currentBaseline.ref });
    if (currentBaseline.value.kind !== "ContractBaseline") {
      fail("current ContractBaseline is invalid");
    }
  } else if (currentBaseline) {
    fail("an unbaselined or not-applicable state cannot supply a ContractBaseline");
  }
}

function bindings({ state, architecture, projectOverview, currentBaseline }) {
  return [
    { role: "architecture-baseline", artifact: structuredClone(architecture.ref) },
    ...(currentBaseline
      ? [{ role: "current-contract-baseline", artifact: structuredClone(currentBaseline.ref) }]
      : []),
    { role: "project-contract-state", artifact: structuredClone(state.ref) },
    { role: "project-overview-baseline", artifact: structuredClone(projectOverview.ref) },
  ].sort((left, right) => compareText(left.role, right.role));
}

function descriptor(generator, kind) {
  if (
    !generator ||
    typeof generator.id !== "string" ||
    typeof generator.version !== "string" ||
    typeof generator.generate !== "function"
  ) {
    fail(`contract kind ${kind} requires a configured generator descriptor`);
  }
  return { id: generator.id, version: generator.version, contractKind: kind };
}

function checkpointKey(executionId) {
  return `contract-generation/${executionId}`;
}

async function readCheckpoint(store, key) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    fail("a checkpoint store with get and put is required", "DR4052");
  }
  try {
    return await store.get(key);
  } catch (error) {
    fail(`checkpoint read failed: ${error.message}`, "DR4052");
  }
}

async function writeCheckpoint(store, key, value) {
  try {
    await store.put(key, value);
  } catch (error) {
    fail(`checkpoint write failed: ${error.message}`, "DR4053");
  }
}

function validateRecord(record) {
  if (!record?.ref || record.value === undefined || typeof record.bytesBase64 !== "string") {
    fail("checkpoint contains a malformed artifact record", "DR4054");
  }
  const bytes = Buffer.from(record.bytesBase64, "base64");
  if (
    bytes.toString("base64") !== record.bytesBase64 ||
    sha256Digest(bytes) !== record.ref.digest ||
    !bytes.equals(Buffer.from(canonicalJson(record.value), "utf8"))
  ) {
    fail("checkpoint artifact record is not exact", "DR4054");
  }
  validateContractGenerationArtifact(record.value, { ref: record.ref });
}

function validateCheckpoint(checkpoint, expected, registry) {
  if (
    checkpoint?.apiVersion !== "devrelay.dev/v1alpha1" ||
    checkpoint.kind !== "ContractGenerationExecutionCheckpoint" ||
    typeof checkpoint.checkpointDigest !== "string"
  ) {
    fail("checkpoint has an invalid envelope", "DR4054");
  }
  const { checkpointDigest, ...material } = checkpoint;
  if (canonicalJsonDigest(material) !== checkpointDigest) {
    fail("checkpoint digest is invalid", "DR4054");
  }
  if (
    checkpoint.executionId !== expected.executionId ||
    checkpoint.executionFingerprint !== expected.executionFingerprint ||
    checkpoint.validatorRegistryDigest !== registry.registryDigest
  ) {
    fail("checkpoint does not match the exact execution and validator registry", "DR4054");
  }
  for (const record of Object.values(checkpoint.artifacts)) {
    if (record) validateRecord(record);
  }
  for (const native of Object.values(checkpoint.nativeArtifacts)) {
    const bytes = Buffer.from(native.bytesBase64, "base64");
    if (
      bytes.toString("base64") !== native.bytesBase64 ||
      sha256Digest(bytes) !== native.ref.digest
    ) {
      fail("checkpoint native contract bytes are invalid", "DR4054");
    }
  }
  const candidate = checkpoint.artifacts.candidate?.value;
  if (candidate) {
    const validations = checkpoint.artifacts.validationSet.value;
    const diff = checkpoint.artifacts.canonicalDiff.value;
    if (
      candidate.formatValidation.digest !== checkpoint.artifacts.validationSet.ref.digest ||
      candidate.canonicalDiff.digest !== checkpoint.artifacts.canonicalDiff.ref.digest ||
      diff.resultingContractsDigest !== canonicalJsonDigest(candidate.contracts) ||
      validations.status !== "pass"
    ) {
      fail("checkpoint candidate attachments are inconsistent", "DR4054");
    }
    for (const entry of candidate.contracts) {
      const native = checkpoint.nativeArtifacts[entry.id];
      if (!native || !sameRef(native.ref, entry.artifact)) {
        fail(`${entry.id} native artifact is missing from checkpoint`, "DR4054");
      }
      const repeated = registry.validate({ entry, bytes: Buffer.from(native.bytesBase64, "base64") });
      const prior = validations.results.find(({ contractId }) => contractId === entry.id);
      if (canonicalJson(repeated) !== canonicalJson(prior)) {
        fail(`${entry.id} validator replay diverged`, "DR4054");
      }
    }
  }
  return checkpoint;
}

function sourceRefs(architecture, projectOverview) {
  return [
    { role: "architecture-interface-intents", artifact: structuredClone(architecture.ref) },
    { role: "project-overview", artifact: structuredClone(projectOverview.ref) },
  ].sort((left, right) => compareText(left.role, right.role));
}

function buildCandidate({ operation, inputBindings, intents, entries, validationRef, diffRecord, architecture, projectOverview, currentBaseline }) {
  const changes = new Map(diffRecord.value.changes.map((change) => [change.contractId, change]));
  const contracts = entries
    .map((entry) => ({
      ...entry,
      compatibility: changes.get(entry.id).compatibility,
    }))
    .sort((left, right) => compareText(left.id, right.id));
  const base = {
    apiVersion: "devrelay.dev/v1alpha1",
    operation,
    inputBindings,
    requiredInterfaceIntentIds: intents.map(({ id }) => id),
    contracts,
    formatValidation: validationRef,
    canonicalDiff: diffRecord.ref,
    nativeArtifacts: contracts.map(({ artifact }) => artifact),
    sourceRefs: sourceRefs(architecture, projectOverview),
  };
  const id = canonicalJsonDigest(base).slice(7, 23).toUpperCase();
  return operation === "establish-contracts"
    ? { ...base, kind: "ContractDraftSet", draftSetId: `CDS-${id}` }
    : {
        ...base,
        kind: "ContractChangeSetDraft",
        changeSetId: `CCS-${id}`,
        currentContractBaseline: structuredClone(currentBaseline.ref),
      };
}

export function assertVerifiedContractGenerationReceipt(receipt) {
  if (!VERIFIED_RECEIPTS.has(receipt)) {
    fail("ContractGate requires an unforgeable checkpoint replay receipt", "DR4055");
  }
  return receipt.checkpoint;
}

export function createContractGenerationRuntime({ generators, formatRegistry } = {}) {
  const registry = formatRegistry ?? createContractFormatRegistry();
  const configured = new Map(
    Object.entries(
      generators ?? {
        "json-schema": {
          id: "devrelay.json-schema-contract-generator",
          version: "0.1.0",
          generate: async (request) => createJsonSchemaContractBundle(request),
        },
      },
    ),
  );
  const generatorDescriptors = [...configured.entries()]
    .map(([kind, generator]) => descriptor(generator, kind))
    .sort((left, right) => compareText(left.contractKind, right.contractKind));

  async function execute({ executionId, state, architecture, projectOverview, currentBaseline, checkpoints }) {
    if (typeof executionId !== "string" || executionId.length === 0) fail("executionId is required");
    ({ state, architecture, projectOverview } = Object.fromEntries(
      Object.entries({ state, architecture, projectOverview }).map(([label, loaded]) => [
        label,
        validateLoaded(loaded, label),
      ]),
    ));
    if (currentBaseline) currentBaseline = validateLoaded(currentBaseline, "currentBaseline");
    const intents = requiredIntents(architecture.value);
    validateState({ state, architecture, projectOverview, currentBaseline }, intents);
    const route = operationForState(state.value, intents.length);
    if (route.kind !== "module") {
      fail("not-applicable is a ContractGate branch and cannot invoke a generator");
    }
    const operation = route.operation;
    const inputBindings = bindings({ state, architecture, projectOverview, currentBaseline });
    const usedKinds = [...new Set(intents.map((entry) => entry.contractGeneration.suggestedKinds[0]))].sort();
    const usedDescriptors = usedKinds.map((kind) => {
      const found = generatorDescriptors.find((entry) => entry.contractKind === kind);
      if (!found) fail(`no configured generator for required contract kind ${kind}`);
      if (!registry.supportedKinds.includes(kind)) fail(`no pinned validator for required contract kind ${kind}`);
      return found;
    });
    const executionFingerprint = canonicalJsonDigest({
      module: { ...MODULE, operation },
      executionId,
      inputBindings,
      generators: usedDescriptors,
      validatorRegistryDigest: registry.registryDigest,
    });
    const key = checkpointKey(executionId);
    const existing = await readCheckpoint(checkpoints, key);
    if (existing !== undefined && existing !== null) {
      const checkpoint = immutable(existing);
      validateCheckpoint(checkpoint, { executionId, executionFingerprint }, registry);
      return immutable({
        executionId,
        executionFingerprint,
        checkpointKey: key,
        replayed: true,
        outcome: checkpoint.outcome,
        progressionAllowed: checkpoint.progressionAllowed,
        candidate: checkpoint.artifacts.candidate?.value,
        candidateRef: checkpoint.artifacts.candidate?.ref,
        diagnostics: checkpoint.diagnostics,
      });
    }

    const bundleRecords = [];
    const nativeArtifacts = {};
    for (const kind of usedKinds) {
      const generator = configured.get(kind);
      const requestMaterial = {
        operation,
        contractKind: kind,
        interfaceIntents: intents
          .filter((entry) => entry.contractGeneration.suggestedKinds[0] === kind)
          .map(intentSnapshot),
        inputBindings,
        ...(currentBaseline ? { currentContractBaseline: currentBaseline.ref } : {}),
      };
      const request = {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ContractGeneratorRequest",
        requestId: `CGR-${canonicalJsonDigest(requestMaterial).slice(7, 23).toUpperCase()}`,
        ...requestMaterial,
      };
      validateContractGenerationArtifact(request);
      const bundle = immutable(await generator.generate(immutable(request)));
      validateContractGenerationArtifact(bundle);
      if (
        bundle.requestId !== request.requestId ||
        bundle.producer.id !== generator.id ||
        bundle.producer.version !== generator.version
      ) {
        fail("generator output does not bind the exact request and configured producer");
      }
      const bundleRecord = artifactRecord(bundle);
      bundleRecords.push(bundleRecord);
      for (const entry of bundle.entries) {
        if (nativeArtifacts[entry.id]) fail(`multiple generators returned ${entry.id}`);
        nativeArtifacts[entry.id] = nativeRecord(entry);
      }
    }
    const expectedIds = intents.map(({ id }) => `CT-${id}`).sort(compareText);
    const actualIds = Object.keys(nativeArtifacts).sort(compareText);
    const diagnostics = [];
    if (canonicalJson(expectedIds) !== canonicalJson(actualIds)) {
      diagnostics.push({
        code: "CG_INCOMPLETE_INTERFACE_COVERAGE",
        severity: "error",
        subject: "contract-set",
        message: "generated contracts do not cover the exact required InterfaceIntent set",
      });
    }
    const contractEntries = bundleRecords
      .flatMap(({ value }) => value.entries)
      .map((generated) => {
        const native = nativeArtifacts[generated.id];
        return {
          id: generated.id,
          interfaceIntentId: generated.interfaceIntentId,
          contractKind: generated.contractKind,
          artifact: native.ref,
          contentDigest: native.ref.digest,
          compatibility: "initial",
        };
      })
      .sort((left, right) => compareText(left.id, right.id));
    const results = contractEntries.map((entry) =>
      registry.validate({ entry, bytes: Buffer.from(nativeArtifacts[entry.id].bytesBase64, "base64") }),
    );
    for (const result of results) diagnostics.push(...result.diagnostics);
    const validationMaterial = {
      registryDigest: registry.registryDigest,
      results,
      status: results.every(({ status }) => status === "pass") ? "pass" : "fail",
    };
    const validationSet = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ContractFormatValidationSet",
      validationSetId: `CFVS-${canonicalJsonDigest(validationMaterial).slice(7, 23).toUpperCase()}`,
      ...validationMaterial,
    };
    const validationRecord = artifactRecord(validationSet);
    const diff = createContractCanonicalDiff({
      operation,
      contracts: contractEntries,
      currentBaseline: currentBaseline
        ? { ref: currentBaseline.ref, contracts: currentBaseline.value.contracts }
        : undefined,
    });
    const diffRecord = artifactRecord(diff);
    let candidateRecord;
    if (diagnostics.every(({ severity }) => severity !== "error")) {
      candidateRecord = artifactRecord(
        buildCandidate({
          operation,
          inputBindings,
          intents,
          entries: contractEntries,
          validationRef: validationRecord.ref,
          diffRecord,
          architecture,
          projectOverview,
          currentBaseline,
        }),
      );
    }
    const outcome = candidateRecord ? "generated" : "unable-to-proceed";
    const progressionAllowed = Boolean(candidateRecord);
    const artifacts = {
      validationSet: validationRecord,
      canonicalDiff: diffRecord,
      ...(candidateRecord ? { candidate: candidateRecord } : {}),
      ...Object.fromEntries(
        bundleRecords.map((record, position) => [`generatedBundle${position}`, record]),
      ),
    };
    const checkpointMaterial = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ContractGenerationExecutionCheckpoint",
      executionId,
      executionFingerprint,
      checkpointKey: key,
      operation,
      route,
      inputBindings,
      generators: usedDescriptors,
      validatorRegistryDigest: registry.registryDigest,
      outcome,
      progressionAllowed,
      diagnostics: diagnostics.sort((left, right) =>
        compareText(`${left.code}\u0000${left.subject}`, `${right.code}\u0000${right.subject}`),
      ),
      artifacts,
      nativeArtifacts,
    };
    const checkpoint = immutable({
      ...checkpointMaterial,
      checkpointDigest: canonicalJsonDigest(checkpointMaterial),
    });
    await writeCheckpoint(checkpoints, key, checkpoint);
    return immutable({
      executionId,
      executionFingerprint,
      checkpointKey: key,
      replayed: false,
      outcome,
      progressionAllowed,
      candidate: candidateRecord?.value,
      candidateRef: candidateRecord?.ref,
      diagnostics: checkpoint.diagnostics,
    });
  }

  async function verifyCheckpointedExecution({ executionId, executionFingerprint, checkpoints }) {
    const key = checkpointKey(executionId);
    const loaded = await readCheckpoint(checkpoints, key);
    if (loaded === undefined || loaded === null) {
      fail("checkpoint-only verification requires the exact checkpoint", "DR4054");
    }
    const checkpoint = immutable(loaded);
    validateCheckpoint(checkpoint, { executionId, executionFingerprint }, registry);
    const receipt = Object.freeze({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "VerifiedContractGenerationCheckpointReplayReceipt",
      executionId,
      executionFingerprint,
      checkpointKey: key,
      checkpointDigest: checkpoint.checkpointDigest,
      checkpoint,
    });
    VERIFIED_RECEIPTS.add(receipt);
    return receipt;
  }

  return Object.freeze({ execute, verifyCheckpointedExecution, formatRegistry: registry });
}
