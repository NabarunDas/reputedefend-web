import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowUpRight, Check } from "lucide-react"
import { pageTitle } from "@/lib/brand"
import { homepageContent } from "@/lib/content"
import styles from "./homepage.module.css"

const { seo, hero, problem, howItWorks, benefits, example, audience, plans, faq, finalCta } = homepageContent

export const metadata: Metadata = {
  title: { absolute: pageTitle(seo.title) },
  description: seo.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

function CinematicConsole() {
  return null
}

export default function Home() {
  return (
    <div className={styles.page}>
      {/* Immersive Cinematic Hero */}
      <section className={styles.cinematicHero} aria-labelledby="home-title">
        {/* Atmospheric Background Layers */}
        <div className={styles.atmosphericLayer1}></div>
        <div className={styles.atmosphericLayer2}></div>
        <div className={styles.atmosphericLayer3}></div>
        <div className={styles.atmosphericGlow}></div>
        
        {/* Hero Content Container */}
        <div className={styles.heroContainer}>
          {/* Integrated Logo */}
          <div className={styles.heroLogoArea}>
            <div className={styles.heroLogoMark}>
              <Image
                src="/brand/telloya-mark-approved.webp"
                alt=""
                width={48}
                height={48}
                priority
                className={styles.logoIcon}
              />
            </div>
            <span className={styles.heroLogoText}>Telloya</span>
          </div>

          {/* Centered Hero Content */}
          <div className={styles.heroContent}>
            <h1 id="home-title" className={styles.heroTitle}>
              <span className={styles.heroTitleLine1}>Your AI Receptionist</span>
              <span className={styles.heroTitleLine2}>Never Misses a Call</span>
            </h1>
            <p className={styles.heroSubtitle}>{hero.supporting}</p>
            <div className={styles.heroActions}>
              <Link className={styles.heroPrimaryButton} href={hero.primaryHref}>
                {hero.primaryCta}
                <ArrowUpRight aria-hidden="true" size={18} />
              </Link>
              <Link className={styles.heroSecondaryButton} href={hero.secondaryHref}>
                {hero.secondaryCta}
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
          </div>

          {/* Integrated Console Artwork */}
          <div className={styles.consoleScene}>
            <div className={styles.consoleGlowRing}></div>
            <div className={styles.consoleArtwork}>
              <picture>
                <source 
                  media="(min-width: 768px)" 
                  srcSet="/brand/telloya-cinematic-console.webp"
                />
                <Image
                  src="/brand/telloya-cinematic-console-mobile.webp"
                  alt="AI receptionist dashboard interface"
                  width={1672}
                  height={604}
                  priority
                  className={styles.consoleImage}
                  sizes="(min-width: 768px) 1400px, 100vw"
                />
              </picture>
            </div>
            <div className={styles.consoleBloom}></div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className={styles.trustStrip} aria-label="How Telloya works">
        <ul>
          <li>Never miss an enquiry</li>
          <li>Professional call handling</li>
          <li>Clear lead summaries</li>
          <li>Designed for tradespeople</li>
        </ul>
      </section>

      {/* Problem */}
      <section className={styles.situations} aria-labelledby="situations-title">
        <div className={styles.situationIntro}>
          <p className={styles.eyebrow}>{problem.eyebrow}</p>
          <h2 id="situations-title">{problem.title}</h2>
          <p>{problem.lead}</p>
        </div>
        <ol className={styles.problemList}>
          {problem.points.map((point, index) => (
            <li key={point}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {point}
            </li>
          ))}
        </ol>
      </section>

      {/* How It Works */}
      <section className={styles.process} aria-labelledby="process-title">
        <div className={styles.processIntro}>
          <div>
            <p className={styles.eyebrow}>{howItWorks.eyebrow}</p>
            <h2 id="process-title">{howItWorks.title}</h2>
          </div>
          <p>{howItWorks.lead}</p>
        </div>
        <ol className={styles.processList}>
          {howItWorks.steps.map((step) => (
            <li key={step.number}>
              <span className={styles.processNumber}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <p className={styles.processNote}>{howItWorks.note}</p>
      </section>

      {/* Benefits */}
      <section className={styles.benefitsBand} aria-labelledby="benefits-title">
        <div className={styles.benefitsIntro}>
          <p className={styles.eyebrow}>{benefits.eyebrow}</p>
          <h2 id="benefits-title">{benefits.title}</h2>
        </div>
        <div className={styles.benefitsGrid}>
          {benefits.items.map((item) => (
            <article key={item.title} className={styles.benefitCard}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Example */}
      <section className={styles.example} aria-labelledby="example-title">
        <div className={styles.exampleIntro}>
          <p className={styles.eyebrow}>{example.eyebrow}</p>
          <h2 id="example-title">{example.title}</h2>
          <p>{example.lead}</p>
        </div>
        <div className={styles.leadCard}>
          <p className={styles.leadLabel}>{example.card.label}</p>
          <div className={styles.leadHeader}>
            <h3>{example.card.caller}</h3>
            <p className={styles.leadTime}>{example.card.time}</p>
          </div>
          <dl className={styles.leadDetails}>
            <div>
              <dt>Service</dt>
              <dd>{example.card.service}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{example.card.location}</dd>
            </div>
            <div>
              <dt>Problem</dt>
              <dd>{example.card.problem}</dd>
            </div>
            <div>
              <dt>Callback</dt>
              <dd>{example.card.callback}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Audience */}
      <section className={styles.audienceBand} aria-labelledby="audience-title">
        <div className={styles.audienceIntro}>
          <p className={styles.eyebrow}>{audience.eyebrow}</p>
          <h2 id="audience-title">{audience.title}</h2>
          <p>{audience.lead}</p>
        </div>
        <div className={styles.audienceGrid}>
          {audience.industries.map((industry) => (
            <div key={industry} className={styles.industryCard}>
              <p>{industry}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section className={styles.pricing} aria-labelledby="pricing-title">
        <div className={styles.pricingIntro}>
          <p className={styles.eyebrow}>{plans.eyebrow}</p>
          <h2 id="pricing-title">{plans.title}</h2>
          <p>{plans.lead}</p>
        </div>
        <div className={styles.plansGrid}>
          <article className={styles.planCard}>
            <h3>{plans.telloya.name}</h3>
            <p className={styles.planDescription}>{plans.telloya.description}</p>
            <ul>
              {plans.telloya.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            <Link className={styles.planCta} href={plans.telloya.href}>
              {plans.telloya.cta}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </article>
          <article className={styles.planCard}>
            <h3>{plans.complete.name}</h3>
            <p className={styles.planDescription}>{plans.complete.description}</p>
            <ul>
              {plans.complete.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            <p className={styles.planNote}>{plans.complete.note}</p>
            <Link className={styles.planCta} href={plans.complete.href}>
              {plans.complete.cta}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </article>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div>
          <p className={styles.eyebrow}>{faq.eyebrow}</p>
          <h2 id="faq-title">{faq.title}</h2>
        </div>
        <div className={styles.faqList}>
          {faq.questions.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.conversionBand} aria-labelledby="cta-title">
        <div className={styles.conversion}>
          <div>
            <h2 id="cta-title">{finalCta.title}</h2>
            <Link className={styles.ctaButton} href={finalCta.href}>
              {finalCta.cta}
              <ArrowUpRight aria-hidden="true" size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
