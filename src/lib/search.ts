import type { PGlite } from "@electric-sql/pglite";
import type { FinePrintChunk } from "@/lib/fine-print";
import type { Transaction } from "@/lib/transactions";

// The embedding model turns text into 384 numbers that capture its meaning.
// Picked over bge-small after comparing both on the sample data: its scores
// separate good and bad matches more clearly. See PR #4.
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

// What we embed and keyword-search for each transaction: the bank's text plus
// the cleaned-up store name and category, e.g.
// "SQ *BLUE BTL 0423 OAKLAND CA - Blue Bottle Coffee (Coffee)".
// SEARCH_TEXT_SQL must build exactly the same string inside the database.
export function searchText(t: Pick<Transaction, "description" | "category" | "merchant">) {
  return t.description + (t.merchant ? ` - ${t.merchant}` : "") + (t.category ? ` (${t.category})` : "");
}
const SEARCH_TEXT_SQL = "description || coalesce(' - ' || merchant, '') || coalesce(' (' || category || ')', '')";

// This code takes the database as an argument, so the same functions work in
// the browser (the user's data) and on the server (the sample data demo).
export async function setUpDatabase(db: PGlite) {
  await db.exec(`
    create extension if not exists vector;
    create extension if not exists pg_textsearch;

    create table if not exists transactions (
      id text primary key,
      account text not null,
      date date not null,
      description text not null,
      amount numeric(12, 2) not null,
      category text,
      search_text text not null,
      embedding vector(${EMBEDDING_DIMENSIONS})
    );
    alter table transactions add column if not exists merchant text;

    -- Store name and category for each bank description (see lib/labels.ts).
    -- "user" labels are corrections and always win over "model" labels.
    create table if not exists merchant_labels (
      description text primary key,
      merchant text not null,
      category text not null,
      source text not null check (source in ('model', 'user')),
      embedding vector(${EMBEDDING_DIMENSIONS})
    );

    -- BM25 keyword index (pg_textsearch). English stemming: "fees" matches "fee".
    create index if not exists transactions_bm25 on transactions
      using bm25(search_text) with (text_config = 'english');

    -- Statement fine print, one row per paragraph (see lib/fine-print.ts).
    create table if not exists fine_print (
      id text primary key,
      source text not null,
      heading text not null,
      text text not null,
      search_text text not null,
      embedding vector(${EMBEDDING_DIMENSIONS})
    );
    create index if not exists fine_print_bm25 on fine_print
      using bm25(search_text) with (text_config = 'english');
  `);
}

const SELECT_TRANSACTION = `
  t.id, t.account, to_char(t.date, 'YYYY-MM-DD') as date, t.description,
  t.amount::float8 as amount, t.category, t.merchant`;

export async function getAllTransactions(db: PGlite) {
  const { rows } = await db.query<Transaction>(
    `select ${SELECT_TRANSACTION} from transactions t order by t.date desc, t.id`,
  );
  return rows;
}

// Replaces everything with a new set of statements.
export async function replaceTransactions(db: PGlite, transactions: Transaction[]) {
  await db.transaction(async (tx) => {
    await tx.query("delete from transactions");
    for (const t of transactions) {
      await tx.query(
        `insert into transactions (id, account, date, description, amount, category, search_text)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [t.id, t.account, t.date, t.description, t.amount, t.category, searchText(t)],
      );
    }
  });
}

export async function clearTransactions(db: PGlite) {
  await db.query("delete from transactions");
}

// Search text that still needs an embedding. Many transactions share the same
// text (same store, same category), so we only embed each one once.
export async function textsMissingEmbeddings(db: PGlite) {
  const { rows } = await db.query<{ search_text: string }>(
    "select distinct search_text from transactions where embedding is null",
  );
  return rows.map((r) => r.search_text);
}

export async function saveEmbeddings(db: PGlite, texts: string[], vectors: number[][]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < texts.length; i++) {
      await tx.query("update transactions set embedding = $1 where search_text = $2", [
        JSON.stringify(vectors[i]),
        texts[i],
      ]);
    }
  });
}

export type SearchFilters = {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  account?: string;
  minAmount?: number;
  maxAmount?: number;
  descriptions?: string[]; // exact descriptions, e.g. the stores a search found
  merchants?: string[]; // cleaned-up store names, e.g. ["Blue Bottle Coffee", "Starbucks"]
};

// Turns filters into SQL conditions, adding their values to params.
function filterConditions(filters: SearchFilters, params: unknown[]) {
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filters.dateFrom) add("date >= ?", filters.dateFrom);
  if (filters.dateTo) add("date <= ?", filters.dateTo);
  if (filters.account) add("account = ?", filters.account);
  if (filters.minAmount !== undefined) add("amount >= ?", filters.minAmount);
  if (filters.maxAmount !== undefined) add("amount <= ?", filters.maxAmount);
  if (filters.descriptions?.length) add("description = any(?)", filters.descriptions);
  if (filters.merchants?.length) add("merchant = any(?)", filters.merchants);
  return where;
}

// How listTransactions orders results. Spending amounts are negative, so the
// biggest spend is the lowest amount.
export type ListSort = "newest" | "oldest" | "largest_spend" | "smallest_spend" | "largest_deposit";

const SORTS: Record<ListSort, { where?: string; order: string }> = {
  newest: { order: "t.date desc, t.id" },
  oldest: { order: "t.date asc, t.id" },
  largest_spend: { where: "amount < 0", order: "t.amount asc, t.date desc" },
  smallest_spend: { where: "amount < 0", order: "t.amount desc, t.date desc" },
  largest_deposit: { where: "amount > 0", order: "t.amount desc, t.date desc" },
};

// Every transaction matching the filters, in the chosen order. For questions
// with no topic to search for ("what happened around June 11?") and for
// biggest/smallest questions.
export async function listTransactions(db: PGlite, filters: SearchFilters, limit = 200, sort: ListSort = "newest") {
  const params: unknown[] = [limit];
  const where = filterConditions(filters, params);
  if (SORTS[sort].where) where.push(SORTS[sort].where!);
  const { rows } = await db.query<Transaction>(
    `select ${SELECT_TRANSACTION} from transactions t
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by ${SORTS[sort].order} limit $1`,
    params,
  );
  return rows;
}

export type SummaryGroup = "none" | "merchant" | "description" | "month" | "account" | "category";

export type Summary = {
  group: string | null; // e.g. "2026-07" when grouped by month; null when not grouped
  count: number;
  spent: number; // money out, as a positive number
  received: number; // money in
  averageSpend: number | null; // average of the money-out transactions
  largest: Transaction | null; // biggest single spend in the group
  latest: Transaction | null;
};

// Exact counts, totals and averages, done by the database rather than the AI.
// Rounded to cents. Groups are ordered by most spent.
export async function summarizeTransactions(
  db: PGlite,
  filters: SearchFilters,
  groupBy: SummaryGroup = "none",
): Promise<Summary[]> {
  const params: unknown[] = [];
  const where = filterConditions(filters, params);
  const groupSql = {
    none: "null::text",
    merchant: "coalesce(merchant, description)",
    description: "description",
    month: "to_char(date, 'YYYY-MM')",
    account: "account",
    category: "coalesce(category, 'Uncategorized')",
  }[groupBy];
  const { rows } = await db.query<{ group: string | null; count: number; spent: number; received: number; average_spend: number | null; ids: string[] }>(
    `select ${groupSql} as "group",
       count(*)::int as count,
       round(coalesce(-sum(amount) filter (where amount < 0), 0), 2)::float8 as spent,
       round(coalesce(sum(amount) filter (where amount > 0), 0), 2)::float8 as received,
       round(-avg(amount) filter (where amount < 0), 2)::float8 as average_spend,
       array[
         (array_agg(id order by amount asc) filter (where amount < 0))[1],
         (array_agg(id order by date desc, id))[1]
       ] as ids
     from transactions
     ${where.length ? `where ${where.join(" and ")}` : ""}
     group by 1
     order by spent desc`,
    params,
  );

  // Fetch the two example transactions per group so answers can cite them.
  const ids = [...new Set(rows.flatMap((r) => r.ids).filter(Boolean))];
  const { rows: examples } = ids.length
    ? await db.query<Transaction>(`select ${SELECT_TRANSACTION} from transactions t where t.id = any($1)`, [ids])
    : { rows: [] as Transaction[] };
  const byId = new Map(examples.map((t) => [t.id, t]));

  return rows.map((r) => ({
    group: r.group,
    count: r.count,
    spent: r.spent,
    received: r.received,
    averageSpend: r.average_spend,
    largest: (r.ids[0] && byId.get(r.ids[0])) || null,
    latest: (r.ids[1] && byId.get(r.ids[1])) || null,
  }));
}

export type SearchResult = Transaction & {
  score: number;
  matchedBy: ("meaning" | "words")[];
};

// How close in meaning a result must be to count (0 to 1). Below this, results
// were mostly noise on the sample data.
const MIN_SIMILARITY = 0.35;
// Standard constant for reciprocal rank fusion.
const RRF_K = 60;

// Hybrid search:
// 1. Filter by date, account and amount first.
// 2. Rank what's left two ways: by meaning (pgvector) and by words (BM25).
// 3. Merge the two rankings with reciprocal rank fusion: a result near the top
//    of either list scores well, and one near the top of both scores best.
export async function searchTransactions(
  db: PGlite,
  query: { text: string; embedding: number[] },
  filters: SearchFilters = {},
  limit = 50,
): Promise<SearchResult[]> {
  const params: unknown[] = [JSON.stringify(query.embedding), query.text, MIN_SIMILARITY, limit];
  const where = filterConditions(filters, params);

  const { rows } = await db.query<SearchResult & { meaning_rank: number | null; words_rank: number | null }>(
    `
    with filtered as (
      select * from transactions ${where.length ? `where ${where.join(" and ")}` : ""}
    ),
    meaning as (
      select id, row_number() over (order by embedding <=> $1::vector) as rank
      from filtered
      where embedding is not null and 1 - (embedding <=> $1::vector) >= $3
      order by embedding <=> $1::vector
      limit $4
    ),
    words as (
      -- BM25 scores are negative; 0 means no match.
      select id, row_number() over (order by search_text <@> to_bm25query($2, 'transactions_bm25')) as rank
      from filtered
      where search_text <@> to_bm25query($2, 'transactions_bm25') < 0
      order by search_text <@> to_bm25query($2, 'transactions_bm25')
      limit $4
    )
    select ${SELECT_TRANSACTION},
      coalesce(1.0 / (${RRF_K} + m.rank), 0) + coalesce(1.0 / (${RRF_K} + w.rank), 0) as score,
      m.rank as meaning_rank,
      w.rank as words_rank
    from meaning m
    full outer join words w on w.id = m.id
    join transactions t on t.id = coalesce(m.id, w.id)
    order by score desc, t.date desc
    limit $4
    `,
    params,
  );

  return rows.map(({ meaning_rank, words_rank, ...t }) => ({
    ...t,
    score: Number(t.score),
    matchedBy: [...(meaning_rank ? ["meaning" as const] : []), ...(words_rank ? ["words" as const] : [])],
  }));
}

export type RecurringCharge = {
  description: string;
  account: string;
  category: string | null;
  months: number; // how many different months it appeared in
  averageAmount: number;
  first: string;
  last: string;
  latest: Transaction[]; // most recent first, up to 3
};

// Charges that repeat about once a month at a steady amount: subscriptions,
// memberships, rent, bills. Search by meaning can't find these ("EQUINOX
// BROOKLYN HTS" doesn't sound like "subscription"); the pattern can.
export async function findRecurringCharges(db: PGlite): Promise<RecurringCharge[]> {
  const { rows } = await db.query<Omit<RecurringCharge, "latest">>(`
    select description, account, category,
      count(distinct date_trunc('month', date))::int as months,
      avg(amount)::float8 as "averageAmount",
      to_char(min(date), 'YYYY-MM-DD') as first,
      to_char(max(date), 'YYYY-MM-DD') as last
    from transactions
    where amount < 0
    group by description, account, category
    having count(distinct date_trunc('month', date)) >= 3
      -- about once a month, not an everyday habit like coffee
      and count(*) <= count(distinct date_trunc('month', date)) * 1.5
      -- a steady amount (within 10%), unlike a utility bill
      and max(amount) - min(amount) <= abs(avg(amount)) * 0.1
    order by avg(amount)`);

  return Promise.all(
    rows.map(async (r) => {
      const { rows: latest } = await db.query<Transaction>(
        `select ${SELECT_TRANSACTION} from transactions t
         where t.description = $1 and t.account = $2 order by t.date desc limit 3`,
        [r.description, r.account],
      );
      return { ...r, latest };
    }),
  );
}

// ---- Fine print ----------------------------------------------------------

const finePrintSearchText = (c: Pick<FinePrintChunk, "heading" | "text">) => `${c.heading}: ${c.text}`;

export async function replaceFinePrint(db: PGlite, chunks: FinePrintChunk[]) {
  await db.transaction(async (tx) => {
    await tx.query("delete from fine_print");
    for (const c of chunks) {
      await tx.query("insert into fine_print (id, source, heading, text, search_text) values ($1, $2, $3, $4, $5)", [
        c.id,
        c.source,
        c.heading,
        c.text,
        finePrintSearchText(c),
      ]);
    }
  });
}

export async function clearFinePrint(db: PGlite) {
  await db.query("delete from fine_print");
}

// Which fine print documents are loaded, and how many paragraphs each has.
export async function finePrintDocuments(db: PGlite) {
  const { rows } = await db.query<{ source: string; chunks: number }>(
    "select source, count(*)::int as chunks from fine_print group by source order by source",
  );
  return rows;
}

export async function finePrintMissingEmbeddings(db: PGlite) {
  const { rows } = await db.query<{ id: string; search_text: string }>(
    "select id, search_text from fine_print where embedding is null order by id",
  );
  return rows;
}

export async function saveFinePrintEmbeddings(db: PGlite, ids: string[], vectors: number[][]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.query("update fine_print set embedding = $1 where id = $2", [JSON.stringify(vectors[i]), ids[i]]);
    }
  });
}

export type FinePrintResult = FinePrintChunk & { matchedBy: ("meaning" | "words")[] };

// Hybrid search over the fine print, like searchTransactions: rank by meaning
// and by BM25 words, merge with reciprocal rank fusion.
export async function searchFinePrint(
  db: PGlite,
  query: { text: string; embedding: number[] },
  limit = 5,
): Promise<FinePrintResult[]> {
  const { rows } = await db.query<FinePrintChunk & { meaning_rank: number | null; words_rank: number | null }>(
    `
    with meaning as (
      select id, row_number() over (order by embedding <=> $1::vector) as rank
      from fine_print
      where embedding is not null and 1 - (embedding <=> $1::vector) >= $3
      order by embedding <=> $1::vector
      limit 20
    ),
    words as (
      select id, row_number() over (order by search_text <@> to_bm25query($2, 'fine_print_bm25')) as rank
      from fine_print
      where search_text <@> to_bm25query($2, 'fine_print_bm25') < 0
      order by search_text <@> to_bm25query($2, 'fine_print_bm25')
      limit 20
    )
    select f.id, f.source, f.heading, f.text, m.rank as meaning_rank, w.rank as words_rank
    from meaning m
    full outer join words w on w.id = m.id
    join fine_print f on f.id = coalesce(m.id, w.id)
    order by coalesce(1.0 / (${RRF_K} + m.rank), 0) + coalesce(1.0 / (${RRF_K} + w.rank), 0) desc, f.id
    limit $4
    `,
    [JSON.stringify(query.embedding), query.text, MIN_SIMILARITY, limit],
  );
  return rows.map(({ meaning_rank, words_rank, ...c }) => ({
    ...c,
    matchedBy: [...(meaning_rank ? ["meaning" as const] : []), ...(words_rank ? ["words" as const] : [])],
  }));
}

// ---- Store labels ----------------------------------------------------------

export type MerchantLabel = { description: string; merchant: string; category: string };
export type LabelSource = "model" | "user";

// Saves labels. A "user" label (a correction) replaces anything; a "model"
// label never overwrites a correction.
export async function saveLabels(db: PGlite, labels: MerchantLabel[], source: LabelSource) {
  await db.transaction(async (tx) => {
    for (const l of labels) {
      await tx.query(
        `insert into merchant_labels (description, merchant, category, source) values ($1, $2, $3, $4)
         on conflict (description) do update set merchant = excluded.merchant, category = excluded.category, source = excluded.source
         where merchant_labels.source <> 'user' or excluded.source = 'user'`,
        [l.description, l.merchant, l.category, source],
      );
    }
  });
}

// Copies labels onto transactions. The bank's own category is kept unless the
// user corrected it. Changed rows lose their embedding so search re-embeds them.
export async function applyLabels(db: PGlite) {
  await db.exec(`
    update transactions t set
      merchant = l.merchant,
      category = case when l.source = 'user' or t.category is null then l.category else t.category end
    from merchant_labels l
    where l.description = t.description;

    update transactions set search_text = ${SEARCH_TEXT_SQL}, embedding = null
    where search_text <> ${SEARCH_TEXT_SQL};
  `);
}

export async function clearLabels(db: PGlite) {
  await db.query("delete from merchant_labels");
}

// Bank descriptions that don't have a label yet.
export async function unlabeledDescriptions(db: PGlite) {
  const { rows } = await db.query<{ description: string; category: string | null }>(`
    select distinct on (t.description) t.description, t.category
    from transactions t
    left join merchant_labels l on l.description = t.description
    where l.description is null
    order by t.description`);
  return rows;
}

export async function getLabels(db: PGlite) {
  const { rows } = await db.query<MerchantLabel & { source: LabelSource }>(
    "select description, merchant, category, source from merchant_labels order by description",
  );
  return rows;
}

export async function labelsMissingEmbeddings(db: PGlite) {
  const { rows } = await db.query<{ description: string }>(
    "select description from merchant_labels where embedding is null order by description",
  );
  return rows.map((r) => r.description);
}

export async function saveLabelEmbeddings(db: PGlite, descriptions: string[], vectors: number[][]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < descriptions.length; i++) {
      await tx.query("update merchant_labels set embedding = $1 where description = $2", [
        JSON.stringify(vectors[i]),
        descriptions[i],
      ]);
    }
  });
}

// The labeled descriptions most similar to a new one: the examples Claude
// sees when labeling it. Corrections come first when equally close.
export async function nearestLabels(db: PGlite, embedding: number[], k = 5) {
  const { rows } = await db.query<MerchantLabel & { source: LabelSource }>(
    `select description, merchant, category, source from merchant_labels
     where embedding is not null
     order by embedding <=> $1::vector, (source = 'user') desc
     limit $2`,
    [JSON.stringify(embedding), k],
  );
  return rows;
}
