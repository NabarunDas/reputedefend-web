import type { Metadata } from "next"
import { brandName, brandTagline, pageTitle } from "@/lib/brand"

const title = pageTitle("Home")
const description =
  "Telloya is your AI receptionist. Capture customer enquiries when you're busy and can't answer the phone."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
  },
  twitter: {
    title,
    description,
  },
}

export default function Home() {
  return (
    <div className="bg-[var(--paper)] py-24 md:py-32">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Coming Soon</p>
          <h1 className="display mx-auto mt-4">
            {brandName} — {brandTagline}
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-[var(--muted)] md:text-xl">
            Capture customer enquiries when you&rsquo;re busy and can&rsquo;t answer the
            phone. {brandName} answers calls professionally, gathers the information you need,
            and ensures no opportunity is missed.
          </p>
          <div className="mt-12 rounded-2xl border border-[var(--line)] bg-white p-8 text-left shadow-sm">
            <h2 className="text-xl font-bold text-[var(--ink)]">
              We&rsquo;re building something great
            </h2>
            <p className="mt-4 leading-7 text-[var(--muted)]">
              {brandName} is currently in development. This site will provide full details
              about our AI receptionist service, including features, pricing, and how it works
              — once we&rsquo;re ready to launch.
            </p>
            <p className="mt-4 leading-7 text-[var(--muted)]">
              The service is not yet available for subscription or use. Check back soon for
              updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
