"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useState, useRef } from "react"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandHomeLabel } from "@/lib/brand"
import { navigationContent } from "@/lib/content"

export function Header() {
  const pathname = usePathname()
  const cinematic = true // Always use cinematic design across all routes
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useLayoutEffect(() => {
    const header = headerRef.current
    const bar = header?.querySelector<HTMLElement>(":scope > .container")
    if (!header || !bar) return

    const visibleControls = () => [...header.querySelectorAll<HTMLElement>(".site-logo, .site-nav-link, .site-nav-account, .site-nav-cta .button-secondary, .site-nav-compact-cta, .mobile-menu-button")].filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
    })

    const modeFits = (mode: string) => {
      header.dataset.nav = mode
      const barRect = bar.getBoundingClientRect()
      const controls = visibleControls()
      const inside = controls.every((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left >= barRect.left - 1 && rect.right <= barRect.right + 1
      })
      const clear = controls.every((element, index) => controls.slice(index + 1).every((other) => {
        const a = element.getBoundingClientRect()
        const b = other.getBoundingClientRect()
        return a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1
      }))
      return inside && clear
    }

    const chooseMode = () => {
      const width = window.innerWidth
      const preferred = width >= 1181 ? ["desktop", "compact", "mobile"] : width >= 768 ? ["compact", "mobile"] : ["mobile"]
      const chosen = preferred.find((mode) => modeFits(mode)) ?? "mobile"
      header.dataset.nav = chosen
      if (chosen === "desktop") setMobileMenuOpen(false)
    }

    chooseMode()
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(chooseMode) : null
    observer?.observe(bar)
    const nav = header.querySelector(".site-nav")
    if (nav) observer?.observe(nav)
    window.addEventListener("resize", chooseMode)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", chooseMode)
    }
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
    <header ref={headerRef} className={`site-header ${cinematic ? "site-header-cinematic" : "site-header-standard"} ${scrolled ? "site-header-scrolled" : ""}`}>
      <div className="container">
        <Link href="/" aria-label={brandHomeLabel} className="site-logo">
          <TelloyaLogo variant="symbol" priority />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <ul className="site-nav-links">
            {navigationContent.main.map(item => (
              <li key={item.href}>
                <Link 
                  href={item.href} 
                  className="site-nav-link"
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="site-nav-cta">
            <a href={navigationContent.account.href} className="site-nav-account" rel="noopener noreferrer">{navigationContent.account.label}</a>
            <Link href={navigationContent.cta.href} className="button-secondary">{navigationContent.cta.label}</Link>
          </div>
          <Link href={navigationContent.cta.href} className="site-nav-compact-cta" aria-label={navigationContent.cta.label}>
            Enquire
          </Link>
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
          aria-modal={mobileMenuOpen ? true : undefined}
          aria-hidden={mobileMenuOpen ? undefined : true}
          aria-label="Mobile navigation"
          inert={!mobileMenuOpen}
        >
          <button ref={closeButtonRef} className="mobile-menu-close" onClick={closeMenu} aria-label="Close menu">×</button>
          <ul className="mobile-menu-links">
            {navigationContent.main.map(item => (
              <li key={item.href}>
                <Link 
                  href={item.href} 
                  className="mobile-menu-link" 
                  onClick={closeMenu}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mobile-menu-cta">
            <a href={navigationContent.account.href} className="mobile-menu-account" rel="noopener noreferrer" onClick={closeMenu}>
              {navigationContent.account.label}
            </a>
            <Link href={navigationContent.cta.href} className="button-secondary" onClick={closeMenu}>
              {navigationContent.cta.label}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}