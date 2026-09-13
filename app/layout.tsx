import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { AnalyticsRoot } from "@/components/analytics-root"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { OrganizationStructuredData } from "@/components/structured-data"
import {
  brandColors,
  brandDescription,
  brandName,
  brandSiteUrl,
  defaultTitle,
  titleTemplate,
} from "@/lib/brand"
import { googleSiteVerification } from "@/lib/site-verification"
import { socialTwitter } from "@/lib/social-metadata"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })
const googleVerification = googleSiteVerification()

export const metadata: Metadata = {
  metadataBase: new URL(brandSiteUrl),
  applicationName: brandName,
  title: {
    default: defaultTitle,
    template: titleTemplate,
  },
  description: brandDescription,
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: "/icon.png",
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: brandName,
    title: defaultTitle,
    description: brandDescription,
    url: "/",
  },
  twitter: socialTwitter({ title: defaultTitle, description: brandDescription }),
  robots: process.env.VERCEL_ENV === "production"
    ? { index: true, follow: true }
    : { index: false, follow: false },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
}

export const viewport: Viewport = { themeColor: brandColors.paper, width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <OrganizationStructuredData />
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
        <AnalyticsRoot />
      </body>
    </html>
  )
}
