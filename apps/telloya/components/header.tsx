"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandHomeLabel } from "@/lib/brand"
import { navigationContent } from "@/lib/content"

export function Header() {
  const pathname = usePathname()
  const cinematic = pathname === "/"
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) closeButtonRef.current?.focus()
    const priorOverflow = document.body.style.overflow
    if (mobileMenuOpen) document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = priorOverflow }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false)
        mobileMenuButtonRef.current?.focus()
        return
      }
      if (event.key !== "Tab" || !mobileMenuRef.current) return
      const focusables = mobileMenuRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", handleKeys)
    return () => document.removeEventListener("keydown", handleKeys)
  }, [mobileMenuOpen])

  const closeMenu = () => {
    setMobileMenuOpen(false)
    mobileMenuButtonRef.current?.focus()
  }

  return (
    <header className={`site-header ${cinematic ? "site-header-cinematic" : "site-header-standard"} ${scrolled ? "site-header-scrolled" : ""}`}>
      <div className="container">
        {cinematic && (
          <nav className="site-nav-early" aria-label="Explore Telloya">
            {navigationContent.main.slice(0, 2).map(item => (
              <Link key={item.href} href={item.href} className="site-nav-link">{item.label}</Link>
            ))}
          </nav>
        )}
        <Link href="/" aria-label={brandHomeLabel} className="site-logo">
          <TelloyaLogo variant={cinematic ? "symbol" : "dark"} priority={cinematic} />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <ul className="site-nav-links">
            {(cinematic ? navigationContent.main.slice(2) : navigationContent.main).map(item => (
              <li key={item.href}><Link href={item.href} className="site-nav-link">{item.label}</Link></li>
            ))}
          </ul>
          <div className="site-nav-cta">
            <a href={navigationContent.cta.href} className="button-secondary" rel="noopener noreferrer">{navigationContent.cta.label}</a>
          </div>
          <button
            ref={mobileMenuButtonRef}
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
        </nav>
        <div
          id="mobile-menu"
          ref={mobileMenuRef}
          className={`mobile-menu ${mobileMenuOpen ? "mobile-menu-open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          inert={!mobileMenuOpen}
        >
          <button ref={closeButtonRef} className="mobile-menu-close" onClick={closeMenu} aria-label="Close menu">×</button>
          <ul className="mobile-menu-links">
            {navigationContent.main.map(item => (
              <li key={item.href}>
                <Link href={item.href} className="mobile-menu-link" onClick={closeMenu}>{item.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mobile-menu-cta">
            <a href={navigationContent.cta.href} className="button-secondary" rel="noopener noreferrer" onClick={closeMenu}>
              {navigationContent.cta.label}
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}