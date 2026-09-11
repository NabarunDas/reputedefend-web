import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Info,
  ListChecks,
  Lock,
  Plus,
  Shield,
  Store,
  UserRoundCheck,
  Wallet,
  MessageSquareText,
} from "lucide-react"
import { EnquiryForm } from "@/components/enquiry-form"
import { homepageFaqs } from "@/lib/homepage-content"
import styles from "./homepage.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>
}

function CaseVisual() {
  return (
    <figure className={styles.caseVisual} aria-label="From a changed Google presence to a clearer next step">
      <div className={styles.flowCard}>
        <p className={styles.flowLabel}>Something changed</p>
        <ul className={styles.changeList}>
          <li>Profile suspended</li>
          <li>Verification issue</li>
          <li>Suspicious review</li>
        </ul>
      </div>
      <div className={styles.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={styles.flowCard}>
        <p className={styles.flowLabel}>Understand the situation</p>
        <p className={styles.flowCopy}>Review the facts, messages and history.</p>
      </div>
      <div className={styles.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={`${styles.flowCard} ${styles.flowCardAction}`}>
        <span className={styles.flowCheck} aria-hidden="true"><Check size={18} /></span>
        <div>
          <p className={styles.flowLabel}>Take the right next step</p>
          <p className={styles.flowCopy}>Know what to do next — and why.</p>
        </div>
      </div>
      <figcaption className={styles.visualNote}>From uncertainty to a clearer way forward.</figcaption>
    </figure>
  )
}

export function HomeHero() {
  return (
    <section className={`${styles.hero} ${styles.enter}`} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <Eyebrow>Google Business Profile &amp; Review Support</Eyebrow>
        <h1 id="home-title">Your Google presence shouldn&apos;t be <span>costing you customers.</span></h1>
        <p className={styles.lead}>If your Business Profile has been suspended, you&apos;ve lost access, verification has stalled or suspicious reviews are damaging trust, the uncertainty can quickly affect your business. ReputeDefend helps you understand what happened, build the strongest appropriate case and take the right next step.</p>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/get-help">Tell us what happened <ArrowUpRight aria-hidden="true" size={18} /></Link>
          <Link className={styles.secondaryButton} href="#home-services">See how we can help <ArrowDown aria-hidden="true" size={18} /></Link>
        </div>
        <p className={styles.heroNote}>Human case review • Independent support • Clear next steps</p>
      </div>
      <CaseVisual />
    </section>
  )
}

const trustStrip = [
  { label: "Human-reviewed cases", icon: UserRoundCheck },
  { label: "No payment to submit an enquiry", icon: Wallet },
  { label: "Independent of Google", icon: Shield },
  { label: "Careful handling of your information", icon: Lock },
]

export function HomeTrustStrip() {
  return (
    <section className={`${styles.trustStrip} ${styles.reveal}`} aria-label="How ReputeDefend handles enquiries">
      <ul>
        {trustStrip.map(({ label, icon: Icon }) => (
          <li key={label}>
            <span className={styles.stripIcon}><Icon aria-hidden="true" size={18} /></span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

const situations = [
  ["Your Business Profile disappeared or was suspended", "Customers may struggle to find accurate information about your business."],
  ["You're locked out or unable to complete verification", "Uncertainty about access can make it difficult to respond confidently."],
  ["Important profile features have suddenly changed", "A restriction or missing feature can leave you unsure what customers now see."],
  ["Suspicious reviews are affecting confidence in your business", "A damaging review can influence what prospective customers see when comparing businesses."],
]

export function HomeSituations() {
  return (
    <section id="home-situations" className={`${styles.situations} ${styles.reveal}`} aria-labelledby="situations-title">
      <div className={styles.situationIntro}>
        <Eyebrow>Recognise the situation?</Eyebrow>
        <h2 id="situations-title">When your Google presence changes, the impact can reach your customers too.</h2>
        <p>A suspended profile, lost access or damaging reviews are not just platform problems. They can affect how customers find you, contact you and decide whether to trust your business.</p>
        <p className={styles.reassuranceLead}>You don&apos;t need to diagnose the problem before asking for help.</p>
        <Link className={styles.primaryButton} href="/get-help">Tell us what&apos;s happening <ArrowUpRight aria-hidden="true" size={18} /></Link>
      </div>
      <div className={styles.problemGrid}>
        {situations.map(([title, copy]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

const homeServices = [
  {
    title: "Google Business Profile Protection & Recovery",
    label: "Suspensions, access and verification",
    icon: Store,
    description: "When your profile is suspended, inaccessible or stuck in verification, we help establish what changed, what information matters and what recovery route is appropriate.",
    points: ["Suspension and restriction assessment", "Access and verification guidance", "Recovery and appeal preparation"],
    href: "/business-profile-recovery",
    cta: "Get help with my profile",
  },
  {
    title: "Google Review Protection",
    label: "Suspicious or potentially policy-breaching reviews",
    icon: MessageSquareText,
    description: "When a suspicious or potentially policy-breaching review is affecting your reputation, we assess the circumstances, evidence and available response or challenge route.",
    points: ["Review and policy assessment", "Relevant evidence and context", "Response and challenge guidance"],
    href: "/review-protection",
    cta: "Assess a review issue",
  },
]

export function HomeServices() {
  return (
    <section id="home-services" className={`${styles.section} ${styles.reveal}`} aria-labelledby="services-title">
      <div className={styles.sectionHeading}>
        <div>
          <Eyebrow>Two focused services</Eyebrow>
          <h2 id="services-title">Specialist support for the issue in front of you.</h2>
        </div>
        <p>Your profile and your reviews affect how people find and trust your business. Each needs a different route.</p>
      </div>
      <div className={styles.serviceGrid}>
        {homeServices.map(({ title, label, icon: Icon, description, points, href, cta }) => (
          <Link className={styles.serviceCard} href={href} key={href}>
            <div className={styles.serviceTop}>
              <span className={styles.serviceIcon}><Icon aria-hidden="true" size={24} /></span>
              <ArrowUpRight aria-hidden="true" className={styles.cardArrow} size={22} />
            </div>
            <p className={styles.serviceLabel}>{label}</p>
            <h3>{title}</h3>
            <p className={styles.serviceDescription}>{description}</p>
            <ul>
              {points.map((point) => (
                <li key={point}><Check aria-hidden="true" size={17} />{point}</li>
              ))}
            </ul>
            <span className={styles.explore}>{cta} <ArrowUpRight aria-hidden="true" size={17} /></span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const expertisePrinciples = [
  ["Understand before changing", "Review the notice, timeline and recent activity before making several changes at once."],
  ["Build the right evidence", "Focus on relevant, accurate information rather than sending everything you have."],
  ["Use the appropriate route", "Choose the recovery, appeal, reporting or response process that fits the issue."],
]

export function HomeExpertise() {
  return (
    <section className={`${styles.expertise} ${styles.reveal}`} aria-labelledby="expertise-title">
      <div className={styles.expertiseIntro}>
        <Eyebrow>Before you react</Eyebrow>
        <h2 id="expertise-title">When the pressure is high, guessing can make the situation harder.</h2>
        <p>It is natural to want to fix a suspension or damaging review immediately. But repeated appeals, unnecessary profile changes or unsupported accusations can create more confusion. A considered first step gives you a clearer position.</p>
      </div>
      <ol className={styles.expertiseGrid}>
        {expertisePrinciples.map(([title, copy], index) => (
          <li key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{copy}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

const processSteps = [
  ["Tell us what happened", "Share the issue, relevant messages or links and anything you have already tried. You don't need a perfect case file."],
  ["We assess the situation", "We review the context, identify information that matters and determine what may need further clarification."],
  ["We recommend the next step", "We explain the route we believe is appropriate and what support may help before you decide how to proceed."],
]

export function HomeProcess() {
  return (
    <section className={`${styles.section} ${styles.reveal}`} aria-labelledby="process-title">
      <div className={styles.sectionHeading}>
        <div>
          <Eyebrow>How ReputeDefend works</Eyebrow>
          <h2 id="process-title">A clearer way forward starts with understanding the problem.</h2>
        </div>
        <Link className={styles.textLink} href="/how-it-works">See the full process <ArrowRight aria-hidden="true" size={18} /></Link>
      </div>
      <ol className={styles.processList}>
        {processSteps.map(([title, copy], index) => (
          <li key={title}>
            <span className={styles.processNumber}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{copy}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

const trustPrinciples = [
  { title: "Human assessment", copy: "Your case is reviewed in context rather than reduced to a generic answer.", icon: UserRoundCheck },
  { title: "Evidence before assumptions", copy: "Recommendations follow the facts and information available.", icon: ListChecks },
  { title: "Clear communication", copy: "You should understand what we recommend, why we recommend it and what happens next.", icon: MessageSquareText },
  { title: "Independent guidance", copy: "ReputeDefend is independent of Google, so our role is to help you prepare and navigate the process — not pretend to control it.", icon: Shield },
]

export function HomeTrust() {
  return (
    <section className={`${styles.trust} ${styles.reveal}`} aria-labelledby="trust-title">
      <div className={styles.trustIntro}>
        <Eyebrow>Why ReputeDefend</Eyebrow>
        <h2 id="trust-title">Clear advice when the situation feels anything but clear.</h2>
      </div>
      <ul className={styles.trustGrid}>
        {trustPrinciples.map(({ title, copy, icon: Icon }) => (
          <li key={title}>
            <span className={styles.trustIcon}><Icon aria-hidden="true" size={18} /></span>
            <h3>{title}</h3>
            <p>{copy}</p>
          </li>
        ))}
      </ul>
      <div className={styles.trustLimit}>
        <Info aria-hidden="true" size={20} />
        <p>Google ultimately controls platform decisions such as profile reinstatement and review removal. We focus on the part you can control: presenting the situation clearly, using relevant evidence and following the appropriate process.</p>
      </div>
    </section>
  )
}

export function HomeFaq() {
  return (
    <section className={`${styles.faqSection} ${styles.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Questions you may have</Eyebrow>
        <h2 id="faq-title">A little clarity before you begin.</h2>
        <p>If your Google Business Profile or a review issue is already affecting the business, these answers may help you decide how to start.</p>
        <Link className={styles.textLink} href="/contact">Ask a different question <ArrowUpRight aria-hidden="true" size={18} /></Link>
      </div>
      <div className={styles.faqList}>
        {homepageFaqs.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}<Plus aria-hidden="true" size={20} /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function HomeConversion() {
  return (
    <section className={`${styles.conversion} ${styles.reveal}`} aria-labelledby="case-title">
      <div className={styles.conversionCopy}>
        <Eyebrow>Get a clearer view of your situation</Eyebrow>
        <h2 id="case-title">You don&apos;t need to solve the problem before asking for help.</h2>
        <p>Tell us what happened, what changed and what you have already tried. We&apos;ll review the information and help you understand the next practical step.</p>
        <ul className={styles.conversionPoints}>
          <li>Submitting an enquiry does not commit you to paid support.</li>
          <li>If further support is appropriate, we&apos;ll explain the proposed scope and any fee before you decide how to proceed.</li>
          <li>Please don&apos;t send passwords or verification codes.</li>
        </ul>
      </div>
      <div className={styles.formPanel}>
        <EnquiryForm caseMode source="homepage" submitLabel="Send my case for assessment" />
      </div>
    </section>
  )
}

export function Homepage({ children }: { children: React.ReactNode }) {
  return <div className={`${styles.home} font-sans`}>{children}</div>
}
