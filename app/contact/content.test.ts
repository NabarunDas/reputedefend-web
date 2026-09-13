import { describe, expect, it } from "vitest"
import { brandName } from "@/lib/brand"
import { CONTACT_SUBJECTS } from "@/lib/enquiry"
import { legalIdentity } from "@/lib/legal"
import {
  contactBanner,
  contactClose,
  contactHelpHref,
  contactHero,
  contactIdentity,
  contactPrivacyHref,
  contactProcess,
  contactRoutes,
  contactSeo,
  contactTrust,
} from "./content"

const copy = JSON.stringify({
  contactBanner,
  contactClose,
  contactHero,
  contactIdentity,
  contactProcess,
  contactRoutes,
  contactSeo,
  contactTrust,
}).toLowerCase()

describe("Contact page copy", () => {
  it("positions Contact as general enquiries and Get Help as active cases", () => {
    expect(contactSeo.titlePage).toBe("Contact ProfileRelaunch — General Enquiries")
    expect(contactSeo.description.toLowerCase()).toContain("general question")
    expect(contactSeo.description.toLowerCase()).toContain("get help")
    expect(contactHero.eyebrow).toBe("Contact ProfileRelaunch")
    expect(contactHero.title).toBe("Have a question before you start?")
    expect(contactHero.lead.toLowerCase()).toContain("general questions")
    expect(contactHero.lead.toLowerCase()).toContain("get help")
    expect(contactHero.assessmentCta).toBe("Start an active case assessment")
    expect(contactHero.assessmentHref).toBe("/get-help")
    expect(contactHelpHref).toBe("/get-help")
    expect(contactRoutes.eyebrow.toLowerCase()).toContain("which route")
    expect(contactRoutes.general.status).toBe("Stay here")
    expect(contactRoutes.general.title).toBe("General question")
    expect(contactRoutes.active.status).toBe("Use Get Help")
    expect(contactRoutes.active.title).toBe("Active Google issue")
    expect(contactRoutes.active.cta).toBe("Start your assessment")
    expect(contactRoutes.active.href).toBe("/get-help")
    expect(contactBanner.title.toLowerCase()).toContain("active google issue")
    expect(contactBanner.cta).toBe("Start your assessment")
    expect(contactBanner.href).toBe("/get-help")
    expect(contactClose.cta).toBe("Start your assessment")
    expect(contactClose.href).toBe("/get-help")
    expect(copy).not.toMatch(/get emergency help|urgent recovery|fix my listing now|open a ticket|book consultation/)
  })

  it("keeps the operator UK-based and the service international", () => {
    expect(contactIdentity.positioning).toContain(brandName)
    expect(contactIdentity.positioning).toMatch(/UK-based/i)
    expect(contactIdentity.positioning.toLowerCase()).toContain("internationally")
    expect(contactTrust.join(" ")).toMatch(/UK-based/i)
    expect(contactTrust.join(" ").toLowerCase()).toContain("global")
    expect(copy).not.toMatch(/for uk businesses|uk businesses only|uk-only|uk customers only|serving only the uk/)
    expect(contactSeo.description.toLowerCase()).not.toMatch(/uk-only|for uk businesses|uk customers/)
    expect(contactSeo.description.toLowerCase()).not.toContain("united kingdom only")
  })

  it("keeps the verified public contact mailbox and does not invent a new one", () => {
    expect(contactIdentity.emailLabel).toBe("Prefer email?")
    expect(contactIdentity.email).toBe(legalIdentity.contactEmail)
    expect(contactIdentity.email).toBe("contact@reputedefend.com")
    expect(copy).not.toContain("contact@profilerelaunch.com")
    expect(contactPrivacyHref).toBe("/privacy")
  })

  it("explains what happens next without promising a response time", () => {
    expect(contactProcess.steps.map((step) => `${step.n} ${step.title}`)).toEqual([
      "01 We review your message",
      "02 We identify the right route",
      "03 We reply or point you to the appropriate next step",
    ])
    expect(copy).not.toMatch(/within 24 hours|same day|one business day|within 1 hour/)
    expect(copy).not.toMatch(/independent of google/)
  })

  it("does not turn Contact into a second intake funnel", () => {
    expect(CONTACT_SUBJECTS.map((item) => item.value)).toEqual([
      "general-question",
      "service-question",
      "partnership",
      "media",
      "something-else",
    ])
    expect(copy).not.toMatch(/active profile suspension|submit a case|guided or managed|google credentials/)
    expect(contactRoutes.general.examples.join(" ").toLowerCase()).toContain("partnership")
    expect(contactRoutes.active.examples.join(" ").toLowerCase()).toContain("suspension")
  })
})
