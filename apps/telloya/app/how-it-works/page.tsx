import type { Metadata } from "next"
import Link from "next/link"
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
      <section className={styles.heroBand} aria-labelledby="how-it-works-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="how-it-works-title">{hero.title}</h1>
          <p className={styles.lead}>{hero.lead}</p>
        </div>
      </section>

      {/* Journey Steps */}
      <section className={styles.journeySection} aria-labelledby="journey-title">
        <div className={styles.sectionIntro}>
          <h2 id="journey-title">{journey.title}</h2>
        </div>
        <div className={styles.stepsList}>
          {journey.steps.map((step) => (
            <article key={step.number} className={styles.stepCard}>
              <div className={styles.stepNumber}>{step.number}</div>
              <div className={styles.stepContent}>
                <h3>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
                {step.detail && <div className={styles.stepDetail}>{step.detail}</div>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className={styles.experienceSection} aria-labelledby="experience-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{experience.eyebrow}</p>
          <h2 id="experience-title">{experience.title}</h2>
          <p>{experience.lead}</p>
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
      <section className={styles.setupSection} aria-labelledby="setup-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{setup.eyebrow}</p>
          <h2 id="setup-title">{setup.title}</h2>
          <p>{setup.lead}</p>
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
      <section className={styles.limitationsSection} aria-labelledby="limitations-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>{limitations.eyebrow}</p>
          <h2 id="limitations-title">{limitations.title}</h2>
          <p>{limitations.lead}</p>
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
