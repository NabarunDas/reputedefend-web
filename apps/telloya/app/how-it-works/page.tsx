import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { pageTitle } from "@/lib/brand"
import { howItWorksContent } from "@/lib/content"
import styles from "./how-it-works.module.css"

const { seo, hero, journey, experience, setup, limitations, cta } = howItWorksContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/how-it-works",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function HowItWorks() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero} aria-labelledby="how-it-works-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="how-it-works-title" className={styles.heroTitle}>
            {hero.title}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
        </div>
      </section>

      <div className={styles.body}>
        {/* Journey Steps */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="journey-title">
          <div className={styles.sectionHeader}>
            <h2 id="journey-title" className={styles.sectionTitle}>
              A smarter way to <em>handle enquiries.</em>
            </h2>
            <p className={styles.sectionLead}>{journey.title}</p>
          </div>
          <div className={styles.journeySteps}>
            {journey.steps.map((step) => (
              <article key={step.number} className={styles.stepCard}>
                <div className={styles.stepNumber}>{step.number}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="experience-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{experience.eyebrow}</p>
            <h2 id="experience-title" className={styles.sectionTitle}>
              From first ring to <em>captured enquiry.</em>
            </h2>
            <p className={styles.sectionLead}>{experience.lead}</p>
          </div>
          <div className={styles.exampleBox}>
            <p className={styles.exampleGreeting}>{experience.example.greeting}</p>
            <ul className={styles.flowList}>
              {experience.example.flow.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <p className={styles.exampleNote}>{experience.example.note}</p>
          </div>
        </section>

        {/* Setup */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="setup-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{setup.eyebrow}</p>
            <h2 id="setup-title" className={styles.sectionTitle}>
              Simple setup, <em>powerful results.</em>
            </h2>
            <p className={styles.sectionLead}>{setup.lead}</p>
          </div>
          <div className={styles.setupGrid}>
            {setup.steps.map((step, index) => (
              <article key={index} className={styles.setupCard}>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
          <p className={styles.setupNote}>{setup.note}</p>
        </section>

        {/* Limitations */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="limitations-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{limitations.eyebrow}</p>
            <h2 id="limitations-title" className={styles.sectionTitle}>
              What Telloya <em>can and cannot do.</em>
            </h2>
            <p className={styles.sectionLead}>{limitations.lead}</p>
          </div>
          <div className={styles.limitationsBox}>
            <ul className={styles.limitationsList}>
              {limitations.points.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <div className={styles.sectionWrap}>
          <section className={styles.ctaSection} aria-labelledby="cta-title">
            <h2 id="cta-title" className={styles.ctaTitle}>
              Ready to see how Telloya <em>works for you?</em>
            </h2>
            <p className={styles.ctaDescription}>{cta.description}</p>
            <Link className={styles.ctaButton} href={cta.href}>
              {cta.cta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}
