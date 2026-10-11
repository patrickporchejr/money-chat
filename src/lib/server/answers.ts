// Saved demo answers, so the same question never pays twice:
// - Suggested questions: answered once by `npm run save-answers`, saved in the repo.
// - Any other first question: saved in Vercel's Runtime Cache after the first ask.
// Follow-up questions are never saved: their answers depend on the conversation.

import { getCache } from "@vercel/functions";
import type { AgentEvent } from "@/lib/agent";
import savedFile from "@/data/saved-answers.json";

const CACHE_DAYS = 30;

export type SavedAnswers = { version: string; answers: Record<string, AgentEvent[]> };
const saved = savedFile as SavedAnswers;

// "Where do I buy coffee?" and "where do i buy coffee" count as the same question.
export function normalizeQuestion(question: string) {
  return question.toLowerCase().replace(/\s+/g, " ").replace(/[?!.\s]+$/, "").trim();
}

const cache = getCache({ namespace: "answers" });
const key = (version: string, question: string) => `${version}:${normalizeQuestion(question)}`;

export async function findSavedAnswer(question: string, version: string): Promise<AgentEvent[] | null> {
  if (saved.version === version && saved.answers[normalizeQuestion(question)]) {
    return saved.answers[normalizeQuestion(question)];
  }
  return ((await cache.get(key(version, question))) as AgentEvent[] | undefined) ?? null;
}

export async function saveAnswer(question: string, version: string, events: AgentEvent[]) {
  // Only keep complete answers: no errors, and some text.
  if (events.some((e) => e.type === "error") || !events.some((e) => e.type === "text")) return;
  await cache.set(key(version, question), events, { ttl: CACHE_DAYS * 24 * 60 * 60, name: "demo-answer" });
}
