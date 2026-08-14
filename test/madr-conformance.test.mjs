import assert from "node:assert/strict";
import test from "node:test";

import { validateMadrDocument } from "../src/madr-conformance.mjs";

const template = {
  repository: "https://github.com/adr/madr",
  version: "4.0.0",
  sourceCommit: "2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d",
  digest: `sha256:${"a".repeat(64)}`,
};
const valid = Buffer.from(`# Choose a bounded provider\n\n## Status\n\nProposed\n\n## Context and Problem Statement\n\nA decision is required.\n\n## Decision Drivers\n\n* Determinism\n\n## Considered Options\n\n* Bounded\n* Unbounded\n\n## Decision Outcome\n\nChosen option: "Bounded", because it preserves authority.\n\n### Consequences\n\n* Good, because authority remains explicit.\n* Bad, because conformance evidence is required.\n`);

test("MADR 4 conformance binds exact official template and canonical document bytes", () => {
  const proof = validateMadrDocument({ documentId: "ADR-1", bytes: valid, template });
  assert.equal(proof.outcome, "conformant");
  assert.equal(proof.template.sourceCommit, template.sourceCommit);
});

test("MADR 4 conformance rejects missing rationale, placeholders, and floating template identity", () => {
  assert.throws(() => validateMadrDocument({ documentId: "ADR-1", bytes: Buffer.from(valid.toString().replace("Chosen option:", "Chosen:")), template }), /chosen option/u);
  assert.throws(() => validateMadrDocument({ documentId: "ADR-1", bytes: Buffer.from(valid.toString().replace("bounded provider", "{title}")), template }), /unresolved/u);
  assert.throws(() => validateMadrDocument({ documentId: "ADR-1", bytes: valid, template: { ...template, version: "latest" } }), /exact official/u);
});
