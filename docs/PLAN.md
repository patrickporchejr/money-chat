# Money Chat: the plan

Money Chat lets people ask questions about their bank statements in plain English. This page explains what we're building, in what order, and why.

## The big ideas

**Your data stays with you.** Statements are read and stored in your browser. Our server never sees them.

**RAG where it helps, plain math where it doesn't.** RAG means finding the right pieces of your data and handing them to the AI before it answers. We use it to:

1. **Find transactions** from a vague description ("that coffee place near work").
2. **Sort transactions into categories** by comparing them to ones already sorted. Fix one, and it learns.
3. **Read the fine print** ("why was I charged $35?") by finding both the fee and the rule that explains it.
4. **Turn vague questions into exact numbers** ("how much on coffee?"): RAG decides what counts as coffee, then plain math adds it up.

Totals and averages are always plain math, never the AI, so the numbers are exact.

## How people use it

- **Try it with sample data:** one year of made-up statements. No setup and nothing to paste. This runs on our Claude key, with the protections below.
- **Use your own statements:** bring your own Claude key. The key stays in memory only and is gone when you close the tab. We suggest making a separate key with a spending limit.

## Keeping our costs safe (sample data mode)

1. **Hard spending cap.** The demo uses its own Anthropic workspace with a monthly limit. If it's hit, the demo pauses. It never overspends.
2. **Demo questions only.** The browser sends just the question. Our server adds the sample data and fixed instructions, so nobody can use our key for anything else.
3. **Per-visitor limits.** A few questions per hour per visitor, plus a daily total for the whole site.
4. **Small and cheap.** A smaller Claude model, with short answers.
5. **Saved answers.**
   - *Suggested questions* (the clickable starters) are answered once by a script and saved in the project. Visitors get the saved answer, which costs nothing. We re-run the script only when the sample data or the questions change, not on every deploy.
   - *Other questions* are saved after the first time anyone asks them, so asking again is free.

## Build order

Each step is its own pull request, and each one ends with something you can see working.

1. **Load the data.** "Try sample data" or upload CSVs, and see every transaction in a table.
2. **Search by meaning.** Searching "coffee" finds all the different ways the bank wrote Blue Bottle.
3. **Chat (sample data).** Ask a question, get an answer that points to the transactions it used.
4. **Saved answers and limits.** Suggested questions, the answer cache, rate limits.
5. **Exact math.** "How much did I spend on coffee?" uses RAG to pick the merchants, then adds them up.
6. **Fine print.** "Why was I charged $35?" finds the fee and the rule.
7. **Bring your own key.** Use the app with your real statements.
8. **Auto-categories.** Learn from your corrections.
9. **Quality checks.** A fixed list of questions with known answers, scored automatically, so we can prove changes make it better.

## What we're not doing

- No running AI models inside the browser. You bring a key, or use the demo.
- No accounts or logins.
- No PDF statements at first. CSV only; PDF may come later.
