import { nowIso } from "../db/client";
import { deleteFullText, getFullText, upsertFullText } from "../db/repo/analysis";

export const MANUAL_FULLTEXT_SOURCE = "用户导入";
export const MANUAL_FULLTEXT_MIN_CHARS = 500;
export const MANUAL_FULLTEXT_MAX_CHARS = 500_000;

const NBSP = String.fromCharCode(0x00a0);
const ZERO_WIDTH = String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff);

const KNOWN_HEADING =
  /^(abstract|summary|introduction|background|materials and methods|methods?|results?( and discussion)?|discussion|conclusions?( and perspectives)?|significance|limitations?|acknowledge?ments?|author contributions|funding|data availability|supplementary (materials|information)|highlights?|graphical abstract|keywords)$/i;

function normalizeText(input: string): string {
  let text = input.replace(/\r\n?/g, "\n").replace(/\f/g, "\n");
  text = text.replaceAll(NBSP, " ");
  for (const character of ZERO_WIDTH) text = text.replaceAll(character, "");
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop the reference list; it is long, noisy and rarely useful for a deep read. */
function withoutReferences(text: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => {
    const bare = line
      .trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\d+(?:\.\d+)*[.)]?\s*/, "")
      .trim();
    return /^(references|references and notes|bibliography|literature cited|参考文献)$/i.test(bare);
  });
  if (index <= 0) return text;
  const tail = lines.slice(index + 1).join("\n");
  return tail.length > 500 ? lines.slice(0, index).join("\n").trim() : text;
}

function headingOf(line: string): string | null {
  const raw = line.trim();
  if (!raw || raw.length > 90) return null;

  const markdown = /^#{1,6}\s+(.+)$/.exec(raw);
  if (markdown) return markdown[1].trim();

  if (/[.!?,;:]$/.test(raw)) return null;

  const numbered = /^(\d+(?:\.\d+)*)[.)]?\s+([A-Z][^.!?]{1,80})$/.exec(raw);
  if (numbered) return `${numbered[1]} ${numbered[2]}`.trim();

  if (KNOWN_HEADING.test(raw)) return raw;

  const words = raw.split(/\s+/).length;
  if (raw.length >= 3 && raw === raw.toUpperCase() && /[A-Z]/.test(raw) && words <= 12) {
    return raw;
  }
  return null;
}

function paragraphsOf(text: string): string[] {
  if (/\n{2,}/.test(text)) {
    return text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  // PDF copies often contain single line breaks only; rebuild paragraphs by length.
  const paragraphs: string[] = [];
  let buffer = "";
  for (const line of text.split("\n")) {
    const value = line.trim();
    if (!value) {
      if (buffer) paragraphs.push(buffer);
      buffer = "";
      continue;
    }
    buffer = buffer ? `${buffer} ${value}` : value;
    if (buffer.length >= 1200) {
      paragraphs.push(buffer);
      buffer = "";
    }
  }
  if (buffer) paragraphs.push(buffer);
  return paragraphs;
}

function chunkParagraphs(paragraphs: string[]): { heading: string; text: string }[] {
  const sections: { heading: string; text: string }[] = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length > 6000) {
      sections.push({ heading: `全文 · 第 ${sections.length + 1} 部分`, text: buffer });
      buffer = "";
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  if (buffer) sections.push({ heading: `全文 · 第 ${sections.length + 1} 部分`, text: buffer });
  return sections;
}

export function splitFullTextIntoSections(input: string): { heading: string; text: string }[] {
  const text = withoutReferences(normalizeText(input));
  if (!text) return [];

  const sections: { heading: string; text: string }[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (body.length >= 20) sections.push({ heading: heading ?? "正文", text: body });
    buffer = [];
  };

  for (const line of text.split("\n")) {
    const detected = headingOf(line);
    if (detected) {
      flush();
      heading = detected;
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (sections.length <= 1) {
    const paragraphs = paragraphsOf(text);
    if (paragraphs.length <= 1) return sections;
    return chunkParagraphs(paragraphs);
  }
  return sections;
}

export interface ManualFullTextResult {
  sections: number;
  chars: number;
  truncated: boolean;
}

export function importManualFullText(paperId: string, raw: string): ManualFullTextResult {
  const normalized = normalizeText(raw);
  if (normalized.length < MANUAL_FULLTEXT_MIN_CHARS) {
    throw new Error(`原文太短（${normalized.length} 字符），至少需要 ${MANUAL_FULLTEXT_MIN_CHARS} 字符`);
  }

  const truncated = normalized.length > MANUAL_FULLTEXT_MAX_CHARS;
  const text = truncated ? normalized.slice(0, MANUAL_FULLTEXT_MAX_CHARS) : normalized;
  const sections = splitFullTextIntoSections(text);
  if (!sections.length) {
    throw new Error("未能从文本中解析出正文内容，请确认粘贴的是论文正文");
  }

  const charCount = sections.reduce((sum, section) => sum + section.text.length, 0);
  upsertFullText({
    paperId,
    accessStatus: "manual_fulltext",
    sourceName: MANUAL_FULLTEXT_SOURCE,
    sourceUrl: null,
    license: null,
    licenseAllowsStorage: true,
    sections,
    charCount,
    fetchedAt: nowIso(),
    error: null,
  });

  return { sections: sections.length, chars: charCount, truncated };
}

export function removeManualFullText(paperId: string): boolean {
  const existing = getFullText(paperId);
  if (!existing || existing.accessStatus !== "manual_fulltext") return false;
  return deleteFullText(paperId);
}
