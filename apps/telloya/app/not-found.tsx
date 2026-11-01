import Link from "next/link"
import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"

export const metadata: Metadata = {
  title: pageTitle("Page Not Found"),
}

export default function NotFound() {
  return (
    <div className="bg-[var(--paper)] py-24 md:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-base font-semibold text-[var(--green)]">404</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--ink)] sm:text-5xl">
            Page not found
          </h1>
          <p className="mt-6 text-lg leading-7 text-[var(--muted)]">
            Sorry, we couldn&rsquo;t find the page you&rsquo;re looking for.
          </p>
          <div className="mt-10">
            <Link
              href="/"
              className="button-primary inline-flex rounded-full bg-[var(--green)] px-6 py-3 text-sm font-bold text-white"
            >
              Go back home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
