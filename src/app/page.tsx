import { TransactionsView } from "@/components/transactions-view";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Money Chat</h1>
        <p className="text-muted-foreground">
          Ask questions about your bank statements in plain English. Your files are read in your browser and never
          uploaded to us.
        </p>
      </div>
      <TransactionsView />
    </main>
  );
}
