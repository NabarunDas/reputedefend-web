const mailboxPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The operator sets this only after confirming the mailbox is monitored. */
export const replyMailboxConfirmation = "monitored"

export function validReplyMailbox(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase() ?? ""
  if (!raw || raw.length > 254 || !mailboxPattern.test(raw)) return null
  return raw
}

/**
 * A Reply-To address is snapshotted only when both settings are present.
 * The mailbox variable on its own is not evidence that anyone reads the mail.
 * An Admin sign-in address is not read here and is not treated as a mailbox.
 */
export function confirmedReplyMailbox(env: Record<string, string | undefined> = process.env): string | null {
  if (env.COMMUNICATIONS_REPLY_TO_CONFIRMED?.trim() !== replyMailboxConfirmation) return null
  return validReplyMailbox(env.COMMUNICATIONS_REPLY_TO_EMAIL)
}

export function monitoredReplyMailbox(): string | null {
  return confirmedReplyMailbox()
}
