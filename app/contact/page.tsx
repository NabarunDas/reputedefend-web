import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react"
import { ContactForm } from "@/components/contact-form"
import styles from "./contact.module.css"

const title = "Contact ReputeDefend | General Enquiries"
const description = "Contact ReputeDefend with a general question about our Google Business Profile recovery, review protection services or independent approach."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title,
    description,
    url: "/contact",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }],
  },
}

const faqs = [
  {
    q: "Should I use Contact or Get Help?",
    a: "Use Contact for general questions about ReputeDefend, our services, partnerships or whether our approach may be suitable. Use Get Help if you already have an active Business Profile, verification, access or review issue and want that situation assessed.",
  },
  {
    q: "Can I ask about fees before submitting a case?",
    a: "Yes. The level of support depends on the situation. Any proposed support and associated fees will be explained clearly before you decide how to proceed.",
  },
  {
    q: "Do you provide guaranteed outcomes?",
    a: "No. ReputeDefend cannot guarantee profile reinstatement, verification or review removal. Google makes those decisions. We help you understand the facts and the next appropriate step.",
  },
  {
    q: "Is ReputeDefend affiliated with Google?",
    a: "No. ReputeDefend is an independent support service. We do not represent Google and do not have special access to platform decisions.",
  },
]

const nextSteps = [
  "We review your message.",
  "We determine the appropriate response or route.",
  "If your question is really a case enquiry, we may direct you to the Get Help process so the relevant information can be collected properly.",
]

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="contact-title">
        <p className={styles.eyebrow}>Contact ReputeDefend</p>
        <h1 id="contact-title">Have a question before you start?</h1>
        <p className={styles.lead}>For general questions about ReputeDefend, our services or our approach, send us a message here. If you already have an active Business Profile or review issue, use our dedicated case-intake route instead.</p>
        <p className={styles.trustLine}>Independent • Clear communication • No unrealistic promises</p>
        <Link className={styles.caseLink} href="/get-help">
          Get help with a case <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className={`${styles.wrap} ${styles.routesBlock}`} aria-labelledby="routes-title">
        <p className={styles.eyebrow} id="routes-title">Choose the right route</p>
        <div className={styles.routes}>
          <article className={styles.route}>
            <p className={styles.routeIndex}>01</p>
            <h2>I have an active reputation issue</h2>
            <p>Use Get Help if you are dealing with a suspended or inaccessible Business Profile, verification problem, suspicious review or another active case.</p>
            <Link className={styles.routeLink} href="/get-help">
              Start a case <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
          <article className={styles.route}>
            <p className={styles.routeIndex}>02</p>
            <h2>I have a general question</h2>
            <p>Use the contact form for general questions about ReputeDefend, our services, partnerships or whether our approach may be suitable for your situation.</p>
            <a className={styles.routeLink} href="#contact-form">
              Write a message <ArrowRight size={16} aria-hidden="true" />
            </a>
          </article>
        </div>
      </section>

      <div className={`${styles.wrap} ${styles.intake}`}>
        <div className={styles.formColumn} id="contact-form">
          <ContactForm />
        </div>
        <aside className={styles.aside} aria-labelledby="next-title">
          <h2 id="next-title">What happens after you contact us?</h2>
          <ol>
            {nextSteps.map((step, index) => (
              <li key={step}>
                <span className={styles.step}>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className={`${styles.wrap} ${styles.faq}`} aria-labelledby="contact-faq-title">
        <div className={styles.faqIntro}>
          <p className={styles.eyebrow}>Before you write</p>
          <h2 id="contact-faq-title">A few useful distinctions.</h2>
          <p>These answers are for general contact. Detailed case questions belong on Get Help.</p>
        </div>
        <div className={styles.faqList}>
          {faqs.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<Plus size={20} aria-hidden="true" /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
