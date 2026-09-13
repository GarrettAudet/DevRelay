import { canonicalJson } from "./content-digest.mjs";

const COMMANDS = Object.freeze([
  "init",
  "run",
  "resume",
  "status",
  "verify",
  "inspect",
  "evidence",
]);
const EXIT = Object.freeze({
  pass: 0,
  validation: 2,
  clarification: 3,
  approval: 4,
  effect: 5,
  recovery: 6,
  verification: 7,
  internal: 70,
});
const SECRET_KEY = /(password|secret|token|credential|private[-_]?key)/iu;

export class OperatorCliError extends Error {
  constructor(message, code = "DR4770", exitCode = EXIT.validation) {
    super(`operator CLI: ${message}`);
    this.name = "OperatorCliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}
const fail = (message, code, exitCode) => {
  throw new OperatorCliError(message, code, exitCode);
};
const immutable = (value) => Object.freeze(structuredClone(value));
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redact(child),
    ]),
  );
};
const disposition = (result) =>
  result?.outputs?.outcome ?? result?.outputs?.status ?? result?.outcome ?? result?.status ?? "invalid-result";
const exitFor = (result) => {
  const outcome = String(disposition(result));
  if (
    [
      "pass",
      "completed",
      "verified",
      "integrated",
      "accepted",
      "initialized",
      "replayed",
    ].includes(outcome)
  ) {
    return EXIT.pass;
  }
  if (outcome.includes("clarif")) return EXIT.clarification;
  if (outcome.includes("approval")) return EXIT.approval;
  if (
    outcome.includes("recover") ||
    outcome.includes("quarantin") ||
    outcome.includes("interrupt")
  ) {
    return EXIT.recovery;
  }
  if (outcome.includes("verif") || outcome.includes("evidence")) {
    return EXIT.verification;
  }
  return EXIT.effect;
};
const concise = (command, result, exitCode) => {
  const outcome = disposition(result);
  const detail = result?.outputs ?? result;
  const evidence = result?.outputs?.evidence ?? result?.evidence ?? [];
  return [
    `DevRelay ${command}: ${outcome}`,
    ...(detail?.scope ? [`Scope: ${detail.scope}`] : []),
    ...(detail?.runId ? [`Run: ${detail.runId}`] : []),
    ...(detail?.state?.status ? [`State: ${detail.state.status}`] : []),
    ...(detail?.checkpointDigest ? [`Checkpoint: ${detail.checkpointDigest}`] : []),
    ...(detail?.desktopRequest ? [`Desktop request: ${detail.desktopRequest.requestId}`] : []),
    ...(evidence.length
      ? [
          `Evidence: ${evidence
            .map((entry) => entry.digest ?? entry.artifactId)
            .join(", ")}`,
        ]
      : []),
    `Exit: ${exitCode}`,
  ].join("\n");
};

export function createOperatorCli({ relay, initialize, evidence }) {
  if (
    !relay ||
    typeof relay.run !== "function" ||
    typeof relay.resume !== "function" ||
    typeof relay.verify !== "function" ||
    typeof relay.inspect !== "function"
  ) {
    fail("a configured DevRelay facade is required");
  }
  if (typeof initialize !== "function" || typeof evidence !== "function") {
    fail("initialize and evidence host operations are required");
  }
  return Object.freeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DevRelayOperatorCli",
    interfaceIntentId: "IF-SIM-CLI",
    commands: COMMANDS,
    async execute({ command, version = "v1", input = {}, format = "human" } = {}) {
      if (!COMMANDS.includes(command)) fail("command is missing or unsupported");
      if (version !== "v1") fail("command version is unsupported");
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        fail("command input must be an object");
      }
      if (!["human", "json"].includes(format)) {
        fail("output format must be human or json");
      }
      let result;
      try {
        if (command === "init") result = await initialize(immutable(input));
        else if (command === "run") result = await relay.run(input);
        else if (command === "resume") result = await relay.resume(input);
        else if (command === "verify") result = await relay.verify(input);
        else if (command === "evidence") result = await evidence(immutable(input));
        else {
          result = await relay.inspect({
            ...input,
            subject: command === "status" ? { kind: "status" } : input.subject,
          });
        }
        if (
          !result || typeof result !== "object" || Array.isArray(result) ||
          typeof disposition(result) !== "string" || disposition(result) === "invalid-result"
        ) {
          fail("host operation returned no explicit result disposition", "DR4772", EXIT.internal);
        }
      } catch (error) {
        const requestedExit = error?.exitCode;
        const exitCode = Object.values(EXIT).includes(requestedExit) && requestedExit !== EXIT.pass
          ? requestedExit
          : (error?.code === "DR4741" ? EXIT.recovery : EXIT.validation);
        const body = {
          apiVersion: "devrelay.dev/v1alpha1",
          kind: "OperatorCommandResult",
          command,
          version,
          outcome: "failed",
          exitCode,
          diagnostics: [
            {
              code: error?.code ?? "DR4779",
              message: error?.message ?? "unknown command failure",
            },
          ],
          evidence: [],
        };
        return immutable({
          ...body,
          stdout:
            format === "json"
              ? canonicalJson(redact(body))
              : concise(command, body, exitCode),
          stderr: "",
        });
      }
      const exitCode = exitFor(result);
      const body = {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "OperatorCommandResult",
        command,
        version,
        outcome: disposition(result),
        exitCode,
        result: redact(result),
      };
      return immutable({
        ...body,
        stdout: format === "json" ? canonicalJson(body) : concise(command, body.result, exitCode),
        stderr: "",
      });
    },
  });
}

export function parseOperatorArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    fail("argv must be an array of strings");
  }
  if (argv.length === 1 && argv[0] === "--help") return immutable({ help: true });
  if (argv.length === 1 && argv[0] === "--version") return immutable({ version: true });
  const [command, ...flags] = argv;
  if (!COMMANDS.includes(command)) fail("command is missing or unsupported");
  if (flags.length === 1 && flags[0] === "--help") return immutable({ help: true });
  let format = "human";
  let input = {};
  let hostPath;
  let hostDigest;
  const seen = new Set();
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!["--json", "--input", "--host", "--host-digest"].includes(flag)) fail("unsupported command argument");
    if (seen.has(flag)) fail("duplicate command argument");
    seen.add(flag);
    if (flag === "--json") {
      format = "json";
    } else if (flag === "--host" || flag === "--host-digest") {
      const value = flags[++index];
      if (!value || value.startsWith("--")) fail("host arguments require explicit values");
      if (flag === "--host") hostPath = value;
      else hostDigest = value;
    } else {
      const value = flags[++index];
      if (value === undefined) fail("--input requires a JSON object");
      try {
        input = JSON.parse(value);
      } catch {
        fail("--input contains invalid JSON");
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        fail("--input must contain a JSON object");
      }
    }
  }
  if ((hostPath === undefined) !== (hostDigest === undefined) || (hostDigest !== undefined && !/^sha256:[a-f0-9]{64}$/u.test(hostDigest))) fail("--host and --host-digest must form an exact configuration binding");
  return immutable({ command, version: "v1", input, format, ...(hostPath === undefined ? {} : { host: { path: hostPath, digest: hostDigest } }) });
}

export const OPERATOR_COMMANDS = COMMANDS;
export const OPERATOR_EXIT_CODES = EXIT;
