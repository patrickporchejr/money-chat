// Splits statement fine print (fee schedules, cardholder agreements, notices)
// into small chunks for search. Each chunk is one paragraph, and keeps its
// section heading so it still makes sense on its own:
//   "SUMMIT CARD: CARDHOLDER AGREEMENT, Rates and fees" + "Late payment fee: up to $29.00 ..."

export type FinePrintChunk = {
  id: string; // e.g. "fine-print-3"
  source: string; // which document it came from
  heading: string;
  text: string;
};

// Headings look like a block between lines of "=" (as in the sample fine print)
// or a markdown heading ("# Fees").
const RULE = /^={3,}\s*$/;
const MARKDOWN_HEADING = /^#{1,3}\s+(.+)$/;

export function chunkFinePrint(text: string, source: string): FinePrintChunk[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: FinePrintChunk[] = [];
  let heading = "General";
  let paragraph: string[] = [];

  const flush = () => {
    const body = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (body) chunks.push({ id: `${source}-${chunks.length + 1}`, source, heading, text: body });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (RULE.test(line)) {
      // "=====" / heading lines / "=====": everything up to the closing rule is the heading.
      flush();
      const end = lines.findIndex((l, j) => j > i && RULE.test(l.trim()));
      if (end === -1) continue;
      heading = lines.slice(i + 1, end).map((l) => l.trim()).filter(Boolean).join(", ");
      i = end;
    } else if (MARKDOWN_HEADING.test(line)) {
      flush();
      heading = line.match(MARKDOWN_HEADING)![1].trim();
    } else if (!line) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return chunks;
}
