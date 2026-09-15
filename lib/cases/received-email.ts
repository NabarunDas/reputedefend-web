import { formattedFromAddress } from "@/lib/enquiry-config"
import {
  brandAssets,
  brandColors,
  brandName,
  brandSiteUrl,
  brandTagline,
  logoSize,
} from "@/lib/brand"
import { caseTypeLabel, type CaseType } from "@/lib/cases/domain"
import { caseServiceLabel, type EnquiryInput } from "@/lib/enquiry"
import { escapeHtml } from "@/lib/enquiry-email"
import type { EnquiryEmailMessage } from "@/lib/enquiry-provider"

function brandedSubject(rest: string) {
  return `[${brandName}] ${rest}`
}

function compact(value: string) {
  return value.replaceAll(/\s+/g, " ").trim().slice(0, 80)
}

const EMAIL_LOGO_WIDTH = 180
const EMAIL_LOGO_HEIGHT = Math.round((EMAIL_LOGO_WIDTH * logoSize.height) / logoSize.width)

export function caseReceivedCustomerLogoUrl() {
  return `${brandSiteUrl}${brandAssets.horizontal.dark}`
}

type CustomerReceiptCopy = {
  serviceName: string
  heading: string
  greeting: string
  intro: string
  caseRefLabel: string
  publicRef: string
  caseRefNote: string
  nextHeading: string
  nextBody: string
  securityHeading: string
  securityBody: string
  reply: string
  siteHost: string
}

function customerReceiptCopy(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
): CustomerReceiptCopy {
  const serviceName = caseTypeLabel(caseType)
  return {
    serviceName,
    heading: `We've received your ${serviceName} assessment`,
    greeting: `Hi ${data.fullName},`,
    intro: `Thanks for sending us the details about ${data.businessName}. Your ${serviceName} assessment has been received and is ready for human review.`,
    caseRefLabel: "Your case reference",
    publicRef,
    caseRefNote:
      "Please keep this reference. We'll use it in future correspondence about this case.",
    nextHeading: "What happens next",
    nextBody: `A ${brandName} specialist will review the information you submitted. If we need clarification or additional evidence, we'll contact you by email.`,
    securityHeading: "Security reminder",
    securityBody: `${brandName} will never ask you for your Google password, one-time password, verification code or security answers.`,
    reply:
      "If you need to add something to your case, simply reply to this email and keep your case reference in the subject.",
    siteHost: new URL(brandSiteUrl).hostname,
  }
}

export function caseReceivedCustomerSubject(caseType: CaseType, publicRef: string) {
  return brandedSubject(`We've received your ${caseTypeLabel(caseType)} case — ${publicRef}`)
}

export function caseReceivedCustomerText(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
) {
  const copy = customerReceiptCopy(data, caseType, publicRef)
  return [
    copy.greeting,
    copy.intro,
    `${copy.caseRefLabel}\n\n${copy.publicRef}\n\n${copy.caseRefNote}`,
    `${copy.nextHeading}\n\n${copy.nextBody}`,
    `${copy.securityHeading}\n\n${copy.securityBody}`,
    copy.reply,
    `Regards,\n\n${brandName}\n${brandTagline}\n${brandSiteUrl}`,
  ].join("\n\n")
}

export function caseReceivedCustomerHtml(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
) {
  const copy = customerReceiptCopy(data, caseType, publicRef)
  const logoUrl = caseReceivedCustomerLogoUrl()
  const forest = brandColors.forest
  const green = brandColors.green
  const lime = brandColors.lime
  const paper = brandColors.paper
  const muted = brandColors.muted
  const mist = brandColors.mist
  const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const heading = escapeHtml(copy.heading)
  const greeting = escapeHtml(copy.greeting)
  const intro = escapeHtml(copy.intro)
  const caseRefLabel = escapeHtml(copy.caseRefLabel)
  const escapedRef = escapeHtml(copy.publicRef)
  const caseRefNote = escapeHtml(copy.caseRefNote)
  const nextHeading = escapeHtml(copy.nextHeading)
  const nextBody = escapeHtml(copy.nextBody)
  const securityHeading = escapeHtml(copy.securityHeading)
  const securityBody = escapeHtml(copy.securityBody)
  const reply = escapeHtml(copy.reply)
  const escapedBrand = escapeHtml(brandName)
  const escapedTagline = escapeHtml(brandTagline)
  const escapedSiteUrl = escapeHtml(brandSiteUrl)
  const escapedSiteHost = escapeHtml(copy.siteHost)
  const escapedLogoUrl = escapeHtml(logoUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${paper};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${mist};border-collapse:collapse;">
        <tr>
          <td style="padding:28px 36px 16px 36px;background-color:#ffffff;">
            <img src="${escapedLogoUrl}" alt="${escapedBrand}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" style="display:block;width:${EMAIL_LOGO_WIDTH}px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
        <tr>
          <td style="padding:8px 36px 8px 36px;font-family:${fontStack};">
            <h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:700;color:${forest};">${heading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 36px 8px 36px;font-family:${fontStack};font-size:16px;line-height:1.6;color:${forest};">
            <p style="margin:0 0 14px 0;">${greeting}</p>
            <p style="margin:0;">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="case-reference-panel" style="width:100%;border-collapse:collapse;background-color:${lime};border:1px solid ${green};">
              <tr>
                <td style="padding:18px 20px;font-family:${fontStack};text-align:left;">
                  <p style="margin:0 0 8px 0;font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:${green};">${caseRefLabel}</p>
                  <p style="margin:0;font-size:24px;line-height:1.3;letter-spacing:0.08em;font-weight:700;color:${forest};">${escapedRef}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 36px 8px 36px;font-family:${fontStack};font-size:15px;line-height:1.6;color:${muted};">
            <p style="margin:0;">${caseRefNote}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px 36px;font-family:${fontStack};color:${forest};">
            <h2 style="margin:0 0 10px 0;font-size:16px;line-height:1.4;font-weight:700;color:${forest};">${nextHeading}</h2>
            <p style="margin:0;font-size:16px;line-height:1.6;">${nextBody}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="security-reminder-panel" style="width:100%;border-collapse:collapse;background-color:${paper};border:1px solid ${lime};">
              <tr>
                <td style="padding:16px 18px;font-family:${fontStack};color:${forest};">
                  <h2 style="margin:0 0 8px 0;font-size:15px;line-height:1.4;font-weight:700;color:${green};">${securityHeading}</h2>
                  <p style="margin:0;font-size:15px;line-height:1.6;color:${forest};">${securityBody}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px 36px;font-family:${fontStack};font-size:16px;line-height:1.6;color:${forest};">
            <p style="margin:0;">${reply}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 36px 32px 36px;font-family:${fontStack};font-size:16px;line-height:1.6;color:${forest};">
            <p style="margin:0 0 14px 0;">Regards,</p>
            <p style="margin:0;font-weight:700;">${escapedBrand}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 28px 36px;border-top:1px solid ${mist};font-family:${fontStack};text-align:left;background-color:${paper};">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;font-weight:700;color:${forest};">${escapedBrand}</p>
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:${muted};">${escapedTagline}</p>
            <p style="margin:0;font-size:13px;line-height:1.5;">
              <a href="${escapedSiteUrl}" style="color:${green};text-decoration:underline;">${escapedSiteHost}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export function buildCaseReceivedCustomerMessage(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  fromEmail: string,
  recipient: string = data.email,
): EnquiryEmailMessage {
  return {
    kind: "customer-ack",
    from: formattedFromAddress(fromEmail),
    to: recipient,
    replyTo: fromEmail,
    subject: caseReceivedCustomerSubject(caseType, publicRef),
    text: caseReceivedCustomerText(data, caseType, publicRef),
    html: caseReceivedCustomerHtml(data, caseType, publicRef),
  }
}

export function caseReceivedInternalSubject(
  caseType: CaseType,
  publicRef: string,
  businessName: string,
) {
  return brandedSubject(`New ${caseTypeLabel(caseType)} case — ${publicRef} — ${compact(businessName) || "Business"}`)
}

export function caseReceivedInternalText(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  submittedAt: Date,
) {
  const rows: Array<[string, string]> = [
    ["Case reference", publicRef],
    ["Service", caseTypeLabel(caseType)],
    ["Form route", caseServiceLabel(data.service)],
    ["Name", data.fullName],
    ["Email", data.email],
  ]
  if (data.phone) rows.push(["Phone", data.phone])
  rows.push(["Business", data.businessName], ["Country", data.country])
  if (data.websiteUrl) rows.push(["Website", data.websiteUrl])
  if (data.businessProfileUrl) rows.push(["Business Profile URL", data.businessProfileUrl])
  if (data.reviewUrl) rows.push(["Review URL", data.reviewUrl])
  rows.push(["Case description", data.details], ["Submitted", submittedAt.toISOString()])
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n\n")
}

export function caseReceivedInternalHtml(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  submittedAt: Date,
) {
  const items = caseReceivedInternalText(data, caseType, publicRef, submittedAt)
    .split("\n\n")
    .map((row) => {
      const index = row.indexOf(": ")
      const label = index === -1 ? "Detail" : row.slice(0, index)
      const value = index === -1 ? row : row.slice(index + 2)
      return `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`
    })
    .join("")
  return `<div>${items}</div>`
}

export function buildCaseReceivedInternalMessage(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  fromEmail: string,
  toEmail: string,
  extraReplyTo: string | undefined,
  submittedAt: Date,
): EnquiryEmailMessage {
  const replyTo = extraReplyTo && extraReplyTo.toLowerCase() !== data.email.toLowerCase()
    ? [data.email, extraReplyTo]
    : data.email
  return {
    kind: "internal",
    from: formattedFromAddress(fromEmail),
    to: toEmail,
    replyTo,
    subject: caseReceivedInternalSubject(caseType, publicRef, data.businessName),
    text: caseReceivedInternalText(data, caseType, publicRef, submittedAt),
    html: caseReceivedInternalHtml(data, caseType, publicRef, submittedAt),
  }
}
