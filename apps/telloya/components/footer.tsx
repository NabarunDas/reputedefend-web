import Link from "next/link"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandName, brandHomeLabel } from "@/lib/brand"
import { publicLegalDisclosure, legalIdentity } from "../../../lib/legal"
import { footerContent } from "@/lib/content"

export function Footer() {
  const currentYear = new Date().getFullYear()
  const disclosure = publicLegalDisclosure()

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-brand">
            <Link href="/" aria-label={brandHomeLabel} className="site-logo-footer">
              <TelloyaLogo variant="light" />
            </Link>
            <p className="footer-tagline">{footerContent.tagline}</p>
          </div>

          {footerContent.sections.map((section) => (
            <div key={section.title} className="footer-section">
              <h3 className="footer-section-title">{section.title}</h3>
              {section.links.map((link) => {
                const isExternal = link.href.startsWith("http")
                return isExternal ? (
                  <a
                    key={link.href}
                    href={link.href}
                    className="footer-link"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className="footer-link">
                    {link.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <div>
            <ul className="footer-legal">
              {footerContent.legal.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="footer-legal-link"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="footer-note">{footerContent.note}</p>
          </div>
          <div className="text-sm opacity-70">
            <p className="mb-2">{disclosure.tradingStatement}</p>
            <p className="mb-2">
              © {currentYear} {disclosure.operator}. {disclosure.companyNumber} {disclosure.placeOfRegistration}
            </p>
            <p>
              {disclosure.registeredOfficeLabel}: {disclosure.registeredOfficeInline}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
