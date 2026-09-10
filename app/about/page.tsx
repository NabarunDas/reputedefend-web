import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import styles from "./about.module.css"

const title = "About ReputeDefend | Independent Reputation Support"
const description = "ReputeDefend is an independent support service for Google Business Profile recovery and review issues. We focus on the facts, explain the options and avoid promises no independent service can honestly make."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title,
    description,
    url: "/about",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }],
  },
}

const principles = [
  {
    title: "Facts before action",
    body: "We start with what happened, what changed and what can actually be demonstrated. Assumptions are separated from evidence before a next step is recommended.",
  },
  {
    title: "Clear options",
    body: "The useful route depends on the situation. We explain what may be appropriate, what remains uncertain and what still belongs with Google.",
  },
  {
    title: "No inflated promises",
    body: "We cannot guarantee profile reinstatement, review removal or a platform timeframe. Responsible support makes those limits visible, not hidden in the small print.",
  },
]

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <p className={styles.eyebrow}>About ReputeDefend</p>
        <h1 id="about-title">Clear thinking for messy reputation moments.</h1>
        <p className={styles.lead}>ReputeDefend exists to make reputation support feel more understandable. We focus on the facts, explain the options and avoid promises no independent service can honestly make.</p>
        <p className={styles.trustLine}>Independent • Evidence-led • No guaranteed outcomes</p>
        <div className={styles.actions}>
          <Link className={styles.button} href="/get-help">
            Get help with a case <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link className={styles.textLink} href="/contact">
            Ask a question <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className={styles.split} aria-labelledby="independent-title">
        <h2 id="independent-title">Independent by design.</h2>
        <div className={styles.copy}>
          <p>We are not Google, and we do not speak for Google. Our role is to help businesses prepare better information and make more considered decisions.</p>
          <p>Our service is deliberately personal: a clear enquiry, a human review and a practical next step.</p>
        </div>
      </section>

      <section className={styles.principles} aria-labelledby="focus-title">
        <div>
          <p className={styles.eyebrow}>How we work</p>
          <h2 id="focus-title">Support that stays proportionate to the facts.</h2>
        </div>
        <ul>
          {principles.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.closing} aria-labelledby="about-closing-title">
        <div>
          <p className={styles.eyebrow}>A clear place to start</p>
          <h2 id="about-closing-title">If you already have an issue, start with the facts.</h2>
          <p>Share what happened, the relevant links or messages, and what you have already tried. For a general question about ReputeDefend, use Contact instead.</p>
        </div>
        <div className={styles.closingActions}>
          <Link className={styles.limeButton} href="/get-help">
            Get help with a case <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link className={styles.ghostLink} href="/contact">
            Contact us <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
