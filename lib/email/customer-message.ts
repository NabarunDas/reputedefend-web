import {
  brandAssets,
  brandColors,
  brandName,
  brandSiteUrl,
  brandTagline,
  logoSize,
} from "../brand"

const EMAIL_LOGO_WIDTH = 180
const EMAIL_LOGO_HEIGHT = Math.round((EMAIL_LOGO_WIDTH * logoSize.height) / logoSize.width)
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const customerEmailLogoUrl = `${brandSiteUrl}${brandAssets.horizontal.dark}`

export const customerEmailSecurityNote =
  "For your security, please never share passwords, verification codes or sign-in credentials."

const actionUrlPattern = /^https:\/\/[A-Za-z0-9.-]+\/action\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const portalPaymentsPattern = /^https:\/\/[A-Za-z0-9.-]+\/portal\/cases\/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}\/payments$/

export type CustomerEmailBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; title?: string; items: string[] }
  | { type: "button"; label: string; url: string }

export type CustomerEmailContent = {
  title: string
  blocks: CustomerEmailBlock[]
  caseRef?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function safeText(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= 2000 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)
}

export function trustedActionUrl(value: string): boolean {
  return actionUrlPattern.test(value) && !value.includes("#") && !value.includes("?")
}

/** An action URL, or the authenticated case Payments page. No query, fragment, or token. */
export function trustedCustomerLink(value: string): boolean {
  if (value.includes("#") || value.includes("?") || value.includes("#t=")) return false
  return trustedActionUrl(value) || portalPaymentsPattern.test(value)
}

function blockText(block: CustomerEmailBlock): string | null {
  if (block.type === "paragraph" || block.type === "heading") {
    return safeText(block.text) ? block.text.trim() : null
  }
  if (block.type === "list") {
    if (block.items.length === 0 || block.items.length > 20) return null
    if (block.title && !safeText(block.title)) return null
    if (block.items.some(item => !safeText(item))) return null
    const title = block.title?.trim()
    const lines = block.items.map(item => `- ${item.trim()}`)
    return title ? `${title}\n${lines.join("\n")}` : lines.join("\n")
  }
  if (!safeText(block.label) || !trustedCustomerLink(block.url)) return null
  return `${block.label.trim()}\n${block.url}`
}

function blockHtml(block: CustomerEmailBlock): string | null {
  const forest = brandColors.forest
  const green = brandColors.green
  if (block.type === "paragraph") {
    if (!safeText(block.text)) return null
    return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${forest};">${escapeHtml(block.text.trim())}</p>`
  }
  if (block.type === "heading") {
    if (!safeText(block.text)) return null
    return `<h2 style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${forest};">${escapeHtml(block.text.trim())}</h2>`
  }
  if (block.type === "list") {
    if (block.items.length === 0 || block.items.some(item => !safeText(item))) return null
    if (block.title && !safeText(block.title)) return null
    const title = block.title
      ? `<h2 style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${forest};">${escapeHtml(block.title.trim())}</h2>`
      : ""
    const items = block.items.map(item => `<li style="margin:0 0 6px 0;">${escapeHtml(item.trim())}</li>`).join("")
    return `${title}<ul style="margin:0 0 16px 0;padding:0 0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${forest};">${items}</ul>`
  }
  if (!safeText(block.label) || !trustedCustomerLink(block.url)) return null
  const label = escapeHtml(block.label.trim())
  const url = escapeHtml(block.url)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:collapse;"><tr><td bgcolor="${green}" style="border-radius:4px;background-color:${green};"><a href="${url}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:#ffffff;background-color:${green};text-decoration:none;">${label}</a></td></tr></table>`
}

/**
 * Email-client HTML and the matching plain-text alternative.
 * Button addresses must already be server-generated action URLs or the case Payments page, with no token.
 */
export function renderCustomerEmail(content: CustomerEmailContent): { html: string; text: string } | null {
  if (!safeText(content.title)) return null
  const textBlocks: string[] = []
  const htmlBlocks: string[] = []
  for (const block of content.blocks) {
    const text = blockText(block)
    const html = blockHtml(block)
    if (!text || !html) return null
    textBlocks.push(text)
    htmlBlocks.push(html)
  }
  const caseRef = content.caseRef?.trim() || ""
  if (caseRef && !safeText(caseRef)) return null
  const siteHost = new URL(brandSiteUrl).hostname
  const text = [
    brandName,
    content.title.trim(),
    ...textBlocks,
    caseRef ? `Case reference: ${caseRef}` : "",
    brandSiteUrl,
    customerEmailSecurityNote,
  ].filter(Boolean).join("\n\n")

  const forest = brandColors.forest
  const green = brandColors.green
  const paper = brandColors.paper
  const muted = brandColors.muted
  const mist = brandColors.mist
  const title = escapeHtml(content.title.trim())
  const logo = escapeHtml(customerEmailLogoUrl)
  const brand = escapeHtml(brandName)
  const tagline = escapeHtml(brandTagline)
  const site = escapeHtml(brandSiteUrl)
  const host = escapeHtml(siteHost)
  const security = escapeHtml(customerEmailSecurityNote)
  const reference = caseRef
    ? `<p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:${muted};">Case reference: ${escapeHtml(caseRef)}</p>`
    : ""

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
@media only screen and (max-width:620px){
  .email-container{width:100%!important;}
  .email-pad{padding-left:20px!important;padding-right:20px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${paper};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${mist};border-collapse:collapse;">
        <tr>
          <td class="email-pad" style="padding:28px 36px 8px 36px;background-color:#ffffff;">
            <img src="${logo}" alt="${brand}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" style="display:block;width:${EMAIL_LOGO_WIDTH}px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;" />
            <p style="margin:8px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${forest};">${brand}</p>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:12px 36px 8px 36px;font-family:${FONT};">
            <h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:700;color:${forest};">${title}</h1>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:16px 36px 8px 36px;">
            ${htmlBlocks.join("\n")}
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:20px 36px 28px 36px;border-top:1px solid ${mist};font-family:${FONT};background-color:${paper};">
            ${reference}
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;font-weight:700;color:${forest};">${brand}</p>
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:${muted};">${tagline}</p>
            <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;"><a href="${site}" style="color:${green};text-decoration:underline;">${host}</a></p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:${muted};">${security}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
  return { html, text }
}
