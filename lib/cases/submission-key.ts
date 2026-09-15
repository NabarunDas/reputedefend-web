const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSubmissionKey(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

export function readSubmissionKey(raw: unknown): string | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = (raw as Record<string, unknown>).submissionKey
  return isSubmissionKey(value) ? value : null
}
