# UX-5 — Navigation and information architecture

## Why the sidebar changed

The Admin sidebar was a flat list of twenty-two links. Today, Search, Enquiries, Clients & Businesses, Cases, Documents, Tasks, Activity, Reports, Communications, Conversations, Commercial, Money, Guard, Checks, Alerts, Jobs, Settings, Privacy, Complaints, Incidents and Security all had the same visual weight. An operator had to know the module map before they could start work.

UX-1 to UX-4 settled the operating model. A day starts on Today. New contact arrives as an enquiry and becomes a case. Guard is a service in its own right. Commercial and Money are the finance work, and they are not the same page. Reports is where analysis lives. Everything else is support. The sidebar now follows that order. It does not follow the database.

No migration was required. No route was renamed, removed or redirected. No page was redesigned. No permission, session or provider gate changed.

## What the operator sees

With Guard, Finance and Operations collapsed, the sidebar is:

1. Today
2. Intake
3. Cases
4. Guard
5. Finance
6. Reports
7. Operations
8. Settings

Search is not in that list. It stays in the header, which already submits to `/search`. The accessible name of the field remains "Search records". The placeholder names cases, clients and businesses, which global search actually covers, along with verified email, location and invoice reference.

ProfileRelaunch, the Admin Portal label, the header sign-out and the "ProfileRelaunch Administrator" line are unchanged. The account email is still not shown.

## Where each route sits

| Route | Navigation |
| --- | --- |
| `/` | Today |
| `/enquiries` and its children | Intake |
| `/cases`, `/cases/[id]`, `/cases/[id]/evidence` | Cases |
| `/guard` and Guard detail that is not Checks or Alerts | Guard → Overview |
| `/guard/checks` and its children | Guard → Checks |
| `/guard/alerts` and its children | Guard → Alerts |
| `/commercial` and its children | Finance → Commercial |
| `/money` and its children | Finance → Money |
| `/reports` and its children | Reports |
| `/records/...` | Operations → Records & support → Clients & businesses |
| `/documents` | Operations → Records & support → Documents |
| `/tasks` | Operations → Records & support → Tasks |
| `/communications` | Operations → Records & support → Communications |
| `/conversations` | Operations → Records & support → Conversations |
| `/complaints` | Operations → Oversight → Complaints |
| `/incidents` | Operations → Oversight → Incidents |
| `/activity` | Operations → Oversight → Activity |
| `/operations/jobs` | Operations → Oversight → Jobs |
| `/privacy` | Operations → Governance → Privacy |
| `/security` | Operations → Governance → Security |
| `/settings` | Settings |
| `/search` | Header search only. No sidebar current item. |

Intake is the label for the existing Enquiries capability. The route stays `/enquiries`. Clients & businesses stays under records: Intake may identify a customer, but the records module is supporting infrastructure, not the front door.

There is no `/finance` page, no `/operations` page, no `/intake` page and no extra Guard home. Finance and Operations are disclosure titles. Their children are the existing pages.

## Groups

Guard stays prominent because it is a service, not a utility. Overview, Checks and Alerts remain separate routes. The group is navigation only.

Finance holds Commercial and Money. They stay separate functional areas until UX-7.

Operations holds the supporting modules, in three non-link headings: Records & support, Oversight, and Governance. Those headings are not destinations. Jobs stays at `/operations/jobs`. Settings stays outside Operations so it can be found without opening the long group. Privacy and Security move under Governance; they are not folded into Settings, and session behaviour is unchanged.

## Active route

Matching lives in `admin-nav-model.ts`. The sidebar renders that model. It does not repeat `pathname.startsWith` in the markup.

A path matches a section only when it is that path or a child of it. `/guard` does not match `/guardian`. `/commercial` does not match a longer unrelated prefix.

Guard is the careful case. Overview is current for `/guard` and for any Guard path that is not under `/guard/checks` or `/guard/alerts`. Checks and Alerts match only their own roots. One path therefore produces one current link.

Cases stays current on the case page and on case evidence. Evidence is part of the case journey. It is not a new primary link. Reports stays current on report drill-downs.

The current page is `aria-current="page"` on that one link. A group summary never carries `aria-current`. The group that contains the current page gets an active class: a lime inset rule and a heavier summary, plus the green current-page treatment on the child.

## Disclosures

Guard, Finance and Operations are native `<details>` elements. The summary is the control. The children are links.

The group opens by itself when the current route belongs to it, so the current child is not hidden inside a collapsed group. Otherwise it starts closed. Opening or closing a group is for this page only. It is not stored in localStorage, a cookie or the database. Navigating to another route starts again from whether that route belongs to the group. A group the operator has opened on a page that does not belong to it stays open until they leave the page. React does not force it shut on the next render.

On a phone the same sidebar is the existing drawer. Open menu, Close menu and the backdrop behave as before. Choosing a destination closes the drawer. Opening a disclosure does not. The active group is already open when the drawer opens, because the sidebar is rendered for the current route.

## Accessibility

There is one navigation landmark, labelled "Admin workspace". Links are anchors. Group controls are summaries. Subgroup headings are text, not links and not extra landmarks. Lists carry the children. The skip link still points at `#main-content`. Focus uses the existing focus ring. Nested links are smaller and indented, and their default colour on the forest sidebar still clears ordinary text contrast. The current page does not depend on colour alone: it is also heavier type on the solid green used for the current item elsewhere.

## What this phase leaves alone

Today, the case queue, the case cockpit, evidence, commercial, money, communications, reports, Guard pages and Settings are not redesigned. Links those pages already generate are not rewritten. Breadcrumbs were not added. A lost-context problem, if one shows up in later testing, belongs to UX-9 rather than a second navigation system.

UX-6 owns the evidence workspace. UX-7 owns the commercial and money surfaces. UX-8 owns communications and conversations. UX-9 owns the visual-system sweep. None of those phases is started here.

Provider gates are unchanged: outgoing mail, inbound mail, Stripe, the Google live stack, Guard live automation and privacy deletion stay disabled. Cron is unchanged. Step 22B stays deferred. The sidebar does not suggest that a disabled provider is active.
