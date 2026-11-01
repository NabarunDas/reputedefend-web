"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandHomeLabel } from "@/lib/brand"
import { navigationContent } from "@/lib/content"

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [])

  return (
    <header className={`site-header ${scrolled ? "site-header-scrolled" : ""}`}>
      <div className="container">
        <Link href="/" aria-label={brandHomeLabel} className="site-logo">
          <TelloyaLogo />
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          <ul className="site-nav-links">
            {navigationContent.main.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="site-nav-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="site-nav-cta">
            <a
              href={navigationContent.cta.href}
              className="button-secondary"
              rel="noopener noreferrer"
            >
              {navigationContent.cta.label}
            </a>
          </div>

          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
        </nav>

        <div className={`mobile-menu ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
          <button
            className="mobile-menu-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>

          <ul className="mobile-menu-links">
            {navigationContent.main.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="mobile-menu-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mobile-menu-cta">
            <a
              href={navigationContent.cta.href}
              className="button-secondary"
              rel="noopener noreferrer"
              style={{ width: "100%", display: "block" }}
            >
              {navigationContent.cta.label}
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
