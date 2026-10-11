"use client";

import { useCallback, useEffect, useState } from "react";
import { embed, getDatabase, onModelProgress } from "@/lib/browser";
import {
  clearTransactions,
  getAllTransactions,
  replaceTransactions,
  saveEmbeddings,
  searchTransactions,
  textsMissingEmbeddings,
} from "@/lib/search";
import { accountNameFromFile, parseStatement, type Transaction } from "@/lib/transactions";

export type SearchStatus =
  | { state: "idle" }
  | { state: "downloading"; percent: number }
  | { state: "indexing" }
  | { state: "ready" }
  | { state: "error"; message: string };

// Loads, saves and searches the user's statements. Everything stays in the browser.
export function useStatements() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ state: "idle" });

  // Gives every transaction an embedding so it can be searched by meaning.
  const prepareSearch = useCallback(async () => {
    const db = await getDatabase();
    const texts = await textsMissingEmbeddings(db);
    if (texts.length === 0) return setSearchStatus({ state: "ready" });

    setSearchStatus({ state: "indexing" });
    onModelProgress((percent) =>
      setSearchStatus(percent < 100 ? { state: "downloading", percent } : { state: "indexing" }),
    );
    try {
      await saveEmbeddings(db, texts, await embed(texts));
      setSearchStatus({ state: "ready" });
    } catch (e) {
      setSearchStatus({ state: "error", message: e instanceof Error ? e.message : "Search couldn't start." });
    }
  }, []);

  // On page load, show whatever was saved last time.
  useEffect(() => {
    (async () => {
      const saved = await getAllTransactions(await getDatabase());
      setTransactions(saved);
      if (saved.length) prepareSearch();
    })();
  }, [prepareSearch]);

  const loadFiles = useCallback(
    async (files: { name: string; text: string }[]) => {
      let parsed: Transaction[];
      try {
        parsed = files.flatMap((f) => parseStatement(f.text, accountNameFromFile(f.name)));
      } catch (e) {
        return setError(e instanceof Error ? e.message : "Something went wrong reading that file.");
      }
      const db = await getDatabase();
      await replaceTransactions(db, parsed);
      setTransactions(await getAllTransactions(db));
      setError(null);
      prepareSearch();
    },
    [prepareSearch],
  );

  const clear = useCallback(async () => {
    await clearTransactions(await getDatabase());
    setTransactions([]);
    setSearchStatus({ state: "idle" });
  }, []);

  const search = useCallback(async (text: string) => {
    const [embedding] = await embed([text]);
    // The search box shows every match (high limit), newest first. Many matches
    // share the same store, so ranking order between them means little here.
    const results = await searchTransactions(await getDatabase(), { text, embedding }, {}, 1000);
    return results.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  return { transactions, error, searchStatus, loadFiles, clear, search };
}
