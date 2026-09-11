import Link from "next/link"
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Info,
  Lock,
  Plus,
  Shield,
  UserRoundCheck,
  Wallet,
} from "lucide-react"
import {
  howAssess,
  howClose,
  howExpect,
  howFaqIntro,
  howFaqs,
  howHero,
  howJourney,
  howPaths,
  howSend,
  howTrust,
  howTrustStrip,
  howVisualCaption,
  howVisualSteps,
  journeySteps,
} from "./content"
import s from "./how.module.css"

const stripIcons = [UserRoundCheck, Wallet, Lock, Shield] as const

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={s.eyebrow}>{children}</p>
}

function HelpLink({ children, className = s.primaryButton }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/get-help" className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function HeroVisual() {
  return (
    <figure className={s.visual}>
      <ol className={s.visualBoard}>
        {howVisualSteps.map((step, index) => (
          <li key={step.n} className={index === howVisualSteps.length - 1 ? s.visualFinal : undefined}>
            {index === howVisualSteps.length - 1 ? (
              <span className={s.visualCheck} aria-hidden="true">
                <Check size={16} />
              </span>
            ) : (
              <span className={s.visualN} aria-hidden="true">
                {step.n}
              </span>
            )}
            <strong>{step.title}</strong>
            {"support" in step ? <p>{step.support}</p> : null}
          </li>
        ))}
      </ol>
      <figcaption>{howVisualCaption}</figcaption>
    </figure>
  )
}

export function HowHero() {
  return (
    <section className={`${s.hero} ${s.enter}`} aria-labelledby="how-hero-title">
      <div>
        <Eyebrow>{howHero.eyebrow}</Eyebrow>
        <h1 id="how-hero-title">
          {howHero.titleBefore}
          <span>{howHero.titleAccent}</span>
        </h1>
        <p className={s.lead}>{howHero.lead}</p>
        <div className={s.actions}>
          <HelpLink>{howHero.primaryCta}</HelpLink>
          <a className={s.secondaryButton} href={`#${howJourney.id}`}>
            {howHero.secondaryCta}
            <ArrowDown size={18} aria-hidden="true" />
          </a>
        </div>
        <p className={s.heroNote}>{howHero.note}</p>
      </div>
      <HeroVisual />
    </section>
  )
}

export function HowTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ReputeDefend works — at a glance">
      <ul>
        {howTrustStrip.map((item, index) => {
          const Icon = stripIcons[index]
          return (
            <li key={item}>
              <span className={s.stripIcon}>
                <Icon aria-hidden="true" size={18} />
              </span>
              {item}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function HowJourney() {
  return (
    <section id={howJourney.id} className={`${s.section} ${s.reveal}`} aria-labelledby="how-journey-title">
      <header className={s.sectionHeading}>
        <div>
          <Eyebrow>{howJourney.eyebrow}</Eyebrow>
          <h2 id="how-journey-title">{howJourney.title}</h2>
        </div>
        <p>{howJourney.lead}</p>
      </header>
      <ol className={s.processList}>
        {journeySteps.map((step) => (
          <li key={step.id}>
            <span className={s.processNumber} aria-hidden="true">
              {step.n}
            </span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function HowSend() {
  return (
    <section className={`${s.send} ${s.reveal}`} aria-labelledby="how-send-title">
      <div className={s.sendIntro}>
        <Eyebrow>{howSend.eyebrow}</Eyebrow>
        <h2 id="how-send-title">{howSend.title}</h2>
        <p>{howSend.lead}</p>
      </div>
      <div className={s.sendPanel}>
        <ul>
          {howSend.items.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" size={17} />
              {item}
            </li>
          ))}
        </ul>
        <p className={s.safetyNote}>
          <Lock aria-hidden="true" size={18} />
          {howSend.safety}
        </p>
        <p className={s.sendClose}>{howSend.safetyNote}</p>
      </div>
    </section>
  )
}

export function HowAssess() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="how-assess-title">
      <header className={s.sectionHeading}>
        <div>
          <Eyebrow>{howAssess.eyebrow}</Eyebrow>
          <h2 id="how-assess-title">{howAssess.title}</h2>
        </div>
        <p>{howAssess.lead}</p>
      </header>
      <ol className={s.assessGrid}>
        {howAssess.items.map((item) => (
          <li key={item.n}>
            <span aria-hidden="true">{item.n}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function HowExpect() {
  return (
    <section className={`${s.section} ${s.reveal}`} aria-labelledby="how-expect-title">
      <header className={s.sectionHeading}>
        <div>
          <Eyebrow>{howExpect.eyebrow}</Eyebrow>
          <h2 id="how-expect-title">{howExpect.title}</h2>
        </div>
        <p>{howExpect.lead}</p>
      </header>
      <ul className={s.expectGrid}>
        {howExpect.items.map((item, index) => (
          <li key={item.title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HowPaths() {
  return (
    <section className={`${s.paths} ${s.reveal}`} aria-labelledby="how-paths-title">
      <header className={s.centerHead}>
        <Eyebrow>{howPaths.eyebrow}</Eyebrow>
        <h2 id="how-paths-title">{howPaths.title}</h2>
        <p>{howPaths.lead}</p>
      </header>
      <div className={s.pathGrid}>
        {howPaths.items.map((item) => (
          <article key={item.href}>
            <p className={s.pathCue}>{item.cue}</p>
            <h3>{item.title}</h3>
            <ol>
              {item.path.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Link className={s.pathCta} href={item.href}>
              {item.cta}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
      <p className={s.pathsNote}>{howPaths.note}</p>
    </section>
  )
}

export function HowTrust() {
  return (
    <section className={`${s.trust} ${s.reveal}`} aria-labelledby="how-trust-title">
      <header className={s.sectionHeading}>
        <div>
          <Eyebrow>{howTrust.eyebrow}</Eyebrow>
          <h2 id="how-trust-title">{howTrust.title}</h2>
        </div>
        <p>{howTrust.lead}</p>
      </header>
      <ul className={s.trustGrid}>
        {howTrust.principles.map((item) => (
          <li key={item.title}>
            <span className={s.trustIcon}>
              <Check aria-hidden="true" size={18} />
            </span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
      <aside className={s.trustLimit}>
        <Info aria-hidden="true" size={20} />
        <p>{howTrust.callout}</p>
      </aside>
    </section>
  )
}

export function HowFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="how-faq-title">
      <div>
        <Eyebrow>{howFaqIntro.eyebrow}</Eyebrow>
        <h2 id="how-faq-title">{howFaqIntro.title}</h2>
        <p>{howFaqIntro.lead}</p>
      </div>
      <div className={s.faqList}>
        {howFaqs.map(({ q, a }) => (
          <details key={q}>
            <summary>
              {q}
              <Plus aria-hidden="true" size={20} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function HowClose() {
  return (
    <section className={`${s.closing} ${s.reveal}`} aria-labelledby="how-close-title">
      <div className={s.closingCopy}>
        <Eyebrow>{howClose.eyebrow}</Eyebrow>
        <h2 id="how-close-title">{howClose.title}</h2>
        <p>{howClose.lead}</p>
        <ul className={s.closingPoints}>
          {howClose.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
      <div className={s.closingPanel}>
        <p>{howClose.panel}</p>
        <HelpLink>{howClose.cta}</HelpLink>
        <p className={s.closingLinks}>
          <Link href="/business-profile-recovery">Business Profile Recovery</Link>
          <Link href="/review-protection">Review Protection</Link>
        </p>
      </div>
    </section>
  )
}
