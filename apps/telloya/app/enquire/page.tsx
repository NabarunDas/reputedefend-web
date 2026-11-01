import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { TelloyaEnquiryForm } from "@/components/telloya-enquiry-form"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import styles from "./enquire.module.css"

const seo = {
  title: "Enquire About Telloya – AI Receptionist for Tradespeople",
  description: "Get in touch to learn more about Telloya AI receptionist service. Fill out our enquiry form and we'll contact you to discuss your requirements.",
}

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/enquire" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/enquire",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function EnquirePage() {
  const capabilities = getEnquiryCapabilities()
  
  return (
    <div className={styles.page}>
      <section className={styles.heroBand} aria-labelledby="enquire-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Get started</p>
          <h1 id="enquire-title">
            <span className={styles.titleMain}>Enquire about Telloya</span>
            <span>for your business</span>
          </h1>
          <p className={styles.lead}>
            Tell us a bit about your business and requirements. We&apos;ll review your enquiry and get in touch to discuss how Telloya can help.
          </p>
          <p className={styles.heroNote}>No payment is taken at this stage. This is a no-obligation enquiry.</p>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="How the enquiry process works">
        <ul>
          <li>Quick enquiry form</li>
          <li>Personal consultation</li>
          <li>No payment required</li>
          <li>No obligation to proceed</li>
        </ul>
      </section>

      <div className={styles.main}>
        <div className={styles.formColumn}>
          <TelloyaEnquiryForm capabilities={capabilities} />
        </div>
        <aside className={styles.aside}>
          <section className={styles.process} aria-labelledby="next-title">
            <h2 id="next-title">What happens next</h2>
            <ol>
              <li>
                <span className={styles.step} aria-hidden="true">1</span>
                <p>We review your enquiry</p>
              </li>
              <li>
                <span className={styles.step} aria-hidden="true">2</span>
                <p>We contact you to discuss your requirements</p>
              </li>
              <li>
                <span className={styles.step} aria-hidden="true">3</span>
                <p>We explain pricing and help you decide if Telloya is right for you</p>
              </li>
              <li>
                <span className={styles.step} aria-hidden="true">4</span>
                <p>If you proceed, we help you set up call forwarding and test the service</p>
              </li>
            </ol>
          </section>
          <section className={styles.info} aria-labelledby="info-title">
            <h2 id="info-title">Important to know</h2>
            <p>Telloya is not currently available for self-service purchase. We&apos;re finalising pricing and packaging before public launch.</p>
            <p>This enquiry helps us understand your requirements and determine if Telloya is a good fit for your business setup.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
