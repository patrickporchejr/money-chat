"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/use-chat";
import type { Transaction } from "@/lib/transactions";

// The clickable starter questions. Their answers will be saved ahead of time (see docs/PLAN.md).
const SUGGESTED_QUESTIONS = [
  "What subscriptions am I paying for?",
  "Where do I buy coffee?",
  "Why was I charged a $35 fee?",
  "What did I spend in Lisbon?",
];

// Which data the chat can answer about right now.
export type ChatMode = "no-data" | "sample" | "own-data";

const formatMoney = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ChatView({
  mode,
  messages,
  busy,
  send,
  loadSampleData,
  upload,
}: {
  mode: ChatMode;
  messages: ChatMessage[];
  busy: boolean;
  send: (question: string) => void;
  loadSampleData: () => Promise<void>;
  upload: () => void;
}) {
  const [question, setQuestion] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const canAsk = mode !== "own-data" && !busy;

  // Keep the newest text in view while the answer streams in.
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages]);

  async function ask(q: string) {
    if (!q.trim() || !canAsk) return;
    if (mode === "no-data") await loadSampleData();
    setQuestion("");
    send(q.trim());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="hidden border-b border-white/60 px-4 py-3 md:block dark:border-white/10">
        <h1 className="font-medium">{messages[0]?.content ?? "New chat"}</h1>
      </header>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="text-2xl font-semibold">Ask about your money</h2>
          <p className="max-w-md text-muted-foreground">
            {mode === "sample" && "The sample data is loaded. Pick a question below, or ask your own."}
            {mode === "no-data" && "Pick a question below to try it on sample data, or upload your own CSV statements."}
            {mode === "own-data" &&
              "Chatting about your own statements needs your own Claude key, which is coming soon. For now, search them in Transactions, or load the sample data to try the chat."}
          </p>
          {mode !== "sample" && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={loadSampleData}>Try sample data</Button>
              <Button variant="outline" onClick={upload}>
                Upload statements
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="max-w-[80%] self-end rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                {m.content}
              </p>
            ) : (
              <Answer key={i} message={m} />
            ),
          )}
          <div ref={bottom} />
        </div>
      )}

      <div className="p-3">
        <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-zinc-900/80">
          {messages.length === 0 && mode !== "own-data" && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs hover:border-primary hover:text-primary"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex items-center gap-2"
          >
            <Button type="button" variant="ghost" size="icon" onClick={upload} aria-label="Upload statements">
              <Paperclip />
            </Button>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              disabled={mode === "own-data"}
              placeholder={mode === "own-data" ? "Coming soon for your own statements" : "Ask about your money..."}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" disabled={!canAsk || !question.trim()} aria-label="Send">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Answers come from Claude and can be wrong. Check the linked transactions.
        </p>
      </div>
    </div>
  );
}

function Answer({ message }: { message: ChatMessage }) {
  const sources = message.sources ?? {};
  const cited = [...new Set(message.content.match(/T\d+(?=\])/g) ?? [])].filter((ref) => sources[ref]);

  return (
    <div className="flex max-w-[90%] flex-col gap-2 text-sm">
      {message.searches?.length ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Search className="size-3" /> Searched for {message.searches.map((s) => `“${s}”`).join(", ")}
        </p>
      ) : null}

      {message.content ? (
        <p className="whitespace-pre-wrap leading-relaxed">
          <WithCitations text={message.content} sources={sources} />
        </p>
      ) : message.pending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Looking through your statements...
        </p>
      ) : null}

      {message.error && <p className="text-destructive">{message.error}</p>}

      {cited.length > 0 && !message.pending && (
        <details className="rounded-lg border bg-background/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {cited.length} source{cited.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {cited.map((ref) => (
              <li key={ref} className="flex gap-2">
                <span className="w-7 shrink-0 font-medium text-primary">{ref}</span>
                <span className="w-20 shrink-0 text-muted-foreground">{sources[ref].date}</span>
                <span className="min-w-0 flex-1 truncate">{sources[ref].description}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(sources[ref].amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Turns "[T3]" in the answer into a small chip that shows the transaction on hover.
function WithCitations({ text, sources }: { text: string; sources: Record<string, Transaction> }) {
  return text.split(/(\[T\d+\])/g).map((part, i) => {
    const ref = part.match(/^\[(T\d+)\]$/)?.[1];
    const t = ref ? sources[ref] : undefined;
    if (!ref) return <Fragment key={i}>{part}</Fragment>;
    return (
      <span
        key={i}
        title={t ? `${t.date} · ${t.description} · ${formatMoney(t.amount)} · ${t.account}` : undefined}
        className="mx-0.5 inline-flex cursor-default items-center rounded bg-primary/10 px-1 align-baseline text-[10px] font-medium text-primary"
      >
        {ref}
      </span>
    );
  });
}
