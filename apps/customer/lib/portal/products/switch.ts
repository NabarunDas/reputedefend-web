import type { ProductCard, ProductKey } from "./present"

export type ProductSwitchKind = "open" | "contact" | "pending" | "unconfirmed"

export type ProductSwitchChoice = {
  key: ProductKey
  name: string
  kind: ProductSwitchKind
  /** Operational workspace. Present only when the launcher would open that dashboard. */
  href?: string
  /** Published assessment or contact action. Not a dashboard. */
  action?: { label: string; href: string }
  note: string | null
}

const UNCONFIRMED = "Status temporarily unavailable"

/**
 * Switcher rows follow the launcher. They do not invent access, a Telloya
 * workspace, or a subscription. An unconfirmed read stays unconfirmed.
 */
function workspaceHref(href: string): boolean {
  return href === "/portal/recovery" || href.startsWith("/portal/recovery/")
    || href === "/portal/guard" || href.startsWith("/portal/guard/")
}

export function productSwitchChoices(products: readonly ProductCard[]): ProductSwitchChoice[] {
  return products.map(product => {
    const workspace = product.actions.find(action => workspaceHref(action.href))
    if (workspace) {
      return { key: product.key, name: product.name, kind: "open", href: workspace.href, note: null }
    }
    const progress = product.actions.find(action => action.href === "/portal/onboarding")
    if (product.group === "unconfirmed" || product.status === "unavailable") {
      return {
        key: product.key,
        name: product.name,
        kind: "unconfirmed",
        note: UNCONFIRMED,
        ...(progress ? { action: { label: progress.label, href: progress.href } } : {}),
      }
    }
    const contact = product.actions.find(action => action.href.startsWith("http") || action.href.startsWith("mailto:"))
    if (contact && !progress) {
      return {
        key: product.key,
        name: product.name,
        kind: "contact",
        action: { label: contact.label, href: contact.href },
        note: product.key === "telloya" ? product.unavailableReason : null,
      }
    }
    return {
      key: product.key,
      name: product.name,
      kind: "pending",
      note: product.unavailableReason,
      ...(progress ? { action: { label: progress.label, href: progress.href } } : {}),
    }
  })
}

/** The workspace the customer is in. Account and the launcher are not a product. */
export function currentProductKey(pathname: string): ProductKey | null {
  if (pathname === "/portal/guard" || pathname.startsWith("/portal/guard/")) return "guard"
  if (
    pathname === "/portal/recovery"
    || pathname.startsWith("/portal/recovery/")
    || pathname === "/portal/cases"
    || pathname.startsWith("/portal/cases/")
    || pathname === "/portal/documents"
    || pathname.startsWith("/portal/documents/")
    || pathname === "/portal/messages"
    || pathname.startsWith("/portal/messages/")
    || pathname === "/portal/payments"
    || pathname.startsWith("/portal/payments/")
  ) return "recovery"
  return null
}
