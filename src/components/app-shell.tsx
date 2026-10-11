"use client";

import { useRef, useState } from "react";
import { ChatView, type ChatMode } from "@/components/chat-view";
import { DataPanel } from "@/components/data-panel";
import { Logo, Sidebar, type View } from "@/components/sidebar";
import { TransactionsTable } from "@/components/transactions-table";
import { useChat } from "@/hooks/use-chat";
import { useStatements } from "@/hooks/use-statements";
import { OWN_KEY_DEFAULT_MODEL } from "@/lib/agent";
import { accountNameFromFile } from "@/lib/transactions";

const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];
const SAMPLE_ACCOUNTS = SAMPLE_FILES.map(accountNameFromFile);

// The whole app: sidebar on the left, chat or transactions in the middle,
// "Your data" on the right.
export function AppShell() {
  const [view, setView] = useState<View>("chat");
  const { transactions, finePrint, error, searchStatus, loadFiles, clear, search } = useStatements();
  const chat = useChat();
  // Your own Claude key: held in memory only, never saved. Gone when the tab closes.
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [model, setModel] = useState<string>(OWN_KEY_DEFAULT_MODEL);

  // The free demo chat only knows the sample data. Your own statements use your own key.
  const chatMode: ChatMode =
    transactions.length === 0
      ? "no-data"
      : transactions.every((t) => SAMPLE_ACCOUNTS.includes(t.account))
        ? "sample"
        : "own-data";
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
      <Sidebar
        view={view}
        onViewChange={setView}
        onNewChat={() => {
          chat.reset();
          setView("chat");
        }}
        {...actions}
      />

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
          <ChatView mode={chatMode} {...chat} {...actions} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
        ) : (
          <TransactionsTable
            transactions={transactions}
            search={search}
            searchReady={searchStatus.state === "ready"}
            {...actions}
          />
        )}
      </main>

      <DataPanel transactions={transactions} finePrint={finePrint} searchStatus={searchStatus} onClear={actions.clear} />

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,.txt,text/plain,.md,text/markdown"
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
