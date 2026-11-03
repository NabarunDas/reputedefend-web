"use client"

import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { currentProductKey, type ProductSwitchChoice } from "@/lib/portal/products/switch"

const productsHome = { label: "My Products", href: "/portal/products" } as const

function external(href: string) {
  return href.startsWith("http") || href.startsWith("mailto:")
}

export function ProductSwitch({ initial, defaultOpen = false }: { initial?: ProductSwitchChoice[] | null; defaultOpen?: boolean } = {}) {
  const pathname = usePathname() ?? ""
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const seenPath = useRef(pathname)
  const [open, setOpen] = useState(defaultOpen)
  const [choices, setChoices] = useState<ProductSwitchChoice[] | null | undefined>(initial)
  const [failed, setFailed] = useState(initial === null)
  const current = currentProductKey(pathname)

  useEffect(() => {
    if (seenPath.current === pathname) return
    seenPath.current = pathname
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const currentLink = menu?.querySelector<HTMLAnchorElement>("[aria-current='true']")
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
  }, [open, choices])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || choices !== undefined) return
    setFailed(false)
    try {
      const action = await import("./product-switch-action")
      const loaded = await action.loadProductSwitchAction()
      setChoices(loaded)
      if (!loaded) setFailed(true)
    } catch {
      setChoices(null)
      setFailed(true)
    }
  }

  return (
    <div className="portal-switch">
      <button
        ref={buttonRef}
        type="button"
        className="portal-switch-button"
        aria-expanded={open}
        aria-haspopup="menu"
        {...(open ? { "aria-controls": menuId } : {})}
        onClick={() => void toggle()}
      >
        Switch product
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} className="portal-switch-menu" role="menu" aria-label="Products">
          {choices === undefined ? <p role="status">Checking your services…</p> : null}
          {failed ? <p>We couldn&apos;t confirm your services just now.</p> : null}
          <ul>
            {(choices ?? []).map(choice => {
              const active = choice.key === current
              if (choice.kind === "open" && choice.href) {
                return (
                  <li key={choice.key}>
                    <a role="menuitem" href={choice.href} {...(active ? { "aria-current": "true" as const } : {})}>
                      {choice.name}
                    </a>
                  </li>
                )
              }
              return (
                <li key={choice.key} {...(active ? { "aria-current": "true" as const } : {})}>
                  <p className="portal-switch-name">{choice.name}</p>
                  {choice.note ? <p className="portal-switch-note">{choice.note}</p> : null}
                  {choice.action ? (
                    <a
                      role="menuitem"
                      href={choice.action.href}
                      {...(external(choice.action.href) ? { rel: "noopener noreferrer" } : {})}
                    >
                      {choice.action.label}
                    </a>
                  ) : null}
                </li>
              )
            })}
            <li>
              <a role="menuitem" href={productsHome.href}>{productsHome.label}</a>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}
