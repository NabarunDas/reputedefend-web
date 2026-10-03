import type { Metadata } from "next"
import { Inter, Manrope } from "next/font/google"
import { CustomerFooter } from "@/components/customer-footer"
import { CustomerHeader } from "@/components/customer-header"
import { brandAppleIcon, brandIcon, brandName } from "@/lib/brand"
import "./globals.css"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  applicationName: brandName,
  title: { default: brandName, template: `%s | ${brandName}` },
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
  icons: {
    icon: [{ url: brandIcon, type: "image/png" }],
    apple: [{ url: brandAppleIcon, type: "image/png" }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <CustomerHeader />
        <main id="main-content" className="customer-main">{children}</main>
        <CustomerFooter />
      </body>
    </html>
  )
}
