import Link from "next/link"
import { ArrowDown, ArrowUpRight, Check, FileText, ListChecks, MessageSquareText, Plus, ScanSearch, Store } from "lucide-react"
import { EnquiryForm } from "@/components/enquiry-form"
import { homepageFaqs } from "@/lib/homepage-content"
import styles from "./homepage.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>
}

function CaseVisual() {
  return (
    <figure className={styles.caseVisual} aria-label="From understanding an issue to organising evidence and choosing a clear next step">
      <figcaption className={styles.visualCaption}>Clarity before action</figcaption>
      <div className={styles.caseDocument}>
        <div className={styles.documentTop}><ScanSearch aria-hidden="true" size={22} /><span>Understand the issue</span></div>
        <p>What changed?<br /><span>Start with what you know.</span></p>
        <div className={styles.documentLines} aria-hidden="true"><span /><span /><span /></div>
      </div>
      <div className={styles.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={styles.evidenceSlip}><FileText aria-hidden="true" size={22} /><div><strong>Organise the evidence</strong><span>Facts. Context. A clear record.</span></div></div>
      <div className={styles.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={styles.nextSlip}><span className={styles.checkMark}><Check aria-hidden="true" size={20} /></span><div><strong>A clear next step</strong><span>Considered, not assumed.</span></div><ArrowUpRight aria-hidden="true" size={22} /></div>
      <p className={styles.visualNote}>A process grounded in evidence.<br />Not a promise of an outcome.</p>
    </figure>
  )
}

export function HomeHero() {
  return (
    <section className={`${styles.hero} ${styles.enter}`} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <Eyebrow>Independent Google reputation support</Eyebrow>
        <h1 id="home-title">Protect your business presence and <span>reputation on Google.</span></h1>
        <p className={styles.lead}>Independent, evidence-led support for suspended or inaccessible Google Business Profiles and reviews that may breach platform policy. Understand what happened, prepare the right information and take a clearer next step.</p>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/get-help">Get help with a case <ArrowUpRight aria-hidden="true" size={18} /></Link>
          <Link className={styles.secondaryButton} href="#home-services">Explore our services <ArrowDown aria-hidden="true" size={18} /></Link>
        </div>
        <p className={styles.heroNote}>Independent • Evidence-led • No guaranteed outcomes</p>
      </div>
      <CaseVisual />
    </section>
  )
}

const homeServices = [
  {
    title: "Google Business Profile Protection & Recovery",
    label: "Your business presence",
    icon: Store,
    description: "When your profile is suspended, restricted or out of reach, understand the problem before deciding how to respond.",
    points: ["Suspension and restriction assessment", "Access and verification guidance", "Evidence and submission preparation"],
    href: "/business-profile-recovery",
  },
  {
    title: "Google Review Protection",
    label: "Your business reputation",
    icon: MessageSquareText,
    description: "Take a considered approach to suspicious or potentially policy-breaching reviews, without confusing criticism with a policy violation.",
    points: ["Review and policy assessment", "Relevant evidence and context", "Reporting and challenge guidance"],
    href: "/review-protection",
  },
]

export function HomeServices() {
  return (
    <section id="home-services" className={`${styles.section} ${styles.reveal}`} aria-labelledby="services-title">
      <div className={styles.sectionHeading}><div><Eyebrow>Two focused services</Eyebrow><h2 id="services-title">Focused support for the issue in front of you.</h2></div><p>Your profile and your reviews affect how people find and understand your business. Each needs a different, careful approach.</p></div>
      <div className={styles.serviceGrid}>
        {homeServices.map(({ title, label, icon: Icon, description, points, href }) => (
          <Link className={styles.serviceCard} href={href} key={href}>
            <div className={styles.serviceTop}><span className={styles.serviceIcon}><Icon aria-hidden="true" size={24} /></span><ArrowUpRight aria-hidden="true" className={styles.cardArrow} size={22} /></div>
            <p className={styles.serviceLabel}>{label}</p><h3>{title}</h3><p className={styles.serviceDescription}>{description}</p>
            <ul>{points.map(point => <li key={point}><Check aria-hidden="true" size={17} />{point}</li>)}</ul>
            <span className={styles.explore}>Explore service <ArrowUpRight aria-hidden="true" size={17} /></span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const situations = [
  ["A suspended Business Profile", "Your listing is no longer available as expected, and the notification does not make the next step obvious."],
  ["Access or verification problems", "You cannot manage your profile, confirm ownership or complete the verification process."],
  ["An unexpected profile restriction", "A feature or part of your profile changes or becomes restricted, leaving you unsure what to correct."],
  ["A pattern of suspicious reviews", "Several reviews arrive unexpectedly, or their content raises questions that need a factual assessment."],
  ["A review that may breach policy", "The concern goes beyond a poor rating. You need to understand whether the content warrants a policy-based challenge."],
]

export function HomeSituations() {
  return (
    <section className={`${styles.situations} ${styles.reveal}`} aria-labelledby="situations-title">
      <div className={styles.situationIntro}><Eyebrow>Recognise the situation?</Eyebrow><h2 id="situations-title">When something changes, clarity matters.</h2><p>A platform message or an unexpected review can leave you with more questions than answers. You do not need to know the process before asking for help.</p><Link className={styles.textLink} href="/get-help">Tell us what happened <ArrowUpRight aria-hidden="true" size={18} /></Link><div className={styles.reassurance}><p>You don&apos;t need to diagnose the problem first.</p><p>You don&apos;t need a completed case file.</p><p>Start with what you know.</p></div></div>
      <div className={styles.situationList}>{situations.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>
  )
}

const supportSteps = [
  ["Understand the issue", "Separate the platform message, the business context and the assumptions. Establish what is known and what still needs checking."],
  ["Organise relevant evidence", "Bring together the notices, dates, public links and business information that help explain the situation."],
  ["Identify an appropriate process", "Consider the reporting, verification or appeal route that fits the issue, rather than making repeated speculative submissions."],
  ["Prepare a clear submission or challenge", "Present relevant facts coherently, with a policy-based explanation where appropriate. Leave out claims the evidence cannot support."],
  ["Understand realistic next steps", "Be clear about what you can do, what depends on the platform and what remains uncertain."],
]

export function HomeSupport() {
  return (
    <section className={`${styles.section} ${styles.reveal}`} aria-labelledby="support-title">
      <div className={styles.sectionHeading}><div><Eyebrow>What we help you do</Eyebrow><h2 id="support-title">Turn a confusing issue<br />into a considered response.</h2></div><p>Not more noise. A clearer understanding of the situation, the evidence and the process available to you.</p></div>
      <div className={styles.supportLayout}>
        <aside className={styles.evidenceNote}><ListChecks aria-hidden="true" size={30} /><h3>Useful facts.<br />Not guesswork.</h3><p>The strongest starting point is an accurate account of what happened.</p><ul><li>The exact platform message</li><li>Relevant profile or review links</li><li>A timeline of changes</li><li>Steps you have already taken</li></ul><p className={styles.smallNote}>Keep passwords and verification codes private.</p></aside>
        <ol className={styles.supportList}>{supportSteps.map(([title, copy], index) => <li key={title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
      </div>
    </section>
  )
}

export function HomeTrust() {
  return (
    <section className={`${styles.trust} ${styles.reveal}`} aria-labelledby="trust-title">
      <div><Eyebrow>Our position is clear</Eyebrow><h2 id="trust-title">Clear advice.<br /><span>No unrealistic promises.</span></h2><p>We cannot guarantee Business Profile reinstatement or review removal. We do not control Google&apos;s decisions.</p></div>
      <div className={styles.trustDetails}><p>That is not a footnote. It is the basis of responsible support.</p><ul><li><strong>Evidence over assurances</strong><span>Recommendations grounded in the information available, not in a promised result.</span></li><li><strong>Transparency over certainty</strong><span>An honest explanation of the options, limitations and unanswered questions.</span></li><li><strong>Independent by design</strong><span>ReputeDefend is not Google and does not act as an official Google representative.</span></li></ul><Link className={styles.textLink} href="/about">Our approach <ArrowUpRight aria-hidden="true" size={18} /></Link></div>
    </section>
  )
}

export function HomeProcess() {
  const steps = [
    ["Share your situation", "Send a short account of the issue, relevant links and what you have already tried. Start with the facts you have; you do not need a finished case file."],
    ["Clarify the position", "We review the context and may ask for more information. The aim is to understand the issue and the evidence before recommending an approach."],
    ["Consider the next step", "We explain the recommended route and its limitations so you can make an informed decision. Any proposed support should be clear before you proceed."],
  ]
  return <section className={`${styles.section} ${styles.reveal}`} aria-labelledby="process-title"><div className={styles.sectionHeading}><div><Eyebrow>How it works</Eyebrow><h2 id="process-title">A clear place to start.</h2></div><Link className={styles.textLink} href="/how-it-works">See the process <ArrowUpRight aria-hidden="true" size={18} /></Link></div><ol className={styles.processList}>{steps.map(([title, copy], i) => <li key={title}><span className={styles.processNumber}>{String(i + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol></section>
}

export function HomeExpectations() {
  const expectations = [
    ["A considered assessment", "Your situation is understood in context, not reduced to a generic answer."],
    ["Evidence-led recommendations", "Advice follows the facts and the relevant process, not assumptions about the outcome."],
    ["Clear communication", "Plain language about what is known, what is needed and what the next step involves."],
    ["Responsible support", "No fabricated evidence, guaranteed outcomes or claims of special access to Google."],
  ]
  return <section className={`${styles.expectations} ${styles.reveal}`} aria-labelledby="expectations-title"><div><Eyebrow>What working with us means</Eyebrow><h2 id="expectations-title">What you can expect from ReputeDefend</h2></div><div className={styles.expectationGrid}>{expectations.map(([title, copy]) => <article key={title}><Check aria-hidden="true" size={20} /><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
}

export function HomeFaq() {
  return <section className={`${styles.faqSection} ${styles.reveal}`} aria-labelledby="faq-title"><div><Eyebrow>Questions you may have</Eyebrow><h2 id="faq-title">A little clarity,<br />before you begin.</h2><p>Concerned about your profile or a review? Start here.</p><Link className={styles.textLink} href="/contact">Ask a different question <ArrowUpRight aria-hidden="true" size={18} /></Link></div><div className={styles.faqList}>{homepageFaqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus aria-hidden="true" size={20} /></summary><p>{a}</p></details>)}</div></section>
}

export function HomeConversion() {
  return <section className={`${styles.conversion} ${styles.reveal}`} aria-labelledby="case-title"><div className={styles.conversionCopy}><Eyebrow>Start with the facts</Eyebrow><h2 id="case-title">You do not need all the answers to take the first step.</h2><p>Tell us what happened, what changed and what you have tried. We will review the information and help you understand a practical way forward.</p><div className={styles.conversionNote}><FileText aria-hidden="true" size={22} /><p>A short, factual summary is enough to start. Please do not share passwords, verification codes or unnecessary personal information.</p></div><p className={styles.conversionDisclaimer}>Independent support. No guaranteed reinstatement or review removal.</p></div><div className={styles.formPanel}><EnquiryForm caseMode source="homepage" /></div></section>
}

export function Homepage({ children }: { children: React.ReactNode }) {
  return <div className={`${styles.home} font-sans`}>{children}</div>
}
