// Labels the sample data's bank descriptions with store names and categories,
// once, and saves them in the repo. The demo and the "Try sample data" button
// use the saved labels, so visitors never pay for labeling.
// Run with: npm run label-sample  (needs ANTHROPIC_API_KEY in .env.local)

import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { labelNewDescriptions } from "@/lib/labels";
import { getLabels, replaceTransactions, setUpDatabase, unlabeledDescriptions } from "@/lib/search";
import { embed } from "@/lib/server/sample-data";
import { readSampleFiles } from "@/lib/server/sample-files";
import { accountNameFromFile, parseStatement } from "@/lib/transactions";

const OUT = "src/data/sample-labels.json";
const MODEL = "claude-opus-5-5";

const db = await PGlite.create({ extensions: { vector, pg_textsearch } });
await setUpDatabase(db);
await replaceTransactions(db, (await readSampleFiles()).flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name))));

const labeled = await labelNewDescriptions({ client: new Anthropic(), model: MODEL, db, embed });
const left = await unlabeledDescriptions(db);
if (left.length) throw new Error(`Not labeled: ${left.map((l) => l.description).join(", ")}`);

const labels = (await getLabels(db)).map(({ description, merchant, category }) => ({ description, merchant, category }));
writeFileSync(OUT, JSON.stringify(labels, null, 2) + "\n");
for (const l of labels) console.log(`${l.description.padEnd(38)} -> ${l.merchant} | ${l.category}`);
console.log(`\nLabeled ${labeled} descriptions with ${MODEL}; saved to ${OUT}`);
