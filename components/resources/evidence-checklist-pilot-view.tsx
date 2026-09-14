import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import type { ResourceRecord } from "@/lib/resources"
import { appealEvidenceChecklistSources } from "@/lib/resource-articles/google-business-profile-appeal-evidence-checklist"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const packSteps = [
  ["Confirm the right profile and account", "Make sure you're working with the Business Profile and Google Account connected to the appeal."],
  ["Save Google's restriction details", "Keep the moderation reason and policy link shown in the appeals tool."],
  ["Check the profile itself", "Don't build evidence around information you already know is inaccurate."],
  ["Match evidence to facts", "Know what each document supports and why it belongs in the appeal."],
  ["Open the evidence form when ready", "Have the files prepared before the 60-minute window begins."],
]

const googleEvidenceExamples = [
  ["Official business registration", "Can help establish the business and the details recorded by the relevant authority."],
  ["Business licence", "Can support the business or activity where a genuine licence applies."],
  ["Tax certificates", "Can help support business identity or other recorded business details."],
  ["Business utility bills", "Can help connect the business with a relevant location or service. Google gives examples such as electricity, phone and internet bills."],
]

const documentQuestions = [
  "What fact does this prove?",
  "Which business does it belong to?",
  "Which name and address does it show?",
  "Which location or entity does it relate to?",
  "Why is it relevant to this appeal?",
]

const evidenceMap = [
  ["Official business registration", "Business identity and recorded details"],
  ["Business licence", "Licensed activity or business details where applicable"],
  ["Tax certificate", "Business identity or recorded information"],
  ["Business utility bill", "Connection between the business and a relevant location or service"],
]

const profileChecks = [
  "Business name",
  "Address or service-area setup",
  "Primary category",
  "Website",
  "Phone number",
  "Opening hours",
  "Owners and managers where relevant",
]

const addressTypes = [
  [
    "Customers visit the location",
    "Storefront",
    "A genuine customer-facing location may display its address when it meets Google's requirements.",
  ],
  [
    "You travel or deliver to customers",
    "Service-area business",
    "If customers do not receive the service at the business address, Google says the address should not be shown publicly.",
  ],
  [
    "Customers visit and you also travel to them",
    "Hybrid business",
    "A hybrid business can serve customers at its location and also visit or deliver to customers.",
  ],
]

const filePrepChecks = [
  "Make sure each file belongs to the correct business or location.",
  "Check that the relevant information is readable.",
  "Remove unnecessary duplicate copies.",
  "Give files clear, neutral names so you can identify them quickly.",
  "Keep the original records available.",
  "Note any genuine name or address mismatch you need to understand.",
  "Decide what fact each document is there to support.",
]

const quantityQuestions = [
  "Does it prove something useful?",
  "Is that fact relevant to this appeal?",
  "Is the document connected to this business or location?",
  "Have I already provided another document that proves the same thing?",
]

const mistakes = [
  [
    "Treating Google's examples as four mandatory documents",
    "Registration, licences, tax certificates and utility bills are examples of evidence that can strengthen an appeal. Not every legitimate business will have every one.",
  ],
  [
    "Opening the evidence form before the files are ready",
    "The 60-minute window is the wrong time to start searching for records or working out why information does not match.",
  ],
  [
    "Uploading documents just because they look official",
    "A document should support a fact that matters to this business and this appeal.",
  ],
  [
    "Trying to manufacture a name or address match",
    "Do not alter genuine records or distort an otherwise accurate profile simply to make them look identical.",
  ],
  [
    "Using evidence to defend information you know is wrong",
    "Fix genuine profile inaccuracies where appropriate rather than trying to prove inaccurate information.",
  ],
  [
    "Submitting another appeal because evidence was missed",
    "Google says not to submit multiple appeals for the same issue while a decision is pending. Missing a document is not a reason to create an overlapping appeal.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "My legal company name is different from the name on my Business Profile",
    [
      "Do not edit either the document or the profile simply to force an artificial match.",
      "First check whether the Business Profile uses the business's genuine real-world name. Then understand why the official record uses a different name. For example, a legal entity and a trading name may legitimately differ.",
      "Use genuine records and accurate information. If the difference is relevant to the appeal, treat it as something that needs to be understood rather than hidden.",
    ],
  ],
  [
    "I'm a service-area business and my utility bill shows my address",
    [
      "A utility bill can still be connected with the real business even when the Business Profile correctly hides the address from customers.",
      "Google says service-area businesses that do not serve customers at their business address should not display that address publicly.",
      "Do not make a private service-area address public simply because it appears on supporting evidence. Check that the underlying location is genuine and that the profile uses the correct service-area setup.",
    ],
  ],
  [
    "I don't have all four types of evidence Google lists",
    [
      "Google presents registration, licences, tax certificates and utility bills as examples of evidence that can strengthen an appeal. It does not say every business must submit all four.",
      "Use the genuine records that actually exist for your business and support facts relevant to the appeal.",
      "Do not create a licence, registration or other record simply because it appears in Google's examples.",
    ],
  ],
  [
    "I've already submitted the appeal without evidence",
    [
      "Do not immediately submit another appeal for the same issue simply because evidence was missed.",
      "Google says not to submit multiple appeals for the same issue before receiving a decision.",
      "Keep the evidence you have prepared and monitor the existing appeal. If the appeal is later not approved and Google offers an additional review, assess what genuinely new information or evidence could help before submitting anything further.",
    ],
  ],
]

const readinessChecks = [
  "I am using the correct Business Profile and Google Account.",
  "I have saved Google's moderation reason and policy information.",
  "I have checked the profile against the real business.",
  "Every document is genuine and belongs to the correct business or location.",
  "I understand any name or address differences.",
  "The relevant information in each file is readable.",
  "I know what fact each document is there to support.",
  "My files are ready before I open the evidence form.",
]

const googlePoints = [
  "Supporting evidence may be offered as an optional part of a Business Profile appeal.",
  "Google recommends preparing evidence before submitting the appeal.",
  "Google names official business registration, business licences, tax certificates and business utility bills as examples of evidence that can strengthen an appeal.",
  "Google advises checking that the business name and address on supporting documents match the profile being appealed.",
  "Once the evidence form is opened, the evidence must be submitted within 60 minutes or it will not be attached to the appeal.",
  "Google advises checking the Business Profile itself before appealing.",
  "Google's broader appeals guidance tells businesses to check their verification status before submitting an appeal.",
  "Google says not to submit multiple appeals for the same issue while waiting for a decision.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-suspended-before-appeal":
    "What to check before appealing, including eligibility, profile accuracy, address setup and Google's appeal process.",
  "google-business-profile-appeal-rejected-what-next":
    "What to check if the first appeal is not approved and when additional review may be available.",
}

function ContextualCta({
  heading,
  body,
  ctaLabel = "Start your Profile Recovery assessment",
}: {
  heading: string
  body: string
  ctaLabel?: string
}) {
  return (
    <aside className={styles.pilotCta}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Link className={styles.primaryAction} href="/get-help?service=profile-recovery">
        {ctaLabel}
      </Link>
      <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
    </aside>
  )
}

export function EvidenceChecklistPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.evidencePage}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resourceArticleJsonLd(resource)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(resourceBreadcrumbJsonLd(resource, category.title)),
        }}
      />
      <ResourceBreadcrumbs resource={resource} />
      <header className={`${styles.hero} ${styles.wide}`}>
        <p className={styles.eyebrow}>Profile Recovery</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            If Google gives you the option to add evidence to a Business Profile appeal, don&apos;t
            treat it as a request for every document you can find. Google&apos;s examples include
            business registration, licences, tax certificates and business utility bills. The useful
            question is what each document actually proves.
          </p>
          <p>
            Prepare the evidence before you begin the time-limited step. Once you open Google&apos;s
            evidence form, you have 60 minutes to submit it or it won&apos;t be attached to the
            appeal.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Build the pack before the clock starts</h2>
        <p>Use these five checks before you open Google&apos;s evidence form.</p>
        <div className={styles.process}>
          {packSteps.map(([title, body], index) => (
            <div className={styles.processStep} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <ContextualCta
        heading="Not sure which documents actually support your appeal?"
        body="Tell us what Google has shown you and what records you already have. We can help you work out what is relevant before you open the evidence form."
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What evidence does Google actually name?</h2>
        <p>
          Google describes supporting evidence as optional, but says relevant evidence can
          strengthen an appeal. Its current Business Profile Help pages give four broad examples.
        </p>
        <div className={styles.evidenceGrid}>
          {googleEvidenceExamples.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>
          These are examples, not a compulsory four-document pack. A legitimate business may not
          possess every document on Google&apos;s list. Use genuine records that actually exist for
          the business.
        </p>
        <p>Do not create or obtain a document purely because it appears in Google&apos;s examples.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Give every document a job</h2>
        <p>
          Before uploading a file, decide what you expect it to prove. A document is useful because
          of the fact it supports, not because it looks official.
        </p>
        <h3>For every document, ask:</h3>
        <div className={styles.jobQuestions}>
          {documentQuestions.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
        <p>
          If you cannot answer the last question clearly, reconsider whether the document belongs in
          the evidence pack.
        </p>
        <h3>Examples</h3>
        <div className={styles.evidenceMap}>
          {evidenceMap.map(([doc, fact]) => (
            <div className={styles.evidenceMapRow} key={doc}>
              <span className={styles.evidenceMapDoc}>{doc}</span>
              <span className={styles.evidenceMapArrow} aria-hidden="true">
                →
              </span>
              <span className={styles.evidenceMapFact}>{fact}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check the profile before trying to prove it</h2>
        <p>
          Evidence cannot turn inaccurate Business Profile information into accurate information.
          Before you build the final evidence pack, compare the profile with the business as it
          actually operates.
        </p>
        <div className={styles.checkGrid}>
          {profileChecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          If something is genuinely wrong, deal with the underlying accuracy issue rather than
          building an evidence pack whose only purpose is to defend information you already know is
          incorrect.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if the name on a document is different?</h2>
        <p>
          Google advises businesses to check that the business name on submitted evidence matches
          the profile being appealed. That does not mean you should alter a genuine document or
          force the Business Profile to resemble one piece of paperwork.
        </p>
        <h3>Check the real-world business name</h3>
        <p>
          Google&apos;s Business Profile guidance says the profile name should reflect the
          business&apos;s real-world name. Compare the profile with the name customers actually see
          on the business&apos;s signage, stationery and branding.
        </p>
        <h3>Legal name and trading name are different</h3>
        <p>
          A legal entity name and a public-facing trading name can be different. Treat the
          difference as something to understand and explain accurately, not something to hide.
        </p>
        <p>Do not edit genuine records to manufacture a match.</p>
        <p>
          Do not change an otherwise accurate Business Profile solely to make it look identical to
          one document.
        </p>
        <Link className={styles.inlineLink} href="/resources/google-business-profile-name-rules">
          Read our Google Business Profile name rules guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if the address on the evidence is different?</h2>
        <p>
          Google also tells businesses to check that the address on supporting evidence matches the
          profile being appealed. But address setup depends on how the business serves customers.
        </p>
        <div className={styles.decisionGrid}>
          {addressTypes.map(([lead, title, body]) => (
            <div key={title}>
              <p>{lead}</p>
              <h3>{title}</h3>
              <span>{body}</span>
            </div>
          ))}
        </div>
        <p>
          A utility bill showing an operating or home address does not by itself mean that address
          should be displayed publicly on the Business Profile.
        </p>
        <p>
          The goal is truthful consistency between the real business, the profile setup and the
          evidence — not making every screen and document look visually identical.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-address-and-service-area-rules"
        >
          Read our full guide to Google Business Profile address and service-area rules →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Verification and appeal evidence are not the same process</h2>
        <p>
          Google&apos;s broader appeal guidance tells businesses to check their verification status
          before appealing. Verification and appeal evidence can both involve proving facts about a
          business, but they are separate processes.
        </p>
        <p>
          If Google asks you to verify or re-verify the profile, follow the verification method
          Google provides. Do not assume that something requested during verification is
          automatically required as appeal evidence.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Having a verification problem? Read the verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Prepare the files before you start</h2>
        <p>The evidence step is much easier if the administrative work is already finished.</p>
        <h3>Before opening the evidence form</h3>
        <ul className={styles.tickList}>
          {filePrepChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className={styles.timeWarning}>
          <strong>60-minute evidence window</strong>
          <p>
            Google says that once you open the linked evidence form, you must submit the evidence
            within 60 minutes or it won&apos;t be attached to the appeal.
          </p>
          <b>Have the files ready first.</b>
        </div>
      </section>

      <ContextualCta
        heading="Have the documents but aren't sure what they prove?"
        body="We can review the profile, Google's restriction information and the evidence you already have before you decide what to submit."
        ctaLabel="Get your case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>More files do not automatically mean stronger evidence</h2>
        <p>
          Google says relevant evidence can strengthen an appeal. It does not say that a larger
          evidence pack is automatically better.
        </p>
        <p>
          A focused set of genuine documents is easier to understand than a random archive of
          business paperwork. Include a file because it supports an important fact, not because you
          want the submission to look substantial.
        </p>
        <h3>Before adding another file, ask:</h3>
        <div className={styles.questionGrid}>
          {quantityQuestions.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
        <p>
          Use the smallest useful set of genuine records that clearly supports the important facts.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Where businesses commonly go wrong</h2>
        <div className={styles.mistakeGrid}>
          {mistakes.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if my evidence situation is different?</h2>
        <div className={styles.accordion}>
          {scenarios.map(([title, paragraphs]) => (
            <details key={title}>
              <summary>
                {title}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Ready to open the evidence form?</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If you cannot confidently tick one of these items, deal with that point before starting
          the timed evidence step.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile rules with
          ProfileRelaunch&apos;s practical evidence-preparation advice. These are the main points
          that come directly from Google&apos;s current Help pages:
        </p>
        <ul className={styles.tickList}>
          {googlePoints.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className={styles.practical}>
          <strong>Our practical view</strong>
          <p>
            A useful evidence pack should make the important facts easier to verify. Give every
            document a reason for being there, understand genuine differences before you submit, and
            prepare everything before the timed evidence step begins.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want a second pair of eyes on your evidence before you appeal?</h2>
        <p>You don&apos;t need to guess whether a document helps your case.</p>
        <p>
          Tell us what Google has shown you, how the Business Profile is set up and what evidence
          you already have. We&apos;ll review the situation and help you understand the appropriate
          next step.
        </p>
        <div className={styles.pilotConversionActions}>
          <Link className={styles.primaryAction} href="/get-help?service=profile-recovery">
            Start your Profile Recovery assessment
          </Link>
          <Link className={styles.secondaryAction} href="/business-profile-recovery">
            See how Profile Recovery works
          </Link>
        </div>
        <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
      </section>

      <section className={`${styles.related} ${styles.wide}`}>
        <h2>Useful next guides</h2>
        <div>
          {related.map((item) => (
            <Link className={styles.relatedPilotCard} key={item.slug} href={`/resources/${item.slug}`}>
              <strong>{item.title}</strong>
              <span>{relatedCopy[item.slug] ?? item.excerpt}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${styles.sourcesPilot} ${styles.wide}`}>
        <h2>Official Google sources</h2>
        <p>Google Business Profile Help</p>
        <ul>
          {appealEvidenceChecklistSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.aboutPilot} ${styles.wide}`}>
        <h2>About this guide</h2>
        <p>
          This guide is based on Google&apos;s publicly available Business Profile guidance and was
          last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}

export const evidenceChecklistPilotSlug = "google-business-profile-appeal-evidence-checklist"
