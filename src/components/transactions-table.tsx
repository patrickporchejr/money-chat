"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchResult } from "@/lib/search";
import type { Transaction } from "@/lib/transactions";

const formatMoney = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TransactionsTable({
  transactions,
  search,
  searchReady,
  loadSampleData,
  upload,
}: {
  transactions: Transaction[];
  search: (query: string) => Promise<SearchResult[]>;
  searchReady: boolean;
  loadSampleData: () => void;
  upload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef("");

  // Search shortly after the user stops typing. Ignore answers to old queries.
  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    latest.current = value.trim();
    if (!latest.current) return setResults(null);
    timer.current = setTimeout(async () => {
      const q = latest.current;
      const found = await search(q);
      if (q === latest.current) setResults(found);
    }, 250);
  }

  const rows: (Transaction | SearchResult)[] = results ?? transactions;

  if (transactions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <p>Nothing loaded yet.</p>
        <div className="flex gap-2">
          <Button onClick={loadSampleData}>Try sample data</Button>
          <Button variant="outline" onClick={upload}>
            Upload statements
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/60 px-4 py-3 dark:border-white/10">
        <h1 className="hidden font-medium md:block">Transactions</h1>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 md:max-w-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            disabled={!searchReady}
            placeholder={searchReady ? 'Search by meaning, e.g. "coffee"' : "Getting search ready..."}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-wait"
          />
          {query && (
            <button onClick={() => onQueryChange("")} aria-label="Clear search">
              <X className="size-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {results ? `${results.length} matches` : `${transactions.length} transactions`}
        </span>
      </header>

      {results?.length === 0 ? (
        <p className="p-6 text-center text-muted-foreground">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white/90 backdrop-blur dark:bg-zinc-900/90">
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Account</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap pl-4">{t.date}</TableCell>
                  <TableCell className="max-w-48 sm:max-w-none">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{t.description}</span>
                      {"matchedBy" in t && <MatchBadges matchedBy={t.matchedBy} />}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.account}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{t.category ?? ""}</TableCell>
                  <TableCell
                    className={`pr-4 text-right tabular-nums ${t.amount > 0 ? "text-green-700 dark:text-green-400" : ""}`}
                  >
                    {formatMoney(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Shows why a result matched: similar meaning, matching words, or both.
function MatchBadges({ matchedBy }: { matchedBy: SearchResult["matchedBy"] }) {
  return (
    <span className="hidden shrink-0 gap-1 sm:flex">
      {matchedBy.map((m) => (
        <span
          key={m}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            m === "meaning" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {m}
        </span>
      ))}
    </span>
  );
}
