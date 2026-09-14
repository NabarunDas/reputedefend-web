import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { customerThreateningReviewSources } from "@/lib/resource-articles/customer-threatening-bad-google-review"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const customerDisputeChecks = [
  "What was bought or agreed?",
  "What happened?",
  "Is there a genuine service or product problem?",
  "What records exist?",
  "What normal complaint, refund or warranty process applies?",
]

const reviewConditionChecks = [
  "Are they threatening to post a review?",
  "Has a review already been posted?",
  "Are they offering to remove or change it?",
  "Are they making review removal conditional on receiving something of value?",
  "What exact words did they use?",
]

const prohibitedIncentives = [
  "Money",
  "Discounts",
  "Vouchers",
  "Free products",
  "Free services",
  "Credits",
  "Upgrades",
  "Another benefit",
]

const refundExamples = [
  "The customer did not receive what was agreed",
  "A product or service failed",
  "The business wants to resolve a legitimate complaint",
  "A contractual obligation applies",
  "Another genuine commercial reason exists",
]

const reviewConditions = [
  "delete it",
  "increase the star rating",
  "change the wording",
  "promise not to review the business",
]

const contactChannels = [
  "Email",
  "SMS",
  "WhatsApp messages",
  "Platform messages",
  "Written complaint correspondence",
  "Voicemail details",
  "Call notes made at the time",
]

const messageRecord = [
  "Sender identity",
  "Date",
  "Time",
  "Complete relevant conversation",
  "Exact demand",
  "Exact wording about the review",
]

const timelinePoints = [
  ["Purchase or service", "When did the customer buy or use the service?"],
  ["Complaint", "When did the problem or dispute begin?"],
  ["Refund or compensation request", "What did the customer ask for?"],
  ["Business response", "How did the business respond?"],
  ["Review statement", "When did the customer first mention posting, changing or removing a review?"],
  ["Review posted", "If applicable, when did the review appear?"],
  ["Removal or change condition", "Did the customer say they would alter the review if they received something?"],
  ["Further activity", "Did additional demands, reviews or communications follow?"],
] as const

const postedReviewChecks = [
  "Does it describe a genuine experience?",
  "Is there fake engagement?",
  "Does the content raise a misleading-content issue covered by Google's policies?",
  "Does it contain prohibited harassment?",
  "Does it expose protected personal information?",
  "Is it off-topic?",
  "Is there another identifiable Google policy issue?",
]

const baitDonts = [
  "bait them",
  "pretend to agree to payment to create screenshots",
  "create a fake negotiation",
  "deliberately escalate the conversation",
  "pressure them to repeat the demand",
]

const threatExamples = [
  "Delete the review or we'll sue you.",
  "Remove it or we'll publish your details.",
  "We'll report you everywhere unless you take it down.",
]

const publicDonts = [
  "Private email addresses",
  "Phone numbers",
  "Home addresses",
  "Payment details",
  "Order information that unnecessarily identifies the customer",
  "Private messages",
  "Screenshots of the conversation",
  "Confidential complaint records",
]

const ordinaryReportExamples = [
  "Fake engagement",
  "Prohibited personal information",
  "Harassment or other prohibited offensive content",
  "Off-topic material",
  "Another identifiable review-policy violation",
]

const directDemandCase = [
  "Affected Business Profile",
  "Relevant review links",
  "Review screenshots",
  "Customer or contact identifiers you genuinely have",
  "Exact communication containing the demand",
  "What the customer requested",
  "What they said would happen to the review",
  "Dates and times",
  "The transaction or dispute context",
]

const removalPromises = [
  "removal because a refund was provided",
  "removal because the customer behaved badly in private",
  "removal because the dispute has now ended",
  "a particular Google outcome",
]

const mistakes: [string, string][] = [
  [
    "Calling every refund demand extortion",
    "A genuine customer may legitimately dispute a charge or ask for a refund. The review condition and the underlying commercial dispute need to be assessed separately.",
  ],
  [
    "Paying because the rating feels more urgent than the dispute",
    "Pressure from a threatened review should not replace a proper assessment of whether any refund or compensation is genuinely due.",
  ],
  [
    "Offering a refund only if the review is deleted",
    "Google prohibits merchants from offering payment, discounts, free goods or services in exchange for revision or removal of a negative review.",
  ],
  [
    "Refusing a justified remedy because the customer mentioned Google",
    "If a refund or other resolution is genuinely appropriate, make that decision on the underlying customer issue rather than using the review as leverage in the opposite direction.",
  ],
  [
    "Assuming a real customer review must be fake because the dispute is aggressive",
    "A real customer can behave unreasonably and still have had a genuine experience. Assess the review against the actual Google policies.",
  ],
  [
    "Rewriting the customer's words",
    "Preserve what they actually said. Do not make the message sound stronger than it was.",
  ],
  [
    "Baiting the customer to collect more screenshots",
    "Do not manufacture or provoke evidence.",
  ],
  [
    "Threatening the customer in return",
    "Do not turn review management into a cycle of threats.",
  ],
  [
    "Publishing private messages in the public reply",
    "Private dispute material should remain private.",
  ],
  [
    "Assuming a refund means the customer now owes you a positive review",
    "A legitimate commercial resolution should not purchase a star rating, revised wording or removal of a negative review.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    'The customer says "Refund me or I will leave one star"',
    [
      "Preserve the exact message.",
      "Then assess the underlying refund dispute independently.",
      "Do not provide or refuse a remedy solely because of the review threat.",
      "If a review later appears, assess that contribution against Google's policies.",
      "Keep the review-pressure evidence separate from the customer-service decision.",
    ],
  ],
  [
    "The customer has already posted a review and says they'll delete it if we refund them",
    [
      "Preserve the review and the exact communication linking removal to the refund.",
      "Assess whether a refund is genuinely appropriate without making it payment for review deletion.",
      "The direct removal condition may also be relevant to Google's dedicated negative-review extortion process.",
      "Do not tell the customer:",
      "\"We will refund you only after the review is deleted.\"",
    ],
  ],
  [
    "The customer deserves a refund but has also threatened a review",
    [
      "Handle the legitimate customer issue because it needs to be handled.",
      "Do not withhold an otherwise appropriate resolution simply because the customer mentioned Google.",
      "At the same time, do not negotiate the star rating, wording or deletion of the review as part of the refund.",
      "Keep the two decisions separate.",
    ],
  ],
  [
    "The customer posted an unfair review after we refused the refund",
    [
      "A rejected refund request does not automatically make the review removable.",
      "Read the review itself.",
      "If the customer is describing a genuine experience and the content remains within Google's policies, it may remain live even if the business considers it unfair.",
      "If a separate Google policy issue exists, report that actual issue.",
    ],
  ],
  [
    "The customer is threatening reviews, legal action and social-media posts",
    [
      "Preserve the communications without escalating them.",
      "Separate the Google review issue from any wider legal, safety or commercial dispute.",
      "Do not make criminal accusations or threaten the customer publicly.",
      "Use appropriate independent advice for matters outside Google's review policies where necessary.",
    ],
  ],
]

const readinessChecks = [
  "I have saved the exact review-related message.",
  "I have preserved the surrounding conversation.",
  "I understand the underlying customer dispute separately.",
  "I have not made the refund decision solely because of the review threat.",
  "I have not offered money, discounts, goods or services in exchange for review removal.",
  "I have built a factual timeline.",
  "If a review is live, I have assessed the actual review separately.",
  "I know whether a normal review-policy issue exists.",
  "I know whether there is a direct demand tied to review removal.",
  "I have not rewritten or manipulated the evidence.",
  "I am not baiting or threatening the customer.",
  "I am keeping private correspondence out of the public response.",
  "I understand that a genuine refund does not purchase control over the review.",
  "I am using the Google route that matches the actual issue.",
  "I understand Google makes the final policy decision.",
]

const googlePoints = [
  "Google says businesses should not report reviews merely because they disagree with them or dislike them.",
  "Google says it does not get involved in ordinary conflicts between businesses and customers.",
  "Genuine customers can leave negative feedback about genuine experiences.",
  "Google's review policies prohibit forms of incentivised review manipulation.",
  "Merchants must not offer incentives such as payment, discounts or free goods or services in exchange for posting, revising or removing reviews.",
  "Businesses can report reviews that violate Google's policies.",
  "Google provides a dedicated merchant reporting route for negative-review extortion.",
  "Google's dedicated extortion guidance concerns direct demands for money or favours in exchange for review removal.",
  "Google provides scam guidance relating to suspicious review and rating activity.",
  "Google makes the final decision on reported review content.",
]

const relatedCopy: Record<string, string> = {
  "google-review-extortion":
    "What to preserve and how Google's dedicated merchant process works when there is a direct demand tied to negative-review removal.",
  "fake-google-review-or-genuine-negative-feedback":
    "How to assess a suspicious review without assuming that a difficult or aggressive customer must be fake.",
}

const SOURCE_GROUP_ORDER = [
  "Google Business Profile Help",
  "Maps User Contributed Content Policy Help",
  "Google Maps Help",
]

const sourceGroups = SOURCE_GROUP_ORDER.map((label) => ({
  label,
  sources: customerThreateningReviewSources.filter((source) => source.name === label),
})).filter((group) => group.sources.length > 0)

function ContextualCta({
  heading,
  body,
  ctaLabel,
}: {
  heading: string
  body: string
  ctaLabel: string
}) {
  return (
    <aside className={styles.pilotCta}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Link className={styles.primaryAction} href="/get-help?service=review">
        {ctaLabel}
      </Link>
      <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
    </aside>
  )
}

export function CustomerReviewThreatPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.disputePage}`}>
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
        <p className={styles.eyebrow}>Review Abuse &amp; Scams</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            A customer complaint and a review threat can happen in the same conversation, but they are
            not the same issue. The customer may genuinely believe they are owed a refund while also
            saying they will post, change or remove a Google review depending on what the business
            gives them.
          </p>
          <p>
            Do not immediately label the customer an extortionist, and do not pay simply because the
            rating feels at risk. Preserve the exact wording, assess the underlying dispute on its own
            facts and then decide which Google review process, if any, actually applies.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Separate the two questions first</h2>
        <p>
          Do not let the review threat decide the customer-service outcome, and do not let the refund
          dispute replace the review-policy analysis.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>The customer dispute</h3>
            <span className={styles.statusKicker}>Question</span>
            <p>Is a refund, remedy, replacement or other resolution genuinely appropriate?</p>
            <span className={styles.statusKicker}>Check</span>
            <ul>
              {customerDisputeChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className={styles.statusKicker}>Outcome</span>
            <p>Make the commercial decision on its own merits.</p>
          </div>
          <div>
            <h3>The review condition</h3>
            <span className={styles.statusKicker}>Question</span>
            <p>What exactly has the customer said about the Google review?</p>
            <span className={styles.statusKicker}>Check</span>
            <ul>
              {reviewConditionChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className={styles.statusKicker}>Outcome</span>
            <p>Preserve the wording and assess the Google-policy issue separately.</p>
          </div>
        </div>
        <div className={styles.warning}>
          <h3>Do not trade one decision for the other</h3>
          <p>
            If a refund is genuinely appropriate, make that decision because of the underlying customer
            issue.
          </p>
          <p>
            Do not make payment, a discount, free work or another benefit conditional on the customer
            deleting, changing or improving a Google review.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether this is an ordinary complaint or a review-policy problem?"
        body="Tell us what happened, what the customer asked for and exactly what they said about the review. We can help you separate the customer dispute from the Google review issue."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A genuine customer can still leave a negative review</h2>
        <p>
          Google tells businesses not to report a review merely because they disagree with it or dislike
          it, and says it does not get involved in ordinary conflicts between businesses and customers.
        </p>
        <p>A genuine customer may therefore leave critical feedback about a real experience.</p>
        <p>
          The fact that the customer also asked for a refund does not automatically make the review fake
          or removable.
        </p>
        <p>They may be wrong.</p>
        <p>They may exaggerate.</p>
        <p>The business may strongly disagree with their account.</p>
        <p>The Google removal question still depends on whether the contribution violates Google&apos;s policies.</p>
        <p>Do not report a review simply because the refund dispute remains unresolved.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A refund request on its own is not the same as review extortion</h2>
        <p>
          Customers ask for refunds and compensation for many reasons. The request may be justified,
          disputed or unreasonable.
        </p>
        <p>The existence of a refund request alone does not establish a review-extortion case.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Customer dispute</h3>
            <p>&quot;I want a refund because the service was not completed.&quot;</p>
            <p>The requested money relates to the underlying transaction.</p>
          </div>
          <div>
            <h3>Review-linked condition</h3>
            <p>&quot;Give me a refund and I will remove the one-star review.&quot;</p>
            <p>The requested benefit is directly connected to what happens to the review.</p>
          </div>
        </div>
        <p>Another example:</p>
        <p>&quot;I am unhappy and I intend to tell people what happened.&quot;</p>
        <p>is different from:</p>
        <p>&quot;Give me something of value and I will remove the negative review.&quot;</p>
        <p>
          Preserve the exact wording rather than forcing every difficult customer conversation into the
          same category.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not offer a benefit in exchange for changing the review</h2>
        <p>
          Google&apos;s review policies prohibit merchants from offering incentives such as payment,
          discounts, free goods or services in exchange for posting, revising or removing a review.
        </p>
        <p>Do not offer:</p>
        <div className={styles.checkGrid}>
          {prohibitedIncentives.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>on the condition that the customer removes, changes or improves Google review content.</p>
        <div className={styles.warning}>
          <h3>Do not say</h3>
          <p>&quot;We&apos;ll refund you if you delete the review.&quot;</p>
          <p>
            A pressured business can still create its own policy problem by trying to purchase a review
            outcome.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If a refund is genuinely appropriate, keep it independent of the review</h2>
        <p>A business may decide that a refund or other remedy is appropriate because something genuinely went wrong.</p>
        <p>Examples can include:</p>
        <div className={styles.checkGrid}>
          {refundExamples.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>That decision should stand on its own.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>The customer issue</h3>
            <p>Resolve it because it should be resolved.</p>
          </div>
          <div>
            <h3>The review</h3>
            <p>Do not make the customer:</p>
            <ul>
              {reviewConditions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>as a condition of receiving a remedy that is otherwise appropriate.</p>
          </div>
        </div>
        <p>Do not purchase a review outcome.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Save the exact message before the conversation changes</h2>
        <p>Do not rely on memory.</p>
        <p>Depending on how the customer contacted the business, preserve:</p>
        <div className={styles.checkGrid}>
          {contactChannels.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Where possible record:</p>
        <div className={styles.checkGrid}>
          {messageRecord.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not crop evidence in a way that removes important context.</p>
        <p>Do not rewrite the customer&apos;s words to make them sound more threatening.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Put the dispute and the review activity on one timeline</h2>
        <ol className={styles.disputeTimeline}>
          {timelinePoints.map(([title, body], index) => (
            <li key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>
                <strong>{title}</strong>
                {body}
              </span>
            </li>
          ))}
        </ol>
        <p>Keep the sequence factual.</p>
        <p>Timing can explain what happened without requiring you to guess the customer&apos;s motive.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Assess a posted review on its own content</h2>
        <p>A difficult refund conversation does not automatically make the resulting review removable.</p>
        <p>Read the actual contribution.</p>
        <p>Use a policy checklist:</p>
        <ul className={styles.proseList}>
          {postedReviewChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Report what the review actually violates.</p>
        <p>Do not replace the policy analysis with:</p>
        <p>&quot;The customer demanded a refund.&quot;</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A direct demand tied to review removal may use Google&apos;s extortion route</h2>
        <p>Google provides a dedicated merchant reporting route for negative-review extortion.</p>
        <p>
          Its guidance is aimed at direct attempts involving demands for money or favours in exchange for
          removing negative reviews.
        </p>
        <p>For example:</p>
        <p>&quot;Give me money and I will remove these reviews.&quot;</p>
        <p>
          or another direct demand for something of value in exchange for removing negative review content
          may make that route relevant.
        </p>
        <p>Do not assume Google will classify every refund dispute this way.</p>
        <p>Preserve the facts and let Google assess the report.</p>
        <Link className={styles.inlineLink} href="/resources/google-review-extortion">
          Read the full Google review extortion guide →
        </Link>
      </section>

      <ContextualCta
        heading="Have the message and timeline but aren't sure which Google route fits?"
        body="We can review the exact review condition, the posted review if one exists and the surrounding dispute before you decide what to report."
        ctaLabel="Get your case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep Google&apos;s review process separate from legal conclusions</h2>
        <p>
          Words such as extortion, blackmail, fraud and coercion can also have legal meanings that vary by
          jurisdiction.
        </p>
        <p>
          ProfileRelaunch should not tell a business that a customer committed a crime merely because a
          refund request and a review are connected.
        </p>
        <p>For Google&apos;s dedicated review-extortion process, the practical question is narrower:</p>
        <p>
          <strong>
            Is there documented evidence of a demand for money, goods, services or favours in exchange
            for removing negative review content?
          </strong>
        </p>
        <p>
          Where the wider dispute involves safety concerns, fraud allegations, threats or possible legal
          wrongdoing beyond Google&apos;s review policies, appropriate independent professional advice
          may be needed.
        </p>
        <p>ProfileRelaunch does not provide legal advice.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not prolong the argument just to create more evidence</h2>
        <p>
          Once you have clear evidence of what happened, do not deliberately provoke the customer into
          making stronger statements.
        </p>
        <p>Do not:</p>
        <ul className={styles.proseList}>
          {baitDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Preserve what genuinely happened.</p>
        <p>
          Then handle the customer complaint through the appropriate customer-service process and the
          review issue through the appropriate Google process.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not respond to review pressure with your own threats</h2>
        <p>Do not answer with statements such as:</p>
        <ul className={styles.proseList}>
          {threatExamples.map((item) => (
            <li key={item}>&quot;{item}&quot;</li>
          ))}
        </ul>
        <p>Escalating the exchange can create another problem.</p>
        <p>If legal action is genuinely being considered, obtain appropriate advice and use the proper route.</p>
        <p>Do not use threats as a review-management strategy.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep private dispute evidence out of the public review reply</h2>
        <div className={styles.warning}>
          <p>A public review response is visible to potential customers.</p>
          <p>Do not publish:</p>
          <ul>
            {publicDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>If a public response is appropriate, keep it calm and proportionate.</p>
        <p>
          Private evidence belongs in the relevant complaint, reporting or dispute process rather than the
          public reply.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A refund does not mean the customer owes you review deletion</h2>
        <p>
          If the business provides a refund because that refund is genuinely appropriate, it does not gain
          control over the customer&apos;s Google account.
        </p>
        <p>Do not assume the customer must now delete the review.</p>
        <p>Google&apos;s policies prohibit incentives for revising or removing negative reviews.</p>
        <p>The customer may independently decide to update the review because their experience changed.</p>
        <p>That is different from the business making the refund conditional on removal.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The customer may independently update the review later</h2>
        <p>A customer may choose to revise a review after the business resolves the underlying complaint.</p>
        <p>That can happen naturally.</p>
        <p>Do not pressure them to use a particular star rating or wording.</p>
        <p>Do not say:</p>
        <p>&quot;We refunded you, so please change this to five stars.&quot;</p>
        <p>Do not dictate the text.</p>
        <p>The safest approach is:</p>
        <p>resolve the genuine customer problem properly,</p>
        <p>then let the reviewer decide independently what they want to say.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use ordinary review reporting for a separate content-policy violation</h2>
        <p>If the posted review independently violates Google&apos;s content policies, use the ordinary review-reporting process.</p>
        <p>Examples can include:</p>
        <div className={styles.checkGrid}>
          {ordinaryReportExamples.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          Do not use Google&apos;s dedicated extortion form merely because the review is negative or
          because the refund dispute is unpleasant.
        </p>
        <p>Choose the Google route that matches the actual issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If there is a direct review-removal demand, keep the case narrow</h2>
        <p>For a potential Google extortion report, organise:</p>
        <div className={styles.checkGrid}>
          {directDemandCase.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>The aim is not to prove that the customer is a bad person.</p>
        <p>The aim is to show Google the relationship between the demand and the review activity.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Resolving the dispute does not guarantee that Google will remove the review</h2>
        <p>The business may resolve the complaint.</p>
        <p>The customer may keep the review.</p>
        <p>The business may still disagree with what the customer wrote.</p>
        <p>If the contribution complies with Google&apos;s policies, it may remain live.</p>
        <p>Do not promise:</p>
        <ul className={styles.proseList}>
          {removalPromises.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Google makes the final policy decision.</p>
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
        <h2>What if the customer says something slightly different?</h2>
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
        <h2>Before deciding what to do next</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before submitting a report or making another offer
          to the customer.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and scam guidance with
          ProfileRelaunch&apos;s practical dispute-separation approach. These are the main points that
          come directly from Google&apos;s current guidance:
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
            Keep the customer-service decision and the Google-review decision separate. Preserve the exact
            condition, resolve any genuine customer issue on its own merits, and use the Google reporting
            route that matches what actually happened.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review the conversation before you respond?</h2>
        <p>
          You don&apos;t need to decide immediately that the customer is an extortionist or that you must
          pay to protect the rating.
        </p>
        <p>
          Tell us what happened, what the customer asked for and what they said about the review. We&apos;ll
          review the situation and help you understand the strongest appropriate next step.
        </p>
        <div className={styles.pilotConversionActions}>
          <Link className={styles.primaryAction} href="/get-help?service=review">
            Start your Review Protection assessment
          </Link>
          <Link className={styles.secondaryAction} href="/review-protection">
            See how Review Protection works
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
        {sourceGroups.flatMap((group) => [
          <p key={`${group.label}-label`}>{group.label}</p>,
          <ul key={`${group.label}-list`}>
            {group.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>,
        ])}
      </section>

      <section className={`${styles.aboutPilot} ${styles.wide}`}>
        <h2>About this guide</h2>
        <p>
          This guide is based on Google&apos;s publicly available review, scam and Maps content guidance
          and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
