import Link from "next/link"
import { ArrowRight, ArrowUpRight, Check, Plus } from "lucide-react"
import {
  recoveryAppealed,
  recoveryAssessment,
  recoveryClosing,
  recoveryExpertise,
  recoveryFaqs,
  recoveryHero,
  recoveryHelpHref,
  recoveryModels,
  recoveryPricing,
  recoveryProcess,
  recoverySituations,
  recoveryTrustStrip,
  recoveryWork,
} from "./content"
import s from "./recovery.module.css"

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
    <Link href={recoveryHelpHref} className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function RecoveryVisual() {
  return (
    <figure className={s.visual} aria-label="Profile status, then case review, then a Guided or Managed recovery route">
      <div className={s.visualChrome}>
        <span>Recovery case</span>
        <span>Profile Recovery</span>
      </div>
      <div className={`${s.stage} ${s.stageStatus}`}>
        <p className={s.stageLabel}>Profile status</p>
        <ul>
          <li>Suspended</li>
          <li>Verification</li>
          <li>Access</li>
        </ul>
      </div>
      <div className={s.visualArrow} aria-hidden="true" />
      <div className={`${s.stage} ${s.stageReview}`}>
        <p className={s.stageLabel}>Case review</p>
        <ul>
          <li>Notice</li>
          <li>Timeline</li>
          <li>Business evidence</li>
          <li>Profile history</li>
        </ul>
      </div>
      <div className={s.visualArrow} aria-hidden="true" />
      <div className={`${s.stage} ${s.stageRoute}`}>
        <p className={s.stageLabel}>Recovery route</p>
        <div className={s.routePair}>
          <span>Guided</span>
          <span className={s.routeOr}>or</span>
          <span>Managed</span>
        </div>
      </div>
    </figure>
  )
}

export function RecoveryHero() {
  return (
    <section className={`${s.heroBand} ${s.enter}`} aria-labelledby="recovery-title">
      <div className={s.hero}>
        <div>
          <Eyebrow>{recoveryHero.eyebrow}</Eyebrow>
          <h1 id="recovery-title">
            <span className={s.titleMain}>{recoveryHero.titleLines[0]}</span>
            <span>{recoveryHero.titleLines[1]}</span>
          </h1>
          <p className={s.lead}>{recoveryHero.lead}</p>
          <div className={s.actions}>
            <HelpLink className={s.primaryOnDark}>{recoveryHero.primaryCta}</HelpLink>
            <Link className={s.secondaryOnDark} href={recoveryHero.secondaryHref}>
              {recoveryHero.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={s.heroNote}>{recoveryHero.supportLine}</p>
        </div>
        <RecoveryVisual />
      </div>
    </section>
  )
}

export function RecoveryTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ProfileRelaunch handles Profile Recovery">
      <ul>
        {recoveryTrustStrip.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}

export function RecoverySituations() {
  return (
    <section className={`${s.situations} ${s.reveal}`} aria-labelledby="situations-title">
      <div className={s.situationIntro}>
        <Eyebrow>{recoverySituations.eyebrow}</Eyebrow>
        <h2 id="situations-title">{recoverySituations.title}</h2>
        <p>{recoverySituations.lead}</p>
      </div>
      <ol className={s.problemList}>
        {recoverySituations.items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
      <p className={s.situationCta}>
        {recoverySituations.unsure}{" "}
        <Link href={recoveryHelpHref}>{recoverySituations.ctaLead}</Link>
      </p>
    </section>
  )
}

export function RecoveryExpertise() {
  return (
    <section className={`${s.expertiseBand} ${s.reveal}`} aria-labelledby="expertise-title">
      <div className={s.expertise}>
        <div className={s.expertiseIntro}>
          <Eyebrow>{recoveryExpertise.eyebrow}</Eyebrow>
          <h2 id="expertise-title">{recoveryExpertise.title}</h2>
          <p>{recoveryExpertise.lead}</p>
        </div>
        <ol className={s.expertiseList}>
          {recoveryExpertise.items.map((item, index) => (
            <li key={item.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function RecoveryAssessment() {
  return (
    <section className={`${s.assess} ${s.reveal}`} aria-labelledby="assessment-title">
      <div className={s.assessIntro}>
        <Eyebrow>{recoveryAssessment.eyebrow}</Eyebrow>
        <h2 id="assessment-title">{recoveryAssessment.title}</h2>
        <p>{recoveryAssessment.lead}</p>
      </div>
      <ol className={s.assessList}>
        {recoveryAssessment.items.map((item, index) => (
          <li key={item.title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RecoveryWork() {
  return (
    <section className={`${s.work} ${s.reveal}`} aria-labelledby="work-title">
      <div className={s.workIntro}>
        <Eyebrow>{recoveryWork.eyebrow}</Eyebrow>
        <h2 id="work-title">{recoveryWork.title}</h2>
        <p>{recoveryWork.lead}</p>
      </div>
      <ol className={s.workList}>
        {recoveryWork.items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RecoveryModels() {
  const { guided, managed } = recoveryModels
  return (
    <section id="recovery-help" className={`${s.modelsBand} ${s.reveal}`} aria-labelledby="models-title">
      <div className={s.modelsIntro}>
        <Eyebrow>{recoveryModels.eyebrow}</Eyebrow>
        <h2 id="models-title">{recoveryModels.title}</h2>
        <p>{recoveryModels.lead}</p>
      </div>
      <div className={s.modelGrid}>
        <article className={s.modelGuided} aria-labelledby="guided-title">
          <p className={s.modelKicker}>{guided.name}</p>
          <p className={s.modelPrice}>
            {guided.price} <span>{guided.cadence}</span>
          </p>
          <h3 id="guided-title">{guided.line}</h3>
          <p>{guided.copy}</p>
          <ul>
            {guided.points.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" size={16} />
                {point}
              </li>
            ))}
          </ul>
          <HelpLink>{guided.cta}</HelpLink>
        </article>
        <article className={s.modelManaged} aria-labelledby="managed-title">
          <p className={s.modelKicker}>{managed.name}</p>
          <p className={s.modelPrice}>
            {managed.today} <span>{managed.price} {managed.cadence}</span>
          </p>
          <h3 id="managed-title">{managed.line}</h3>
          <p>{managed.copy}</p>
          <ul>
            {managed.points.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" size={16} />
                {point}
              </li>
            ))}
          </ul>
          <HelpLink className={s.primaryOnDark}>{managed.cta}</HelpLink>
        </article>
      </div>
    </section>
  )
}

export function RecoveryPricing() {
  return (
    <section className={`${s.pricing} ${s.reveal}`} aria-labelledby="pricing-title">
      <div className={s.pricingIntro}>
        <Eyebrow>{recoveryPricing.eyebrow}</Eyebrow>
        <h2 id="pricing-title">{recoveryPricing.title}</h2>
        <p>{recoveryPricing.lead}</p>
      </div>
      <ul className={s.priceRow}>
        {recoveryPricing.items.map((item) => (
          <li key={item.name}>
            <p className={s.priceLabel}>{item.name}</p>
            <p className={s.priceFigure}>{item.figure}</p>
            <p className={s.priceDetail}>{item.detail}</p>
          </li>
        ))}
      </ul>
      <p className={s.pricingNote}>{recoveryPricing.note}</p>
      <div className={s.actions}>
        <HelpLink>{recoveryPricing.primaryCta}</HelpLink>
        <Link className={s.ghostButton} href={recoveryPricing.secondaryHref}>
          {recoveryPricing.secondaryCta}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

export function RecoveryProcess() {
  return (
    <section className={`${s.process} ${s.reveal}`} aria-labelledby="process-title">
      <div className={s.processIntro}>
        <Eyebrow>{recoveryProcess.eyebrow}</Eyebrow>
        <h2 id="process-title">{recoveryProcess.title}</h2>
      </div>
      <ol className={s.processList}>
        {recoveryProcess.steps.map((step) => (
          <li key={step.n}>
            <span className={s.processNumber}>{step.n}</span>
            <h3>{step.title}</h3>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RecoveryAppealed() {
  return (
    <section className={`${s.appealed} ${s.reveal}`} aria-labelledby="appealed-title">
      <div>
        <Eyebrow>{recoveryAppealed.eyebrow}</Eyebrow>
        <h2 id="appealed-title">{recoveryAppealed.title}</h2>
        <p>{recoveryAppealed.lead}</p>
        <HelpLink>{recoveryAppealed.cta}</HelpLink>
      </div>
      <ul>
        {recoveryAppealed.points.map((point) => (
          <li key={point}>
            <Check aria-hidden="true" size={16} />
            {point}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RecoveryFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Recovery questions</Eyebrow>
        <h2 id="faq-title">Answers specific to a downed or stuck profile.</h2>
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
    <section className={`${s.closingBand} ${s.reveal}`} aria-labelledby="closing-title">
      <div className={s.closing}>
        <Eyebrow>{recoveryClosing.eyebrow}</Eyebrow>
        <h2 id="closing-title">{recoveryClosing.title}</h2>
        <p>{recoveryClosing.lead}</p>
        <div className={s.actions}>
          <HelpLink className={s.primaryOnDark}>{recoveryClosing.primaryCta}</HelpLink>
          <Link className={s.secondaryOnDark} href={recoveryClosing.secondaryHref}>
            {recoveryClosing.secondaryCta}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
