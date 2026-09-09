import Link from "next/link"
import {
  ArrowDown,
  ArrowRightFromLine,
  ArrowUpRight,
  Check,
  Compass,
  FolderOpen,
  ListFilter,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Scale,
  ScanSearch,
  Store,
} from "lucide-react"
import {
  assessmentLenses,
  communicationPrinciples,
  heroStages,
  howFaqs,
  journeySteps,
  limits,
  profilePath,
  receiveItems,
  reviewPath,
  usefulInformation,
} from "./content"
import s from "./how.module.css"

const stepIcons = [MessageSquareText, ScanSearch, ListFilter, FolderOpen, Compass, ArrowRightFromLine]

function StartCase({ children, closing = false }: { children: React.ReactNode; closing?: boolean }) {
  return (
    <Link href="/get-help" className={`${s.button} ${closing ? s.limeButton : ""}`}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function Heading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className={s.heading}>
      <p className={s.eyebrow}>{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  )
}

export function HowHero() {
  return (
    <section className={`${s.hero} ${s.enter}`} aria-labelledby="how-title">
      <div>
        <p className={s.eyebrow}>How ReputeDefend works</p>
        <h1 id="how-title">A clear process for situations that <span>rarely feel clear.</span></h1>
        <p className={s.lead}>You do not need to diagnose the problem before contacting us. Start with what happened, what changed and what you already know. We review the situation, organise the relevant facts and help you understand an appropriate next step.</p>
        <div className={s.actions}>
          <StartCase>Start a case</StartCase>
          <a href="#service-paths" className={s.textLink}>Explore our services <ArrowDown size={18} aria-hidden="true" /></a>
        </div>
        <p className={s.trustLine}>Human review • Evidence-led • Clear next steps</p>
      </div>
      <figure className={s.visual} aria-label="The ReputeDefend journey: tell us what happened, assess, organise evidence, recommend action, follow through">
        <p className={s.visualCaption}>The complete journey</p>
        <ol className={s.visualPath}>
          {heroStages.map((stage, index) => (
            <li key={stage}>
              <span className={s.visualNode}>{String(index + 1).padStart(2, "0")}</span>
              <span className={s.visualLabel}>{stage}</span>
            </li>
          ))}
        </ol>
        <figcaption>A Google Business Profile support process and Google review assessment, taken one considered step at a time.</figcaption>
      </figure>
    </section>
  )
}

export function HowJourney() {
  return (
    <section id="full-journey" className={`${s.section} ${s.reveal}`} aria-labelledby="journey-title">
      <Heading eyebrow="The full journey" title="From first contact to a considered next step." id="journey-title" />
      <p className={s.sectionLead}>A reputation case assessment follows a clear sequence. Each stage builds on the last, without assuming an outcome before the facts are in view.</p>
      <div className={s.railWrap}>
        <span className={s.railTrack} aria-hidden="true"><span className={s.railProgress} /></span>
        <ol className={s.rail}>
          {journeySteps.map((step, index) => {
            const Icon = stepIcons[index]
            return (
              <li key={step.title} className={s.railItem}>
                <span className={s.railMarker}>{String(index + 1).padStart(2, "0")}</span>
                <article className={s.railCard}>
                  <div className={s.railCardTop}>
                    <Icon size={20} aria-hidden="true" />
                    <h3>{step.title}</h3>
                  </div>
                  <p>{step.body}</p>
                </article>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export function HowNeed() {
  return (
    <section className={`${s.need} ${s.reveal}`} aria-labelledby="need-title">
      <div>
        <Heading eyebrow="What we need from you" title="Start with what you know." id="need-title" />
        <p className={s.muted}>Useful information may include the facts below. You do not need every piece of information before contacting us. We can identify what may be relevant after reviewing the situation.</p>
      </div>
      <div className={s.dossier}>
        <div className={s.dossierHead}>
          <FolderOpen size={20} aria-hidden="true" />
          <strong>A useful starting record</strong>
        </div>
        <ul className={s.checklist}>
          {usefulInformation.map((item) => (
            <li key={item}>
              <span className={s.check} aria-hidden="true"><Check size={14} /></span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <aside className={s.security}>
          <LockKeyhole size={20} aria-hidden="true" />
          <div>
            <strong>Keep your account secure</strong>
            <p>Never send passwords, verification codes or account credentials.</p>
          </div>
        </aside>
      </div>
    </section>
  )
}

export function HowAssessment() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="assessment-title">
      <div className={s.splitIntro}>
        <Heading eyebrow="What happens during assessment" title="Assessment before action." id="assessment-title" />
        <p>ReputeDefend considers the situation as a whole: the event, the surrounding context, the evidence that can be shown, the process that appears available, and the limits of what remains uncertain. That is how a Google review assessment or Business Profile recovery support stays proportionate to the facts.</p>
      </div>
      <ol className={s.lenses}>
        {assessmentLenses.map((item, index) => (
          <li key={item.title}>
            <span className={s.lensNumber}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function HowReceive() {
  return (
    <section className={`${s.receive} ${s.reveal}`} aria-labelledby="receive-title">
      <div>
        <Heading eyebrow="What you receive" title="Clearer information before you decide what to do." id="receive-title" />
        <p className={s.muted}>Depending on the situation, customers may receive some or all of the following. These are practical explanations to help you decide, not formal legal opinions, and not a fixed package for every enquiry.</p>
        <p className={s.marginNote}>Any proposed support should be clear before you decide how to proceed.</p>
      </div>
      <ul className={s.deliverables}>
        {receiveItems.map((item, index) => (
          <li key={item}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{item}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HowPaths() {
  return (
    <section id="service-paths" className={`${s.paths} ${s.reveal}`} aria-labelledby="paths-title">
      <header>
        <p className={s.eyebrow}>Two service paths</p>
        <h2 id="paths-title">Different problems need different routes.</h2>
        <p>The same evidence-led process applies throughout. The available next step depends on whether the issue is a Business Profile disruption or a review concern.</p>
      </header>
      <p className={s.forkOrigin}>Start with the situation</p>
      <div className={s.branchGrid}>
        <article className={s.profileBranch}>
          <div className={s.branchCue}><Store size={22} aria-hidden="true" /><span>Business presence</span></div>
          <h3>Business Profile Protection &amp; Recovery</h3>
          <ol className={s.branchPath}>
            {profilePath.map((stage) => <li key={stage}>{stage}</li>)}
          </ol>
          <Link href="/business-profile-recovery" className={s.branchLink}>Explore Profile Recovery <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </article>
        <article className={s.reviewBranch}>
          <div className={s.branchCue}><Scale size={22} aria-hidden="true" /><span>Business reputation</span></div>
          <h3>Review Protection</h3>
          <ol className={s.branchPath}>
            {reviewPath.map((stage) => <li key={stage}>{stage}</li>)}
          </ol>
          <Link href="/review-protection" className={s.branchLink}>Explore Review Protection <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </article>
      </div>
    </section>
  )
}

export function HowLimits() {
  return (
    <section className={`${s.limits} ${s.reveal}`} aria-labelledby="limits-title">
      <Heading eyebrow="What we do not do" title="Responsible support includes knowing where the limits are." id="limits-title" />
      <p className={s.limitsLead}>ReputeDefend does not:</p>
      <ul className={s.limitList}>
        {limits.map((item) => (
          <li key={item}><span aria-hidden="true">—</span>{item}</li>
        ))}
      </ul>
      <p className={s.limitsRole}>Our role is to help you understand the situation, prepare relevant information and approach the available process responsibly.</p>
    </section>
  )
}

export function HowCommunication() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="communication-title">
      <div className={s.splitIntro}>
        <Heading eyebrow="Communication" title="Clear communication throughout." id="communication-title" />
        <p>These principles shape every enquiry. They are how ReputeDefend stays precise when a situation is still unfolding, and how we differ from providers who sell certainty they cannot deliver.</p>
      </div>
      <ol className={s.principles}>
        {communicationPrinciples.map((item, index) => (
          <li key={item}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{item}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function HowFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title">
      <div>
        <Heading eyebrow="Questions, answered" title="Useful context before you start." id="faq-title" />
        <p className={s.muted}>Practical answers about the process, evidence preparation and what happens after you get in touch.</p>
      </div>
      <div>
        {howFaqs.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}<Plus size={20} aria-hidden="true" /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function HowClosing() {
  return (
    <section className={s.closing} aria-labelledby="closing-title">
      <div>
        <p className={s.eyebrow}>Ready to start?</p>
        <h2 id="closing-title">Tell us what happened. We&apos;ll help make the next step clearer.</h2>
        <p>You do not need a finished case file. Start with the issue, the relevant links or messages and what you have already tried.</p>
      </div>
      <div className={s.closingAction}>
        <StartCase closing>Start my case</StartCase>
        <div className={s.closingLinks}>
          <Link href="/business-profile-recovery">Business Profile help <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/review-protection">Review Protection <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  )
}
