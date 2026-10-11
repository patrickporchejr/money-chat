// The math and filtering the chat relies on. Expected numbers were computed
// separately from the CSV files, not by this code.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { findRecurringCharges, listTransactions, searchFinePrint, summarizeTransactions } from "@/lib/search";
import { sampleDatabase } from "@/lib/test-helpers";

const COFFEE = [
  "BLUE BOTTLE COFFEE #12",
  "SQ *BLUE BTL 0423 OAKLAND CA",
  "SQ *BLUEBOTTLE OAKLAND",
  "STARBUCKS STORE 08812",
  "STARBUCKS #0912 NEW YORK",
  "JOE'S CAFE 0098",
  "TST* JOES CAFE BROOKLYN",
];
const GROCERIES = ["TRADER JOE S #548 BROOKLYN", "TRADER JOES #548", "WHOLEFDS BKN 10233", "WHOLE FOODS MKT #102"];

let db: PGlite;
before(async () => {
  db = await sampleDatabase();
});

describe("summarizeTransactions", () => {
  it("totals coffee in 2026", async () => {
    const [s] = await summarizeTransactions(db, { descriptions: COFFEE, dateFrom: "2026-01-01", dateTo: "2026-12-31" });
    assert.deepEqual([s.group, s.count, s.spent, s.received], [null, 135, 863.41, 0]);
  });

  it("averages groceries", async () => {
    const [s] = await summarizeTransactions(db, { descriptions: GROCERIES });
    assert.deepEqual([s.count, s.spent, s.averageSpend], [72, 5246.97, 72.87]);
  });

  it("finds the month with the most card spending", async () => {
    const months = await summarizeTransactions(db, { account: "Summit Card", maxAmount: 0 }, "month");
    assert.deepEqual([months[0].group, months[0].spent], ["2026-07", 3361.76]);
    assert.deepEqual([months[1].group, months[1].spent], ["2026-02", 1435.52]);
  });

  it("compares stores when grouped by description", async () => {
    const stores = await summarizeTransactions(db, { descriptions: COFFEE }, "description");
    const total = (pattern: RegExp) => stores.filter((g) => pattern.test(g.group!)).reduce((sum, g) => sum + g.spent, 0);
    assert.equal(Math.round(total(/BLUE/) * 100) / 100, 625.41);
    assert.equal(Math.round(total(/STARBUCKS/) * 100) / 100, 285.59);
  });

  it("counts money in separately from money out", async () => {
    const [s] = await summarizeTransactions(db, { descriptions: ["ACME DESIGN CO PAYROLL DIR DEP"] });
    assert.deepEqual([s.count, s.spent, s.received, s.averageSpend, s.largest], [26, 0, 71500, null, null]);
  });

  it("returns example transactions to cite", async () => {
    const [s] = await summarizeTransactions(db, { descriptions: ["FOREIGN TRANSACTION FEE"] });
    assert.deepEqual([s.count, s.spent], [5, 38.18]);
    assert.deepEqual([s.largest?.date, s.largest?.amount], ["2026-07-09", -33.6]);
    assert.deepEqual([s.latest?.date, s.latest?.amount], ["2026-07-13", -2.2]);
  });

  it("returns nothing when nothing matches", async () => {
    assert.deepEqual(await summarizeTransactions(db, { descriptions: ["DISNEY PLUS"] }), []);
  });
});

describe("listTransactions", () => {
  it("sorts by biggest spend, across every transaction (not just the latest 60)", async () => {
    const [top] = await listTransactions(db, {}, 1, "largest_spend");
    assert.deepEqual([top.description, top.amount], ["MIDAS AUTO SERVICE #2214", -8150]);
  });

  it("finds the three largest card charges", async () => {
    const top = await listTransactions(db, { account: "Summit Card" }, 3, "largest_spend");
    assert.deepEqual(
      top.map((t) => t.description),
      ["HOTEL ALFAMA LISBOA", "TAP AIR PORTUGAL 0472", "EQUINOX BROOKLYN HTS"],
    );
  });

  it("finds the cheapest coffee", async () => {
    const [cheapest] = await listTransactions(db, { descriptions: COFFEE }, 1, "smallest_spend");
    assert.deepEqual([cheapest.description, cheapest.amount, cheapest.date], ["TST* JOES CAFE BROOKLYN", -3.08, "2026-04-13"]);
  });

  it("filters by date and account", async () => {
    const day = await listTransactions(db, { dateFrom: "2026-06-11", dateTo: "2026-06-11" });
    assert.deepEqual(
      day.map((t) => t.description).sort(),
      ["MIDAS AUTO SERVICE #2214", "MTA*NYCT PAYGO", "OMNY MTA NEW YORK", "OVERDRAFT FEE"].sort(),
    );
    const checkingOnly = await listTransactions(db, { dateFrom: "2026-06-11", dateTo: "2026-06-11", account: "Harbor Bank Checking" });
    assert.equal(checkingOnly.length, 2);
  });

  it("lists newest first by default and respects the limit", async () => {
    const rows = await listTransactions(db, {}, 5);
    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((t) => t.date),
      rows.map((t) => t.date).sort().reverse(),
    );
  });
});

describe("findRecurringCharges", () => {
  it("finds subscriptions and bills, but not everyday habits or varying bills", async () => {
    const found = (await findRecurringCharges(db)).map((c) => c.description);
    for (const sub of ["EQUINOX BROOKLYN HTS", "NETFLIX.COM", "SPOTIFY USA", "NYTIMES DIGITAL", "APPLE.COM/BILL ICLOUD"]) {
      assert.ok(found.includes(sub), `missing ${sub}`);
    }
    assert.ok(found.includes("ZELLE TO BROOKLYN HEIGHTS MGMT RENT"));
    for (const notRecurring of ["BLUE BOTTLE COFFEE #12", "MTA*NYCT PAYGO", "CON ED OF NY ONLINE PMT"]) {
      assert.ok(!found.includes(notRecurring), `${notRecurring} shouldn't count as recurring`);
    }
  });
});

describe("searchFinePrint (keyword half; meaning needs the embedding model)", () => {
  // No embeddings in tests, so the meaning ranking finds nothing and results come from BM25.
  const noMeaning = new Array(384).fill(0.01);

  it("finds the rule for a fee", async () => {
    const [top] = await searchFinePrint(db, { text: "overdraft fee", embedding: noMeaning });
    assert.match(top.text, /^Overdraft fee: \$35\.00/);
    assert.deepEqual(top.matchedBy, ["words"]);
  });

  it("matches word forms (stemming) and section headings", async () => {
    const [top] = await searchFinePrint(db, { text: "late payments", embedding: noMeaning });
    assert.match(top.text, /^Late payment fee/);
    const rates = await searchFinePrint(db, { text: "notice of change", embedding: noMeaning });
    assert.ok(rates.some((c) => c.text.includes("24.99%")));
  });

  it("returns nothing for unrelated words", async () => {
    assert.deepEqual(await searchFinePrint(db, { text: "xyzzy", embedding: noMeaning }), []);
  });
});
