import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseName, uploadKind } from "@/lib/uploads";

describe("uploadKind", () => {
  it("treats CSVs as statements and text/markdown as fine print", () => {
    assert.equal(uploadKind("checking.csv"), "statement");
    assert.equal(uploadKind("CARD.CSV"), "statement");
    assert.equal(uploadKind("fee-schedule.txt"), "fine-print");
    assert.equal(uploadKind("agreement.md"), "fine-print");
  });

  it("rejects anything else", () => {
    assert.equal(uploadKind("statement.pdf"), null);
    assert.equal(uploadKind("no-extension"), null);
  });
});

describe("baseName", () => {
  it("drops the extension", () => {
    assert.equal(baseName("chase-fee-schedule.txt"), "chase-fee-schedule");
  });
});
