import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Transaction } from "@/lib/transactions";

const formatMoney = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TransactionsTable({
  transactions,
  loadSampleData,
  upload,
}: {
  transactions: Transaction[];
  loadSampleData: () => void;
  upload: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="hidden items-center justify-between border-b md:flex border-white/60 px-4 py-3 dark:border-white/10">
        <h1 className="font-medium">Transactions</h1>
        <span className="text-sm text-muted-foreground">{transactions.length || "No"} transactions</span>
      </header>

      {transactions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <p>Nothing loaded yet.</p>
          <div className="flex gap-2">
            <Button onClick={loadSampleData}>Try sample data</Button>
            <Button variant="outline" onClick={upload}>
              Upload statements
            </Button>
          </div>
        </div>
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
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap pl-4">{t.date}</TableCell>
                  <TableCell className="max-w-48 truncate sm:max-w-none">{t.description}</TableCell>
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
