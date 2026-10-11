"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, ChatTurn } from "@/lib/agent";
import type { FinePrintChunk } from "@/lib/fine-print";
import type { Transaction } from "@/lib/transactions";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  searches?: string[]; // what Claude searched for, shown above the answer
  sources?: Record<string, Transaction>; // what [T3] etc. point to
  documents?: Record<string, FinePrintChunk>; // what [D2] etc. point to
  error?: string;
  pending?: boolean;
  saved?: boolean; // answered from a saved copy, at no cost
};

// Where a question goes: the sample-data demo on our server, or straight from
// this browser to Anthropic with the user's own key, searching their own data.
export type ChatTarget = { kind: "demo" } | { kind: "own"; apiKey: string; model: string };

const MAX_HISTORY = 9; // the server accepts up to 10 messages, including the new question

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0); // bumps on New chat, so a still-running answer stops updating

  const send = useCallback(
    async (question: string, target: ChatTarget = { kind: "demo" }) => {
      const history: ChatTurn[] = [
        ...messages.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
        { role: "user" as const, content: question },
      ].slice(-MAX_HISTORY);
      while (history[0]?.role === "assistant") history.shift(); // must start with a question

      const thisRun = ++run.current;
      const updateAnswer = (change: (answer: ChatMessage) => ChatMessage) => {
        if (run.current === thisRun) setMessages((all) => [...all.slice(0, -1), change(all.at(-1)!)]);
      };
      const applyEvent = (event: AgentEvent) =>
        updateAnswer((a) => {
          switch (event.type) {
            case "text":
              return { ...a, content: a.content + event.text };
            case "clear-text":
              return { ...a, content: "" };
            case "search":
              return { ...a, searches: [...(a.searches ?? []), event.query] };
            case "sources":
              return { ...a, sources: event.sources };
            case "documents":
              return { ...a, documents: event.documents };
            case "error":
              return { ...a, error: event.message };
            case "saved":
              return { ...a, saved: true };
          }
        });

      setMessages((all) => [...all, { role: "user", content: question }, { role: "assistant", content: "", pending: true }]);
      setBusy(true);
      abort.current = new AbortController();

      try {
        if (target.kind === "own") await askWithOwnKey(target, history, applyEvent);
        else await askDemo(history, applyEvent, abort.current.signal);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          updateAnswer((a) => ({ ...a, error: friendlyError(e) }));
        }
      } finally {
        updateAnswer((a) => ({ ...a, pending: false }));
        if (run.current === thisRun) setBusy(false);
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    run.current++;
    abort.current?.abort();
    setMessages([]);
    setBusy(false);
  }, []);

  return { messages, busy, send, reset };
}

// The demo: our server answers about the sample data and streams one JSON event per line.
async function askDemo(history: ChatTurn[], onEvent: (e: AgentEvent) => void, signal: AbortSignal) {
  const response = await fetch("/api/demo-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error("The chat isn't available right now.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines.filter(Boolean)) onEvent(JSON.parse(line) as AgentEvent);
  }
}

// Your own key: the same agent runs right here in the browser, on your local
// database. The key goes only to Anthropic.
async function askWithOwnKey(
  target: Extract<ChatTarget, { kind: "own" }>,
  history: ChatTurn[],
  onEvent: (e: AgentEvent) => void,
) {
  const [{ runAgent }, { claudeClient, embed, getDatabase }] = await Promise.all([
    import("@/lib/agent"),
    import("@/lib/browser"),
  ]);
  await runAgent({
    client: await claudeClient(target.apiKey),
    model: target.model,
    db: await getDatabase(),
    embed,
    history,
    onEvent,
    mode: "own",
  });
}

// Plain-English messages for the errors people can fix themselves.
function friendlyError(e: unknown) {
  const status = (e as { status?: number })?.status;
  if (status === 401) return "That API key didn't work. Check it and paste it again.";
  if (status === 403) return "That key isn't allowed to use this model. Try another model, or check the key's workspace.";
  if (status === 404) return "That model isn't available for your key. Try another model.";
  if (status === 429) return "Your key hit a rate or spending limit. Wait a minute, or check its limits in the Anthropic Console.";
  if (status && status >= 500) return "Anthropic's service had a problem. Try again in a moment.";
  if (e instanceof TypeError) return "Couldn't reach Anthropic. Check your connection and try again.";
  return e instanceof Error ? e.message : "Something went wrong.";
}
