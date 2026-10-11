"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, ChatTurn } from "@/lib/agent";
import type { Transaction } from "@/lib/transactions";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  searches?: string[]; // what Claude searched for, shown above the answer
  sources?: Record<string, Transaction>; // what [T3] etc. point to
  error?: string;
  pending?: boolean;
  saved?: boolean; // answered from a saved copy, at no cost
};

const MAX_HISTORY = 9; // the server accepts up to 10 messages, including the new question

// Sends questions to the demo chat and streams the answer in as it's written.
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const updateAnswer = (change: (answer: ChatMessage) => ChatMessage) =>
    setMessages((all) => [...all.slice(0, -1), change(all.at(-1)!)]);

  const send = useCallback(
    async (question: string) => {
      const history: ChatTurn[] = [
        ...messages.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
        { role: "user" as const, content: question },
      ].slice(-MAX_HISTORY);
      while (history[0]?.role === "assistant") history.shift(); // must start with a question

      setMessages((all) => [...all, { role: "user", content: question }, { role: "assistant", content: "", pending: true }]);
      setBusy(true);
      abort.current = new AbortController();

      try {
        const response = await fetch("/api/demo-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: abort.current.signal,
        });
        if (!response.ok || !response.body) throw new Error("The chat isn't available right now.");

        // One JSON event per line.
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines.filter(Boolean)) applyEvent(JSON.parse(line) as AgentEvent);
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          updateAnswer((a) => ({ ...a, error: e instanceof Error ? e.message : "Something went wrong." }));
        }
      } finally {
        updateAnswer((a) => ({ ...a, pending: false }));
        setBusy(false);
      }

      function applyEvent(event: AgentEvent) {
        updateAnswer((a) => {
          switch (event.type) {
            case "text":
              return { ...a, content: a.content + event.text };
            case "search":
              return { ...a, searches: [...(a.searches ?? []), event.query] };
            case "sources":
              return { ...a, sources: event.sources };
            case "error":
              return { ...a, error: event.message };
            case "saved":
              return { ...a, saved: true };
          }
        });
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
  }, []);

  return { messages, busy, send, reset };
}
