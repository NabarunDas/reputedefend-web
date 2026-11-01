import type { Metadata } from "next"
import Link from "next/link"
import { pageTitle } from "@/lib/brand"
import { industriesContent } from "@/lib/content"
import styles from "./industries.module.css"

const { seo, hero, industries, universal, cta } = industriesContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/industries" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/industries",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Industries() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroBand} aria-labelledby="industries-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="industries-title">{hero.title}</h1>
          <p className={styles.lead}>{hero.lead}</p>
        </div>
      </section>

      {/* Industries */}
      {industries.map((industry) => (
        <section
          key={industry.name}
          className={styles.industrySection}
          aria-labelledby={`industry-${industry.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <div className={styles.industryContent}>
            <div className={styles.industryHeader}>
              <h2 id={`industry-${industry.name.toLowerCase().replace(/\s+/g, "-")}`}>
                {industry.name}
              </h2>
              <p className={styles.industryTagline}>{industry.tagline}</p>
              <p className={styles.industryDescription}>{industry.description}</p>
            </div>
            <div className={styles.industryDetails}>
              <h3 className={styles.scenariosTitle}>Example scenarios</h3>
              {industry.scenarios.map((scenario) => (
                <article key={scenario.title} className={styles.scenarioCard}>
                  <h4>{scenario.title}</h4>
                  <div className={styles.scenarioDetail}>
                    <p className={styles.scenarioLabel}>Situation:</p>
                    <p className={styles.scenarioText}>{scenario.situation}</p>
                  </div>
                  <div className={styles.scenarioDetail}>
                    <p className={styles.scenarioLabel}>Telloya helps:</p>
                    <p className={styles.scenarioText}>{scenario.telletoyaHelps}</p>
                  </div>
                </article>
              ))}
              <div className={styles.benefitsBox}>
                <h4>Key benefits for {industry.name.toLowerCase()}</h4>
                <ul className={styles.benefitsList}>
                  {industry.benefits.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Universal */}
      <section className={styles.universalSection} aria-labelledby="universal-title">
        <div className={styles.universalContent}>
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>{universal.eyebrow}</p>
            <h2 id="universal-title">{universal.title}</h2>
            <p>{universal.lead}</p>
          </div>
          <div className={styles.universalGrid}>
            {universal.examples.map((example) => (
              <div key={example} className={styles.exampleCard}>
                <p>{example}</p>
              </div>
            ))}
          </div>
        </div>
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
