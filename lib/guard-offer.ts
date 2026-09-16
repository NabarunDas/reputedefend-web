import { pricingGroups } from "@/lib/pricing"

function readGuardPrice() {
  const price = pricingGroups.find((group) => group.id === "relaunch-guard")?.items[0]?.price
  if (!price) {
    throw new Error("Relaunch Guard price is missing from pricingGroups")
  }
  return price
}

export const guardPrice = readGuardPrice()

export const checksPerDay = 2
export const timezone = "Europe/London"
export const includesWeekends = true
export const includesBankHolidays = true
export const deliveryMethod = "manual"
export const alertChannel = "email"
export const managedDiscountPercent = 20
export const includedRecoveryDays = 30

export const guardOffer = {
  checksPerDay,
  timezone,
  includesWeekends,
  includesBankHolidays,
  deliveryMethod,
  alertChannel,
  managedDiscountPercent,
  includedRecoveryDays,
} as const

export type GuardOffer = typeof guardOffer

export function guardPrimaryAction(setupEnabled: boolean) {
  return setupEnabled
    ? { href: "/start-monitoring" as const, label: "Start monitoring setup" }
    : { href: "/contact" as const, label: "Ask about monitoring" }
}

export function guardHeroDisclaimer(setupEnabled: boolean) {
  return setupEnabled
    ? "Requesting setup does not start monitoring or take payment."
    : "Online setup is currently unavailable. Contact us to discuss monitoring."
}
