import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Info,
  Lock,
  Plus,
  Shield,
  Store,
  UserRoundCheck,
  Wallet,
} from "lucide-react"
import {
  assessmentAreas,
  evidenceItems,
  expertisePrinciples,
  processSteps,
  recoveryFaqs,
  situations,
  supportItems,
  trustPrinciples,
} from "./content"
import s from "./recovery.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={s.eyebrow}>{children}</p>
}

function HelpLink({ children, className = s.primaryButton }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/get-help?service=profile" className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function RecoveryVisual() {
  return (
    <figure className={s.visual} aria-label="From a profile issue to a clearer recovery route">
      <div className={s.flowCard}>
        <p className={s.flowLabel}>Profile issue detected</p>
        <ul className={s.changeList}>
          <li>Suspended</li>
          <li>Verification required</li>
          <li>Access unavailable</li>
        </ul>
      </div>
      <div className={s.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={s.flowCard}>
        <p className={s.flowLabel}>Review what changed</p>
        <p className={s.flowCopy}>Look at the notice, timeline and recent activity.</p>
      </div>
      <div className={s.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={s.flowCard}>
        <p className={s.flowLabel}>Prepare the recovery route</p>
        <p className={s.flowCopy}>Organise the information that may support the next step.</p>
      </div>
      <div className={s.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={`${s.flowCard} ${s.flowCardAction}`}>
        <span className={s.flowCheck} aria-hidden="true"><Check size={18} /></span>
        <div>
          <p className={s.flowLabel}>Move forward with clarity</p>
          <p className={s.flowCopy}>Know the next move before you make it.</p>
        </div>
      </div>
      <figcaption className={s.visualNote}>Understand the issue before deciding the next move.</figcaption>
    </figure>
  )
}

export function RecoveryHero() {
  return (
    <section className={`${s.hero} ${s.enter}`} aria-labelledby="recovery-title">
      <div>
        <Eyebrow>Google Business Profile Protection &amp; Recovery</Eyebrow>
        <h1 id="recovery-title">When your Google Business Profile goes down, your business shouldn&apos;t be <span>left guessing.</span></h1>
        <p className={s.lead}>A suspension, failed verification or loss of access can affect how customers find, contact and trust your business. ReputeDefend helps you understand what changed, identify the information that matters and prepare the strongest appropriate recovery route.</p>
        <div className={s.actions}>
          <HelpLink>Tell us what happened</HelpLink>
          <a href="#recovery-help" className={s.secondaryButton}>See how recovery support works <ArrowDown size={18} aria-hidden="true" /></a>
        </div>
        <p className={s.heroNote}>Human case review • Independent support • Clear recovery guidance</p>
      </div>
      <RecoveryVisual />
    </section>
  )
}

const trustStrip = [
  { label: "Human-reviewed cases", icon: UserRoundCheck },
  { label: "Support for suspensions, access & verification", icon: Store },
  { label: "No payment to submit an enquiry", icon: Wallet },
  { label: "Independent of Google", icon: Shield },
]

export function RecoveryTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ReputeDefend handles profile recovery enquiries">
      <ul>
        {trustStrip.map(({ label, icon: Icon }) => (
          <li key={label}>
            <span className={s.stripIcon}><Icon aria-hidden="true" size={18} /></span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RecoverySituations() {
  return (
    <section className={`${s.situations} ${s.reveal}`} aria-labelledby="situations-title">
      <div className={s.situationIntro}>
        <Eyebrow>When your profile changes</Eyebrow>
        <h2 id="situations-title">A profile problem can quickly become a customer problem.</h2>
        <p>Your Google Business Profile can be one of the first places customers check before calling, visiting or choosing your business. If it disappears, becomes restricted or you lose control of it, the impact can go beyond the platform itself.</p>
        <p className={s.reassuranceLead}>You do not need to know the cause before asking for help.</p>
        <HelpLink>Tell us what&apos;s happened</HelpLink>
      </div>
      <div className={s.problemGrid}>
        {situations.map(({ title, body }) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RecoveryExpertise() {
  return (
    <section className={`${s.expertise} ${s.reveal}`} aria-labelledby="expertise-title">
      <div className={s.expertiseIntro}>
        <Eyebrow>Before you make another change</Eyebrow>
        <h2 id="expertise-title">When a profile is already restricted, more activity is not always better activity.</h2>
        <p>It can be tempting to change several profile details, submit another appeal or keep trying different fixes. But without understanding the issue first, those actions can make the timeline harder to interpret and the case harder to explain.</p>
      </div>
      <ol className={s.expertiseGrid}>
        {expertisePrinciples.map(({ title, body }, index) => (
          <li key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RecoveryAssessment() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="assessment-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>Understanding your position</Eyebrow>
          <h2 id="assessment-title">The right recovery route starts with knowing where the problem actually is.</h2>
        </div>
        <p>We work from the information you can share: messages you have received, the profile as you can see it, and any supporting records.</p>
      </div>
      <div className={s.assessGrid}>
        {assessmentAreas.map(({ title, body }) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RecoverySupport() {
  return (
    <section id="recovery-help" className={`${s.section} ${s.reveal}`} aria-labelledby="support-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>Recovery support</Eyebrow>
          <h2 id="support-title">Turn a confusing profile problem into a structured next step.</h2>
        </div>
      </div>
      <div className={s.helpGrid}>
        {supportItems.map(({ title, body }, index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RecoveryProcess() {
  return (
    <section id="recovery-process" className={`${s.section} ${s.reveal}`} aria-labelledby="process-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>How it works</Eyebrow>
          <h2 id="process-title">Start with what you know.</h2>
        </div>
        <Link className={s.textLink} href="/how-it-works">See the full ReputeDefend process <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
      <ol className={s.processList}>
        {processSteps.map(({ title, body }, index) => (
          <li key={title}>
            <span className={s.processNumber}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <div className={s.processCta}>
        <HelpLink>Start my case</HelpLink>
      </div>
    </section>
  )
}

export function RecoveryEvidence() {
  return (
    <section className={`${s.evidence} ${s.reveal}`} aria-labelledby="evidence-title">
      <div className={s.evidenceIntro}>
        <Eyebrow>What may help</Eyebrow>
        <h2 id="evidence-title">You don&apos;t need a perfect case file.</h2>
        <p>If you already have any of the following, keep them available. If something is missing, you can still start the conversation.</p>
      </div>
      <div className={s.evidencePanel}>
        <ul>
          {evidenceItems.map((item) => (
            <li key={item}><Check aria-hidden="true" size={17} />{item}</li>
          ))}
        </ul>
        <p className={s.safetyNote}><Lock aria-hidden="true" size={18} />Do not send passwords, verification codes or account credentials.</p>
        <p className={s.evidenceClose}>Start with what you have. We can identify what may be useful next.</p>
      </div>
    </section>
  )
}

export function RecoveryTrust() {
  return (
    <section className={`${s.trust} ${s.reveal}`} aria-labelledby="trust-title">
      <div className={s.trustIntro}>
        <Eyebrow>Independent support</Eyebrow>
        <h2 id="trust-title">Clear guidance without pretending to control the platform.</h2>
      </div>
      <ul className={s.trustGrid}>
        {trustPrinciples.map(({ title, body }) => (
          <li key={title}>
            <span className={s.trustIcon}><Check aria-hidden="true" size={18} /></span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ul>
      <div className={s.trustLimit}>
        <Info aria-hidden="true" size={20} />
        <p>Google ultimately decides whether a Business Profile is reinstated and how platform enforcement is applied. ReputeDefend focuses on the part you can control: understanding the issue, preparing relevant information and approaching the next step clearly.</p>
      </div>
    </section>
  )
}

export function RecoveryFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Questions you may have</Eyebrow>
        <h2 id="faq-title">A little clarity before you begin.</h2>
        <p>If a Google Business Profile suspension, verification or access issue is already affecting the business, these answers may help you decide how to start.</p>
      </div>
      <div className={s.faqList}>
        {recoveryFaqs.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}<Plus aria-hidden="true" size={20} /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function RecoveryClosing() {
  return (
    <section className={`${s.closing} ${s.reveal}`} aria-labelledby="closing-title">
      <div className={s.closingCopy}>
        <Eyebrow>Start your profile recovery assessment</Eyebrow>
        <h2 id="closing-title">Don&apos;t keep guessing at the next step.</h2>
        <p>Tell us what changed, what Google has told you and what you have already tried. You do not need to diagnose the problem or prepare a perfect case before contacting us.</p>
        <ul className={s.closingPoints}>
          <li>No payment is required to submit your enquiry.</li>
          <li>Submitting your case does not commit you to paid support.</li>
          <li>If further support is appropriate, we&apos;ll explain the proposed scope and any fee before you decide.</li>
          <li>Please don&apos;t send passwords or verification codes.</li>
        </ul>
      </div>
      <div className={s.closingPanel}>
        <p>Share the situation as it stands. We&apos;ll review it and help you understand the next practical step.</p>
        <HelpLink>Tell us what happened</HelpLink>
      </div>
    </section>
  )
}
