import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <section className="status-page">
      <p className="eyebrow">404</p>
      <h1>That page took a wrong turn.</h1>
      <p>The page you’re looking for may have moved. Try the home page or tell us what you need.</p>
      <Link href="/" className="button-primary inline-flex rounded-full bg-[var(--green)] px-5 py-3 font-bold text-white">
        Back home
      </Link>
    </section>
  )
}
