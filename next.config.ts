import type { NextConfig } from "next";

// What the page is allowed to load and talk to (production only; the dev
// server needs eval). Your statements live in the browser, so this is what
// keeps them from going anywhere except Anthropic, and only with your own key.
//   api.anthropic.com      your own key's chat requests
//   huggingface.co, *.hf.co  the embedding model download (once, then cached)
// The embedding runtime (WebAssembly) is served from this site (public/ort).
// blob: scripts are allowed as a backstop for browsers where the runtime still
// loads itself that way; only code already running on the page can make them.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "connect-src 'self' https://api.anthropic.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Load these with plain Node instead of bundling: they ship WASM and native files.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "@electric-sql/pglite-pg_textsearch"],
  // The demo chat reads the sample CSVs from disk, and the embedding library
  // loads its native runtime dynamically, so neither is found automatically.
  outputFileTracingIncludes: {
    "/api/demo-chat": [
      "./public/sample-data/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-common/package.json",
      "./node_modules/onnxruntime-common/dist/cjs/**/*",
      // It ships builds for every OS; Vercel servers only need Linux x64.
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
