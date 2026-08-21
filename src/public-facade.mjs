import { canonicalJsonDigest } from "./content-digest.mjs";
import { resolveWorkflowProfile } from "./workflow-profiles.mjs";
import { validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const NAME = /^[a-z][a-z0-9.-]{1,127}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const OPERATIONS = Object.freeze(["run", "resume", "verify", "inspect", "conclude"]);
const HOST_OPERATIONS = Object.freeze(["bootstrap", ...OPERATIONS]);

export class DevRelayFacadeError extends Error {
  constructor(message, code = "DR4740") {
    super(`DevRelay facade: ${message}`);
    this.name = "DevRelayFacadeError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new DevRelayFacadeError(message, code);
};
const deepFreeze = (value) => {
  const copy = structuredClone(value);
  const visit = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) visit(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return visit(copy);
};
const ensureObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
};

export function defineModule(definition) {
  ensureObject(definition, "module definition");
  if (!NAME.test(definition.id ?? "") || !VERSION.test(definition.version ?? "")) fail("module identity is invalid");
  if (!Array.isArray(definition.operations) || definition.operations.length === 0) fail("module operations are required");
  const operations = [...new Set(definition.operations)];
  if (operations.length !== definition.operations.length || operations.some((operation) => !NAME.test(operation))) {
    fail("module operations must be unique canonical names");
  }
  const body = { id: definition.id, version: definition.version, operations: operations.sort(), contracts: deepFreeze(definition.contracts ?? {}) };
  return deepFreeze({ apiVersion: API_VERSION, kind: "DevRelayModuleDefinition", ...body, definitionDigest: canonicalJsonDigest(body) });
}

export function definePlugin(definition) {
  ensureObject(definition, "plugin definition");
  if (!NAME.test(definition.id ?? "") || !VERSION.test(definition.version ?? "")) fail("plugin identity is invalid");
  if (!Array.isArray(definition.capabilities) || definition.capabilities.length === 0) fail("plugin capabilities are required");
  const capabilities = [...new Set(definition.capabilities)].sort();
  if (capabilities.length !== definition.capabilities.length || capabilities.some((capability) => !NAME.test(capability))) {
    fail("plugin capabilities must be unique canonical names");
  }
  const body = {
    id: definition.id,
    version: definition.version,
    capabilities,
    maturity: definition.maturity ?? "contract-defined",
    ...(definition.configurationDigest === undefined
      ? {}
      : { configurationDigest: definition.configurationDigest }),
  };
  if (body.configurationDigest !== undefined && !DIGEST.test(body.configurationDigest)) fail("plugin configuration digest is invalid");
  return deepFreeze({ apiVersion: API_VERSION, kind: "DevRelayPluginDefinition", ...body, definitionDigest: canonicalJsonDigest(body) });
}

export function createLocalHost({ hostId = "local.windows", platform = process.platform, services, grants = [] }) {
  if (!NAME.test(hostId) || platform !== "win32") fail("supported local host must be an explicitly named Windows host");
  ensureObject(services, "host services");
  for (const operation of HOST_OPERATIONS) if (typeof services[operation] !== "function") fail(`host service ${operation} is required`);
  const declaredGrants = deepFreeze(grants);
  const hostDigest = canonicalJsonDigest({ hostId, platform, grants: declaredGrants });
  return Object.freeze({
    apiVersion: API_VERSION,
    kind: "DevRelayLocalHost",
    hostId,
    platform,
    grants: declaredGrants,
    hostDigest,
    async invoke(operation, request) {
      if (!HOST_OPERATIONS.includes(operation)) fail(`unsupported host operation ${operation}`);
      return services[operation](deepFreeze(request));
    },
  });
}

function moduleMap(values) {
  const result = new Map();
  for (const value of values ?? []) {
    const module = value?.kind === "DevRelayModuleDefinition" ? value : defineModule(value);
    if (result.has(module.id)) fail(`duplicate module ${module.id}`);
    result.set(module.id, module);
  }
  return result;
}
function pluginMap(values) {
  const result = new Map();
  for (const value of values ?? []) {
    const plugin = value?.kind === "DevRelayPluginDefinition" ? value : definePlugin(value);
    if (result.has(plugin.id)) fail(`duplicate plugin ${plugin.id}`);
    result.set(plugin.id, plugin);
  }
  return result;
}
function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} is required`);
  return value;
}
function normalizeRequest(operation, request, defaults) {
  ensureObject(request, `${operation} request`);
  const common = {
    projectId: requireText(request.projectId, "projectId"),
    taskId: requireText(request.taskId, "taskId"),
    profile: request.profile ?? defaults.profile,
  };
  resolveWorkflowProfile({
    profileName: common.profile,
    projectRiskContext: request.projectRiskContext,
  });
  if (operation === "run") requireText(request.goal, "goal");
  else if (operation === "conclude") requireText(request.sessionId, "sessionId");
  else requireText(request.runId, "runId");
  if (operation === "resume" && !DIGEST.test(request.checkpointDigest ?? "")) fail("resume requires an exact checkpoint digest", "DR4741");
  if (operation === "verify" && request.subject === undefined) fail("verify subject is required");
  return deepFreeze({ ...request, ...common, approvals: deepFreeze(request.approvals ?? []) });
}
function envelope(operation, inputs, outputs) {
  ensureObject(outputs, `${operation} host result`);
  const body = {
    apiVersion: API_VERSION,
    interfaceIntentId: "IF-SIM-FACADE",
    inputs: { operation, requestDigest: canonicalJsonDigest(inputs) },
    outputs: deepFreeze(outputs),
  };
  return deepFreeze({ ...body, operationDigest: canonicalJsonDigest(body) });
}

export function createDevRelay({ projectId, host, profile = "standard", modules = [], plugins = [] }) {
  requireText(projectId, "projectId");
  if (host?.kind !== "DevRelayLocalHost" || typeof host.invoke !== "function") fail("validated local host is required");
  resolveWorkflowProfile({ profileName: profile });
  const configuredModules = moduleMap(modules);
  const configuredPlugins = pluginMap(plugins);
  const configurationDigest = canonicalJsonDigest({
    projectId,
    host: { hostId: host.hostId, hostDigest: host.hostDigest },
    profile,
    modules: [...configuredModules.values()].map(({ id, definitionDigest }) => ({ id, definitionDigest })),
    plugins: [...configuredPlugins.values()].map(({ id, definitionDigest }) => ({ id, definitionDigest })),
  });
  const relay = {
    apiVersion: API_VERSION,
    kind: "DevRelay",
    projectId,
    profile,
    configurationDigest,
  };
  const sessionReceipts = new Map();
  const loadSessionReceipt = async (normalized) => {
    const cached = sessionReceipts.get(normalized.taskId);
    if (cached) return cached;
    const receipt = await host.invoke("bootstrap", {
      apiVersion: API_VERSION,
      projectId,
      taskId: normalized.taskId,
      profile: normalized.profile,
      configurationDigest,
      host: { hostId: host.hostId, hostDigest: host.hostDigest },
    });
    try {
      validateRoadmapArtifact(receipt);
    } catch (error) {
      fail(`host returned an invalid session context receipt: ${error.message}`, "DR4742");
    }
    if (receipt.projectId !== projectId || receipt.taskId !== normalized.taskId) {
      fail("session context receipt identity was substituted", "DR4742");
    }
    if (receipt.outcome === "fail" || receipt.moduleExecutionAllowed !== true) {
      fail(`session context bootstrap failed: ${(receipt.diagnostics ?? []).join("; ") || "execution is not allowed"}`, "DR4742");
    }
    sessionReceipts.set(normalized.taskId, receipt);
    return receipt;
  };
  for (const operation of OPERATIONS) {
    relay[operation] = async (request = {}) => {
      if (request.projectId !== undefined && request.projectId !== projectId) fail("request project identity does not match configured project", "DR4741");
      const normalized = normalizeRequest(operation, { ...request, projectId }, { profile });
      const receipt = await loadSessionReceipt(normalized);
      const sessionContext = deepFreeze({
        receipt,
        executionConstraint: receipt.outcome === "RoadmapNotInitialized"
          ? "roadmap-baseline-establishment-only"
          : "full",
      });
      const boundRequest = deepFreeze({
        ...normalized,
        sessionContext,
        configurationDigest,
        host: { hostId: host.hostId, hostDigest: host.hostDigest },
      });
      const outputs = await host.invoke(operation, boundRequest);
      return envelope(operation, boundRequest, outputs);
    };
  }
  return Object.freeze(relay);
}

export const run = (relay, request) => relay.run(request);
export const resume = (relay, request) => relay.resume(request);
export const verify = (relay, request) => relay.verify(request);
export const inspect = (relay, request) => relay.inspect(request);
export const conclude = (relay, request) => relay.conclude(request);

