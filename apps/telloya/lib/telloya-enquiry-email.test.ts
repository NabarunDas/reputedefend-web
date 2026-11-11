import { describe, expect, it } from "vitest"
import {
  telloyaCustomerAcknowledgementHtml,
  telloyaCustomerAcknowledgementSubject,
  telloyaCustomerAcknowledgementText,
} from "./telloya-enquiry-email"

const reference = "TY-26-PU72QR"

function referenceCount(value: string) {
  return value.match(new RegExp(reference, "g")) ?? []
}

describe("Telloya customer acknowledgement", () => {
  it("keeps a personalised demo short, with the reference once and the appointment boundary", () => {
    const text = telloyaCustomerAcknowledgementText(reference, "personalised-demo")
    const html = telloyaCustomerAcknowledgementHtml(reference, "personalised-demo")
    const subject = telloyaCustomerAcknowledgementSubject(reference, "personalised-demo")

    expect(subject).toBe(`[Telloya] Your demo request is in — ${reference}`)
    expect(text).toContain("Your demo request is in!")
    expect(text).toContain("We've received your request for a personalised Telloya demonstration.")
    expect(text).toContain("What happens next?")
    expect(text).toContain("We'll review your requirements and get in touch to arrange your personalised demo call.")
    expect(text).toContain("Requesting a demonstration does not confirm an appointment.")
    expect(text).toContain(`Your reference: ${reference}`)
    expect(referenceCount(text)).toEqual([reference])
    expect(text).toContain("Telloya")
    expect(text).toContain("https://telloya.com")
    expect(html).toContain("AI Receptionist — operated by ProfileRelaunch Ltd")
    expect(text).not.toContain("AI receptionist service designed")
    expect(text).not.toContain("does not, by itself, create a client relationship")
    expect(text).not.toContain("has been delivered")

    expect(html).toContain("<h1")
    expect(html).toContain("Your demo request is in!")
    expect(html).toContain("<h2")
    expect(html).toContain("What happens next?")
    expect(html).toContain("Requesting a demonstration does not confirm an appointment.")
    expect(html).toContain(`Your reference: ${reference}`)
    expect(html).toContain("telloya.com")
    expect(html).toContain("email-container")
    expect(html).toContain("max-width:620px")
    expect(referenceCount(html)).toEqual([reference])
    expect(html).not.toContain("AI receptionist service designed")
  })

  it("uses the concise general enquiry acknowledgement", () => {
    const text = telloyaCustomerAcknowledgementText(reference)
    const html = telloyaCustomerAcknowledgementHtml(reference)
    const subject = telloyaCustomerAcknowledgementSubject(reference)

    expect(subject).toBe(`[Telloya] Your enquiry is in — ${reference}`)
    expect(text).toContain("Your enquiry is in!")
    expect(text).toContain("Thanks for your interest in Telloya. We've received your enquiry and will review your requirements. Our team will get in touch to discuss the next steps.")
    expect(text).toContain(`Your reference: ${reference}`)
    expect(referenceCount(text)).toEqual([reference])
    expect(text).toContain("https://telloya.com")
    expect(text).not.toContain("personalised Telloya demonstration")
    expect(text).not.toContain("What happens next?")
    expect(text).not.toContain("AI receptionist service designed")
    expect(text).not.toContain("does not, by itself, create a client relationship")
    expect(html).toContain("Your enquiry is in!")
    expect(html).toContain(`Your reference: ${reference}`)
    expect(html).toContain("ProfileRelaunch Ltd")
    expect(referenceCount(html)).toEqual([reference])
  })
})
