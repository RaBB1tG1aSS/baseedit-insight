import { z } from "zod";
import { env } from "../env";
import { getSettings } from "../db/repo/settings";
import { SYSTEM_PROMPT } from "./prompts";
import {
  callModel,
  claudeCliAvailable,
  extractJson,
  type AiCallResult,
  type AiConfig,
} from "./provider";

export interface AiMeta {
  model: string;
  provider: string;
  templateVersion: string;
  costUsd: number | null;
}

export interface StructuredResult<T> {
  data: T;
  meta: AiMeta;
  text: string;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

let availabilityCache: boolean | null = null;

export function isAiAvailable(): boolean {
  const settings = getSettings();
  if (settings.aiProvider === "anthropic") {
    return Boolean(env.anthropicApiKey);
  }
  if (availabilityCache == null) availabilityCache = claudeCliAvailable();
  return availabilityCache;
}

export function aiStatus(): {
  available: boolean;
  provider: string;
  model: string;
  reason: string | null;
} {
  const settings = getSettings();
  const available = isAiAvailable();
  let reason: string | null = null;
  if (!available) {
    reason =
      settings.aiProvider === "anthropic"
        ? "未配置 ANTHROPIC_API_KEY"
        : "未检测到可用的 Claude Code CLI（请先安装并登录，或将 AI_PROVIDER 设为 anthropic）";
  }
  return {
    available,
    provider: settings.aiProvider,
    model: settings.aiModel || (settings.aiProvider === "anthropic" ? "claude-sonnet-5-5" : "Claude Code 默认模型"),
    reason,
  };
}

export function resolveAiConfig(): AiConfig {
  const settings = getSettings();
  return {
    provider: settings.aiProvider,
    model: settings.aiModel || undefined,
    apiKey: env.anthropicApiKey || undefined,
    baseUrl: env.anthropicBaseUrl || undefined,
    maxBudgetUsd: env.aiMaxBudgetUsd,
  };
}

const RETRY_HINT =
  "\n\n【重要】上一次输出未能通过 JSON 校验。请重新生成，严格只输出一个符合 schema 的 JSON 对象，不要代码围栏、不要额外解释。";

export async function callStructured<T>(
  schema: z.ZodType<T>,
  params: {
    prompt: string;
    system?: string;
    templateVersion: string;
    timeoutMs?: number;
    attempts?: number;
  },
): Promise<StructuredResult<T>> {
  if (!isAiAvailable()) {
    const status = aiStatus();
    throw new AiUnavailableError(status.reason ?? "AI provider unavailable");
  }

  const config = resolveAiConfig();
  const jsonSchema = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const attempts = params.attempts ?? 2;
  let lastError: unknown = null;
  let lastResult: AiCallResult | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const prompt = attempt === 0 ? params.prompt : `${params.prompt}${RETRY_HINT}`;
    try {
      const result = await callModel(config, {
        system: params.system ?? SYSTEM_PROMPT,
        prompt,
        jsonSchema,
        timeoutMs: params.timeoutMs,
      });
      lastResult = result;

      let candidate: unknown = result.structured;
      if (!candidate && result.text) candidate = extractJson(result.text);

      const parsed = schema.safeParse(candidate);
      if (parsed.success) {
        return {
          data: parsed.data,
          meta: {
            model: result.model,
            provider: result.provider,
            templateVersion: params.templateVersion,
            costUsd: result.costUsd,
          },
          text: result.text,
        };
      }

      lastError = new Error(
        `JSON 校验失败: ${parsed.error.issues
          .slice(0, 6)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; ")}`,
      );
    } catch (error) {
      lastError = error;
      if (error instanceof AiUnavailableError) throw error;
    }
  }

  throw new Error(
    `AI 结构化输出失败 (${params.templateVersion}): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }${lastResult?.costUsd ? ` [cost $${lastResult.costUsd.toFixed(3)}]` : ""}`,
  );
}
