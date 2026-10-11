// For tests: the sample data loaded into a fresh in-memory database.
// No embeddings, so search-by-meaning isn't available here (searches match by
// keywords only); everything else is.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { chunkFinePrint } from "@/lib/fine-print";
import { replaceFinePrint, replaceTransactions, setUpDatabase } from "@/lib/search";
import { accountNameFromFile, parseStatement } from "@/lib/transactions";

export const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];

export const sampleTransactions = () =>
  SAMPLE_FILES.flatMap((name) =>
    parseStatement(readFileSync(`public/sample-data/${name}`, "utf8"), accountNameFromFile(name)),
  );

export async function sampleDatabase() {
  const db = await PGlite.create({ extensions: { vector, pg_textsearch } });
  await setUpDatabase(db);
  await replaceTransactions(db, sampleTransactions());
  await replaceFinePrint(db, chunkFinePrint(readFileSync("public/sample-data/fine-print.txt", "utf8"), "fine-print"));
  return db;
}
