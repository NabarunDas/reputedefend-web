import { SignOutButton } from "../sign-out-button"
import type { CustomerAccount } from "@/lib/portal/account/parse"
import { legalIdentity } from "../../../../../lib/legal"
import { brandSiteUrl } from "../../../../../lib/brand"
import styles from "../payments/transaction.module.css"

export function AccountUnavailable() {
  return (
    <div className="account-page state-panel">
      <h1>Account</h1>
      <h2>We couldn&apos;t load your account</h2>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

export function AccountView({ account }: { account: CustomerAccount }) {
  return (
    <div className={`account-page ${styles.page}`}>
      <header className={`${styles.profile} ${styles.summary}`}>
        <p className={styles.kicker}>Profile</p>
        <h1>Account</h1>
        <p className="lead">These are the contact details on your ProfileRelaunch account.</p>
        <dl className={`account-facts ${styles.facts}`}>
          <div>
            <dt>Name</dt>
            <dd>{account.name}</dd>
          </div>
          <div>
            <dt>Signed-in email</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd><span className={`${styles.status} ${styles.good}`}>Verified</span></dd>
          </div>
          {account.phone ? (
            <div>
              <dt>Phone</dt>
              <dd>{account.phone}</dd>
            </div>
          ) : null}
          {account.phone ? (
            <div>
              <dt>Phone verification</dt>
              <dd><span className={`${styles.status} ${account.phoneVerified ? styles.good : styles.pending}`}>{account.phoneVerified ? "Verified" : "Not verified"}</span></dd>
            </div>
          ) : null}
        </dl>
      </header>
      <section className={`${styles.panel} ${styles.security}`} aria-labelledby="account-security-heading">
        <h2 id="account-security-heading">Security</h2>
        <p>Signing out ends this browser session. This page does not change your password, email or phone.</p>
        <p>Use the sign-out control when you are finished on a shared device.</p>
      </section>
      <section className={`account-help ${styles.panel}`} aria-labelledby="account-help-heading">
        <h2 id="account-help-heading">Need to update your details?</h2>
        <p>Email us and we will confirm the change before it is applied. There is no self-service editor for these details.</p>
        <p className={styles.links}>
          <a className="portal-button" href={`mailto:${legalIdentity.contactEmail}`}>{legalIdentity.contactEmail}</a>
          <a className="portal-button secondary" href={`${brandSiteUrl}/contact`}>Contact ProfileRelaunch</a>
        </p>
      </section>
      <SignOutButton />
    </div>
  )
}
