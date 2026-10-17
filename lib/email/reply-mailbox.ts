const mailboxPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A Reply-To address is used only when this setting names one mailbox.
 * An Admin sign-in address and the outbound From address are not assumed
 * to be monitored.
 */
export function monitoredReplyMailbox(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.COMMUNICATIONS_REPLY_TO_EMAIL?.trim() ?? ""
  if (!raw || raw.length > 254 || !mailboxPattern.test(raw)) return null
  return raw.toLowerCase()
}
