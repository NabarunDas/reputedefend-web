import {
  CASE_SERVICES,
  CONTACT_SUBJECTS,
  GENERAL_SERVICE_OPTIONS,
  caseServiceLabel,
  type EnquiryInput,
} from "@/lib/enquiry"

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function compactSubjectPart(value: string) {
  return value.replaceAll(/\s+/g, " ").trim().slice(0, 80)
}

function sourceLabel(source: EnquiryInput["source"]) {
  if (source === "get-help") return "Get Help"
  if (source === "contact") return "Contact"
  return "Homepage"
}

function contactSubjectLabel(data: EnquiryInput) {
  return CONTACT_SUBJECTS.find((item) => item.value === data.subject)?.label
    ?? GENERAL_SERVICE_OPTIONS.find((item) => item.value === data.service)?.label
    ?? (data.subject || caseServiceLabel(data.service) || "General enquiry")
}

export function enquiryEmailSubject(data: EnquiryInput) {
  if (data.source === "get-help") {
    const business = compactSubjectPart(data.businessName) || "Business"
    if (data.service === "profile-recovery") return `[ReputeDefend] New Profile Recovery case — ${business}`
    if (data.service === "review-protection") return `[ReputeDefend] New Review Protection case — ${business}`
    if (data.service === "profile-access") return `[ReputeDefend] New Profile / Access case — ${business}`
    return `[ReputeDefend] New case enquiry — ${business}`
  }

  if (data.source === "contact") {
    return `[ReputeDefend] General enquiry — ${compactSubjectPart(contactSubjectLabel(data))}`
  }

  const service = GENERAL_SERVICE_OPTIONS.find((item) => item.value === data.service)?.label
    ?? CASE_SERVICES.find((item) => item.value === data.service)?.label
    ?? "General enquiry"
  return `[ReputeDefend] General enquiry — ${compactSubjectPart(service)}`
}

type EmailRow = { label: string; value: string }

function rowsForEnquiry(data: EnquiryInput, submittedAt: Date): EmailRow[] {
  const rows: EmailRow[] = [{ label: "Source", value: sourceLabel(data.source) }]

  if (data.source === "get-help") {
    rows.push(
      { label: "Service type", value: caseServiceLabel(data.service) },
      { label: "Name", value: data.fullName },
      { label: "Email", value: data.email },
    )
    if (data.phone) rows.push({ label: "Phone", value: data.phone })
    rows.push(
      { label: "Business", value: data.businessName },
      { label: "Country", value: data.country },
    )
    if (data.websiteUrl) rows.push({ label: "Website", value: data.websiteUrl })
    if (data.businessProfileUrl) rows.push({ label: "Business Profile URL", value: data.businessProfileUrl })
    if (data.reviewUrl) rows.push({ label: "Review URL", value: data.reviewUrl })
    rows.push(
      { label: "Case description", value: data.details },
      { label: "Accuracy confirmation", value: data.informationAccurate ? "Yes" : "No" },
      { label: "Privacy acknowledgement", value: data.privacyAccepted ? "Yes" : "No" },
    )
  } else if (data.source === "contact") {
    rows.push(
      { label: "Subject", value: contactSubjectLabel(data) },
      { label: "Name", value: data.fullName },
      { label: "Email", value: data.email },
    )
    if (data.businessName) rows.push({ label: "Business", value: data.businessName })
    rows.push({ label: "Message", value: data.details })
  } else {
    rows.push(
      { label: "Enquiry type", value: GENERAL_SERVICE_OPTIONS.find((item) => item.value === data.service)?.label ?? caseServiceLabel(data.service) },
      { label: "Name", value: data.fullName },
      { label: "Email", value: data.email },
    )
    if (data.businessName) rows.push({ label: "Business", value: data.businessName })
    rows.push({ label: "Details", value: data.details })
  }

  rows.push({ label: "Submitted", value: submittedAt.toISOString() })
  return rows
}

export function enquiryEmailText(data: EnquiryInput, submittedAt: Date) {
  return rowsForEnquiry(data, submittedAt)
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n\n")
}

export function enquiryEmailHtml(data: EnquiryInput, submittedAt: Date) {
  const items = rowsForEnquiry(data, submittedAt)
    .map((row) => `<p><strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.value).replaceAll("\n", "<br>")}</p>`)
    .join("")
  return `<div>${items}</div>`
}

export function customerAcknowledgementSubject() {
  return "[ReputeDefend] We have received your enquiry"
}

export function customerAcknowledgementText() {
  return [
    "We have received your enquiry and will review it.",
    "Submitting a form does not, by itself, create a client or paid-service relationship.",
    "If a response is appropriate, we will reply using the email address you provided.",
  ].join("\n\n")
}

export function customerAcknowledgementHtml() {
  return `<div>${customerAcknowledgementText().split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`
}
