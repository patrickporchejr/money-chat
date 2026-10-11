import Papa from "papaparse";

// One transaction, in the same shape no matter which bank it came from.
export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string; // exactly as the bank wrote it
  amount: number; // negative = money out, positive = money in
  category: string | null; // from the bank, or from a store label (lib/labels)
  account: string; // which statement it came from
  merchant?: string | null; // cleaned-up store name, e.g. "Blue Bottle Coffee", once labeled
};

// Banks name their columns differently. These are the names we look for,
// in order of preference.
const COLUMN_NAMES = {
  date: ["transaction date", "date", "posted date", "post date"],
  description: ["description", "payee", "merchant", "name", "memo"],
  amount: ["amount"],
  debit: ["debit", "withdrawal", "money out"],
  credit: ["credit", "deposit", "money in"],
  category: ["category"],
};

function findColumn(headers: string[], options: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const option of options) {
    const index = lower.indexOf(option);
    if (index !== -1) return headers[index];
  }
  return null;
}

// Accepts 03/14/2026, 3/14/26 or 2026-03-14. Returns 2026-03-14.
function toIsoDate(value: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!us) return null;
  const [, month, day, year] = us;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// "$1,234.50" or "(12.00)" -> number
function toNumber(value: string | undefined) {
  if (!value || !value.trim()) return 0;
  const text = value.trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  const number = Number(text.replace(/[$,()\s]/g, ""));
  return negative ? -number : number;
}

// "harbor-bank-checking.csv" -> "Harbor Bank Checking"
export function accountNameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Reads a bank CSV and returns its transactions.
// Throws an error with a plain-English message if we can't read it.
export function parseStatement(csvText: string, account: string): Transaction[] {
  const { data, meta } = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = meta.fields ?? [];

  const dateCol = findColumn(headers, COLUMN_NAMES.date);
  const descriptionCol = findColumn(headers, COLUMN_NAMES.description);
  const amountCol = findColumn(headers, COLUMN_NAMES.amount);
  const debitCol = findColumn(headers, COLUMN_NAMES.debit);
  const creditCol = findColumn(headers, COLUMN_NAMES.credit);
  const categoryCol = findColumn(headers, COLUMN_NAMES.category);

  if (!dateCol || !descriptionCol || (!amountCol && !debitCol && !creditCol)) {
    throw new Error(
      `${account}: couldn't find a date, description and amount column. Columns found: ${headers.join(", ")}`,
    );
  }

  return data.map((row, i) => {
    const date = toIsoDate(row[dateCol] ?? "");
    if (!date) throw new Error(`${account}, row ${i + 2}: couldn't read the date "${row[dateCol]}"`);

    // Some banks use one signed Amount column, others split money in and out.
    const amount = amountCol
      ? toNumber(row[amountCol])
      : toNumber(creditCol ? row[creditCol] : undefined) - Math.abs(toNumber(debitCol ? row[debitCol] : undefined));

    return {
      id: `${account}-${i}`,
      date,
      description: (row[descriptionCol] ?? "").trim(),
      amount,
      category: categoryCol ? row[categoryCol]?.trim() || null : null,
      account,
    };
  });
}
