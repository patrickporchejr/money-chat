import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoToday, describeFilters } from "@/lib/agent";

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
