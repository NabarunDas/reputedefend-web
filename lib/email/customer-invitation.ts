import { legalIdentity } from "../legal"
import { renderCustomerEmail } from "./customer-message"

export const customerInvitationSubject = "Your ProfileRelaunch Customer Portal invitation"

const referencePattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const originPattern = /^https:\/\/[A-Za-z0-9.-]+$/

export function composeCustomerInvitationEmail(input: {
  origin: string
  reference?: string | null
}): { subject: string; text: string; html: string } | null {
  if (!originPattern.test(input.origin)) return null
  const reference = input.reference?.trim() || ""
  if (reference && !referencePattern.test(reference)) return null
  const rendered = renderCustomerEmail({
    title: "Your Customer Portal invitation",
    blocks: [
      { type: "paragraph", text: "Telloya — a ProfileRelaunch company has invited you to the Customer Portal." },
      {
        type: "paragraph",
        text: `${legalIdentity.legalName} operates the Customer Portal. This invitation does not start a subscription, take a payment, or activate Telloya or Guard.`,
      },
      {
        type: "paragraph",
        text: "Open your invitation, then enter the verification code sent to this email address. The link expires and works once.",
      },
      ...(reference ? [{ type: "paragraph" as const, text: `Reference: ${reference}` }] : []),
      { type: "button", label: "Open your invitation", url: `${input.origin}/login/invite/ready` },
    ],
  })
  if (!rendered) return null
  return { subject: customerInvitationSubject, text: rendered.text, html: rendered.html }
}
