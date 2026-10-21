const actionUrlPattern = "https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

function actionUrls(body: string): string[] {
  return body.match(new RegExp(actionUrlPattern, "gi")) ?? []
}

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
  const textUrls = actionUrls(bodyText)
  const htmlUrls = actionUrls(bodyHtml)
  if (textUrls.length > 1 || htmlUrls.length > 1) return null
  if ((textUrls[0] ?? null) !== (htmlUrls[0] ?? null)) return null
  return { text: bodyText, html: bodyHtml }
}

/**
 * An evidence-request send may carry one upload URL, and the plain-text and
 * HTML copies must both be that URL. A missing HTML copy, a second action
 * URL, or a different host in either copy is not sent.
 */
export function evidenceBodiesSharePortal(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
  origin: string | null | undefined,
  actionId: string | null | undefined,
): boolean {
  if (!bodyText || !bodyHtml || !origin || !actionId) return false
  if (bodyText.includes("#t=") || bodyHtml.includes("#t=")) return false
  const expected = `${origin}/action/${actionId}`
  const textUrls = actionUrls(bodyText)
  const htmlUrls = actionUrls(bodyHtml)
  return textUrls.length === 1 && htmlUrls.length === 1 && textUrls[0] === expected && htmlUrls[0] === expected
}
