"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountNameFromFile, parseStatement, type Transaction } from "@/lib/transactions";

const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];

const formatMoney = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TransactionsView() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Everything happens in the browser. Files are read here and never uploaded anywhere.
  function load(files: { name: string; text: string }[]) {
    try {
      const all = files.flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name)));
      all.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(all);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading that file.");
    }
  }

  async function loadSampleData() {
    const files = await Promise.all(
      SAMPLE_FILES.map(async (name) => ({ name, text: await (await fetch(`/sample-data/${name}`)).text() })),
    );
    load(files);
  }

  async function loadUploads(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = await Promise.all([...fileList].map(async (f) => ({ name: f.name, text: await f.text() })));
    load(files);
  }

  const accounts = [...new Set(transactions.map((t) => t.account))];
  const dates = transactions.map((t) => t.date);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={loadSampleData}>Try sample data</Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          Upload CSV statements
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => loadUploads(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {transactions.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {transactions.length} transactions from {accounts.join(" and ")}, {dates.at(-1)} to {dates[0]}
          </p>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden sm:table-cell">Account</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                    <TableCell className="max-w-48 truncate sm:max-w-none">{t.description}</TableCell>
                    <TableCell className="hidden sm:table-cell">{t.account}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{t.category ?? ""}</TableCell>
                    <TableCell className={`text-right tabular-nums ${t.amount > 0 ? "text-green-700 dark:text-green-400" : ""}`}>
                      {formatMoney(t.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
