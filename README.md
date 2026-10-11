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

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Built with

Next.js, Tailwind CSS, and Claude.
