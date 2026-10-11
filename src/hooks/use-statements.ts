"use client";

import { useCallback, useEffect, useState } from "react";
import { embed, getDatabase, onModelProgress } from "@/lib/browser";
import { chunkFinePrint } from "@/lib/fine-print";
import {
  applyLabels,
  clearFinePrint,
  clearLabels,
  clearTransactions,
  finePrintDocuments,
  finePrintMissingEmbeddings,
  getAllTransactions,
  replaceFinePrint,
  replaceTransactions,
  saveEmbeddings,
  saveFinePrintEmbeddings,
  saveLabels,
  type MerchantLabel,
  searchTransactions,
  textsMissingEmbeddings,
  unlabeledDescriptions,
} from "@/lib/search";
import { accountNameFromFile, parseStatement, type Transaction } from "@/lib/transactions";
import { baseName, uploadKind } from "@/lib/uploads";

export type SearchStatus =
  | { state: "idle" }
  | { state: "downloading"; percent: number }
  | { state: "indexing" }
  | { state: "ready" }
  | { state: "error"; message: string };

export type FinePrintDocument = { source: string; chunks: number };

// Loads, saves and searches the user's statements and fine print. Everything
// stays in the browser.
export function useStatements() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [finePrint, setFinePrint] = useState<FinePrintDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ state: "idle" });
  const [unlabeled, setUnlabeled] = useState(0); // bank descriptions without a store name yet

  const refresh = useCallback(async () => {
    const db = await getDatabase();
    const [rows, docs, todo] = await Promise.all([getAllTransactions(db), finePrintDocuments(db), unlabeledDescriptions(db)]);
    setTransactions(rows);
    setFinePrint(docs);
    setUnlabeled(todo.length);
    return { rows, docs };
  }, []);

  // Gives every transaction and fine print paragraph an embedding so it can be
  // searched by meaning.
  const prepareSearch = useCallback(async () => {
    const db = await getDatabase();
    const texts = await textsMissingEmbeddings(db);
    const chunks = await finePrintMissingEmbeddings(db);
    if (texts.length === 0 && chunks.length === 0) return setSearchStatus({ state: "ready" });

    setSearchStatus({ state: "indexing" });
    onModelProgress((percent) =>
      setSearchStatus(percent < 100 ? { state: "downloading", percent } : { state: "indexing" }),
    );
    try {
      if (texts.length) await saveEmbeddings(db, texts, await embed(texts));
      if (chunks.length) {
        await saveFinePrintEmbeddings(db, chunks.map((c) => c.id), await embed(chunks.map((c) => c.search_text)));
      }
      setSearchStatus({ state: "ready" });
    } catch (e) {
      setSearchStatus({ state: "error", message: e instanceof Error ? e.message : "Search couldn't start." });
    }
  }, []);

  // On page load, show whatever was saved last time.
  useEffect(() => {
    (async () => {
      const { rows, docs } = await refresh();
      if (rows.length || docs.length) prepareSearch();
    })();
  }, [prepareSearch, refresh]);

  // CSVs replace the statements; .txt/.md files replace the fine print.
  // `labels` are ready-made store names (the sample data ships with them).
  const loadFiles = useCallback(
    async (files: { name: string; text: string }[], labels?: MerchantLabel[]) => {
      const unsupported = files.filter((f) => !uploadKind(f.name));
      if (unsupported.length) {
        return setError(
          `Can't read ${unsupported.map((f) => f.name).join(", ")}. Upload statements as .csv and fine print as .txt or .md.`,
        );
      }
      const statements = files.filter((f) => uploadKind(f.name) === "statement");
      const documents = files.filter((f) => uploadKind(f.name) === "fine-print");

      let parsed: Transaction[] = [];
      try {
        parsed = statements.flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name)));
      } catch (e) {
        return setError(e instanceof Error ? e.message : "Something went wrong reading that file.");
      }
      const db = await getDatabase();
      if (statements.length) {
        await replaceTransactions(db, parsed);
        if (labels?.length) await saveLabels(db, labels, "model");
        await applyLabels(db); // reuses labels (and corrections) for descriptions seen before
      }
      if (documents.length) {
        await replaceFinePrint(db, documents.flatMap((f) => chunkFinePrint(f.text, baseName(f.name))));
      }
      await refresh();
      setError(null);
      prepareSearch();
    },
    [prepareSearch, refresh],
  );

  // Cleans up store names for your own statements, with your own key.
  const labelStores = useCallback(
    async (apiKey: string, model: string) => {
      const [{ labelNewDescriptions }, { claudeClient }] = await Promise.all([import("@/lib/labels"), import("@/lib/browser")]);
      await labelNewDescriptions({ client: await claudeClient(apiKey), model, db: await getDatabase(), embed });
      await refresh();
      prepareSearch(); // labeled rows get re-embedded with their store names
    },
    [prepareSearch, refresh],
  );

  // Your correction: applies to every transaction with this description now,
  // and teaches future labeling.
  const correctStore = useCallback(
    async (label: MerchantLabel) => {
      const { correctLabel } = await import("@/lib/labels");
      await correctLabel(await getDatabase(), embed, label);
      await refresh();
      prepareSearch();
    },
    [prepareSearch, refresh],
  );

  const clear = useCallback(async () => {
    const db = await getDatabase();
    await Promise.all([clearTransactions(db), clearFinePrint(db), clearLabels(db)]);
    setTransactions([]);
    setFinePrint([]);
    setUnlabeled(0);
    setSearchStatus({ state: "idle" });
  }, []);

  const search = useCallback(async (text: string) => {
    const [embedding] = await embed([text]);
    // The search box shows every match (high limit), newest first. Many matches
    // share the same store, so ranking order between them means little here.
    const results = await searchTransactions(await getDatabase(), { text, embedding }, {}, 1000);
    return results.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  return { transactions, finePrint, unlabeled, error, searchStatus, loadFiles, clear, search, labelStores, correctStore };
}
