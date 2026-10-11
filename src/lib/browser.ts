// Browser-only setup: the user's database and the embedding worker.

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_textsearch } from "@electric-sql/pglite-pg_textsearch";
import { setUpDatabase } from "@/lib/search";
import type { EmbedRequest, EmbedResponse } from "@/workers/embed.worker";

let db: Promise<PGlite> | null = null;

// The user's database lives in this browser (IndexedDB), so data survives a
// page refresh. "Clear my data" deletes it.
export function getDatabase() {
  db ??= (async () => {
    const pg = await PGlite.create("idb://money-chat", { extensions: { vector, pg_textsearch } });
    await setUpDatabase(pg);
    return pg;
  })();
  return db;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>();
let onProgress: ((percent: number) => void) | null = null;

// Called with download progress while the model loads for the first time.
export function onModelProgress(callback: (percent: number) => void) {
  onProgress = callback;
}

// Turns texts into embeddings, using the background worker.
export function embed(texts: string[]): Promise<number[][]> {
  if (!worker) {
    worker = new Worker(new URL("../workers/embed.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<EmbedResponse>) => {
      if (data.type === "progress") return onProgress?.(data.percent);
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.type === "result") request?.resolve(data.vectors);
      else request?.reject(new Error(data.message));
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, texts } satisfies EmbedRequest);
  });
}

// A Claude client that talks to Anthropic straight from this browser, with the
// user's own key. The key is never stored: it lives only in this page's memory.
export async function claudeClient(apiKey: string) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}
