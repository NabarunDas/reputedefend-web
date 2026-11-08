import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Check, ExternalLink } from "lucide-react"
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { pricingContent } from "@/lib/content"
import { formatGbpPrice, formatMinutes } from "@/lib/pricing"
import { ComparisonScroller } from "./comparison-scroller"
import styles from "./pricing.module.css"

const { seo, hero, currency, plans, standardIncludes, guard, comparison, overage, setup, international, faq, cta } = pricingContent

export const metadata: Metadata = {
  title: absolutePageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/pricing" },
  ...pageSocialMetadata({ title: seo.title, description: seo.description, path: "/pricing" }),
}

export default function Pricing() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero} aria-labelledby="pricing-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{hero.eyebrow}</p>
          <h1 id="pricing-title" className={styles.heroTitle}>
            {hero.title}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
          <p className={styles.currencyNote}>{currency.note}</p>
        </div>
      </section>

      <div className={styles.body}>
        {/* Plans */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-label="Telloya pricing plans">
          <div className={styles.plansGrid}>
            {plans.map((plan) => (
              <article 
                key={plan.tier} 
                className={`${styles.planCard} ${plan.popular ? styles.popularPlan : ""}`}
                data-tier={plan.tier}
              >
                {plan.popular && <div className={styles.popularBadge}>Recommended</div>}
                <div className={styles.planHeader}>
                  <h2>{plan.name}</h2>
                  <p className={styles.planTagline}>{plan.tagline}</p>
                </div>
                <div className={styles.planPricing}>
                  {plan.monthlyPriceGbp !== null ? (
                    <>
                      <div className={styles.planPrice}>
                        {formatGbpPrice(plan.monthlyPriceGbp)}<span className={styles.planPricePeriod}>/month</span>
                      </div>
                      {plan.minutesPerMonth !== null && (
                        <div className={styles.planMinutes}>{formatMinutes(plan.minutesPerMonth)}</div>
                      )}
                    </>
                  ) : (
                    <div className={styles.planPrice}>By quotation</div>
                  )}
                </div>
                <p className={styles.planDescription}>{plan.description}</p>
                {plan.tier === "custom" ? (
                  <ul className={styles.planFeatures}>
                    {plan.features.map((feature, index) => (
                      <li key={index}>
                        <Check size={16} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.planEntitlement}>1 operating location · 1 receptionist number</p>
                )}
                <Link className={styles.planCta} href={plan.href}>
                  {plan.cta} <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
          <div className={styles.standardIncludes}>
            <h2 className={styles.standardIncludesTitle}>{standardIncludes.title}</h2>
            <ul className={styles.standardIncludesList}>
              {standardIncludes.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className={styles.standardIncludesNote}>{standardIncludes.note}</p>
          </div>
        </section>

        {/* Relaunch Guard Add-on */}
        <section className={`${styles.sectionWrap} ${styles.section} ${styles.guardSection}`} aria-labelledby="guard-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{guard.eyebrow}</p>
            <h2 id="guard-title" className={styles.sectionTitle}>
              {guard.title}
            </h2>
            <p className={styles.sectionLead}>{guard.lead}</p>
          </div>
          
          <div className={styles.guardContent}>
            <div className={styles.guardPricing}>
              <div className={styles.guardPrice}>
                {formatGbpPrice(guard.pricePerLocationGbp)}<span className={styles.guardPricePeriod}>/location/month</span>
              </div>
              <ul className={styles.guardFeatures}>
                {guard.features.map((feature, index) => (
                  <li key={index}>
                    <Check size={16} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a 
                href={guard.infoUrl} 
                className={styles.guardLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more about Relaunch Guard <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>

            <div className={styles.guardExamples}>
              <h3>Combined pricing examples</h3>
              <p className={styles.guardExamplesLead}>One location with Guard:</p>
              <div className={styles.guardExamplesList}>
                {guard.examples.map((example) => (
                  <div key={example.plan} className={styles.guardExample}>
                    <div className={styles.guardExamplePlan}>{example.plan}</div>
                    <div className={styles.guardExampleCalc}>
                      {formatGbpPrice(example.telloyaPrice)} + {formatGbpPrice(example.guardPrice)} = <strong>{formatGbpPrice(example.combinedPrice)}/month</strong>
                    </div>
                  </div>
                ))}
              </div>
              <p className={styles.guardExamplesNote}>{guard.quantityNote}</p>
            </div>
          </div>

          <div className={styles.guardNotes}>
            <p className={styles.guardNote}>{guard.note}</p>
            <p className={styles.guardNote}>
              <strong>{guard.telloyaCompleteName}:</strong> {guard.telloyaCompleteNote}
            </p>
          </div>
        </section>

        {/* Comparison Table */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="comparison-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{comparison.eyebrow}</p>
            <h2 id="comparison-title" className={styles.sectionTitle}>
              {comparison.title}
            </h2>
            <p className={styles.sectionLead}>{comparison.lead}</p>
          </div>
          <ComparisonScroller>
            <table className={styles.comparisonTable}>
              <caption className={styles.visuallyHidden}>Telloya plan features and allowances</caption>
              <thead>
                <tr>
                  {comparison.table.headers.map((header) => (
                    <th key={header} scope="col">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.table.rows.map((row, index) => (
                  <tr key={index}>
                    <th scope="row" className={styles.featureCell}>{row[0]}</th>
                    {row.slice(1).map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        {typeof cell === "boolean" ? (
                          cell ? (
                            <span className={styles.checkmark} aria-label="Included">✓</span>
                          ) : (
                            <span className={styles.dash} aria-label="Not included">—</span>
                          )
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ComparisonScroller>
        </section>

        {/* Overage Policy */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="overage-title">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{overage.eyebrow}</p>
            <h2 id="overage-title" className={styles.sectionTitle}>
              {overage.title}
            </h2>
            <p className={styles.sectionLead}>{overage.lead}</p>
          </div>
          <ul className={styles.overageList}>
            {overage.points.map((point, index) => (
              <li key={index}>
                <Check size={16} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className={styles.overageNote}>{overage.note}</p>
        </section>

        {/* Setup and Terms */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="setup-title">
          <div className={styles.sectionHeader}>
            <h2 id="setup-title" className={styles.sectionTitle}>
              {setup.title}
            </h2>
          </div>
          <div className={styles.setupGrid}>
            {setup.points.map((point) => (
              <article key={point.title} className={styles.setupCard}>
                <h3>{point.title}</h3>
                <p>{point.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* International */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="international-title">
          <div className={styles.sectionHeader}>
            <h2 id="international-title" className={styles.sectionTitle}>
              {international.title}
            </h2>
          </div>
          <ul className={styles.internationalList}>
            {international.points.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
          <p className={styles.internationalNote}>{international.note}</p>
        </section>

        {/* FAQ */}
        <section className={`${styles.sectionWrap} ${styles.section}`} aria-labelledby="faq-title">
          <div className={styles.sectionHeader}>
            <h2 id="faq-title" className={styles.sectionTitle}>
              {faq.title}
            </h2>
          </div>
          <div className={styles.faqList}>
            {faq.questions.map((item) => (
              <article key={item.q} className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>{item.q}</h3>
                <p className={styles.faqAnswer}>{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className={styles.sectionWrap}>
          <section className={styles.ctaSection} aria-labelledby="cta-title">
            <h2 id="cta-title" className={styles.ctaTitle}>
              {cta.title}
            </h2>
            <p className={styles.ctaDescription}>{cta.description}</p>
            <Link className={styles.ctaButton} href={cta.href}>
              {cta.cta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}
