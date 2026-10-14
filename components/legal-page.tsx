import Link from "next/link"
import type { ReactNode } from "react"
import {
  hasLegalValue,
  legalIdentity,
  publicLegalDisclosure,
} from "@/lib/legal"
import styles from "./legal-page.module.css"

export type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

const related = [
  ["Privacy", "/privacy"],
  ["Cookies", "/cookies"],
  ["Terms", "/terms"],
  ["Disclaimer", "/disclaimer"],
] as const

export function LegalCallout({ children }: { children: ReactNode }) {
  return <aside className={styles.callout}>{children}</aside>
}

export function LegalOperatorIdentity() {
  const disclosure = publicLegalDisclosure()
  return (
    <section className={styles.operator} aria-labelledby="legal-business-details">
      <h2 id="legal-business-details">Business details</h2>
      <p>{disclosure.operator}</p>
      <p>{disclosure.tradingStatement}</p>
      <p>{disclosure.companyNumber}</p>
      <p>{disclosure.placeOfRegistration}</p>
      <p>{disclosure.incorporated}</p>
      <p>{disclosure.registeredOfficeLabel}</p>
      <address>{disclosure.registeredOffice}</address>
      {hasLegalValue(legalIdentity.contactEmail) ? (
        <p>
          <a href={`mailto:${legalIdentity.contactEmail}`}>{legalIdentity.contactEmail}</a>
        </p>
      ) : null}
    </section>
  )
}

export function LegalPage({
  eyebrow,
  title,
  lead,
  currentPath,
  sections,
  updated = legalIdentity.noticeUpdated,
}: {
  eyebrow: string
  title: string
  lead: string
  currentPath: "/privacy" | "/terms" | "/disclaimer" | "/cookies"
  sections: LegalSection[]
  updated?: string
}) {
  return (
    <article className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.lead}>{lead}</p>
        <p className={styles.meta}>Last updated {updated}</p>
      </header>

      <nav className={styles.toc} aria-label="On this page">
        <p>On this page</p>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          <div className={styles.body}>{section.content}</div>
        </section>
      ))}

      <LegalOperatorIdentity />

      <nav className={styles.related} aria-label="Related legal information">
        <p className={styles.relatedLabel}>Related legal information</p>
        <div className={styles.relatedLinks}>
          {related.map(([label, href]) => (
            href === currentPath
              ? <span key={href} aria-current="page">{label}</span>
              : <Link key={href} href={href}>{label}</Link>
          ))}
        </div>
      </nav>
    </article>
  )
}
