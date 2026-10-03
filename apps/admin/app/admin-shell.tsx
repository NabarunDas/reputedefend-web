"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AdminNav } from "./admin-nav"
import { SignOut } from "./sign-out"

const logo = {
  src: "/brand/profile-relaunch-logo.png",
  lightSrc: "/brand/profile-relaunch-logo-light.png",
  alt: "ProfileRelaunch",
  width: 1932,
  height: 446,
} as const

function useNarrowDrawer() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(max-width: 900px)")
    const apply = () => setNarrow(query.matches)
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [])
  return narrow
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const open = menuPath === pathname
  const narrow = useNarrowDrawer()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    document.body.classList.toggle("nav-open", open)
    return () => document.body.classList.remove("nav-open")
  }, [open])
  useEffect(() => {
    if (!open || !narrow) return
    sidebarRef.current?.querySelector<HTMLElement>("a[href], button, summary")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      returnFocus.current = true
      setMenuPath(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, narrow])
  useEffect(() => {
    if (open || !returnFocus.current) return
    returnFocus.current = false
    toggleRef.current?.focus()
  }, [open])

  function closeMenu(restoreFocus: boolean) {
    if (restoreFocus) returnFocus.current = true
    setMenuPath(null)
  }

  if (pathname === "/login") {
    return <main id="main-content" className="login-main">{children}</main>
  }

  return <div className={open ? "admin-shell is-nav-open" : "admin-shell"}>
    <header className="admin-header">
      <button
        ref={toggleRef}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="admin-sidebar"
        onClick={() => (open ? closeMenu(true) : setMenuPath(pathname))}
      >
        {open ? "Close menu" : "Open menu"}
      </button>
      <Link className="header-brand" href="/">
        {/* Static public files: login and the proxy cannot use /_next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} />
        <span>Admin Portal</span>
      </Link>
      <div className="header-actions">
        <form action="/search" method="get" role="search" className="header-search">
          <label className="sr-only" htmlFor="global-search">Search records</label>
          <input id="global-search" name="q" minLength={2} maxLength={100} placeholder="Search cases, clients, businesses…" autoComplete="off" />
          <button>Search</button>
        </form>
        <SignOut variant="header" />
      </div>
    </header>
    {open && <button type="button" className="nav-backdrop" aria-label="Dismiss navigation" onClick={() => closeMenu(true)} />}
    <aside
      ref={sidebarRef}
      id="admin-sidebar"
      className="admin-sidebar"
      inert={narrow && !open ? true : undefined}
      aria-hidden={narrow && !open ? true : undefined}
    >
      <div className="sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.lightSrc} alt="" width={logo.width} height={logo.height} />
        <p>Admin Portal</p>
      </div>
      <AdminNav pathname={pathname} onNavigate={() => closeMenu(false)} />
      <p className="sidebar-identity">ProfileRelaunch Administrator</p>
    </aside>
    <main id="main-content" className="admin-main">{children}</main>
  </div>
}
