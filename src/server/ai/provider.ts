import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type AiProviderName = "claude-cli" | "anthropic";

export interface AiConfig {
  provider: AiProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxBudgetUsd?: number;
}

export interface AiCallInput {
  system: string;
  prompt: string;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface AiCallResult {
  text: string;
  structured: unknown | null;
  model: string;
  provider: AiProviderName;
  costUsd: number | null;
}

let cachedBin: string | null = null;
let cachedAvailability: boolean | null = null;

/**
 * On Windows the npm global install exposes `claude` (a shell script) and
 * `claude.cmd`, neither of which Node can spawn directly. The .cmd shim points
 * at the real claude.exe, so follow it when possible.
 */
function resolveWindowsShim(candidate: string): string {
  if (process.platform !== "win32" || /\.exe$/i.test(candidate)) return candidate;
  const shims = /\.cmd$/i.test(candidate) ? [candidate] : [`${candidate}.cmd`];
  for (const shim of shims) {
    try {
      if (!fs.existsSync(shim)) continue;
      const text = fs.readFileSync(shim, "utf8");
      const match = /%dp0%[\\/]([^"\r\n]+?\.exe)/i.exec(text);
      if (!match) continue;
      const exe = path.join(path.dirname(shim), match[1]);
      if (fs.existsSync(exe)) return exe;
    } catch {
      // ignore unreadable or non-standard shims
    }
  }
  return candidate;
}

export function resolveClaudeBin(): string {
  if (cachedBin) return cachedBin;
  const explicit = process.env.CLAUDE_CODE_EXECPATH;
  if (explicit && fs.existsSync(explicit)) {
    cachedBin = explicit;
    return cachedBin;
  }
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(command, ["claude"], { encoding: "utf8", timeout: 5000 });
    const candidates = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const exe = candidates.find((candidate) => /\.exe$/i.test(candidate));
    cachedBin = exe ?? resolveWindowsShim(candidates[0] ?? "claude");
  } catch {
    cachedBin = "claude";
  }
  return cachedBin;
}

export function claudeCliAvailable(): boolean {
  if (cachedAvailability != null) return cachedAvailability;
  try {
    const result = spawnSync(resolveClaudeBin(), ["--version"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    cachedAvailability = result.status === 0;
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

function parseCliOutput(stdout: string): Record<string, unknown> {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "result" || "result" in parsed || "structured_output" in parsed) {
        return parsed;
      }
    } catch {
      // keep scanning
    }
  }
  throw new Error(`Claude CLI returned no JSON result. stdout head: ${stdout.slice(0, 300)}`);
}

async function runClaudeCli(config: AiConfig, input: AiCallInput): Promise<AiCallResult> {
  const bin = resolveClaudeBin();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    input.system,
  ];
  if (config.model) args.push("--model", config.model);
  if (input.jsonSchema) args.push("--json-schema", JSON.stringify(input.jsonSchema));
  if (config.maxBudgetUsd && config.maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  }

  const timeoutMs = input.timeoutMs ?? 240_000;
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      windowsHide: true,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "sdk" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`AI call timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(`Claude CLI exited with ${code}: ${err.slice(0, 500)}`));
        return;
      }
      resolve(out);
    });

    child.stdin.write(input.prompt);
    child.stdin.end();
  });

  const parsed = parseCliOutput(stdout);
  if (parsed.is_error) {
    throw new Error(String(parsed.result ?? "Claude CLI reported an error").slice(0, 800));
  }

  let structured = (parsed.structured_output as unknown) ?? null;
  const text = typeof parsed.result === "string" ? parsed.result : "";
  if (!structured && text) {
    const extracted = extractJson(text);
    if (extracted) structured = extracted;
  }

  const usage = parsed.modelUsage as Record<string, unknown> | undefined;
  const modelName = usage ? Object.keys(usage)[0] : (config.model || "claude-code-default");

  return {
    text,
    structured,
    model: modelName ?? "claude-code-default",
    provider: "claude-cli",
    costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
  };
}

async function runAnthropic(config: AiConfig, input: AiCallInput): Promise<AiCallResult> {
  if (!config.apiKey) {
    throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
  }
  const model = config.model || "claude-sonnet-5-5";
  const base = (config.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 240_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: input.system,
        messages: [
          {
            role: "user",
            content: input.jsonSchema
              ? `${input.prompt}\n\n请只输出一个符合以下 JSON Schema 的 JSON 对象：\n${JSON.stringify(input.jsonSchema)}`
              : input.prompt,
          },
        ],
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 500)}`);
    }
    const parsed = JSON.parse(body) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (parsed.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    const structured = input.jsonSchema ? extractJson(text) : null;

    return {
      text,
      structured,
      model,
      provider: "anthropic",
      costUsd: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractJson(text: string): unknown | null {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(cleaned.slice(arrayStart, arrayEnd + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function callModel(config: AiConfig, input: AiCallInput): Promise<AiCallResult> {
  if (config.provider === "anthropic") return runAnthropic(config, input);
  if (!claudeCliAvailable()) {
    throw new Error(
      "Claude CLI is not available. Install Claude Code and run `claude` once to sign in, or set AI_PROVIDER=anthropic with ANTHROPIC_API_KEY.",
    );
  }
  return runClaudeCli(config, input);
}
