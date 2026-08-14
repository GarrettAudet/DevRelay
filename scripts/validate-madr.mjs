import fs from "node:fs";
import path from "node:path";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateMadrDocument } from "../src/madr-conformance.mjs";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`${flag} is required`);
  return args[index + 1];
};
if (args[0] !== "validate") throw new Error("only validate is supported");
const version = value("--template-version");
const documentPath = path.resolve(value("--document"));
const templatePath = path.resolve(value("--template"));
const sourceCommit = value("--source-commit");
const proof = validateMadrDocument({
  documentId: path.basename(documentPath),
  bytes: fs.readFileSync(documentPath),
  template: {
    repository: "https://github.com/adr/madr",
    version,
    sourceCommit,
    digest: sha256Digest(fs.readFileSync(templatePath)),
  },
});
process.stdout.write(`${JSON.stringify(proof)}\n`);
