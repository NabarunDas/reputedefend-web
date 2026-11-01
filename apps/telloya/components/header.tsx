"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandHomeLabel } from "@/lib/brand"

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  return (
    <header
      className={`site-header sticky top-0 z-30 border-b ${
        scrolled ? "site-header-scrolled" : "border-transparent"
      }`}
    >
      <div className="container">
        <Link
          href="/"
          aria-label={brandHomeLabel}
          className="inline-flex min-w-0 shrink-0 items-center"
        >
          <TelloyaLogo className="site-logo" />
        </Link>
      </div>
    </header>
  )
}
