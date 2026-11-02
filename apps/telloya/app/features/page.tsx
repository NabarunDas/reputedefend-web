import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, PhoneIncoming, MessageSquare, CheckCircle2 } from "lucide-react"
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
      <section className={styles.hero} aria-labelledby="features-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="features-title" className={styles.heroTitle}>
            {hero.title}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
        </div>
      </section>

      <div className={styles.body}>
        {/* Workflow visualization */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-label="How Telloya works">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              From missed call to <em>captured enquiry.</em>
            </h2>
            <p className={styles.sectionLead}>Telloya bridges the gap between an unanswered call and a useful lead summary.</p>
          </div>
          <div className={styles.workflowSection}>
            <div className={styles.workflowSteps}>
              <div className={styles.workflowStep}>
                <div className={styles.workflowIcon}>
                  <PhoneIncoming size={32} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className={styles.workflowLabel}>Missed Call</div>
                <div className={styles.workflowDesc}>Customer calls while you&apos;re unavailable</div>
              </div>
              <div className={styles.workflowStep}>
                <div className={styles.workflowIcon}>
                  <MessageSquare size={32} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className={styles.workflowLabel}>AI Conversation</div>
                <div className={styles.workflowDesc}>Telloya collects enquiry details naturally</div>
              </div>
              <div className={styles.workflowStep}>
                <div className={styles.workflowIcon}>
                  <CheckCircle2 size={32} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className={styles.workflowLabel}>Lead Summary</div>
                <div className={styles.workflowDesc}>You receive organized information to follow up</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-label="Product features">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Designed for <em>busy service businesses.</em>
            </h2>
            <p className={styles.sectionLead}>Every feature serves a real need when you&apos;re working on site.</p>
          </div>
          <div className={styles.featuresList}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featureCard}>
                {feature.kicker && <p className={styles.featureKicker}>{feature.kicker}</p>}
                <h3>{feature.title}</h3>
                <div 
                  className={styles.featureStatus} 
                  data-status={feature.status.toLowerCase().includes("available") ? "available" : "future"}
                >
                  {feature.status}
                </div>
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
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="technical-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{technical.eyebrow}</p>
            <h2 id="technical-title" className={styles.sectionTitle}>
              Built with <em>care and transparency.</em>
            </h2>
            <p className={styles.sectionLead}>{technical.lead}</p>
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
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="future-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{future.eyebrow}</p>
            <h2 id="future-title" className={styles.sectionTitle}>
              Looking ahead to <em>even more capability.</em>
            </h2>
            <p className={styles.sectionLead}>{future.lead}</p>
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
        <div className={styles.sectionWrap}>
          <section className={styles.ctaSection} aria-labelledby="cta-title">
            <h2 id="cta-title" className={styles.ctaTitle}>
              Ready to explore <em>what Telloya can do?</em>
            </h2>
            <Link className={styles.ctaButton} href={cta.href}>
              {cta.cta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}
