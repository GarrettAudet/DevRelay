#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../src/content-digest.mjs";
import {
  OperatorCliError,
  OPERATOR_COMMANDS,
  OPERATOR_EXIT_CODES,
  parseOperatorArguments,
} from "../src/operator-cli.mjs";

const argv = process.argv.slice(2);
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);
try {
  const parsed = parseOperatorArguments(argv);
  if (parsed.help === true) {
    process.stdout.write(
      "DevRelay commands: init run resume status verify inspect evidence\n" +
        "Use --json and --input '{...}' for deterministic machine operation.\n" +
        "Commands require a configured ChatGPT Desktop host binding.\n",
    );
    process.exitCode = OPERATOR_EXIT_CODES.pass;
  } else if (parsed.version === true) {
    process.stdout.write(`${pkg.version}\n`);
    process.exitCode = OPERATOR_EXIT_CODES.pass;
  } else {
    throw new OperatorCliError(
      "a ChatGPT Desktop host binding is required; use createOperatorCli from devrelay/advanced",
      "DR4771",
      OPERATOR_EXIT_CODES.internal,
    );
  }
} catch (error) {
  const known = error instanceof OperatorCliError;
  const exitCode = known ? error.exitCode : OPERATOR_EXIT_CODES.internal;
  const message = known ? error.message : "operator CLI: internal failure";
  // Never echo raw argv, JSON payloads, or unexpected exception text.
  if (argv.includes("--json")) {
    process.stdout.write(`${canonicalJson({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "OperatorCommandResult",
      ...(OPERATOR_COMMANDS.includes(argv[0]) ? { command: argv[0] } : {}),
      version: "v1",
      outcome: "failed",
      exitCode,
      diagnostics: [{ code: known ? error.code : "DR4779", message }],
      evidence: [],
    })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = exitCode;
}
