import { describe, expect, it } from "vitest"
import {
  guardClose,
  guardCoverage,
  guardFaqTitle,
  guardFaqs,
  guardHero,
  guardIncluded,
  guardIntervention,
  guardSchedule,
  guardSeo,
  guardSetup,
} from "./content"
import { guardOffer, guardPrice } from "@/lib/guard-offer"

describe("Relaunch Guard sales copy", () => {
  it("uses the shared price and canonical metadata", () => {
    expect(guardSeo.titlePage).toBe("Relaunch Guard | Google Business Profile Monitoring")
    expect(guardSeo.canonical).toBe("/relaunch-guard")
    expect(guardHero.price).toBe(`${guardPrice} per month, per location`)
    expect(guardHero.priceLabel).toBe("Monthly monitoring")
    expect(guardIncluded.followUp).toContain(`${guardPrice} per month`)
  })

  it("describes twice-daily UK-time checks carried out manually", () => {
    expect(guardOffer.checksPerDay).toBe(2)
    expect(guardOffer.timezone).toBe("Europe/London")
    expect(guardOffer.deliveryMethod).toBe("manual")
    expect(guardHero.lead).toContain("twice a day")
    expect(guardSchedule.body).toContain("each morning and evening, UK time")
    expect(guardSchedule.body).toContain("weekends and bank holidays")
    expect(guardSchedule.body).toContain("carried out manually")
    expect(guardCoverage.cards).toHaveLength(3)
  })

  it("keeps setup request, payment and activation as separate steps", () => {
    expect(guardSetup.id).toBe("how-monitoring-works")
    expect(guardSetup.steps[3]?.title).toBe("Confirm payment and start")
    expect(guardSetup.steps[3]?.text).toContain("you complete payment")
    expect(guardSetup.steps[3]?.text).toContain("confirm when your monitoring starts")
    const payFaq = guardFaqs.find((item) => item.q === "When do I pay?")
    expect(payFaq?.a[0]).toContain("Sending the setup form does not take payment or activate monitoring")
  })

  it("separates the paid-member discount from the complimentary recovery period", () => {
    expect(guardIntervention.benefitTitle).toBe(`${guardOffer.managedDiscountPercent}% off eligible Managed support`)
    expect(guardIntervention.benefitBody).toContain("Paid Guard members")
    expect(guardIntervention.disclosure[0]).toContain("paid Guard monitoring is active")
    expect(guardIncluded.body).toContain(`${guardOffer.includedRecoveryDays} days of Guard`)
    expect(guardIncluded.supporting).toBe("The paid-member discount does not apply during this included period.")
    expect(guardIncluded.followUp).toContain("we won’t automatically start charging you")
  })

  it("keeps the closing assessment route and recovery/review links", () => {
    expect(guardFaqTitle).toBe("Before you start")
    expect(guardClose.assessmentHref).toBe("/get-help")
    expect(guardIntervention.links).toEqual([
      { label: "Profile Recovery", href: "/business-profile-recovery" },
      { label: "Review Protection", href: "/review-protection" },
    ])
    const cancelFaq = guardFaqs.find((item) => item.q === "How do I cancel?")
    expect(cancelFaq).toMatchObject({ contactLink: true })
    const automatedFaq = guardFaqs.find((item) => item.q === "Is monitoring automated?")
    expect(automatedFaq?.a[0]).toBe(
      "No. Our team currently carries out the checks manually. We plan to add supported Google integrations after approval and testing, but there is no confirmed date for that change.",
    )
    const priceChangeFaq = guardFaqs.find((item) => item.q === "Can my monthly price change?")
    expect(priceChangeFaq?.a[0]).toContain("at least 30 days")
    expect(priceChangeFaq?.a[0]).toContain("accept the change before charging the higher price")
    expect(priceChangeFaq?.a[0]).toContain("subscription ends before that renewal")
    expect(guardFaqs.some((item) => item.q.includes("introductory"))).toBe(false)
  })
})
