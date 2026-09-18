import type { Metadata } from "next"
import { AdminShell } from "./admin-shell"
import "./globals.css"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: { default: "Admin Portal", template: "%s | ProfileRelaunch Admin" },
  robots: { index: false, follow: false, noarchive: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <AdminShell>{children}</AdminShell>
  </body></html>
}
