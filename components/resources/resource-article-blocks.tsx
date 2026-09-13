import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"
import type { ResourceMistakeItem } from "@/lib/resource-content"
import type { OfficialSource } from "@/lib/resources"
import styles from "./resource-article.module.css"

export function ResourceOfficialSources({
  sources,
  paraphrase,
}: {
  sources: OfficialSource[]
  paraphrase?: ReactNode
}) {
  if (sources.length === 0) return null

  return (
    <section className={`${styles.section} ${styles.wide}`} aria-labelledby="what-google-says">
      <h2 id="what-google-says">What Google says</h2>
      {paraphrase ? <div className={styles.prose}>{paraphrase}</div> : null}
      <ul className={styles.sourceList}>
        {sources.map((source) => (
          <li key={source.url} className={styles.sourceCard}>
            <p className={styles.sourceKicker}>Official source</p>
            <p className={styles.sourceName}>{source.name}</p>
            <p className={styles.sourceTitle}>{source.title}</p>
            <a
              className={styles.sourceLink}
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              View official Google guidance
              <ArrowUpRight size={16} aria-hidden="true" />
              <span className="sr-only"> (opens {source.name} in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ResourceSourceBibliography({ sources }: { sources: OfficialSource[] }) {
  if (sources.length === 0) return null

  return (
    <section className={`${styles.section} ${styles.wide}`} aria-labelledby="official-sources">
      <h2 id="official-sources">Official sources</h2>
      <ul className={styles.sourceList}>
        {sources.map((source) => (
          <li key={`bib-${source.url}`} className={styles.sourceCard}>
            <p className={styles.sourceName}>{source.name}</p>
            <p className={styles.sourceTitle}>{source.title}</p>
            <a
              className={styles.sourceLink}
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              View official Google guidance
              <ArrowUpRight size={16} aria-hidden="true" />
              <span className="sr-only"> (opens {source.name} in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ResourceBeforeYouAct({ children }: { children: ReactNode }) {
  return (
    <aside className={`${styles.callout} ${styles.measure}`} aria-labelledby="before-you-act">
      <h2 id="before-you-act">Before you act</h2>
      <div className={styles.prose}>{children}</div>
    </aside>
  )
}

export function ResourceUrgentCallout({ children }: { children: ReactNode }) {
  return (
    <aside className={`${styles.urgent} ${styles.measure}`} aria-label="Urgent situation">
      <p>{children}</p>
    </aside>
  )
}

export function ResourceChecklist({
  heading = "Practical checklist",
  items,
}: {
  heading?: string
  items: string[]
}) {
  if (items.length === 0) return null

  return (
    <section className={`${styles.checklist} ${styles.wide}`} aria-labelledby="practical-checklist">
      <h2 id="practical-checklist">{heading}</h2>
      <ol>
        {items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <p>{item}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ResourceCommonMistakes({
  heading = "Where businesses commonly go wrong",
  items,
}: {
  heading?: string
  items: ResourceMistakeItem[]
}) {
  if (items.length === 0) return null

  return (
    <section className={`${styles.mistakes} ${styles.wide}`} aria-labelledby="common-mistakes">
      <h2 id="common-mistakes">{heading}</h2>
      <ol>
        {items.map((item, index) => (
          <li key={typeof item === "string" ? item : item.title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {typeof item === "string" ? (
              <p>{item}</p>
            ) : (
              <div>
                <h3>{item.title}</h3>
                {typeof item.body === "string" ? <p>{item.body}</p> : <div className={styles.prose}>{item.body}</div>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ResourceHowProduced() {
  return (
    <section className={`${styles.howProduced} ${styles.measure}`} aria-labelledby="how-guides-are-produced">
      <h2 id="how-guides-are-produced">How these guides are produced</h2>
      <p>
        ProfileRelaunch resources explain publicly available Google policies and processes in
        plain English for business owners. We link to relevant official guidance and distinguish
        Google&apos;s rules from our practical interpretation. Google may change policies or
        processes, so each guide shows when it was last reviewed.
      </p>
      <p>
        These guides are not legal advice, and they do not claim independent legal verification
        or a Google partnership.
      </p>
    </section>
  )
}

export function ResourceConversion({
  heading,
  body,
  cta,
  href,
  trustLine,
}: {
  heading: string
  body: string
  cta: string
  href: string
  trustLine: string
}) {
  return (
    <section className={`${styles.conversion} ${styles.measure}`} aria-labelledby="resource-conversion">
      <h2 id="resource-conversion">{heading}</h2>
      <p>{body}</p>
      <Link className={styles.conversionCta} href={href}>
        {cta}
      </Link>
      <p className={styles.conversionTrust}>{trustLine}</p>
    </section>
  )
}
