import type { Metadata } from "next"
import "./globals.css"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: { default: "Staff sign in | ProfileRelaunch", template: "%s | ProfileRelaunch Admin" },
  robots: { index: false, follow: false, noarchive: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="masthead"><span className="brand">ProfileRelaunch</span><span>Staff workspace</span></header>
    <main id="main-content">{children}</main>
  </body></html>
}
