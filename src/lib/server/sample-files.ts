// Server side (and scripts): the sample CSVs on disk, and the fingerprint that
// decides whether saved answers are still valid. No embedding library here, so
// the saved-answer path never has to load it.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_SETTINGS } from "@/lib/agent";
import { EMBEDDING_MODEL } from "@/lib/search";

const SAMPLE_FILES = ["harbor-bank-checking.csv", "summit-card.csv"];

export const readFinePrint = () => readFile(path.join(process.cwd(), "public/sample-data", "fine-print.txt"), "utf8");

export const readSampleFiles = () =>
  Promise.all(
    SAMPLE_FILES.map(async (name) => ({
      name,
      text: await readFile(path.join(process.cwd(), "public/sample-data", name), "utf8"),
    })),
  );

// A short fingerprint of everything that shapes a demo answer: the sample data
// and fine print, and the agent's model, prompt and tools. Saved answers are only used when
// their fingerprint matches, so changing any of these retires them.
let version: Promise<string> | null = null;
export function answersVersion() {
  version ??= (async () => {
    const [files, finePrint] = await Promise.all([readSampleFiles(), readFinePrint()]);
    const hash = createHash("sha256").update(JSON.stringify({ files, finePrint, agent: AGENT_SETTINGS, EMBEDDING_MODEL }));
    return hash.digest("hex").slice(0, 12);
  })();
  return version;
}
