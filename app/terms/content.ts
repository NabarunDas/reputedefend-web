import { brandName } from "@/lib/brand"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"

const recovery = pricingGroups[0]
const review = pricingGroups[1]
const guard = pricingGroups[2]
const recoveryGuided = recovery.items[0]
const recoveryManaged = recovery.items[1]
const reviewGuided = review.items[0]
const reviewManaged = review.items[1]
const guardPlan = guard.items[0]

export const termsSeo = {
  titlePage: "Terms of use",
  description: "Terms that apply to using the ProfileRelaunch website, sending an enquiry or case submission, and reading published Early Access prices.",
} as const

export const termsHero = {
  eyebrow: "Terms",
  title: "Terms of use",
  lead: `These terms cover use of the ${brandName} website and its enquiry forms. They do not create a paid-service contract, promise a Google decision, or replace a separate agreement if paid support is later offered.`,
} as const

export const termsPricing = {
  title: "Published prices and paid support",
  intro: `This website publishes current ${earlyAccessLabel} for the service options below. Publishing those figures does not mean the website processes checkout or takes payment. It currently does not.`,
  items: [
    `${recovery.title} ${recoveryGuided.name}: ${recoveryGuided.price} ${recoveryGuided.cadence}.`,
    `${recovery.title} ${recoveryManaged.name}: ${recoveryManaged.detail} / ${recoveryManaged.price} ${recoveryManaged.cadence}.`,
    `${review.title} ${reviewGuided.name}: ${reviewGuided.price} ${reviewGuided.cadence}.`,
    `${review.title} ${reviewManaged.name}: ${reviewManaged.detail} / ${reviewManaged.price} ${reviewManaged.cadence}.`,
    `${guard.title}: ${guardPlan.price} ${guardPlan.cadence} for ${guardPlan.name}. This is Early Access managed monitoring. It is not automatically included, it is not a free trial, and nobody is subscribed without explicit agreement or activation.`,
  ],
  contract:
    "Submitting an assessment or enquiry does not create a paid contract. Paid support begins only when the scope and commercial terms are agreed. Guided work has an upfront fee when that option is chosen. Managed work uses the stated success-fee model. The exact definition of a successful Managed outcome is provided in the applicable service terms before you authorise that work. These website terms do not invent that definition.",
  google:
    "Google controls the platform outcome, including reinstatement, review removal and timing. Website terms do not promise a Google decision.",
  noCheckout:
    "This website does not currently process checkout, store cards, take payment authorisations or run a customer billing portal.",
} as const
