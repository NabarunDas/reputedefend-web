import Link from "next/link"
import { ArrowRight, ArrowUpRight, Check, Plus } from "lucide-react"
import {
  pricingClarity,
  pricingClose,
  pricingCompare,
  pricingFaqIntro,
  pricingFaqs,
  pricingGuard,
  pricingHero,
  pricingHelpHref,
  pricingRecovery,
  pricingReview,
  pricingStart,
  pricingSuccess,
  pricingTiming,
  pricingTrustStrip,
  pricingVisual,
} from "./content"
import s from "./pricing.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={s.eyebrow}>{children}</p>
}

function HelpLink({
  href = pricingHelpHref,
  className = s.primaryButton,
  children,
}: {
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function IncludeList({ items, dark = false }: { items: readonly string[]; dark?: boolean }) {
  return (
    <ul className={dark ? s.includeDark : s.includeList}>
      {items.map((item) => (
        <li key={item}>
          {dark ? null : <Check aria-hidden="true" size={16} />}
          {item}
        </li>
      ))}
    </ul>
  )
}

function PriceSnapshot() {
  return (
    <figure className={s.visual} aria-label={pricingVisual.ariaLabel}>
      <div className={s.visualChrome}>
        <span>{pricingVisual.chrome[0]}</span>
        <span>{pricingVisual.chrome[1]}</span>
      </div>
      <div className={s.visualAssess}>
        <p className={s.stageLabel}>{pricingVisual.assessment.label}</p>
        <p className={s.visualAssessTitle}>{pricingVisual.assessment.title}</p>
        <strong>{pricingVisual.assessment.figure}</strong>
        <span>{pricingVisual.assessment.note}</span>
      </div>
      {pricingVisual.rows.map((row) => (
        <div key={row.service} className={s.visualRow}>
          <p className={s.stageLabel}>{row.service}</p>
          <ul>
            {row.items.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <strong>{item.figure}</strong>
                <em>{item.cadence}</em>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className={s.visualGuard}>
        <span>{pricingVisual.guard.name}</span>
        <strong>{pricingVisual.guard.figure}</strong>
        <em>{pricingVisual.guard.cadence}</em>
      </p>
    </figure>
  )
}

export function PricingHero() {
  return (
    <section className={`${s.heroBand} ${s.enter}`} aria-labelledby="pricing-title">
      <div className={s.hero}>
        <div>
          <Eyebrow>{pricingHero.eyebrow}</Eyebrow>
          <h1 id="pricing-title">
            <span className={s.titleMain}>{pricingHero.titleLines[0]}</span>
            <span>{pricingHero.titleLines[1]}</span>
          </h1>
          <p className={s.lead}>{pricingHero.lead}</p>
          <div className={s.actions}>
            <HelpLink className={s.primaryOnDark}>{pricingHero.primaryCta}</HelpLink>
            <Link className={s.secondaryOnDark} href={pricingHero.secondaryHref}>
              {pricingHero.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={s.heroNote}>{pricingHero.supportLine}</p>
        </div>
        <PriceSnapshot />
      </div>
    </section>
  )
}

export function PricingTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="Pricing at a glance">
      <ul>
        {pricingTrustStrip.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}

export function PricingStart() {
  return (
    <section className={`${s.start} ${s.reveal}`} aria-labelledby="start-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingStart.eyebrow}</Eyebrow>
        <h2 id="start-title">{pricingStart.title}</h2>
        <p>{pricingStart.lead}</p>
      </header>
      <ol className={s.startPoints}>
        {pricingStart.points.map((point, index) => (
          <li key={point.title}>
            <span className={s.startNumber} aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{point.title}</h3>
            <p>{point.copy}</p>
          </li>
        ))}
      </ol>
      <aside className={s.holdNote}>
        <p className={s.holdKicker}>What this does not include</p>
        <h3>{pricingStart.hold.title}</h3>
        <p>{pricingStart.hold.copy}</p>
      </aside>
    </section>
  )
}

export function PricingRecovery() {
  const { guided, managed } = pricingRecovery
  return (
    <section className={`${s.service} ${s.reveal}`} aria-labelledby="recovery-pricing-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingRecovery.eyebrow}</Eyebrow>
        <h2 id="recovery-pricing-title">{pricingRecovery.title}</h2>
        <p>{pricingRecovery.lead}</p>
      </header>
      <div className={s.planSplit}>
        <article className={s.planGuided}>
          <p className={s.modelKicker}>{guided.kicker}</p>
          <h3>{guided.line}</h3>
          <p className={s.planPrice} aria-label={guided.spoken}>
            <strong>{guided.price}</strong>
            <span>{guided.cadence}</span>
          </p>
          <p>{guided.copy}</p>
          <IncludeList items={guided.includes} />
          <HelpLink href={guided.href}>{guided.cta}</HelpLink>
        </article>
        <p className={s.planOr}>or</p>
        <article className={`${s.planManaged} ${s.planForest}`}>
          <p className={s.modelKicker}>{managed.kicker}</p>
          <h3>{managed.line}</h3>
          <p className={s.managedPrice} aria-label={managed.spoken}>
            <strong>{managed.today}</strong>
            <span>
              {managed.price} {managed.cadence}
            </span>
          </p>
          <p>{managed.copy}</p>
          <IncludeList items={managed.includes} dark />
          <HelpLink href={managed.href} className={s.primaryOnDark}>
            {managed.cta}
          </HelpLink>
        </article>
      </div>
    </section>
  )
}

export function PricingReviewPlans() {
  const { guided, managed } = pricingReview
  return (
    <section className={`${s.reviewPlans} ${s.reveal}`} aria-labelledby="review-pricing-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingReview.eyebrow}</Eyebrow>
        <h2 id="review-pricing-title">{pricingReview.title}</h2>
        <p>{pricingReview.lead}</p>
      </header>
      <article className={s.modelRow}>
        <div className={s.modelCopy}>
          <p className={s.modelKicker}>{guided.kicker}</p>
          <h3>{guided.line}</h3>
          <p>{guided.copy}</p>
          <IncludeList items={guided.includes} />
          <HelpLink href={guided.href}>{guided.cta}</HelpLink>
        </div>
        <p className={s.rowPrice} aria-label={guided.spoken}>
          <strong>{guided.price}</strong>
          <span>{guided.cadence}</span>
        </p>
      </article>
      <article className={`${s.modelRow} ${s.modelManaged}`}>
        <p className={s.rowPrice} aria-label={managed.spoken}>
          <strong>{managed.today}</strong>
          <span>
            {managed.price} {managed.cadence}
          </span>
        </p>
        <div className={s.modelCopy}>
          <p className={s.modelKicker}>{managed.kicker}</p>
          <h3>{managed.line}</h3>
          <p>{managed.copy}</p>
          <IncludeList items={managed.includes} dark />
          <HelpLink href={managed.href} className={s.primaryOnDark}>
            {managed.cta}
          </HelpLink>
        </div>
      </article>
    </section>
  )
}

export function PricingCompare() {
  return (
    <section className={`${s.compare} ${s.reveal}`} aria-labelledby="compare-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingCompare.eyebrow}</Eyebrow>
        <h2 id="compare-title">{pricingCompare.title}</h2>
        <p>{pricingCompare.lead}</p>
      </header>
      <div className={s.compareBoard} role="table" aria-label="Guided compared with Managed">
        <div className={s.compareHead} role="row">
          <div role="columnheader">What you get</div>
          <div role="columnheader">
            Guided
            <span>{pricingCompare.captions.guided}</span>
          </div>
          <div role="columnheader">
            Managed
            <span>{pricingCompare.captions.managed}</span>
          </div>
        </div>
        {pricingCompare.rows.map((row) => (
          <div key={row.label} className={s.compareRow} role="row">
            <div className={s.compareLabel} role="rowheader">
              {row.label}
            </div>
            <div role="cell">
              <span className={s.cellLabel}>Guided</span>
              {row.guided}
            </div>
            <div role="cell">
              <span className={s.cellLabel}>Managed</span>
              {row.managed}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PricingSuccess() {
  return (
    <section className={`${s.success} ${s.reveal}`} aria-labelledby="success-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingSuccess.eyebrow}</Eyebrow>
        <h2 id="success-title">{pricingSuccess.title}</h2>
        <p>{pricingSuccess.lead}</p>
      </header>
      <div className={s.successSplit}>
        <article>
          <h3>{pricingSuccess.recovery.title}</h3>
          <p>{pricingSuccess.recovery.copy}</p>
        </article>
        <article>
          <h3>{pricingSuccess.review.title}</h3>
          <p>{pricingSuccess.review.copy}</p>
        </article>
      </div>
      <ul className={s.successNotes}>
        {pricingSuccess.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  )
}

export function PricingTiming() {
  return (
    <section className={`${s.timing} ${s.reveal}`} aria-labelledby="timing-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingTiming.eyebrow}</Eyebrow>
        <h2 id="timing-title">{pricingTiming.title}</h2>
        <p>{pricingTiming.lead}</p>
      </header>
      <ul className={s.timingGrid}>
        {pricingTiming.items.map((item) => (
          <li key={item.kicker}>
            <p className={s.modelKicker}>{item.kicker}</p>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </li>
        ))}
      </ul>
      <p className={s.timingNote}>{pricingTiming.note}</p>
    </section>
  )
}

export function PricingGuard() {
  return (
    <section className={`${s.guardBand} ${s.reveal}`} aria-labelledby="guard-title">
      <div className={s.guard}>
        <div>
          <Eyebrow>{pricingGuard.eyebrow}</Eyebrow>
          <h2 id="guard-title">{pricingGuard.title}</h2>
          <p className={s.guardKicker}>{pricingGuard.kicker}</p>
          <p>{pricingGuard.lead}</p>
          <ul className={s.guardPoints}>
            {pricingGuard.points.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className={s.guardSupport}>{pricingGuard.supporting}</p>
          <div className={s.actions}>
            <HelpLink href={pricingGuard.href} className={s.primaryOnDark}>
              {pricingGuard.cta}
            </HelpLink>
            <Link className={s.secondaryOnDark} href={pricingGuard.secondaryHref}>
              {pricingGuard.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <p className={s.guardPrice} aria-label={pricingGuard.spoken}>
          <strong>
            {pricingGuard.figure}
            <span>{pricingGuard.cadence}</span>
          </strong>
        </p>
      </div>
    </section>
  )
}

export function PricingClarity() {
  return (
    <section className={`${s.clarity} ${s.reveal}`} aria-labelledby="clarity-title">
      <header className={s.sectionIntro}>
        <Eyebrow>{pricingClarity.eyebrow}</Eyebrow>
        <h2 id="clarity-title">{pricingClarity.title}</h2>
        <p>{pricingClarity.lead}</p>
      </header>
      <ol className={s.clarityList}>
        {pricingClarity.points.map((point, index) => (
          <li key={point}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {point}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function PricingFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="pricing-faq-title">
      <div>
        <Eyebrow>{pricingFaqIntro.eyebrow}</Eyebrow>
        <h2 id="pricing-faq-title">{pricingFaqIntro.title}</h2>
        <p>{pricingFaqIntro.lead}</p>
      </div>
      <div className={s.faqList}>
        {pricingFaqs.map(({ q, a }) => (
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

export function PricingClose() {
  return (
    <section className={`${s.closingBand} ${s.reveal}`} aria-labelledby="close-title">
      <div className={s.closing}>
        <Eyebrow>{pricingClose.eyebrow}</Eyebrow>
        <h2 id="close-title">{pricingClose.title}</h2>
        <p>{pricingClose.lead}</p>
        <div className={s.actions}>
          <HelpLink className={s.primaryOnDark}>{pricingClose.primaryCta}</HelpLink>
          <Link className={s.secondaryOnDark} href={pricingClose.secondaryHref}>
            {pricingClose.secondaryCta}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
