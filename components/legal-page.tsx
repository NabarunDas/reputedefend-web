import Link from "next/link"
import type { ReactNode } from "react"
import { legalIdentity } from "@/lib/legal"
import styles from "./legal-page.module.css"

export type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

const related = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Disclaimer", "/disclaimer"],
] as const

export function LegalCallout({ children }: { children: ReactNode }) {
  return <aside className={styles.callout}>{children}</aside>
}

export function LegalPage({
  eyebrow,
  title,
  lead,
  currentPath,
  sections,
}: {
  eyebrow: string
  title: string
  lead: string
  currentPath: "/privacy" | "/terms" | "/disclaimer"
  sections: LegalSection[]
}) {
  return (
    <article className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.lead}>{lead}</p>
        <p className={styles.meta}>Last updated {legalIdentity.noticeUpdated}</p>
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

      <nav className={styles.related} aria-label="Related legal pages">
        {related.map(([label, href]) => (
          href === currentPath
            ? <span key={href} aria-current="page">{label}</span>
            : <Link key={href} href={href}>{label}</Link>
        ))}
      </nav>
    </article>
  )
}
