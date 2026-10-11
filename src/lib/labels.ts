// Turns messy bank descriptions into store names and categories:
//   "SQ *BLUE BTL 0423 OAKLAND CA" -> Blue Bottle Coffee, Coffee
//
// It's RAG at import time: for each new description, find the most similar
// descriptions that already have labels (including the user's corrections),
// and give them to Claude as examples. Correct a label once, and the next
// import that sees a similar description gets it right, with no retraining.

import type Anthropic from "@anthropic-ai/sdk";
import type { PGlite } from "@electric-sql/pglite";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  applyLabels,
  labelsMissingEmbeddings,
  nearestLabels,
  saveLabelEmbeddings,
  saveLabels,
  unlabeledDescriptions,
  type LabelSource,
  type MerchantLabel,
} from "@/lib/search";

export const CATEGORIES = [
  "Coffee",
  "Groceries",
  "Dining",
  "Food delivery",
  "Transportation",
  "Travel",
  "Shopping",
  "Health & fitness",
  "Entertainment",
  "Software & services",
  "Utilities & internet",
  "Rent & housing",
  "Auto",
  "Income",
  "Transfers & card payments",
  "Investing",
  "Fees & interest",
  "Other",
] as const;

const BATCH_SIZE = 80; // descriptions per Claude call
const EXAMPLES_PER_DESCRIPTION = 5;
const MAX_EXAMPLES = 40;

type Example = MerchantLabel & { source: LabelSource };

// The request Claude sees: the new descriptions, plus similar ones that are
// already labeled. Corrections are marked so Claude follows them closely.
export function buildLabelPrompt(items: { description: string; category: string | null }[], examples: Example[]) {
  const exampleLines = examples.length
    ? examples.map((e) => `- "${e.description}" -> ${e.merchant} | ${e.category}${e.source === "user" ? "  (corrected by the user)" : ""}`).join("\n")
    : "(none yet)";
  return `Label each bank transaction description with a clean store name and a category.

Rules:
- The store name is what a person would call it: "SQ *BLUE BTL 0423 OAKLAND CA" -> "Blue Bottle Coffee". Use the same name for every spelling of the same store, and match the names in the examples when it's the same store.
- Pick the category from this list only: ${CATEGORIES.join(", ")}.
- Examples corrected by the user are always right. Follow them for similar descriptions.
- If the bank gave a category, use it as a hint, not a rule.

Already labeled (similar descriptions):
${exampleLines}

Label these (bank category in brackets, if any):
${items.map((i) => `- "${i.description}"${i.category ? ` [${i.category}]` : ""}`).join("\n")}`;
}

const LabelsOutput = z.object({
  labels: z.array(z.object({ description: z.string(), merchant: z.string(), category: z.enum(CATEGORIES) })),
});

// Labels every description that doesn't have a label yet, then applies all
// labels to the transactions. Returns how many were labeled.
export async function labelNewDescriptions({
  client,
  model,
  db,
  embed,
}: {
  client: Anthropic;
  model: string;
  db: PGlite;
  embed: (texts: string[]) => Promise<number[][]>;
}) {
  // Existing labels need embeddings to be found as examples.
  const missing = await labelsMissingEmbeddings(db);
  if (missing.length) await saveLabelEmbeddings(db, missing, await embed(missing));

  const todo = await unlabeledDescriptions(db);
  let labeled = 0;
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const vectors = await embed(batch.map((b) => b.description));

    // The nearest labeled examples for each description, de-duplicated.
    const examples = new Map<string, Example>();
    for (const v of vectors) {
      for (const e of await nearestLabels(db, v, EXAMPLES_PER_DESCRIPTION)) examples.set(e.description, e);
    }

    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(LabelsOutput) },
      messages: [{ role: "user", content: buildLabelPrompt(batch, [...examples.values()].slice(0, MAX_EXAMPLES)) }],
    });
    const wanted = new Set(batch.map((b) => b.description));
    const labels = (response.parsed_output?.labels ?? []).filter((l) => wanted.has(l.description) && l.merchant.trim());

    await saveLabels(db, labels, "model");
    const labeledVectors = labels.map((l) => vectors[batch.findIndex((b) => b.description === l.description)]);
    await saveLabelEmbeddings(db, labels.map((l) => l.description), labeledVectors);
    labeled += labels.length;
  }

  await applyLabels(db);
  return labeled;
}

// A user's correction: applies to every transaction with this description
// right away, and becomes an example for future labeling.
export async function correctLabel(
  db: PGlite,
  embed: (texts: string[]) => Promise<number[][]>,
  label: MerchantLabel,
) {
  await saveLabels(db, [label], "user");
  await saveLabelEmbeddings(db, [label.description], await embed([label.description]));
  await applyLabels(db);
}
