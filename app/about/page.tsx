import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Info,
  Landmark,
  Shield,
  UserRound,
  UserRoundCheck,
} from "lucide-react"
import { isSoleTrader, legalIdentity, tradingAsLine } from "@/lib/legal"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import styles from "./about.module.css"

const title = "About ReputeDefend | Independent Reputation Support"
const description =
  "Learn about ReputeDefend, an independent UK service operated by Saswati Das, helping businesses understand Google Business Profile and review-related reputation issues."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: socialOpenGraph({ title, description, path: "/about" }),
  twitter: socialTwitter({ title, description }),
}

const visualSteps = [
  { n: "01", title: "Facts" },
  { n: "02", title: "Context" },
  { n: "03", title: "Options" },
  { n: "04", title: "Clear next step" },
] as const

const identityStrip = [
  {
    label: legalIdentity.legalName ? `Operated by ${legalIdentity.legalName}` : "Independent service",
    icon: UserRound,
  },
  {
    label: isSoleTrader() ? "UK sole-trader business" : "Independent UK business",
    icon: Landmark,
  },
  { label: "Independent of Google", icon: Shield },
  { label: "Human-reviewed enquiries", icon: UserRoundCheck },
] as const

const whyPrinciples = [
  {
    title: "Understand before acting",
    body: "Start with what actually happened before making more changes or assumptions.",
  },
  {
    title: "Evidence before escalation",
    body: "Use relevant information to support the next action rather than relying on suspicion alone.",
  },
  {
    title: "Explain the recommendation",
    body: "Customers should understand what the recommended route is and why it makes sense.",
  },
]

const services = [
  {
    href: "/business-profile-recovery",
    cue: "Suspension • Access • Verification",
    title: "Business Profile Protection & Recovery",
    body: "Support when a Google Business Profile is suspended, inaccessible, stuck in verification or affected by another account or profile issue.",
    cta: "Explore Profile Recovery",
  },
  {
    href: "/review-protection",
    cue: "Suspicious or damaging reviews",
    title: "Review Protection",
    body: "Support when a review raises questions about authenticity, policy, evidence, reporting or the right public response.",
    cta: "Explore Review Protection",
  },
]

const approach = [
  {
    n: "01",
    title: "Human review",
    body: "Each enquiry is considered in context rather than reduced to a generic automated answer.",
  },
  {
    n: "02",
    title: "Facts before assumptions",
    body: "We separate what can be supported from what is suspected, possible or still unknown.",
  },
  {
    n: "03",
    title: "Clear communication",
    body: "We explain what we understand, what may still need clarification and what next step appears appropriate.",
  },
  {
    n: "04",
    title: "Customer control",
    body: "Submitting an enquiry does not commit you to paid support. If further work is appropriate, the proposed scope and fee are explained before you decide.",
  },
]

const trustPoints = [
  {
    title: "Independent of Google",
    body: "ReputeDefend does not claim special access or control over platform decisions.",
  },
  {
    title: "Evidence-aware",
    body: "Recommendations follow the information available, not pressure to act immediately.",
  },
  {
    title: "No hidden commitment",
    body: "Sending an enquiry asks for a human review. Further paid support is explained before you decide.",
  },
]

export default function AboutPage() {
  const operatorLine = tradingAsLine()

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} ${styles.enter}`} aria-labelledby="about-title">
        <div>
          <p className={styles.eyebrow}>About ReputeDefend</p>
          <h1 id="about-title">
            <span>Human support</span> for difficult Google reputation problems.
          </h1>
          <p className={styles.lead}>
            ReputeDefend helps businesses make sense of Google Business Profile disruptions and difficult review situations. We focus on understanding what happened, identifying the information that matters and helping you take a clearer next step.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/get-help">
              Tell us what happened
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className={styles.secondaryButton} href="/how-it-works">
              See how ReputeDefend works
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.heroNote}>Human review • Independent of Google • Clear next steps</p>
        </div>
        <figure className={styles.visual}>
          <ol className={styles.visualBoard}>
            {visualSteps.map((step, index) => (
              <li key={step.n} className={index === visualSteps.length - 1 ? styles.visualFinal : undefined}>
                {index === visualSteps.length - 1 ? (
                  <span className={styles.visualCheck} aria-hidden="true"><Check size={16} /></span>
                ) : (
                  <span className={styles.visualN} aria-hidden="true">{step.n}</span>
                )}
                <strong>{step.title}</strong>
              </li>
            ))}
          </ol>
          <figcaption>Technology can organise information. Reputation decisions still need context.</figcaption>
        </figure>
      </section>

      <section className={styles.trustStrip} aria-label="Who operates ReputeDefend">
        <ul>
          {identityStrip.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span className={styles.stripIcon}>
                <Icon aria-hidden="true" size={18} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.identity} aria-labelledby="identity-title">
        <div>
          <p className={styles.eyebrow}>Who is behind ReputeDefend?</p>
          <h2 id="identity-title">A real business, clearly identified.</h2>
        </div>
        <div className={styles.copy}>
          <p>
            ReputeDefend is operated by {operatorLine}. The service provides independent support to businesses dealing with Google Business Profile and review-related reputation issues.
          </p>
          {isSoleTrader() ? (
            <p>ReputeDefend is an independent UK sole-trader business.</p>
          ) : null}
          <p>
            The aim is straightforward: help businesses understand the situation, organise the information that matters and make a more informed decision about what to do next.
          </p>
          <p className={styles.identityNote}>
            ReputeDefend&apos;s legal identity and contact details are stated openly across the site&apos;s{" "}
            <Link href="/disclaimer">legal information</Link>.
          </p>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Why ReputeDefend exists</p>
            <h2 id="why-title">Platform problems can leave businesses with plenty of information — but very little clarity.</h2>
          </div>
          <div>
            <p>When a Business Profile is suspended, verification stalls or a damaging review appears, the immediate question is usually simple: what should I do now?</p>
            <p>Platform messages, policies and reporting routes can be difficult to interpret when the business is already under pressure. ReputeDefend exists to help turn that uncertainty into a structured next step.</p>
          </div>
        </header>
        <ul className={styles.whyGrid}>
          {whyPrinciples.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="help-title">
        <header className={styles.centerHead}>
          <p className={styles.eyebrow}>What we help with</p>
          <h2 id="help-title">Two types of reputation problem. One evidence-led approach.</h2>
        </header>
        <div className={styles.serviceGrid}>
          {services.map((item) => (
            <article key={item.href}>
              <p className={styles.serviceCue}>{item.cue}</p>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <Link className={styles.serviceCta} href={item.href}>
                {item.cta}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="approach-title">
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>How we work</p>
            <h2 id="approach-title">Careful enough to understand the detail. Practical enough to move forward.</h2>
          </div>
        </header>
        <ol className={styles.approachGrid}>
          {approach.map((item) => (
            <li key={item.n}>
              <span aria-hidden="true">{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.trust} aria-labelledby="trust-title">
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Independent support</p>
            <h2 id="trust-title">Clear guidance without pretending to control the platform.</h2>
          </div>
        </header>
        <ul className={styles.trustGrid}>
          {trustPoints.map((item) => (
            <li key={item.title}>
              <span className={styles.trustIcon}><Check aria-hidden="true" size={18} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
        <aside className={styles.callout}>
          <Info aria-hidden="true" size={20} />
          <p>Google ultimately controls platform decisions such as profile reinstatement and review removal. ReputeDefend focuses on the part a business can influence: understanding the issue, preparing relevant information and approaching the next step clearly.</p>
        </aside>
      </section>

      <section className={styles.closing} aria-labelledby="about-closing-title">
        <div className={styles.closingCopy}>
          <p className={styles.eyebrow}>Need help with a current issue?</p>
          <h2 id="about-closing-title">Start with what happened. You don&apos;t need to diagnose it first.</h2>
          <p>Share the situation, relevant links or messages and what you have already tried. A human will review the information and help you understand the next practical step.</p>
          <ul className={styles.closingPoints}>
            <li>No payment is required to submit an enquiry.</li>
            <li>Submitting your case does not commit you to paid support.</li>
          </ul>
        </div>
        <div className={styles.closingPanel}>
          <p>Tell us what happened. You do not need a perfect case file before getting in touch.</p>
          <Link className={styles.primaryButton} href="/get-help">
            Tell us what happened
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <p className={styles.closingLinks}>
            <Link href="/contact">Ask a general question</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
