import { cookies, headers } from "next/headers"
import { confirmationCsrfToken, EMAIL_CONFIRM_SAVED } from "@/lib/cases/email-confirmation"
import { readEmailConfirmation } from "@/lib/cases/email-confirmation-command"
import { readSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import styles from "../confirm-email.module.css"
import { ConfirmEmailForm } from "./confirm-form"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Confirm your email address",
  robots: { index: false, follow: false },
}

const unavailable = {
  status: "unavailable" as const,
  publicRef: "",
  maskedEmail: "",
  caseType: "",
}

export default async function ConfirmEmailPage({ params }: { params: Promise<{ challengeId: string }> }) {
  const { challengeId } = await params
  const csrf = confirmationCsrfToken().slice(0, 64)
  const secure = (await headers()).get("x-forwarded-proto") === "https"
  ;(await cookies()).set("pr_email_confirm", csrf, {
    httpOnly: true,
    sameSite: "lax",
    path: "/confirm-email",
    maxAge: 1800,
    secure,
  })
  const view = readSupabaseConfig().ready
    ? await readEmailConfirmation(createSupabaseServerClient(), challengeId).catch(() => unavailable)
    : unavailable
  const heading = view.status === "confirmed"
    ? "Your email address is confirmed"
    : view.status === "expired"
      ? "This confirmation link has expired"
      : view.status === "pending"
        ? "Confirm your email address"
        : "This confirmation link cannot be used"
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="confirm-heading">
        <h1 id="confirm-heading">{heading}</h1>
        {view.publicRef && (
          <>
            <p className={styles.kicker}>Your case reference</p>
            <p className={styles.reference}>{view.publicRef}</p>
          </>
        )}
        {view.maskedEmail && <p>Email: {view.maskedEmail}</p>}
        <p>{EMAIL_CONFIRM_SAVED}</p>
        <p>ProfileRelaunch will never ask you for your Google password, one-time password, verification code or security answers.</p>
        {view.status !== "confirmed" && view.status !== "unavailable" && (
          <ConfirmEmailForm
            challengeId={challengeId}
            csrf={csrf}
            canConfirm={view.status === "pending"}
            canResend={view.status === "pending" || view.status === "expired"}
          />
        )}
        {view.status === "unavailable" && (
          <p className={styles.note}>Your assessment is already saved. You do not need to submit it again.</p>
        )}
      </section>
    </main>
  )
}
