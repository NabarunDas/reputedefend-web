import type { Metadata } from "next"
import { pageSocialMetadata } from "@/lib/brand"
import {
  cookiesAnalytics,
  cookiesChoice,
  cookiesHero,
  cookiesIntro,
  cookiesNecessary,
  cookiesOperator,
  cookiesSeo,
  operatorPrivacyHref,
} from "./content"
import styles from "./cookies.module.css"

export const metadata: Metadata = {
  title: cookiesSeo.title,
  description: cookiesSeo.description,
  alternates: { canonical: "/cookies" },
  ...pageSocialMetadata({ title: cookiesSeo.title, description: cookiesSeo.description, path: "/cookies" }),
}

export default function CookiesPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="cookies-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{cookiesHero.eyebrow}</p>
          <h1 id="cookies-title" className={styles.heroTitle}>{cookiesHero.title}</h1>
          <p className={styles.heroLead}>{cookiesHero.lead}</p>
        </div>
      </section>
      <div className={styles.body}>
        <div className={styles.sectionWrap}>
          <section className={styles.section} aria-labelledby="cookies-covers">
            <h2 id="cookies-covers" className={styles.sectionTitle}>What this page covers</h2>
            {cookiesIntro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className={styles.section} aria-labelledby="cookies-necessary">
            <h2 id="cookies-necessary" className={styles.sectionTitle}>{cookiesNecessary.title}</h2>
            {cookiesNecessary.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className={styles.section} aria-labelledby="cookies-analytics">
            <h2 id="cookies-analytics" className={styles.sectionTitle}>{cookiesAnalytics.title}</h2>
            {cookiesAnalytics.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className={styles.section} aria-labelledby="cookies-choice">
            <h2 id="cookies-choice" className={styles.sectionTitle}>{cookiesChoice.title}</h2>
            {cookiesChoice.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className={styles.section} aria-labelledby="cookies-operator">
            <h2 id="cookies-operator" className={styles.sectionTitle}>{cookiesOperator.title}</h2>
            {cookiesOperator.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <p>
              Read the operator&apos;s privacy notice at{" "}
              <a href={operatorPrivacyHref} rel="noopener noreferrer">{operatorPrivacyHref}</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
