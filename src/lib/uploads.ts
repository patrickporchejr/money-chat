// What kind of file someone uploaded: bank statements (CSV) or fine print
// (fee schedules, agreements, notices, saved as plain text or markdown).
export type UploadKind = "statement" | "fine-print";

export function uploadKind(fileName: string): UploadKind | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "csv") return "statement";
  if (ext === "txt" || ext === "md") return "fine-print";
  return null;
}

// "chase-fee-schedule.txt" -> "chase-fee-schedule" (used as the fine print's source name)
export const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
