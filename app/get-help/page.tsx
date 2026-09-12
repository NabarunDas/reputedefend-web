import type { Metadata } from "next"
import { Lock, Shield, UserRoundCheck, Wallet } from "lucide-react"
import { CaseIntakeForm } from "@/components/case-intake-form"
import { pageTitle } from "@/lib/brand"
import { parseServiceParam } from "@/lib/enquiry"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import styles from "./get-help.module.css"

const title = pageTitle("Get Help With a Google Business Profile or Review Issue")
const description = "Tell ProfileRelaunch about a Google Business Profile, verification, access or review issue. A human reviews the situation, identifies the information that matters and helps you understand the strongest appropriate next step."

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
  "A human reviews your case",
  "We identify what matters or needs clarification",
  "We explain the recommended next step and why",
]

const lookAt = [
  "What changed and when",
  "What Google has told you",
  "What you have already tried",
  "What evidence or information may matter next",
] as const

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
            You don&apos;t need to diagnose the problem or prepare a perfect case file. Start with what changed, what Google has told you and what you have already tried. A human will review the situation, identify what matters and help you understand the strongest appropriate next step.
          </p>
          <p className={styles.trustLine}>Human case review • Evidence-led assessment • Clear next steps</p>
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
            </section>
            <section className={styles.look} aria-labelledby="look-title">
              <h2 id="look-title">What we&apos;ll look at</h2>
              <p>You don&apos;t need to organise the case perfectly. We look at the information together to understand what is most relevant.</p>
              <ul>
                {lookAt.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className={styles.security} aria-labelledby="security-title">
              <h2 id="security-title">
                <Lock aria-hidden="true" size={18} />
                Keep your account secure
              </h2>
              <p>Never send passwords, verification codes or account credentials. If an action needs to be completed inside your Google account, we&apos;ll explain what you need to do.</p>
              <p className={styles.securityNote}>Only share information that is relevant to the issue.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
