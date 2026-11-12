import { extractText } from "unpdf";

export interface ExtractedPdf {
  text: string;
  pages: number;
}

/**
 * Extract plain text from a PDF with pdfjs (via unpdf). Works for text-based
 * PDFs; scanned/image-only PDFs yield little or no text and are rejected by the
 * caller with an OCR hint.
 */
export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdf> {
  const { totalPages, text } = await extractText(data, { mergePages: true });
  return {
    pages: totalPages,
    text: text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

export function isPdfBytes(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}
