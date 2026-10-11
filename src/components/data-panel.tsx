import { CreditCard, Landmark, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchStatus } from "@/hooks/use-statements";
import type { Transaction } from "@/lib/transactions";

// "2025-10-01" -> "Oct 2025"
const monthYear = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// Right-hand panel: which statements are loaded, and a button to remove them.
export function DataPanel({
  transactions,
  searchStatus,
  onClear,
}: {
  transactions: Transaction[];
  searchStatus: SearchStatus;
  onClear: () => void;
}) {
  const accounts = [...new Set(transactions.map((t) => t.account))].map((name) => {
    const rows = transactions.filter((t) => t.account === name);
    const dates = rows.map((t) => t.date).sort();
    return { name, count: rows.length, from: dates[0], to: dates.at(-1)! };
  });

  return (
    <aside className="glass hidden w-72 shrink-0 flex-col gap-4 rounded-2xl p-4 lg:flex">
      <h2 className="font-medium">Your data</h2>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing loaded yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((a) => {
            const Icon = /card/i.test(a.name) ? CreditCard : Landmark;
            return (
              <li key={a.name} className="flex gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.count} transactions · {monthYear(a.from)} – {monthYear(a.to)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {searchStatus.state !== "idle" && <SearchStatusLine status={searchStatus} />}

      <div className="mt-auto flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Saved in this browser only. Never uploaded.</p>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={accounts.length === 0}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 /> Clear my data
        </Button>
      </div>
    </aside>
  );
}

function SearchStatusLine({ status }: { status: SearchStatus }) {
  const text = {
    downloading: `Downloading search model... ${"percent" in status ? status.percent : 0}%`,
    indexing: "Getting search ready...",
    ready: "Search by meaning is ready",
    error: `Search isn't available: ${"message" in status ? status.message : ""}`,
  }[status.state as Exclude<SearchStatus["state"], "idle">];
  const busy = status.state === "downloading" || status.state === "indexing";
  return (
    <p className={`flex items-center gap-2 text-xs ${status.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
      {text}
    </p>
  );
}
