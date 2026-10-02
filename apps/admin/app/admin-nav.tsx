"use client"

import { useState } from "react"
import Link from "next/link"
import {
  activeNavGroup,
  linksIn,
  adminNavigation,
  type NavGroup,
  type NavLink,
  type NavSubgroup,
} from "./admin-nav-model"

/**
 * The sidebar.
 *
 * Groups use a native disclosure. It opens on its own when the current page
 * is one of its children, and a click can still open or close it on this
 * page. Nothing remembers that click: the next route starts again from
 * whether that route belongs to the group. The group title is a summary, not
 * a link and not the current page. Exactly one child link carries
 * `aria-current`, and only when its own match rule says so.
 */
export function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav className="admin-nav" aria-label="Admin workspace">
    <ul className="admin-nav-list">
      {adminNavigation.map(entry => <li key={entry.kind === "link" ? entry.href : entry.id} className="admin-nav-item">
        {entry.kind === "link"
          ? <NavAnchor link={entry} pathname={pathname} onNavigate={onNavigate} />
          : <NavDisclosure key={`${entry.id}:${pathname}`} group={entry} pathname={pathname} onNavigate={onNavigate} />}
      </li>)}
    </ul>
  </nav>
}

function NavAnchor({ link, pathname, onNavigate, nested = false }: { link: NavLink; pathname: string; onNavigate?: () => void; nested?: boolean }) {
  return <Link
    href={link.href}
    className={nested ? "admin-nav-link is-nested" : `admin-nav-link is-${link.weight}`}
    aria-current={link.match(pathname) ? "page" : undefined}
    onClick={onNavigate}
  >
    {link.label}
  </Link>
}

function NavDisclosure({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  const active = linksIn(group).some(item => item.match(pathname))
  const [open, setOpen] = useState(active)
  return <details className={`admin-nav-group is-${group.weight}${active ? " is-active" : ""}`} open={open}>
    <summary onClick={event => {
      event.preventDefault()
      setOpen(current => !current)
    }}>
      {group.label}
    </summary>
    {group.children.every(child => child.kind === "link")
      ? <ul className="admin-nav-children">
        {group.children.map(child => child.kind === "link" && <li key={child.href}>
          <NavAnchor link={child} pathname={pathname} onNavigate={onNavigate} nested />
        </li>)}
      </ul>
      : group.children.map(child => child.kind === "subgroup" && <NavSubgroupView key={child.label} subgroup={child} pathname={pathname} onNavigate={onNavigate} />)}
  </details>
}

function NavSubgroupView({ subgroup, pathname, onNavigate }: { subgroup: NavSubgroup; pathname: string; onNavigate?: () => void }) {
  return <div className="admin-nav-subgroup">
    <p className="admin-nav-subgroup-label">{subgroup.label}</p>
    <ul className="admin-nav-children">
      {subgroup.children.map(child => <li key={child.href}>
        <NavAnchor link={child} pathname={pathname} onNavigate={onNavigate} nested />
      </li>)}
    </ul>
  </div>
}

/** Re-exported so a caller can ask which group the current route opens, without reading the JSX. */
export { activeNavGroup }
