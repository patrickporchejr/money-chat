// Runs the embedding model in a background thread so the page stays responsive.
// The model (~23 MB) downloads once, then the browser caches it.

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL } from "@/lib/search";

export type EmbedRequest = { id: number; texts: string[] };
export type EmbedResponse =
  | { type: "progress"; percent: number }
  | { type: "result"; id: number; vectors: number[][] }
  | { type: "error"; id: number; message: string };

// Load the WebAssembly runtime from this site (copied by scripts/copy-ort.mjs),
// not from a CDN, and import it directly rather than through a blob: URL, so
// the page's security policy can stay strict.
env.useWasmCache = false;
env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL("/ort/ort-wasm-simd-threaded.mjs", self.location.origin).href,
  wasm: new URL("/ort/ort-wasm-simd-threaded.wasm", self.location.origin).href,
};

let model: Promise<FeatureExtractionPipeline> | null = null;

function loadModel() {
  model ??= pipeline("feature-extraction", EMBEDDING_MODEL, {
    dtype: "q8",
    // Report progress for the model file itself, the only big download.
    progress_callback: (event: { status: string; file?: string; progress?: number }) => {
      if (event.status === "progress" && event.file?.endsWith(".onnx") && event.progress !== undefined) {
        postMessage({ type: "progress", percent: Math.round(event.progress) } satisfies EmbedResponse);
      }
    },
  });
  return model;
}

self.onmessage = async ({ data }: MessageEvent<EmbedRequest>) => {
  try {
    const extract = await loadModel();
    const output = await extract(data.texts, { pooling: "mean", normalize: true });
    postMessage({ type: "result", id: data.id, vectors: output.tolist() } satisfies EmbedResponse);
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e instanceof Error ? e.message : String(e) } satisfies EmbedResponse);
  }
};
