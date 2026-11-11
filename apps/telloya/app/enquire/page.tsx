import type { Metadata } from "next"
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { TelloyaEnquiryForm } from "@/components/telloya-enquiry-form"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import styles from "./enquire.module.css"

const seo = {
  title: "Enquire About Telloya – AI Receptionist for Tradespeople",
  description: "Enquire about Telloya for missed-call enquiries. Tell us about your business, the questions you'd like asked and the details you want collected.",
}

export const metadata: Metadata = {
  title: absolutePageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/enquire" },
  ...pageSocialMetadata({ title: seo.title, description: seo.description, path: "/enquire" }),
}

export default async function EnquirePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[]; product?: string | string[]; intent?: string | string[] }>
}) {
  const capabilities = getEnquiryCapabilities()
  const params = await searchParams
  const intentParam = Array.isArray(params.intent) ? params.intent[0] : params.intent
  const initialRequestIntent = intentParam === "personalised-demo" ? "personalised-demo" : ""
  const demoRequest = initialRequestIntent === "personalised-demo"
  
  // Parse plan preselection from URL
  // NEW: ?plan=basic|growth|pro|custom (Phase 05A-02)
  // LEGACY: ?product=telloya|complete (preserved for historical links)
  const planParam = Array.isArray(params.plan) ? params.plan[0] : params.plan
  const productParam = Array.isArray(params.product) ? params.product[0] : params.product
  
  let initialPlanTier: "" | "basic" | "growth" | "pro" | "custom" = ""
  let initialGuardInterested = false
  
  // New plan parameter takes precedence
  if (planParam === "basic" || planParam === "growth" || planParam === "pro" || planParam === "custom") {
    initialPlanTier = planParam
  } 
  // Legacy product parameter support
  else if (productParam === "telloya") {
    // Historical 'telloya' link: no plan preselection, user must choose
    initialPlanTier = ""
  } else if (productParam === "complete") {
    // Historical 'complete' link: preselect Guard interest but require tier selection
    initialGuardInterested = true
  }
  
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="enquire-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Get started</p>
          <h1 id="enquire-title" className={styles.heroTitle}>
            <span className={styles.titleMain}>{demoRequest ? "Request a personalised demonstration" : "Enquire about Telloya"}</span>
            <span>for your business</span>
          </h1>
          <p className={styles.heroLead}>
            {demoRequest
              ? "Tell us about your business and what you would like your AI receptionist to say. We'll prepare a demonstration and arrange a time for you to call."
              : "Tell us about your business. We'll discuss your calls, the questions you'd like asked, and which Telloya plan fits."}
          </p>
          <p className={styles.heroNote}>
            {demoRequest
              ? "A short form about your business and the calls you want handled."
              : "Tell us how you work. We'll talk through the advertised plans with you."}
          </p>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="How the enquiry process works">
        <ul>
          {demoRequest ? (
            <>
              <li>Your business details</li>
              <li>A demonstration we prepare</li>
              <li>A time we arrange with you</li>
              <li>A real AI conversation</li>
            </>
          ) : (
            <>
              <li>Your business details</li>
              <li>A conversation about your calls</li>
              <li>Advertised prices</li>
              <li>You decide whether to proceed</li>
            </>
          )}
        </ul>
      </section>

      <div className={styles.main}>
        <div className={styles.formColumn}>
          <TelloyaEnquiryForm capabilities={capabilities} initialPlanTier={initialPlanTier} initialGuardInterested={initialGuardInterested} initialRequestIntent={initialRequestIntent} />
          <aside className={styles.aside}>
            <section className={styles.process} aria-labelledby="next-title">
              <h2 id="next-title">What happens next</h2>
              <ol>
                {demoRequest ? (
                  <>
                    <li>
                      <span className={styles.step} aria-hidden="true">1</span>
                      <p>Tell us about your business — Share what you would like your AI receptionist to say and ask.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">2</span>
                      <p>We prepare your personalised demo — We&apos;ll configure an example around your requirements.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">3</span>
                      <p>We arrange your demo call — We&apos;ll contact you with a suitable time and our demonstration telephone number.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">4</span>
                      <p>Experience Telloya yourself — Call the number, have a real AI conversation and decide whether you&apos;d like to proceed.</p>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <span className={styles.step} aria-hidden="true">1</span>
                      <p>Tell us about your business — Share how you work and what you need from an AI receptionist.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">2</span>
                      <p>We talk it through — We&apos;ll contact you to understand your calls and your telephone setup.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">3</span>
                      <p>You decide — We&apos;ll explain the advertised plans and whether Telloya fits.</p>
                    </li>
                    <li>
                      <span className={styles.step} aria-hidden="true">4</span>
                      <p>If you go ahead — We agree your greeting and questions, then help you test call forwarding.</p>
                    </li>
                  </>
                )}
              </ol>
            </section>
            <section className={styles.info} aria-labelledby="info-title">
              <h2 id="info-title">{demoRequest ? "Your demonstration" : "Before you enquire"}</h2>
              <p>
                {demoRequest
                  ? "We'll contact you to arrange a suitable time and give you our demonstration telephone number."
                  : "No payment is needed to enquire. We'll confirm the advertised price and your telephone setup before you decide."}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
