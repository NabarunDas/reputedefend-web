import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react"
import { pageTitle } from "@/lib/brand"
import { guardHeroDisclaimer, guardPrimaryAction } from "@/lib/guard-offer"
import { isMonitoringPersistenceEnabled } from "@/lib/monitoring/persistence-config"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  guardClose,
  guardCoverage,
  guardFaqTitle,
  guardFaqs,
  guardHero,
  guardIncluded,
  guardIntervention,
  guardSchedule,
  guardSeo,
  guardSetup,
} from "./content"
import styles from "./guard.module.css"

export const dynamic = "force-dynamic"

const title = pageTitle(guardSeo.titlePage)
const description = guardSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: guardSeo.canonical },
  openGraph: socialOpenGraph({ title, description, path: guardSeo.canonical }),
  twitter: socialTwitter({ title, description }),
}

function FaqAnswer({ text, contactLink }: { text: string; contactLink?: boolean }) {
  if (!contactLink || !text.startsWith("Contact us")) {
    return <p>{text}</p>
  }

  return (
    <p>
      <Link href="/contact">Contact us</Link>
      {text.slice("Contact us".length)}
    </p>
  )
}

export function GuardSalesView({ setupEnabled }: { setupEnabled: boolean }) {
  const primary = guardPrimaryAction(setupEnabled)
  const disclaimer = guardHeroDisclaimer(setupEnabled)

  return (
    <div className={`${styles.page} font-sans`}>
      <section className={styles.heroBand} aria-labelledby="guard-title">
        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{guardHero.eyebrow}</p>
            <h1 id="guard-title">{guardHero.title}</h1>
            <p className={styles.lead}>{guardHero.lead}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryOnDark} href={primary.href}>
                {primary.label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className={styles.secondaryOnDark} href={guardHero.secondaryHref}>
                {guardHero.secondaryCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.heroNote}>{disclaimer}</p>
          </div>
          <aside className={styles.priceCard} aria-label={guardHero.priceLabel}>
            <p className={styles.priceLabel}>{guardHero.priceLabel}</p>
            <p className={styles.price}>{guardHero.price}</p>
            <p className={styles.priceSupport}>{guardHero.supporting}</p>
          </aside>
        </div>
      </section>

      <section className={styles.coverage} aria-labelledby="coverage-title">
        <h2 id="coverage-title">{guardCoverage.title}</h2>
        <ul className={styles.cardGrid}>
          {guardCoverage.cards.map((card) => (
            <li key={card.title}>
              <article>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            </li>
          ))}
        </ul>
        <p className={styles.sectionNote}>{guardCoverage.note}</p>
      </section>

      <section className={styles.schedule} aria-labelledby="schedule-title">
        <div className={styles.schedulePanel}>
          <h2 id="schedule-title">{guardSchedule.title}</h2>
          <p>{guardSchedule.body}</p>
          <p>{guardSchedule.followUp}</p>
          <p className={styles.supporting}>{guardSchedule.supporting}</p>
        </div>
      </section>

      <section className={styles.setup} id={guardSetup.id} aria-labelledby="setup-title">
        <h2 id="setup-title">{guardSetup.title}</h2>
        <ol className={styles.stepGrid}>
          {guardSetup.steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.security}>{guardSetup.security}</p>
      </section>

      <section className={styles.intervention} aria-labelledby="intervention-title">
        <h2 id="intervention-title">{guardIntervention.title}</h2>
        <p>{guardIntervention.body}</p>
        <ul className={styles.serviceLinks}>
          {guardIntervention.links.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>
                {item.label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.benefit}>
          <h3>{guardIntervention.benefitTitle}</h3>
          <p>{guardIntervention.benefitBody}</p>
          <details>
            <summary>
              {guardIntervention.disclosureSummary}
              <Plus aria-hidden="true" size={18} />
            </summary>
            {guardIntervention.disclosure.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </details>
        </div>
      </section>

      <section className={styles.included} aria-labelledby="included-title">
        <h2 id="included-title">{guardIncluded.title}</h2>
        <p>{guardIncluded.body}</p>
        <p>{guardIncluded.followUp}</p>
        <p className={styles.supporting}>{guardIncluded.supporting}</p>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title">
        <h2 id="faq-title">{guardFaqTitle}</h2>
        <div className={styles.faqList}>
          {guardFaqs.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <Plus aria-hidden="true" size={18} />
              </summary>
              {item.a.map((paragraph) => (
                <FaqAnswer
                  key={paragraph}
                  text={paragraph}
                  contactLink={"contactLink" in item ? item.contactLink : false}
                />
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className={styles.closingBand} aria-labelledby="guard-close-title">
        <div className={styles.closing}>
          <h2 id="guard-close-title">{guardClose.title}</h2>
          <p className={styles.closingLead}>{guardClose.body}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryOnDark} href={primary.href}>
              {primary.label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.closingSupport}>
            {guardClose.supporting}{" "}
            <Link href={guardClose.assessmentHref}>{guardClose.assessmentLabel}</Link>
          </p>
        </div>
      </section>
    </div>
  )
}

export default function RelaunchGuardPage() {
  return <GuardSalesView setupEnabled={isMonitoringPersistenceEnabled()} />
}
