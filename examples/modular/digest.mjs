import { createHash, webcrypto } from "node:crypto";
import { createPluginCatalog } from "../../src/modular.mjs";
import { sha256Digest } from "../../src/content-digest.mjs";
import { compileArtifactSchema } from "../../src/schema-validation.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";

const apiVersion = "devrelay.dev/v1alpha1";
const textSchema = "https://devrelay.dev/examples/modular/text/v1";
const overviewSchema = "https://devrelay.dev/artifacts/project-overview-baseline/v1";
const requirementsSchema = "https://devrelay.dev/artifacts/requirements-baseline/v1";
const validateText = compileArtifactSchema({
  type: "object", additionalProperties: false, required: ["text"],
  properties: { text: { type: "string", maxLength: 16777216 } },
});
const jsonPort = (name, schema, mediaType = "application/json") =>
  ({ name, schema, mediaTypes: [mediaType], cardinality: "one", required: true });

export const digestModule = {
  apiVersion, kind: "ModuleDefinition",
  metadata: { id: "example.content-digest", version: "1.0.0",
    description: "Compute SHA-256 of a declared UTF-8 text artifact." },
  operations: [{
    id: "compute", description: "Return the lowercase hexadecimal SHA-256.",
    inputs: [
      jsonPort("content", textSchema),
      jsonPort("requirements-baseline", requirementsSchema, "application/vnd.devrelay.requirements-baseline+json"),
      jsonPort("project-overview-baseline", overviewSchema, "application/vnd.devrelay.project-overview-baseline+json"),
    ],
    outputs: [jsonPort("digest", textSchema)],
    inputRules: [], outcomes: ["computed"], evidence: ["example/digest"],
    optionsSchema: { type: "object", additionalProperties: false },
    resultContracts: {
      computed: { status: "completed", requiredInputs: [], forbiddenInputs: [],
        requiredOutputs: ["digest"], allowedOutputs: ["digest"],
        requiredEvidence: [{ kind: "example/digest", statuses: ["pass"], artifactOutput: "digest" }],
        diagnosticsRequired: false },
    },
  }],
};

function definition(id, description) {
  return {
    apiVersion, kind: "ModulePlugin", metadata: { id, version: "1.0.0", description },
    implements: [{ module: { id: "example.content-digest", version: "1.0.0" },
      operations: [{ id: "compute", execution: "pure",
        configSchema: { type: "object", additionalProperties: false }, capabilities: [] }] }],
  };
}

export const digestPluginDefinitions = [
  definition("node-sha256", "Native Node createHash implementation."),
  definition("webcrypto-sha256", "WebCrypto subtle.digest implementation."),
];

/**
 * Reference host for pure computation. Context is explicit and validated by
 * the existing runtime. This in-memory store is not a durable effect host.
 */
export function createDigestExample({ requirementsBytes, overviewBytes, overviewMarkdownBytes }) {
  const values = new Map();
  let sequence = 0;
  function storeBytes(bytes, artifactId, schema, mediaType = "application/json") {
    const copy = Buffer.from(bytes);
    const digest = sha256Digest(copy);
    const ref = { artifactId, schema, mediaType, digest, uri: `memory://modular-example/${digest.slice(7)}` };
    values.set(ref.uri, copy);
    return ref;
  }
  const artifacts = { async load(ref) {
    const bytes = values.get(ref.uri);
    if (!bytes) throw new Error(`Unknown example artifact: ${ref.artifactId}`);
    return Buffer.from(bytes);
  } };
  const requirements = JSON.parse(Buffer.from(requirementsBytes).toString("utf8"));
  const overview = JSON.parse(Buffer.from(overviewBytes).toString("utf8"));
  const requirementsRef = storeBytes(requirementsBytes, requirements.baselineId, requirementsSchema,
    "application/vnd.devrelay.requirements-baseline+json");
  const overviewRef = storeBytes(overviewBytes, overview.baselineId, overviewSchema,
    "application/vnd.devrelay.project-overview-baseline+json");
  // Preserve the baseline's declared Markdown reference; Core validates bytes.
  values.set(overview.renderedDocument.artifact.uri, Buffer.from(overviewMarkdownBytes));
  function storeText(text) {
    const value = { text };
    if (!validateText(value)) throw new TypeError("text must be a string of at most 16777216 characters");
    const bytes = Buffer.from(JSON.stringify(value));
    return storeBytes(bytes, `text-${sha256Digest(bytes).slice(7)}`, textSchema);
  }
  const implementations = [
    async text => createHash("sha256").update(text, "utf8").digest("hex"),
    async text => Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("hex"),
  ];
  const plugins = digestPluginDefinitions.map((pluginDefinition, index) => ({
    definition: pluginDefinition,
    adapter: { async invoke(invocation) {
      const input = JSON.parse((await artifacts.load(invocation.inputs.content[0])).toString("utf8"));
      const output = storeText(await implementations[index](input.text));
      return {
        apiVersion, kind: "ModuleResult", invocationId: invocation.invocationId,
        status: "completed", outcome: "computed", outputs: { digest: [output] },
        evidence: [{ kind: "example/digest", subject: output.artifactId, status: "pass", artifact: output }],
        diagnostics: [],
      };
    } },
  }));
  const catalog = createPluginCatalog({
    modules: [digestModule], plugins,
    artifactContracts: [
      ...requirementsRuntimeArtifactContracts(),
      { schema: textSchema, validate(value) {
        if (!validateText(value)) throw new TypeError("invalid text artifact");
      } },
    ],
  });
  const runtimeContext = { artifacts };
  function invocation({ plugin, text, input }) {
    if ((text !== undefined) === (input !== undefined)) throw new TypeError("supply exactly one of text or input");
    return {
      apiVersion, kind: "ModuleInvocation", invocationId: `digest-${++sequence}`,
      runId: "modular-example", nodeId: "digest",
      module: { id: "example.content-digest", version: "1.0.0", operation: "compute" },
      plugin: { id: plugin, version: "1.0.0" },
      inputs: { content: [input ?? storeText(text)],
        "requirements-baseline": [requirementsRef], "project-overview-baseline": [overviewRef] },
      config: {}, options: {}, grants: [],
    };
  }
  return {
    catalog, runtimeContext, storeText, invocation,
    async execute(request) {
      const result = await catalog.registry.execute(invocation(request), runtimeContext);
      const value = JSON.parse((await artifacts.load(result.outputs.digest[0])).toString("utf8"));
      return { result, value };
    },
  };
}
