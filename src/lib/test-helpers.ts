// For tests: the sample data loaded into a fresh in-memory database.
// No embeddings, so search-by-meaning isn't available here; everything else is.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { replaceTransactions, setUpDatabase } from "@/lib/search";
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
  return db;
}
