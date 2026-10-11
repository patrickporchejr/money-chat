import { useState } from "react";
import { CreditCard, FileText, Landmark, Loader2, Search, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FinePrintDocument, SearchStatus } from "@/hooks/use-statements";
import type { Transaction } from "@/lib/transactions";

// "2025-10-01" -> "Oct 2025"
const monthYear = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// Right-hand panel: which statements and fine print are loaded, and a button to remove them.
export function DataPanel({
  transactions,
  finePrint,
  searchStatus,
  onClear,
  unlabeled,
  onLabelStores,
}: {
  transactions: Transaction[];
  finePrint: FinePrintDocument[];
  searchStatus: SearchStatus;
  onClear: () => void;
  unlabeled: number;
  onLabelStores: (() => Promise<void>) | null; // null until there's a key to label with
}) {
  const [labeling, setLabeling] = useState<"idle" | "busy" | string>("idle");
  const accounts = [...new Set(transactions.map((t) => t.account))].map((name) => {
    const rows = transactions.filter((t) => t.account === name);
    const dates = rows.map((t) => t.date).sort();
    return { name, count: rows.length, from: dates[0], to: dates.at(-1)! };
  });

  return (
    <aside className="glass hidden w-72 shrink-0 flex-col gap-4 rounded-2xl p-4 lg:flex">
      <h2 className="font-medium">Your data</h2>

      {accounts.length === 0 && finePrint.length === 0 ? (
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
          {finePrint.map((d) => (
            <li key={d.source} className="flex gap-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.source}</p>
                <p className="text-xs text-muted-foreground">Fine print · {d.chunks} paragraphs</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {searchStatus.state !== "idle" && <SearchStatusLine status={searchStatus} />}

      {unlabeled > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <Tags className="size-3.5 text-primary" /> {unlabeled} store name{unlabeled === 1 ? "" : "s"} to clean up
          </p>
          <p className="text-muted-foreground">
            Turns bank text like &ldquo;SQ *BLUE BTL 0423&rdquo; into &ldquo;Blue Bottle Coffee&rdquo;, so search and totals find it.
          </p>
          {onLabelStores ? (
            <Button
              size="sm"
              disabled={labeling === "busy"}
              onClick={async () => {
                setLabeling("busy");
                try {
                  await onLabelStores();
                  setLabeling("idle");
                } catch (e) {
                  setLabeling(e instanceof Error ? e.message : "Couldn't clean up store names.");
                }
              }}
            >
              {labeling === "busy" ? <Loader2 className="animate-spin" /> : null} Clean up with your key
            </Button>
          ) : (
            <p className="text-muted-foreground">Add your Claude key in Chat to do this.</p>
          )}
          {labeling !== "idle" && labeling !== "busy" && <p className="text-destructive">{labeling}</p>}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Saved in this browser only. Never uploaded.</p>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={accounts.length === 0 && finePrint.length === 0}
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
