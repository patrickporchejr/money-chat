import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these with plain Node instead of bundling: they ship WASM and native files.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "@electric-sql/pglite-pg_textsearch"],
  // The demo chat reads the sample CSVs from disk, and the embedding library
  // loads its native runtime dynamically, so neither is found automatically.
  outputFileTracingIncludes: {
    "/api/demo-chat": [
      "./public/sample-data/**/*",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
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
