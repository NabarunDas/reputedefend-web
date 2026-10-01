const formulaPrefix = /^[\s\u0009\u000d\u000a]*[=+\-@\t\r\n]/

export function neutralizeCsvCell(value: string, numeric = false): string {
  if (numeric) return value
  if (!value) return ""
  return formulaPrefix.test(value) ? `'${value}` : value
}

export function csvEscape(value: unknown, numeric = false): string {
  const raw = value == null ? "" : String(value)
  const safe = neutralizeCsvCell(raw, numeric && raw !== "" && /^-?\d+(\.\d+)?$/.test(raw))
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>, numericColumns: number[] = []): string {
  const lines = [headers.map(header => csvEscape(header)).join(",")]
  for (const row of rows) {
    lines.push(row.map((cell, index) => csvEscape(cell, numericColumns.includes(index))).join(","))
  }
  return `${lines.join("\r\n")}\r\n`
}

export const exportColumns: Record<string, string[]> = {
  default: ["id", "occurredAt", "label", "amountMinor", "currency", "elapsedSeconds"],
}

export function exportFilename(reportKey: string, date = new Date()) {
  const safe = reportKey.replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "report"
  const stamp = date.toISOString().slice(0, 10)
  return `admin-${safe}-${stamp}.csv`
}
