import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StartMonitoringForm } from "@/components/start-monitoring-form"
import { pageTitle } from "@/lib/brand"
import { guardPrice } from "@/lib/guard-offer"
import { isMonitoringPersistenceEnabled } from "@/lib/monitoring/persistence-config"
import styles from "./start-monitoring.module.css"

const title = pageTitle("Start Relaunch Guard Monitoring")
const description = "Start setting up Relaunch Guard for your Google Business Profile."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  robots: { index: false, follow: true },
}

export const dynamic = "force-dynamic"

const priceLine = `${guardPrice} per month, per location`

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
            Tell us which Google Business Profile you would like us to monitor. You do not need an existing problem or a previous case.
          </p>
          <p className={styles.price}>{priceLine}</p>
          <p className={styles.heroNote}>
            Sending this request does not take payment or start monitoring. We confirm access and complete an initial check before arranging payment and confirming activation.
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
              We review your details and contact you by email. We then confirm your permission, explain how to add us as a Manager and check access to each profile. Before payment, we confirm the locations and total monthly cost.
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
