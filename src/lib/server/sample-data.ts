// Server side (and scripts): the sample data, loaded into an in-memory database
// with embeddings, for the demo chat. Built once per server instance (~1 s).

import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { chunkFinePrint } from "@/lib/fine-print";
import {
  EMBEDDING_MODEL,
  applyLabels,
  finePrintMissingEmbeddings,
  replaceFinePrint,
  replaceTransactions,
  saveEmbeddings,
  saveFinePrintEmbeddings,
  saveLabels,
  setUpDatabase,
  textsMissingEmbeddings,
} from "@/lib/search";
import { readFinePrint, readSampleFiles, SAMPLE_LABELS } from "@/lib/server/sample-files";
import { accountNameFromFile, parseStatement } from "@/lib/transactions";

// Servers like Vercel only allow writing to the temp folder; the model is cached there.
env.cacheDir = path.join(tmpdir(), "money-chat-models");

let model: Promise<FeatureExtractionPipeline> | null = null;

export async function embed(texts: string[]) {
  model ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
  const output = await (await model)(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

let db: Promise<PGlite> | null = null;

export function getSampleDatabase() {
  db ??= (async () => {
    const pg = await PGlite.create({ extensions: { vector, pg_textsearch } });
    await setUpDatabase(pg);
    const transactions = (await readSampleFiles()).flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name)));
    await replaceTransactions(pg, transactions);
    await saveLabels(pg, SAMPLE_LABELS, "model"); // store names, labeled once by scripts/label-sample.mts
    await applyLabels(pg);
    const texts = await textsMissingEmbeddings(pg);
    await saveEmbeddings(pg, texts, await embed(texts));

    await replaceFinePrint(pg, chunkFinePrint(await readFinePrint(), "fine-print"));
    const chunks = await finePrintMissingEmbeddings(pg);
    await saveFinePrintEmbeddings(pg, chunks.map((c) => c.id), await embed(chunks.map((c) => c.search_text)));
    return pg;
  })();
  return db;
}
