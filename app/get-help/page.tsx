import type { Metadata } from "next"
import { LockKeyhole } from "lucide-react"
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

const nextSteps = [
  "We review what you share",
  "We identify what may need clarification",
  "We contact you with an assessment and recommended next step",
]

const avoid = [
  "Passwords",
  "Verification codes",
  "Account credentials",
  "Unnecessary sensitive personal information",
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
      <div className={styles.layout}>
        <section className={styles.hero} aria-labelledby="get-help-title">
          <p className={styles.eyebrow}>Get help with a case</p>
          <h1 id="get-help-title">Tell us what happened.</h1>
          <p className={styles.lead}>Start with the situation, the relevant links or messages and what you have already tried. You do not need to diagnose the problem or prepare a perfect case file before getting in touch.</p>
          <p className={styles.trustLine}>Independent • Confidential handling • No guaranteed outcomes</p>
        </section>
        <div className={styles.formColumn}>
          <CaseIntakeForm initialService={initialService} />
        </div>
        <aside className={styles.aside}>
          <section className={styles.next} aria-labelledby="next-title">
            <h2 id="next-title">What happens next?</h2>
            <ol>
              {nextSteps.map((step, index) => (
                <li key={step}>
                  <span className={styles.step}>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
            <p className={styles.nextNote}>You may be asked for additional information depending on the situation.</p>
          </section>
          <section className={styles.avoid} aria-labelledby="avoid-title">
            <h2 id="avoid-title">What not to send</h2>
            <ul>
              {avoid.map((item) => (
                <li key={item}>
                  <LockKeyhole size={16} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
