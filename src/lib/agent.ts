// The chat agent: Claude plus the tools it can use to look at the statements.
// It takes the database, the embedder and the Claude client as inputs, so the
// same code can run on the server (sample data demo) or in the browser (your
// own key, later).

import Anthropic from "@anthropic-ai/sdk";
import type { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import { searchTransactions } from "@/lib/search";
import type { Transaction } from "@/lib/transactions";

export const DEMO_MODEL = "claude-haiku-5-5";

const MAX_TOOL_ROUNDS = 5; // stop runaway loops
const MAX_ROWS_TO_CLAUDE = 25; // per search; keeps answers focused and cheap

// One message in the chat as the app stores it: plain text, no tool details.
export type ChatTurn = { role: "user" | "assistant"; content: string };

// What the agent streams back while it works.
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "search"; query: string }
  | { type: "sources"; sources: Record<string, Transaction> }
  | { type: "error"; message: string };

const SearchInput = z.object({
  query: z.string().min(1).max(200),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  account: z.string().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
});

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_transactions",
    description:
      "Search the user's transactions by meaning and by keywords. A query like \"coffee\" also finds cafes " +
      "that never use the word. Optional filters narrow by date, account and amount. Amounts are negative " +
      "for money out and positive for money in. Returns the best matches, each with a reference like T3.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in a few words, e.g. \"coffee\" or \"bank fees\"." },
        date_from: { type: "string", description: "Earliest date, YYYY-MM-DD." },
        date_to: { type: "string", description: "Latest date, YYYY-MM-DD." },
        account: { type: "string", description: "Exact account name." },
        min_amount: { type: "number", description: "Smallest amount, e.g. -100 to skip anything over $100 spent." },
        max_amount: { type: "number", description: "Largest amount, e.g. 0 for money out only." },
      },
      required: ["query"],
    },
  },
];

export async function describeData(db: PGlite) {
  const { rows } = await db.query<{ accounts: string[]; first: string; last: string }>(`
    select array_agg(distinct account) as accounts,
      to_char(min(date), 'YYYY-MM-DD') as first, to_char(max(date), 'YYYY-MM-DD') as last
    from transactions`);
  return rows[0];
}

function systemPrompt(data: { accounts: string[]; first: string; last: string }) {
  return `You are Money Chat. You answer questions about the user's bank statements.

The statements in this demo are made-up sample data. Accounts: ${data.accounts.join(", ")}. They cover ${data.first} to ${data.last}. Treat "this year" or "recently" as relative to ${data.last}.

How to answer:
- Look things up with search_transactions before answering. Search more than once if the question has several parts, and use the date, account and amount filters when the question mentions them.
- Answer only from what the searches return. If nothing relevant comes back, say so.
- Cite every transaction you mention with its reference in square brackets, like [T3].
- You can't add up totals or averages yet. If asked for one, list the matching transactions instead and say exact totals are coming soon.
- Keep it short: one or two sentences, then at most 8 transactions as a list. Plain text only: no headings or bold. Start list items with "- ".
- Only help with questions about these statements. For anything else, say that's all you can help with.`;
}

// Runs one answer: Claude searches as many times as it needs, then writes the
// answer. Streams text as it's written, and tells the caller which
// transactions the [T#] references point to.
export async function runAgent({
  client,
  model,
  db,
  embed,
  history,
  onEvent,
}: {
  client: Anthropic;
  model: string;
  db: PGlite;
  embed: (texts: string[]) => Promise<number[][]>;
  history: ChatTurn[];
  onEvent: (event: AgentEvent) => void;
}) {
  const data = await describeData(db);

  // References like T3 are numbered per answer. Old ones in earlier answers
  // would point at the wrong rows, so strip them from the history.
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.role === "assistant" ? turn.content.replace(/\s*\[T\d+\]/g, "") : turn.content,
  }));

  const refs = new Map<string, string>(); // transaction id -> "T3"
  const sources: Record<string, Transaction> = {};

  async function search(input: z.infer<typeof SearchInput>) {
    const [embedding] = await embed([input.query]);
    const results = await searchTransactions(
      db,
      { text: input.query, embedding },
      {
        dateFrom: input.date_from,
        dateTo: input.date_to,
        account: input.account,
        minAmount: input.min_amount,
        maxAmount: input.max_amount,
      },
      200,
    );
    const shown = results.slice(0, MAX_ROWS_TO_CLAUDE);
    const lines = shown.map((t) => {
      if (!refs.has(t.id)) refs.set(t.id, `T${refs.size + 1}`);
      const ref = refs.get(t.id)!;
      sources[ref] = { id: t.id, account: t.account, date: t.date, description: t.description, amount: t.amount, category: t.category };
      return [ref, t.date, t.description, t.amount.toFixed(2), t.account, t.category ?? "", `matched by ${t.matchedBy.join(" + ")}`].join(" | ");
    });
    if (results.length === 0) return "No matching transactions.";
    return `${results.length} matches${results.length > shown.length ? `, showing the best ${shown.length}` : ""}:\n${lines.join("\n")}`;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: systemPrompt(data),
      tools: TOOLS,
      messages,
    });
    stream.on("text", (text) => onEvent({ type: "text", text }));

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      onEvent({ type: "error", message: "Claude declined to answer that one." });
      break;
    }

    const toolCalls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolCalls.length === 0) break; // finished answering

    if (message.stop_reason === "max_tokens") {
      onEvent({ type: "error", message: "The answer ran too long." });
      break;
    }

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const input = SearchInput.safeParse(readInput(call));
      if (call.name !== "search_transactions" || !input.success) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Invalid tool call." });
        continue;
      }
      onEvent({ type: "search", query: input.data.query });
      results.push({ type: "tool_result", tool_use_id: call.id, content: await search(input.data) });
    }
    // All results go back in one message, so Claude can keep searching in parallel.
    messages.push({ role: "user", content: results });
    onEvent({ type: "sources", sources });
  }
}

// Tool input streams in as it's written and is parsed on first read. If it
// isn't valid JSON, treat it like any other invalid call so Claude can retry.
function readInput(call: Anthropic.ToolUseBlock): unknown {
  try {
    return call.input;
  } catch {
    return null;
  }
}
