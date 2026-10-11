"use client";

import { useState } from "react";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// The clickable starter questions. Their answers will be saved ahead of time (see docs/PLAN.md).
const SUGGESTED_QUESTIONS = [
  "What subscriptions am I paying for?",
  "How much did I spend on coffee this year?",
  "Why was I charged a $35 fee?",
  "What did I spend in Lisbon?",
];

export function ChatView({
  hasData,
  loadSampleData,
  upload,
}: {
  hasData: boolean;
  loadSampleData: () => void;
  upload: () => void;
}) {
  const [question, setQuestion] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="hidden border-b border-white/60 px-4 py-3 md:block dark:border-white/10">
        <h1 className="font-medium">New chat</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h2 className="text-2xl font-semibold">Ask about your money</h2>
        <p className="max-w-md text-muted-foreground">
          {hasData
            ? "Your statements are loaded. Pick a question below to get started."
            : "Load the sample data or upload your own CSV statements to get started."}
        </p>
        {!hasData && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={loadSampleData}>Try sample data</Button>
            <Button variant="outline" onClick={upload}>
              Upload statements
            </Button>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-zinc-900/80">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={upload} aria-label="Upload statements">
              <Paperclip />
            </Button>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your money..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" disabled aria-label="Send">
              <ArrowUp />
            </Button>
          </form>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Chat is coming soon. For now, explore your data in Transactions.
        </p>
      </div>
    </div>
  );
}
