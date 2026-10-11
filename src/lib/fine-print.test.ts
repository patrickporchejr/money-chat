import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { chunkFinePrint } from "@/lib/fine-print";

describe("chunkFinePrint", () => {
  const chunks = chunkFinePrint(readFileSync("public/sample-data/fine-print.txt", "utf8"), "fine-print");

  it("keeps each rule with its section heading", () => {
    const overdraft = chunks.find((c) => c.text.startsWith("Overdraft fee: $35.00"));
    assert.ok(overdraft);
    assert.equal(overdraft.heading, "HARBOR BANK: EVERYDAY CHECKING, Fee schedule");
    assert.match(overdraft.text, /below \$0\.00/);
    assert.match(overdraft.text, /no more than 3 overdraft fees per day/);

    const late = chunks.find((c) => c.text.startsWith("Late payment fee"));
    assert.equal(late?.heading, "SUMMIT CARD: CARDHOLDER AGREEMENT, Rates and fees");
  });

  it("splits into one chunk per paragraph, with unique ids", () => {
    assert.equal(chunks.length, 9);
    assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
    assert.ok(chunks.every((c) => c.text.length > 0 && !c.text.includes("====")));
  });

  it("finds the rate change notice", () => {
    const notice = chunks.find((c) => c.text.includes("24.99%"));
    assert.equal(notice?.heading, "SUMMIT CARD: NOTICE OF CHANGE TO YOUR ACCOUNT, Sent: February 15, 2026");
    assert.match(notice!.text, /22\.49%/);
  });

  it("understands markdown headings too", () => {
    const md = chunkFinePrint("# Fees\n\nWire fee: $25.\n\n## Rates\nAPR 20%.\nVariable.", "bank");
    assert.deepEqual(
      md.map((c) => [c.id, c.heading, c.text]),
      [
        ["bank-1", "Fees", "Wire fee: $25."],
        ["bank-2", "Rates", "APR 20%. Variable."],
      ],
    );
  });
});
