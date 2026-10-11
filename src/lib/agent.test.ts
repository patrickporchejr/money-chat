import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoToday, describeFilters, systemPrompt } from "@/lib/agent";

describe("demoToday", () => {
  it("is the first day of the month after the statements end", () => {
    assert.equal(demoToday("2026-09-28"), "2026-10-01");
    assert.equal(demoToday("2026-09-01"), "2026-10-01");
  });

  it("rolls over the year in December", () => {
    assert.equal(demoToday("2026-12-31"), "2027-01-01");
  });
});

describe("describeFilters", () => {
  it("summarizes stores, dates, account and sort for the 'Searched for' line", () => {
    assert.equal(describeFilters({}), "everything");
    assert.equal(describeFilters({ descriptions: ["NETFLIX.COM"] }), "NETFLIX.COM");
    assert.equal(describeFilters({ descriptions: ["A", "B", "C"], date_from: "2026-01-01", date_to: "2026-12-31" }), "3 stores, 2026-01-01 to 2026-12-31");
    assert.equal(describeFilters({ account: "Summit Card", sort: "largest_spend" }), "Summit Card, largest spend");
    assert.equal(describeFilters({ sort: "newest", date_to: "2026-06-30" }), "until 2026-06-30");
  });
});

describe("systemPrompt", () => {
  const data = { accounts: ["Summit Card"], first: "2025-10-01", last: "2026-09-28" };

  it("calls the demo data made-up and dates it from the data", () => {
    const demo = systemPrompt(data, "demo");
    assert.match(demo, /made-up sample data/);
    assert.match(demo, /Treat today as 2026-10-01/);
    assert.match(demo, /"this year" means 2026/);
  });

  it("treats your own statements as real and uses the real date", () => {
    const own = systemPrompt(data, "own", "2027-03-15");
    assert.doesNotMatch(own, /made-up/);
    assert.match(own, /the user's own statements/);
    assert.match(own, /Treat today as 2027-03-15/);
    assert.match(own, /"this year" means 2027/);
    assert.doesNotMatch(own, /\{(about|accounts|first|last|today|year)\}/);
  });
});
