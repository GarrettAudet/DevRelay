import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.env.MEM0_TELEMETRY = "false";

const mem0Entry = process.env.DEVRELAY_MEM0_ENTRY;
assert.ok(mem0Entry, "DEVRELAY_MEM0_ENTRY is required");
const { Memory } = await import(pathToFileURL(mem0Entry));

class DeterministicEmbeddings {
  constructor(dimension = 32) {
    this.embeddingDimension = dimension;
  }

  vector(text) {
    const values = Array(this.embeddingDimension).fill(0);
    const tokens = String(text).normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const token of tokens) {
      let hash = 2166136261;
      for (const character of token) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      values[hash % values.length] += 1;
    }
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
    return values.map((value) => value / magnitude);
  }

  async embedQuery(text) {
    return this.vector(text);
  }

  async embedDocuments(texts) {
    return texts.map((text) => this.vector(text));
  }
}

const memory = new Memory({
  version: "v1.1",
  disableHistory: true,
  embedder: {
    provider: "langchain",
    config: { model: new DeterministicEmbeddings(), embeddingDims: 32 },
  },
  vectorStore: {
    provider: "memory",
    config: {
      collectionName: "pm001-probe",
      dimension: 32,
      dbPath: join(tmpdir(), `devrelay-mem0-probe-${process.pid}-${Date.now()}.db`),
    },
  },
  llm: {
    provider: "langchain",
    config: {
      model: {
        modelId: "devrelay-local-no-inference",
        async invoke() {
          return { content: "{}" };
        },
      },
    },
  },
});

const added = await memory.add(
  "DevRelay project memory remains deterministic and local.",
  {
    userId: "project-devrelay",
    infer: false,
    metadata: { memoryId: "MEM-PROBE-1" },
  },
);
assert.equal(added.results.length, 1);
const found = await memory.search("deterministic local project memory", {
  filters: { user_id: "project-devrelay" },
  topK: 5,
});
assert.equal(found.results.length, 1);
assert.equal(found.results[0].metadata.memoryId, "MEM-PROBE-1");
process.stdout.write(`${JSON.stringify({
  provider: "mem0ai/oss",
  version: "3.1.6",
  addCount: added.results.length,
  searchCount: found.results.length,
  memoryId: found.results[0].metadata.memoryId,
  networkUsed: false,
})}\n`);
