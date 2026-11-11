import type { Metadata } from "next"
import Link from "next/link"
import { 
  ArrowUpRight,
  Wrench,
  Zap,
  Headphones,
  ShieldCheck,
  Sparkles 
} from "lucide-react"
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { industriesContent } from "@/lib/content"
import styles from "./industries.module.css"

const { seo, hero, exampleNotice, industries, universal, cta } = industriesContent

const industryIcons = [Wrench, Zap, Headphones, ShieldCheck, Sparkles] as const

export const metadata: Metadata = {
  title: absolutePageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/industries" },
  ...pageSocialMetadata({ title: seo.title, description: seo.description, path: "/industries" }),
}

export default function Industries() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero} aria-labelledby="industries-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="industries-title" className={styles.heroTitle}>
            {hero.title}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
        </div>
      </section>

      <div className={styles.body}>
        <p className={styles.exampleNotice} role="note">{exampleNotice}</p>
        {/* Industries */}
        {industries.map((industry, index) => {
          const Icon = industryIcons[index] ?? Sparkles
          const exampleId = `example-${industry.name.toLowerCase().replace(/\s+/g, "-")}`
          return (
            <section
              key={industry.name}
              className={styles.industrySection}
              aria-labelledby={`industry-${industry.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className={styles.industryContent}>
                <div className={styles.industryHeader}>
                  <div className={styles.industryIcon}>
                    <Icon size={38} strokeWidth={1.4} aria-hidden="true" />
                  </div>
                  <h2 id={`industry-${industry.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    {industry.name}
                  </h2>
                  <p className={styles.industryTagline}>{industry.tagline}</p>
                  <p className={styles.industryDescription}>{industry.description}</p>
                </div>
                <article className={styles.useCase} aria-labelledby={exampleId}>
                  <p className={styles.useCaseKicker}>Illustrative example</p>
                  <h3 id={exampleId}>{industry.example.title}</h3>
                  <dl className={styles.useCaseGrid}>
                    <div>
                      <dt>What the caller says</dt>
                      <dd>{industry.example.caller}</dd>
                    </div>
                    <div>
                      <dt>What Telloya could ask</dt>
                      <dd>{industry.example.questions}</dd>
                    </div>
                    <div>
                      <dt>What the business receives</dt>
                      <dd>{industry.example.summary}</dd>
                    </div>
                  </dl>
                  <p className={styles.useCaseNext}>
                    A personalised demonstration can use questions like these for your business.{" "}
                    <Link href={cta.href}>{cta.cta}</Link>
                  </p>
                </article>
                <div className={styles.industryDetails}>
                  {industry.scenarios.map((scenario) => (
                    <article key={scenario.title} className={styles.scenarioCard}>
                      <h4>{scenario.title}</h4>
                      <div className={styles.scenarioDetail}>
                        <p className={styles.scenarioLabel}>Situation</p>
                        <p className={styles.scenarioText}>{scenario.situation}</p>
                      </div>
                      <div className={styles.scenarioDetail}>
                        <p className={styles.scenarioLabel}>Telloya helps</p>
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
          )
        })}

        {/* Universal */}
        <section className={styles.universalSection} aria-labelledby="universal-title">
          <div className={styles.universalContent}>
            <div className={styles.sectionHeader}>
              <p className={styles.eyebrow}>{universal.eyebrow}</p>
              <h2 id="universal-title" className={styles.sectionTitle}>
                Designed for <em>more service businesses.</em>
              </h2>
              <p className={styles.sectionLead}>{universal.lead}</p>
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
        <div className={styles.sectionWrap}>
          <section className={styles.ctaSection} aria-labelledby="cta-title">
            <h2 id="cta-title" className={styles.ctaTitle}>{cta.title}</h2>
            <p className={styles.ctaDescription}>{cta.description}</p>
            <p className={styles.ctaReassurance}>{cta.reassurance}</p>
            <div className={styles.ctaActions}>
              <Link className={styles.ctaButton} href={cta.href}>
                {cta.cta} <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className={styles.ctaSecondary} href={cta.secondaryHref}>
                {cta.secondaryCta}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
