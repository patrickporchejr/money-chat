"use client";

import { useCallback, useEffect, useState } from "react";
import { embed, getDatabase, onModelProgress } from "@/lib/browser";
import { chunkFinePrint } from "@/lib/fine-print";
import {
  clearFinePrint,
  clearTransactions,
  finePrintDocuments,
  finePrintMissingEmbeddings,
  getAllTransactions,
  replaceFinePrint,
  replaceTransactions,
  saveEmbeddings,
  saveFinePrintEmbeddings,
  searchTransactions,
  textsMissingEmbeddings,
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
      const db = await getDatabase();
      const [saved, docs] = await Promise.all([getAllTransactions(db), finePrintDocuments(db)]);
      setTransactions(saved);
      setFinePrint(docs);
      if (saved.length || docs.length) prepareSearch();
    })();
  }, [prepareSearch]);

  // CSVs replace the statements; .txt/.md files replace the fine print.
  const loadFiles = useCallback(
    async (files: { name: string; text: string }[]) => {
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
        setTransactions(await getAllTransactions(db));
      }
      if (documents.length) {
        await replaceFinePrint(db, documents.flatMap((f) => chunkFinePrint(f.text, baseName(f.name))));
        setFinePrint(await finePrintDocuments(db));
      }
      setError(null);
      prepareSearch();
    },
    [prepareSearch],
  );

  const clear = useCallback(async () => {
    const db = await getDatabase();
    await Promise.all([clearTransactions(db), clearFinePrint(db)]);
    setTransactions([]);
    setFinePrint([]);
    setSearchStatus({ state: "idle" });
  }, []);

  const search = useCallback(async (text: string) => {
    const [embedding] = await embed([text]);
    // The search box shows every match (high limit), newest first. Many matches
    // share the same store, so ranking order between them means little here.
    const results = await searchTransactions(await getDatabase(), { text, embedding }, {}, 1000);
    return results.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  return { transactions, finePrint, error, searchStatus, loadFiles, clear, search };
}
