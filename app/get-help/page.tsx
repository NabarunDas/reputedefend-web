import type { Metadata } from "next"
import { Lock, Shield, UserRoundCheck, Wallet } from "lucide-react"
import { CaseIntakeForm } from "@/components/case-intake-form"
import { parseServiceParam } from "@/lib/enquiry"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import styles from "./get-help.module.css"

const title = "Get Help With a Google Business Profile or Review Issue | ReputeDefend"
const description = "Tell ReputeDefend about a Google Business Profile, verification, access or review issue. Share the facts and get an independent assessment of the next appropriate step."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/get-help" },
  openGraph: socialOpenGraph({ title, description, path: "/get-help" }),
  twitter: socialTwitter({ title, description }),
}

const trustStrip = [
  { label: "Human-reviewed enquiries", icon: UserRoundCheck },
  { label: "No payment to submit", icon: Wallet },
  { label: "No passwords or verification codes", icon: Lock },
  { label: "Independent of Google", icon: Shield },
] as const

const nextSteps = [
  "A human reviews your enquiry",
  "We clarify anything important",
  "We explain the recommended next step",
]

export default async function GetHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>
}) {
  const params = await searchParams
  const initialService = parseServiceParam(params.service)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <section className={styles.hero} aria-labelledby="get-help-title">
          <p className={styles.eyebrow}>Get help with your case</p>
          <h1 id="get-help-title">Tell us what happened.</h1>
          <p className={styles.lead}>
            You don&apos;t need to diagnose the problem or prepare a perfect case file. Start with what changed, what Google has told you and what you have already tried. A human will review the information and help you understand the next practical step.
          </p>
          <p className={styles.trustLine}>Human case review • No payment to submit • No commitment to paid support</p>
        </section>

        <section className={styles.trustStrip} aria-label="How ReputeDefend handles enquiries">
          <ul>
            {trustStrip.map(({ label, icon: Icon }) => (
              <li key={label}>
                <span className={styles.stripIcon}>
                  <Icon aria-hidden="true" size={18} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.main}>
          <div className={styles.formColumn}>
            <CaseIntakeForm initialService={initialService} />
          </div>
          <aside className={styles.aside}>
            <section className={styles.next} aria-labelledby="next-title">
              <h2 id="next-title">What happens after you send this?</h2>
              <ol>
                {nextSteps.map((step, index) => (
                  <li key={step}>
                    <span className={styles.step} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <p className={styles.nextNote}>If further paid support appears appropriate, the scope and fee will be explained before you decide.</p>
            </section>
            <section className={styles.security} aria-labelledby="security-title">
              <h2 id="security-title">
                <Lock aria-hidden="true" size={18} />
                Keep your account secure
              </h2>
              <p>Never send passwords, verification codes or account credentials. If an action needs to be completed inside your Google account, we&apos;ll explain what you need to do.</p>
              <p className={styles.securityNote}>Only share information that is relevant to the issue.</p>
            </section>
            <section className={styles.payment} aria-labelledby="payment-title">
              <h2 id="payment-title">No payment to submit</h2>
              <p>Sending your case asks ReputeDefend to review the situation. It does not commit you to further paid support.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
