# Money Chat

Upload your bank statements and ask questions about your money in plain English.

**Live site:** https://money-chat-sigma.vercel.app

> "How much did I spend on coffee this year?"
> "Why was I charged a $35 fee?"
> "What subscriptions am I paying for?"

**Status:** just getting started. Right now this is a hello world page.

## How your data is kept private

- Your statements stay in your browser. There is no server storing them.
- You bring your own AI key (Claude). Your questions go straight from your browser to the AI, never through us.
- Nothing you upload is ever saved to this project or its code.

## How it works

This app uses **RAG** (retrieval-augmented generation). In plain terms: before the AI answers, the app finds the parts of your data that matter and hands them over, so the answer is based on *your* statements and not a guess.

It uses this in four places:

1. **Finding transactions.** "What was that coffee place near work?" The app finds the matching transactions, then the AI answers.
2. **Sorting into categories.** New transactions get labeled by looking at similar ones you already have. Fix one once, and it learns.
3. **Reading the fine print.** "Why was I charged a fee?" The app finds the fee *and* the part of the statement that explains it.
4. **Turning vague questions into exact numbers.** "How much on coffee?" The app works out what counts as coffee, then plain math adds it up.

Totals and averages are always done with plain math, not the AI, so the numbers are exact.

## Quality checks

`npm test` runs unit tests on everything deterministic: reading statements, filters, sorting and the math. Totals are always calculated by the database, never by the AI.


`npm run eval` asks the chat 40 questions with known answers and grades every reply with partial credit: plain code checks the facts and citations, and a second Claude model checks the rules (no made-up charges, no totals it can't do yet, stays on topic). For prompt changes, a judge compares new answers head-to-head with the old ones. Current baseline: **0.93** (0.87 on the 14 hard questions), about $0.06 per run. Details in [docs/PLAN.md](docs/PLAN.md).

## Sample data

The app comes with one year of **made-up** bank data in `public/sample-data/`, so anyone can try it without uploading their own:

- `harbor-bank-checking.csv`: a checking account (paychecks, rent, bills)
- `summit-card.csv`: a credit card in a different layout, like a second bank would use
- `fine-print.txt`: the fee rules and notices that explain the charges

It has a few things to find on purpose: messy store names, monthly subscriptions, an overdraft after a big car repair, a late card payment, and foreign fees from a trip to Lisbon.

To rebuild it: `npm run sample-data`

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Built with

Next.js, Tailwind CSS, and Claude.
