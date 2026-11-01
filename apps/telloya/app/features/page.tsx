import type { Metadata } from "next"
import Link from "next/link"
import { pageTitle } from "@/lib/brand"
import { featuresContent } from "@/lib/content"
import styles from "./features.module.css"

const { seo, hero, features, technical, future, cta } = featuresContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/features" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/features",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Features() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroBand} aria-labelledby="features-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="features-title">{hero.title}</h1>
          <p className={styles.lead}>{hero.lead}</p>
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection} aria-label="Product features">
        <div className={styles.featuresList}>
          {features.map((feature) => (
            <article key={feature.title} className={styles.featureCard}>
              {feature.kicker && <p className={styles.featureKicker}>{feature.kicker}</p>}
              <h3>{feature.title}</h3>
              <div className={styles.featureStatus}>{feature.status}</div>
              <p className={styles.featureDescription}>{feature.description}</p>
              {feature.points && feature.points.length > 0 && (
                <ul className={styles.featurePoints}>
                  {feature.points.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              )}
              {"note" in feature && feature.note && (
                <div className={styles.featureNote}>{feature.note}</div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Technical */}
      <section className={styles.technicalSection} aria-labelledby="technical-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{technical.eyebrow}</p>
          <h2 id="technical-title">{technical.title}</h2>
          <p>{technical.lead}</p>
        </div>
        <div className={styles.technicalGrid}>
          {technical.points.map((point, index) => (
            <div key={index} className={styles.technicalCard}>
              {point}
            </div>
          ))}
        </div>
      </section>

      {/* Future */}
      <section className={styles.futureSection} aria-labelledby="future-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{future.eyebrow}</p>
          <h2 id="future-title">{future.title}</h2>
          <p>{future.lead}</p>
        </div>
        <div className={styles.futureGrid}>
          {future.items.map((item) => (
            <article key={item.title} className={styles.futureCard}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <span className={styles.timeline}>{item.timeline}</span>
            </article>
          ))}
        </div>
        <p className={styles.futureNote}>{future.note}</p>
      </section>

      {/* CTA */}
      <section className={styles.ctaSection} aria-labelledby="cta-title">
        <div className={styles.ctaContent}>
          <h2 id="cta-title">{cta.title}</h2>
          <Link className={styles.ctaButton} href={cta.href}>
            {cta.cta}
          </Link>
        </div>
      </section>
    </div>
  )
}
