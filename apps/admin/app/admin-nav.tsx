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
 * A group that contains the current page is a static expanded section. It is
 * not a disclosure, so the current destination cannot be collapsed out of
 * sight. Every other group is a native disclosure the operator can open and
 * close on this page. Nothing remembers that click: the next route decides
 * again which group, if any, is the static one. The group title is never a
 * link and never the current page. Exactly one child link carries
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
  if (active) {
    return <div className={`admin-nav-group is-${group.weight} is-active is-static`}>
      <p className="admin-nav-group-label">{group.label}</p>
      <NavGroupChildren group={group} pathname={pathname} onNavigate={onNavigate} />
    </div>
  }
  return <InactiveNavGroup group={group} pathname={pathname} onNavigate={onNavigate} />
}

function InactiveNavGroup({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  return <details className={`admin-nav-group is-${group.weight}`} open={open}>
    <summary onClick={event => {
      event.preventDefault()
      setOpen(current => !current)
    }}>
      {group.label}
    </summary>
    <NavGroupChildren group={group} pathname={pathname} onNavigate={onNavigate} />
  </details>
}

function NavGroupChildren({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  if (group.children.every(child => child.kind === "link")) {
    return <ul className="admin-nav-children">
      {group.children.map(child => child.kind === "link" && <li key={child.href}>
        <NavAnchor link={child} pathname={pathname} onNavigate={onNavigate} nested />
      </li>)}
    </ul>
  }
  return <>
    {group.children.map(child => child.kind === "subgroup" && <NavSubgroupView key={child.label} subgroup={child} pathname={pathname} onNavigate={onNavigate} />)}
  </>
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
