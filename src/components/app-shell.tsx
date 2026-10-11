"use client";

import { useRef, useState } from "react";
import { ChatView } from "@/components/chat-view";
import { DataPanel } from "@/components/data-panel";
import { Logo, Sidebar, type View } from "@/components/sidebar";
import { TransactionsTable } from "@/components/transactions-table";
import { useStatements } from "@/hooks/use-statements";

const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];

// The whole app: sidebar on the left, chat or transactions in the middle,
// "Your data" on the right.
export function AppShell() {
  const [view, setView] = useState<View>("chat");
  const { transactions, error, searchStatus, loadFiles, clear, search } = useStatements();
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadSampleData() {
    const files = await Promise.all(
      SAMPLE_FILES.map(async (name) => ({ name, text: await (await fetch(`/sample-data/${name}`)).text() })),
    );
    await loadFiles(files);
  }

  // Files are read here, in the browser, and never uploaded anywhere.
  async function loadUploads(fileList: FileList | null) {
    if (!fileList?.length) return;
    await loadFiles(await Promise.all([...fileList].map(async (f) => ({ name: f.name, text: await f.text() }))));
  }

  const actions = {
    loadSampleData,
    upload: () => fileInput.current?.click(),
    clear,
  };

  return (
    <div className="flex h-dvh w-full gap-3 bg-linear-to-br from-violet-200 via-pink-100 to-emerald-100 p-3 dark:from-zinc-950 dark:via-violet-950/40 dark:to-zinc-900">
      <Sidebar view={view} onViewChange={setView} {...actions} />

      <main className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/60 px-4 py-3 md:hidden dark:border-white/10">
          <Logo />
          <div className="flex gap-1 text-sm">
            {(["chat", "transactions"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2 py-1 capitalize ${view === v ? "bg-white/80 font-medium dark:bg-white/10" : "text-muted-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
        )}
        {view === "chat" ? (
          <ChatView hasData={transactions.length > 0} {...actions} />
        ) : (
          <TransactionsTable
            transactions={transactions}
            search={search}
            searchReady={searchStatus.state === "ready"}
            {...actions}
          />
        )}
      </main>

      <DataPanel transactions={transactions} searchStatus={searchStatus} onClear={actions.clear} />

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        multiple
        hidden
        onChange={(e) => {
          loadUploads(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
