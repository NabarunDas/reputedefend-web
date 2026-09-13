import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { pageTitle } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  aboutBrandLine,
  aboutClose,
  aboutControl,
  aboutHero,
  aboutHold,
  aboutHuman,
  aboutIdentityPlate,
  aboutOperator,
  aboutPrinciples,
  aboutSeo,
  aboutServices,
  aboutSupport,
  aboutWhy,
} from "./content"
import styles from "./about.module.css"

const title = pageTitle(aboutSeo.titlePage)
const description = aboutSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: socialOpenGraph({ title, description, path: "/about" }),
  twitter: socialTwitter({ title, description }),
}

export default function AboutPage() {
  const operator = aboutOperator()

  return (
    <div className={`${styles.page} font-sans`}>
      <section className={styles.heroBand} aria-labelledby="about-title">
        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{aboutHero.eyebrow}</p>
            <h1 id="about-title">
              <span className={styles.titleMain}>{aboutHero.titleLines[0]}</span>
              <span>{aboutHero.titleLines[1]}</span>
            </h1>
            <p className={styles.lead}>{aboutHero.lead}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryOnDark} href={aboutHero.primaryHref}>
                {aboutHero.primaryCta}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className={styles.secondaryOnDark} href={aboutHero.secondaryHref}>
                {aboutHero.secondaryCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.heroNote}>{aboutHero.supportLine}</p>
          </div>
          <aside className={styles.plate} aria-label="Who operates ProfileRelaunch">
            <p className={styles.plateName}>{aboutIdentityPlate.name}</p>
            <p className={styles.plateOperator}>{aboutIdentityPlate.operatedBy}</p>
            <ul>
              {aboutIdentityPlate.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <p className={styles.eyebrow}>{aboutWhy.eyebrow}</p>
        <h2 id="why-title">{aboutWhy.title}</h2>
        <div className={styles.whyGrid}>
          <div className={styles.prose}>
            <p>{aboutWhy.lead}</p>
            <p>At that moment:</p>
            <ul>
              {aboutWhy.moment.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{aboutWhy.close}</p>
          </div>
          <ol className={styles.chain} aria-label="How ProfileRelaunch closes the gap">
            {aboutWhy.chain.map((step) => (
              <li key={step.n}>
                <span aria-hidden="true">{step.n}</span>
                <strong>{step.title}</strong>
              </li>
            ))}
          </ol>
        </div>
        <p className={styles.brandLine}>
          <strong>{aboutBrandLine.title}</strong>
          {aboutBrandLine.copy} {aboutBrandLine.tagline}
        </p>
      </section>

      <section className={styles.operator} aria-labelledby="operator-title">
        <p className={styles.eyebrow}>{operator.eyebrow}</p>
        <h2 id="operator-title">{operator.title}</h2>
        <div className={styles.prose}>
          <p>{operator.lead}</p>
          <p>{operator.positioning}</p>
          <p>{operator.purpose}</p>
        </div>
        <ul className={styles.legalLinks}>
          {operator.links.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.human} aria-labelledby="human-title">
        <p className={styles.eyebrow}>{aboutHuman.eyebrow}</p>
        <h2 id="human-title">{aboutHuman.title}</h2>
        <p className={styles.sectionLead}>{aboutHuman.lead}</p>
        <ul className={styles.humanPoints}>
          {aboutHuman.points.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={styles.tools}>{aboutHuman.tools}</p>
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <p className={styles.eyebrow}>{aboutPrinciples.eyebrow}</p>
        <h2 id="principles-title">{aboutPrinciples.title}</h2>
        <ol>
          {aboutPrinciples.items.map((item, index) => (
            <li key={item.label}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.hold} aria-labelledby="hold-title">
        <p className={styles.eyebrow}>{aboutHold.eyebrow}</p>
        <h2 id="hold-title">{aboutHold.title}</h2>
        <p>{aboutHold.lead}</p>
        <p>{aboutHold.close}</p>
      </section>

      <section className={styles.services} aria-labelledby="services-title">
        <p className={styles.eyebrow}>{aboutServices.eyebrow}</p>
        <h2 id="services-title">{aboutServices.title}</h2>
        <div className={styles.serviceGrid}>
          {[aboutServices.recovery, aboutServices.review].map((service) => (
            <article key={service.href}>
              <h3>{service.title}</h3>
              <ul>
                {service.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={service.href}>
                {service.cta}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.support} aria-labelledby="support-title">
        <p className={styles.eyebrow}>{aboutSupport.eyebrow}</p>
        <h2 id="support-title">{aboutSupport.title}</h2>
        <div className={styles.supportGrid}>
          <p>
            <strong>{aboutSupport.guided.label}</strong>
            {aboutSupport.guided.line}
          </p>
          <p>
            <strong>{aboutSupport.managed.label}</strong>
            {aboutSupport.managed.line}
          </p>
        </div>
        <Link className={styles.textLink} href={aboutSupport.href}>
          {aboutSupport.cta}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className={styles.control} aria-labelledby="control-title">
        <p className={styles.eyebrow}>{aboutControl.eyebrow}</p>
        <h2 id="control-title">{aboutControl.title}</h2>
        <div className={styles.controlGrid}>
          <div>
            <h3>{aboutControl.we.title}</h3>
            <ul>
              {aboutControl.we.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>{aboutControl.google.title}</h3>
            <ul>
              {aboutControl.google.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.independence}>{aboutControl.independence}</p>
        <p className={styles.security}>
          <strong>{aboutControl.security.title}</strong>
          {aboutControl.security.body}
        </p>
      </section>

      <section className={styles.closingBand} aria-labelledby="about-closing-title">
        <div className={styles.closing}>
          <p className={styles.eyebrow}>{aboutClose.eyebrow}</p>
          <h2 id="about-closing-title">{aboutClose.title}</h2>
          <p className={styles.closingLead}>{aboutClose.lead}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryOnDark} href={aboutClose.primaryHref}>
              {aboutClose.primaryCta}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className={styles.secondaryOnDark} href={aboutClose.secondaryHref}>
              {aboutClose.secondaryCta}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.tertiary}>
            <Link href={aboutClose.tertiaryHref}>{aboutClose.tertiaryCta}</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
