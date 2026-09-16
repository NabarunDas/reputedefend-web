import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StartMonitoringForm } from "@/components/start-monitoring-form"
import { pageTitle } from "@/lib/brand"
import { isMonitoringPersistenceEnabled } from "@/lib/monitoring/persistence-config"
import { pricingGroups } from "@/lib/pricing"
import styles from "./start-monitoring.module.css"

const title = pageTitle("Start Relaunch Guard Monitoring")
const description = "Start setting up Relaunch Guard for your Google Business Profile."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  robots: { index: false, follow: true },
}

export const dynamic = "force-dynamic"

const guardPrice = pricingGroups.find((group) => group.id === "relaunch-guard")?.items[0]
const priceLine = guardPrice
  ? `${guardPrice.price}/month per location — Early Access`
  : "£9.99/month per location — Early Access"

const trustItems = [
  "No current problem required",
  "Human-reviewed setup",
  "No passwords or verification codes",
]

export default function StartMonitoringPage() {
  if (!isMonitoringPersistenceEnabled()) notFound()

  return (
    <div className={`${styles.page} font-sans`}>
      <section className={styles.heroBand} aria-labelledby="start-monitoring-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Relaunch Guard</p>
          <h1 id="start-monitoring-title">Start your monitoring setup</h1>
          <p className={styles.lead}>
            Tell us which Google Business Profile you want to protect. You do not need to have a current problem.
          </p>
          <p className={styles.price}>{priceLine}</p>
          <p className={styles.heroNote}>
            Submitting this form starts the setup process. Monitoring is not active until the required setup steps have been completed.
          </p>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="How Relaunch Guard setup works">
        <ul>
          {trustItems.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>

      <div className={styles.main}>
        <div className={styles.formColumn}>
          <StartMonitoringForm />
        </div>
        <aside className={styles.aside}>
          <section className={styles.panel} aria-labelledby="next-title">
            <h2 id="next-title">What happens next</h2>
            <p>
              A ProfileRelaunch specialist will review the setup details. If we need clarification, we will contact you by email before any further step.
            </p>
          </section>
          <section className={styles.panel} aria-labelledby="active-title">
            <h2 id="active-title">Monitoring is not active yet</h2>
            <p>
              Requesting setup does not start monitoring, take payment or connect your Google account. Those steps come later.
            </p>
          </section>
          <section className={styles.panel} aria-labelledby="security-title">
            <h2 id="security-title">Security reminder</h2>
            <p>
              ProfileRelaunch will never ask you for your Google password, one-time password, verification code or security answers.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
