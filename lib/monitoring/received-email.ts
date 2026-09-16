import { formattedFromAddress } from "@/lib/enquiry-config"
import {
  brandAssets,
  brandColors,
  brandName,
  brandSiteUrl,
  brandTagline,
  logoSize,
} from "@/lib/brand"
import type { MonitoringIntakeSnapshot } from "@/lib/monitoring/snapshot"
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

export function monitoringReceivedCustomerLogoUrl() {
  return `${brandSiteUrl}${brandAssets.horizontal.dark}`
}

type CustomerCopy = {
  heading: string
  greeting: string
  intro: string
  businessLabel: string
  businessName: string
  locationsLabel: string
  locations: string
  nextHeading: string
  nextBody: string
  notActive: string
  securityHeading: string
  securityBody: string
  reply: string
  siteHost: string
}

function customerCopy(data: MonitoringIntakeSnapshot): CustomerCopy {
  return {
    heading: "We've received your Relaunch Guard setup request",
    greeting: `Hi ${data.fullName},`,
    intro: `Thanks for sending us the monitoring details for ${data.businessName}. We've received your Relaunch Guard setup request.`,
    businessLabel: "Business",
    businessName: data.businessName,
    locationsLabel: "Locations requested",
    locations: String(data.numberOfLocations),
    nextHeading: "What happens next",
    nextBody: `A ${brandName} specialist will review the setup details. If we need clarification, we'll contact you by email.`,
    notActive: "Monitoring is not active yet. We'll contact you with the next setup step before monitoring begins.",
    securityHeading: "Security reminder",
    securityBody: `${brandName} will never ask you for your Google password, one-time password, verification code or security answers.`,
    reply: "If you need to correct or add anything, simply reply to this email.",
    siteHost: new URL(brandSiteUrl).hostname,
  }
}

export function monitoringReceivedCustomerSubject() {
  return brandedSubject("We've received your Relaunch Guard setup request")
}

export function monitoringReceivedCustomerText(data: MonitoringIntakeSnapshot) {
  const copy = customerCopy(data)
  return [
    copy.greeting,
    copy.intro,
    `${copy.businessLabel}\n\n${copy.businessName}`,
    `${copy.locationsLabel}\n\n${copy.locations}`,
    `${copy.nextHeading}\n\n${copy.nextBody}`,
    copy.notActive,
    `${copy.securityHeading}\n\n${copy.securityBody}`,
    copy.reply,
    `Regards,\n\n${brandName}\n${brandTagline}\n${brandSiteUrl}`,
  ].join("\n\n")
}

export function monitoringReceivedCustomerHtml(data: MonitoringIntakeSnapshot) {
  const copy = customerCopy(data)
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
  const businessLabel = escapeHtml(copy.businessLabel)
  const businessName = escapeHtml(copy.businessName)
  const locationsLabel = escapeHtml(copy.locationsLabel)
  const locations = escapeHtml(copy.locations)
  const nextHeading = escapeHtml(copy.nextHeading)
  const nextBody = escapeHtml(copy.nextBody)
  const notActive = escapeHtml(copy.notActive)
  const securityHeading = escapeHtml(copy.securityHeading)
  const securityBody = escapeHtml(copy.securityBody)
  const reply = escapeHtml(copy.reply)
  const escapedBrand = escapeHtml(brandName)
  const escapedTagline = escapeHtml(brandTagline)
  const escapedSiteUrl = escapeHtml(brandSiteUrl)
  const escapedSiteHost = escapeHtml(copy.siteHost)
  const escapedLogoUrl = escapeHtml(monitoringReceivedCustomerLogoUrl())

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
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="setup-summary-panel" style="width:100%;border-collapse:collapse;background-color:${lime};border:1px solid ${green};">
              <tr>
                <td style="padding:18px 20px;font-family:${fontStack};text-align:left;">
                  <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:${green};">${businessLabel}</p>
                  <p style="margin:0 0 16px 0;font-size:18px;line-height:1.35;font-weight:700;color:${forest};">${businessName}</p>
                  <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:${green};">${locationsLabel}</p>
                  <p style="margin:0;font-size:18px;line-height:1.35;font-weight:700;color:${forest};">${locations}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px 8px 36px;font-family:${fontStack};color:${forest};">
            <h2 style="margin:0 0 10px 0;font-size:16px;line-height:1.4;font-weight:700;color:${forest};">${nextHeading}</h2>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;">${nextBody}</p>
            <p style="margin:0;font-size:16px;line-height:1.6;">${notActive}</p>
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

export function buildMonitoringReceivedCustomerMessage(
  data: MonitoringIntakeSnapshot,
  fromEmail: string,
  recipient: string,
): EnquiryEmailMessage {
  return {
    kind: "customer-ack",
    from: formattedFromAddress(fromEmail),
    to: recipient,
    replyTo: fromEmail,
    subject: monitoringReceivedCustomerSubject(),
    text: monitoringReceivedCustomerText(data),
    html: monitoringReceivedCustomerHtml(data),
  }
}

export function monitoringReceivedInternalSubject(businessName: string) {
  return brandedSubject(`New Relaunch Guard setup request — ${compact(businessName) || "Business"}`)
}

export function monitoringReceivedInternalText(
  data: MonitoringIntakeSnapshot,
  submittedAt: Date,
  monitoringRequestId?: string,
) {
  const rows: Array<[string, string]> = [
    ["Request type", "Relaunch Guard"],
    ["Status", "REQUESTED"],
  ]
  if (monitoringRequestId) rows.push(["Monitoring request ID", monitoringRequestId])
  rows.push(
    ["Name", data.fullName],
    ["Email", data.email],
  )
  if (data.phone) rows.push(["Phone", data.phone])
  rows.push(
    ["Business", data.businessName],
    ["Country", data.country],
  )
  if (data.websiteUrl) rows.push(["Website", data.websiteUrl])
  rows.push(
    ["Business Profile URL", data.businessProfileUrl],
    ["Number of locations", String(data.numberOfLocations)],
    ["Submitted", submittedAt.toISOString()],
  )
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n\n")
}

export function monitoringReceivedInternalHtml(
  data: MonitoringIntakeSnapshot,
  submittedAt: Date,
  monitoringRequestId?: string,
) {
  const items = monitoringReceivedInternalText(data, submittedAt, monitoringRequestId)
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

export function buildMonitoringReceivedInternalMessage(
  data: MonitoringIntakeSnapshot,
  fromEmail: string,
  toEmail: string,
  extraReplyTo: string | undefined,
  submittedAt: Date,
  monitoringRequestId?: string,
): EnquiryEmailMessage {
  const replyTo = extraReplyTo && extraReplyTo.toLowerCase() !== data.email.toLowerCase()
    ? [data.email, extraReplyTo]
    : data.email
  return {
    kind: "internal",
    from: formattedFromAddress(fromEmail),
    to: toEmail,
    replyTo,
    subject: monitoringReceivedInternalSubject(data.businessName),
    text: monitoringReceivedInternalText(data, submittedAt, monitoringRequestId),
    html: monitoringReceivedInternalHtml(data, submittedAt, monitoringRequestId),
  }
}
