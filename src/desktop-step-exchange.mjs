import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { compileArtifactSchema, documentValidators } from "./schema-validation.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(schema("desktop-step-exchange.schema.json"), [
  schema("module-invocation.schema.json"), schema("module-result.schema.json"), schema("module-step-result.schema.json"),
]);
const API_VERSION = "devrelay.dev/v1alpha1";

export class DesktopStepExchangeError extends Error {
  constructor(message, code = "DR4950") {
    super(`Desktop step exchange: ${message}`);
    this.name = "DesktopStepExchangeError";
    this.code = code;
  }
}
export class DesktopStepRequired extends DesktopStepExchangeError {
  constructor(request) {
    super("the exact pending step requires a Desktop-operated result", "DR4951");
    this.name = "DesktopStepRequired";
    this.request = request;
  }
}
const fail = (message, code) => { throw new DesktopStepExchangeError(message, code); };
const digest = (value) => /^sha256:[a-f0-9]{64}$/u.test(value ?? "");

// This adapter exchanges candidate data only. It does not launch an agent,
// execute a command, approve a result, or expose graph/storage services to one.
// Core calls it AFTER its existing routing, capability and input preflight.
export function createDesktopStepExchange({ storage, namespace, contextDigest } = {}) {
  if (typeof namespace !== "string" || !namespace.trim()) fail("an explicit namespace is required");
  if (!digest(contextDigest)) fail("an exact validated session context digest is required");
  const requests = createLocalHostCheckpointStore({ storage, namespace: `${namespace}/requests` });
  const responses = createLocalHostCheckpointStore({ storage, namespace: `${namespace}/responses` });
  const selections = new Map();
  const assertRequest = (request) => {
    if (!validate(request) || request.kind !== "DesktopStepRequest" || request.contextDigest !== contextDigest) fail("request contract or context drifted", "DR4952");
    const { requestId, ...body } = request;
    if (requestId !== canonicalJsonDigest(body)) fail("request identity drifted", "DR4952");
    const invocation = request.invocation;
    const valid = invocation.kind === "ModuleInvocation"
      ? documentValidators.moduleInvocation(invocation)
      : documentValidators.moduleStepInvocation(invocation);
    if (!valid || invocation.invocationId !== request.producer.invocationId) fail("request invocation is invalid", "DR4952");
    if (canonicalJsonDigest(invocation.plugin) !== canonicalJsonDigest(request.producer.plugin)) fail("request producer plugin drifted", "DR4952");
    return request;
  };
  const readRequest = (requestId) => {
    if (!digest(requestId)) fail("requestId must be an exact digest");
    const request = requests.get(requestId);
    if (!request) fail("pending request is unavailable", "DR4952");
    assertRequest(request);
    if (request.requestId !== requestId) fail("stored request identity was substituted", "DR4952");
    return request;
  };
  const assertResponse = (response, request) => {
    if (!validate(response) || response.kind !== "DesktopStepResponse" || response.requestId !== request.requestId ||
        response.requestDigest !== canonicalJsonDigest(request)) fail("response does not bind the exact pending request", "DR4952");
    const result = response.result;
    if (result.invocationId !== request.invocation.invocationId) fail("response invocation was substituted", "DR4952");
    const chained = request.invocation.kind === "ModuleStepInvocation";
    if (chained !== (result.kind === "ModuleStepResult")) fail("response kind does not match the requested step", "DR4952");
    if (chained) {
      for (const field of ["invocationFingerprint", "chainFingerprint", "stepInvocationDigest", "step", "plugin"]) {
        if (canonicalJsonDigest(result[field]) !== canonicalJsonDigest(request.producer[field])) fail("response step binding was substituted", "DR4952");
      }
    }
    return response;
  };
  return Object.freeze({
    readRequest,
    submit(response) {
      const request = readRequest(response?.requestId);
      assertResponse(response, request);
      // A submitted response is an immutable candidate, never a completed Core
      // checkpoint. Core still validates outcomes, bytes, lineage and graph work.
      const responseDigest = canonicalJsonDigest(response);
      const persisted = responses.put(`${request.requestId}:${responseDigest}`, response);
      selections.set(request.requestId, persisted);
      return persisted;
    },
    adapter: Object.freeze({
      async invoke(invocation, _adapterContext, suppliedProducer) {
        const producer = invocation.kind === "ModuleStepInvocation"
          ? Object.fromEntries(["invocationId", "step", "plugin", "invocationFingerprint", "chainFingerprint", "stepInvocationDigest"].map((field) => [field, invocation[field]]))
          : suppliedProducer;
        if (!producer) fail("Desktop exchange requires a Core effect-step producer");
        const body = { apiVersion: API_VERSION, kind: "DesktopStepRequest", contextDigest, invocation, producer };
        const request = { ...body, requestId: canonicalJsonDigest(body) };
        assertRequest(request);
        const persisted = requests.put(request.requestId, request);
        const response = selections.get(request.requestId);
        if (!response) throw new DesktopStepRequired(persisted);
        return assertResponse(response, persisted).result;
      },
    }),
  });
}
