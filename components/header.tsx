"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowUpRight, Menu } from "lucide-react"
import { ReputeLogo } from "@/components/logo"

const navigation = [
  ["Profile recovery", "/business-profile-recovery"],
  ["Review protection", "/review-protection"],
  ["How it works", "/how-it-works"],
  ["About", "/about"],
] as const

export function Header() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  return (
    <header className={`site-header sticky top-0 z-30 border-b ${scrolled ? "site-header-scrolled" : "border-transparent"}`}>
      <div className="container flex min-h-20 items-center justify-between gap-6">
        <Link href="/" aria-label="ReputeDefend home" className="inline-flex shrink-0">
          <ReputeLogo width="190" height="44" />
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-8 text-[.78rem] font-bold md:flex">
          {navigation.map(([label, href]) => (
            <Link key={href} className={`nav-link ${pathname === href ? "nav-link-active" : ""}`} href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/contact" className={`nav-link hidden text-sm font-bold sm:block ${pathname === "/contact" ? "nav-link-active" : ""}`} aria-current={pathname === "/contact" ? "page" : undefined}>Contact</Link>
          <Link href="/get-help" className="button-primary group flex items-center gap-2 rounded-full bg-[var(--green)] px-5 py-3 text-sm font-bold text-white" aria-current={pathname === "/get-help" ? "page" : undefined}>
            Get help <ArrowUpRight data-icon="inline-end" className="button-arrow" />
          </Link>
          <button type="button" aria-label="Open navigation" className="button-secondary rounded-full border border-[var(--line)] p-2 md:hidden"><Menu /></button>
        </div>
      </div>
    </header>
  )
}
