import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { pageTitle } from "@/lib/brand"
import {
  earlyAccessLabel,
  pricingGroups,
  pricingIntro,
  pricingNote,
} from "@/lib/pricing"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import styles from "./pricing.module.css"

const title = pageTitle("Pricing")
const description =
  "Early Access pricing for Google Business Profile recovery, review protection and Relaunch Guard monitoring."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/pricing" },
  openGraph: socialOpenGraph({ title, description, path: "/pricing" }),
  twitter: socialTwitter({ title, description }),
}

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{earlyAccessLabel}</p>
        <h1>Clear fees for the work that needs doing.</h1>
        <p className={styles.lead}>{pricingIntro}</p>
      </header>

      <div className={styles.groups}>
        {pricingGroups.map((group) => (
          <section key={group.id} className={styles.group} aria-labelledby={`${group.id}-title`}>
            <h2 id={`${group.id}-title`}>{group.title}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <div className={styles.itemCopy}>
                    <h3>{item.name}</h3>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  <p className={styles.price}>
                    <span>{item.price}</span>
                    <span className={styles.cadence}>{item.cadence}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className={styles.note}>{pricingNote}</p>

      <p className={styles.actions}>
        <Link href="/get-help" className={`button-primary ${styles.cta}`}>
          Start your assessment
          <ArrowUpRight data-icon="inline-end" className="button-arrow" aria-hidden="true" />
        </Link>
      </p>
    </div>
  )
}
