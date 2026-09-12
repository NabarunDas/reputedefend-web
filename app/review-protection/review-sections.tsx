import Link from "next/link"
import { ArrowRight, ArrowUpRight, Check, Lock, Plus } from "lucide-react"
import {
  reviewAssessment,
  reviewClosing,
  reviewEvidence,
  reviewFaqs,
  reviewHelpHref,
  reviewHero,
  reviewJudgement,
  reviewModels,
  reviewPricing,
  reviewProcess,
  reviewReported,
  reviewRoutes,
  reviewSituations,
  reviewTrustStrip,
  reviewWork,
} from "./content"
import s from "./review.module.css"

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
    <Link href={reviewHelpHref} className={className}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  )
}

function ReviewVisual() {
  return (
    <figure className={s.visual} aria-label="Review issue, then case review, then challenge, report or professional response">
      <div className={s.visualChrome}>
        <span>Review case</span>
        <span>Review Protection</span>
      </div>
      <div className={`${s.stage} ${s.stageIssue}`}>
        <p className={s.stageLabel}>Review issue</p>
        <ul>
          <li>Suspicious</li>
          <li>Abusive</li>
          <li>Potential policy issue</li>
        </ul>
      </div>
      <div className={s.visualArrow} aria-hidden="true" />
      <div className={`${s.stage} ${s.stageReview}`}>
        <p className={s.stageLabel}>Case review</p>
        <ul>
          <li>Review text and context</li>
          <li>Evidence</li>
          <li>Policy relevance</li>
          <li>Business records</li>
        </ul>
      </div>
      <div className={s.visualArrow} aria-hidden="true" />
      <div className={`${s.stage} ${s.stageRoute}`}>
        <p className={s.stageLabel}>Next route</p>
        <div className={s.routeStack}>
          <span>Challenge</span>
          <span>Report</span>
          <span>Professional response</span>
        </div>
      </div>
      <p className={s.visualNote}>
        Then, if you want paid support: <strong>Guided</strong> or <strong>Managed</strong>
      </p>
    </figure>
  )
}

export function ReviewHero() {
  return (
    <section className={`${s.heroBand} ${s.enter}`} aria-labelledby="review-title">
      <div className={s.hero}>
        <div>
          <Eyebrow>{reviewHero.eyebrow}</Eyebrow>
          <h1 id="review-title">
            <span className={s.titleMain}>{reviewHero.titleLines[0]}</span>
            <span>{reviewHero.titleLines[1]}</span>
          </h1>
          <p className={s.lead}>{reviewHero.lead}</p>
          <div className={s.actions}>
            <HelpLink className={s.primaryOnDark}>{reviewHero.primaryCta}</HelpLink>
            <Link className={s.secondaryOnDark} href={reviewHero.secondaryHref}>
              {reviewHero.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={s.heroNote}>{reviewHero.supportLine}</p>
        </div>
        <ReviewVisual />
      </div>
    </section>
  )
}

export function ReviewTrustStrip() {
  return (
    <section className={`${s.trustStrip} ${s.reveal}`} aria-label="How ProfileRelaunch handles Review Protection">
      <ul>
        {reviewTrustStrip.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}

export function ReviewSituations() {
  return (
    <section className={`${s.situations} ${s.reveal}`} aria-labelledby="situations-title">
      <div className={s.situationIntro}>
        <Eyebrow>{reviewSituations.eyebrow}</Eyebrow>
        <h2 id="situations-title">{reviewSituations.title}</h2>
        <p>{reviewSituations.lead}</p>
      </div>
      <ol className={s.problemList}>
        {reviewSituations.items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
      <p className={s.situationCta}>
        {reviewSituations.unsure}{" "}
        <Link href={reviewHelpHref}>{reviewSituations.cta}</Link>
      </p>
    </section>
  )
}

export function ReviewJudgement() {
  return (
    <section className={`${s.judgeBand} ${s.reveal}`} aria-labelledby="judgement-title">
      <div className={s.judge}>
        <div className={s.judgeIntro}>
          <Eyebrow>{reviewJudgement.eyebrow}</Eyebrow>
          <h2 id="judgement-title">{reviewJudgement.title}</h2>
          <p>{reviewJudgement.lead}</p>
        </div>
        <ol className={s.judgeList}>
          {reviewJudgement.points.map((item, index) => (
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

export function ReviewAssessment() {
  return (
    <section className={`${s.assess} ${s.reveal}`} aria-labelledby="assessment-title">
      <div className={s.assessIntro}>
        <Eyebrow>{reviewAssessment.eyebrow}</Eyebrow>
        <h2 id="assessment-title">{reviewAssessment.title}</h2>
        <p>{reviewAssessment.lead}</p>
      </div>
      <ol className={s.assessList}>
        {reviewAssessment.items.map((item, index) => (
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

export function ReviewEvidence() {
  return (
    <section className={`${s.evidence} ${s.reveal}`} aria-labelledby="evidence-title">
      <div>
        <Eyebrow>{reviewEvidence.eyebrow}</Eyebrow>
        <h2 id="evidence-title">{reviewEvidence.title}</h2>
        <p>{reviewEvidence.lead}</p>
      </div>
      <div className={s.dossier}>
        <ul>
          {reviewEvidence.items.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" size={16} />
              {item}
            </li>
          ))}
        </ul>
        <p className={s.privacy}>
          <Lock aria-hidden="true" size={16} />
          {reviewEvidence.privacy}
        </p>
      </div>
    </section>
  )
}

export function ReviewWork() {
  return (
    <section className={`${s.work} ${s.reveal}`} aria-labelledby="work-title">
      <div className={s.workIntro}>
        <Eyebrow>{reviewWork.eyebrow}</Eyebrow>
        <h2 id="work-title">{reviewWork.title}</h2>
        <p>{reviewWork.lead}</p>
      </div>
      <ol className={s.workList}>
        {reviewWork.items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ReviewModels() {
  const { guided, managed } = reviewModels
  return (
    <section className={`${s.models} ${s.reveal}`} aria-labelledby="models-title">
      <div className={s.modelsIntro}>
        <Eyebrow>{reviewModels.eyebrow}</Eyebrow>
        <h2 id="models-title">{reviewModels.title}</h2>
        <p>{reviewModels.lead}</p>
      </div>
      <article className={s.modelRow} aria-labelledby="guided-title">
        <div className={s.modelCopy}>
          <p className={s.modelKicker}>{guided.name}</p>
          <h3 id="guided-title">{guided.line}</h3>
          <p>{guided.copy}</p>
          <HelpLink>{guided.cta}</HelpLink>
        </div>
        <div className={s.modelMeta}>
          <p className={s.modelPrice}>
            {guided.price} <span>{guided.cadence}</span>
          </p>
          <ul>
            {guided.points.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" size={16} />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </article>
      <article className={`${s.modelRow} ${s.modelManaged}`} aria-labelledby="managed-title">
        <div className={s.modelMeta}>
          <p className={s.modelPrice}>
            {managed.today} <span>{managed.price} {managed.cadence}</span>
          </p>
          <ul>
            {managed.points.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" size={16} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className={s.modelCopy}>
          <p className={s.modelKicker}>{managed.name}</p>
          <h3 id="managed-title">{managed.line}</h3>
          <p>{managed.copy}</p>
          <HelpLink className={s.primaryOnDark}>{managed.cta}</HelpLink>
        </div>
      </article>
    </section>
  )
}

export function ReviewRoutes() {
  return (
    <section className={`${s.routes} ${s.reveal}`} aria-labelledby="routes-title">
      <div className={s.routesIntro}>
        <Eyebrow>{reviewRoutes.eyebrow}</Eyebrow>
        <h2 id="routes-title">{reviewRoutes.title}</h2>
        <p>{reviewRoutes.lead}</p>
      </div>
      <div className={s.routeSplit}>
        <article>
          <p className={s.routeKicker}>{reviewRoutes.challenge.kicker}</p>
          <h3>{reviewRoutes.challenge.title}</h3>
          <p>{reviewRoutes.challenge.copy}</p>
        </article>
        <p className={s.routeOr} aria-hidden="true">or</p>
        <article>
          <p className={s.routeKicker}>{reviewRoutes.response.kicker}</p>
          <h3>{reviewRoutes.response.title}</h3>
          <p>{reviewRoutes.response.copy}</p>
        </article>
      </div>
    </section>
  )
}

export function ReviewReported() {
  return (
    <section className={`${s.reported} ${s.reveal}`} aria-labelledby="reported-title">
      <div>
        <Eyebrow>{reviewReported.eyebrow}</Eyebrow>
        <h2 id="reported-title">{reviewReported.title}</h2>
        <p>{reviewReported.lead}</p>
        <HelpLink>{reviewReported.cta}</HelpLink>
      </div>
      <ul>
        {reviewReported.points.map((point) => (
          <li key={point}>
            <Check aria-hidden="true" size={16} />
            {point}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ReviewProcess() {
  return (
    <section className={`${s.process} ${s.reveal}`} aria-labelledby="process-title">
      <div className={s.processIntro}>
        <Eyebrow>{reviewProcess.eyebrow}</Eyebrow>
        <h2 id="process-title">{reviewProcess.title}</h2>
      </div>
      <ol className={s.processList}>
        {reviewProcess.steps.map((step) => (
          <li key={step.n} className={step.n === "06" ? s.processQuiet : undefined}>
            <span className={s.processNumber}>{step.n}</span>
            <h3>{step.title}</h3>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function ReviewPricing() {
  return (
    <section className={`${s.pricing} ${s.reveal}`} aria-labelledby="pricing-title">
      <div className={s.pricingIntro}>
        <Eyebrow>{reviewPricing.eyebrow}</Eyebrow>
        <h2 id="pricing-title">{reviewPricing.title}</h2>
        <p>{reviewPricing.lead}</p>
      </div>
      <ul className={s.priceRow}>
        {reviewPricing.items.map((item) => (
          <li key={item.name}>
            <p className={s.priceLabel}>{item.name}</p>
            <p className={s.priceFigure}>{item.figure}</p>
            <p className={s.priceDetail}>{item.detail}</p>
          </li>
        ))}
      </ul>
      <p className={s.pricingNote}>{reviewPricing.note}</p>
      <div className={s.actions}>
        <Link className={s.primaryButton} href={reviewPricing.primaryHref}>
          {reviewPricing.primaryCta}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
        <HelpLink className={s.ghostButton}>{reviewPricing.secondaryCta}</HelpLink>
      </div>
    </section>
  )
}

export function ReviewFaq() {
  return (
    <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Review questions</Eyebrow>
        <h2 id="faq-title">Straight answers about challenge, response and cost.</h2>
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
    <section className={`${s.closingBand} ${s.reveal}`} aria-labelledby="closing-title">
      <div className={s.closing}>
        <Eyebrow>{reviewClosing.eyebrow}</Eyebrow>
        <h2 id="closing-title">{reviewClosing.title}</h2>
        <p>{reviewClosing.lead}</p>
        <div className={s.actions}>
          <HelpLink className={s.primaryOnDark}>{reviewClosing.primaryCta}</HelpLink>
          <Link className={s.secondaryOnDark} href={reviewClosing.secondaryHref}>
            {reviewClosing.secondaryCta}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
