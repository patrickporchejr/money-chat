import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleTransactions } from "@/lib/test-helpers";
import { accountNameFromFile, parseStatement } from "@/lib/transactions";

describe("parseStatement", () => {
  it("reads both sample statements", () => {
    const all = sampleTransactions();
    assert.equal(all.filter((t) => t.account === "Harbor Bank Checking").length, 87);
    assert.equal(all.filter((t) => t.account === "Summit Card").length, 576);
    assert.ok(all.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount)));
  });

  it("reads US dates and a signed amount column (checking layout)", () => {
    const [t] = parseStatement("Date,Description,Amount,Balance\n06/11/2026,OVERDRAFT FEE,-35.00,-410.42", "Checking");
    assert.deepEqual([t.date, t.description, t.amount, t.category], ["2026-06-11", "OVERDRAFT FEE", -35, null]);
  });

  it("prefers the transaction date and keeps the bank's category (card layout)", () => {
    const [t] = parseStatement(
      "Transaction Date,Post Date,Description,Category,Amount\n2026-07-09,2026-07-10,HOTEL ALFAMA LISBOA,Travel,-1120.00",
      "Card",
    );
    assert.deepEqual([t.date, t.amount, t.category], ["2026-07-09", -1120, "Travel"]);
  });

  it("handles separate money in/out columns, $ and commas, short dates", () => {
    const rows = parseStatement('Posted Date,Payee,Debit,Credit\n3/4/26,"COFFEE, INC",$4.50,\n3/5/26,PAYROLL,,"$1,200.00"', "Other");
    assert.deepEqual(
      rows.map((t) => [t.date, t.description, t.amount]),
      [
        ["2026-03-04", "COFFEE, INC", -4.5],
        ["2026-03-05", "PAYROLL", 1200],
      ],
    );
  });

  it("treats (12.00) as negative", () => {
    const [t] = parseStatement("Date,Description,Amount\n2026-01-01,FEE,(12.00)", "X");
    assert.equal(t.amount, -12);
  });

  it("explains files it can't read", () => {
    assert.throws(() => parseStatement("Foo,Bar\n1,2", "Weird"), /couldn't find a date, description and amount column/);
    assert.throws(() => parseStatement("Date,Description,Amount\nyesterday,X,1", "Bad"), /row 2: couldn't read the date "yesterday"/);
  });
});

describe("accountNameFromFile", () => {
  it("turns file names into account names", () => {
    assert.equal(accountNameFromFile("harbor-bank-checking.csv"), "Harbor Bank Checking");
    assert.equal(accountNameFromFile("summit_card.CSV"), "Summit Card");
  });
});
