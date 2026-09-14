import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleBusinessProfileNotShowingSources } from "@/lib/resource-articles/google-business-profile-not-showing-on-google-or-maps"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const relatedCopy: Record<string, string> = {
  "google-business-profile-suspended-before-appeal":
    "What to check and correct when Google has actually suspended or disabled the Business Profile.",
  "google-business-profile-verification-stuck-or-rejected":
    "How to diagnose the verification state when Google needs the business to verify or re-verify before normal visibility can return.",
  "lost-access-to-google-business-profile":
    "What to do when customers can still find the Business Profile but the business cannot manage it from the expected Google Account.",
}

const visibilityStates = [
  [
    "Found by exact business name",
    "The profile appears when you search the exact business name or business name plus location.",
    "The public Business Profile exists.",
    'If it is missing only from broad searches such as "plumber near me", investigate local ranking rather than reinstatement.',
  ],
  [
    "Profile is public, but you cannot manage it",
    "Customers can find the Business Profile, but the Google Account you are using has no management controls.",
    "This is primarily an account, ownership or access issue.",
    "Identify the correct managing account or use Google's ownership/access process.",
  ],
  [
    "Google asks for verification",
    "The managing interface says verification is incomplete or required again.",
    "Treat this as a verification state first.",
    "Use the verification options Google provides for that profile.",
  ],
  [
    "Google shows suspension or disablement",
    "The managing Google Account shows a suspension, disabled-profile or policy-restriction notice.",
    "The profile has a recovery/compliance problem.",
    "Correct genuine policy issues and use Google's published appeal process.",
  ],
  [
    "The profile is new or was edited recently",
    "The profile was recently verified or important business information was recently changed.",
    "Current Google timing guidance may be relevant.",
    "Record what changed and when. Do not keep making speculative edits while the current state is being processed.",
  ],
  [
    "Profile is healthy but weak in generic searches",
    "The exact business can be found, verification is complete, there is no restriction and the profile is accurate.",
    "The remaining issue may be ordinary local ranking.",
    "Assess relevance, distance and prominence without inventing a hidden suspension.",
  ],
] as const

const notPublicQuestions = [
  "Verification",
  "Suspension or disablement",
  "Recent profile state",
  "Eligibility",
  "Duplicate or ownership issue",
]

const exactSearchUse = ["Exact business name", "Business name plus town or city", "Google Maps"]

const exactSearchCheck = [
  "Business name",
  "Category",
  "Address or service area",
  "Phone number",
  "Website",
  "Reviews",
]

const restrictionSteps = [
  "Record the exact message.",
  "Review the likely policy or eligibility issue.",
  "Correct genuine profile problems.",
  "Prepare legitimate supporting evidence.",
  "Use Google's published appeal process.",
]

const duplicateProblems = [
  "Duplicate problems",
  "Ownership confusion",
  "More verification work",
  "A harder recovery case",
]

const timingDoesNotMean = [
  "Every new business must wait exactly one month",
  "Every new business will rank after one month",
  "A particular Maps position is guaranteed after one month",
]

const timingDoesNotReplace = [
  "Verification",
  "Suspension recovery",
  "Ownership recovery",
  "Another required Google process",
]

const repeatedFields = [
  "Business name",
  "Address",
  "Category",
  "Service area",
  "Phone number",
  "Website",
]

const relevanceReview = [
  "Primary category",
  "Location",
  "Hours",
  "Services",
  "Other appropriate Business Profile details",
]

const searcherLocations = ["Home", "An office", "Another town", "While travelling"]

const prominenceSignals = [
  "Links to the business",
  "Reviews",
  "Review scores",
  "Other signals Google uses",
]

const rankingFactors = [
  ["Relevance", "Does Google's understanding of the Business Profile match the search?"],
  ["Distance", "How far is the business from the location involved in the search?"],
  [
    "Prominence",
    "How established or well-known does the business appear through Google's signals?",
  ],
] as const

const rankingClaims = [
  '"We can pay Google to put you first."',
  '"We have an internal Google ranking switch."',
  '"Our Google contact guarantees position one."',
  '"This payment unlocks better organic Maps placement."',
]

const completeFields = [
  "Business name",
  "Category",
  "Address or service area",
  "Hours",
  "Phone number",
  "Website",
  "Other relevant Business Profile information",
]

const policyIssues = [
  "Unsupported business-name additions",
  "Ineligible locations",
  "Virtual-office problems",
  "Inaccurate categories",
  "Duplicate profiles",
  "Other policy violations",
]

const duplicateConfusion = [
  "Which profile is current",
  "Which Google Account manages it",
  "Which profile has the reviews",
  "Which listing customers are seeing",
]

const searchVaries = [
  "Searcher's location",
  "Search wording",
  "Device context",
  "Google's ranking systems",
  "Other factors",
]

const suspensionReview = [
  "Eligibility",
  "Business name",
  "Address or service area",
  "Category",
  "Ownership",
  "Other Business Profile information",
]

const accessInvestigate = [
  "Managing Google Account",
  "Primary owner",
  "Other owners",
  "Managers",
  "Former employee access",
  "Former agency access",
]

const healthyIf = [
  "The Business Profile is verified",
  "The profile is public",
  "The business is eligible",
  "No suspension or disablement is shown",
  "The information is accurate",
  "The exact business can be found",
]

const visibilityEvaluate = [
  "Relevance",
  "Distance",
  "Prominence",
  "Overall Business Profile quality",
  "Wider legitimate business presence",
]

const nextActions = [
  ["Verification required", "Complete Google's available verification route."],
  [
    "Suspended or disabled",
    "Correct compliance issues and use the published recovery/appeal process.",
  ],
  ["Public but inaccessible", "Use account or ownership recovery."],
  [
    "Recent accurate edit / new verified profile",
    "Record timing and avoid repeated speculative changes while checking Google's current state.",
  ],
  ["Verified, public and healthy", "Assess local ranking rather than reinstatement."],
] as const

const mistakes = [
  [
    'Assuming "not number one" means "not showing"',
    "A profile can be public and healthy while ranking below other businesses for a generic search.",
  ],
  [
    "Treating verification as a ranking guarantee",
    "Verification and local ranking are separate questions.",
  ],
  [
    "Waiting three days for a suspension to fix itself",
    "The up-to-three-day guidance concerns certain business-information edits, not suspended or disabled profiles.",
  ],
  [
    "Promising a new business will rank after exactly one month",
    "Google's up-to-a-month statement is timing guidance, not a ranking guarantee.",
  ],
  [
    "Creating another Business Profile",
    "A duplicate can create more ownership, verification and visibility problems.",
  ],
  [
    "Keyword-stuffing the name",
    "The Business Profile name should reflect the real-world business identity.",
  ],
  [
    "Changing categories repeatedly",
    "Category affects relevance but is not a guaranteed ranking switch.",
  ],
  [
    "Confusing hidden address with hidden profile",
    "A service-area Business Profile can hide its street address while the profile remains public.",
  ],
  [
    "Confusing lost access with lost visibility",
    "Customers can still see a Business Profile the business cannot currently manage.",
  ],
  [
    "Paying for a guaranteed organic Maps position",
    "Google says there is no way to request or pay for a better organic local ranking.",
  ],
] as const

const scenarios = [
  [
    'Our profile appears for our business name but not "plumber near me"',
    [
      "The Business Profile has not disappeared.",
      "Treat this primarily as a local-ranking issue.",
      "Check accurate profile information, primary category, relevant business details and the location from which the search is being made.",
      "Do not submit a suspension appeal when Google has not suspended the profile.",
      "Do not keyword-stuff the business name to target the generic phrase.",
    ],
  ],
  [
    "Google says the profile needs verification",
    [
      "Treat this as a verification state first.",
      "Complete whichever verification method Google provides.",
      "Do not assume verification request = suspension.",
      "Once verification is complete, check public visibility again.",
      "Remember that verification itself does not guarantee a particular ranking.",
    ],
  ],
  [
    "Google says the Business Profile is suspended",
    [
      "Stop treating this as ordinary ranking.",
      "Review the profile against Google's guidelines.",
      "Correct genuine compliance issues.",
      "Prepare legitimate evidence.",
      "Use Google's suspension appeal process.",
      "Do not create another Business Profile while the recovery case is being handled.",
    ],
  ],
  [
    "Customers can find the profile but we cannot access it",
    [
      "This is primarily an ownership or access problem.",
      "The public profile exists.",
      "Identify which Google Account manages it and review Primary Owner, Owners, Managers, former staff and former agencies.",
      "Recover control of the existing profile rather than creating another one.",
    ],
  ],
  [
    "We verified the Business Profile recently but broad searches still do not show it",
    [
      "Confirm that the profile is genuinely verified and public.",
      "Check that the information is accurate and complete.",
      "Google currently says rankings for new businesses can take up to a month to appear in search results.",
      "Do not interpret that as a promise of strong ranking after one month.",
      "Avoid repeated speculative edits while monitoring the actual profile state.",
    ],
  ],
] as const

const readinessChecks = [
  "I searched the exact business name.",
  "I searched the business name plus town or city.",
  "I checked Google Search.",
  "I checked Google Maps.",
  "I recorded whether a public Business Profile appears.",
  "I checked the Google Account that should manage the profile.",
  'I searched "my business" while signed into the appropriate account.',
  "I know whether management controls are available.",
  "I checked the verification state.",
  "I recorded any verification request.",
  "I recorded any suspension, disablement or restriction message.",
  "I checked whether important information was edited recently.",
  "I recorded the date of the recent edit.",
  "If the business is new, I recorded when the profile was verified.",
  "I understand Google's up-to-three-day edit guidance is not a universal fix deadline.",
  "I understand Google's up-to-a-month new-business ranking guidance is not a ranking promise.",
  "I checked that the business remains eligible.",
  "I checked the real-world business name.",
  "I checked the primary category.",
  "I checked the address or service-area setup.",
  "I checked hours, phone number and website for accuracy.",
  "I checked for duplicate profiles.",
  "I separated public visibility from management access.",
  "I am not treating a hidden service-area address as a hidden profile.",
  "If the exact profile exists, I have separated local ranking from suspension.",
  "I am not making repeated speculative profile edits.",
  "I am not keyword-stuffing the business name.",
  "I am not cycling categories for manual ranking tests.",
  "I understand there is no way to request or pay Google for a better organic local ranking.",
  "If suspended, I will correct genuine policy issues before appealing.",
  "If public but inaccessible, I will use the ownership/access process.",
  "If verified, public and compliant, I will assess visibility rather than buy an unnecessary reinstatement service.",
]

const googlePoints = [
  "An associated Google Account can find Business Profiles it manages through Google Search.",
  "Verified businesses can show their business information on Google Maps and Search.",
  "A Business Profile suspended or disabled for guideline issues will not show to other users until the issue is resolved.",
  "Google provides a published process for resolving suspended or disabled Business Profiles.",
  "Google currently says rankings for new businesses can take up to a month to appear in search results.",
  "Google currently says changes after some Business Profile information edits can take up to three days to appear in search results.",
  "Those timing statements do not guarantee a particular ranking.",
  "Google says local results are mainly based on relevance, distance and prominence.",
  "Relevance describes how well a Business Profile matches what somebody searches for.",
  "Distance affects which businesses may appear for different searchers and locations.",
  "Prominence relates to how well-known a business is and can include signals such as links and reviews.",
  "Complete and accurate business information can help a profile appear in relevant local searches.",
  "Google says there is no way to request or pay for a better organic local ranking.",
  "A Business Profile must still meet Google's eligibility and representation rules.",
  "Business Profile information changes are reviewed for accuracy and compliance.",
  "Duplicate and ownership problems have their own Google processes.",
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
      <Link className={styles.primaryAction} href="/get-help?service=profile-recovery">
        {ctaLabel}
      </Link>
      <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
    </aside>
  )
}

export function ProfileVisibilityPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.visibilityPage}`}>
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
            If you cannot find your Google Business Profile, do not start by assuming Google
            suspended it. A profile can still exist but fail to appear for the broad search you
            tried, need verification, be publicly visible under another managing account, be
            restricted, or be waiting for a recent change to appear.
          </p>
          <p>
            Start with the exact business rather than the ranking you hoped to see. Check the
            business name on Search and Maps, the Google Account that should manage the profile,
            verification, restrictions and recent edits. If the profile is verified, public and
            compliant, the remaining problem may simply be local search visibility.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What does &quot;not showing&quot; actually mean?</h2>
        <p>
          Different Business Profile states can look identical from one search result. Identify the
          state before choosing the fix.
        </p>
        <div className={styles.sixState}>
          {visibilityStates.map(([heading, signal, meaning, next], index) => (
            <div key={heading}>
              <b className={styles.statusKicker}>State {index + 1}</b>
              <h3>{heading}</h3>
              <p>
                <strong>Signal.</strong> {signal}
              </p>
              <p>
                <strong>Meaning.</strong> {meaning}
              </p>
              <p>
                <strong>Next step.</strong> {next}
              </p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>&quot;Not showing&quot; is a symptom</h3>
          <p>
            Do not choose a suspension appeal, verification process, ownership request or ranking
            strategy until you know which profile state you actually have.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure which Business Profile state you're looking at?"
        body="Tell us whether the exact business appears, what the managing Google Account shows and whether there is any verification or restriction message. We can help you separate a recovery problem from an ordinary visibility problem before you make more changes."
        ctaLabel="Start your Profile Recovery assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>First separate &quot;not showing&quot; from &quot;not ranking&quot;</h2>
        <p>These are different problems.</p>
        <p>
          A Business Profile may exist and be publicly visible while still failing to appear for the
          generic phrase the business owner expected.
        </p>
        <p>Example:</p>
        <p>
          <strong>Oakfield Plumbing Leeds</strong>
        </p>
        <p>may show the Business Profile.</p>
        <p>But:</p>
        <p>
          <strong>plumber near me</strong>
        </p>
        <p>may not.</p>
        <p>That does not establish that the Business Profile disappeared.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Profile not publicly available</h3>
            <p>
              <strong>Possible questions:</strong>
            </p>
            <ul>
              {notPublicQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Profile exists but generic search does not show it</h3>
            <p>
              <strong>Primary question:</strong> Local search visibility.
            </p>
          </div>
        </div>
        <p>Find the exact business first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Search the exact business name first</h2>
        <p>Use:</p>
        <ul className={styles.proseList}>
          {exactSearchUse.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If the profile appears, record what is shown.</p>
        <p>Check:</p>
        <ul className={styles.proseList}>
          {exactSearchCheck.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>That establishes that a public Business Profile still exists.</p>
        <p>
          Do not move immediately into suspension recovery when the exact profile is already public.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check Google Search and Google Maps separately</h2>
        <p>Do not rely on one result from one screen.</p>
        <p>Look for the correct business on:</p>
        <p>
          <strong>Google Search</strong>
        </p>
        <p>and:</p>
        <p>
          <strong>Google Maps</strong>
        </p>
        <p>The presentation can differ.</p>
        <p>The objective is not to perform dozens of ranking searches.</p>
        <p>
          The objective is to establish whether Google still has a public Business Profile for the
          business.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sign into the Google Account that should manage the profile</h2>
        <p>Google&apos;s existing guidance says an associated account can search for the business or search:</p>
        <p>
          <strong>my business</strong>
        </p>
        <p>to find Business Profiles it manages.</p>
        <p>Check legitimate Google Accounts historically used by the business.</p>
        <p>
          If one account shows management controls and another does not, the problem may be account
          access rather than public disappearance.
        </p>
        <p>Do not create another profile before checking which account manages the existing one.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Public visibility and management access are separate questions</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Public profile</h3>
            <p>
              <strong>Question.</strong> Can customers find the Business Profile?
            </p>
          </div>
          <div>
            <h3>Management access</h3>
            <p>
              <strong>Question.</strong> Can the business control the Business Profile from an
              authorised Google Account?
            </p>
          </div>
        </div>
        <p>A profile can be:</p>
        <p>
          <strong>PUBLIC + INACCESSIBLE TO THE BUSINESS</strong>
        </p>
        <p>or:</p>
        <p>
          <strong>MANAGEABLE + RESTRICTED FROM PUBLIC DISPLAY.</strong>
        </p>
        <p>Do not use one question as the answer to the other.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/lost-access-to-google-business-profile"
        >
          Read our lost-access and ownership guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check whether Google is asking for verification</h2>
        <p>
          Google&apos;s current guidance says verified businesses can show their business information
          on Maps and Search.
        </p>
        <p>If verification is incomplete, failed or required again:</p>
        <p>treat verification as the current state.</p>
        <p>Check the verification options Google actually provides for that Business Profile.</p>
        <p>Do not promise:</p>
        <ul className={styles.proseList}>
          <li>Video</li>
          <li>Phone</li>
          <li>Email</li>
          <li>Mail</li>
          <li>Any particular verification method</li>
        </ul>
        <p>Google controls the methods available.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Read our verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A verification request is not automatically a suspension</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Verification state</h3>
            <p>
              Google is asking the business to prove it is entitled to manage or represent the
              profile.
            </p>
          </div>
          <div>
            <h3>Suspension / disabled state</h3>
            <p>
              Google has restricted the Business Profile because of a policy or eligibility issue.
            </p>
          </div>
        </div>
        <p>Read the exact Google message.</p>
        <p>Do not submit a suspension appeal merely because verification is incomplete.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check for an actual suspension or disabled-profile notice</h2>
        <p>
          Google&apos;s guidance says a Business Profile suspended or disabled for guideline issues
          will not show to other users until the problem is resolved.
        </p>
        <p>
          Google also says the business receives a notification in the Google Account used to manage
          the profile.
        </p>
        <p>If you see a restriction:</p>
        <ol className={styles.numberedQuestions}>
          {restrictionSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p>
          Once Google confirms suspension or disablement, stop treating the problem as ordinary local
          SEO.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Read what to do before a suspension appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create a replacement profile while dealing with a suspension</h2>
        <p>
          Google&apos;s suspension guidance warns businesses not to create a new Business Profile
          for the same business while an appeal is under review.
        </p>
        <p>A second profile can create:</p>
        <ul className={styles.proseList}>
          {duplicateProblems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Work on the existing legitimate Business Profile.</p>
        <p>Do not use a duplicate as a visibility shortcut.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A new Business Profile may need time before ranking appears</h2>
        <p>
          Google&apos;s current &quot;Find your business on Google&quot; guidance says rankings for
          new businesses can take:
        </p>
        <p>
          <strong>up to a month</strong>
        </p>
        <p>to appear in search results.</p>
        <div className={styles.warning}>
          <h3>This is timing guidance, not a ranking promise</h3>
          <p>It does NOT mean:</p>
          <ul>
            {timingDoesNotMean.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Confirm that the profile is actually verified, accurate and public.</p>
        <p>
          Do not diagnose a brand-new profile as suspended merely because competitive searches do
          not show it immediately.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Recent business-information edits can take time to appear</h2>
        <p>
          Google also says that after business information is edited, changes to search results can
          take:
        </p>
        <p>
          <strong>up to three days</strong>
        </p>
        <p>to appear.</p>
        <p>Again, do not turn that into:</p>
        <p>&quot;Every visibility problem resolves within three days.&quot;</p>
        <p>This guidance concerns updates after edits.</p>
        <p>It does not replace:</p>
        <ul className={styles.proseList}>
          {timingDoesNotReplace.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Record what changed and when.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not keep changing the profile while Google is processing an accurate edit</h2>
        <p>Repeatedly changing:</p>
        <ul className={styles.proseList}>
          {repeatedFields.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>can make the current state harder to understand.</p>
        <p>If you submitted an accurate legitimate change:</p>
        <ul className={styles.proseList}>
          <li>Record it</li>
          <li>Allow the current Google process to progress</li>
          <li>Respond to the actual status Google shows</li>
        </ul>
        <p>
          Do not keep experimenting with alternate versions merely because the search result did not
          change immediately.
        </p>
      </section>

      <ContextualCta
        heading="Profile missing after verification, a recent edit or a status change and you're not sure whether to wait or recover?"
        body="We can review the exact profile state, recent changes and Google messages before you submit another edit, create another profile or use the wrong recovery process."
        ctaLabel="Get your visibility case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the exact profile exists, broad-search visibility may be a ranking question</h2>
        <p>Suppose the business appears for:</p>
        <p>
          <strong>Oakfield Plumbing Leeds</strong>
        </p>
        <p>but not:</p>
        <p>
          <strong>plumber near me</strong>
        </p>
        <p>or:</p>
        <p>
          <strong>emergency plumber</strong>
        </p>
        <p>The Business Profile has not disappeared.</p>
        <p>Google&apos;s current local-ranking guidance says local results are mainly based on:</p>
        <ul className={styles.proseList}>
          <li>Relevance</li>
          <li>Distance</li>
          <li>Prominence</li>
        </ul>
        <p>No single factor guarantees visibility.</p>
        <p>
          There is no published switch that forces a Business Profile into every relevant local
          result.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Relevance is about how well the profile matches the search</h2>
        <p>
          Google describes relevance as how well a Business Profile matches what somebody is
          searching for.
        </p>
        <p>Accurate and useful profile information can help Google understand the business.</p>
        <p>Review relevant information such as:</p>
        <ul className={styles.proseList}>
          {relevanceReview.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Do not manufacture relevance by adding unsupported search phrases to the business name.
        </p>
        <p>Use the profile fields for their intended purpose.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Distance means different searchers can see different results</h2>
        <p>Google says distance is one of the main local-ranking factors.</p>
        <p>The result can therefore vary depending on where the searcher is located.</p>
        <p>A business owner searching from:</p>
        <ul className={styles.proseList}>
          {searcherLocations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>may not see exactly what a nearby customer sees.</p>
        <p>
          One manual search from one device is not absolute proof of what everybody else can find.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Prominence is another part of local visibility</h2>
        <p>Google describes prominence as how well known a business is.</p>
        <p>Its published guidance refers to information such as:</p>
        <ul className={styles.proseList}>
          {prominenceSignals.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not reduce every ranking problem to:</p>
        <ul className={styles.proseList}>
          <li>Business name</li>
          <li>Category</li>
          <li>One recent profile edit</li>
        </ul>
        <p>Local visibility involves more than one factor.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Think about local ranking as three different inputs</h2>
        <div className={styles.threeOutcome}>
          {rankingFactors.map(([heading, body]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>These factors interact.</p>
        <p>
          Do not promise that changing one Business Profile field produces a particular Maps
          position.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>There is no way to request or pay Google for a better organic local ranking</h2>
        <p>Google explicitly says there is no way to request or pay for a better local ranking.</p>
        <p>Be cautious of claims such as:</p>
        <ul className={styles.proseList}>
          {rankingClaims.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Professional local-search work can improve profile quality and wider visibility factors.
        </p>
        <p>It cannot buy privileged control over Google&apos;s organic local-ranking system.</p>
        <p>ProfileRelaunch must not guarantee a Maps position.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Complete and accurate information helps Google understand the business</h2>
        <p>
          Google says businesses with complete and accurate information are more likely to appear in
          relevant local searches.
        </p>
        <p>Review:</p>
        <ul className={styles.proseList}>
          {completeFields.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not interpret:</p>
        <p>
          <strong>complete</strong>
        </p>
        <p>as:</p>
        <p>
          <strong>fill every field with as many keywords as possible.</strong>
        </p>
        <p>Accuracy comes first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check whether the business still qualifies for a Business Profile</h2>
        <p>Not every business is eligible for a Business Profile.</p>
        <p>
          A profile representing an ineligible business has a different problem from a normal ranking
          issue.
        </p>
        <p>
          Check whether the business still satisfies Google&apos;s current Business Profile
          eligibility and representation rules.
        </p>
        <p>
          Do not build a ranking strategy around a profile that should not exist in its current form.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A legitimate business can still have a non-compliant Business Profile</h2>
        <p>Potential profile issues can include:</p>
        <ul className={styles.proseList}>
          {policyIssues.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If Google has actually restricted the Business Profile:</p>
        <p>fix the genuine compliance issue first.</p>
        <p>Do not focus only on ranking while a policy restriction remains unresolved.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A hidden service-area address does not mean the profile disappeared</h2>
        <p>
          A service-area business that does not serve customers at its business address should
          generally hide that address from public display.
        </p>
        <p>
          The Business Profile can still remain public without exposing the underlying home or
          business base.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Address hidden</h3>
            <p>The street address is not publicly displayed.</p>
          </div>
          <div>
            <h3>Profile hidden</h3>
            <p>The Business Profile itself is not publicly available.</p>
          </div>
        </div>
        <p>Those are not the same state.</p>
        <p>Check whether the business name, service area and other public details remain visible.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Duplicate or ownership problems can make the correct profile difficult to identify</h2>
        <p>Sometimes more than one Business Profile exists for the same business.</p>
        <p>That can create confusion about:</p>
        <ul className={styles.proseList}>
          {duplicateConfusion.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Use Google&apos;s duplicate and ownership processes.</p>
        <p>Do not create another Business Profile because the existing situation is confusing.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not diagnose local ranking from one manual search</h2>
        <p>Manual searches provide clues.</p>
        <p>They are not a perfect measurement system.</p>
        <p>Results can vary with factors including:</p>
        <ul className={styles.proseList}>
          {searchVaries.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Check profile health first.</p>
        <p>Only then evaluate visibility more broadly.</p>
        <p>
          Do not repeatedly search your own business and interpret every position change as a new
          technical fault.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not keyword-stuff the business name to force visibility</h2>
        <p>If the real business is:</p>
        <p>
          <strong>Oakfield Plumbing</strong>
        </p>
        <p>do not turn the Google name into:</p>
        <p>
          <strong>Oakfield Plumbing Emergency Plumber Leeds 24 Hour Boiler Repair</strong>
        </p>
        <p>merely because the broad search is not showing the profile.</p>
        <p>
          Google&apos;s Business Profile naming rules are based on the real-world business name.
        </p>
        <p>A visibility problem should not be &quot;fixed&quot; by creating a compliance problem.</p>
        <Link className={styles.inlineLink} href="/resources/google-business-profile-name-rules">
          Read our Business Profile name-rules guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not keep changing category because one search did not show the profile</h2>
        <p>Category contributes to relevance.</p>
        <p>It is not a ranking guarantee.</p>
        <p>Choose the primary category that accurately describes the core business.</p>
        <p>Use additional categories only where they genuinely fit.</p>
        <p>
          Do not cycle through categories merely to see which one produces the most attractive
          manual search result.
        </p>
        <Link className={styles.inlineLink} href="/resources/google-business-profile-categories">
          Read our Business Profile category guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>When Google confirms suspension, switch from ranking analysis to recovery</h2>
        <p>Once Google says the Business Profile is suspended or disabled:</p>
        <p>review the whole profile.</p>
        <p>Check where relevant:</p>
        <ul className={styles.proseList}>
          {suspensionReview.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Correct genuine policy problems.</p>
        <p>Prepare legitimate evidence.</p>
        <p>Use Google&apos;s proper appeal route.</p>
        <p>Ranking work does not reinstate a suspended Business Profile.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>
          When customers can see the profile but the business cannot manage it, switch to access
          recovery
        </h2>
        <p>Investigate:</p>
        <ul className={styles.proseList}>
          {accessInvestigate.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Recover control of the existing legitimate profile.</p>
        <p>Do not create a replacement merely because the correct account is unclear.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A verified, public and compliant profile may simply have a visibility problem</h2>
        <p>If:</p>
        <ul className={styles.proseList}>
          {healthyIf.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>then stop looking for a hidden suspension unless new evidence suggests one.</p>
        <p>The remaining question may be ordinary local ranking.</p>
        <p>Evaluate:</p>
        <ul className={styles.proseList}>
          {visibilityEvaluate.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.warning}>
          <h3>Not every low-ranking Business Profile needs a reinstatement service</h3>
          <p>
            ProfileRelaunch should not sell suspension recovery when Google has not suspended the
            profile.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Match the next action to the actual profile state</h2>
        <div className={styles.nextAction}>
          {nextActions.map(([state, next]) => (
            <div key={state}>
              <div>
                <b>State</b>
                <h3>{state}</h3>
              </div>
              <div>
                <b>Next</b>
                <p>{next}</p>
              </div>
            </div>
          ))}
        </div>
        <p>Do not shop between these routes until one makes the profile visible.</p>
        <p>Use the process that matches the actual state.</p>
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
        <h2>What if my visibility problem looks different?</h2>
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
        <h2>Before trying to fix a Business Profile that is &quot;not showing&quot;</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before making another major profile change.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile visibility,
          verification, ranking and policy guidance with ProfileRelaunch&apos;s practical diagnostic
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
            Diagnose profile state before trying to improve ranking. Find the exact business, check
            the managing account, verification, restrictions and recent changes, and only treat the
            remaining problem as local visibility when the Business Profile is genuinely verified,
            public and compliant.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to identify why the Business Profile is not showing?</h2>
        <p>
          You don&apos;t need to create another profile or guess that Google secretly suspended the
          business.
        </p>
        <p>
          Tell us what appears when you search the exact business name, what the managing Google
          Account shows and whether there are any verification, restriction or recent-edit messages.
          We&apos;ll help you identify whether the next step is verification, access recovery,
          suspension recovery or ordinary visibility work.
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
          {googleBusinessProfileNotShowingSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile visibility,
          verification, local-ranking and policy guidance and was last reviewed on 14 September 2026.
          ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
