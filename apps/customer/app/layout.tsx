import type { Metadata } from "next"
import "./globals.css"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: { default: "Secure action", template: "%s | ProfileRelaunch" },
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="brand"><p>ProfileRelaunch</p></header>
    <main id="main-content">{children}</main>
  </body></html>
}
