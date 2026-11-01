import type { Metadata } from "next"
import Link from "next/link"
import { pageTitle } from "@/lib/brand"
import { pricingContent } from "@/lib/content"
import styles from "./pricing.module.css"

const { seo, hero, plans, comparison, commercial, faq, cta } = pricingContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/pricing",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Pricing() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroBand} aria-labelledby="pricing-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="pricing-title">{hero.title}</h1>
          <p className={styles.lead}>{hero.lead}</p>
        </div>
      </section>

      {/* Plans */}
      <section className={styles.plansSection} aria-label="Pricing plans">
        <div className={styles.plansGrid}>
          {plans.map((plan) => (
            <article key={plan.name} className={styles.planCard}>
              <h3>{plan.name}</h3>
              <p className={styles.planTagline}>{plan.tagline}</p>
              <p className={styles.planDescription}>{plan.description}</p>
              <div className={styles.planStatus}>{plan.status}</div>
              <ul className={styles.planFeatures}>
                {plan.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
              {plan.notes && plan.notes.length > 0 && (
                <div className={styles.planNotes}>
                  {plan.notes.map((note, index) => (
                    <p key={index} className={styles.planNote}>
                      {note}
                    </p>
                  ))}
                </div>
              )}
              <Link className={styles.planCta} href={plan.href}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className={styles.comparisonSection} aria-labelledby="comparison-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{comparison.eyebrow}</p>
          <h2 id="comparison-title">{comparison.title}</h2>
          <p>{comparison.lead}</p>
        </div>
        <div className={styles.tableContainer}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                {comparison.table.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.table.rows.map((row, index) => (
                <tr key={index}>
                  <td>{row[0]}</td>
                  <td>
                    {row[1] ? (
                      <span className={styles.checkmark}>✓</span>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                  <td>
                    {row[2] ? (
                      <span className={styles.checkmark}>✓</span>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Commercial */}
      <section className={styles.commercialSection} aria-labelledby="commercial-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{commercial.eyebrow}</p>
          <h2 id="commercial-title">{commercial.title}</h2>
        </div>
        <div className={styles.commercialGrid}>
          {commercial.points.map((point) => (
            <article key={point.title} className={styles.commercialCard}>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.sectionIntro}>
          <h2 id="faq-title">{faq.title}</h2>
        </div>
        <div className={styles.faqList}>
          {faq.questions.map((item) => (
            <article key={item.q} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{item.q}</h3>
              <p className={styles.faqAnswer}>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <div className={styles.ctaContent}>
          <h2 id="cta-title">{cta.title}</h2>
          <p>{cta.description}</p>
          <Link className={styles.ctaButton} href={cta.href}>
            {cta.cta}
          </Link>
        </div>
      </section>
    </div>
  )
}
