/**
 * Where an operator goes, described once.
 *
 * The sidebar used to be twenty-two equal links, one per module. The work is
 * not shaped like that: a day starts at Today, new contact arrives through
 * Intake, the case is the unit of work, Guard and Finance are the two
 * service areas, and everything else is support. This module is that shape.
 * It does not rename a route, hide a route, or decide who may open one.
 */

export type NavMatch = (pathname: string) => boolean

export type NavLink = {
  kind: "link"
  href: string
  label: string
  /** How loudly the link speaks when it sits at the top level. Nested links are quiet regardless. */
  weight: "primary" | "area" | "utility"
  match: NavMatch
}

export type NavSubgroup = {
  kind: "subgroup"
  label: string
  children: NavLink[]
}

export type NavGroup = {
  kind: "group"
  id: string
  label: string
  weight: "area" | "utility"
  children: Array<NavLink | NavSubgroup>
}

export type NavEntry = NavLink | NavGroup

/** A path is this section, and not some longer path that merely begins with the same letters. */
function section(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`)
}

/**
 * Guard overview owns `/guard` and any Guard detail that is not Checks or Alerts.
 *
 * A prefix of `/guard` would also claim `/guard/checks` and `/guard/alerts`,
 * and then two links would both be the current page. Those two are matched
 * on their own, more specific, roots.
 */
function guardOverview(pathname: string): boolean {
  return section(pathname, "/guard") && !section(pathname, "/guard/checks") && !section(pathname, "/guard/alerts")
}

const link = (href: string, label: string, weight: NavLink["weight"], match: NavMatch = pathname => section(pathname, href)): NavLink =>
  ({ kind: "link", href, label, weight, match })

export const adminNavigation: readonly NavEntry[] = [
  link("/", "Today", "primary", pathname => pathname === "/"),
  link("/enquiries", "Intake", "primary"),
  link("/cases", "Cases", "primary"),
  {
    kind: "group",
    id: "guard",
    label: "Guard",
    weight: "area",
    children: [
      link("/guard", "Overview", "utility", guardOverview),
      link("/guard/checks", "Checks", "utility"),
      link("/guard/alerts", "Alerts", "utility"),
    ],
  },
  {
    kind: "group",
    id: "finance",
    label: "Finance",
    weight: "area",
    children: [
      link("/commercial", "Commercial", "utility"),
      link("/money", "Money", "utility"),
    ],
  },
  link("/reports", "Reports", "area"),
  {
    kind: "group",
    id: "operations",
    label: "Operations",
    weight: "utility",
    children: [
      {
        kind: "subgroup",
        label: "Records & support",
        children: [
          link("/records/client", "Clients & businesses", "utility", pathname => section(pathname, "/records")),
          link("/documents", "Documents", "utility"),
          link("/tasks", "Tasks", "utility"),
          link("/communications", "Communications", "utility"),
          link("/conversations", "Conversations", "utility"),
        ],
      },
      {
        kind: "subgroup",
        label: "Oversight",
        children: [
          link("/complaints", "Complaints", "utility"),
          link("/incidents", "Incidents", "utility"),
          link("/activity", "Activity", "utility"),
          link("/operations/jobs", "Jobs", "utility"),
        ],
      },
      {
        kind: "subgroup",
        label: "Governance",
        children: [
          link("/privacy", "Privacy", "utility"),
          link("/security", "Security", "utility"),
        ],
      },
    ],
  },
  link("/settings", "Settings", "utility"),
]

export function linksIn(node: NavLink | NavSubgroup | NavGroup): NavLink[] {
  if (node.kind === "link") return [node]
  if (node.kind === "subgroup") return node.children
  return node.children.flatMap(linksIn)
}

export function allNavLinks(entries: readonly NavEntry[] = adminNavigation): NavLink[] {
  return entries.flatMap(entry => entry.kind === "link" ? [entry] : linksIn(entry))
}

/** The one link that owns this path, or none when the path is not a sidebar destination. */
export function matchingNavLinks(pathname: string, entries: readonly NavEntry[] = adminNavigation): NavLink[] {
  return allNavLinks(entries).filter(item => item.match(pathname))
}

export function activeNavGroup(pathname: string, entries: readonly NavEntry[] = adminNavigation): NavGroup | undefined {
  return entries.find((entry): entry is NavGroup => entry.kind === "group" && linksIn(entry).some(item => item.match(pathname)))
}
