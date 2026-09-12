import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileSearch,
  Plus,
} from "lucide-react"
import { EnquiryForm } from "@/components/enquiry-form"
import {
  homepageConversion,
  homepageFaqs,
  homepageGuard,
  homepageHero,
  homepagePricingPreview,
  homepageProblems,
  homepageProcess,
  homepageServices,
  homepageTrustStrip,
  homepageWhy,
} from "@/lib/homepage-content"
import styles from "./homepage.module.css"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>
}

function CaseVisual() {
  return (
    <figure className={styles.caseVisual} aria-label="Issue detected, then case review, then a Guided or Managed next step">
      <div className={styles.caseChrome}>
        <span>Case file</span>
        <span>Assessment</span>
      </div>
      <div className={`${styles.caseStage} ${styles.stageIssue}`}>
        <p className={styles.stageLabel}>Issue detected</p>
        <ul>
          <li>Profile suspended</li>
          <li>Verification failed</li>
          <li>Suspicious review</li>
        </ul>
      </div>
      <div className={styles.caseArrow} aria-hidden="true" />
      <div className={`${styles.caseStage} ${styles.stageReview}`}>
        <p className={styles.stageLabel}>Case review</p>
        <ul>
          <li>Evidence checked</li>
          <li>Policy/context reviewed</li>
          <li>Route identified</li>
        </ul>
      </div>
      <div className={styles.caseArrow} aria-hidden="true" />
      <div className={`${styles.caseStage} ${styles.stageNext}`}>
        <p className={styles.stageLabel}>Next step</p>
        <div className={styles.routePair}>
          <span>Guided</span>
          <span className={styles.routeOr}>or</span>
          <span>Managed</span>
        </div>
      </div>
    </figure>
  )
}

export function HomeHero() {
  return (
    <section className={`${styles.heroBand} ${styles.enter}`} aria-labelledby="home-title">
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <Eyebrow>{homepageHero.eyebrow}</Eyebrow>
          <h1 id="home-title">
            {homepageHero.titleLines[0]}
            <span>{homepageHero.titleLines[1]}</span>
          </h1>
          <p className={styles.lead}>{homepageHero.lead}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href={homepageHero.primaryHref}>
              {homepageHero.primaryCta}
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
            <Link className={styles.secondaryButton} href={homepageHero.secondaryHref}>
              {homepageHero.secondaryCta}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
          <p className={styles.heroNote}>{homepageHero.supportLine}</p>
        </div>
        <CaseVisual />
      </div>
    </section>
  )
}

export function HomeTrustStrip() {
  return (
    <section className={`${styles.trustStrip} ${styles.reveal}`} aria-label="How ProfileRelaunch works with you">
      <ul>
        {homepageTrustStrip.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}

export function HomeSituations() {
  return (
    <section id="home-situations" className={`${styles.situations} ${styles.reveal}`} aria-labelledby="situations-title">
      <div className={styles.situationIntro}>
        <Eyebrow>{homepageProblems.eyebrow}</Eyebrow>
        <h2 id="situations-title">{homepageProblems.title}</h2>
        <p>{homepageProblems.lead}</p>
      </div>
      <ol className={styles.problemList}>
        {homepageProblems.items.map((item, index) => (
          <li key={item}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ol>
      <p className={styles.situationCta}>
        {homepageProblems.unsure}{" "}
        <Link href="/get-help">{homepageProblems.cta}</Link>
      </p>
    </section>
  )
}

export function HomeServices() {
  const { profile, review } = homepageServices
  return (
    <section id="home-services" className={`${styles.servicesBand} ${styles.reveal}`} aria-labelledby="services-title">
      <div className={styles.servicesIntro}>
        <Eyebrow>{homepageServices.eyebrow}</Eyebrow>
        <h2 id="services-title">{homepageServices.title}</h2>
        <p>{homepageServices.lead}</p>
      </div>
      <article className={styles.serviceProfile} aria-labelledby="profile-recovery-title">
        <div className={styles.serviceCopy}>
          <p className={styles.serviceKicker}>{profile.kicker}</p>
          <h3 id="profile-recovery-title">{profile.title}</h3>
          <p>{profile.lead}</p>
          <Link className={styles.serviceCta} href={profile.href}>
            {profile.cta}
            <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
        </div>
        <ul>
          {profile.points.map((point) => (
            <li key={point}>
              <Check aria-hidden="true" size={16} />
              {point}
            </li>
          ))}
        </ul>
      </article>
      <article className={styles.serviceReview} aria-labelledby="review-protection-title">
        <ul>
          {review.points.map((point) => (
            <li key={point}>
              <Check aria-hidden="true" size={16} />
              {point}
            </li>
          ))}
        </ul>
        <div className={styles.serviceCopy}>
          <p className={styles.serviceKicker}>{review.kicker}</p>
          <h3 id="review-protection-title">{review.title}</h3>
          <p>{review.lead}</p>
          <p className={styles.serviceLimit}>{review.limit}</p>
          <Link className={styles.serviceCtaLight} href={review.href}>
            {review.cta}
            <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </article>
    </section>
  )
}

export function HomeProcess() {
  const closing = homepageProcess.steps[3]
  return (
    <section id="home-process" className={`${styles.process} ${styles.reveal}`} aria-labelledby="process-title">
      <div className={styles.processIntro}>
        <div>
          <Eyebrow>{homepageProcess.eyebrow}</Eyebrow>
          <h2 id="process-title">{homepageProcess.title}</h2>
        </div>
        <p>{homepageProcess.lead}</p>
      </div>
      <ol className={styles.processList}>
        {homepageProcess.steps.slice(0, 3).map((step) => (
          <li key={step.n}>
            <span className={styles.processNumber}>{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </li>
        ))}
      </ol>
      <div className={styles.processChoice}>
        <div className={styles.processChoiceIntro}>
          <span className={styles.processNumber}>{closing.n}</span>
          <h3>{closing.title}</h3>
          <p>{closing.copy}</p>
        </div>
        <div className={styles.modelGrid}>
          {homepageProcess.models.map((model) => (
            <article key={model.name}>
              <h4>{model.name}</h4>
              <p className={styles.modelLine}>{model.line}</p>
              <p>{model.copy}</p>
            </article>
          ))}
        </div>
      </div>
      <Link className={styles.textLink} href={homepageProcess.moreHref}>
        {homepageProcess.moreCta}
        <ArrowRight aria-hidden="true" size={18} />
      </Link>
    </section>
  )
}

export function HomePricing() {
  return (
    <section id="home-pricing" className={`${styles.pricing} ${styles.reveal}`} aria-labelledby="pricing-title">
      <div className={styles.pricingIntro}>
        <Eyebrow>{homepagePricingPreview.eyebrow}</Eyebrow>
        <h2 id="pricing-title">{homepagePricingPreview.title}</h2>
        <p>{homepagePricingPreview.lead}</p>
      </div>
      <ul className={styles.priceGrid}>
        {homepagePricingPreview.items.map((item) => (
          <li key={item.label}>
            <p className={styles.priceLabel}>{item.label}</p>
            <p className={styles.priceFigure}>{item.figure}</p>
            <p className={styles.priceDetail}>{item.detail}</p>
          </li>
        ))}
      </ul>
      <p className={styles.pricingNote}>{homepagePricingPreview.note}</p>
      <div className={styles.actions}>
        <Link className={styles.primaryButton} href={homepagePricingPreview.primaryHref}>
          {homepagePricingPreview.primaryCta}
          <ArrowUpRight aria-hidden="true" size={18} />
        </Link>
        <Link className={styles.ghostButton} href={homepagePricingPreview.secondaryHref}>
          {homepagePricingPreview.secondaryCta}
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </div>
    </section>
  )
}

export function HomeGuard() {
  return (
    <section className={`${styles.guard} ${styles.reveal}`} aria-labelledby="guard-title">
      <div className={styles.guardCopy}>
        <Eyebrow>{homepageGuard.eyebrow}</Eyebrow>
        <h2 id="guard-title">{homepageGuard.title}</h2>
        <p>{homepageGuard.lead}</p>
        <Link className={styles.textLink} href={homepageGuard.href}>
          {homepageGuard.cta}
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </div>
      <div className={styles.guardMeta}>
        <p className={styles.guardPrice}>{homepageGuard.price}</p>
        <ul>
          {homepageGuard.points.map((point) => (
            <li key={point}>
              <FileSearch aria-hidden="true" size={16} />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function HomeWhy() {
  return (
    <section className={`${styles.whyBand} ${styles.reveal}`} aria-labelledby="why-title">
      <div className={styles.why}>
        <div className={styles.whyIntro}>
          <Eyebrow>{homepageWhy.eyebrow}</Eyebrow>
          <h2 id="why-title">{homepageWhy.title}</h2>
          <p>{homepageWhy.lead}</p>
        </div>
        <ol className={styles.whyList}>
          {homepageWhy.principles.map((item, index) => (
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

export function HomeFaq() {
  return (
    <section className={`${styles.faqSection} ${styles.reveal}`} aria-labelledby="faq-title">
      <div>
        <Eyebrow>Questions you may have</Eyebrow>
        <h2 id="faq-title">Straight answers before you start.</h2>
        <p>If a Business Profile or review issue is already affecting the business, these should help you decide how to begin.</p>
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
    <section className={`${styles.conversionBand} ${styles.reveal}`} aria-labelledby="case-title">
      <div className={styles.conversion}>
        <div className={styles.conversionCopy}>
          <Eyebrow>{homepageConversion.eyebrow}</Eyebrow>
          <h2 id="case-title">{homepageConversion.title}</h2>
          <p>{homepageConversion.lead}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryOnDark} href={homepageConversion.primaryHref}>
              {homepageConversion.primaryCta}
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
            <Link className={styles.secondaryOnDark} href={homepageConversion.secondaryHref}>
              {homepageConversion.secondaryCta}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
          <ul className={styles.conversionPoints}>
            {homepageConversion.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className={styles.formPanel}>
          <p className={styles.formIntro}>{homepageConversion.formIntro}</p>
          <EnquiryForm caseMode source="homepage" submitLabel="Send a short note" />
        </div>
      </div>
    </section>
  )
}

export function Homepage({ children }: { children: React.ReactNode }) {
  return <div className={`${styles.home} font-sans`}>{children}</div>
}
