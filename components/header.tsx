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
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <header className={`site-header sticky top-0 z-30 border-b ${scrolled ? "site-header-scrolled" : "border-transparent"}`}>
      <div className="container flex min-h-20 items-center justify-between gap-3 px-4 sm:px-5 md:gap-6 md:px-0">
        <Link href="/" aria-label="ReputeDefend home" className="inline-flex min-w-0 shrink-0" onClick={() => setMenuOpen(false)}>
          <ReputeLogo className="h-auto w-[clamp(145px,42vw,190px)]" />
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-8 text-[.78rem] font-bold md:flex">
          {navigation.map(([label, href]) => (
            <Link key={href} className={`nav-link ${pathname === href ? "nav-link-active" : ""}`} href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link href="/contact" className={`desktop-contact nav-link text-sm font-bold ${pathname === "/contact" ? "nav-link-active" : ""}`} aria-current={pathname === "/contact" ? "page" : undefined}>Contact</Link>
          <Link href="/get-help" className="button-primary group flex items-center gap-1.5 rounded-full bg-[var(--green)] px-3 py-2.5 text-[.78rem] font-bold text-white sm:gap-2 sm:px-5 sm:py-3 sm:text-sm" aria-current={pathname === "/get-help" ? "page" : undefined}>
            Get help <ArrowUpRight data-icon="inline-end" className="button-arrow" />
          </Link>
          <button type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen((open) => !open)} className="button-secondary inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] md:hidden"><Menu /></button>
        </div>
      </div>
      {menuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-[var(--line)] bg-[var(--paper)] px-4 py-5 md:hidden"><div className="container flex flex-col gap-1 sm:px-1">{[...navigation, ["Contact", "/contact"], ["Get help", "/get-help"] as const].map(([label, href]) => <Link key={href} href={href} className="rounded-xl px-3 py-3 text-base font-bold hover:bg-white" aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</div></nav>}
    </header>
  )
}
