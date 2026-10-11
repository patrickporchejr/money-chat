// The sample-data demo chat. Runs on our Claude key, so it only ever answers
// about the sample data: the browser sends questions, never transaction data.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEMO_MODEL, runAgent, type AgentEvent } from "@/lib/agent";
import { findSavedAnswer, saveAnswer } from "@/lib/server/answers";
import { answersVersion, embed, getSampleDatabase } from "@/lib/server/sample-data";

export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(500) }),
        z.object({ role: z.literal("assistant"), content: z.string().max(4000) }),
      ]),
    )
    .min(1)
    .max(10) // short conversations only
    .refine((m) => m.at(-1)?.role === "user", "The last message must be a question."),
});

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const history = body.data.messages;
  // Only a conversation's first question can reuse a saved answer.
  const question = history.length === 1 ? history[0].content : null;
  const version = await answersVersion();

  // Stream one JSON event per line, so the answer appears as it's written.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const saved = question ? await findSavedAnswer(question, version) : null;
        if (saved) {
          send({ type: "saved" });
          saved.forEach(send);
        } else {
          const events: AgentEvent[] = [];
          await runAgent({
            client: new Anthropic(), // reads ANTHROPIC_API_KEY
            model: DEMO_MODEL,
            db: await getSampleDatabase(),
            embed,
            history,
            onEvent: (event) => {
              events.push(event);
              send(event);
            },
          });
          if (question) await saveAnswer(question, version, events);
        }
      } catch (err) {
        console.error("demo-chat failed", err);
        const message =
          err instanceof Anthropic.RateLimitError
            ? "The demo is busy right now. Try again in a minute."
            : "Something went wrong. Try again.";
        send({ type: "error", message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
