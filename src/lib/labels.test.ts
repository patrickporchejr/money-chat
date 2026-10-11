import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { PGlite } from "@electric-sql/pglite";
import { buildLabelPrompt, correctLabel, labelNewDescriptions } from "@/lib/labels";
import {
  applyLabels,
  getAllTransactions,
  getLabels,
  nearestLabels,
  saveLabelEmbeddings,
  saveLabels,
  searchText,
  summarizeTransactions,
  unlabeledDescriptions,
} from "@/lib/search";
import { sampleDatabase } from "@/lib/test-helpers";

// A stand-in for the embedding model: descriptions mentioning BLUE or BOTTLE
// point one way, STARBUCKS another, everything else a third.
const fakeEmbed = async (texts: string[]) =>
  texts.map((t) => {
    const v = new Array(384).fill(0);
    v[/BLUE|BOTTLE/i.test(t) ? 0 : /STARBUCKS/i.test(t) ? 1 : 2] = 1;
    return v;
  });

// A stand-in for Claude that labels everything it's asked about, and records
// the prompts it saw.
function fakeClaude(label: (description: string) => { merchant: string; category: string }) {
  const prompts: string[] = [];
  const client = {
    messages: {
      parse: async (req: { messages: { content: string }[] }) => {
        const prompt = req.messages[0].content;
        prompts.push(prompt);
        const asked = [...prompt.split("Label these")[1].matchAll(/- "(.+?)"/g)].map((m) => m[1]);
        return { parsed_output: { labels: asked.map((d) => ({ description: d, ...label(d) })) } };
      },
    },
  } as unknown as Anthropic;
  return { client, prompts };
}

let db: PGlite;
beforeEach(async () => {
  db = await sampleDatabase();
});

describe("store labels in the database", () => {
  it("applies labels: store name always, category only where the bank gave none", async () => {
    await saveLabels(
      db,
      [
        { description: "SQ *BLUE BTL 0423 OAKLAND CA", merchant: "Blue Bottle Coffee", category: "Coffee" },
        { description: "MIDAS AUTO SERVICE #2214", merchant: "Midas", category: "Auto" },
      ],
      "model",
    );
    await applyLabels(db);
    const rows = await getAllTransactions(db);
    const oakland = rows.find((t) => t.description === "SQ *BLUE BTL 0423 OAKLAND CA")!;
    assert.equal(oakland.merchant, "Blue Bottle Coffee");
    assert.equal(oakland.category, "Food & Drink"); // the card's own category is kept
    const midas = rows.find((t) => t.description === "MIDAS AUTO SERVICE #2214")!;
    assert.deepEqual([midas.merchant, midas.category], ["Midas", "Auto"]); // checking has no bank category
  });

  it("keeps the database's search text identical to searchText()", async () => {
    await saveLabels(db, [{ description: "SQ *BLUE BTL 0423 OAKLAND CA", merchant: "Blue Bottle Coffee", category: "Coffee" }], "model");
    await applyLabels(db);
    const { rows } = await db.query<{ description: string; category: string | null; merchant: string | null; search_text: string; embedding: unknown }>(
      "select description, category, merchant, search_text, embedding from transactions where description = 'SQ *BLUE BTL 0423 OAKLAND CA' limit 1",
    );
    assert.equal(rows[0].search_text, searchText(rows[0]));
    assert.equal(rows[0].search_text, "SQ *BLUE BTL 0423 OAKLAND CA - Blue Bottle Coffee (Food & Drink)");
    assert.equal(rows[0].embedding, null); // changed text -> re-embedded later
  });

  it("never lets a model label overwrite a user's correction", async () => {
    await saveLabels(db, [{ description: "NYTIMES DIGITAL", merchant: "The New York Times", category: "Entertainment" }], "user");
    await saveLabels(db, [{ description: "NYTIMES DIGITAL", merchant: "NYT", category: "Other" }], "model");
    const [label] = (await getLabels(db)).filter((l) => l.description === "NYTIMES DIGITAL");
    assert.deepEqual([label.merchant, label.source], ["The New York Times", "user"]);
  });

  it("lets a correction override the bank's category", async () => {
    await saveLabels(db, [{ description: "EQUINOX BROOKLYN HTS", merchant: "Equinox", category: "Health & fitness" }], "user");
    await applyLabels(db);
    const equinox = (await getAllTransactions(db)).find((t) => t.description === "EQUINOX BROOKLYN HTS")!;
    assert.equal(equinox.category, "Health & fitness"); // the card said "Health"; the user's word wins
  });

  it("totals by store name across every spelling", async () => {
    await saveLabels(
      db,
      ["BLUE BOTTLE COFFEE #12", "SQ *BLUE BTL 0423 OAKLAND CA", "SQ *BLUEBOTTLE OAKLAND"].map((d) => ({
        description: d,
        merchant: "Blue Bottle Coffee",
        category: "Coffee",
      })),
      "model",
    );
    await applyLabels(db);
    const [blueBottle] = await summarizeTransactions(db, { merchants: ["Blue Bottle Coffee"] });
    assert.deepEqual([blueBottle.count, blueBottle.spent], [96, 625.41]);
    const byStore = await summarizeTransactions(db, { merchants: ["Blue Bottle Coffee"] }, "merchant");
    assert.deepEqual(byStore.map((g) => g.group), ["Blue Bottle Coffee"]);
  });

  it("finds the most similar labeled descriptions, corrections first on a tie", async () => {
    await saveLabels(db, [{ description: "BLUE BOTTLE COFFEE #12", merchant: "Blue Bottle Coffee", category: "Coffee" }], "model");
    await saveLabels(db, [{ description: "SQ *BLUEBOTTLE OAKLAND", merchant: "Blue Bottle Coffee", category: "Coffee" }], "user");
    await saveLabels(db, [{ description: "STARBUCKS STORE 08812", merchant: "Starbucks", category: "Coffee" }], "model");
    const labeled = ["BLUE BOTTLE COFFEE #12", "SQ *BLUEBOTTLE OAKLAND", "STARBUCKS STORE 08812"];
    await saveLabelEmbeddings(db, labeled, await fakeEmbed(labeled));
    const [query] = await fakeEmbed(["SQ *BLUE BTL 0423 OAKLAND CA"]);
    const near = await nearestLabels(db, query, 2);
    assert.deepEqual(near.map((l) => l.description), ["SQ *BLUEBOTTLE OAKLAND", "BLUE BOTTLE COFFEE #12"]);
  });
});

describe("labelNewDescriptions", () => {
  it("labels every unlabeled description and applies the labels", async () => {
    const { client } = fakeClaude((d) => ({ merchant: d.split(" ")[0], category: "Other" }));
    const before = (await unlabeledDescriptions(db)).length;
    assert.equal(before, 45);
    assert.equal(await labelNewDescriptions({ client, model: "fake", db, embed: fakeEmbed }), 45);
    assert.equal((await unlabeledDescriptions(db)).length, 0);
    assert.ok((await getAllTransactions(db)).every((t) => t.merchant));
  });

  it("shows Claude the user's corrections as examples for similar descriptions", async () => {
    await correctLabel(db, fakeEmbed, { description: "BLUE BOTTLE COFFEE #12", merchant: "Blue Bottle Coffee", category: "Coffee" });
    const { client, prompts } = fakeClaude(() => ({ merchant: "x", category: "Other" }));
    await labelNewDescriptions({ client, model: "fake", db, embed: fakeEmbed });
    assert.match(prompts[0], /"BLUE BOTTLE COFFEE #12" -> Blue Bottle Coffee \| Coffee {2}\(corrected by the user\)/);
    assert.doesNotMatch(prompts[0].split("Label these")[1], /BLUE BOTTLE COFFEE #12/); // already labeled, not asked again
  });

  it("ignores labels for descriptions it didn't ask about", async () => {
    const client = {
      messages: { parse: async () => ({ parsed_output: { labels: [{ description: "MADE UP", merchant: "Nope", category: "Other" }] } }) },
    } as unknown as Anthropic;
    assert.equal(await labelNewDescriptions({ client, model: "fake", db, embed: fakeEmbed }), 0);
    assert.ok(!(await getLabels(db)).some((l) => l.description === "MADE UP"));
  });
});

describe("buildLabelPrompt", () => {
  it("lists the categories, examples and the bank's hints", () => {
    const prompt = buildLabelPrompt(
      [{ description: "SQ *BLUE BTL 0423 OAKLAND CA", category: "Food & Drink" }],
      [{ description: "BLUE BOTTLE COFFEE #12", merchant: "Blue Bottle Coffee", category: "Coffee", source: "model" }],
    );
    assert.match(prompt, /Coffee, Groceries, Dining/);
    assert.match(prompt, /- "BLUE BOTTLE COFFEE #12" -> Blue Bottle Coffee \| Coffee\n/);
    assert.match(prompt, /- "SQ \*BLUE BTL 0423 OAKLAND CA" \[Food & Drink\]/);
  });
});
