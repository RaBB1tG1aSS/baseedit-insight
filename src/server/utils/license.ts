/**
 * Copyright/storage policy for full text.
 *
 * We only persist parsed full text when the source declares a Creative Commons
 * (or CC0) license. "Free to read" or publisher TDM links are not enough — the
 * UI/analysis must fall back to abstract-only material in those cases.
 */
export function licenseAllowsStorage(license: string | null | undefined): boolean {
  if (!license) return false;
  const value = license.toLowerCase();
  if (value.includes("cc0") || value.includes("public domain")) return true;
  if (value.includes("creative commons")) return true;
  return /\bcc[\s-]?by\b/.test(value);
}

/** Human-readable short label for a license string. */
export function licenseLabel(license: string | null | undefined): string {
  if (!license) return "未声明";
  if (/^cc[\s-]?by/i.test(license) || /cc0|creative commons/i.test(license)) return license.toUpperCase();
  if (/tdm|text-and-data-mining|springer|elsevier/i.test(license)) return "出版社 TDM 条款（不允许本地保存）";
  return license;
}
