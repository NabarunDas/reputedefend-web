import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import {
  brandColors,
  brandDescription,
  brandName,
  brandSiteUrl,
  defaultTitle,
  titleTemplate,
} from "@/lib/brand"
import { isSitePublic } from "@/lib/config"

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" })
const displayFont = Manrope({ subsets: ["latin"], variable: "--font-display" })

export const metadata: Metadata = {
  metadataBase: new URL(brandSiteUrl),
  applicationName: brandName,
  title: {
    default: defaultTitle,
    template: titleTemplate,
  },
  description: brandDescription,
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: brandName,
    title: defaultTitle,
    description: brandDescription,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: brandDescription,
  },
  robots: isSitePublic()
    ? { index: true, follow: true }
    : { index: false, follow: false, noarchive: true },
}

export const viewport: Viewport = {
  themeColor: brandColors.paper,
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
