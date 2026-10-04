import { formatMoney } from "../../../../../lib/money"
import type { GuardTax } from "./parse"

const ukDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
})

export function guardWhen(iso: string) {
  return ukDateTime.format(new Date(iso))
}

export function guardMoney(minor: number, currency: string) {
  return formatMoney(minor, currency)
}

export function guardTaxNote(behaviour: GuardTax) {
  if (behaviour === "INCLUSIVE") return "Tax is included in this amount."
  if (behaviour === "EXCLUSIVE") return "Tax is shown separately."
  return "Tax does not apply."
}
