import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ReputeLogo } from "@/components/logo"
import { hasLegalValue, legalIdentity } from "@/lib/legal"

const explore = [
  ["Profile recovery", "/business-profile-recovery"],
  ["Review protection", "/review-protection"],
  ["How it works", "/how-it-works"],
  ["About", "/about"],
] as const

const information = [
  ["Contact", "/contact"],
  ["Get help", "/get-help"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Disclaimer", "/disclaimer"],
] as const

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#10261F] py-16 text-[#F7F4EC]">
      <div className="container grid gap-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link href="/" aria-label="ReputeDefend home" className="inline-flex items-center">
            <ReputeLogo variant="light" className="site-logo" decorative />
          </Link>
          <p className="mt-5 max-w-xs text-sm leading-7 text-[#A8B8B0]">
            Clear, practical support when your business reputation needs a steadier hand.
          </p>
          <Link
            href="/get-help"
            className="facts-cta group mt-8 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10261F]"
          >
            <span>Get help with a case</span>
            <ArrowRight aria-hidden="true" size={20} />
          </Link>
        </div>
        <div>
          <p className="mb-5 text-[.68rem] font-bold uppercase tracking-[.16em] text-[#A8B8B0]">Explore</p>
          <div className="flex flex-col gap-3 text-sm">
            {explore.map(([label, href]) => (
              <Link key={href} className="footer-link" href={href}>{label}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-5 text-[.68rem] font-bold uppercase tracking-[.16em] text-[#A8B8B0]">Information</p>
          <div className="flex flex-col gap-3 text-sm">
            {information.map(([label, href]) => (
              <Link key={href} className="footer-link" href={href}>{label}</Link>
            ))}
          </div>
        </div>
      </div>
      <div className="container mt-14 border-t border-white/15 pt-5 text-xs leading-6 text-[#A8B8B0]">
        © {new Date().getFullYear()} {legalIdentity.tradingName}.
        {hasLegalValue(legalIdentity.legalName) ? ` ${legalIdentity.tradingName} is a trading name of ${legalIdentity.legalName}.` : ""}
        {" "}{legalIdentity.tradingName} is independent of Google.
      </div>
    </footer>
  )
}
