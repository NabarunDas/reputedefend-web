import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { TelloyaStreamPlayer } from "@/components/telloya-stream-player"
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { DEMO_DISCLOSURE, demoPageCopy } from "@/lib/demo-script"
import { DemoExperience } from "./demo-player"
import styles from "./demo.module.css"

export const metadata: Metadata = {
  title: absolutePageTitle(demoPageCopy.seo.title),
  description: demoPageCopy.seo.description,
  alternates: { canonical: "/demo" },
  ...pageSocialMetadata({
    title: demoPageCopy.seo.title,
    description: demoPageCopy.seo.description,
    path: "/demo",
  }),
}

const filmPoster = {
  src: "/demo/telloya-film-poster.webp",
  width: 1280,
  height: 720,
}

export default function DemoPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="demo-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{demoPageCopy.eyebrow}</p>
          <h1 id="demo-title" className={styles.heroTitle}>
            {demoPageCopy.title}
          </h1>
          <p className={styles.heroLead}>{demoPageCopy.lead}</p>
        </div>
        <div className={styles.film}>
          <TelloyaStreamPlayer
            poster={filmPoster}
            description={demoPageCopy.filmNote}
            descriptionPlacement="after"
            emphasizePlay
          />
        </div>
        <div className={styles.heroActions}>
          <div className={styles.ctaRow}>
            <Link className={styles.primaryLink} href={demoPageCopy.enquireHref}>
              {demoPageCopy.videoEnquireCta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className={styles.secondaryLink} href={demoPageCopy.pricingHref}>
              {demoPageCopy.pricingCta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.ctaAssurance}>{demoPageCopy.ctaLead}</p>
        </div>
      </section>

      <div className={styles.body}>
        <section className={styles.walkthrough} aria-labelledby="walkthrough-title">
          <h2 id="walkthrough-title" className={styles.walkthroughTitle}>{demoPageCopy.walkthroughTitle}</h2>
          <p className={styles.walkthroughLead}>{demoPageCopy.walkthroughLead}</p>
          <p id="demo-disclosure" className={styles.disclosure} role="note">
            {DEMO_DISCLOSURE}
          </p>
          <p className={styles.fiction}>{demoPageCopy.fictionNote}</p>
          <DemoExperience />
        </section>

        <section className={styles.ctaSection} aria-labelledby="demo-cta-title">
          <h2 id="demo-cta-title" className={styles.ctaTitle}>
            {demoPageCopy.ctaTitle}
          </h2>
          <p className={styles.ctaLead}>{demoPageCopy.ctaLead}</p>
          <div className={styles.ctaRow}>
            <Link className={styles.primaryLink} href={demoPageCopy.pricingHref}>
              {demoPageCopy.pricingCta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className={styles.secondaryLink} href={demoPageCopy.enquireHref}>
              {demoPageCopy.enquireCta} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
