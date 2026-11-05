import type { JournalMetricSource } from "./types";

export const METRIC_SOURCE_LABEL: Record<JournalMetricSource, string> = {
  jcr: "JCR Impact Factor",
  openalex: "OpenAlex 2yr mean citedness",
  custom: "自定义期刊指标",
};

export const METRIC_SOURCE_SHORT: Record<JournalMetricSource, string> = {
  jcr: "IF",
  openalex: "2yr",
  custom: "指标",
};

export function metricPrefix(source: JournalMetricSource | null | undefined): string {
  return source ? METRIC_SOURCE_SHORT[source] ?? "指标" : "指标";
}

export function metricTitle(
  value: number | null,
  source: JournalMetricSource | null,
  year: number | null,
): string {
  if (value == null) return "暂无期刊指标";
  return `${METRIC_SOURCE_LABEL[source ?? "custom"] ?? "期刊指标"} · ${value}${year ? ` · ${year}` : ""}`;
}
