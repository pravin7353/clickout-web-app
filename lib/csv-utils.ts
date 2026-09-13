/**
 * Shared CSV / Tabular Delimiter Detection Utility
 * Auto-detects Comma (,), Tab (\t), or Semicolon (;) delimiters
 */
export function detectDelimiter(headerLine: string): string {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  if (semiCount > commaCount && semiCount > tabCount) return ";";
  if (commaCount > 0 && commaCount >= tabCount && commaCount >= semiCount) return ",";

  return ",";
}
