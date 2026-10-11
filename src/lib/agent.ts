// The chat agent: Claude plus the tools it can use to look at the statements.
// It takes the database, the embedder and the Claude client as inputs, so the
// same code can run on the server (sample data demo) or in the browser (your
// own key, later).

import Anthropic from "@anthropic-ai/sdk";
import type { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import type { FinePrintChunk } from "@/lib/fine-print";
import {
  findRecurringCharges,
  listTransactions,
  searchFinePrint,
  searchTransactions,
  summarizeTransactions,
  type ListSort,
  type SearchFilters,
  type Summary,
} from "@/lib/search";
import type { Transaction } from "@/lib/transactions";

export const DEMO_MODEL = "claude-haiku-5-5";

// Models people can pick when they use their own key. They pay for these.
export const OWN_KEY_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5 (best)" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (balanced)" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (cheapest)" },
] as const;
export const OWN_KEY_DEFAULT_MODEL = OWN_KEY_MODELS[0].id;

// Models that support Anthropic's server-side fallback: if a safety check
// wrongly declines a harmless question, the request is re-run on a fallback
// model instead of failing.
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

const MAX_TOOL_ROUNDS = 5; // stop runaway loops
// Per search, what Claude sees: results grouped by store, so one store with
// many visits can't crowd out the others.
const MAX_GROUPS = 15;
const SHOW_ALL_UP_TO = 6; // stores with more matches show only their latest few
const LATEST_ROWS = 3;

// One message in the chat as the app stores it: plain text, no tool details.
export type ChatTurn = { role: "user" | "assistant"; content: string };

// What the agent streams back while it works.
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "clear-text" } // drop the text so far: it was a note before searching, not the answer
  | { type: "search"; query: string }
  | { type: "sources"; sources: Record<string, Transaction> }
  | { type: "documents"; documents: Record<string, FinePrintChunk> } // what [D1] etc. point to
  | { type: "error"; message: string }
  | { type: "saved" }; // this answer was saved earlier, so it cost nothing

const Filters = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  account: z.string().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  descriptions: z.array(z.string()).max(50).optional(),
  merchants: z.array(z.string()).max(50).optional(),
});
const SORTS = ["newest", "oldest", "largest_spend", "smallest_spend", "largest_deposit"] as const;
const SearchInput = Filters.extend({
  query: z.string().max(200).optional(),
  sort: z.enum(SORTS).optional(),
});
const SummarizeInput = Filters.extend({
  group_by: z.enum(["none", "merchant", "description", "month", "account", "category"]).optional(),
});

// The filters both tools share, as JSON Schema for Claude.
const FILTER_PROPERTIES = {
  date_from: { type: "string", description: "Earliest date, YYYY-MM-DD." },
  date_to: { type: "string", description: "Latest date, YYYY-MM-DD." },
  account: { type: "string", description: "Exact account name." },
  min_amount: { type: "number", description: "Smallest amount, e.g. -100 to skip anything over $100 spent." },
  max_amount: { type: "number", description: "Largest amount, e.g. 0 for money out only." },
  descriptions: {
    type: "array",
    items: { type: "string" },
    description: "Only these exact bank descriptions, copied from earlier search results.",
  },
  merchants: {
    type: "array",
    items: { type: "string" },
    description: "Only these store names (cleaned up, covering every spelling), copied from earlier search results, e.g. [\"Blue Bottle Coffee\"].",
  },
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_transactions",
    description:
      "Search the user's transactions by meaning and by keywords. A query like \"coffee\" also finds cafes " +
      "that never use the word. Optional filters narrow by date, account and amount. Amounts are negative " +
      "for money out and positive for money in. Leave out the query to list everything that matches the " +
      "filters, e.g. all transactions in a date range. Returns matches, each with a reference like T3.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for, in a few words, e.g. \"coffee\" or \"bank fees\". Leave out to list by filters only.",
        },
        sort: {
          type: "string",
          enum: [...SORTS],
          description:
            "Only when the query is left out: the order to list in. largest_spend = biggest charges first, " +
            "smallest_spend = cheapest charges first. Default newest.",
        },
        ...FILTER_PROPERTIES,
      },
    },
  },
  {
    name: "summarize_transactions",
    description:
      "Exact counts, totals and averages, calculated by the database. Use it for any \"how much\", \"how many\", " +
      "average or comparison question, instead of adding numbers yourself. First find which stores count with " +
      "search_transactions, then pass their store names (merchants) here. group_by splits the result, e.g. by month or " +
      "by merchant to compare stores.",
    input_schema: {
      type: "object",
      properties: {
        ...FILTER_PROPERTIES,
        group_by: { type: "string", enum: ["none", "merchant", "description", "month", "account", "category"] },
      },
    },
  },
  {
    name: "search_fine_print",
    description:
      "Search the statements' fine print: fee schedules, the cardholder agreement and account notices. Use it to " +
      "explain why a fee or charge happened, what a rule or rate is, or how to avoid a fee. Returns paragraphs, " +
      "each with a reference like D2.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for, e.g. \"overdraft fee\" or \"interest rate change\"." } },
      required: ["query"],
    },
  },
  {
    name: "find_recurring_charges",
    description:
      "List charges that repeat about once a month at a steady amount: subscriptions, memberships, rent, bills " +
      "and transfers. Use it for questions about subscriptions or regular payments, because searching by name " +
      "often misses them. Returns each charge with how many months it appeared and its latest references.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function describeData(db: PGlite) {
  const { rows } = await db.query<{ accounts: string[]; first: string; last: string }>(`
    select array_agg(distinct account) as accounts,
      to_char(min(date), 'YYYY-MM-DD') as first, to_char(max(date), 'YYYY-MM-DD') as last
    from transactions`);
  return rows[0];
}

const PROMPT = `You are Money Chat. You answer questions about the user's bank statements.

{about} Accounts: {accounts}. They cover {first} to {last}. Treat today as {today}, so "last month" means the month before that and "this year" means {year}.

How to answer:
- Look things up with search_transactions before answering. Use the date, account and amount filters when the question mentions them. To see everything around a date (for example, what led to a fee), leave out the query and use only the date filters.
- Bank descriptions are short and messy (e.g. "NETFLIX.COM", "TIME OUT MARKET LISBOA"), so one search is rarely enough. Try a few wordings: likely store names, categories, local spellings, and related words. For example, for subscriptions try streaming services, apps, gyms and memberships. Once you find something, search around its dates for related charges.
- For subscriptions, memberships or regular bills, use find_recurring_charges.
- To explain why a fee or charge happened, or what a rule or rate is, search the fine print with search_fine_print as well as the transactions, and connect the two: the charge [T3] and the rule that caused it [D2].
- Answer only from what the tools return. If nothing relevant comes back, say so. Never say something doesn't exist just because you didn't find it: say you didn't find it.
- Your earlier answers in this conversation came from searches you can no longer see. Trust them. If you need their details again, search again rather than taking anything back.
- Cite every transaction you mention with its reference in square brackets, one per bracket, like [T3] or [T3][T4]. Cite fine print the same way, like [D2].
- For totals, averages, counts or comparisons, never do the math yourself. First search to find the stores that count (for coffee: every coffee shop), then use summarize_transactions with their store names (merchants) and any dates. Store names already cover every spelling a bank uses; use exact descriptions only for transactions without a store name. Count generously: anything the question plausibly covers belongs in (a café counts as coffee). Report its numbers exactly, and say what was included.
- For biggest, smallest, cheapest or most expensive, use search_transactions without a query, with a sort and filters (descriptions, account, dates).
- Keep it short: one or two sentences, then at most 8 transactions as a list. Plain text only: no headings or bold. Start list items with "- ".
- Only help with questions about these statements. For anything else, say that's all you can help with.`;

// The demo's "today": the first day after the statements' last month, so
// "last month" means the most recent full month of data. 2026-09-28 -> 2026-10-01.
export function demoToday(lastDate: string) {
  const [year, month] = lastDate.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

// Which statements the chat is answering about.
export type AgentMode = "demo" | "own";

const ABOUT: Record<AgentMode, string> = {
  demo: "The statements in this demo are made-up sample data.",
  own: "These are the user's own statements, which they loaded in their browser.",
};

export function systemPrompt(
  data: { accounts: string[]; first: string; last: string },
  mode: AgentMode = "demo",
  realToday: string = new Date().toISOString().slice(0, 10),
) {
  // The demo's data is frozen in time, so "today" follows the data. Real
  // statements use the real date.
  const today = mode === "demo" ? demoToday(data.last) : realToday;
  return PROMPT.replace("{about}", ABOUT[mode])
    .replace("{accounts}", data.accounts.join(", "))
    .replace("{first}", data.first)
    .replace("{last}", data.last)
    .replace("{today}", today)
    .replace("{year}", today.slice(0, 4));
}

// Everything that shapes an answer. Saved answers record a fingerprint of this
// (plus the sample data), so changing any of it retires them automatically.
export const AGENT_SETTINGS = { DEMO_MODEL, PROMPT, ABOUT, TOOLS, MAX_TOOL_ROUNDS, MAX_GROUPS, SHOW_ALL_UP_TO, LATEST_ROWS };

// Runs one answer: Claude searches as many times as it needs, then writes the
// answer. Streams text as it's written, and tells the caller which
// transactions the [T#] references point to. Returns the full exchange (for
// evals: transcripts, token usage, which model answered).
export async function runAgent({
  client,
  model,
  db,
  embed,
  history,
  onEvent,
  mode = "demo",
}: {
  client: Anthropic;
  model: string;
  db: PGlite;
  embed: (texts: string[]) => Promise<number[][]>;
  history: ChatTurn[];
  onEvent: (event: AgentEvent) => void;
  mode?: AgentMode;
}) {
  const data = await describeData(db);

  // References like T3 are numbered per answer. Old ones in earlier answers
  // would point at the wrong rows, so strip them from the history.
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.role === "assistant" ? turn.content.replace(/\s*\[[TD]\d+(?:,\s*[TD]\d+)*\]/g, "") : turn.content,
  }));

  const refs = new Map<string, string>(); // transaction id -> "T3"
  const sources: Record<string, Transaction> = {};
  const docRefs = new Map<string, string>(); // fine print chunk id -> "D2"
  const documents: Record<string, FinePrintChunk> = {};

  // Gives a transaction a short reference like T3 and remembers what it points to.
  function cite(t: Transaction) {
    if (!refs.has(t.id)) refs.set(t.id, `T${refs.size + 1}`);
    const ref = refs.get(t.id)!;
    sources[ref] = { id: t.id, account: t.account, date: t.date, description: t.description, amount: t.amount, category: t.category, merchant: t.merchant };
    return ref;
  }

  async function recurring() {
    const charges = await findRecurringCharges(db);
    if (charges.length === 0) return "No recurring charges found.";
    const blocks = charges.map((c) => {
      const header = `${c.description} (${c.account}${c.category ? `, ${c.category}` : ""}): ${c.averageAmount.toFixed(2)} a month, in ${c.months} months, ${c.first} to ${c.last}`;
      return [header, ...c.latest.map((t) => `  ${cite(t)} | ${t.date} | ${t.amount.toFixed(2)}`)].join("\n");
    });
    return `${charges.length} recurring charges:\n\n${blocks.join("\n\n")}`;
  }

  async function finePrint(query: string) {
    const [embedding] = await embed([query]);
    const found = await searchFinePrint(db, { text: query, embedding });
    if (found.length === 0) return "Nothing in the fine print matches.";
    return found
      .map((c) => {
        if (!docRefs.has(c.id)) docRefs.set(c.id, `D${docRefs.size + 1}`);
        const ref = docRefs.get(c.id)!;
        documents[ref] = { id: c.id, source: c.source, heading: c.heading, text: c.text };
        return `${ref} | ${c.heading}\n${c.text}`;
      })
      .join("\n\n");
  }

  async function summarize(input: z.infer<typeof SummarizeInput>) {
    const groups = await summarizeTransactions(db, toFilters(input), input.group_by ?? "none");
    if (groups.length === 0) return "No transactions match, so nothing to add up.";
    const line = (g: Summary) =>
      [
        `${g.group ?? "All matching"}: ${g.count} transaction${g.count === 1 ? "" : "s"}`,
        g.spent ? `spent $${g.spent.toFixed(2)}` : "",
        g.received ? `received $${g.received.toFixed(2)}` : "",
        g.averageSpend != null ? `average spend $${g.averageSpend.toFixed(2)}` : "",
        g.largest ? `largest ${cite(g.largest)} ($${(-g.largest.amount).toFixed(2)} on ${g.largest.date})` : "",
        g.latest ? `latest ${cite(g.latest)} (${g.latest.date})` : "",
      ]
        .filter(Boolean)
        .join(", ");
    return `Exact figures from the database${groups.length > 1 ? `, ${groups.length} groups, most spent first` : ""}:\n` +
      groups.slice(0, 24).map(line).join("\n");
  }

  async function search(input: z.infer<typeof SearchInput>) {
    const filters = toFilters(input);
    if (!input.query?.trim()) {
      // No topic: list everything that matches the filters, in the chosen order.
      const sort: ListSort = input.sort ?? "newest";
      const rows = await listTransactions(db, filters, 60, sort);
      if (rows.length === 0) return "No transactions match those filters.";
      return `${rows.length} transactions${rows.length === 60 ? " (the first 60)" : ""}, sorted ${sort.replace("_", " ")}:\n` +
        rows.map((t) => `${cite(t)} | ${t.date} | ${t.merchant ? `${t.merchant} [bank: ${t.description}]` : t.description} | ${t.amount.toFixed(2)} | ${t.account}`).join("\n");
    }

    const [embedding] = await embed([input.query]);
    const results = await searchTransactions(db, { text: input.query, embedding }, filters, 200);
    if (results.length === 0) return "No matching transactions.";

    // Group by store (every spelling together), or by bank description when a
    // transaction has no store name yet. Keeps the search's ranking order.
    const groups = new Map<string, typeof results>();
    for (const t of results) {
      const key = t.merchant ?? t.description;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }

    const shown = [...groups.values()].slice(0, MAX_GROUPS).map((rows) => {
      const first = rows[0];
      const dates = rows.map((t) => t.date).sort();
      const newestFirst = [...rows].sort((a, b) => b.date.localeCompare(a.date));
      const latest = rows.length <= SHOW_ALL_UP_TO ? newestFirst : newestFirst.slice(0, LATEST_ROWS);
      const count = latest.length === rows.length ? `${rows.length} match${rows.length === 1 ? "" : "es"}` : `${rows.length} matches (latest ${latest.length} shown)`;
      const spellings = [...new Set(rows.map((t) => t.description))];
      const name = first.merchant ? `${first.merchant} [bank: ${spellings.join(" / ")}]` : first.description;
      const accounts = [...new Set(rows.map((t) => t.account))].join(", ");
      const matchedBy = [...new Set(rows.flatMap((t) => t.matchedBy))].join(" + ");
      const header = `${name} (${accounts}${first.category ? `, ${first.category}` : ""}): ${count}, ${dates[0]} to ${dates.at(-1)}, matched by ${matchedBy}`;
      const lines = latest.map((t) => `  ${cite(t)} | ${t.date} | ${t.amount.toFixed(2)}${spellings.length > 1 ? ` | ${t.description}` : ""}`);
      return [header, ...lines].join("\n");
    });
    const more = groups.size > MAX_GROUPS ? ` (showing the best ${MAX_GROUPS})` : "";
    return `${results.length} matching transactions from ${groups.size} stores${more}:\n\n${shown.join("\n\n")}`;
  }

  const system = systemPrompt(data, mode);
  const responses: Anthropic.Message[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const request = { model, max_tokens: 4000, output_config: { effort: "low" as const }, system, tools: TOOLS, messages };
    let wroteText = false;
    const onText = (text: string) => {
      wroteText = true;
      onEvent({ type: "text", text });
    };
    let message: Anthropic.Message;
    if (SUPPORTS_FALLBACK.has(model)) {
      // With a fallback, a wrongly declined question is re-run on another model.
      const stream = client.beta.messages.stream({
        ...(request as Anthropic.Beta.MessageCreateParamsStreaming),
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      stream.on("text", onText);
      message = (await stream.finalMessage()) as unknown as Anthropic.Message;
    } else {
      const stream = client.messages.stream(request);
      stream.on("text", onText);
      message = await stream.finalMessage();
    }
    responses.push(message);

    if (message.stop_reason === "refusal") {
      onEvent({ type: "error", message: "Claude declined to answer that one." });
      break;
    }

    const toolCalls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolCalls.length === 0) break; // finished answering
    // Text written before a search ("Let me check...") isn't part of the answer.
    if (wroteText) onEvent({ type: "clear-text" });

    if (message.stop_reason === "max_tokens") {
      onEvent({ type: "error", message: "The answer ran too long." });
      break;
    }

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      if (call.name === "find_recurring_charges") {
        onEvent({ type: "search", query: "recurring charges" });
        results.push({ type: "tool_result", tool_use_id: call.id, content: await recurring() });
        continue;
      }
      if (call.name === "search_fine_print") {
        const query = (readInput(call) as { query?: unknown } | null)?.query;
        if (typeof query !== "string" || !query.trim()) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Invalid tool call." });
          continue;
        }
        onEvent({ type: "search", query: `fine print: ${query.slice(0, 100)}` });
        results.push({ type: "tool_result", tool_use_id: call.id, content: await finePrint(query.slice(0, 200)) });
        continue;
      }
      if (call.name === "summarize_transactions") {
        const input = SummarizeInput.safeParse(readInput(call));
        if (!input.success) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Invalid tool call." });
          continue;
        }
        onEvent({ type: "search", query: `totals: ${describeFilters(input.data)}` });
        results.push({ type: "tool_result", tool_use_id: call.id, content: await summarize(input.data) });
        continue;
      }
      const input = SearchInput.safeParse(readInput(call));
      if (call.name !== "search_transactions" || !input.success) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Invalid tool call." });
        continue;
      }
      onEvent({ type: "search", query: input.data.query?.trim() || `list: ${describeFilters(input.data)}` });
      results.push({ type: "tool_result", tool_use_id: call.id, content: await search(input.data) });
    }
    // All results go back in one message, so Claude can keep searching in parallel.
    messages.push({ role: "user", content: results });
    onEvent({ type: "sources", sources });
    if (docRefs.size) onEvent({ type: "documents", documents });
  }

  return { system, messages, responses, sources, documents };
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

// The tools' snake_case inputs as the search module's filters.
function toFilters(input: z.infer<typeof Filters>): SearchFilters {
  return {
    dateFrom: input.date_from,
    dateTo: input.date_to,
    account: input.account,
    minAmount: input.min_amount,
    maxAmount: input.max_amount,
    descriptions: input.descriptions,
    merchants: input.merchants,
  };
}

// For the "Searched for ..." line when Claude lists or totals by filters.
export function describeFilters(input: z.infer<typeof Filters> & { sort?: string }) {
  const stores = [...(input.merchants ?? []), ...(input.descriptions ?? [])];
  const parts = [
    stores.length ? (stores.length <= 2 ? stores.join(" + ") : `${stores.length} stores`) : "",
    input.date_from && input.date_to
      ? `${input.date_from} to ${input.date_to}`
      : input.date_from
        ? `from ${input.date_from}`
        : input.date_to
          ? `until ${input.date_to}`
          : "",
    input.account ?? "",
    input.sort && input.sort !== "newest" ? input.sort.replace("_", " ") : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "everything";
}
