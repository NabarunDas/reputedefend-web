import Link from "next/link"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileSearch,
  Info,
  Lock,
  MessageSquare,
  Plus,
  Scale,
  Shield,
  UserRoundCheck,
  Wallet,
} from "lucide-react"
import {
  assessmentAreas,
  evidenceItems,
  expertisePrinciples,
  processSteps,
  reviewFaqs,
  routes,
  situations,
  supportItems,
  trustPrinciples,
} from "./content"
import s from "./review.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={s.eyebrow}>{children}</p>
}

function HelpLink({ children, className = s.primaryButton }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/get-help?service=review" className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function ReviewVisual() {
  return (
    <figure className={s.visual} aria-label="From a concerning review to a clearer response">
      <div className={s.flowCard}>
        <p className={s.flowLabel}>Review appears</p>
        <ul className={s.changeList}>
          <li>Suspicious review</li>
          <li>Wrong-business concern</li>
          <li>Potential policy issue</li>
        </ul>
      </div>
      <div className={s.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={s.flowCard}>
        <p className={s.flowLabel}>Understand the context</p>
        <p className={s.flowCopy}>Review content. Timeline. Relevant records.</p>
      </div>
      <div className={s.visualConnector} aria-hidden="true"><ArrowDown size={20} /></div>
      <div className={`${s.flowCard} ${s.flowCardAction}`}>
        <span className={s.flowCheck} aria-hidden="true"><Scale size={18} /></span>
        <div>
          <p className={s.flowLabel}>Choose the right response</p>
          <p className={s.flowCopy}>Respond · Assess &amp; report · Document &amp; monitor</p>
        </div>
      </div>
      <figcaption className={s.visualNote}>Different situations call for different responses.</figcaption>
    </figure>
  )
}

export function ReviewHero() {
  return (
    <section className={`${s.hero} ${s.enter}`} aria-labelledby="review-title">
      <div>
        <Eyebrow>Google Review Protection</Eyebrow>
        <h1 id="review-title">A damaging Google review deserves <span>the right response</span> — not a rushed one.</h1>
        <p className={s.lead}>If a suspicious, misleading or potentially policy-breaching review is affecting trust in your business, deciding what to do next can be difficult. ReputeDefend helps you assess the review, understand the evidence and choose the response, reporting or challenge route that best fits the situation.</p>
        <div className={s.actions}>
          <HelpLink>Assess my review issue</HelpLink>
          <a href="#review-routes" className={s.secondaryButton}>See the response options <ArrowDown size={18} aria-hidden="true" /></a>
        </div>
        <p className={s.heroNote}>Human review • Policy-aware assessment • Clear response options</p>
      </div>
      <ReviewVisual />
    </section>
  )
}

const trustStrip = [
  { label: "Human-reviewed cases", icon: UserRoundCheck },
  { label: "Review & policy assessment", icon: FileSearch },
  { label: "No payment to submit an enquiry", icon: Wallet },
  { label: "Independent of Google", icon: Shield },
]

export function ReviewTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ReputeDefend handles review protection enquiries">
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

export function ReviewSituations() {
  return (
    <section className={`${s.situations} ${s.reveal}`} aria-labelledby="situations-title">
      <div className={s.situationIntro}>
        <Eyebrow>When a review raises concern</Eyebrow>
        <h2 id="situations-title">A review can influence customers before you get the chance to explain.</h2>
        <p>Reviews often appear at the point where a prospective customer is deciding whether to call, visit or choose a business. When a review seems suspicious, misleading or potentially harmful, the pressure to react quickly is understandable.</p>
        <p className={s.reassuranceLead}>You don&apos;t need to decide whether a Google policy has been breached before asking for an assessment.</p>
        <HelpLink>Tell us what concerns you</HelpLink>
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

const routeIcons = [MessageSquare, Scale, FileSearch]

export function ReviewRoutes() {
  return (
    <section id="review-routes" className={`${s.section} ${s.reveal}`} aria-labelledby="routes-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>Choose the response, not just the reaction</Eyebrow>
          <h2 id="routes-title">Every damaging review needs a strategy — but not necessarily the same strategy.</h2>
        </div>
        <p>The right next step depends on what the review says, what the surrounding facts show and what outcome is realistically available.</p>
      </div>
      <div className={s.routeGrid}>
        {routes.map(({ title, cue, body, action }, index) => {
          const Icon = routeIcons[index]
          return (
            <article key={title} className={index === 1 ? s.routeEmphasis : undefined}>
              <span className={s.routeCue}><Icon size={18} aria-hidden="true" />{cue}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <p className={s.routeAction}>{action}</p>
            </article>
          )
        })}
      </div>
      <p className={s.routeFoot}>Taking no immediate action can also be a deliberate strategy when the evidence does not yet support another route. Documenting and monitoring here means keeping your own dated record — not an automated alert service.</p>
    </section>
  )
}

export function ReviewExpertise() {
  return (
    <section className={`${s.expertise} ${s.reveal}`} aria-labelledby="expertise-title">
      <div className={s.expertiseIntro}>
        <Eyebrow>Before you respond</Eyebrow>
        <h2 id="expertise-title">Protect the business while you protect the reputation.</h2>
        <p>When a review feels unfair or damaging, an emotional response can be tempting. But public accusations, unnecessary disclosure or repeated unsupported reports can create a second problem alongside the first.</p>
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

export function ReviewAssessment() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="assessment-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>What we look at</Eyebrow>
          <h2 id="assessment-title">A review assessment starts with what can actually be supported.</h2>
        </div>
        <p>An unfamiliar reviewer name or a missing customer record does not, by itself, prove that a review is false.</p>
      </div>
      <div className={s.assessGrid}>
        {assessmentAreas.map(({ title, body }, index) => (
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

export function ReviewSupport() {
  return (
    <section id="review-help" className={`${s.section} ${s.reveal}`} aria-labelledby="support-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>Review protection support</Eyebrow>
          <h2 id="support-title">Turn a damaging review concern into a clear, evidence-based next step.</h2>
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

export function ReviewEvidence() {
  return (
    <section className={`${s.evidence} ${s.reveal}`} aria-labelledby="evidence-title">
      <div className={s.evidenceIntro}>
        <Eyebrow>What may help</Eyebrow>
        <h2 id="evidence-title">You don&apos;t need a perfect evidence file.</h2>
        <p>If you already have any of the following, keep them available. If something is missing, you can still start with the review and what you know.</p>
      </div>
      <div className={s.evidencePanel}>
        <ul>
          {evidenceItems.map((item) => (
            <li key={item}><Check aria-hidden="true" size={17} />{item}</li>
          ))}
        </ul>
        <p className={s.safetyNote}><Lock aria-hidden="true" size={18} />Do not send passwords, account credentials or unnecessary sensitive personal information.</p>
        <p className={s.evidenceClose}>Start with what you have. We can identify what may matter next.</p>
      </div>
    </section>
  )
}

export function ReviewProcess() {
  return (
    <section id="review-process" className={`${s.section} ${s.reveal}`} aria-labelledby="process-title">
      <div className={s.sectionHeading}>
        <div>
          <Eyebrow>How it works</Eyebrow>
          <h2 id="process-title">Start with the review and the context around it.</h2>
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
        <HelpLink>Assess my review issue</HelpLink>
      </div>
    </section>
  )
}

export function ReviewTrust() {
  return (
    <section className={`${s.trust} ${s.reveal}`} aria-labelledby="trust-title">
      <div className={s.trustIntro}>
        <Eyebrow>Independent review support</Eyebrow>
        <h2 id="trust-title">Clear guidance without pretending every bad review can be removed.</h2>
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
        <p>Google ultimately decides whether a review is removed. ReputeDefend cannot remove a Google review directly or guarantee the outcome of a report or challenge. We focus on the part you can control: understanding the review, organising relevant evidence and taking the strongest appropriate next step.</p>
      </div>
    </section>
  )
}

export function ReviewFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Questions you may have</Eyebrow>
        <h2 id="faq-title">A little clarity before you begin.</h2>
        <p>If a Google review is already affecting how customers see the business, these answers may help you decide how to start.</p>
      </div>
      <div className={s.faqList}>
        {reviewFaqs.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}<Plus aria-hidden="true" size={20} /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function ReviewClosing() {
  return (
    <section className={`${s.closing} ${s.reveal}`} aria-labelledby="closing-title">
      <div className={s.closingCopy}>
        <Eyebrow>Get a clearer view of the review</Eyebrow>
        <h2 id="closing-title">Before you react, understand your strongest option.</h2>
        <p>Share the review, what concerns you and anything relevant you already know. We&apos;ll assess the situation and help you understand whether responding, reporting, challenging or documenting the issue is the better next step.</p>
        <ul className={s.closingPoints}>
          <li>No payment is required to submit your enquiry.</li>
          <li>Submitting your case does not commit you to paid support.</li>
          <li>If further support is appropriate, we&apos;ll explain the proposed scope and any fee before you decide.</li>
          <li>Please don&apos;t send passwords or unnecessary sensitive personal information.</li>
        </ul>
      </div>
      <div className={s.closingPanel}>
        <p>Start with the review as it stands. We&apos;ll help you see which response fits before you make the next move.</p>
        <HelpLink>Assess my review issue</HelpLink>
      </div>
    </section>
  )
}
