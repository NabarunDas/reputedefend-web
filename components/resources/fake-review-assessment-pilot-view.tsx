import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { fakeOrGenuineNegativeFeedbackSources } from "@/lib/resource-articles/fake-google-review-or-genuine-negative-feedback"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const assessmentOutcomes = [
  [
    "Evidence points towards a genuine experience",
    "The review can reasonably be connected with a real interaction and nothing clearly indicates manipulation or another policy issue.",
    "Treat genuine negative feedback seriously even when you disagree with it.",
  ],
  [
    "The evidence is inconclusive",
    "Some details look unusual, but you cannot establish whether a genuine interaction happened.",
    "Preserve what you know and keep uncertainty as uncertainty. Do not turn suspicion into certainty.",
  ],
  [
    "Evidence points towards a possible policy issue",
    "Important facts appear impossible, a real conflict of interest exists, several reviews show suspicious coordination or direct evidence points towards fabrication or manipulation.",
    "Identify the Google policy that the evidence actually supports.",
  ],
] as const

const evidenceSignals = [
  [
    "Identity",
    "Can you connect the Google display name to a customer or somebody connected to a real customer?",
    "An unfamiliar name is only a clue, not proof.",
  ],
  [
    "Plausibility",
    "Does the review describe services, products, locations, staff or events that could actually have happened?",
    "One incorrect detail does not automatically prove that the whole experience was invented.",
  ],
  [
    "Business records",
    "Can the described experience reasonably be connected to an appointment, booking, invoice, order, delivery, complaint or other genuine interaction?",
    "Use ordinary records you already hold. Do not build a surveillance file on the reviewer.",
  ],
  [
    "Specific details",
    "Do the dates, staff references, services or other details make the review easier to verify?",
    "Detail can help investigation, but detail alone does not prove authenticity.",
  ],
  [
    "Relationships",
    "Is there genuine evidence of an employment, competitor, contractual or other conflict of interest?",
    "A hostile review does not prove that the reviewer is a competitor.",
  ],
  [
    "Patterns",
    "Are several reviews arriving together, repeating wording or showing other evidence of coordination?",
    "A pattern tells you to investigate. It does not give you the conclusion by itself.",
  ],
] as const

const otherNameReasons = [
  "booked under another name",
  "attended with another customer",
  "been a passenger, guest or family member",
  "communicated through somebody else",
  "used different contact details",
  "used a nickname or pseudonym",
  "interacted in a way that did not create the customer record you expected",
]

const plausibilityChecks = [
  "Service mentioned",
  "Product mentioned",
  "Business location",
  "Operating hours",
  "Staff role",
  "Appointment type",
  "Delivery method",
  "Facilities described",
  "Approximate date or period",
  "Sequence of events",
]

const interactionRecords = [
  "Appointments",
  "Bookings",
  "Invoices",
  "Orders",
  "Support conversations",
  "Delivery records",
  "Complaint records",
  "Staff recollections",
]

const disagreementReasons = [
  "misunderstand what happened",
  "remember a conversation differently",
  "omit context",
  "exaggerate",
  "express an opinion the business considers unreasonable",
]

const conflictRelationships = [
  "Current employment",
  "Former employment",
  "Contractual relationships",
  "Consultancy relationships",
  "Professional affiliations",
  "Personal affiliations that demonstrate a conflict",
  "Industry competitors",
]

const patternChecks = [
  "Several reviews arriving in an unusually short period",
  "Repeated or highly similar wording",
  "Several accounts making closely related claims",
  "Reviews clustered around the same external event",
  "Several reviews connected to the same known dispute",
  "Evidence that somebody requested or coordinated reviews from multiple accounts",
]

const repeatedCompare = [
  "Wording",
  "Timing",
  "Ratings",
  "Allegations",
  "Account behaviour visible on Google",
  "Any direct evidence of coordination",
]

const genuineSpike = [
  "A real service failure affecting several customers",
  "A public incident",
  "A change in opening or delivery",
  "A widely shared customer complaint",
]

const manipulatedSpike = [
  "An external campaign unrelated to genuine customer experiences",
  "Evidence of coordinated posting",
  "Repeated or copied wording",
  "Reviews linked to a known non-customer dispute",
]

const profileDoesNotProve = [
  "One visible review does not prove the account is fake.",
  "A Local Guide badge does not prove the review is genuine.",
  "A long review history does not prove every contribution is legitimate.",
  "A new-looking account does not prove manipulation.",
]

const directEvidenceExamples = [
  "A message admitting the reviewer never used the business",
  "A competitor relationship you can genuinely establish",
  "Evidence that reviews were purchased",
  "An offer to post or remove reviews for payment",
  "A request asking people with no genuine experience to post reviews",
  "Identical content coordinated across multiple accounts",
  "Communications connecting reviews to a manipulation campaign",
]

const preserveDirect = [
  "Keep original messages where possible.",
  "Do not edit screenshots.",
  "Record dates.",
  "Record account names.",
  "Save direct review links.",
]

const doNotManufacture = [
  "manufacture customer records",
  "edit screenshots",
  "create fake messages",
  "provoke a reviewer for reporting evidence",
  "make unsupported claims about account ownership or identity",
]

const afterOutcomes: [string, string[]][] = [
  [
    "The review appears to reflect a genuine experience",
    [
      "Fake engagement is probably not the strongest policy argument.",
      "Consider an appropriate professional response rather than reporting the reviewer as fake.",
    ],
  ],
  [
    "The evidence supports a Google policy issue",
    [
      "Report the review using the most accurate policy reason.",
      "Explain what you can establish and avoid adding claims you cannot support.",
    ],
  ],
  [
    "The evidence remains inconclusive",
    [
      "Preserve the case.",
      "Do not convert suspicion into certainty.",
      "If you decide to report it, keep the explanation proportionate to what you actually know.",
    ],
  ],
]

const usefulResponse = [
  "acknowledge the concern without accepting claims you dispute",
  "stay professional",
  "avoid publishing private customer information",
  "explain an appropriate route for offline resolution where useful",
]

const mistakes: [string, string][] = [
  [
    '"We cannot find this name, so the review is fake"',
    "An unfamiliar Google display name is useful context, but the reviewer may have used another name or been connected with somebody else's genuine interaction.",
  ],
  [
    "Treating one incorrect detail as proof that the whole review was fabricated",
    "People can make mistakes. Look at the weight of the evidence.",
  ],
  [
    "Treating detailed wording as proof that a review is genuine",
    "Specific details are useful to investigate, but fabricated content can also contain convincing detail.",
  ],
  [
    "Treating vague wording as proof that a review is fake",
    "Some genuine customers leave short reviews.",
  ],
  [
    "Calling a customer fake because the business disputes their version of events",
    "A factual disagreement and a non-genuine experience are different questions.",
  ],
  [
    "Assuming a hostile review must come from a competitor",
    "A conflict of interest should be based on a real, supportable relationship.",
  ],
  [
    'Calling every sudden cluster "review bombing"',
    "A real event can create several genuine negative reviews at once.",
  ],
  [
    "Using account appearance as proof",
    "A new account, Local Guide badge or review count does not settle whether this contribution is genuine.",
  ],
  [
    "Contacting the reviewer to manufacture evidence",
    "Use evidence that genuinely exists. Do not provoke material for a removal case.",
  ],
  [
    "Forcing an uncertain case into a fake-review conclusion",
    "Sometimes the available evidence does not establish whether a genuine experience occurred. Record uncertainty as uncertainty.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "The reviewer name is not in our system",
    [
      "Treat that as a clue, not a conclusion.",
      "Check whether the experience described can be connected to a booking, order, customer, passenger, guest, family member or another genuine interaction.",
      "Compare the review's factual details with ordinary business records you already hold.",
      "If you still cannot establish whether the experience happened, keep the assessment proportionate to what you know.",
    ],
  ],
  [
    "The review mentions a service we have never offered",
    [
      "That is stronger evidence to investigate because it concerns something factual about how the business operates.",
      "Check whether the service, location, staff role, date or other details could reasonably relate to the business.",
      "Preserve the evidence showing the mismatch.",
      "Do not assume one error automatically proves that every part of the review is fabricated.",
    ],
  ],
  [
    "Several reviews arrived at almost the same time",
    [
      "Record the timing, wording, ratings and any shared allegations.",
      "Then check whether a genuine event could have caused several real customers to post at once.",
      "If there is evidence of coordination, repeated content or a campaign unrelated to genuine experiences, that may support a different assessment.",
      "Timing alone is not proof.",
    ],
  ],
  [
    "I know the reviewer is a genuine customer, but the review is very inaccurate",
    [
      "Do not call the customer fake simply because you dispute the review.",
      "Separate opinions, disputed recollections and factual claims.",
      "Assess whether another Google content policy genuinely applies.",
      "If no policy violation is supportable, a professional public response may be more appropriate.",
    ],
  ],
  [
    "I have direct evidence that the reviews were coordinated",
    [
      "Preserve the original messages, screenshots, review links, account names, dates and any other genuine evidence.",
      "Do not edit or embellish it.",
      "Use the Google policy and reporting route that matches the evidence.",
    ],
  ],
]

const readinessChecks = [
  "I have saved the review link, text, rating and date.",
  "I have separated the reviewer's opinions from factual details I can check.",
  "I have checked whether the experience described is possible.",
  "I have looked for a plausible connection to a genuine interaction.",
  "I am not relying only on an unfamiliar display name.",
  "I am not treating detail or vagueness as proof on its own.",
  "I have checked for a genuine conflict of interest where relevant.",
  "I have recorded any wider review pattern without assuming what caused it.",
  "I have preserved direct evidence without altering it.",
  "I am not using the reviewer's profile appearance as proof.",
  "I know whether the evidence supports a policy issue, genuine feedback or remains inconclusive.",
  "I can describe only what the evidence genuinely supports.",
]

const googlePoints = [
  "Google's Maps policies say reviews and ratings should reflect genuine experiences.",
  "Google describes fake engagement as content that does not represent a genuine experience.",
  "Google's policies prohibit forms of rating manipulation and coordinated or incentivised review activity.",
  "Google's conflict-of-interest rules can apply to employment, professional, personal and competitor relationships.",
  "Repetitive or coordinated contributions can raise policy issues.",
  "A business can report reviews that it believes violate Google's policies.",
  "Google says businesses should not report reviews merely because they disagree with them or dislike them.",
  "Google allows businesses to reply publicly to customer reviews.",
  "Google makes the final policy decision on reported reviews.",
]

const relatedCopy: Record<string, string> = {
  "can-a-google-review-be-removed":
    "How Google's review-removal policies work, what can qualify for removal and when a one-time appeal may be available.",
  "google-review-bombing":
    "How to preserve and assess a suspicious cluster of reviews without assuming that every sudden spike is coordinated manipulation.",
}

const mapsPolicySources = fakeOrGenuineNegativeFeedbackSources.filter(
  (source) => source.name === "Maps User Contributed Content Policy Help",
)
const businessProfileSources = fakeOrGenuineNegativeFeedbackSources.filter(
  (source) => source.name === "Google Business Profile Help",
)

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

export function FakeReviewAssessmentPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.assessmentPage}`}>
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
            A suspicious Google review is not automatically fake. An unfamiliar name, one-star rating,
            vague wording or details you disagree with can be reasons to investigate, but none of them
            proves on its own that the reviewer had no genuine experience.
          </p>
          <p>
            Start with the evidence instead of the label. Check what the review claims, whether the
            experience described is possible, whether it can reasonably be connected to a real
            interaction and whether a wider pattern points toward fake engagement, rating manipulation
            or a conflict of interest.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Don&apos;t decide from one signal</h2>
        <p>A single clue rarely tells you whether a review is genuine or fake. Look at the whole picture.</p>
        <div className={styles.threeOutcome}>
          {assessmentOutcomes.map(([heading, signals, action], index) => (
            <div key={heading}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{heading}</h3>
              <span className={styles.statusKicker}>Signals may include</span>
              <p>{signals}</p>
              <span className={styles.statusKicker}>Action</span>
              <p>{action}</p>
            </div>
          ))}
        </div>
        <p className={styles.frameworkNote}>
          These are ProfileRelaunch assessment categories, not Google review statuses.
        </p>
      </section>

      <ContextualCta
        heading="Have a suspicious review but can't tell which side of the line it falls on?"
        body="Tell us what the review says and what you can genuinely verify from your records. We can help you assess the evidence without assuming the answer first."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Start with Google&apos;s definition, not your instinct</h2>
        <p>Google describes fake engagement as content that does not represent a genuine experience.</p>
        <p>
          Its broader Maps policy says reviews and ratings should reflect actual experiences with
          businesses and should be genuine and unbiased.
        </p>
        <p>The useful question is:</p>
        <p className={styles.keyQuestion}>
          <strong>
            Is there a reasonable basis to believe this review does not represent a genuine experience?
          </strong>
        </p>
        <p>That is different from asking:</p>
        <ul className={styles.proseList}>
          <li>Do I recognise the reviewer&apos;s name?</li>
          <li>Do I agree with the review?</li>
          <li>Is the rating unfair?</li>
          <li>Would I prefer the review to disappear?</li>
        </ul>
        <p>
          Those things can explain why a review feels suspicious or damaging. They do not establish
          fake engagement.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use several signals, not one shortcut</h2>
        <div className={styles.signalGrid}>
          {evidenceSignals.map(([heading, question, important], index) => (
            <div className={styles.signalItem} key={heading}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{heading}</h3>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
              <span className={styles.statusKicker}>Important</span>
              <p>{important}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>An unfamiliar reviewer name is only one piece of information</h2>
        <p>Many businesses begin with:</p>
        <p>&quot;We have never had a customer called this.&quot;</p>
        <p>That can be useful information. It is not a complete investigation.</p>
        <p>A Google display name may not match the name stored by the business.</p>
        <p>The reviewer may have:</p>
        <ul className={styles.proseList}>
          {otherNameReasons.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>None of those possibilities proves the review is genuine.</p>
        <p>They explain why:</p>
        <p>&quot;I cannot find this name&quot;</p>
        <p>should not automatically become:</p>
        <p>&quot;This person definitely never experienced our business.&quot;</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check whether the experience described is even possible</h2>
        <p>Separate the reviewer&apos;s opinion from factual details that can legitimately be checked.</p>
        <div className={styles.checkGrid}>
          {plausibilityChecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Ask whether those details are compatible with the real business.</p>
        <p>
          A review describing a service the business has never offered may deserve closer scrutiny. So
          may a review describing a physical visit to a business that does not receive customers there.
        </p>
        <p>But avoid overclaiming.</p>
        <p>A single incorrect detail does not automatically prove the whole experience was invented.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Can the review be connected to a genuine interaction?</h2>
        <p>
          Where lawful and appropriate, compare the review with ordinary business records you already
          hold.
        </p>
        <p>Examples:</p>
        <div className={styles.compactCard}>
          <ul>
            {interactionRecords.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className={styles.keyQuestion}>
          <h3>The narrow question</h3>
          <p>Can the experience described reasonably be connected to a real interaction?</p>
        </div>
        <p>
          If you find a plausible match, take that seriously even if the review is unfair or incomplete.
        </p>
        <p>
          A genuine customer dispute does not become fake engagement merely because the business
          disagrees with the customer&apos;s interpretation.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Detail and vagueness can both mislead you</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>A detailed review</h3>
            <p>Specific details can make a review easier to investigate.</p>
            <p>
              But details such as staff names, plausible dates, industry terminology or information
              copied from a website do not prove authenticity.
            </p>
            <p>Use details as things to check, not as an authenticity certificate.</p>
          </div>
          <div>
            <h3>A vague review</h3>
            <p>A review such as:</p>
            <p>&quot;Terrible. Avoid.&quot;</p>
            <p>provides very little to investigate.</p>
            <p>
              That may make the review harder to connect to a real event, but real customers can also
              leave short reviews.
            </p>
            <p>Treat vagueness as limited evidence, not proof of fake engagement.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A factual disagreement is not the same as a fake experience</h2>
        <p>
          A reviewer may be a genuine customer even when the business believes parts of the review are
          wrong.
        </p>
        <p>The customer may:</p>
        <ul className={styles.proseList}>
          {disagreementReasons.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Google says it does not get involved in ordinary conflicts between businesses and customers.</p>
        <p>
          Do not report a genuine customer as fake merely because you believe their account is
          inaccurate.
        </p>
        <p>Assess whether a separate Google content policy genuinely applies.</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A real conflict of interest changes the assessment</h2>
        <p>Google&apos;s policies say content based on a conflict of interest can form part of rating manipulation.</p>
        <p>Relevant relationships can include:</p>
        <div className={styles.checkGrid}>
          {conflictRelationships.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          Google also prohibits content posted on a competitor&apos;s business to undermine its
          reputation.
        </p>
        <p>
          If the reviewer is genuinely connected in one of these ways, preserve the factual basis for
          that relationship.
        </p>
        <p>Do not assume somebody is a competitor merely because the review is hostile.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/can-a-competitor-or-ex-employee-leave-a-google-review"
        >
          Read our guide to competitor and ex-employee reviews →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Several reviews can reveal a pattern that one review cannot</h2>
        <p>
          Google&apos;s fake-engagement and rating-manipulation guidance means the wider pattern can be
          relevant, not just one review in isolation.
        </p>
        <div className={styles.compactCard}>
          <h3>Look for</h3>
          <ul>
            {patternChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>A pattern does not automatically prove manipulation.</p>
        <p>A genuine event can also cause several real customers to review a business at the same time.</p>
        <p>Record the pattern and the surrounding facts before drawing a conclusion.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Identical or repeated wording deserves closer scrutiny</h2>
        <p>If several reviews contain identical or unusually similar wording, preserve what you can observe.</p>
        <p>Compare:</p>
        <div className={styles.checkGrid}>
          {repeatedCompare.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not claim that several accounts belong to the same person unless you actually have evidence for that.</p>
        <p>Describe what you can observe.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A sudden cluster is not automatically review bombing</h2>
        <p>
          Several negative reviews appearing together can be alarming, but timing alone does not tell
          you whether the reviews are genuine or manipulated.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>A genuine spike might follow</h3>
            <ul>
              {genuineSpike.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>A manipulated spike might involve</h3>
            <ul>
              {manipulatedSpike.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Investigate what happened before calling the event review bombing.</p>
        <Link className={styles.inlineLink} href="/resources/google-review-bombing">
          Several suspicious reviews at once? Read the review bombing guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not use the reviewer&apos;s Google profile as a shortcut</h2>
        <p>A reviewer&apos;s public profile may provide context, but simple account rules are unreliable.</p>
        <div className={styles.compactCard}>
          <h3>Does not prove</h3>
          <ul>
            {profileDoesNotProve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Google has access to systems and signals that businesses do not.</p>
        <p>
          Keep your own assessment focused on the evidence available for this review and the policy
          issue you can support.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Direct evidence is stronger than suspicion</h2>
        <p>Some cases contain much clearer evidence of a policy issue.</p>
        <p>Examples can include:</p>
        <ul className={styles.proseList}>
          {directEvidenceExamples.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.warning}>
          <h3>Preserve direct evidence carefully</h3>
          <ul>
            {preserveDirect.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          Direct evidence can make the policy issue much clearer than assumptions based only on a star
          rating or unfamiliar username.
        </p>
      </section>

      <ContextualCta
        heading="Have evidence but aren't sure what it actually proves?"
        body="We can review the review itself, the business records you already have and any wider pattern before you decide whether a policy report is justified."
        ctaLabel="Get your review checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create evidence for the sake of a removal case</h2>
        <p>There can be legitimate reasons to contact a real customer about a complaint.</p>
        <p>
          But do not confront somebody purely to provoke a statement that you hope will strengthen a
          removal request.
        </p>
        <p>Do not:</p>
        <ul className={styles.proseList}>
          {doNotManufacture.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If relevant communication already exists, preserve it.</p>
        <p>Use the evidence that actually exists.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What should you do after the assessment?</h2>
        <div className={styles.threeOutcome}>
          {afterOutcomes.map(([heading, paragraphs]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the review appears genuine, treat it as customer feedback</h2>
        <p>
          Sometimes the investigation leads to an uncomfortable but useful answer: the reviewer
          probably did have a genuine experience.
        </p>
        <p>That does not mean everything they wrote is correct.</p>
        <p>It means fake engagement is probably not the strongest policy argument.</p>
        <p>Google allows businesses to reply publicly to reviews.</p>
        <p>A useful response can:</p>
        <ul className={styles.proseList}>
          {usefulResponse.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not use the public response to attack the reviewer or expose private information.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the evidence supports fake engagement, report the policy issue clearly</h2>
        <p>
          If your assessment points strongly towards a non-genuine experience or another policy
          violation, use Google&apos;s review-reporting process.
        </p>
        <p>Focus on what you can establish.</p>
        <p>
          Connect the review to the relevant policy and choose the reporting reason that most closely
          fits the actual issue.
        </p>
        <p>Do not add claims you cannot support simply to make the case sound stronger.</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          See the full review-removal and appeal process →
        </Link>
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
        <h2>What if my suspicious-review situation is different?</h2>
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
        <h2>Before you call a review fake</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If you cannot confidently answer one of these points, investigate that point before making a
          stronger claim to Google.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and Maps policies with
          ProfileRelaunch&apos;s practical evidence-assessment approach. These are the main points that
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
            Suspicion should start the investigation, not finish it. Look at identity, plausibility,
            business records, relationships, wider patterns and any direct evidence before deciding
            what you can responsibly say to Google.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want a second opinion before you report the review?</h2>
        <p>You don&apos;t need to label a suspicious review as fake before asking for help.</p>
        <p>
          Tell us what the review says, what you can verify and whether you have evidence of a wider
          pattern or conflict. We&apos;ll review the situation and help you understand the strongest
          appropriate next step.
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
