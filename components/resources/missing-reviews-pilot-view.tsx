import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleReviewsMissingOrDisappearedSources } from "@/lib/resource-articles/google-reviews-missing-or-disappeared"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const relatedCopy: Record<string, string> = {
  "can-a-google-review-be-removed":
    "How Google's policy-removal process works when the problem is a visible review that may violate its content rules.",
  "fake-google-review-or-genuine-negative-feedback":
    "How to assess reviewer identity, business records and wider patterns before deciding whether a contribution has a defensible fake-engagement basis.",
  "google-business-profile-not-showing-on-google-or-maps":
    "How to diagnose verification, suspension, access, recent edits and ordinary local visibility when the Business Profile itself appears to be missing.",
}

const gbpHelpSources = googleReviewsMissingOrDisappearedSources.filter(
  (source) => source.name === "Google Business Profile Help",
)
const mapsPolicySources = googleReviewsMissingOrDisappearedSources.filter(
  (source) => source.name === "Maps User Contributed Content Policy Help",
)

const causeRoutes = [
  [
    "A new review never appeared",
    "A customer says they recently submitted a review, but the business has never seen it publicly.",
    "Is the review still going through Google's review-policy checks?",
    "Record when it was submitted and allow for ordinary processing before diagnosing permanent removal.",
    "Google says checks can sometimes take a few days. It does not publish a guaranteed deadline.",
  ],
  [
    "An older visible review disappeared",
    "The business has evidence that the review previously appeared.",
    "Was it removed for policy reasons, or could a legitimate review have been caught incorrectly?",
    "Preserve the old evidence and check the relevant Google content-policy position before contacting support.",
    "",
  ],
  [
    "Several reviews vanished after reinstatement",
    "The review count changed around suspension, disablement, appeal or reinstatement.",
    "Is this the reinstatement-related missing-review situation Google specifically acknowledges?",
    "Preserve the reinstatement timeline, review counts and case references and use official Business Profile support.",
    "",
  ],
  [
    "Review count changed after profiles were merged",
    "Two Business Profiles were recently merged and the review total changed.",
    "Are reviews still being combined across the merged profiles?",
    "Preserve both profile details and counts and allow for Google's merge processing before assuming permanent loss.",
    "",
  ],
  [
    "Reviews are on another or older profile",
    "The business moved, another profile was created, ownership changed or review history appears split.",
    "Is this a profile-structure or review-transfer case?",
    "Identify the old and current profiles before asking Google to move eligible reviews.",
    "",
  ],
  [
    "Customers cannot successfully leave reviews",
    "The problem is broader than one disappeared review.",
    "Is there a customer-side submission issue or a broader user-created-content restriction?",
    "Check the actual profile state before treating each missing contribution as an individual policy removal.",
    "",
  ],
] as const

const missingKinds = [
  "One new review that has never appeared",
  "One older review that definitely appeared before",
  "Several reviews disappearing together",
  "A large change in the overall review count",
]

const profileEvents = [
  "Suspension",
  "Disablement",
  "Reinstatement",
  "Profile merge",
  "Business move",
  "New or duplicate profile",
  "Ownership change",
  "Name change",
]

const noDeadlineMeans = ["24 hours", "72 hours", "Five days", "Seven days", "Another fixed deadline"]

const mergeRecords = [
  "Both Business Profiles",
  "Review counts before the merge where genuinely known",
  "Current review count",
  "Merge date",
  "Relevant Google case details",
]

const policyReasons = ["Spam", "Fake engagement", "Inappropriate content", "Other prohibited contributions"]

const noRepost = [
  "Change a few words repeatedly",
  "Repost again and again",
  "Use another account",
  "Change device solely to bypass moderation",
  "Create artificial engagement",
]

const reinstatementAround = ["Suspension", "Disablement", "Appeal", "Reinstatement"]

const reinstatementRecords = [
  "Approximate review count before the restriction",
  "Current review count",
  "Reinstatement date",
  "Business Profile involved",
  "Genuine screenshots",
  "Relevant Google case references",
  "Reviewer names or dates where genuinely known",
]

const duplicateProblems = [
  "Duplicate listings",
  "Split reviews",
  "Ownership confusion",
  "Verification problems",
]

const duplicateTriggers = ["A move", "An ownership change", "Uncertainty about the original profile"]

const providerCan = [
  "Diagnose the likely cause",
  "Organise evidence",
  "Identify merge or reinstatement context",
  "Prepare a clear support case",
  "Explain Google's published policies",
]

const providerCannot = [
  "Control Google's review database",
  "Override moderation",
  "Guarantee review restoration",
]

const inventedEscalations = [
  "A secret escalation",
  "A guaranteed restoration route",
  "A paid workaround",
  "A moderation bypass",
]

const correctAnswers = [
  "Wait for processing",
  "Contact Google support",
  "Request an eligible transfer",
  "Accept a valid policy removal",
  "Gather better evidence before taking action",
]

const outcomes = [
  ["Delayed review appears", "The review was still processing and later becomes visible."],
  ["Merged-profile reviews finish combining", "The review total catches up after profile merge processing."],
  ["Eligible review transfer", "Google resolves an appropriate move or duplicate-profile transfer case."],
  [
    "Possible mistaken removal investigated",
    "Google investigates a legitimate review believed to have been removed incorrectly.",
  ],
  [
    "Policy removal remains removed",
    "Google determines that the removed contribution does not qualify for restoration.",
  ],
] as const

const evidenceGroups = [
  [
    "Profile",
    [
      "Business Profile URL",
      "Business Profile ID where available",
      "Current review count",
    ],
  ],
  [
    "Review",
    [
      "Genuine earlier screenshot",
      "Review notification email",
      "Reviewer display name where known",
      "Approximate posting date",
      "Rating and review text where genuinely recorded",
    ],
  ],
  [
    "Timeline",
    [
      "Suspension date",
      "Reinstatement date",
      "Merge date",
      "Move date",
      "Date review disappeared or failed to appear",
    ],
  ],
  [
    "Google case",
    [
      "Relevant Google case IDs",
      "Old and current profile details where a transfer is involved",
    ],
  ],
] as const

const screenshotContext = ["Review wording", "Reviewer display name", "Date", "Rating", "Timing"]

const mistakes = [
  [
    "Assuming a one-day delay means deletion",
    "Google says policy checks can sometimes take a few days.",
  ],
  [
    "Promising a fixed processing deadline",
    'Google uses "a few days". Do not invent an exact number.',
  ],
  [
    "Assuming every missing review was removed for spam",
    "Delay, merge, reinstatement, profile structure and customer-side issues can also be relevant.",
  ],
  [
    "Promising every legitimate review can be restored",
    "Mistaken removal can be investigated, but restoration remains Google's decision.",
  ],
  [
    "Creating another profile after a move",
    "A duplicate can split review history and complicate recovery.",
  ],
  [
    "Asking customers to repeatedly repost",
    "Do not turn a genuine missing-review case into attempted moderation evasion.",
  ],
  [
    "Buying reviews to replace missing reviews",
    "Fake or incentivised engagement can violate Google's policies.",
  ],
  [
    "Using the review-removal tool for the wrong problem",
    "Removing an inappropriate visible review and investigating a missing genuine review are different processes.",
  ],
  [
    "Inventing the old review count",
    "Use an honest approximate count when exact evidence does not exist.",
  ],
  [
    "Selling guaranteed restoration",
    "A third party can help diagnose and document the case. It cannot force Google's review system to restore content.",
  ],
] as const

const scenarios = [
  [
    "A customer says they posted a review yesterday but we cannot see it",
    [
      "Do not immediately diagnose deletion.",
      "Google says review-policy checks can sometimes delay publication for a few days.",
      "Record when the customer submitted it, their display name where known, and any genuine screenshot they voluntarily provide.",
      "Do not ask them to keep reposting different versions.",
      "Allow for ordinary processing before deciding whether a support investigation is justified.",
    ],
  ],
  [
    "Several old reviews disappeared after our profile was reinstated",
    [
      "This matches a situation Google specifically acknowledges.",
      "Record the reinstatement date, the approximate review count before suspension where genuinely known, the current review count, known missing reviews, screenshots or notification emails, and relevant Google case IDs.",
      "Then contact official Business Profile support about the missing reviews.",
      "Do not promise that every review will be restored.",
    ],
  ],
  [
    "Our review count changed after two Business Profiles were merged",
    [
      "Google says reviews from recently merged profiles may take a few days to display together.",
      "Preserve both profile details.",
      "Record the counts and merge date.",
      "Allow for merge processing.",
      "If reviews remain missing after ordinary processing, use official support with the merge history and genuine evidence.",
    ],
  ],
  [
    "We moved premises and our old reviews are not on the current profile",
    [
      "First determine whether this is the same continuing business.",
      "Identify the old and current Business Profiles.",
      "Google says that when a business moves and keeps the same business name, reviews are generally transferred automatically, although some categories can behave differently.",
      "If an extra profile was unintentionally created and verified, use Google's appropriate review-transfer support process.",
      "Do not create another profile.",
    ],
  ],
  [
    "A review definitely existed but Google no longer shows it",
    [
      "Preserve the genuine screenshot, notification email or other record showing that it previously appeared.",
      "Check whether the contribution may violate Google's content policies.",
      "If it was validly removed for a policy violation, Google says it will not be restored.",
      "If the evidence suggests a legitimate review may have been incorrectly removed by automated spam detection, Google says businesses can contact support for assistance.",
      "That is an investigation route, not a restoration guarantee.",
    ],
  ],
] as const

const readinessChecks = [
  "I have recorded the correct Business Profile URL.",
  "I have recorded the current visible review count.",
  "I have estimated how many reviews appear to be missing.",
  "I know whether one review or several reviews are affected.",
  "I know whether the review never appeared or appeared and later disappeared.",
  "I recorded when the review was submitted or last seen.",
  "I saved genuine screenshots already available.",
  "I saved relevant review notification emails.",
  "I recorded reviewer display names only where genuinely known.",
  "I understand Google says some review checks can take a few days.",
  'I am not treating "a few days" as a guaranteed deadline.',
  "I checked whether Business Profiles were recently merged.",
  "I recorded any recent business move.",
  "I checked whether another Business Profile was created or verified.",
  "I checked whether the profile was recently suspended or disabled.",
  "I recorded the reinstatement date where relevant.",
  "I compared review counts before and after reinstatement only where I genuinely know them.",
  "I checked whether a wider posting restriction may apply.",
  "I checked whether the missing review may violate Google's content policies.",
  "I understand a valid policy removal will not be restored.",
  "I understand a possible mistaken automated removal can be investigated but is not guaranteed to be restored.",
  "I preserved relevant Google case IDs.",
  "For a move or duplicate case, I identified both Business Profiles.",
  "I am not asking customers to repeatedly repost.",
  "I am not asking customers to use extra accounts.",
  "I am not buying or incentivising replacement reviews.",
  "I am not creating a duplicate Business Profile.",
  "I am not manufacturing historic review counts or screenshots.",
  "I am using the Google process that matches the actual problem.",
  "I understand ProfileRelaunch cannot directly restore a Google review.",
  "I understand Google makes the final restoration or transfer decision.",
]

const googlePoints = [
  "Google says there are several reasons reviews may be missing from a Business Profile.",
  "Google checks reviews against its policies.",
  "Those review checks can sometimes delay publication for a few days.",
  "Google does not publish a guaranteed review-processing deadline in this guidance.",
  "Reviews from recently merged Business Profiles may take a few days to display together on Search and Maps.",
  "Reviews removed for policy violations will not be restored.",
  "Google uses automated systems to detect spam and other prohibited contributions.",
  "Google acknowledges automated spam detection can occasionally remove legitimate reviews.",
  "Google says businesses can contact support for assistance with a suspected mistaken removal.",
  "Google says reviews can sometimes be removed after a Business Profile is reinstated and tells businesses to contact support in that situation.",
  "Google provides rules and support processes for moving reviews across eligible Business Profiles.",
  "For a business move with the same business name, Google says reviews are generally transferred automatically, with some category-related exceptions.",
  "An ownership or manager change with the same business name does not automatically erase reviews.",
  "Reviews remain for minor business-name changes.",
  "Some larger business changes may be treated differently.",
  "Google can temporarily restrict user-created content for some profiles or business categories.",
  "Google's ordinary review-removal process is different from investigating a missing genuine review.",
  "Google's Maps policies prohibit fake and manipulated engagement.",
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

export function MissingReviewsPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.missingPage}`}>
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
            When Google reviews disappear, the first instinct is often to ask how to get them back.
            Start one step earlier. A review that has not appeared yet, an older review that
            disappeared, reviews missing after reinstatement and reviews affected by a profile merge
            can all look similar from the business owner&apos;s side.
          </p>
          <p>
            Google uses review-policy checks and automated spam systems, and some review or profile
            changes can take time to process. Google also says reviews removed for valid policy
            violations will not be restored. Identify what changed before you assume either permanent
            deletion or guaranteed restoration.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What happened before the review went missing?</h2>
        <p>
          The pattern usually tells you more than the headline &quot;our reviews disappeared&quot;.
        </p>
        <div className={styles.sixRoute}>
          {causeRoutes.map(([heading, signal, question, next, boundary], index) => (
            <div key={heading}>
              <b className={styles.statusKicker}>Route {index + 1}</b>
              <h3>{heading}</h3>
              <p>
                <strong>Signal.</strong> {signal}
              </p>
              <p>
                <strong>Likely question.</strong> {question}
              </p>
              <p>
                <strong>Next step.</strong> {next}
              </p>
              {boundary ? (
                <p>
                  <strong>Boundary.</strong> {boundary}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Do not promise restoration from the pattern alone</h3>
          <p>The same visible symptom can have different causes.</p>
          <p>Diagnosis comes before escalation.</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether the reviews are delayed, removed or attached to another profile?"
        body="Tell us what disappeared, when it happened and whether the Business Profile was recently reinstated, merged or moved. We can help you classify the case before you open the wrong Google process or promise customers their reviews will return."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>First identify what actually went missing</h2>
        <p>Separate:</p>
        <ul className={styles.proseList}>
          {missingKinds.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Then ask what happened to the Business Profile immediately before the change.</p>
        <p>Check:</p>
        <ul className={styles.proseList}>
          {profileEvents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not describe every situation simply as:</p>
        <p>
          <strong>&quot;Google deleted our reviews.&quot;</strong>
        </p>
        <p>Preserve the timeline first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A delayed review is not the same as a removed review</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Delayed</h3>
            <p>The customer says they submitted the review, but it has not appeared yet.</p>
            <p>
              <strong>Relevant fact.</strong> Google says review-policy checks can sometimes delay a
              review for a few days.
            </p>
          </div>
          <div>
            <h3>Removed</h3>
            <p>
              The review appeared before and later disappeared, or Google removed it under its
              content systems.
            </p>
            <p>
              <strong>Relevant fact.</strong> Now you need to understand whether the disappearance
              relates to policy enforcement, an incorrect automated removal or another profile event.
            </p>
          </div>
        </div>
        <p>Do not diagnose permanent deletion from a few hours of delay.</p>
        <p>
          Do not diagnose ordinary processing when you have evidence an older review previously
          existed.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google does not publish a guaranteed review-processing deadline</h2>
        <p>Google&apos;s existing guidance uses the wording:</p>
        <p>
          <strong>a few days</strong>
        </p>
        <p>for some review checks.</p>
        <p>Do not convert that into:</p>
        <ul className={styles.proseList}>
          {noDeadlineMeans.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A processing delay is possible.</p>
        <p>A guaranteed publication date is not.</p>
        <p>
          If the review remains absent, move through the other possible causes rather than inventing
          a precise timer.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Recently merged Business Profiles can temporarily show incomplete review totals</h2>
        <p>
          Google says reviews from recently merged Business Profiles may take a few days to display
          together on Search and Maps.
        </p>
        <p>If the review count changed around a merge, record:</p>
        <ul className={styles.proseList}>
          {mergeRecords.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not immediately create another profile.</p>
        <p>Do not assume every missing review after a merge has been permanently lost.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reviews removed for policy violations will not be restored</h2>
        <p>Google is explicit that reviews removed because they violate its policies will not be restored.</p>
        <p>Possible policy reasons can include:</p>
        <ul className={styles.proseList}>
          {policyReasons.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Review is valuable to the business</h3>
            <p>does not equal:</p>
          </div>
          <div>
            <h3>Review complies with Google&apos;s content policies</h3>
            <p>The first question is whether the contribution was correctly removed under policy.</p>
          </div>
        </div>
        <p>Do not sell an escalation whose only argument is:</p>
        <p>&quot;We liked this review and want it back.&quot;</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google uses automated systems to detect review spam</h2>
        <p>Google says automated spam detection forms part of its review-moderation system.</p>
        <p>That means:</p>
        <p>not every removed review was necessarily assessed manually by a person.</p>
        <p>It also does NOT mean:</p>
        <p>automation proves that every removed review was genuinely invalid.</p>
        <p>
          Keep policy classification and evidence separate from guesses about how the moderation
          system made the decision.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google acknowledges that legitimate reviews can sometimes be removed by mistake</h2>
        <p>
          Google&apos;s own review guidance acknowledges that automated spam detection can
          occasionally remove legitimate reviews.
        </p>
        <p>Google tells businesses to contact support for assistance if that happens.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Investigation route</h3>
            <p>Google support can investigate a suspected mistaken removal.</p>
          </div>
          <div>
            <h3>Restoration guarantee</h3>
            <p>There is none.</p>
          </div>
        </div>
        <p>Preserve genuine evidence before contacting support.</p>
        <p>Do not promise the outcome.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not try to beat Google&apos;s moderation by reposting variations</h2>
        <p>If a genuine customer review does not appear, do not coach the customer to:</p>
        <ul className={styles.proseList}>
          {noRepost.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>That can turn a legitimate missing-review problem into a manipulation problem.</p>
        <p>Use the proper support route when investigation is justified.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reviews missing after reinstatement have their own diagnostic clue</h2>
        <p>
          Google&apos;s missing-review guidance specifically says reviews can sometimes be removed
          after a Business Profile is reinstated.
        </p>
        <p>Google tells businesses to contact support for assistance in that situation.</p>
        <p>If reviews disappeared around:</p>
        <ul className={styles.proseList}>
          {reinstatementAround.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>preserve that timeline carefully.</p>
        <p>This is different from a single newly submitted review that has never appeared.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Read what to do before a suspension appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Record the review count before and after reinstatement where you genuinely know it</h2>
        <p>Useful records can include:</p>
        <ul className={styles.proseList}>
          {reinstatementRecords.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.warning}>
          <h3>Approximate is better than invented precision</h3>
          <p>If you only know that approximately ten reviews disappeared:</p>
          <p>say approximately ten.</p>
          <p>Do not manufacture an exact historic number.</p>
        </div>
      </section>

      <ContextualCta
        heading="Have missing-review screenshots, counts or reinstatement records but aren't sure what they prove?"
        body="We can help you build the timeline, separate review evidence from profile-history evidence and identify whether the strongest route is waiting, support, review transfer or accepting a valid policy removal."
        ctaLabel="Get your missing-review case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A business move can affect which profile holds the reviews</h2>
        <p>Google has specific rules for moving reviews across Business Profiles.</p>
        <p>
          For a business that moves to a new address while keeping the same business name,
          Google&apos;s existing guidance says reviews are generally transferred automatically.
        </p>
        <p>Google notes that some categories may not transfer automatically.</p>
        <p>Check the actual Business Profile structure before concluding the reviews were deleted.</p>
        <p>Do not promise that every review from every business change will transfer.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create another Business Profile merely because the business moved</h2>
        <p>
          Google&apos;s review-transfer guidance warns against creating a new Business Profile simply
          because of a physical-location or ownership change.
        </p>
        <p>Another profile can create:</p>
        <ul className={styles.proseList}>
          {duplicateProblems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Use the existing legitimate Business Profile and the appropriate move, ownership or support process.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>An accidental duplicate can turn a missing-review problem into a transfer problem</h2>
        <p>Sometimes a business unintentionally creates and verifies another Business Profile after:</p>
        <ul className={styles.proseList}>
          {duplicateTriggers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Google&apos;s existing guidance says qualifying businesses can contact it about transferring
          reviews between the relevant profiles.
        </p>
        <p>Identify both profiles first.</p>
        <p>Do not assume review history automatically belongs to the newest profile.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Not every business change qualifies for every old review to move</h2>
        <p>Google says not all business changes qualify for review movement or removal.</p>
        <p>
          A materially changed business can be treated differently from the same continuing business
          moving address or making a minor update.
        </p>
        <p>Do not promise:</p>
        <p>
          <strong>&quot;All old reviews always follow every rebrand.&quot;</strong>
        </p>
        <p>The relevant question is whether Google treats the profile as the same continuing business.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A change of owner does not automatically erase the review history</h2>
        <p>
          Google says that when a business gets a new owner or manager but keeps the same business
          name, its reviews remain.
        </p>
        <p>Do not tell a buyer:</p>
        <p>
          <strong>&quot;Google deletes the reviews when ownership changes.&quot;</strong>
        </p>
        <p>
          The Business Profile represents the business customers reviewed, not merely the individual
          Google Account managing it.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A minor legitimate business-name change does not automatically erase reviews</h2>
        <p>Google&apos;s existing guidance also says reviews remain for minor business-name changes.</p>
        <p>
          A minor legitimate update is different from transforming an established Business Profile
          into a materially different business.
        </p>
        <p>Do not use an old review history as a shortcut for an unrelated new business.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the customer-side submission is the problem</h2>
        <p>
          Google&apos;s missing-review guidance notes that customers using older phones or software
          may have trouble leaving reviews.
        </p>
        <p>Google recommends using the latest version of the Google Maps app.</p>
        <p>This can matter when:</p>
        <p>the customer believes they completed the review</p>
        <p>but:</p>
        <p>the business never sees it.</p>
        <p>Do not automatically interpret every failed submission as Business Profile enforcement.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Some profiles can temporarily have user-created content restricted</h2>
        <p>
          Google says that in certain situations it may temporarily disable user-created content,
          including reviews, for particular Business Profiles or business categories.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>One review missing</h3>
            <p>May involve that individual contribution.</p>
          </div>
          <div>
            <h3>Reviews broadly unavailable</h3>
            <p>May involve a wider posting restriction or another profile-level state.</p>
          </div>
        </div>
        <p>Check the wider profile situation before diagnosing each review individually.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A missing positive review is not the same problem as a visible review you want removed</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Missing-review case</h3>
            <p>
              <strong>Question.</strong> Why did a genuine review fail to appear or disappear?
            </p>
            <p>
              <strong>Possible route.</strong> Processing, missing-review support, profile history or
              review transfer.
            </p>
          </div>
          <div>
            <h3>Review-removal case</h3>
            <p>
              <strong>Question.</strong> Does a visible review violate Google&apos;s content
              policies?
            </p>
            <p>
              <strong>Possible route.</strong> Report the visible contribution through Google&apos;s
              review-removal process.
            </p>
          </div>
        </div>
        <p>Do not flag an unrelated visible review simply because another review is missing.</p>
        <p>Use the process that matches the problem.</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve evidence before contacting Google</h2>
        <div className={styles.fourGroup}>
          {evidenceGroups.map(([heading, items]) => (
            <div key={heading}>
              <b>{heading}</b>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p>Do not manufacture evidence.</p>
        <p>Do not ask customers for private Google Account credentials.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A screenshot proves history, not entitlement to restoration</h2>
        <p>A genuine screenshot can help show that a review previously appeared.</p>
        <p>It can establish context such as:</p>
        <ul className={styles.proseList}>
          {screenshotContext.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>But it does not prove:</p>
        <p>
          <strong>Google must restore this review.</strong>
        </p>
        <p>
          Google still decides whether the contribution complies with its policies and qualifies to
          remain.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A support case can have several different outcomes</h2>
        <div className={styles.fiveOutcome}>
          {outcomes.map(([heading, meaning], index) => (
            <div key={heading}>
              <b className={styles.statusKicker}>Outcome {index + 1}</b>
              <h3>{heading}</h3>
              <p>{meaning}</p>
            </div>
          ))}
        </div>
        <p>Support is an investigation route.</p>
        <p>Do not sell one specific outcome as guaranteed.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not buy replacement reviews because genuine reviews disappeared</h2>
        <p>Do not respond to a missing-review problem by purchasing or incentivising replacement reviews.</p>
        <p>Google&apos;s Maps policies require reviews to reflect genuine experiences.</p>
        <p>
          Fake or manipulated engagement can create a larger policy problem than the missing reviews
          themselves.
        </p>
        <p>Keep review generation legitimate.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not ask the same customer to keep reposting until one version survives</h2>
        <p>A genuine customer may reasonably want to know why their review is missing.</p>
        <p>Preserve the original details.</p>
        <p>Allow ordinary processing time.</p>
        <p>Then use support where the evidence points to:</p>
        <ul className={styles.proseList}>
          <li>An incorrect removal</li>
          <li>A recognised missing-review case</li>
          <li>A profile-structure issue</li>
        </ul>
        <p>Do not treat moderation as a system to defeat through repeated submissions.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>No independent provider can force reviews back into Google</h2>
        <p>A professional provider can help:</p>
        <ul className={styles.proseList}>
          {providerCan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>It cannot:</p>
        <ul className={styles.proseList}>
          {providerCannot.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not pay for a supposed private switch that forces reviews back into Google.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the correct conclusion is that the review cannot be restored</h2>
        <p>
          If Google validly removed a review for a policy violation, Google&apos;s guidance says the
          review will not be restored.
        </p>
        <p>ProfileRelaunch should not invent:</p>
        <ul className={styles.proseList}>
          {inventedEscalations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Likewise, if there is no evidence that a review ever successfully appeared, do not claim
          you can prove Google deleted it.
        </p>
        <div className={styles.warning}>
          <h3>Diagnosis comes before selling recovery</h3>
          <p>Sometimes the correct answer is:</p>
          <ul>
            {correctAnswers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
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
        <h2>What if my missing-review situation is different?</h2>
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
        <h2>Before opening a missing-review support case</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before promising a customer that the review
          can be restored.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile review and Maps
          content guidance with ProfileRelaunch&apos;s practical missing-review investigation
          approach. These are the main points that come directly from Google&apos;s current
          guidance:
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
            Start with the timeline. Determine whether the review never appeared, disappeared after
            being visible, changed around reinstatement, became separated during a merge or move, or
            may have been removed under policy. Preserve honest evidence and use the Google route
            that matches that cause instead of promising one universal restoration fix.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to help work out why your Google reviews disappeared?</h2>
        <p>
          You don&apos;t need to promise customers that their reviews will come back or create
          another Business Profile just to recover a review count.
        </p>
        <p>
          Tell us what disappeared, when it happened and what changed on the Business Profile around
          the same time. We&apos;ll help you organise the timeline, identify the strongest likely
          cause and understand whether the appropriate next step is waiting, Google support, a
          review-transfer request or accepting a valid policy removal.
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
        <p>Google Business Profile Help</p>
        <ul>
          {gbpHelpSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
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
      </section>

      <section className={`${styles.aboutPilot} ${styles.wide}`}>
        <h2>About this guide</h2>
        <p>
          This guide is based on Google&apos;s publicly available review and Maps content guidance
          and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
