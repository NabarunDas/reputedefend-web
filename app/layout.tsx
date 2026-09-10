import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { OrganizationStructuredData } from "@/components/structured-data"
import { socialTwitter } from "@/lib/social-metadata"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })

const title = "ReputeDefend | Practical reputation support"
const description = "Practical support for Google Business Profile recovery and review protection."

export const metadata: Metadata = {
  metadataBase: new URL("https://reputedefend.com"),
  applicationName: "ReputeDefend",
  title: {
    default: title,
    template: "%s | ReputeDefend",
  },
  description,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "ReputeDefend",
    title,
    description,
    url: "/",
  },
  twitter: socialTwitter({ title, description }),
  robots: process.env.VERCEL_ENV === "production"
    ? { index: true, follow: true }
    : { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: "#f7f8f3", width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <OrganizationStructuredData />
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
