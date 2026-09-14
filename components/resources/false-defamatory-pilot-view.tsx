import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { falseOrDefamatoryGoogleReviewsSources } from "@/lib/resource-articles/false-or-defamatory-google-reviews"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const mapsPolicySources = falseOrDefamatoryGoogleReviewsSources.filter(
  (source) => source.name === "Maps User Contributed Content Policy Help",
)
const businessProfileSources = falseOrDefamatoryGoogleReviewsSources.filter(
  (source) => source.name === "Google Business Profile Help",
)

const relatedCopy: Record<string, string> = {
  "can-a-google-review-be-removed":
    "How Google's ordinary review-removal policies work and which kinds of content can qualify for policy-based removal.",
  "google-rejected-my-review-report":
    "How to check the Reviews Management Tool status, prepare the one-time appeal and recognise when Google's published policy process has reached its end.",
}

const diagnosticRoutes = [
  {
    kicker: "Disagreement",
    heading: "Ordinary disagreement or criticism",
    question:
      "Is the business mainly saying the reviewer is wrong, unfair, exaggerating or expressing a harsh opinion?",
    examples: [
      '"The staff were rude."',
      '"The room was dirty."',
      '"This company is terrible."',
    ],
    means:
      "The business may strongly disagree, but disagreement alone does not establish a Google policy violation.",
    next: "Check whether a separate published Google content rule genuinely applies.",
  },
  {
    kicker: "Google policy",
    heading: "Google content-policy issue",
    question:
      "Does the actual review raise a specific problem covered by Google's Maps contribution rules?",
    examples: [
      "Fake engagement",
      "Misrepresentation",
      "Certain unsupported allegations of unethical or criminal behaviour",
      "Harassment",
      "Prohibited personal information",
      "Off-topic content",
      "Another relevant prohibited-content rule",
    ],
    means:
      "Use Google's normal review-reporting process and identify the specific policy issue.",
  },
  {
    kicker: "Legal question",
    heading: "Separate legal question",
    question:
      "Is the business alleging that the content violates applicable law rather than merely Google's review policies?",
    means: "Google provides a separate legal-removal process.",
    boundary:
      "ProfileRelaunch does not determine whether content is legally defamatory. Appropriate independent legal advice may be needed for a legal conclusion.",
  },
] as const

const termCards = [
  [
    "Fake review",
    "Usually raises the question of whether the contribution reflects a genuine experience or whether engagement has been manipulated.",
  ],
  [
    "False statement",
    "A factual statement the business believes is incorrect. It can appear inside a genuine customer review.",
  ],
  [
    "Defamatory statement",
    "A legal characterisation that depends on applicable law and the circumstances.",
  ],
] as const

const fakeEngagementSignals = [
  "The reviewer did not have the claimed experience",
  "The contribution was fabricated",
  "Multiple accounts were used to simulate genuine engagement",
  "Reviews were bought or incentivised",
  "Another fake-engagement pattern exists",
]

const missingNameReasons = [
  "Used another name",
  "Booked through somebody else",
  "Visited with another customer",
  "Used a company account",
  "Interacted with staff without appearing in the record you checked",
]

const usefulFactQuestions = [
  "What exact statement is disputed?",
  "Can it be checked objectively?",
  "What legitimate business record addresses it?",
  "Does the wording raise a specific Google policy issue?",
]

const disputePairs = [
  [
    ["Customer", '"The room was dirty."'],
    ["Business", '"Our inspection found it clean."'],
  ],
  [
    ["Customer", '"The staff were rude."'],
    ["Business", '"Our staff were professional."'],
  ],
] as const

const seriousExamples = ["Theft", "Fraud", "Criminal activity", "Serious unethical conduct"]

const preserveSerious = [
  "The exact review wording",
  "The surrounding context",
  "Relevant factual records legitimately held by the business",
]

const harassmentIssues = [
  "Specific threats of harm",
  "Targeted harassment",
  "Doxxing",
  "Unwanted sexualisation",
  "Other applicable harassment-policy issues",
]

const personalInfoTypes = [
  "Personally identifiable information",
  "Financial information",
  "Medical information",
  "Other protected personal information",
]

const mixedReviewParts = [
  "Ordinary criticism",
  "A genuine customer experience",
  "One prohibited allegation",
  "Exposed personal information",
  "Harassment",
  "Another policy issue",
]

const preserveReview = [
  "Direct review URL",
  "Reviewer display name",
  "Star rating",
  "Complete review text",
  "Date shown",
  "Screenshots",
]

const reviewEvidence = [
  "Review text",
  "Rating",
  "Date",
  "Reviewer profile",
  "Direct review URL",
  "Screenshots",
]

const businessEvidence = [
  "Order record",
  "Booking",
  "Invoice",
  "Delivery record",
  "Correspondence",
  "Service notes",
  "Other legitimate records",
]

const neverManufacture = [
  "Alter invoices",
  "Create fake bookings",
  "Delete inconvenient correspondence",
  "Edit screenshots",
  "Manufacture customer records",
  "Pretend a reviewer has a relationship you cannot establish",
  "Create fake communications",
  "Misrepresent what Google previously decided",
]

const reportRecord = [
  "Review URL",
  "Reporting reason",
  "Report date",
  "Reviews Management Tool status",
  "Evidence supporting the classification",
]

const appealAvoid = [
  "A legal submission",
  "A general complaint that the review is unfair",
  "A repeat of unsupported accusations",
  "A new story unsupported by the evidence",
]

const legalAssessmentDepends = [
  "The exact words",
  "Whether statements are fact or opinion",
  "Their context",
  "Applicable local law",
  "Other facts outside Google's ordinary content-policy review",
]

const legalPromises = [
  "A lawyer's letter guarantees removal",
  "Calling something defamatory guarantees removal",
  "A legal request automatically removes the review everywhere",
  "Google will necessarily reach the same legal conclusion as the business",
]

const profileReportNotBecause = [
  "One review remained live",
  "A policy appeal failed",
  "The business strongly dislikes the reviewer",
]

const remainsLiveSometimes = [
  "The reviewer had a genuine experience",
  "Google found no policy violation",
  "The one-time appeal did not result in removal",
  "No separate legal issue is being pursued",
]

const professionalReplyCan = [
  "Acknowledge the concern",
  "Avoid admitting disputed factual claims",
  "Avoid exposing private information",
  "Provide limited public context where appropriate",
  "Invite genuine customer-service follow-up through a private channel",
  "Show future customers that the business responds professionally",
]

const stopIf = [
  "The review reflects a genuine experience",
  "No Google content-policy violation can be supported",
  "The one-time policy appeal has already been used where applicable",
  "No genuine profile-level issue exists",
  "No separate legal-removal route is being pursued on proper grounds",
]

const mistakes = [
  [
    "Calling every false-feeling review fake engagement",
    "A genuine customer can make a statement the business disputes. Fake engagement and factual disagreement are not automatically the same issue.",
  ],
  [
    'Treating "not in our CRM" as absolute proof',
    "A missing display name can be useful evidence, but people can interact through another customer, booking name or account.",
  ],
  [
    'Using "defamatory" as a Google policy category',
    "Legal defamation and Google's content policies are separate questions.",
  ],
  [
    "Calling the reviewer a criminal publicly",
    "Do not answer an unsupported allegation with another unsupported allegation.",
  ],
  [
    "Publishing private customer information",
    "Supporting records may be useful privately, but they should not automatically be exposed in a public reply.",
  ],
  [
    "Treating every exaggeration as removable misrepresentation",
    "Some review language is subjective, approximate or disputed.",
  ],
  [
    "Using the legal route because the review appeal failed",
    "Legal removal is for a genuine legal issue, not another attempt at the same policy case.",
  ],
  [
    "Reporting the entire user profile automatically",
    "Profile reporting needs its own policy basis.",
  ],
  [
    "Threatening litigation as the first response",
    "Legal questions may need professional advice. Threats are not a general reputation-management technique.",
  ],
  [
    "Selling another removal attempt when no defensible route remains",
    "A damaging policy-compliant review may need to be managed rather than repeatedly reported.",
  ],
] as const

const scenarios = [
  [
    "The customer says we never delivered the order, but we have delivery records",
    [
      "Preserve the review and the delivery records.",
      "Do not automatically call the account fake if the customer genuinely placed an order.",
      "Identify the exact factual claim.",
      "Keep the delivery evidence separate from the public review.",
      "Assess whether the wording genuinely raises a Google misrepresentation or other content-policy issue.",
      "Do not publish the customer's private order details in the public reply.",
    ],
  ],
  [
    "We cannot find the reviewer name in our CRM",
    [
      "Record exactly what you checked and the period covered.",
      "Do not state that the person definitely never interacted with the business unless your evidence truly establishes that.",
      "They may have booked under another name, accompanied another customer, used a company account or interacted without appearing under the display name.",
      "Treat the missing record as one piece of evidence in the fake-engagement assessment.",
    ],
  ],
  [
    "The review says our business committed fraud",
    [
      "Preserve the exact wording.",
      "Google's content policies can be relevant to certain unsupported allegations of unethical behaviour or criminal wrongdoing.",
      "Assess the actual wording and evidence.",
      "Do not respond by publicly calling the reviewer a criminal or liar.",
      "If a genuinely separate legal issue exists, keep that separate from Google's ordinary policy process.",
    ],
  ],
  [
    "The review contains private information about an employee or customer",
    [
      "Preserve the contribution privately.",
      "Do not repeat the sensitive information in the public reply.",
      "Assess Google's privacy rules and report the specific prohibited content where applicable.",
      "The privacy issue is separate from whether the rest of the review is accurate.",
    ],
  ],
  [
    "Google rejected our policy appeal but we believe the review is defamatory",
    [
      "Do not treat the legal-removal process as an automatic second policy appeal.",
      "The Google content-policy decision and any separate legal allegation use different standards and processes.",
      "ProfileRelaunch cannot decide whether the review is legally defamatory.",
      "If a genuine legal question remains, obtain appropriate independent legal advice and use the relevant route only on proper grounds.",
    ],
  ],
] as const

const readinessChecks = [
  "I have saved the direct review URL.",
  "I have saved the complete review text, rating, reviewer name and date.",
  "I have preserved screenshots without altering them.",
  "I have separated opinions from specific factual allegations.",
  "I have identified the exact statement I dispute.",
  "I have checked whether the reviewer appears to describe a genuine experience.",
  "I am not treating a missing CRM name as automatic proof.",
  "I know which Google content policy I believe applies.",
  "I have preserved legitimate records that genuinely address the disputed statement.",
  "I have kept public review evidence separate from private business records.",
  "I am not publishing private customer information.",
  "I am not making accusations stronger than the evidence supports.",
  "I am not manufacturing evidence.",
  "I am not calling the reviewer a criminal publicly.",
  "I know whether harassment or privacy is a separate policy issue.",
  "I will use the normal Google review-reporting process for content-policy issues.",
  "I understand the eligible review appeal is one-time.",
  "I understand Google's ordinary policy process is separate from legal removal.",
  "I will not use the legal route merely because the policy appeal failed.",
  "I understand ProfileRelaunch does not determine legal defamation.",
  "I will seek independent legal advice if I need a legal conclusion.",
  "I understand the review may remain live.",
  "I am prepared to use a professional public response if no defensible removal route remains.",
]

const googlePoints = [
  "Only reviews that violate Google's policies are eligible for policy-based removal.",
  "Google tells businesses not to report reviews merely because they disagree with them or dislike them.",
  "Maps contributions should reflect genuine experiences.",
  "Fake engagement rules can apply to non-genuine or manipulated contributions.",
  "Google's prohibited-content rules include misrepresentation-related concerns.",
  "Google's prohibited-content guidance addresses certain unsupported allegations of unethical behaviour or criminal wrongdoing.",
  "Google has separate policies covering harassment and certain personal information.",
  "Businesses can report policy-violating reviews through Google's ordinary review-removal process.",
  "Eligible reviews assessed as having no policy violation can currently use Google's one-time appeal.",
  "Google provides a separate process for reporting inappropriate user profiles.",
  "Google separately provides a legal-removal process for content somebody believes violates applicable local law.",
  "Google's content-policy process and legal-removal process address different questions.",
  "Google makes the final decision under the relevant process.",
]

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

export function FalseDefamatoryPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.defamatoryPage}`}>
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
        <p className={styles.eyebrow}>Reviews &amp; Reputation</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            A review can feel completely false to the business without automatically becoming a fake
            review, a Google policy violation or a legally defamatory statement. Those are different
            questions and they use different tests.
          </p>
          <p>
            Start with the exact review. Separate opinion from factual allegations, identify any
            Google content-policy issue and preserve the evidence that genuinely addresses the
            disputed statements. Keep any separate legal question separate from the ordinary Google
            review process.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Which question are you actually trying to answer?</h2>
        <p>
          Do not choose the route from the emotional label attached to the review. Classify what is
          actually wrong with the contribution.
        </p>
        <div className={styles.threeOutcome}>
          {diagnosticRoutes.map((route) => (
            <div key={route.heading}>
              <b className={styles.statusKicker}>{route.kicker}</b>
              <h3>{route.heading}</h3>
              <p>
                <strong>Question.</strong> {route.question}
              </p>
              {"examples" in route ? (
                <>
                  <p>
                    <strong>Examples.</strong>
                  </p>
                  <ul>
                    {route.examples.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                <strong>What it means.</strong> {route.means}
              </p>
              {"next" in route ? (
                <p>
                  <strong>Next step.</strong> {route.next}
                </p>
              ) : null}
              {"boundary" in route ? (
                <p>
                  <strong>Boundary.</strong> {route.boundary}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Google&apos;s policy decision is not a court judgment</h3>
          <p>
            Google deciding that a review does not violate its content policies does not mean it has
            decided every factual statement is true.
          </p>
          <p>
            Likewise, calling a review &quot;defamatory&quot; does not automatically make it removable
            under Google&apos;s ordinary review policies.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether you're dealing with a policy issue, a factual dispute or a separate legal question?"
        body="Tell us what the review says and what evidence you genuinely have. We can help you classify the Google policy issue without turning an ordinary disagreement into an unsupported legal accusation."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;False&quot;, &quot;fake&quot; and &quot;defamatory&quot; are not interchangeable</h2>
        <div className={styles.threeOutcome}>
          {termCards.map(([heading, body]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.labelShift}>
          <p>Do not automatically convert:</p>
          <p className={styles.labelShiftQuote}>&quot;This statement is wrong.&quot;</p>
          <p>into:</p>
          <p className={styles.labelShiftQuote}>&quot;This account is fake.&quot;</p>
          <p>And do not automatically convert:</p>
          <p className={styles.labelShiftQuote}>&quot;This review is damaging.&quot;</p>
          <p>into:</p>
          <p className={styles.labelShiftQuote}>&quot;This review is legally defamatory.&quot;</p>
        </div>
        <p>Classify the actual issue first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google&apos;s normal review process asks whether its content policies were violated</h2>
        <p>
          Google says only reviews that violate its policies are eligible for policy-based removal.
        </p>
        <p>
          Its ordinary review-reporting process is not a general process for deciding every factual
          disagreement between a business and a customer.
        </p>
        <p>
          Google tells businesses not to report reviews merely because they disagree with them or
          dislike them.
        </p>
        <p>
          A negative review can remain live when it reflects a genuine experience and stays within
          Google&apos;s rules.
        </p>
        <p>Focus on the specific policy issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Fake engagement is about genuine experience and manipulation</h2>
        <p>Google&apos;s Maps policies say contributions should reflect genuine experiences.</p>
        <p>Fake engagement can be relevant where the evidence genuinely indicates that:</p>
        <ul className={styles.proseList}>
          {fakeEngagementSignals.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.warning}>
          <h3>&quot;We cannot find this name&quot; is not proof on its own</h3>
          <p>A customer may have:</p>
          <ul>
            {missingNameReasons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>Treat missing records as evidence to investigate, not a verdict.</p>
        </div>
        <Link
          className={styles.inlineLink}
          href="/resources/fake-google-review-or-genuine-negative-feedback"
        >
          Read the fake-review vs genuine-feedback guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A real customer can still make a statement the business says is false</h2>
        <p>Reviewer identity and factual accuracy are separate questions.</p>
        <p>For example, a genuine customer may write:</p>
        <p>
          <strong>&quot;They never delivered the product.&quot;</strong>
        </p>
        <p>while the business has delivery records.</p>
        <p>That does not automatically make the reviewer&apos;s entire experience fake.</p>
        <p>The useful questions are:</p>
        <ul className={styles.proseList}>
          {usefulFactQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Preserve objective evidence that genuinely addresses the disputed statement.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Not every factual disagreement becomes removable misrepresentation</h2>
        <p>Customer disputes often contain competing accounts.</p>
        <div className={styles.disputePairs}>
          {disputePairs.map((pair) => (
            <div className={styles.decisionSplit} key={pair[0][1]}>
              {pair.map(([label, quote]) => (
                <div key={`${label}-${quote}`}>
                  <h3>{label}</h3>
                  <p>{quote}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p>Some statements involve subjective judgment.</p>
        <p>Some involve incomplete recollection.</p>
        <p>Some involve genuinely disputed facts.</p>
        <p>Do not promise removal simply because the business has a different version of events.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Separate opinion from factual allegation</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Primarily opinion</h3>
            <p>&quot;I hated the service.&quot;</p>
            <p>&quot;This company is terrible.&quot;</p>
            <p>These statements mainly express the reviewer&apos;s assessment.</p>
          </div>
          <div>
            <h3>Specific factual allegation</h3>
            <p>&quot;They charged my card twice.&quot;</p>
            <p>&quot;This company stole £500 from me.&quot;</p>
            <p>
              These statements make more specific factual claims that may be capable of being checked
              against records.
            </p>
          </div>
        </div>
        <p>A single review can contain both opinion and factual allegations.</p>
        <p>Analyse the exact wording rather than labelling the entire review with one word.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>
          Certain unsupported allegations of criminal or unethical conduct can raise a Google policy
          issue
        </h2>
        <p>
          Google&apos;s prohibited-content guidance includes rules concerning certain unsubstantiated
          allegations of unethical behaviour or criminal wrongdoing.
        </p>
        <p>Examples can include allegations of:</p>
        <ul className={styles.proseList}>
          {seriousExamples.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not automatically assume every serious allegation qualifies for removal.</p>
        <p>Preserve:</p>
        <ul className={styles.proseList}>
          {preserveSerious.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Report the specific content against the relevant Google policy where the case is
          defensible.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not answer a serious allegation with another unsupported accusation</h2>
        <div className={styles.warning}>
          <p>Do not publicly respond:</p>
          <p>&quot;You are committing fraud by posting this review.&quot;</p>
          <p>or:</p>
          <p>&quot;This reviewer is a criminal.&quot;</p>
          <p>merely because the review contains a serious accusation.</p>
        </div>
        <p>Keep the policy report factual.</p>
        <p>
          If genuinely serious legal or criminal issues exist outside Google&apos;s review process,
          obtain appropriate independent professional advice.
        </p>
        <p>Do not turn the public reply into another unsupported allegation.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Harassment is its own Google policy question</h2>
        <p>A review can move beyond criticism into prohibited harassment.</p>
        <p>Google&apos;s content policies include restrictions involving issues such as:</p>
        <ul className={styles.proseList}>
          {harassmentIssues.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Preserve the content exactly.</p>
        <p>
          Report the harassment issue rather than merely calling the review false or defamatory.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Personal information can create a separate removal issue</h2>
        <p>A review may reveal information that should not be published.</p>
        <p>Google&apos;s policies restrict certain personal information posted without consent.</p>
        <p>Relevant content can include certain:</p>
        <ul className={styles.proseList}>
          {personalInfoTypes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not repeat the private material in the business&apos;s public reply.</p>
        <p>Preserve it privately and report the relevant Google policy issue.</p>
        <p>
          The privacy issue can exist independently from whether the broader customer complaint is
          true or false.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A review can contain ordinary criticism and one prohibited part</h2>
        <p>Do not assume every sentence must be false before a policy problem exists.</p>
        <p>A review may contain:</p>
        <ul className={styles.proseList}>
          {mixedReviewParts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Identify the specific policy violation accurately.</p>
        <p>Do not exaggerate the rest of the review merely to make the report sound stronger.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve the original review before building the case</h2>
        <p>Save:</p>
        <ul className={styles.proseList}>
          {preserveReview.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do this before the review is edited or removed.</p>
        <p>Do not alter screenshots.</p>
        <p>Do not crop away important context.</p>
        <p>Keep your evidence tied to the version of the review you actually preserved.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep the public review and the supporting business records separate</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Review evidence</h3>
            <ul>
              {reviewEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Business evidence</h3>
            <ul>
              {businessEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>This makes it easier to explain:</p>
        <p>
          <strong>which statement is disputed</strong>
        </p>
        <p>and:</p>
        <p>
          <strong>what evidence genuinely addresses it.</strong>
        </p>
        <p>It also reduces the temptation to publish private customer information publicly.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>When identity is uncertain, say only what the records establish</h2>
        <p>Searching business records can be useful.</p>
        <p>But avoid claims stronger than the evidence.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Careful statement</h3>
            <p>
              &quot;We found no record matching this display name for the period reviewed.&quot;
            </p>
          </div>
          <div>
            <h3>Stronger claim that needs stronger proof</h3>
            <p>&quot;This person has never been a customer.&quot;</p>
          </div>
        </div>
        <p>
          Use the strongest statement the evidence genuinely supports — not the strongest sentence
          you can write.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not manufacture evidence to make the review look false</h2>
        <div className={`${styles.warning} ${styles.integrityWarning}`}>
          <p>Never:</p>
          <ul>
            {neverManufacture.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>Policy evidence needs to be genuine.</p>
          <p>
            ProfileRelaunch should reject a case rather than strengthen it with fabricated material.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Have the review and supporting records but aren't sure what they actually prove?"
        body="We can help you separate the disputed statements, the Google policy issue and the evidence you genuinely have before you report or appeal."
        ctaLabel="Get your review checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use Google&apos;s normal review process for content-policy violations</h2>
        <p>
          If the review violates a Google content policy, report it through Google&apos;s normal
          review-removal process.
        </p>
        <p>Choose the reason that best matches the actual issue.</p>
        <p>Keep a record of:</p>
        <ul className={styles.proseList}>
          {reportRecord.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Do not submit several contradictory reasons merely to increase the chance of removal.
        </p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If Google finds no policy violation, use the one-time appeal carefully</h2>
        <p>If Google&apos;s Reviews Management Tool shows:</p>
        <p>
          <strong>Report reviewed - no policy violation</strong>
        </p>
        <p>its current process can provide a one-time appeal for eligible reviews.</p>
        <p>Use the appeal to clarify the genuine Google policy issue.</p>
        <p>Do not turn it into:</p>
        <ul className={styles.proseList}>
          {appealAvoid.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The review-policy appeal remains a Google policy assessment.</p>
        <Link className={styles.inlineLink} href="/resources/google-rejected-my-review-report">
          Read our rejected-review-report guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google&apos;s legal-removal process is separate</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Google content-policy route</h3>
            <p>
              <strong>Question.</strong> Does the review violate Google&apos;s published Maps content
              policies?
            </p>
            <p>
              <strong>Examples.</strong> Fake engagement, prohibited content, privacy, harassment or
              another applicable policy category.
            </p>
          </div>
          <div>
            <h3>Legal-removal route</h3>
            <p>
              <strong>Question.</strong> Does the content allegedly violate applicable law in the
              relevant jurisdiction?
            </p>
          </div>
        </div>
        <p>
          Google says its Maps content policies apply worldwide and separately provides a process for
          content somebody believes violates local law.
        </p>
        <p>
          Do not use the legal route merely because an ordinary policy report or appeal failed.
        </p>
        <p>Use it only when there is a genuine legal issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>ProfileRelaunch does not decide whether a review is legally defamatory</h2>
        <div className={styles.warning}>
          <p>Defamation law varies by jurisdiction.</p>
          <p>A legal assessment can depend on matters such as:</p>
          <ul>
            {legalAssessmentDepends.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>ProfileRelaunch can identify Google policy issues and organise a review case.</p>
          <p>
            ProfileRelaunch does not provide legal advice and does not decide that somebody has
            committed defamation.
          </p>
          <p>
            Where a business needs a legal conclusion, obtain appropriate independent legal advice.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A legal allegation does not guarantee global removal</h2>
        <p>Do not promise:</p>
        <ul className={styles.proseList}>
          {legalPromises.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Google makes its own decision under its legal-removal process.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reporting the reviewer&apos;s profile is not another review appeal</h2>
        <p>Google also provides a separate route for inappropriate user profiles.</p>
        <p>
          That may be relevant where the profile itself or wider contribution activity raises a
          genuine policy issue.
        </p>
        <p>Do not report the entire user profile simply because:</p>
        <ul className={styles.proseList}>
          {profileReportNotBecause.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A profile report needs its own policy basis.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not use legal threats as an ordinary review-management tactic</h2>
        <p>Do not respond to a disputed review with threats merely to pressure deletion.</p>
        <p>Do not use statements such as:</p>
        <p>&quot;Delete this or we will sue you.&quot;</p>
        <p>as a standard reputation-management response.</p>
        <p>
          Where legal correspondence is genuinely appropriate, it should be handled through the
          proper professional route.
        </p>
        <p>Keep Google policy reporting, customer service and legal action separate.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the review remains live, a professional response may be the right next step</h2>
        <p>Sometimes:</p>
        <ul className={styles.proseList}>
          {remainsLiveSometimes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          In that situation, a concise public response may be more useful than another removal
          attempt.
        </p>
        <p>A professional reply can:</p>
        <ul className={styles.proseList}>
          {professionalReplyCan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not turn the public reply into a courtroom submission.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the responsible recommendation is not to sell another removal attempt</h2>
        <p>A review can be:</p>
        <ul className={styles.proseList}>
          <li>Negative</li>
          <li>Damaging</li>
          <li>Frustrating</li>
        </ul>
        <p>and still have no defensible further removal route.</p>
        <p>If:</p>
        <ul className={styles.proseList}>
          {stopIf.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>then ProfileRelaunch should be willing to say:</p>
        <p>
          <strong>
            There is no strong removal route we can responsibly recommend from the evidence provided.
          </strong>
        </p>
        <p>Do not sell false hope.</p>
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
        <h2>What if the disputed review looks different?</h2>
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
        <h2>Before reporting a false or allegedly defamatory review</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before making a stronger policy or legal
          allegation.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and Maps content guidance with
          ProfileRelaunch&apos;s practical evidence-classification approach. These are the main points
          that come directly from Google&apos;s current guidance:
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
            Start with the exact words, not the label. Work out whether you have ordinary
            disagreement, a genuine Google content-policy issue or a separate legal question.
            Preserve the evidence honestly, use the route that matches the issue and be prepared to
            stop pursuing removal when no defensible route remains.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to help separate the policy case from the legal question?</h2>
        <p>
          You don&apos;t need to call the reviewer fake, criminal or defamatory before asking for
          help.
        </p>
        <p>
          Tell us what the review says, which statements you dispute and what evidence you have.
          We&apos;ll help you assess the Google policy position and identify whether the situation
          appears to involve a separate question that needs independent legal advice.
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
        <p>Maps User Contributed Content Policy Help</p>
        <ul>
          {mapsPolicySources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        <p>Google Business Profile Help</p>
        <ul>
          {businessProfileSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available review and Maps content guidance and
          was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
