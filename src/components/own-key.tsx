"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OWN_KEY_MODELS } from "@/lib/agent";

// Where people paste their own Anthropic API key to chat about their own
// statements. The key is kept only in this page's memory (never saved), and
// is sent only to Anthropic.
export function OwnKeyForm({ onKey }: { onKey: (key: string) => void }) {
  const [key, setKey] = useState("");
  const looksRight = /^sk-ant-[\w-]{20,}$/.test(key.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (looksRight) onKey(key.trim());
      }}
      className="flex w-full max-w-md flex-col gap-3 rounded-xl border bg-background/80 p-4 text-left"
    >
      <div className="flex items-center gap-2 font-medium">
        <KeyRound className="size-4 text-primary" /> Use your own Claude key
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-..."
        className="rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
      />
      {key && !looksRight && <p className="text-xs text-destructive">Anthropic keys start with sk-ant-.</p>}
      <Button type="submit" disabled={!looksRight}>
        Start chatting
      </Button>
      <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Your key stays in this tab&apos;s memory and is sent only to Anthropic. Closing the tab forgets it.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Your statements stay in this browser. Only the parts needed to answer each question go to Anthropic.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            Tip: make a separate key with a spending limit in the{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline">
              Anthropic Console
            </a>
            .
          </span>
        </li>
      </ul>
    </form>
  );
}

// Picks the model for your own key, and lets you forget the key.
export function OwnKeyBar({
  model,
  onModel,
  onForget,
}: {
  model: string;
  onModel: (model: string) => void;
  onForget: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <KeyRound className="size-3" /> Using your key with
      </span>
      <select
        value={model}
        onChange={(e) => onModel(e.target.value)}
        aria-label="Model"
        className="rounded border bg-background px-1.5 py-0.5 text-foreground"
      >
        {OWN_KEY_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <button onClick={onForget} className="underline hover:text-foreground">
        Forget key
      </button>
    </div>
  );
}
