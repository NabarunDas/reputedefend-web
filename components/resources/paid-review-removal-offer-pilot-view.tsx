import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { offeredToRemoveGoogleReviewsForMoneySources } from "@/lib/resource-articles/offered-to-remove-google-reviews-for-money"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const providerChecks = [
  [
    "Policy basis",
    "Which Google policy does the provider believe the review violates?",
    "A specific, understandable policy reason connected to the actual review.",
    '"We can remove anything."',
  ],
  [
    "Process",
    "What work will the provider actually perform?",
    "A clear explanation of assessment, evidence preparation, reporting, appeal support, monitoring or authorised profile management.",
    "\"Our method is secret. You don't need to know.\"",
  ],
  [
    "Outcome promise",
    "What are they promising?",
    "A defined service while acknowledging that Google makes the final moderation decision.",
    "Guaranteed deletion, 100% removal or claims that every negative review can be removed.",
  ],
  [
    "Account access",
    "What access do they need, and why?",
    "The minimum appropriate Business Profile role where access is genuinely required.",
    "Your Google password, OTP, verification code, backup codes or unnecessary primary ownership.",
  ],
  [
    "Pricing",
    "What exactly are you paying for?",
    "Clear written pricing, scope, payment timing and any success condition.",
    'A mysterious "Google deletion fee" or unexplained charge supposedly required by Google.',
  ],
  [
    "If Google says no",
    "What happens if the review remains live?",
    "The provider explains the limits of the case and what was or was not delivered.",
    "They refuse to acknowledge that a policy-compliant review can remain online.",
  ],
] as const

const legitimateWork = [
  "Review-policy assessment",
  "Evidence organisation",
  "Case preparation",
  "Review monitoring",
  "Reporting support",
  "Appeal preparation",
  "Authorised Business Profile management",
  "Communication and case tracking",
]

const policyIssues = [
  "Fake engagement",
  "Conflict of interest",
  "Rating manipulation",
  "Off-topic content",
  "Prohibited personal information",
  "Harassment or another prohibited-content category",
  "Another relevant Google review policy",
]

const processWork = [
  "Help report the review",
  "Organise supporting evidence",
  "Monitor the Reviews Management Tool",
  "Help prepare Google's available review appeal",
  "Assess whether a separate extortion or scam route applies",
  "Provide authorised Business Profile management",
  "Perform another clearly defined service",
]

const guaranteeClaims = [
  "Guaranteed deletion",
  "100% removal",
  "Every negative review can be removed",
  "We control Google's decision",
  "Google has already approved the removal",
  "We can override Google's policy",
  "Our internal contact will delete it regardless of policy",
]

const feeModels = [
  [
    "Upfront fee",
    "The customer pays for assessment, preparation, management or another defined service before the outcome is known.",
  ],
  [
    "Success-based fee",
    "Payment becomes due only if a clearly defined result occurs.",
  ],
  [
    "Mixed model",
    "Part of the work is paid upfront and another part depends on an agreed outcome.",
  ],
] as const

const feeQuestions = [
  "Is the fee clear?",
  "Is the success condition defined?",
  "Does the provider explain that Google makes the final decision?",
  "Does the provider avoid claiming that payment itself causes removal?",
  "What happens if the review remains live?",
]

const impersonationSigns = [
  "Uses a Google-looking logo",
  'Has "Google" in an email address or company wording',
  "Knows public information about your Business Profile",
  "Mentions information visible on Maps",
  "Uses official-sounding language",
  'Says it is "Google certified"',
]

const fakeGoogleFees = [
  "A Google removal charge",
  "A Google administration fee",
  "A Google verification payment",
  "A mandatory Google support fee",
  "An internal moderation payment",
]

const credentialDonts = [
  "Your Google password",
  "One-time passcodes",
  "Two-factor authentication codes",
  "Verification PINs",
  "Account-recovery answers",
  "Backup security codes",
]

const accessQuestions = [
  "Why is Business Profile access required?",
  "What work needs that access?",
  "Which role is required?",
  "Can manager access perform the work?",
  "How long will access be needed?",
  "How will access be removed when the work ends?",
]

const writtenScope = [
  "Which review or reviews are being assessed",
  "What work will be performed",
  "Which Google process will be used",
  "What evidence you need to provide",
  "What Business Profile access is required",
  "The fee",
  "When the fee becomes payable",
  "Whether recurring charges exist",
  "Whether a success condition applies",
  "What that success condition actually means",
  "Any cancellation process",
  "What happens if Google refuses removal",
]

const pressureStatements = [
  "Pay in the next hour or the review becomes permanent",
  "Sign today or your Business Profile will be suspended",
  "Buy this package or more reviews will appear",
  "Do not contact Google yourself",
  "Do not speak to another provider",
  "Transfer ownership now",
]

const fakeReviewBuys = [
  "Fabricated reviews",
  "Batches of five-star ratings",
  "Reviews from people who never used the business",
  "Incentivised ratings designed to manipulate the score",
]

const harassmentDonts = [
  "Threaten the reviewer",
  "Expose private information",
  "Impersonate somebody",
  "Create fake communications",
  "Fabricate evidence",
  "Harass somebody into changing a review",
]

const compliantAnswers = [
  "The review may remain live",
  "Reporting may not be appropriate",
  "A professional response may be more useful",
  "Monitoring may be appropriate",
  "Another route may apply only if separate facts support it",
]

const dueDiligence = [
  "Business name",
  "Website",
  "Contact details",
  "Company details where applicable",
  "Written terms",
  "Privacy information",
  "Service description",
  "Pricing information",
  "Cancellation information where relevant",
]

const paymentWarnings = [
  "Pressure to send money immediately",
  "Payment to an unrelated person or entity without explanation",
  "Refusal to provide an invoice or written terms",
  "Changing the price after the conversation starts",
  "Claims that the payment goes directly to Google when it does not",
  "Requests for account credentials alongside the payment",
  "Threats about the Business Profile if payment is refused",
]

const extortionPreserve = [
  "Preserve the communication",
  "Preserve the connected review links",
  "Do not pay for the reviews to disappear",
  "Assess Google's dedicated negative-review extortion route",
]

const googleProcess = [
  "Assess the review against Google's policies.",
  "Report a policy-violating review through Google's published process.",
  "Monitor the Reviews Management Tool.",
  "If Google finds no policy violation and the review is eligible, use the available one-time appeal where appropriate.",
]

const professionalValue = [
  "Diagnosing the policy issue correctly",
  "Telling you when there is no strong removal case",
  "Preserving evidence",
  "Organising complex facts",
  "Identifying the correct Google process",
  "Preparing a clear report",
  "Preparing an eligible appeal",
  "Monitoring the case",
  "Managing authorised Business Profile access where required",
  "Explaining realistic options when a review remains live",
]

const mistakes: [string, string][] = [
  [
    "Assuming every paid provider is a scam",
    "Google recognises legitimate third-party Business Profile services and allows third parties to charge management fees. The provider's conduct and claims matter more than the existence of a fee.",
  ],
  [
    'Believing "no removal, no fee" means Google is guaranteed to act',
    "A success-based commercial fee can be legitimate, but Google still controls the review-removal decision.",
  ],
  [
    "Paying a supposed Google deletion fee",
    "A third party should distinguish its own professional charges from Google's services and official policy processes.",
  ],
  [
    "Sharing the Google Account password",
    "Use Google's Business Profile access roles where authorised management is genuinely required.",
  ],
  [
    "Giving away primary ownership without a clear reason",
    "Review support does not normally justify surrendering control of the Business Profile.",
  ],
  [
    "Believing a provider because it uses Google's branding",
    "Official-looking design is not proof that a seller works for Google.",
  ],
  [
    'Accepting "we can remove anything" as a policy assessment',
    "A legitimate case should begin with why the particular review may violate an actual Google policy.",
  ],
  [
    "Allowing fake positive reviews as compensation",
    "Buying fabricated positive reviews creates another policy problem.",
  ],
  [
    "Letting the provider harass the reviewer",
    "Professional support should not manufacture misconduct, threats or fabricated evidence.",
  ],
  [
    "Assuming all review-removal offers and review extortion are the same",
    "An independent professional offering policy support is different from somebody claiming control of harmful reviews and demanding payment to remove them.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "The company guarantees it can remove any one-star review",
    [
      "Ask which Google policy the review allegedly violates.",
      "A one-star rating is not itself a removal reason.",
      "If the provider says every negative review can be removed regardless of content, treat that promise cautiously.",
      "Google makes the final policy decision.",
    ],
  ],
  [
    "They charge only if the review is removed",
    [
      "A success-based fee is not automatically illegitimate.",
      "Check how success is defined, when payment becomes due, whether the fee is written clearly and whether the provider still acknowledges that Google controls the moderation outcome.",
      '"No removal, no fee" describes a commercial payment model.',
      "It does not mean the provider can guarantee what Google will decide.",
    ],
  ],
  [
    "They want manager access to our Business Profile",
    [
      "Ask why the access is required and what work they intend to perform.",
      "If authorised profile management is genuinely part of the service, Google's owner and manager roles provide a way to grant access without sharing your personal password.",
      "Use the minimum appropriate role.",
      "Do not transfer primary ownership simply because the provider says that review reporting requires it.",
    ],
  ],
  [
    "They asked for our Google password and verification code",
    [
      "Do not provide them.",
      "Passwords, one-time passcodes, verification PINs, backup codes and other security credentials should remain private.",
      "If Business Profile management access is genuinely required, use Google's owner and manager controls instead.",
      "Reassess the provider before continuing.",
    ],
  ],
  [
    "The person says they control the bad reviews and will remove them for payment",
    [
      "Stop treating this as an ordinary independent review-removal service.",
      "Preserve the message and connected review links.",
      "Do not pay for the harmful review activity to disappear.",
      "The facts may fit Google's dedicated negative-review extortion process.",
    ],
  ],
  [
    "The provider says the review does not violate policy and cannot promise removal",
    [
      "That answer is not automatically a weakness.",
      "A genuine assessment should sometimes conclude that a review does not have a strong policy-removal basis.",
      "Ask what other appropriate options exist, such as monitoring, a professional response or simply leaving a policy-compliant review live.",
    ],
  ],
]

const readinessChecks = [
  "I know which review or reviews the provider is assessing.",
  "The provider can explain the Google policy basis.",
  "I know what work will actually be performed.",
  "I know which Google process will be used.",
  "The provider is not claiming guaranteed control over Google's decision.",
  "I know whether the company is independent from Google.",
  "The provider has not described its private charge as a mandatory Google fee.",
  "I have not shared my Google password.",
  "I have not shared OTPs, verification codes or backup codes.",
  "Any Business Profile access request has a clear reason.",
  "I will retain appropriate ownership and control of the Business Profile.",
  "The price and payment timing are in writing.",
  "Any success condition is clearly defined.",
  "I know what happens if Google leaves the review live.",
  "The provider is not offering fake positive reviews.",
  "The provider is not proposing to threaten or harass reviewers.",
  "I have checked the provider's basic business details.",
  "I know whether the provider itself may create a separate third-party-policy issue.",
  "If the seller claims to control the harmful reviews, I have stopped and assessed the extortion route separately.",
  "I understand Google makes the final policy decision.",
]

const googlePoints = [
  "Google recognises that businesses can work with third parties to manage Business Profiles.",
  "Third-party providers may charge fees for their own services.",
  "Google's third-party policies require transparency about services, costs and expected results.",
  "Third parties must not make false, misleading or unrealistic claims.",
  "Businesses should retain appropriate ownership or access to their Business Profile.",
  "Google provides owner and manager roles for authorised Business Profile access.",
  "Businesses should protect passwords, OTPs and other security credentials.",
  "Google warns businesses about people impersonating Google or making misleading claims.",
  "Policy-violating reviews can be reported through Google's review-removal process.",
  "Google makes the final review-policy decision.",
  "Google's fake-engagement rules prohibit fabricated or manipulated review activity.",
  "Google provides guidance about suspicious review and rating scams.",
]

const relatedCopy: Record<string, string> = {
  "google-review-extortion":
    "What to preserve and which Google route applies if the person asking for payment also claims control of the harmful reviews.",
  "google-business-profile-scams":
    "How to recognise fake Google support, credential requests, unsafe manager invitations and misleading third-party claims around your Business Profile.",
}

const SOURCE_GROUP_ORDER = [
  "Google Business Profile Help",
  "Google Maps Help",
  "Maps User Contributed Content Policy Help",
]

const sourceGroups = SOURCE_GROUP_ORDER.map((label) => ({
  label,
  sources: offeredToRemoveGoogleReviewsForMoneySources.filter((source) => source.name === label),
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

export function PaidReviewRemovalOfferPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.providerPage}`}>
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
            Paying a specialist to help with a Google review problem is not automatically suspicious.
            Businesses legitimately pay agencies and other professionals for policy assessment, evidence
            organisation, case preparation, monitoring and Business Profile management.
          </p>
          <p>
            The important question is what the provider is actually selling. A third party can help build
            and manage a legitimate case, but it cannot purchase Google&apos;s moderation authority. Before
            paying, check the policy basis, the process, the promise, the account access and the commercial
            terms.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check these six things before you pay</h2>
        <p>A credible provider should be able to answer these questions clearly.</p>
        <div className={styles.providerCheck}>
          {providerChecks.map(([title, question, good, warning], index) => (
            <div key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
              <span className={styles.statusKicker}>Good answer</span>
              <p>{good}</p>
              <span className={styles.statusKicker}>Warning sign</span>
              <p>{warning}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>The fee is not the deciding factor</h3>
          <p>An upfront professional fee is not automatically a scam.</p>
          <p>A success-based or &quot;no removal, no fee&quot; model is not automatically a scam.</p>
          <p>
            What matters is whether the provider is transparent about the work and truthful about the fact
            that Google controls the final review-removal decision.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Comparing a review-removal offer and want to know whether the approach makes sense?"
        body="Tell us what the provider promised, what access they requested and what Google policy they say applies. We can help you assess the proposal before you hand over credentials or commit to the service."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Paying for professional help is not automatically the problem</h2>
        <p>Businesses use third parties for many legitimate Business Profile services.</p>
        <p>
          Google&apos;s own guidance recognises third-party providers and allows them to charge for
          professional management services.
        </p>
        <p>A legitimate fee may cover work such as:</p>
        <div className={styles.checkGrid}>
          {legitimateWork.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>You are paying for professional work.</p>
        <p>You are not purchasing authority over Google&apos;s moderation system.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Ask which Google policy the review allegedly violates</h2>
        <p>A credible review-removal assessment should begin with the review itself.</p>
        <p>Ask:</p>
        <p>
          <strong>Which Google policy do you believe this review violates?</strong>
        </p>
        <p>Possible policy issues can include:</p>
        <div className={styles.checkGrid}>
          {policyIssues.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>The provider should be able to explain the reasoning in understandable terms.</p>
        <p>Be cautious if the entire assessment is:</p>
        <p>&quot;Don&apos;t worry. We can remove anything.&quot;</p>
        <p>A review-removal case should have a policy basis before it has a sales promise.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Ask what the provider will actually do</h2>
        <p>Professional know-how can add value without pretending Google&apos;s process is secret.</p>
        <p>Ask whether the provider intends to:</p>
        <ul className={styles.proseList}>
          {processWork.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The provider should be able to describe the work.</p>
        <p>Experience in assessment and case preparation can be valuable.</p>
        <p>That does not require pretending there is a secret deletion button.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Nobody should sell you certainty that belongs to Google</h2>
        <p>Google decides whether reported review content violates its policies.</p>
        <p>That is the main commercial boundary.</p>
        <p>Be cautious of claims such as:</p>
        <div className={styles.compactCard}>
          <ul>
            {guaranteeClaims.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>A provider can describe its service, experience, process and pricing.</p>
        <p>It cannot truthfully transfer Google&apos;s moderation authority to itself.</p>
        <p>Do not confuse confidence in professional work with control over Google&apos;s decision.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A success fee is not the same thing as a guaranteed outcome</h2>
        <p>Professional services can use different payment models.</p>
        <div className={styles.threeOutcome}>
          {feeModels.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>None of these structures proves that a provider is legitimate or illegitimate.</p>
        <p>Ask instead:</p>
        <ul className={styles.proseList}>
          {feeQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A commercial success fee can coexist with an honest statement:</p>
        <p>
          <strong>Google decides the outcome.</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Be cautious of anyone claiming to be Google</h2>
        <p>An independent provider should describe itself as an independent provider.</p>
        <p>Do not accept a claim of Google employment or Google authority merely because a seller:</p>
        <ul className={styles.proseList}>
          {impersonationSigns.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          A provider helping with Google Business Profile should not imply that it is Google or that Google
          has authorised it to make moderation decisions.
        </p>
        <p>ProfileRelaunch is independent of Google and must describe itself that way.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A provider&apos;s service fee is not a Google deletion fee</h2>
        <p>A third party can charge for its own professional work.</p>
        <p>That is different from claiming:</p>
        <p>&quot;Google requires this payment to remove the review.&quot;</p>
        <p>Be cautious if somebody describes a private fee as:</p>
        <div className={styles.checkGrid}>
          {fakeGoogleFees.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>The provider should clearly distinguish:</p>
        <p>
          <strong>its own commercial fee</strong>
        </p>
        <p>from</p>
        <p>
          <strong>Google&apos;s own services and policy processes.</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Never hand over your Google password or security codes</h2>
        <div className={styles.warning}>
          <p>Do not give a review-removal provider:</p>
          <ul>
            {credentialDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          Google provides Business Profile owner and manager roles so authorised people can receive
          appropriate access without sharing personal login credentials.
        </p>
        <p>
          A request for passwords, OTPs or security codes should trigger an immediate security review of
          the relationship.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep control of your Business Profile</h2>
        <p>If a provider genuinely needs Business Profile access, use Google&apos;s owner and manager controls.</p>
        <p>Do not hand over the whole Google Account.</p>
        <p>Ask:</p>
        <ul className={styles.proseList}>
          {accessQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not transfer primary ownership merely because somebody says it is necessary to report a review.</p>
        <p>Keep appropriate ownership or co-ownership of the Business Profile.</p>
      </section>

      <ContextualCta
        heading="A provider is asking for Business Profile access and you're not sure whether it's necessary?"
        body="We can help you separate legitimate management access from requests that expose more of your Google Account than the work actually requires."
        ctaLabel="Get the offer reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Get the scope and charges in writing</h2>
        <p>Before paying, ask for a written description of the service.</p>
        <p>It should explain:</p>
        <div className={styles.checkGrid}>
          {writtenScope.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Vague pricing is more concerning when it is combined with pressure, secrecy or unrealistic promises.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Be cautious of pressure designed to stop you checking the offer</h2>
        <p>A damaging review can create real urgency.</p>
        <p>That does not mean you should accept artificial pressure from a seller.</p>
        <p>Be cautious of statements such as:</p>
        <ul className={styles.proseList}>
          {pressureStatements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Take enough time to understand the service, access request and commercial terms.</p>
        <p>
          Do not confuse a sales deadline with a Google deadline unless the provider can point to the actual
          Google process involved.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not let the provider solve one review problem by creating another</h2>
        <p>A provider may say:</p>
        <p>&quot;We can&apos;t remove the bad review, but we can bury it with five-star reviews.&quot;</p>
        <p>That can create a separate Google policy problem.</p>
        <p>Google prohibits fake engagement and review activity that does not reflect genuine experiences.</p>
        <p>Do not buy:</p>
        <div className={styles.checkGrid}>
          {fakeReviewBuys.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          A legitimate Review Protection service should not respond to one suspected policy violation by
          creating another.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not authorise a provider to threaten reviewers for you</h2>
        <p>Professional review support should improve the accuracy and organisation of the case.</p>
        <p>Do not authorise a provider to:</p>
        <ul className={styles.proseList}>
          {harassmentDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The provider&apos;s conduct should not create a second problem around the original review.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Ask what the provider does when there is no strong removal case</h2>
        <p>This is one of the most useful questions you can ask:</p>
        <p>
          <strong>
            What happens if your assessment concludes that the review does not violate Google&apos;s
            policies?
          </strong>
        </p>
        <p>A credible answer may be:</p>
        <ul className={styles.proseList}>
          {compliantAnswers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A service that claims every review is removable may not be performing a genuine policy assessment.</p>
        <p>A useful specialist should sometimes be able to say:</p>
        <p>
          <strong>This review does not appear to have a strong policy-removal case.</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check the provider&apos;s ordinary business details</h2>
        <p>Do basic commercial due diligence before sending money or granting access.</p>
        <p>Check information such as:</p>
        <div className={styles.checkGrid}>
          {dueDiligence.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>A polished website or Google-looking logo is not proof of authority.</p>
        <p>A small specialist company is not automatically suspicious either.</p>
        <p>Look for consistency, transparency and a service description that makes sense.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Unusual payment requests deserve extra caution</h2>
        <p>The payment method alone does not prove that a service is fraudulent.</p>
        <p>Look at the whole interaction.</p>
        <p>Use a warning checklist for situations such as:</p>
        <div className={styles.compactCard}>
          <ul>
            {paymentWarnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Assess the combination of payment request, service description, identity, access request and promises.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the seller claims to control the bad reviews, stop and reassess the situation</h2>
        <div className={styles.warning}>
          <p>This is materially different from an independent provider offering professional support.</p>
          <p>For example:</p>
          <p>&quot;I control these reviews. Pay me and I will remove them.&quot;</p>
          <p>is not an ordinary consultancy offer.</p>
          <p>
            If the same person or organisation appears to control harmful review activity and demands money,
            goods, services or favours to remove it:
          </p>
          <ul>
            {extortionPreserve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <Link className={styles.inlineLink} href="/resources/google-review-extortion">
          Read the Google review extortion guide →
        </Link>
        <p>Do not confuse:</p>
        <p>
          <strong>an independent provider charging for review-policy assistance</strong>
        </p>
        <p>with</p>
        <p>
          <strong>
            somebody claiming control of harmful review activity and demanding payment to stop or remove it.
          </strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A problem with the provider is separate from the original review</h2>
        <p>
          Where a provider actually manages a Business Profile as a third party, Google&apos;s Business
          Profile third-party policies can apply to that relationship.
        </p>
        <p>A business can therefore face two separate questions:</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>The review</h3>
            <p>Does the review itself violate Google&apos;s Maps or review policies?</p>
          </div>
          <div>
            <h3>The provider</h3>
            <p>
              Has the third party managing or selling Business Profile services behaved in a way that
              violates Google&apos;s third-party requirements?
            </p>
          </div>
        </div>
        <p>Do not confuse the complaint about the provider with the review-removal report.</p>
        <p>They are separate issues and may use different Google processes.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Understand the normal Google review process before buying a service</h2>
        <p>You do not need to perform every step yourself to understand the basic route.</p>
        <ol className={styles.numberedQuestions}>
          {googleProcess.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p>A professional provider may help with assessment, evidence, preparation and case management.</p>
        <p>
          Knowing the basic process makes it easier to recognise claims about secret deletion buttons or
          impossible authority.
        </p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A provider can add value without pretending to control Google</h2>
        <p>Legitimate professional value can come from:</p>
        <div className={styles.checkGrid}>
          {professionalValue.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Expertise can be worth paying for.</p>
        <p>Expertise does not require a false claim that the provider owns Google&apos;s moderation decision.</p>
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
        <h2>What if the offer sounds different?</h2>
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
        <h2>Before paying a review-removal provider</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before paying, sharing access or signing an
          agreement.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review, Business Profile and third-party
          guidance with ProfileRelaunch&apos;s practical provider-assessment approach. These are the main
          points that come directly from Google&apos;s current guidance:
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
            Pay for defined professional work, not for a claim of control over Google. A credible provider
            should be able to explain the policy, the process, the access it needs, the pricing and what
            happens if Google says no.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want a second opinion on a review-removal offer before you commit?</h2>
        <p>
          You don&apos;t need to assume every paid provider is a scam, and you don&apos;t need to accept a
          sales promise at face value.
        </p>
        <p>
          Tell us what the provider offered, what they say they can achieve and what access or payment they
          requested. We&apos;ll help you assess the proposal against the Google process and the practical
          warning signs.
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
          This guide is based on Google&apos;s publicly available review, Business Profile and third-party
          guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
