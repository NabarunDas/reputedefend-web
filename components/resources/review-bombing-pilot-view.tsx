import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleReviewBombingSources } from "@/lib/resource-articles/google-review-bombing"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const firstResponse = [
  ["Save every review", "Keep the direct link, reviewer name, rating, text, date and a screenshot."],
  ["Build a timeline", "Record when each review appeared and when you first noticed the cluster."],
  [
    "Check what happened offline",
    "Ask whether a real event could explain several genuine customers reviewing the business at once.",
  ],
  [
    "Assess each review separately",
    "Do not assume every contribution in the cluster has the same origin or the same policy issue.",
  ],
  [
    "Record the wider pattern",
    "Compare timing, wording, allegations, relationships and any genuine evidence of coordination.",
  ],
] as const

const policyAreas = [
  "Fake engagement",
  "Rating manipulation",
  "Repetitive content",
  "Conflicts of interest",
  "Off-topic content",
  "Harassment or other prohibited content",
]

const genuineSpike = [
  "A major service failure",
  "An event involving many customers",
  "Delayed deliveries affecting many orders",
  "A public dispute involving real customers",
  "Media or social attention that reaches existing customers",
  "Another real incident affecting several people",
]

const suspiciousSpike = [
  "A campaign asking people with no genuine experience to review the business",
  "Evidence that one person coordinated several accounts",
  "Repeated fabricated allegations",
  "Identical or highly similar wording",
  "Review activity connected to a known conflict",
  "Contributions designed to change the rating rather than describe genuine experiences",
]

const clusterRecord = [
  "Direct review link",
  "Reviewer display name",
  "Star rating",
  "Full review text",
  "Date shown",
  "Screenshot",
  "When you first noticed it",
]

const baselineRecord = [
  "Roughly how often the business normally receives reviews",
  "How many appeared during the suspicious period",
  "How quickly they arrived",
  "Whether they were concentrated around a particular event",
]

const timelinePoints = [
  "Normal review activity",
  "First unusual review appears",
  "Additional reviews begin arriving",
  "External event, social post or dispute occurs, if relevant",
  "Peak review activity",
  "Reviews are reported",
  "Google statuses or other genuinely new activity appear",
]

const levelOne = [
  "Does it appear connected to a genuine experience?",
  "Is the content relevant to this business?",
  "Does a conflict of interest exist?",
  "Is the wording abusive or otherwise prohibited?",
  "Is there another specific Google policy issue?",
  "What reporting reason actually matches this contribution?",
]

const levelTwo = [
  "How quickly did the reviews arrive?",
  "Is wording repeated?",
  "Are the same unusual allegations repeated?",
  "Is there evidence of coordination?",
  "Is there a shared conflict or campaign?",
  "Could one genuine event explain the timing?",
]

const fakeEvidence = [
  "Reviews describing experiences that could not have happened",
  "Communications asking non-customers to review the business",
  "Somebody claiming control of several review accounts",
  "Evidence that contributions were bought or coordinated",
  "Multiple accounts repeating the same fabricated event",
]

const ratingPattern = [
  "A sudden concentration of ratings",
  "Several contributions within a narrow period",
  "Reviews linked to the same coordinated request",
  "Multiple accounts making substantially the same claim",
  "Activity associated with a known conflict",
  "Contributions that appear aimed at changing the rating rather than describing genuine experiences",
]

const wordingCompare = [
  "Sentences",
  "Unusual phrases",
  "Spelling errors",
  "Formatting",
  "Allegations",
  "Calls to action",
  "Descriptions",
]

const conflictPeople = [
  "A competitor",
  "Current employees",
  "Former employees",
  "Contractors",
  "Consultants",
  "Personal relationships",
  "Other professional affiliations",
]

const reportSteps = [
  "Choose the contribution you want to report.",
  "Select the reporting reason that best matches that review.",
  "Keep a record of when you submitted it.",
  "Monitor its status instead of repeatedly creating the same report.",
]

const rmtStatuses = [
  [
    "Decision pending",
    "Google has not yet completed the review.",
  ],
  [
    "Report reviewed - no policy violation",
    "Google evaluated the review and did not find a policy violation.",
  ],
  [
    "Escalated - check your email for updates",
    "The case has been escalated and Google will communicate the outcome.",
  ],
] as const

const appealExplain = [
  "Which policy applies to each selected review",
  "What part of the contribution raises the policy issue",
  "What pattern evidence is genuinely relevant",
  "What factual evidence connects the contributions where appropriate",
]

const protections = [
  [
    "Automated spam detection",
    "Google says it uses automated systems to identify and remove spam contributions.",
    "A business does not control which reviews those systems detect.",
  ],
  [
    "Posting restrictions",
    "Google may temporarily restrict user-generated content for a place when it detects a spike in irrelevant or offensive contributions.",
    "A merchant cannot simply switch this protection on.",
  ],
  [
    "Consumer alerts",
    "Google may display consumer alerts or other protections when it detects suspicious review activity.",
    "The business does not control whether or when those protections appear.",
  ],
] as const

const publicDonts = [
  "Accusations that you cannot prove",
  "Private customer information",
  "Personal information about reviewers",
  "Threats",
  "Insults",
  "Claims that every reviewer is fake before you have evidence",
]

const mistakes: [string, string][] = [
  [
    "Calling every sudden review spike fake",
    "Several genuine customers can review a business after the same real event. Unusual timing is a reason to investigate, not automatic proof of manipulation.",
  ],
  [
    "Treating the cluster as one piece of content",
    "Assess every review individually as well as looking at the wider pattern.",
  ],
  [
    "Ignoring the business's normal review baseline",
    "A spike is easier to explain when you can show how it differs from normal activity.",
  ],
  [
    "Assuming repeated wording proves the same person wrote every review",
    "Record similarities without claiming account ownership you cannot establish.",
  ],
  [
    "Treating every reviewer as a non-customer because the names are unfamiliar",
    "Display names are evidence to investigate, not proof of fake engagement.",
  ],
  [
    "Searching for a secret review-bombing removal route",
    "Google's published process remains policy-based review reporting and the available appeal process.",
  ],
  [
    "Expecting Google to activate a review freeze on request",
    "Google controls whether and when posting restrictions are applied.",
  ],
  [
    "Reporting reviewer profiles simply because the reviews are negative",
    "A profile report needs its own genuine policy basis.",
  ],
  [
    "Using the extortion form when nobody demanded anything",
    "The dedicated extortion route is for a direct demand tied to review removal.",
  ],
  [
    "Publicly accusing the entire cluster of being fake",
    "Keep public responses professional and keep unsupported accusations out of them.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "Ten one-star reviews arrived within an hour",
    [
      "Record the timing and compare it with the business's normal review activity.",
      "Then check whether a real incident could reasonably have caused several genuine customers to post at the same time.",
      "Assess the reviews individually.",
      "Look for repeated wording, impossible experiences, conflicts of interest or genuine evidence of coordination.",
      "The timing is important context, but it is not proof on its own.",
    ],
  ],
  [
    "A viral post told people to leave us one-star reviews",
    [
      "Preserve the public post where lawful and appropriate.",
      "Then assess the reviews individually.",
      "People with no genuine experience may raise fake-engagement, off-topic or rating-manipulation concerns.",
      "Real customers who saw the same post may still choose to leave genuine reviews.",
      "Do not assume every contribution has the same origin.",
    ],
  ],
  [
    "Several reviews use almost identical wording",
    [
      "Save the review links and screenshots.",
      "Compare the exact phrases, formatting, allegations, timing and ratings.",
      "Identical or highly similar wording can strengthen pattern evidence.",
      "Do not claim that all accounts belong to one person unless you genuinely have evidence for that.",
    ],
  ],
  [
    "One reviewer profile appears to be posting abusive content repeatedly",
    [
      "Report individual policy-violating reviews where appropriate.",
      "If the user profile itself is being used for false information, offensive content or another contribution-policy violation, Google also provides a separate profile-reporting route.",
      "Do not report the profile merely because you dislike the rating.",
    ],
  ],
  [
    "The review attack was followed by a demand for money",
    [
      "Preserve the demand, contact details, messages and connected review links.",
      "That part of the incident may fit Google's separate negative-review extortion process.",
      "Do not replace the normal review-policy assessment with the extortion report.",
      "Treat the review content and the direct demand as related but distinct issues.",
    ],
  ],
]

const readinessChecks = [
  "I have saved each review separately.",
  "I have direct links and screenshots.",
  "I have built a timeline.",
  "I know roughly what normal review activity looks like for this business.",
  "I have checked whether a real event could explain the spike.",
  "I have assessed each review individually.",
  "I have separated individual policy issues from wider pattern evidence.",
  "I have recorded repeated wording without overstating what it proves.",
  "I have preserved any genuine conflict-of-interest evidence.",
  "I know which reviews actually have a defensible policy basis.",
  "I am not searching for an undocumented bulk-removal route.",
  "I know whether any reviewer-profile report has its own policy basis.",
  "I understand Google controls spam detection, posting restrictions and consumer alerts.",
  "If a direct demand appeared, I have separated the extortion evidence.",
  "I am not publicly accusing reviewers without evidence.",
]

const googlePoints = [
  "Google's Maps policies say contributions should reflect genuine experiences.",
  "Google's fake-engagement rules cover non-genuine contributions and forms of rating manipulation.",
  "Google's policy refers to unusual volumes or patterns where they indicate attempts to manipulate a place's rating.",
  "Repetitive content and certain conflicts of interest can raise policy issues.",
  "Businesses can report individual policy-violating reviews through Google's review-removal process.",
  "Reported reviews can be monitored through the Reviews Management Tool.",
  "If Google finds no policy violation, a one-time appeal is currently available for eligible reviews.",
  "Up to 10 eligible reviews can currently be selected in that appeal.",
  "Google provides a separate process for reporting inappropriate user profiles.",
  "Google uses automated systems to detect spam.",
  "Google may apply posting restrictions when it detects harmful contribution activity.",
  "Google may display consumer alerts or other protections when it detects suspicious review activity.",
  "Google controls those protective measures.",
  "A direct demand for money, goods, services or favours tied to review removal uses Google's separate extortion process.",
]

const relatedCopy: Record<string, string> = {
  "google-review-extortion":
    "What to preserve and how to use Google's dedicated route if suspicious review activity is followed by a demand for money, goods, services or favours.",
  "fake-google-review-or-genuine-negative-feedback":
    "How to assess suspicious individual reviews without treating an unfamiliar reviewer or sudden negative feedback as automatic proof of fake engagement.",
}

const SOURCE_GROUP_ORDER = [
  "Maps User Contributed Content Policy Help",
  "Google Business Profile Help",
  "Maps User Generated Content Policy Help",
]

const sourceGroups = SOURCE_GROUP_ORDER.map((label) => ({
  label,
  sources: googleReviewBombingSources.filter((source) => source.name === label),
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

export function ReviewBombingPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.clusterPage}`}>
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
            Several one-star reviews arriving in a short period can look like a coordinated attack.
            Sometimes they are. Sometimes a real event has caused several genuine customers to leave
            negative feedback at roughly the same time.
          </p>
          <p>
            The number of reviews alone does not tell you which situation you have. Preserve the
            cluster first, then assess both levels of the case: each individual review and the wider
            pattern connecting them.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If suspicious reviews are arriving now, do these five things first</h2>
        <div className={styles.process}>
          {firstResponse.map(([title, body], index) => (
            <div className={styles.processStep} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>The pattern is evidence, not the verdict</h3>
          <p>Unusual timing is worth investigating.</p>
          <p>It does not automatically prove fake engagement, rating manipulation or coordination.</p>
          <p>Do not publicly accuse reviewers simply because several reviews arrived together.</p>
        </div>
      </section>

      <ContextualCta
        heading="Several suspicious reviews arrived together and you're not sure what you're looking at?"
        body="Tell us what appeared, how quickly the reviews arrived and what you can verify about the surrounding event. We can help you assess the cluster without assuming every review is fake."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;Review bombing&quot; describes a pattern, not a Google status</h2>
        <p>
          Businesses often use the term review bombing when many negative or suspicious reviews arrive
          together.
        </p>
        <p>Google&apos;s published policies focus on the behaviour underneath that label.</p>
        <p>Relevant policy areas can include:</p>
        <div className={styles.checkGrid}>
          {policyAreas.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not spend the case trying to prove that the phrase &quot;review bombing&quot; applies.</p>
        <p>
          Identify which actual Google policies, if any, the individual reviews and wider pattern may
          violate.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A sudden spike tells you to investigate — it does not prove manipulation</h2>
        <p>A review volume that is highly unusual for the business can be useful context.</p>
        <p>But first ask what happened around the same time.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>A genuine spike could follow</h3>
            <ul>
              {genuineSpike.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>A suspicious or manipulated spike may involve</h3>
            <ul>
              {suspiciousSpike.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Several genuine customers can independently review the same real incident.</p>
        <p>Several non-customers can also participate in a coordinated rating attack.</p>
        <p>The spike itself cannot tell you which occurred.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve the whole cluster before analysing it</h2>
        <p>Do not investigate from memory.</p>
        <p>For every review in the suspicious period, record:</p>
        <div className={styles.checkGrid}>
          {clusterRecord.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Keep each review as a separate entry.</p>
        <p>Do not merge ten different reviews into one evidence record.</p>
        <p>This gives you:</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Individual evidence</h3>
            <p>What each review actually says and whether that contribution raises a policy issue.</p>
          </div>
          <div>
            <h3>Pattern evidence</h3>
            <p>
              What the timing, similarities and surrounding circumstances show when the reviews are
              viewed together.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Record what is normal before calling the volume unusual</h2>
        <p>
          A suspicious pattern is easier to explain when you have basic context for what the business
          normally receives.
        </p>
        <p>You do not need a complex statistical model.</p>
        <p>Record:</p>
        <ul className={styles.proseList}>
          {baselineRecord.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not invent a precise historical average if you have not calculated one.</p>
        <p>Use facts you can actually establish.</p>
        <p>The purpose is to explain why the activity stood out.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Put the cluster on one timeline</h2>
        <ol className={styles.clusterTimeline}>
          {timelinePoints.map((item, index) => (
            <li key={item}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <p>Use actual dates and times where available.</p>
        <p>Do not invent timestamps.</p>
        <p>
          If several reviews appeared within the same approximate period and you do not know the
          precise order, record that honestly.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Assess the reviews at two levels</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Level 1 — Each individual review</h3>
            <p>Ask:</p>
            <ul>
              {levelOne.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Level 2 — The wider pattern</h3>
            <p>Ask:</p>
            <ul>
              {levelTwo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>A suspicious cluster can contain a mixture of genuine reviews and policy-violating reviews.</p>
        <p>Do not treat the entire group as one identical contribution.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Fake engagement may be part of the case</h2>
        <p>Google&apos;s Maps policies say contributions should reflect genuine experiences.</p>
        <p>
          Fake engagement can be relevant where reviews are not based on a real experience or where
          content is posted from multiple accounts by or at the request of one person.
        </p>
        <p>Look for genuine evidence such as:</p>
        <ul className={styles.proseList}>
          {fakeEvidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not rely only on unfamiliar reviewer names.</p>
        <p>An unknown display name is a clue, not proof.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/fake-google-review-or-genuine-negative-feedback"
        >
          Read the fake-review vs genuine-feedback assessment guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Unusual volume can matter when it points to rating manipulation</h2>
        <p>
          Google&apos;s current fake-engagement guidance refers to unusual volumes or patterns of
          contributions that indicate attempts to manipulate a place&apos;s rating.
        </p>
        <p>Useful pattern evidence can include:</p>
        <div className={styles.compactCard}>
          <ul>
            {ratingPattern.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Do not translate:</p>
        <p>&quot;unusual&quot;</p>
        <p>into:</p>
        <p>&quot;automatically prohibited.&quot;</p>
        <p>The pattern needs to support the policy issue you are reporting.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Repeated wording can strengthen the pattern evidence</h2>
        <p>If several reviews contain identical or unusually similar content, preserve the similarity.</p>
        <p>Compare:</p>
        <div className={styles.checkGrid}>
          {wordingCompare.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          Do not claim that two accounts belong to the same person simply because their reviews sound
          similar.
        </p>
        <p>Describe what you can observe.</p>
        <p>If wording is identical, preserve that exact evidence.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A viral campaign can produce genuine reviews, fake reviews or both</h2>
        <p>Social-media attention can make a cluster harder to classify.</p>
        <p>
          A public post encouraging people to give a business one star may lead people with no genuine
          experience to contribute ratings.
        </p>
        <p>That can raise fake-engagement, off-topic or rating-manipulation concerns.</p>
        <p>
          But the same event may also reach real customers who independently decide to describe genuine
          experiences.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Review from somebody with a genuine experience</h3>
            <p>Assess the review on its own content and applicable policies.</p>
          </div>
          <div>
            <h3>Review from somebody reacting to the campaign without a genuine experience</h3>
            <p>Fake engagement, off-topic content or rating manipulation may be relevant.</p>
          </div>
        </div>
        <p>Preserve the public campaign where lawful and appropriate.</p>
        <p>Do not assume every review arriving after the post has the same origin.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Off-topic political or social commentary can be a separate issue</h2>
        <p>Google&apos;s Maps policies require contributions to be relevant to the place or business.</p>
        <p>
          A person reacting to an online controversy without describing a genuine experience may raise
          an off-topic issue as well as a possible fake-engagement issue.
        </p>
        <p>Choose the reporting reason that best matches the actual content.</p>
        <p>Do not reduce every contribution in the cluster to &quot;fake review.&quot;</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check for genuine conflicts of interest</h2>
        <p>A suspicious cluster may involve people connected to:</p>
        <div className={styles.checkGrid}>
          {conflictPeople.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Google&apos;s rating-manipulation guidance includes conflict-of-interest concerns.</p>
        <p>If such a relationship genuinely exists, preserve the evidence.</p>
        <p>
          Do not accuse every hostile reviewer of being a competitor because several reviews arrived
          together.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/can-a-competitor-or-ex-employee-leave-a-google-review"
        >
          Read the competitor and ex-employee review guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Personal attacks should be classified separately</h2>
        <p>
          Some coordinated campaigns focus on attacking an owner or member of staff rather than
          reviewing a business experience.
        </p>
        <p>
          If a review contains harassment, threats, doxxing, targeted abuse or another prohibited
          category, preserve the exact text and report the policy issue that actually appears.
        </p>
        <p>One review can raise more than one concern.</p>
        <p>Do not describe everything simply as fake engagement.</p>
      </section>

      <ContextualCta
        heading="Have a review cluster documented but aren't sure which policies apply?"
        body="We can review the individual contributions and the wider pattern before you decide what to report or appeal."
        ctaLabel="Get your review cluster checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Report policy-violating reviews through Google&apos;s normal review process</h2>
        <p>Google tells businesses to report reviews that violate its policies.</p>
        <p>Use the Business Profile or Reviews Management Tool.</p>
        <p>For each review:</p>
        <ol className={styles.numberedQuestions}>
          {reportSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <div className={styles.statusBoard}>
          {rmtStatuses.map(([title, meaning]) => (
            <div className={styles.statusRow} key={title}>
              <strong className={styles.statusName}>{title}</strong>
              <div className={styles.statusMeta}>
                <span className={styles.statusKicker}>Meaning</span>
                <p>{meaning}</p>
              </div>
            </div>
          ))}
        </div>
        <p>
          Do not repeatedly flag the same review merely because other reviews in the cluster also look
          suspicious.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>There is no published merchant &quot;review bombing&quot; shortcut</h2>
        <div className={styles.warning}>
          <p>
            Google&apos;s published merchant guidance does not provide a special bulk-removal button
            simply because several suspicious reviews arrived together.
          </p>
          <p>The coordinated pattern can be useful context.</p>
          <p>
            But individual contributions still need to be assessed against Google&apos;s content
            policies and handled through the published review process.
          </p>
        </div>
        <p>Do not promise:</p>
        <ul className={styles.proseList}>
          <li>a secret escalation</li>
          <li>an internal bulk-removal channel</li>
          <li>guaranteed removal of the whole cluster</li>
        </ul>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use the one-time appeal where the policy case supports it</h2>
        <p>
          If Google evaluates a reported review and finds no policy violation, its current process
          provides a one-time appeal for eligible reviews.
        </p>
        <p>
          Google&apos;s Reviews Management Tool currently allows up to 10 eligible reviews to be
          selected in that appeal.
        </p>
        <p>That can be useful where several eligible reported reviews belong to the same suspicious event.</p>
        <p>Use the appeal to explain:</p>
        <ul className={styles.proseList}>
          {appealExplain.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not appeal simply because the cluster lowered the business&apos;s rating.</p>
        <p>The policy case still matters.</p>
        <Link className={styles.inlineLink} href="/resources/google-rejected-my-review-report">
          Read what to do when Google rejects a review report →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reporting a reviewer profile is a separate action</h2>
        <p>
          Google also provides a route for reporting user profiles that contribute policy-violating
          content.
        </p>
        <p>That is different from reporting an individual review.</p>
        <p>
          A profile report may be relevant where the user profile itself is being used for false
          information, offensive content or other policy violations.
        </p>
        <p>Do not report a profile simply because you dislike the person&apos;s rating or review.</p>
        <p>Use the profile-reporting route only when there is a genuine profile or contribution-policy issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google may apply protections that businesses cannot switch on themselves</h2>
        <div className={styles.threeOutcome}>
          {protections.map(([heading, first, second]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              <p>{first}</p>
              <p>{second}</p>
            </div>
          ))}
        </div>
        <p>
          Do not interpret the absence of a posting restriction or consumer alert as proof that the
          review activity is legitimate.
        </p>
        <p>
          Do not promise customers that reporting a cluster will automatically trigger these
          protections.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If somebody demands money or favours, separate the extortion case</h2>
        <p>A coordinated review incident and review extortion can overlap.</p>
        <p>
          If somebody later demands money, goods, services or favours in exchange for removing,
          stopping or controlling the reviews, preserve that demand separately.
        </p>
        <p>Use Google&apos;s dedicated extortion process for the demand.</p>
        <p>Do not use the extortion route merely because the reviews look malicious.</p>
        <p>The direct demand is what distinguishes that process.</p>
        <Link className={styles.inlineLink} href="/resources/google-review-extortion">
          Read the Google review extortion guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not publicly fight the whole cluster</h2>
        <p>
          When several negative reviews appear together, replying to all of them in anger can amplify
          the incident.
        </p>
        <p>Do not publish:</p>
        <ul className={styles.proseList}>
          {publicDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If a review appears genuine and a response is appropriate, keep it professional.</p>
        <p>
          If a review is being assessed as part of a suspicious cluster, preserve the evidence before
          changing your response strategy.
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
        <h2>What if my review cluster looks different?</h2>
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
        <h2>Before reporting the cluster</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, deal with it before submitting the next report or appeal.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and Maps policies with
          ProfileRelaunch&apos;s practical incident-assessment advice. These are the main points that
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
            Treat the cluster as an incident to document, not a verdict. Preserve every review,
            establish the timeline, assess each contribution on its own policy basis and then use the
            wider pattern only where it genuinely adds evidence.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want a second pair of eyes on the review cluster?</h2>
        <p>You don&apos;t need to decide that every review is fake before asking for help.</p>
        <p>
          Tell us what appeared, how quickly the reviews arrived and what pattern or supporting
          evidence you can see. We&apos;ll review the individual contributions and the wider incident
          and help you understand the strongest appropriate next step.
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
          This guide is based on Google&apos;s publicly available review and Maps content guidance and
          was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
