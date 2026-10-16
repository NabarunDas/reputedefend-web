const unsafe = /[<>]|#t=|https?:\/\/|javascript:|data:|www\./i

/** Plain subject and message. The upload link is never part of this text. */
export function evidenceWording(subject: string, message: string): { subject: string; message: string } | null {
  const nextSubject = subject.trim()
  const nextMessage = message.trim()
  if (nextSubject.length < 1 || nextSubject.length > 200) return null
  if (nextMessage.length < 20 || nextMessage.length > 4000) return null
  if (/[\u0000-\u001F]/.test(nextSubject)) return null
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(nextMessage)) return null
  if (unsafe.test(nextSubject) || unsafe.test(nextMessage)) return null
  return { subject: nextSubject, message: nextMessage }
}
