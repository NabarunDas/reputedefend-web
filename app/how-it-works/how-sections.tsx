import Link from "next/link"
import { ArrowRight, ArrowUpRight, Check, Lock, Plus } from "lucide-react"
import {
  howAssess,
  howAuth,
  howChoice,
  howClose,
  howFaqIntro,
  howFaqs,
  howGuard,
  howHelpHref,
  howHero,
  howOutcomes,
  howPricing,
  howRecoveryPath,
  howReviewPath,
  howSend,
  howStart,
  howTimeline,
  howTrustStrip,
  howValue,
  howVisual,
} from "./content"
import s from "./how.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={s.eyebrow}>{children}</p>
}

function HelpLink({
  children,
  className = s.primaryButton,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={howHelpHref} className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function JourneyVisual() {
  return (
    <figure className={s.visual} aria-label="Start with what happened, then assess, recommend, and choose Guided or Managed">
      <div className={s.visualChrome}>
        <span>{howVisual.chrome[0]}</span>
        <span>{howVisual.chrome[1]}</span>
      </div>
      <ol className={s.journey}>
        {howVisual.stages.map((stage, index) => (
          <li key={stage.label}>
            {index > 0 ? <span className={s.visualArrow} aria-hidden="true" /> : null}
            <div className={`${s.stage} ${stage.label === "Choose" ? s.stageChoose : ""}`}>
              <p className={s.stageLabel}>{stage.label}</p>
              {stage.label === "Choose" ? (
                <div className={s.routePair}>
                  <span>{stage.items[0]}</span>
                  <span className={s.routeOr}>or</span>
                  <span>{stage.items[1]}</span>
                </div>
              ) : (
                <ul>
                  {stage.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}

export function HowHero() {
  return (
    <section className={`${s.heroBand} ${s.enter}`} aria-labelledby="how-title">
      <div className={s.hero}>
        <div>
          <Eyebrow>{howHero.eyebrow}</Eyebrow>
          <h1 id="how-title">
            <span className={s.titleMain}>{howHero.titleLines[0]}</span>
            <span>{howHero.titleLines[1]}</span>
          </h1>
          <p className={s.lead}>{howHero.lead}</p>
          <div className={s.actions}>
            <HelpLink className={s.primaryOnDark}>{howHero.primaryCta}</HelpLink>
            <Link className={s.secondaryOnDark} href={howHero.secondaryHref}>
              {howHero.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={s.heroNote}>{howHero.supportLine}</p>
        </div>
        <JourneyVisual />
      </div>
    </section>
  )
}

export function HowTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ProfileRelaunch works, at a glance">
      <ul>
        {howTrustStrip.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}

export function HowStart() {
  return (
    <section className={`${s.start} ${s.reveal}`} aria-labelledby="start-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{howStart.eyebrow}</Eyebrow>
        <h2 id="start-title">{howStart.title}</h2>
        <p>{howStart.lead}</p>
      </header>
      <div className={s.intake}>
        <article className={s.intakeLive}>
          <p className={s.statusLive}>{howStart.live.status}</p>
          <h3>{howStart.live.title}</h3>
          <p>{howStart.live.copy}</p>
          <ul>
            {howStart.live.points.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" size={16} />
                {item}
              </li>
            ))}
          </ul>
          <HelpLink>{howStart.live.cta}</HelpLink>
        </article>
        <article className={s.intakeSoon}>
          <p className={s.statusSoon}>
            {howStart.future.status}
          </p>
          <h3>{howStart.future.title}</h3>
          <p>{howStart.future.copy}</p>
          <ul>
            {howStart.future.points.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className={s.soonFooter}>
            <p className={s.soonNote} id="google-connection-note">
              {howStart.future.note}
            </p>
            <button
              type="button"
              className={s.connectDisabled}
              disabled
              aria-describedby="google-connection-note"
            >
              Connect Google
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}

export function HowSend() {
  return (
    <section className={`${s.send} ${s.reveal}`} aria-labelledby="send-title">
      <div className={s.sendIntro}>
        <Eyebrow>{howSend.eyebrow}</Eyebrow>
        <h2 id="send-title">{howSend.title}</h2>
        <p>{howSend.lead}</p>
      </div>
      <div className={s.dossier}>
        <ul>
          {howSend.items.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" size={16} />
              {item}
            </li>
          ))}
        </ul>
        <p className={s.privacy}>
          <Lock aria-hidden="true" size={18} />
          <span>
            {howSend.safety} {howSend.safetyNote}
          </span>
        </p>
      </div>
    </section>
  )
}

export function HowAssess() {
  return (
    <section className={`${s.assessBand} ${s.reveal}`} aria-labelledby="assess-title">
      <div className={s.assess}>
        <div className={s.assessIntro}>
          <Eyebrow>{howAssess.eyebrow}</Eyebrow>
          <h2 id="assess-title">{howAssess.title}</h2>
          <p>{howAssess.lead}</p>
        </div>
        <ol className={s.assessList}>
          {howAssess.items.map((item, index) => (
            <li key={item.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function HowOutcomes() {
  return (
    <section className={`${s.outcomes} ${s.reveal}`} aria-labelledby="outcomes-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{howOutcomes.eyebrow}</Eyebrow>
        <h2 id="outcomes-title">{howOutcomes.title}</h2>
        <p>{howOutcomes.lead}</p>
      </header>
      <ol className={s.outcomeBoard}>
        {howOutcomes.recovery.map((item) => (
          <li key={item.label}>
            <p className={s.outcomeLabel}>{item.label}</p>
            <p>{item.copy}</p>
          </li>
        ))}
      </ol>
      <aside className={s.reviewOutcomes}>
        <p>{howOutcomes.reviewNote.title}</p>
        <ul>
          {howOutcomes.reviewNote.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </aside>
    </section>
  )
}

export function HowValue() {
  return (
    <section className={`${s.value} ${s.reveal}`} aria-labelledby="value-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{howValue.eyebrow}</Eyebrow>
        <h2 id="value-title">{howValue.title}</h2>
        <p>{howValue.lead}</p>
      </header>
      <div className={s.valueSplit}>
        <article>
          <h3>{howValue.gives.title}</h3>
          <ul>
            {howValue.gives.items.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" size={16} />
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className={s.valueHolds}>
          <h3>{howValue.holds.title}</h3>
          <ul>
            {howValue.holds.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}

export function HowChoice() {
  return (
    <section className={`${s.choice} ${s.reveal}`} aria-labelledby="choice-title">
      <div className={s.choiceHead}>
        <p className={s.stepMark}>{howChoice.eyebrow}</p>
        <h2 id="choice-title">{howChoice.title}</h2>
        <p>{howChoice.lead}</p>
      </div>
      <div className={s.choiceFork}>
        <article>
          <p className={s.modelKicker}>{howChoice.guided.kicker}</p>
          <h3>{howChoice.guided.line}</h3>
          <p>{howChoice.guided.copy}</p>
          <dl>
            {howChoice.guided.prices.map((item) => (
              <div key={item.service}>
                <dt>{item.service}</dt>
                <dd>
                  <strong>{item.figure}</strong>
                  <span>{item.cadence}</span>
                </dd>
              </div>
            ))}
          </dl>
        </article>
        <p className={s.choiceOr} aria-hidden="true">
          or
        </p>
        <article className={s.choiceManaged}>
          <p className={s.modelKicker}>{howChoice.managed.kicker}</p>
          <h3>{howChoice.managed.line}</h3>
          <p>{howChoice.managed.copy}</p>
          <dl>
            {howChoice.managed.prices.map((item) => (
              <div key={item.service}>
                <dt>{item.service}</dt>
                <dd>
                  <strong>{item.figure}</strong>
                  <span>{item.cadence}</span>
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </div>
      <p className={s.choiceNote}>{howChoice.note}</p>
    </section>
  )
}

export function HowAuth() {
  return (
    <section className={`${s.authBand} ${s.reveal}`} aria-labelledby="auth-title">
      <div className={s.auth}>
        <div className={s.authIntro}>
          <Eyebrow>{howAuth.eyebrow}</Eyebrow>
          <h2 id="auth-title">{howAuth.title}</h2>
          <p>{howAuth.lead}</p>
        </div>
        <div className={s.authSplit}>
          <article>
            <h3>{howAuth.weMay.title}</h3>
            <ul>
              {howAuth.weMay.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article>
            <h3>{howAuth.youKeep.title}</h3>
            <ul>
              {howAuth.youKeep.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
        <p className={s.authNever}>
          <Lock aria-hidden="true" size={18} />
          {howAuth.never}
        </p>
      </div>
    </section>
  )
}

function PathTrace({
  eyebrow,
  title,
  steps,
  cta,
  href,
}: {
  eyebrow: string
  title: string
  steps: readonly string[]
  cta: string
  href: string
}) {
  return (
    <article className={s.pathTrace}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2>{title}</h2>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Link className={s.pathCta} href={href}>
        {cta}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </article>
  )
}

export function HowPaths() {
  return (
    <section className={`${s.paths} ${s.reveal}`} aria-label="How the process specialises by service">
      <PathTrace {...howRecoveryPath} />
      <PathTrace {...howReviewPath} />
    </section>
  )
}

export function HowPricing() {
  return (
    <section className={`${s.pricing} ${s.reveal}`} aria-labelledby="pricing-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{howPricing.eyebrow}</Eyebrow>
        <h2 id="pricing-title">{howPricing.title}</h2>
        <p>{howPricing.lead}</p>
      </header>
      <div className={s.priceBoard}>
        {howPricing.groups.map((group) => (
          <article key={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.figure}</strong>
                  <em>{item.cadence}</em>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className={s.actions}>
        <Link className={s.primaryButton} href={howPricing.href}>
          {howPricing.cta}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <p className={s.choiceNote}>{howPricing.note}</p>
    </section>
  )
}

export function HowGuard() {
  return (
    <section className={`${s.guard} ${s.reveal}`} aria-labelledby="guard-title">
      <div>
        <Eyebrow>{howGuard.eyebrow}</Eyebrow>
        <h2 id="guard-title">{howGuard.title}</h2>
        <p>{howGuard.lead}</p>
        <p className={s.guardModel}>{howGuard.model}</p>
        <Link className={s.primaryButton} href={howGuard.href}>
          {howGuard.cta}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <p className={s.guardPrice}>
        <strong>{howGuard.figure}</strong>
        <span>{howGuard.cadence}</span>
      </p>
    </section>
  )
}

export function HowTimeline() {
  return (
    <section className={`${s.process} ${s.reveal}`} aria-labelledby="process-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{howTimeline.eyebrow}</Eyebrow>
        <h2 id="process-title">{howTimeline.title}</h2>
      </header>
      <ol className={s.processList}>
        {howTimeline.steps.map((step, index) => (
          <li key={step.n} className={index === 5 ? s.processQuiet : index === 3 ? s.processChoice : undefined}>
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
    <section className={`${s.closingBand} ${s.reveal}`} aria-labelledby="close-title">
      <div className={s.closing}>
        <Eyebrow>{howClose.eyebrow}</Eyebrow>
        <h2 id="close-title">{howClose.title}</h2>
        <p>{howClose.lead}</p>
        <div className={s.actions}>
          <HelpLink className={s.primaryOnDark}>{howClose.primaryCta}</HelpLink>
          <Link className={s.secondaryOnDark} href={howClose.secondaryHref}>
            {howClose.secondaryCta}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
