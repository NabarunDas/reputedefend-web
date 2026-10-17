const actionUrl = /https:\/\/[A-Za-z0-9.-]+\/action\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * The approval preview may show only the HTML and plain text stored for this
 * version. A missing snapshot, a secret upload token, or a link that differs
 * between the two formats is not a preview of the email being approved.
 */
export function trustedEmailSnapshot(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
): { text: string; html: string } | null {
  if (!bodyText || !bodyHtml) return null
  if (bodyText.includes("#t=") || bodyHtml.includes("#t=")) return null
  if (/<\s*(script|iframe|object|embed)\b|javascript:|data:text\/html|\son[a-z]+\s*=/i.test(bodyHtml)) return null
  const textUrls = bodyText.match(actionUrl) ?? []
  const htmlUrls = bodyHtml.match(actionUrl) ?? []
  if (textUrls.length > 1 || htmlUrls.length > 1) return null
  if ((textUrls[0] ?? null) !== (htmlUrls[0] ?? null)) return null
  return { text: bodyText, html: bodyHtml }
}
