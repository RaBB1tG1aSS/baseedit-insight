import { getPaperById, updatePaper } from "../db/repo/papers";
import { callStructured } from "./client";
import { titleTranslationSchema } from "./schemas";
import { translationPrompt } from "./prompts";

const TEMPLATE_VERSION = "translate-v1";

export async function translateTitles(
  paperIds: string[],
  options: { force?: boolean; batchSize?: number } = {},
): Promise<{ translated: number; failed: number }> {
  const batchSize = options.batchSize ?? 10;
  const targets = paperIds
    .map((id) => getPaperById(id))
    .filter((paper): paper is NonNullable<typeof paper> => Boolean(paper))
    .filter((paper) => options.force || !paper.titleZh);

  let translated = 0;
  let failed = 0;

  for (let index = 0; index < targets.length; index += batchSize) {
    const batch = targets.slice(index, index + batchSize);
    try {
      const { data } = await callStructured(titleTranslationSchema, {
        prompt: translationPrompt(batch.map((paper) => ({ id: paper.id, title: paper.title }))),
        templateVersion: TEMPLATE_VERSION,
        timeoutMs: 120_000,
      });
      const allowed = new Set(batch.map((paper) => paper.id));
      for (const item of data.items) {
        if (!allowed.has(item.paper_id) || !item.title_zh?.trim()) continue;
        updatePaper(item.paper_id, { title_zh: item.title_zh.trim() }, "AI title translation");
        translated += 1;
      }
    } catch {
      failed += batch.length;
    }
  }

  return { translated, failed };
}
