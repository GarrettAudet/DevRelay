#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseOperatorArguments } from "../src/operator-cli.mjs";

const parsed = parseOperatorArguments(process.argv.slice(2));
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);
if (parsed.help) {
  process.stdout.write(
    "DevRelay commands: init run resume status verify inspect evidence\n" +
      "Use --json and --input '{...}' for deterministic machine operation.\n",
  );
  process.exitCode = 0;
} else if (parsed.version) {
  process.stdout.write(`${pkg.version}\n`);
  process.exitCode = 0;
} else {
  process.stderr.write(
    "DevRelay CLI requires a ChatGPT Desktop host binding; " +
      "use createOperatorCli from devrelay/advanced.\n",
  );
  process.exitCode = 70;
}
