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

const title = "About ReputeDefend | Google Business Profile & Review Support"
const description =
  "Learn who operates ReputeDefend, how the service approaches Google Business Profile and review-related problems, and what evidence-led support can involve."

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
    label: "UK-based independent business",
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
    body: "Support for suspensions, access and verification problems — from understanding what changed and organising relevant evidence to preparing the recovery or appeal route and supporting the next stage.",
    cta: "Explore Profile Recovery",
  },
  {
    href: "/review-protection",
    cue: "Suspicious or damaging reviews",
    title: "Review Protection",
    body: "Support for suspicious or damaging reviews — from assessing the facts and policy position to organising evidence, preparing a reporting or challenge case, or shaping a professional response where appropriate.",
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
    title: "Practical support",
    body: "If you want help carrying the recommendation through, the focus shifts from identifying the next step to helping organise and prepare the work needed for that stage.",
  },
]

const trustPoints = [
  {
    title: "Clear accountability",
    body: "ReputeDefend openly identifies who operates the service and provides direct business contact and legal information.",
  },
  {
    title: "Evidence-aware",
    body: "Recommendations follow the information available rather than pressure to act immediately.",
  },
  {
    title: "Practical support",
    body: "Where further help is wanted, support can move beyond the initial recommendation into organising evidence, preparing material and supporting the next stage.",
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
            ReputeDefend helps businesses deal with Google Business Profile disruptions and difficult review situations with a clearer, evidence-led process. We focus on understanding what happened, identifying what matters and helping you prepare or carry out the strongest appropriate next step.
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
          <p className={styles.heroNote}>Human review • Evidence-led support • Clear next steps</p>
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
          <figcaption>Facts, context and evidence turn a confusing situation into a clearer decision.</figcaption>
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
          <h2 id="identity-title">Clear accountability behind the service.</h2>
        </div>
        <div className={styles.copy}>
          <p>
            ReputeDefend is operated by {operatorLine}. It is a UK-based independent service for businesses dealing with Google Business Profile and review-related reputation problems.
          </p>
          {isSoleTrader() ? (
            <p>ReputeDefend operates as a UK sole-trader business.</p>
          ) : null}
          <p>
            The person operating the service, the business identity and the contact route are stated openly so customers know who they are dealing with.
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
            <p>Platform messages, policies and reporting routes can be difficult to interpret when the business is already under pressure. ReputeDefend exists to bring the facts, evidence and available process together so the owner can make a clearer decision and, where wanted, get help carrying the next stage through.</p>
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
            <p className={styles.eyebrow}>What the service is built around</p>
            <h2 id="trust-title">Clear guidance grounded in the facts and evidence.</h2>
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
          <p>Google makes the final platform decision on matters such as Business Profile reinstatement and review removal. ReputeDefend focuses on what a business can influence: understanding the issue, preparing relevant evidence clearly and approaching the appropriate process in a stronger position.</p>
        </aside>
      </section>

      <section className={styles.closing} aria-labelledby="about-closing-title">
        <div className={styles.closingCopy}>
          <p className={styles.eyebrow}>Need help with a current issue?</p>
          <h2 id="about-closing-title">Start with what happened. You don&apos;t need to diagnose it first.</h2>
          <p>Share the situation, relevant links or messages and what you have already tried. A human will review the information, explain the next step that appears appropriate and, if you want further help, show you what carrying that recommendation through could involve.</p>
          <ul className={styles.closingPoints}>
            <li>Human-reviewed case assessment</li>
            <li>Never send passwords or verification codes</li>
          </ul>
        </div>
        <div className={styles.closingPanel}>
          <p>You don&apos;t need a perfect case file. Start with the situation as it stands and we&apos;ll help identify what matters.</p>
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
