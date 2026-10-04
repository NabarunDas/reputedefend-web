import { SignOutButton } from "../sign-out-button"
import type { CustomerAccount } from "@/lib/portal/account/parse"

export function AccountUnavailable() {
  return (
    <div className="account-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Account</h1>
      <h2>We couldn&apos;t load your account</h2>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

export function AccountView({ account }: { account: CustomerAccount }) {
  return (
    <div className="account-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Account</h1>
      <p className="lead">These are the contact details on your ProfileRelaunch account.</p>
      <dl className="account-facts">
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
          <dd>Verified</dd>
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
            <dd>{account.phoneVerified ? "Verified" : "Not verified"}</dd>
          </div>
        ) : null}
      </dl>
      <p>To change your name, email address, or phone number, contact ProfileRelaunch. This page cannot change those details.</p>
      <SignOutButton />
    </div>
  )
}
