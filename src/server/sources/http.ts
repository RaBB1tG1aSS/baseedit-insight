const USER_AGENT =
  "BaseEditInsight/1.0 (academic literature research tool; contact via configured mailto)";

const hostSlots = new Map<string, number>();

async function waitForSlot(host: string, minIntervalMs: number): Promise<void> {
  const previous = hostSlots.get(host) ?? 0;
  const wait = previous + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  hostSlots.set(host, Date.now());
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  minIntervalMs?: number;
  accept?: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
    public body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Fetch with timeout, retry/backoff and per-host politeness. */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 25000, retries = 2, headers = {}, minIntervalMs = 120, accept } = options;
  const host = new URL(url).host;
  let lastError: unknown;

  await waitForSlot(host, minIntervalMs);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept ?? "application/json",
          ...headers,
        },
      });
      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => "");
        lastError = new HttpError(
          `HTTP ${response.status} from ${host}`,
          response.status,
          url,
          body.slice(0, 400),
        );
        if (attempt < retries) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(8000, 800 * 2 ** attempt)),
          );
          continue;
        }
        throw lastError;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
        continue;
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(`HTTP ${response.status}`, response.status, url, body.slice(0, 500));
  }
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, { ...options, accept: options.accept ?? "text/plain, application/xml" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(`HTTP ${response.status}`, response.status, url, body.slice(0, 500));
  }
  return response.text();
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extract text from fast-xml-parser output nodes. */
export function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(" ");
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if ("#text" in record) return String(record["#text"] ?? "");
    if (record._ != null) return String(record._);
  }
  return "";
}
