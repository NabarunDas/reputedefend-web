"use client"

import Link from "next/link"
import { useEffect, useState, useRef } from "react"
import { TelloyaLogo } from "@/components/telloya-logo"
import { brandHomeLabel } from "@/lib/brand"
import { navigationContent } from "@/lib/content"

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollState)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
      // Transfer focus to close button when menu opens
      closeButtonRef.current?.focus()
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false)
        // Restore focus to menu button
        mobileMenuButtonRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [mobileMenuOpen])

  // Focus trap for mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !mobileMenuRef.current) return

      const focusableElements = mobileMenuRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener("keydown", handleTab)
    return () => document.removeEventListener("keydown", handleTab)
  }, [mobileMenuOpen])

  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false)
    // Restore focus to menu button
    mobileMenuButtonRef.current?.focus()
  }

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
            ref={mobileMenuButtonRef}
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
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

        <div
          id="mobile-menu"
          ref={mobileMenuRef}
          className={`mobile-menu ${mobileMenuOpen ? "mobile-menu-open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          inert={mobileMenuOpen ? undefined : ""}
        >
          <button
            ref={closeButtonRef}
            className="mobile-menu-close"
            onClick={handleCloseMobileMenu}
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
                  onClick={handleCloseMobileMenu}
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
              onClick={handleCloseMobileMenu}
            >
              {navigationContent.cta.label}
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
