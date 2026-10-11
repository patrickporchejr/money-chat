// Copies the embedding runtime (ONNX Runtime's WebAssembly build) into
// public/ort, so the browser loads it from this site instead of a CDN.
// Runs automatically before `npm run dev` and `npm run build`. Not committed:
// it's regenerated from the installed onnxruntime-web package (~14 MB).

import { copyFileSync, mkdirSync } from "node:fs";

const FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
mkdirSync("public/ort", { recursive: true });
for (const f of FILES) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
console.log(`Copied ${FILES.length} ONNX Runtime files to public/ort/`);
