export const settingKeys = ["SERVICE_HOURS", "RETENTION"] as const
export type SettingKey = (typeof settingKeys)[number]
export const templateKeys = ["EVIDENCE_REQUEST", "CASE_UPDATE", "CONVERSATION_REPLY", "GUARD_ALERT"] as const
export type SettingsTemplateKey = (typeof templateKeys)[number]
export const privacyKinds = ["ACCESS", "EXPORT", "CORRECTION", "DELETION"] as const
export const holdCategories = [
  "UNSUCCESSFUL_ENQUIRY", "CASE_EVIDENCE", "FINANCIAL", "CONSENT", "SECURITY_LOG", "CUSTOMER_RECORD",
] as const
export const incidentKinds = ["WORKER_OUTAGE", "PROVIDER_FAILURE", "STAFF_ABSENCE", "MAIL_FAILURE", "OTHER"] as const
export const settingsOperations = [
  "create_setting_draft", "approve_setting", "create_template_draft", "approve_template_draft",
  "create_schedule_draft", "approve_schedule", "create_hold", "release_hold",
  "create_privacy_request", "verify_privacy_request", "preview_privacy_request", "complete_privacy_request",
  "create_incident", "acknowledge_incident", "resolve_incident",
] as const
export type SettingsOperation = (typeof settingsOperations)[number]

export function isSettingKey(value: string | undefined): value is SettingKey {
  return !!value && (settingKeys as readonly string[]).includes(value)
}

export function isTemplateKey(value: string | undefined): value is SettingsTemplateKey {
  return !!value && (templateKeys as readonly string[]).includes(value)
}

export function isSettingsOperation(value: string | undefined): value is SettingsOperation {
  return !!value && (settingsOperations as readonly string[]).includes(value)
}

export function payloadLooksSecret(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload).toLowerCase()
  return Object.keys(payload).some(key => /(secret|token|password|api[_-]?key|stripe|webhook|sk_|otp|private)/i.test(key))
    || /(sk_live|sk_test|whsec_|begin [a-z]+ private key)/i.test(text)
}

export function weekdayHoursPayload(start: string, end: string, targetHours: number | null) {
  return {
    timezone: "Europe/London",
    weekdays: [1, 2, 3, 4, 5].map(day => ({ day, start, end })),
    firstResponseTargetHours: targetHours,
    independentOfGuardMonitoring: true,
  }
}

export function retentionPayload(days: {
  unsuccessfulEnquiriesDays: number
  caseEvidenceDays: number
  financialDays: number
  consentDays: number
  securityLogsDays: number
}) {
  return days
}

export function commandMessage(status?: string, reason?: string) {
  if (status === "reauth_required") return "For security, sign out and sign in with a new email code, then try again within five minutes."
  if (status === "conflict") return "That record changed. Refresh and try again."
  if (status === "denied" && reason === "legal_hold") return "A legal hold blocks deletion. Financial and audit records remain."
  if (status === "denied" && reason === "email_not_verified") return "Verify the customer’s current email before completing this request."
  if (status === "denied") return "That request is not allowed."
  if (reason === "retroactive_effective_from") return "Settings cannot start in the past. Historical obligations stay unchanged."
  if (status === "unauthorized") return "Please sign in again."
  if (status === "invalid") return "Check the form. Secrets cannot be stored in settings."
  return "Saved."
}
