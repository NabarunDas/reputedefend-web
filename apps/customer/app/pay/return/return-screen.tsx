import type { PaymentReturnView } from "@/lib/portal/payments/return-view"
import styles from "../../portal/payments/transaction.module.css"
import { PaymentReturnRefresh } from "./refresh"

const toneLabel: Record<PaymentReturnView["tone"], string> = {
  signed_out: "Sign in to continue",
  unavailable: "Status unavailable",
  empty: "Not recorded yet",
  pending: "Being confirmed",
  paid: "Received",
  failed: "Not collected",
}

function toneClass(tone: PaymentReturnView["tone"]): string {
  if (tone === "paid") return styles.good
  if (tone === "failed") return styles.problem
  if (tone === "empty" || tone === "unavailable") return styles.quiet
  return styles.pending
}

export function PaymentReturnScreen({ view }: { view: PaymentReturnView }) {
  return (
    <section className={styles.action}>
      <div className={`${styles.returnCard} ${styles.page}`}>
        <p className={styles.brandRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/profile-relaunch-logo.png" alt="ProfileRelaunch" />
        </p>
        <p className={styles.kicker}>Payment</p>
        <div className={styles.summaryHead}>
          <h1>{view.heading}</h1>
          <p className={`${styles.status} ${toneClass(view.tone)}`}>{toneLabel[view.tone]}</p>
        </div>
        {view.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {view.links.length ? (
          <p className={styles.links}>
            {view.links.map((link, index) => (
              <a key={link.href} className={index === 0 ? "portal-button" : "portal-button secondary"} href={link.href}>{link.label}</a>
            ))}
          </p>
        ) : null}
        {view.refresh ? <PaymentReturnRefresh /> : null}
      </div>
    </section>
  )
}
