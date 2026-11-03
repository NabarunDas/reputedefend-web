import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadOnboardingStatus } from "@/lib/portal/onboarding/load"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { OnboardingUnavailable, OnboardingView } from "./onboarding-view"

export const metadata = { title: "Setup progress" }

export default async function OnboardingPage() {
  if (!portalAvailable()) redirect("/")
  if (!productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal")
  }
  const loaded = await loadOnboardingStatus()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <OnboardingUnavailable />
  return <OnboardingView requests={loaded.requests} />
}
