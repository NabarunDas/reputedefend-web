"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState, type FocusEvent } from "react"
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react"
import { BrandLogo } from "@/components/logo"
import { brandHomeLabel } from "@/lib/brand"
import { primaryNav, serviceNav } from "@/lib/site-nav"

const DESKTOP_NAV_QUERY = "(min-width: 1024px)"

export function Header() {
  const pathname = usePathname()
  const menuId = useId()
  const servicesPanelId = useId()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(pathname)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const servicesButtonRef = useRef<HTMLButtonElement>(null)
  const disclosureRef = useRef<HTMLDivElement>(null)
  const serviceActive = serviceNav.some((item) => item.href === pathname)

  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMenuOpen(false)
    setServicesOpen(false)
  }

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_NAV_QUERY)
    function onBreakpointChange() {
      setMenuOpen(false)
      setServicesOpen(false)
    }
    media.addEventListener("change", onBreakpointChange)
    return () => media.removeEventListener("change", onBreakpointChange)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [menuOpen])

  useEffect(() => {
    if (!servicesOpen) return

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setServicesOpen(false)
        servicesButtonRef.current?.focus()
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!disclosureRef.current?.contains(event.target as Node)) {
        setServicesOpen(false)
      }
    }

    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [servicesOpen])

  function closeAll() {
    setMenuOpen(false)
    setServicesOpen(false)
  }

  function onServicesBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && disclosureRef.current?.contains(next)) return
    setServicesOpen(false)
  }

  return (
    <header className={`site-header sticky top-0 z-30 border-b ${scrolled ? "site-header-scrolled" : "border-transparent"}`}>
      <div className="container">
        <Link href="/" aria-label={brandHomeLabel} className="inline-flex min-w-0 shrink-0 items-center" onClick={closeAll}>
          <BrandLogo className="site-logo" decorative priority />
        </Link>
        <nav aria-label="Primary" className="desktop-nav hidden items-center text-[.78rem] font-bold lg:flex">
          <div ref={disclosureRef} className="services-disclosure" onBlur={onServicesBlur}>
            <button
              ref={servicesButtonRef}
              type="button"
              className={`nav-link services-trigger ${serviceActive ? "nav-link-active" : ""}`}
              aria-expanded={servicesOpen}
              aria-controls={servicesPanelId}
              onClick={() => setServicesOpen((open) => !open)}
            >
              Services
              <ChevronDown className="services-chevron" aria-hidden="true" />
            </button>
            <div id={servicesPanelId} className="services-panel" hidden={!servicesOpen}>
              {serviceNav.map(({ label, href }) => (
                <Link
                  key={href}
                  className={`services-panel-link ${pathname === href ? "nav-link-active" : ""}`}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setServicesOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          {primaryNav.map(({ label, href }) => (
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
            href="/get-help"
            className="button-primary group inline-flex items-center gap-1.5 rounded-full bg-[var(--green)] px-3 py-2.5 text-[.78rem] font-bold text-white sm:gap-2 sm:px-5 sm:py-3 sm:text-sm"
            aria-current={pathname === "/get-help" ? "page" : undefined}
          >
            Get Help <ArrowUpRight data-icon="inline-end" className="button-arrow" aria-hidden="true" />
          </Link>
          <button
            ref={menuButtonRef}
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
            <p className="mobile-nav-group-label">Services</p>
            {serviceNav.map(({ label, href }) => (
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
            <hr className="mobile-nav-separator" />
            {primaryNav.map(({ label, href }) => (
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
              href="/contact"
              className={pathname === "/contact" ? "nav-link-active" : ""}
              aria-current={pathname === "/contact" ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              Contact
            </Link>
            <Link
              href="/get-help"
              className="mobile-nav-cta"
              aria-current={pathname === "/get-help" ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              Get Help
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
