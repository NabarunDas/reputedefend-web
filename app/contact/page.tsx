import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ContactForm } from "@/components/contact-form"
import { hasLegalValue, legalIdentity } from "@/lib/legal"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import styles from "./contact.module.css"

const title = "Contact ReputeDefend | General Enquiries"
const description =
  "Contact ReputeDefend with a general question about our services or approach. For an active Google Business Profile or review issue, use the dedicated Get Help process so the relevant case information can be collected."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/contact" },
  openGraph: socialOpenGraph({ title, description, path: "/contact" }),
  twitter: socialTwitter({ title, description }),
}

const nextSteps = [
  "We review your message",
  "We identify the right route",
  "We reply or point you to the right place",
] as const

export default function ContactPage() {
  const contactEmail = hasLegalValue(legalIdentity.contactEmail) ? legalIdentity.contactEmail : undefined

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <section className={styles.hero} aria-labelledby="contact-title">
          <p className={styles.eyebrow}>Contact ReputeDefend</p>
          <h1 id="contact-title">Have a question before you start?</h1>
          <p className={styles.lead}>
            Use this page for general questions about ReputeDefend, our services or how we work. If you&apos;re already dealing with a Business Profile suspension, access or verification problem, or a difficult review issue, use Get Help so we can collect the information needed to understand the case properly.
          </p>
          <p className={styles.trustLine}>Human-reviewed messages • Clear routing • Clear communication</p>
        </section>

        <aside className={styles.banner} aria-labelledby="case-banner-title">
          <div>
            <h2 id="case-banner-title">Already dealing with an active Google issue?</h2>
            <p>If your Business Profile is suspended, inaccessible or stuck in verification — or you need help with a suspicious or damaging review — use Get Help so we can collect the relevant case information from the start.</p>
          </div>
          <Link className={styles.bannerCta} href="/get-help">
            Get help with my case
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </aside>

        <div className={styles.main}>
          <div className={styles.formColumn}>
            <ContactForm />
          </div>
          <aside className={styles.aside} aria-labelledby="next-title">
            <h2 id="next-title">What happens after you write?</h2>
            <ol>
              {nextSteps.map((step, index) => (
                <li key={step}>
                  <span className={styles.step} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
            <p className={styles.nextNote}>If your question turns out to involve an active Business Profile or review case, we may direct you to Get Help so the relevant details can be collected properly.</p>
            {contactEmail ? (
              <div className={styles.emailBlock}>
                <p className={styles.emailLabel}>Prefer email?</p>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </div>
            ) : null}
            <p className={styles.identityNote}>ReputeDefend is an independent UK business.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}
