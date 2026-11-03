"use client"

import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"

const dashboard = { label: "Dashboard", href: "/portal" } as const
const recoveryDashboard = { label: "Dashboard", href: "/portal/recovery" } as const

const cases = { label: "Cases", href: "/portal/cases" } as const
const documents = { label: "Documents", href: "/portal/documents" } as const
const messages = { label: "Messages", href: "/portal/messages" } as const
const payments = { label: "Payments", href: "/portal/payments" } as const
const guardItem = { label: "Relaunch Guard", href: "/portal/guard" } as const
const account = { label: "Account", href: "/portal/account" } as const

const legacyMore = [messages, payments, guardItem, account] as const
const recoveryMore = [messages, payments, account] as const

export type PortalNavMode = "legacy" | "recovery" | "guard" | "account"

function current(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PortalNav({ defaultOpen = false, mode = "legacy" }: { defaultOpen?: boolean; mode?: PortalNavMode } = {}) {
  const pathname = usePathname()
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const seenPath = useRef(pathname)
  const [open, setOpen] = useState(defaultOpen)
  const primary = mode === "guard"
    ? [guardItem, account]
    : mode === "account"
      ? [account]
      : mode === "recovery"
        ? [recoveryDashboard, cases, documents]
        : [dashboard, cases, documents]
  const more = mode === "guard" || mode === "account" ? [] : mode === "recovery" ? recoveryMore : legacyMore
  const activeMore = more.find(item => current(pathname, item.href))

  useEffect(() => {
    if (seenPath.current === pathname) return
    seenPath.current = pathname
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const currentLink = menu?.querySelector<HTMLAnchorElement>("[aria-current='page']")
    const firstLink = menu?.querySelector<HTMLAnchorElement>("a")
    ;(currentLink ?? firstLink)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
      if (!menu) return
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
      const links = [...menu.querySelectorAll<HTMLAnchorElement>("a")]
      if (links.length === 0) return
      const index = links.indexOf(document.activeElement as HTMLAnchorElement)
      let next = 0
      if (event.key === "Home") next = 0
      else if (event.key === "End") next = links.length - 1
      else if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % links.length
      else next = index <= 0 ? links.length - 1 : index - 1
      event.preventDefault()
      links[next]?.focus()
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menu?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  return (
    <nav className="portal-nav" aria-label="Customer portal">
      <ul className="portal-nav-list">
        {primary.map(item => {
          const active = current(pathname, item.href)
          return (
            <li key={item.href}>
              <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                {item.label}
              </a>
            </li>
          )
        })}
        {more.length > 0 ? (
          <li className="portal-nav-more">
            <button
              ref={buttonRef}
              type="button"
              className="portal-nav-more-button"
              aria-expanded={open}
              aria-controls={menuId}
              {...(activeMore ? { "aria-current": "true" as const } : {})}
              onClick={() => setOpen(value => !value)}
            >
              More
              {activeMore ? <span className="sr-only">, {activeMore.label}</span> : null}
            </button>
            <ul
              ref={menuRef}
              id={menuId}
              className={open ? "portal-more-menu is-open" : "portal-more-menu"}
              aria-label="More destinations"
            >
              {more.map(item => {
                const active = current(pathname, item.href)
                return (
                  <li key={item.href}>
                    <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
