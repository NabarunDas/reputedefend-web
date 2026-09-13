import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ContactForm } from "@/components/contact-form"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  contactBanner,
  contactClose,
  contactHero,
  contactIdentity,
  contactProcess,
  contactRoutes,
  contactSeo,
  contactTrust,
} from "./content"
import styles from "./contact.module.css"

const title = contactSeo.titlePage
const description = contactSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/contact" },
  openGraph: socialOpenGraph({ title, description, path: "/contact" }),
  twitter: socialTwitter({ title, description }),
}

export default function ContactPage() {
  return (
    <div className={`${styles.page} font-sans`}>
      <section className={styles.heroBand} aria-labelledby="contact-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{contactHero.eyebrow}</p>
          <h1 id="contact-title">{contactHero.title}</h1>
          <p className={styles.lead}>{contactHero.lead}</p>
          <p className={styles.heroNote}>{contactHero.supportLine}</p>
          <Link className={styles.heroLink} href={contactHero.assessmentHref}>
            {contactHero.assessmentCta}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className={styles.routes} aria-labelledby="routes-title">
        <h2 id="routes-title" className={styles.routesEyebrow}>{contactRoutes.eyebrow}</h2>
        <div className={styles.routeGrid}>
          <article className={styles.routeStay}>
            <p className={styles.statusStay}>{contactRoutes.general.status}</p>
            <h3>{contactRoutes.general.title}</h3>
            <p>{contactRoutes.general.copy}</p>
            <ul className={styles.examples}>
              {contactRoutes.general.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </article>
          <article className={styles.routeHelp}>
            <p className={styles.statusHelp}>{contactRoutes.active.status}</p>
            <h3>{contactRoutes.active.title}</h3>
            <p>{contactRoutes.active.copy}</p>
            <ul className={styles.examples}>
              {contactRoutes.active.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
            <Link href={contactRoutes.active.href}>
              {contactRoutes.active.cta}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <div className={styles.main}>
        <div className={styles.formColumn}>
          <ContactForm />
        </div>
        <aside className={styles.aside}>
          <section aria-labelledby="next-title">
            <h2 id="next-title">{contactProcess.title}</h2>
            <ol>
              {contactProcess.steps.map((step) => (
                <li key={step.n}>
                  <span className={styles.step} aria-hidden="true">{step.n}</span>
                  <p>{step.title}</p>
                </li>
              ))}
            </ol>
          </section>
          <ul className={styles.trust} aria-label="How Contact works">
            {contactTrust.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {contactIdentity.email ? (
            <div className={styles.emailBlock}>
              <p className={styles.emailLabel}>{contactIdentity.emailLabel}</p>
              <a href={`mailto:${contactIdentity.email}`}>{contactIdentity.email}</a>
            </div>
          ) : null}
          <p className={styles.identityNote}>{contactIdentity.positioning}</p>
        </aside>
      </div>

      <aside className={styles.banner} aria-labelledby="case-banner-title">
        <div>
          <h2 id="case-banner-title">{contactBanner.title}</h2>
          <p>{contactBanner.copy}</p>
        </div>
        <Link className={styles.bannerCta} href={contactBanner.href}>
          {contactBanner.cta}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </aside>

      <p className={styles.finalNote}>
        {contactClose.title}{" "}
        <Link href={contactClose.href}>{contactClose.cta}</Link>
      </p>
    </div>
  )
}
