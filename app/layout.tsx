import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { OrganizationStructuredData } from "@/components/structured-data"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })

export const metadata: Metadata = {
  metadataBase: new URL("https://reputedefend.com"),
  title: {
    default: "ReputeDefend | Practical reputation support",
    template: "%s | ReputeDefend",
  },
  description: "Practical support for Google Business Profile recovery and review protection.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title: "ReputeDefend | Practical reputation support",
    description: "Practical support for Google Business Profile recovery and review protection.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }],
  },
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
