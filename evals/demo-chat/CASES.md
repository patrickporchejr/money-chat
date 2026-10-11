# Demo chat eval: test questions

26 questions about the sample data. The right answers come from facts we planted in the fake data (`scripts/make-sample-data.mjs`), so they're known for certain.

**Every question is also checked for:** every `[T#]` citation points to a real transaction, and answers that state facts cite at least one transaction.

| # | id | kind | question | must mention | judge checks |
|---|---|---|---|---|---|
| 1 | coffee-places | lookup, messy-names | Where do I buy coffee? | `blue bottle`, `starbucks`, `joe'?s cafe` | - |
| 2 | grocery-stores | lookup, messy-names | Where do I buy groceries? | `trader joe`, `whole foods` | - |
| 3 | paycheck | lookup | Who pays me, and how much is each paycheck? | `acme`, `2,?750` | - |
| 4 | rent | lookup | How much is my rent and how do I pay it? | `2,?950`, `zelle` | - |
| 5 | food-delivery | lookup | Do I order food delivery? | `doordash` | - |
| 6 | biggest-purchase | lookup, filters | What was my single biggest purchase? | `midas`, `8,?150` | - |
| 7 | late-fee | fees | Did I pay any late fees? | `29`, `late` | - |
| 8 | overdraft-cause | fees, filters | Why was I charged a $35 fee? | `overdraft`, `midas` | - |
| 9 | maintenance-fee | fees | What is the $12 charge on my checking account? | `maintenance` | - |
| 10 | foreign-fees | fees | What foreign transaction fees did I pay? | `33\.60`, `0\.44`, `1\.45`, `0\.49`, `2\.20` | - |
| 11 | lisbon-trip | lookup, messy-names | What did I spend in Lisbon? | `alfama`, `tap`, `cevicheria`, `time out`, `uber`, `bel[eé]m` | - |
| 12 | coffee-september | filters | Which coffee shops did I go to in September 2026? | `blue bottle`, `starbucks`; cites only 2026-09-01..2026-09-30 | - |
| 13 | checking-june | filters | What came out of my checking account in June 2026? | `midas`, `rent|zelle`; cites only 2026-06-01..2026-06-30, Harbor Bank Checking | - |
| 14 | subscriptions | recurring | What subscriptions am I paying for? | `equinox`, `netflix`, `spotify`, `nytimes|new york times`, `icloud` | Does the answer avoid claiming that something does not exist (for example "no gym membership") as a fact? Saying it didn't find something is fine. |
| 15 | gym | recurring | Do I have a gym membership? | `equinox`, `265` | - |
| 16 | streaming | recurring | Which streaming services do I pay for? | `netflix`, `spotify` | - |
| 17 | investing-paused | recurring | Am I still investing every month? | `vanguard` | Does the answer say the monthly investment stopped or paused (the last one was in May 2026)? |
| 18 | no-total-coffee | rules | How much did I spend on coffee this year? | - | Does the answer avoid stating a dollar total or sum, and instead list transactions and/or say totals aren't available yet? |
| 19 | no-average-groceries | rules | What's my average grocery bill? | - | Does the answer avoid stating an average amount, and instead list transactions and/or say averages aren't available yet? |
| 20 | off-topic-poem | rules | Write me a poem about the ocean. | - | Does the answer decline to write the poem and say it only helps with questions about the statements? |
| 21 | off-topic-stocks | rules | Should I buy Tesla stock? | - | Does the answer avoid giving investment advice, and say it only helps with questions about the statements? |
| 22 | absent-disney | absence | How much do I pay for Disney+? | -; must not invent a price | There is no Disney+ charge in the data. Does the answer say it didn't find one, without inventing a price or charge? |
| 23 | absent-tokyo | absence | What did I spend on my Tokyo trip? | - | There is no Tokyo trip in the data. Does the answer say it didn't find one, without inventing charges? Mentioning the Lisbon trip as the only trip found is fine. |
| 24 | followup-trip-fees | follow-up | Were there any extra fees on that trip? *(follow-up)* | `foreign transaction`, `33\.60`, `2\.20` | Does the answer avoid taking back or contradicting the earlier answer about the six Lisbon charges? |
| 25 | followup-latest-coffee | follow-up | Which of those did I visit most recently? *(follow-up)* | `starbucks`, `2026-09-28|sep(tember)? 28` | - |
| 26 | followup-gym-day | follow-up, recurring | What day of the month does the gym charge me? *(follow-up)* | `1st|first|-01\b|on the 1\b` | - |

`must mention` patterns are case-insensitive; `2,?750` means "2750" or "2,750", `a|b` means either.

## Follow-up conversations

**followup-trip-fees**

> **user:** What did I spend in Lisbon?  
> **assistant:** I found six Lisbon charges in July 2026: TAP Air Portugal, Hotel Alfama Lisboa, Pasteis de Belem, Time Out Market Lisboa, an Uber trip and A Cevicheria. Exact totals are coming soon.  
> **user:** Were there any extra fees on that trip?  

**followup-latest-coffee**

> **user:** Where do I buy coffee?  
> **assistant:** Mostly at Blue Bottle Coffee, plus Starbucks and Joe's Cafe.  
> **user:** Which of those did I visit most recently?  

**followup-gym-day**

> **user:** What subscriptions am I paying for?  
> **assistant:** Equinox ($265/month), Netflix ($17.99), Spotify ($11.99), NYTimes ($4.00) and iCloud ($2.99).  
> **user:** What day of the month does the gym charge me?  

