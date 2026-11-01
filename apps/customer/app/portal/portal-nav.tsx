"use client"

import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"

const primary = [
  { label: "Dashboard", href: "/portal" },
  { label: "Cases", href: "/portal/cases" },
  { label: "Documents", href: "/portal/documents" },
] as const

const more = [
  { label: "Messages", href: "/portal/messages" },
  { label: "Payments", href: "/portal/payments" },
  { label: "Relaunch Guard", href: "/portal/guard" },
  { label: "Account", href: "/portal/account" },
] as const

const productsHubItem = { label: "My Products", href: "/portal/products" } as const

function current(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PortalNav({ defaultOpen = false, productsHub = false }: { defaultOpen?: boolean; productsHub?: boolean } = {}) {
  const pathname = usePathname()
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const seenPath = useRef(pathname)
  const [open, setOpen] = useState(defaultOpen)
  const moreItems = productsHub ? [productsHubItem, ...more] : more
  const activeMore = moreItems.find(item => current(pathname, item.href))

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
            <li key={item.label}>
              <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                {item.label}
              </a>
            </li>
          )
        })}
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
            {moreItems.map(item => {
              const active = current(pathname, item.href)
              return (
                <li key={item.label}>
                  <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </li>
      </ul>
    </nav>
  )
}
