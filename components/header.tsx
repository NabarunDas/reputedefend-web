"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { ReputeLogo } from "@/components/logo"

const navigation = [
  ["Profile recovery", "/business-profile-recovery"],
  ["Review protection", "/review-protection"],
  ["How it works", "/how-it-works"],
  ["About", "/about"],
] as const

export function Header() {
  const pathname = usePathname()
  const menuId = useId()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(pathname)
  const buttonRef = useRef<HTMLButtonElement>(null)

  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [menuOpen])

  return (
    <header className={`site-header sticky top-0 z-30 border-b ${scrolled ? "site-header-scrolled" : "border-transparent"}`}>
      <div className="container">
        <Link href="/" aria-label="ReputeDefend home" className="inline-flex min-w-0 shrink-0 items-center" onClick={() => setMenuOpen(false)}>
          <ReputeLogo className="site-logo" decorative priority />
        </Link>
        <nav aria-label="Primary" className="desktop-nav hidden items-center gap-6 text-[.78rem] font-bold lg:flex xl:gap-8">
          {navigation.map(([label, href]) => (
            <Link
              key={href}
              className={`nav-link ${pathname === href ? "nav-link-active" : ""}`}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link
            href="/contact"
            className={`nav-link nav-contact hidden text-sm font-bold lg:inline-flex ${pathname === "/contact" ? "nav-link-active" : ""}`}
            aria-current={pathname === "/contact" ? "page" : undefined}
          >
            Contact
          </Link>
          <Link
            href="/get-help"
            className="button-primary group inline-flex items-center gap-1.5 rounded-full bg-[var(--green)] px-3 py-2.5 text-[.78rem] font-bold text-white sm:gap-2 sm:px-5 sm:py-3 sm:text-sm"
            aria-current={pathname === "/get-help" ? "page" : undefined}
          >
            Get help <ArrowUpRight data-icon="inline-end" className="button-arrow" aria-hidden="true" />
          </Link>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen((open) => !open)}
            className="menu-toggle button-secondary inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] lg:hidden"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav
          id={menuId}
          aria-label="Mobile"
          className="mobile-nav border-t border-[var(--line)] bg-[var(--paper)] py-4 lg:hidden"
        >
          <div className="container flex flex-col gap-1">
            {[...navigation, ["Contact", "/contact"] as const].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={pathname === href ? "nav-link-active" : ""}
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/get-help"
              className="mobile-nav-cta"
              aria-current={pathname === "/get-help" ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              Get help
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
