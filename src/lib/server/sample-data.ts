// Server side (and scripts): the sample data, loaded into an in-memory database
// with embeddings, for the demo chat. Built once per server instance (~1 s).

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { AGENT_SETTINGS } from "@/lib/agent";
import { EMBEDDING_MODEL, replaceTransactions, saveEmbeddings, setUpDatabase, textsMissingEmbeddings } from "@/lib/search";
import { accountNameFromFile, parseStatement } from "@/lib/transactions";

const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];

// Servers like Vercel only allow writing to the temp folder; the model is cached there.
env.cacheDir = path.join(tmpdir(), "money-chat-models");

let model: Promise<FeatureExtractionPipeline> | null = null;

export async function embed(texts: string[]) {
  model ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
  const output = await (await model)(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

const readSampleFiles = () =>
  Promise.all(
    SAMPLE_FILES.map(async (name) => ({
      name,
      text: await readFile(path.join(process.cwd(), "public/sample-data", name), "utf8"),
    })),
  );

// A short fingerprint of everything that shapes a demo answer: the sample data
// and the agent's model, prompt and tools. Saved answers are only used when
// their fingerprint matches, so changing any of these retires them.
let version: Promise<string> | null = null;
export function answersVersion() {
  version ??= (async () => {
    const files = await readSampleFiles();
    const hash = createHash("sha256").update(JSON.stringify({ files, agent: AGENT_SETTINGS, EMBEDDING_MODEL }));
    return hash.digest("hex").slice(0, 12);
  })();
  return version;
}

let db: Promise<PGlite> | null = null;

export function getSampleDatabase() {
  db ??= (async () => {
    const pg = await PGlite.create({ extensions: { vector, pg_textsearch } });
    await setUpDatabase(pg);
    const transactions = (await readSampleFiles()).flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name)));
    await replaceTransactions(pg, transactions);
    const texts = await textsMissingEmbeddings(pg);
    await saveEmbeddings(pg, texts, await embed(texts));
    return pg;
  })();
  return db;
}
