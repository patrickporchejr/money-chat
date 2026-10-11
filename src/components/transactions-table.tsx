"use client";

import { useRef, useState } from "react";
import { Check, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORIES } from "@/lib/labels";
import type { MerchantLabel, SearchResult } from "@/lib/search";
import type { Transaction } from "@/lib/transactions";

const formatMoney = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TransactionsTable({
  transactions,
  search,
  searchReady,
  loadSampleData,
  upload,
  correctStore,
}: {
  transactions: Transaction[];
  search: (query: string) => Promise<SearchResult[]>;
  searchReady: boolean;
  loadSampleData: () => void;
  upload: () => void;
  correctStore: (label: MerchantLabel) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // the description being corrected
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
                <TableHead>Store</TableHead>
                <TableHead className="hidden sm:table-cell">Account</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap pl-4">{t.date}</TableCell>
                  <TableCell className="max-w-56 sm:max-w-none">
                    {editing === t.description ? (
                      <StoreEditor
                        transaction={t}
                        onCancel={() => setEditing(null)}
                        onSave={async (label) => {
                          await correctStore(label);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <div className="group flex items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{t.merchant ?? t.description}</span>
                            {t.category && <span className="shrink-0 text-xs text-muted-foreground">{t.category}</span>}
                            {"matchedBy" in t && <MatchBadges matchedBy={t.matchedBy} />}
                          </div>
                          {t.merchant && <div className="truncate text-xs text-muted-foreground">{t.description}</div>}
                        </div>
                        <button
                          onClick={() => setEditing(t.description)}
                          aria-label={`Correct the store for ${t.description}`}
                          title="Correct the store name or category (applies to every transaction like this)"
                          className="mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary focus:opacity-100"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.account}</TableCell>
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

// Correct a store name and category. Applies to every transaction with this
// bank description, and teaches the labeler for similar ones.
function StoreEditor({
  transaction,
  onSave,
  onCancel,
}: {
  transaction: Transaction;
  onSave: (label: MerchantLabel) => Promise<void>;
  onCancel: () => void;
}) {
  const [merchant, setMerchant] = useState(transaction.merchant ?? "");
  const [category, setCategory] = useState(
    CATEGORIES.includes(transaction.category as (typeof CATEGORIES)[number]) ? transaction.category! : "Other",
  );
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!merchant.trim()) return;
        setSaving(true);
        await onSave({ description: transaction.description, merchant: merchant.trim(), category });
      }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input
        autoFocus
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        placeholder="Store name"
        aria-label="Store name"
        className="w-40 rounded border bg-background px-2 py-1 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Category"
        className="rounded border bg-background px-1.5 py-1 text-sm"
      >
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <Button type="submit" size="icon-sm" disabled={saving || !merchant.trim()} aria-label="Save">
        <Check />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
        <X />
      </Button>
      <span className="w-full text-xs text-muted-foreground">
        Applies to every &ldquo;{transaction.description}&rdquo; and helps label similar ones.
      </span>
    </form>
  );
}
