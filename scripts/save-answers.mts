// Answers the suggested questions once and saves them in the repo, so visitors
// who click them get an instant answer that costs nothing.
// Run with: npm run save-answers  (needs ANTHROPIC_API_KEY in .env.local)
// Re-run after changing the sample data, the agent's prompt/tools/model, or the questions.

import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { DEMO_MODEL, runAgent, type AgentEvent } from "@/lib/agent";
import { normalizeQuestion, type SavedAnswers } from "@/lib/server/answers";
import { embed, getSampleDatabase } from "@/lib/server/sample-data";
import { answersVersion } from "@/lib/server/sample-files";
import { SUGGESTED_QUESTIONS } from "@/lib/suggested-questions";

const OUT = "src/data/saved-answers.json";

const client = new Anthropic();
const db = await getSampleDatabase();
const result: SavedAnswers = { version: await answersVersion(), answers: {} };

for (const question of SUGGESTED_QUESTIONS) {
  const events: AgentEvent[] = [];
  await runAgent({
    client,
    model: DEMO_MODEL,
    db,
    embed,
    history: [{ role: "user", content: question }],
    onEvent: (e) => events.push(e),
  });
  const errors = events.filter((e) => e.type === "error");
  if (errors.length) throw new Error(`"${question}" failed: ${JSON.stringify(errors)}`);
  result.answers[normalizeQuestion(question)] = events;
  const text = events.map((e) => (e.type === "text" ? e.text : "")).join("");
  console.log(`\n✓ ${question}\n${text}`);
}

writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`\nSaved ${SUGGESTED_QUESTIONS.length} answers to ${OUT} (version ${result.version})`);
