"use client"

import { useEffect, useState, type ReactNode } from "react"
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

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const open = menuPath === pathname
  useEffect(() => {
    document.body.classList.toggle("nav-open", open)
    return () => document.body.classList.remove("nav-open")
  }, [open])

  if (pathname === "/login") {
    return <main id="main-content" className="login-main">{children}</main>
  }

  return <div className={open ? "admin-shell is-nav-open" : "admin-shell"}>
    <header className="admin-header">
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="admin-sidebar"
        onClick={() => setMenuPath(open ? null : pathname)}
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
        <SignOut variant="header" />
      </div>
    </header>
    {open && <button type="button" className="nav-backdrop" aria-label="Dismiss navigation" onClick={() => setMenuPath(null)} />}
    <aside id="admin-sidebar" className="admin-sidebar">
      <div className="sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.lightSrc} alt="" width={logo.width} height={logo.height} />
        <p>Admin Portal</p>
      </div>
      <AdminNav pathname={pathname} onNavigate={() => setMenuPath(null)} />
      <p className="sidebar-identity">ProfileRelaunch Administrator</p>
    </aside>
    <main id="main-content" className="admin-main">{children}</main>
  </div>
}
