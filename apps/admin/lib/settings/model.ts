export const settingKeys = ["SERVICE_HOURS", "RESPONSE_TARGETS", "ALERT_ESCALATION", "SUPPORTED_MARKETS"] as const
export type SettingKey = (typeof settingKeys)[number]
export const templateKeys = ["EVIDENCE_REQUEST", "CASE_UPDATE", "CONVERSATION_REPLY", "GUARD_ALERT"] as const
export type SettingsTemplateKey = (typeof templateKeys)[number]
export const retentionCategories = [
  "UNSUCCESSFUL_ENQUIRIES", "CASE_EVIDENCE", "FINANCIAL_RECORDS", "CONSENT_RECORDS", "SECURITY_LOGS",
] as const
export const privacyKinds = ["ACCESS", "EXPORT", "CORRECTION", "DELETION"] as const
export const holdScopes = ["CUSTOMER", "BUSINESS", "CASE", "CATEGORY"] as const
export const incidentKinds = [
  "WORKER_OUTAGE", "PROVIDER_FAILURE", "MONITORING_GAP", "EMAIL", "BILLING", "SECURITY", "PRIVACY", "OTHER",
] as const
export const settingsOperations = [
  "create_setting_draft", "update_setting_draft", "approve_setting", "retire_setting",
  "create_retention_draft", "update_retention_draft", "approve_retention", "retire_retention",
  "create_template_draft", "update_template_draft", "approve_template", "approve_template_draft", "retire_template",
  "create_schedule_draft", "update_schedule_draft", "approve_schedule", "retire_schedule", "assign_rota",
  "create_hold", "release_hold",
  "create_privacy_request", "request_privacy_identity", "verify_privacy_contact", "verify_privacy_request",
  "verify_privacy_manual", "start_privacy_review", "preview_privacy_request", "mark_privacy_ready",
  "review_disposition", "complete_privacy_request", "reject_privacy_request", "cancel_privacy_request",
  "execute_deletion",
  "create_complaint", "acknowledge_complaint", "resolve_complaint", "cancel_complaint",
  "create_incident", "acknowledge_incident", "update_incident_severity", "resolve_incident", "cancel_incident",
] as const
export type SettingsOperation = (typeof settingsOperations)[number]
export const settingsSections = [
  "account", "service", "guard", "templates", "privacy", "complaints", "incidents", "integrations", "system",
] as const
export type SettingsSection = (typeof settingsSections)[number]

export function isSettingKey(value: string | undefined): value is SettingKey {
  return !!value && (settingKeys as readonly string[]).includes(value)
}

export function isTemplateKey(value: string | undefined): value is SettingsTemplateKey {
  return !!value && (templateKeys as readonly string[]).includes(value)
}

export function isSettingsOperation(value: string | undefined): value is SettingsOperation {
  return !!value && (settingsOperations as readonly string[]).includes(value)
}

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return !!value && (settingsSections as readonly string[]).includes(value)
}

export function payloadLooksSecret(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload).toLowerCase()
  return Object.keys(payload).some(key => /(secret|token|password|api[_-]?key|stripe|webhook|sk_|otp|private)/i.test(key))
    || /(sk_live|sk_test|whsec_|begin [a-z]+ private key)/i.test(text)
}

export function serviceHoursPayload(start: string, end: string, weekendPolicy: "INCLUDED" | "EXCLUDED" = "EXCLUDED") {
  const days = weekendPolicy === "INCLUDED" ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]
  return {
    timezone: "Europe/London",
    weekendPolicy,
    bankHolidayPolicy: "INCLUDED",
    windows: days.map(day => ({ day, start, end })),
  }
}

export function responseTargetsPayload(enquiryHours: number, caseHours: number) {
  return {
    ENQUIRY_FIRST_RESPONSE: { hours: enquiryHours },
    CASE_FIRST_RESPONSE: { hours: caseHours },
  }
}

export function privacyDeletionEnabled(env: Record<string, string | undefined> = process.env) {
  return env.PRIVACY_DELETION_ENABLED === "true"
}

export function commandMessage(status?: string, reason?: string) {
  if (status === "reauth_required") return "For security, sign out and sign in with a new email code, then try again within five minutes."
  if (status === "conflict") return "That record changed. Refresh and try again."
  if (status === "denied" && reason === "legal_hold") return "A legal hold blocks deletion. Financial and audit records remain."
  if (status === "denied" && reason === "email_not_verified") return "Verify the customer’s current email before completing this request."
  if (status === "denied" && reason === "identity_unverified") return "Verify the requester’s identity before exporting or deleting data."
  if (status === "denied" && reason === "deletion_disabled") return "Physical deletion is disabled. Preview and review still work."
  if (status === "denied" && reason === "single_admin_only") return "Rota assignment can only use the current Admin account."
  if (status === "denied" && reason === "cross_customer") return "That identifier does not belong to this customer."
  if (status === "denied" && reason === "retention_required") return "Deletion needs an approved elapsed retention policy."
  if (status === "denied" && reason === "blocked_disposition") return "This request still has blocked or pending disposition work."
  if (status === "denied" && reason === "export_required") return "Download the reviewed export before completing an access or export request."
  if (status === "denied" && reason === "pending_disposition") return "Review every category before this request can move on."
  if (status === "denied" && reason === "review_required") return "Review the proposed dispositions before this request can move on."
  if (status === "denied" && reason === "preview_required") return "Refresh the preview before reviewing or deleting anything."
  if (status === "denied" && reason === "external_deletion") return "Stored evidence still needs external deletion. That work is not available yet."
  if (status === "denied" && reason === "not_ready") return "Finish the review and mark the request ready first."
  if (status === "denied") return "That request is not allowed."
  if (reason === "retroactive_effective_from") return "Settings cannot start in the past. Historical obligations stay unchanged."
  if (reason === "overlapping_approved_retention") return "That retention version overlaps an approved period for the same category."
  if (reason === "overlapping_approved_settings") return "That version overlaps an approved period for the same setting."
  if (reason === "meaningful_resolution_required") return "Write a resolution that explains what was done."
  if (status === "unauthorized") return "Please sign in again."
  if (status === "invalid") return "Check the form. Secrets cannot be stored in settings."
  return "Saved."
}
