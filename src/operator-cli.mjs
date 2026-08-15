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
  result?.outputs?.outcome ?? result?.outcome ?? result?.status ?? "pass";
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
  const evidence = result?.outputs?.evidence ?? result?.evidence ?? [];
  return [
    `DevRelay ${command}: ${outcome}`,
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
      } catch (error) {
        const exitCode =
          error?.exitCode ?? (error?.code === "DR4741" ? EXIT.recovery : EXIT.validation);
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
  if (!Array.isArray(argv)) fail("argv must be an array");
  if (argv.includes("--help")) return immutable({ help: true });
  if (argv.includes("--version")) return immutable({ version: true });
  const [command, ...flags] = argv;
  const format = flags.includes("--json") ? "json" : "human";
  const inputAt = flags.indexOf("--input");
  let input = {};
  if (inputAt >= 0) {
    if (!flags[inputAt + 1]) fail("--input requires canonical JSON");
    try {
      input = JSON.parse(flags[inputAt + 1]);
    } catch {
      fail("--input contains invalid JSON");
    }
  }
  return immutable({ command, version: "v1", input, format });
}

export const OPERATOR_COMMANDS = COMMANDS;
export const OPERATOR_EXIT_CODES = EXIT;
