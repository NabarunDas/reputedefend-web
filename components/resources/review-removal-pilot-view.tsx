import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { canAGoogleReviewBeRemovedSources } from "@/lib/resource-articles/can-a-google-review-be-removed"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const decisionRoutes = [
  [
    "Genuine negative feedback",
    "The reviewer appears to be describing a real experience and the content does not clearly violate Google's policies.",
    "The review may remain live. Consider a professional response rather than forcing a removal case.",
  ],
  [
    "Possible policy violation",
    "The review may involve fake engagement, manipulation, a conflict of interest, off-topic content, prohibited attacks, personal information or another Google policy issue.",
    "Identify the strongest relevant policy and report the review through Google's review-removal process.",
  ],
  [
    "Google found no policy violation",
    "You already reported the review and Google's Reviews Management Tool shows that it did not find a policy violation.",
    "If the review is eligible and you have a defensible policy basis, Google's current process provides a one-time appeal.",
  ],
  [
    "Extortion or a legal issue",
    "The problem is not an ordinary review-policy dispute.",
    "Use Google's dedicated extortion route or the appropriate legal-removal process instead.",
  ],
] as const

const mayRemainLive = [
  "A low star rating",
  "Harsh criticism",
  "A customer describing a poor experience",
  "A disagreement about how a complaint was handled",
  "Negative feedback the business believes is unfair",
]

const mayNeedPolicy = [
  "Fake or manipulated engagement",
  "Paid or incentivised reviews",
  "Conflicts of interest",
  "Off-topic content",
  "Certain abusive or prohibited attacks",
  "Personal or confidential information",
  "Advertising or solicitation",
  "Other content prohibited by Google's Maps policies",
]

const policyMap: [string, string[]][] = [
  [
    "Fake engagement",
    [
      "Google says contributions should reflect a genuine experience with the business.",
      "A fabricated review or other content that does not represent a genuine experience may fall under fake engagement.",
    ],
  ],
  [
    "Paid or manipulated reviews",
    [
      "Google prohibits reviews and ratings posted because of incentives such as payment, discounts or free goods or services.",
      "It also prohibits offering incentives specifically for changing or removing negative reviews.",
    ],
  ],
  [
    "Conflicts of interest",
    [
      "Google's policy can apply to relationships such as current or former employment, contractual or consultancy relationships and other professional or personal affiliations that create a conflict.",
      "Google also prohibits content posted on a competitor's business to undermine its reputation.",
    ],
  ],
  [
    "Off-topic content",
    [
      "Reviews should relate to an experience with the specific business or location.",
      "General political commentary, social commentary or unrelated personal rants may fall outside that purpose.",
    ],
  ],
  [
    "Personal attacks or prohibited offensive content",
    [
      "Strong criticism is not automatically harassment.",
      "A targeted abusive attack or certain prohibited allegations may raise a different policy issue.",
    ],
  ],
  [
    "Personal information",
    [
      "A review that exposes protected personal information can raise a privacy issue even if the underlying experience was genuine.",
    ],
  ],
  [
    "Advertising or solicitation",
    [
      "Reviews should not be used as advertising, lead generation, promotional pitches or solicitation.",
    ],
  ],
]

const unfamiliarReasons = [
  "use a different Google display name",
  "have visited with another person",
  "have been a passenger, guest or family member",
  "have used different contact details",
  "have interacted without creating the type of customer record you expected",
  "be describing an experience connected with somebody else in their party",
]

const reviewChecks = [
  "Date",
  "Service or product described",
  "Location",
  "Staff references",
  "Timing",
  "Specific events",
  "Any factual detail you can legitimately verify",
]

const preserveItems = [
  "Direct review link",
  "Reviewer display name",
  "Star rating",
  "Review text",
  "Date shown",
  "Relevant screenshots",
  "The policy you believe applies",
  "Why you believe it applies",
  "Genuine supporting evidence",
  "Date you submitted the report",
]

const reportSteps = [
  ["Identify the policy issue", "Know why you believe the review violates Google's rules."],
  ["Report the review", "Use Google's review-removal process and choose the most accurate reporting reason."],
  ["Record the submission", "Save when you reported it and monitor the Reviews Management Tool."],
] as const

const rmtStatuses = [
  [
    "Decision pending",
    "The review has been reported but Google has not yet finished evaluating it.",
    "Wait for the decision and keep the existing case record.",
  ],
  [
    "Report reviewed - no policy violation",
    "Google evaluated the review and did not find a policy violation.",
    "If you disagree and the review is eligible, consider the one-time appeal.",
  ],
  [
    "Escalated - check your email for updates",
    "The appeal has been escalated.",
    "Watch for Google's final result by email.",
  ],
] as const

const appealQuestions = [
  "Which policy applies?",
  "What part of the review violates that policy?",
  "What genuine information supports your assessment?",
]

const extortionActions = [
  "not engage with or pay the malicious person",
  "not offer money or services to resolve the demand",
  "gather evidence immediately",
  "preserve communications and review links",
  "use Google's dedicated extortion-reporting form",
]

const mistakes: [string, string][] = [
  [
    "Treating every one-star review as removable",
    "Google permits genuine negative reviews. The rating itself is not a policy violation.",
  ],
  [
    'Assuming "not in our database" proves fake engagement',
    "An unfamiliar display name can be useful context, but it does not prove that no genuine experience occurred.",
  ],
  [
    "Reporting before reading the policy",
    "The report is clearer when the reason selected, review content and supporting facts point to the same policy issue.",
  ],
  [
    "Calling ordinary criticism harassment",
    "Strong criticism and a policy-violating personal attack are not the same thing.",
  ],
  [
    "Ignoring a real conflict of interest",
    "If a genuine employment, professional or competitor relationship exists, explain the relationship accurately.",
  ],
  [
    "Re-reporting instead of checking the status",
    "Use the Reviews Management Tool to see whether Google is still reviewing the case or has made a decision.",
  ],
  [
    'Using the one-time appeal only to say "this is unfair"',
    "The appeal should focus on the specific policy issue and supporting facts.",
  ],
  [
    "Promising that an appeal will remove the review",
    "Google makes the final policy decision. A compliant review can remain live.",
  ],
  [
    "Treating extortion as an ordinary review complaint",
    "Google has a separate process when somebody demands money or favours for review removal.",
  ],
  [
    "Treating a legal dispute as an ordinary policy flag",
    "Google separates its Maps content policies from legal-removal requests.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "I cannot find the reviewer in my customer records",
    [
      "Do not jump directly from an unfamiliar display name to the conclusion that the review is fake.",
      "Check the date, service, location, staff references and other details in the review.",
      "Consider whether the reviewer could have used another name or been connected with somebody else who interacted with the business.",
      "If the facts genuinely indicate that no real experience occurred, fake engagement may be the relevant Google policy.",
      "If all you know is that the name is unfamiliar, do not claim more than the evidence supports.",
    ],
  ],
  [
    "The customer is real, but everything they wrote is wrong",
    [
      "Separate opinion from facts.",
      "A customer may describe a negative experience and remember or interpret events differently from the business.",
      "Google restricts misleading content, but it also says it does not get involved in ordinary business-customer disputes.",
      "Identify whether there is a specific policy issue that goes beyond disagreement.",
      "If there is no defensible policy violation, the review may remain live.",
    ],
  ],
  [
    "The review came from a former employee or competitor",
    [
      "Google's conflict-of-interest policy can include current or former employment and other professional or personal affiliations.",
      "It also prohibits content posted on a competitor's business to undermine its reputation.",
      "Preserve genuine evidence of the relationship and explain exactly why it creates a conflict.",
      "Do not exaggerate the relationship.",
    ],
  ],
  [
    "The reviewer wants money to delete the review",
    [
      "Do not pay them.",
      "Preserve the review links, messages, screenshots, dates, contact details and the actual demand.",
      "Use Google's dedicated negative-review extortion process rather than the ordinary review-reporting route.",
    ],
  ],
  [
    "The review contains personal information or potentially unlawful statements",
    [
      "Work out which issue you are actually dealing with.",
      "Google has privacy policies covering certain personal information and a separate legal-removal route for content somebody believes violates local law.",
      "Those are different from a normal complaint that a review is negative or inaccurate.",
      "Use the route that matches the issue.",
      "Where legal rights are genuinely in question, independent legal advice may be appropriate.",
    ],
  ],
]

const readinessChecks = [
  "I have saved the review link, text, rating, reviewer name and date.",
  "I have separated ordinary negative feedback from a possible policy violation.",
  "I have read the relevant Google policy.",
  "I can identify the strongest policy category that may apply.",
  "I am not claiming a reviewer is fake only because the display name is unfamiliar.",
  "I have preserved genuine supporting evidence without altering it.",
  "The reporting reason matches the content I am reporting.",
  "I have checked whether the review has already been reported.",
  "If Google found no policy violation, I know whether the review is eligible for the one-time appeal.",
  "I am using a separate route if the case involves extortion.",
  "I understand that a legal-removal claim is different from an ordinary Google policy report.",
  "I understand that Google, not ProfileRelaunch, makes the final removal decision.",
]

const googlePoints = [
  "Businesses can report reviews, but only reviews that violate Google's policies are eligible for policy-based removal.",
  "Google says not to report a review merely because you disagree with it or dislike it.",
  "Google's Maps policies require contributions to reflect genuine experiences and prohibit fake engagement.",
  "Google's policies prohibit paid or incentivised review manipulation.",
  "Google's policies include conflict-of-interest rules and prohibit content posted to undermine a competitor.",
  "Google's content policies also cover off-topic content, certain offensive content, personal information, advertising and solicitation.",
  "The Reviews Management Tool can show that a decision is pending or that Google found no policy violation.",
  "If Google finds no policy violation, eligible reviews can currently be included in a one-time appeal.",
  "Google currently allows up to 10 eligible reviews to be selected for that appeal.",
  "If Google decides the review violates policy, it removes the review.",
  "If Google decides the review complies with policy, the review remains live.",
  "Google provides a separate route for negative-review extortion.",
  "Google provides a separate process for content believed to violate local law.",
]

const relatedCopy: Record<string, string> = {
  "fake-google-review-or-genuine-negative-feedback":
    "How to assess a suspicious review without treating every unfamiliar or critical reviewer as fake.",
  "google-rejected-my-review-report":
    "What to check when Google finds no policy violation and how the one-time review appeal works.",
  "google-reviews-missing-or-disappeared":
    "How to tell whether reviews are delayed, policy-removed, affected by a profile change or genuinely missing.",
}

const businessProfileSources = canAGoogleReviewBeRemovedSources.filter(
  (source) => source.name === "Google Business Profile Help",
)
const mapsPolicySources = canAGoogleReviewBeRemovedSources.filter(
  (source) => source.name === "Maps User Contributed Content Policy Help",
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

export function ReviewRemovalPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.reviewPage}`}>
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
            Yes, Google can remove a review, but not simply because it is negative, damaging or
            something the business disagrees with. For Google&apos;s normal review-removal process,
            the question is whether the content violates one of its policies.
          </p>
          <p>
            A genuine one-star review can stay live. A fake, manipulated, conflicted, off-topic or
            otherwise prohibited review may qualify for removal. Before reporting anything, identify
            the policy issue you can actually support.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Which situation are you actually dealing with?</h2>
        <p>Start by separating ordinary negative feedback from a policy issue or a different Google process.</p>
        <div className={styles.diagnosticGrid}>
          {decisionRoutes.map(([heading, meaning, next], index) => (
            <div className={styles.diagnosticItem} key={heading}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{heading}</h3>
              <span className={styles.statusKicker}>Meaning</span>
              <p>{meaning}</p>
              <span className={styles.statusKicker}>Next step</span>
              <p>{next}</p>
            </div>
          ))}
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether the review actually violates Google policy?"
        body="Tell us what the review says, why you believe there is a problem and what you know about the reviewer or surrounding circumstances. We can help you identify the most appropriate next step."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Negative does not automatically mean removable</h2>
        <p>
          Google says businesses can report reviews, but only reviews that violate its policies are
          eligible for policy-based removal.
        </p>
        <p>
          Google also tells businesses not to report a review merely because they disagree with it or
          dislike it, and says it does not get involved in ordinary conflicts between businesses and
          customers.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>May remain live</h3>
            <ul>
              {mayRemainLive.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>May need policy assessment</h3>
            <ul>
              {mayNeedPolicy.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Assess the content against Google&apos;s policy, not against how damaging the review feels.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What kinds of review problems can raise a policy issue?</h2>
        <div className={styles.policyMap}>
          {policyMap.map(([heading, paragraphs]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
        <p>
          Choose the policy that best matches the actual content. Do not stack unrelated policy labels
          simply to make the report sound stronger.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;I can&apos;t find this reviewer&quot; is not proof that the review is fake</h2>
        <p>
          An unfamiliar Google display name can be useful context, but it does not by itself prove
          that no genuine experience occurred.
        </p>
        <p>A reviewer might:</p>
        <ul className={styles.proseList}>
          {unfamiliarReasons.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>Check the review itself</h3>
        <p>Look at:</p>
        <div className={styles.checkGrid}>
          {reviewChecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          If the evidence genuinely indicates that no real experience occurred, fake engagement may be
          the relevant policy.
        </p>
        <p>
          If all you know is that the display name is unfamiliar, do not claim more than the evidence
          supports.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if the review contains statements you say are false?</h2>
        <p>A factual disagreement needs careful treatment.</p>
        <p>
          Google&apos;s policies restrict misleading content, but that does not mean a review is
          automatically removed whenever a business says a statement is false.
        </p>
        <p>
          Customer reviews can contain opinions, incomplete recollections and different interpretations
          of the same event. Google also says it does not get involved in ordinary business-customer
          disputes.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Ordinary disagreement</h3>
            <p>The business and customer remember or interpret the experience differently.</p>
            <span className={styles.decisionNext}>→ A policy-removal case may not exist.</span>
          </div>
          <div>
            <h3>Possible policy issue</h3>
            <p>
              You have a specific reason and genuine evidence showing that the content goes beyond an
              ordinary disagreement and falls within a Google policy.
            </p>
            <span className={styles.decisionNext}>→ Report the specific policy issue you can support.</span>
          </div>
        </div>
        <p>Do not tell Google something is proven false when you cannot actually establish that.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if the reviewer is a competitor or former employee?</h2>
        <p>
          A review from somebody connected with the business is not automatically removable. The
          relationship matters.
        </p>
        <p>
          Google&apos;s conflict-of-interest guidance can include current or former employment,
          contractual or consultancy relationships and other professional or personal affiliations.
        </p>
        <p>
          Google also prohibits posting content on a competitor&apos;s Business Profile to undermine
          that competitor&apos;s reputation.
        </p>
        <p>Preserve evidence of the real relationship and explain why it creates a conflict.</p>
        <p>
          Do not exaggerate the relationship or rely only on the labels &quot;competitor&quot; or
          &quot;ex-employee.&quot;
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/can-a-competitor-or-ex-employee-leave-a-google-review"
        >
          Read our guide to competitor and ex-employee reviews →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Save the evidence before you report the review</h2>
        <p>Before submitting a report, keep enough information to understand the case later.</p>
        <div className={styles.compactCard}>
          <ul>
            {preserveItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Do not alter evidence.</p>
        <p>Do not create fake customer records.</p>
        <p>Do not contact a reviewer merely to manufacture material for the report.</p>
        <p>The purpose is to preserve what actually happened.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Report the review against the policy that actually applies</h2>
        <p>Google provides the Reviews Management Tool for businesses to report reviews for removal.</p>
        <p>
          Use the Google Account connected to the affected Business Profile, select the business and
          choose the review you want to report.
        </p>
        <p>Then choose the reporting reason that most accurately matches the problem.</p>
        <div className={`${styles.process} ${styles.threeProcess}`}>
          {reportSteps.map(([title, body], index) => (
            <div className={styles.processStep} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>
          Do not choose a more dramatic reporting reason simply because you think it is more likely to
          result in removal.
        </p>
        <p>The review, reporting reason and supporting facts should describe the same problem.</p>
      </section>

      <ContextualCta
        heading="Have a suspicious review but aren't sure which policy to report?"
        body="We can review the content and surrounding facts before you submit a report or use your one-time appeal."
        ctaLabel="Get your review checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check the status instead of reporting the same review again</h2>
        <p>Google&apos;s Reviews Management Tool shows where a reported review is in the process.</p>
        <div className={styles.statusBoard}>
          {rmtStatuses.map(([status, meaning, next]) => (
            <div className={styles.statusRow} key={status}>
              <strong className={styles.statusName}>{status}</strong>
              <div className={styles.statusMeta}>
                <span className={styles.statusKicker}>Meaning</span>
                <p>{meaning}</p>
              </div>
              <div className={styles.statusMeta}>
                <span className={styles.statusKicker}>Next step</span>
                <p>{next}</p>
              </div>
            </div>
          ))}
        </div>
        <p>
          Do not repeatedly create new reports because you have forgotten whether the first report was
          reviewed.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google currently provides a one-time review appeal</h2>
        <p>
          If Google evaluates a reported review and finds no policy violation, its current process
          provides a one-time appeal for eligible reviews.
        </p>
        <p>Google&apos;s Reviews Management Tool allows eligible reported reviews to be selected for appeal.</p>
        <p>Google currently says you can select up to 10 eligible reviews in that appeal.</p>
        <h3>Use the appeal to answer three things</h3>
        <ol className={styles.numberedQuestions}>
          {appealQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p>Do not use the appeal simply to say that the review is unfair or damaging.</p>
        <p>Connect the review to the actual Google policy.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What happens after the appeal?</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Google finds a policy violation</h3>
            <p>Google says the review will be removed.</p>
          </div>
          <div>
            <h3>Google finds that the review complies with policy</h3>
            <p>The review remains live.</p>
          </div>
        </div>
        <p>Google makes the final policy decision.</p>
        <p>
          ProfileRelaunch can help assess the content, identify the relevant policy and organise the
          case. We cannot decide Google&apos;s outcome or guarantee removal.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the correct outcome is that the review stays live</h2>
        <p>
          A genuine customer may have had a bad experience. The business may strongly disagree with
          the customer&apos;s interpretation, and the review may still comply with Google&apos;s
          policies.
        </p>
        <p>
          If there is no defensible policy violation, repeatedly reporting the review does not create
          one.
        </p>
        <p>
          At that point, the better response may be to address any genuine operational issue, respond
          professionally and continue earning authentic customer feedback.
        </p>
        <p>Do not manufacture a removal case where the policy does not support one.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Review extortion uses a different Google route</h2>
        <div className={styles.warning}>
          <p>
            If somebody posts or threatens negative reviews and then demands money, goods, services or
            favours in exchange for removing them, do not treat it as an ordinary review dispute.
          </p>
          <p>Google has a dedicated negative-review extortion reporting process.</p>
          <p>Google tells merchants to:</p>
          <ul>
            {extortionActions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          This route is for direct extortion attempts involving a demand for money or favours in
          exchange for review removal.
        </p>
        <p>Ordinary spam, fake or off-topic reviews should use the normal review-reporting process.</p>
        <Link className={styles.inlineLink} href="/resources/google-review-extortion">
          Read the Google review extortion guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Legal removal is separate from Google&apos;s normal review-policy process</h2>
        <p>Google has a separate route for content somebody believes violates local law.</p>
        <p>
          That is different from reporting a review because it violates Google&apos;s ordinary Maps or
          review policies.
        </p>
        <p>For example:</p>
        <p>&quot;This review is fake engagement&quot;</p>
        <p>and</p>
        <p>&quot;This statement is legally defamatory&quot;</p>
        <p>are different claims and may use different processes.</p>
        <p className={styles.eeaNote}>
          ProfileRelaunch does not determine whether a statement is legally defamatory or unlawful.
          Where legal rights are genuinely in question, independent legal advice may be appropriate.
        </p>
        <Link className={styles.inlineLink} href="/resources/false-or-defamatory-google-reviews">
          Read our guide to false or defamatory Google reviews →
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
        <h2>What if my review situation is different?</h2>
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
        <h2>Before you report or appeal a review</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If you cannot confidently answer one of these points, resolve it before submitting the next
          report or appeal.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and Maps policies with
          ProfileRelaunch&apos;s practical case-assessment advice. These are the main points that come
          directly from Google&apos;s current guidance:
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
            Start with classification, not frustration. Identify the strongest policy issue you can
            genuinely support, preserve the evidence and use the Google process that matches the
            problem.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review the case before you report or appeal?</h2>
        <p>You don&apos;t need to guess whether a negative review is actually a policy violation.</p>
        <p>
          Tell us what the review says, what you know about the reviewer and what Google has already
          done. We&apos;ll review the situation and help you understand the strongest appropriate next
          step.
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
          {businessProfileSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available review and Maps content guidance and
          was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
