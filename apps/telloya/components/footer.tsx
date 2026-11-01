import Link from "next/link"
import { TelloyaLogo } from "@/components/telloya-logo"
import {
  brandName,
  brandDescriptor,
  brandHomeLabel,
  brandOperator,
  operatorSiteUrl,
} from "@/lib/brand"
import { legalIdentity } from "../../../lib/legal"

/**
 * Telloya footer with required legal operator disclosure.
 *
 * Telloya is a product of ProfileRelaunch Ltd, not a separate company.
 * The footer must clearly disclose this relationship while maintaining
 * Telloya's visual identity.
 *
 * Legal information is sourced from the verified central legal identity
 * to prevent duplication and ensure consistency with ProfileRelaunch.
 */
export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-[var(--ink)] py-16 text-[var(--paper)]">
      <div className="container">
        <div className="mb-12">
          <Link href="/" aria-label={brandHomeLabel} className="inline-flex items-center">
            <TelloyaLogo className="site-logo site-logo-footer" variant="light" />
          </Link>
          <p className="mt-5 max-w-md text-base leading-7 text-[#C9D5CE]">
            {brandDescriptor}
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#A8B8B0]">
            Capture customer enquiries when you&rsquo;re busy and can&rsquo;t answer the phone.
          </p>
        </div>

        <div className="border-t border-white/15 pt-8">
          <p className="mb-4 text-sm leading-6 text-[#C9D5CE]">
            {brandName} is an AI receptionist service operated by{" "}
            <a
              href={operatorSiteUrl}
              className="font-semibold text-[var(--lime)] hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {brandOperator}
            </a>
            .
          </p>
          <p className="text-[13px] leading-6 text-[#A8B8B0]">
            © {currentYear} {legalIdentity.legalName}. Company number{" "}
            {legalIdentity.registrationNumber}. Registered in{" "}
            {legalIdentity.placeOfRegistration}. Registered office:{" "}
            {legalIdentity.postalAddress?.split("\n").join(", ")}.
          </p>
        </div>
      </div>
    </footer>
  )
}
