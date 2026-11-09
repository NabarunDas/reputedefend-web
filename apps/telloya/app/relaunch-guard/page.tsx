import type { Metadata } from "next"
import Link from "next/link"
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { relaunchGuardOverview as copy } from "@/lib/relaunch-guard-overview"
import styles from "./guard.module.css"

export const metadata: Metadata = {
  title: absolutePageTitle(copy.seo.title),
  description: copy.seo.description,
  alternates: { canonical: "/relaunch-guard" },
  ...pageSocialMetadata({ title: copy.seo.title, description: copy.seo.description, path: "/relaunch-guard" }),
}

export default function RelaunchGuardPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="guard-overview-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
          <h1 id="guard-overview-title" className={styles.heroTitle}>{copy.hero.title}</h1>
          <p className={styles.heroLead}>{copy.hero.lead}</p>
          <div className={styles.actions}>
            <Link href={copy.actions.enquireHref} className={styles.primary}>{copy.actions.enquireLabel}</Link>
            <a className={styles.secondary} href={copy.actions.externalHref} target="_blank" rel="noopener noreferrer">
              {copy.actions.externalLabel}
              <span className={styles.visuallyHidden}> (opens in a new tab)</span>
            </a>
          </div>
          <p className={styles.heroNote}>{copy.actions.enquireNote}</p>
        </div>
      </section>

      <div className={styles.body}>
        <section className={styles.section} aria-labelledby="difference-title">
          <h2 id="difference-title">{copy.difference.title}</h2>
          <div className={styles.split}>
            <article>
              <h3>{copy.difference.telloya.title}</h3>
              <p>{copy.difference.telloya.text}</p>
            </article>
            <article>
              <h3>{copy.difference.guard.title}</h3>
              <p>{copy.difference.guard.text}</p>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="checks-title">
          <h2 id="checks-title">{copy.checks.title}</h2>
          <div className={styles.cards}>
            {copy.checks.cards.map((card) => (
              <article key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
          <p className={styles.note}>{copy.checks.note}</p>
        </section>

        <section className={styles.section} aria-labelledby="schedule-title">
          <h2 id="schedule-title">{copy.schedule.title}</h2>
          <p>{copy.schedule.body}</p>
          <p>{copy.schedule.followUp}</p>
          <p className={styles.note}>{copy.schedule.supporting}</p>
        </section>

        <section className={styles.section} aria-labelledby="access-title">
          <h2 id="access-title">{copy.access.title}</h2>
          <p>{copy.access.body}</p>
          <p className={styles.note}>{copy.access.boundary}</p>
        </section>

        <section className={styles.section} aria-labelledby="price-title">
          <h2 id="price-title">{copy.price.title}</h2>
          <p className={styles.price}>{copy.price.amount}</p>
          <p>{copy.price.independence}</p>
          <p>{copy.price.entitlement}</p>
          <p className={styles.note}>{copy.price.interest}</p>
        </section>

        <section className={styles.section} aria-labelledby="limits-title">
          <h2 id="limits-title">{copy.limits.title}</h2>
          <ul>
            {copy.limits.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="authority-title">
          <h2 id="authority-title">{copy.authority.title}</h2>
          <p>{copy.authority.body}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href={copy.actions.externalHref} target="_blank" rel="noopener noreferrer">
              {copy.actions.externalLabel}
              <span className={styles.visuallyHidden}> (opens in a new tab)</span>
            </a>
            <Link href={copy.actions.enquireHref} className={styles.secondary}>{copy.actions.enquireLabel}</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
