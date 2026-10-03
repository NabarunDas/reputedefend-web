import Image from "next/image"
import { brandLogoLight, brandName, brandTagline, logoSize, marketingHomeLabel, marketingOrigin } from "@/lib/brand"

const links = [
  { label: marketingHomeLabel, href: `${marketingOrigin}/` },
  { label: "Contact", href: `${marketingOrigin}/contact` },
  { label: "Privacy", href: `${marketingOrigin}/privacy` },
  { label: "Terms", href: `${marketingOrigin}/terms` },
] as const

export function CustomerFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="customer-footer">
      <div className="customer-container customer-footer-inner">
        <Image
          src={brandLogoLight}
          alt={brandName}
          width={logoSize.width}
          height={logoSize.height}
          className="customer-logo customer-logo-footer"
          unoptimized
        />
        <p className="customer-footer-tagline">{brandTagline}</p>
        <nav className="customer-footer-nav" aria-label="ProfileRelaunch">
          <ul>
            {links.map(link => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="customer-footer-meta">
          <p>© {year} {brandName}.</p>
          <p>{brandName} is independent of Google.</p>
        </div>
      </div>
    </footer>
  )
}
