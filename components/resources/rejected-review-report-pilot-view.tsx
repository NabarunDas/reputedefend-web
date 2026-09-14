import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleRejectedMyReviewReportSources } from "@/lib/resource-articles/google-rejected-my-review-report"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const statuses = [
  [
    "Decision pending",
    "Google has received the report but has not finished evaluating it.",
    "Keep the existing case record and wait for the decision. Do not submit another report simply because the first one is still pending.",
  ],
  [
    "Report reviewed - no policy violation",
    "Google evaluated the review and did not find a policy violation.",
    "Check whether the review is eligible for Google's one-time appeal and reassess the policy case before using it.",
  ],
  [
    "Escalated - check your email for updates",
    "The appeal has moved into Google's escalated review stage.",
    "Wait for the actual result by email. Escalated does not mean removal has been approved.",
  ],
] as const

const pendingKeep = [
  "Direct review link",
  "Review text",
  "Reviewer display name",
  "Rating",
  "Date shown",
  "Date you submitted the report",
  "Evidence already preserved",
  "Reporting reason used",
]

const noViolationDoesNotMean = [
  "Google agrees with every statement in the review",
  "Google decided who was right in the customer dispute",
  "Google certified the reviewer's account as factually correct",
  "The business must agree with the review",
]

const beforeAppealQuestions = [
  "Which exact policy do we believe applies?",
  "What part of the review creates that issue?",
  "What facts support that classification?",
  "Did the original report focus on the strongest policy reason?",
  "Are we relying mainly on disagreement with the reviewer?",
  "Has genuinely new information changed the analysis?",
]

const policyAreas = [
  "Fake engagement",
  "Rating manipulation",
  "Conflict of interest",
  "Off-topic content",
  "Prohibited personal information",
  "Certain harassment or offensive content",
  "Impersonation",
  "Advertising or solicitation",
  "Repetitive content",
  "Another relevant prohibited category",
]

const policyChanges = [
  [
    "New relationship evidence",
    "The reviewer is confirmed as a former employee.",
    "Conflict of interest.",
  ],
  [
    "Competitor evidence",
    "The reviewer is genuinely connected with a competing business.",
    "Conflict of interest or competitor-related policy concerns.",
  ],
  [
    "Review-content evidence",
    "The contribution exposes prohibited personal information.",
    "Privacy or prohibited-content rules.",
  ],
  [
    "Pattern evidence",
    "Several contributions show an observable manipulation pattern.",
    "Fake engagement or rating manipulation.",
  ],
] as const

const appealPrepare = [
  "Direct review link",
  "Review text",
  "Reviewer display name",
  "Original reporting reason",
  "Current Reviews Management Tool status",
  "Google policy you believe applies",
  "Exact part of the contribution that raises the issue",
  "Supporting facts you can genuinely establish",
  "Relevant relationship or pattern evidence",
  "Date of the original report",
]

const appealParts = [
  [
    "What does the review say?",
    "Identify the relevant content accurately.",
  ],
  [
    "Which Google policy applies?",
    "Name the strongest policy issue supported by the facts.",
  ],
  [
    "Why do the facts support that classification?",
    "Explain the evidence without exaggeration.",
  ],
] as const

const appealAvoid = [
  "Lost revenue",
  "Anger",
  "How unfair the review feels",
  "How much the business dislikes the reviewer",
  "How long the business has traded",
  "How many five-star reviews the business has",
]

const inventDonts = [
  "Create fake customer records",
  "Alter screenshots",
  "Manufacture conversations",
  "Pretend somebody is a competitor",
  "Create false employment evidence",
  "Ask somebody to send a message purely to strengthen the appeal",
  "Misstate what Google previously decided",
]

const caseRecord = [
  "Original report date",
  "Original reporting reason",
  "Google's status",
  "Appeal date, if submitted",
  "What was included",
  "Final result",
]

const compliantEvenWhen = [
  "strongly disputes the review",
  "considers it unfair",
  "believes the reviewer is difficult",
  "experiences reputational harm",
  "expected the appeal to succeed",
]

const secretAppealClaims = [
  "A secret second appeal",
  "An undocumented repeat appeal",
  "An internal review channel that overrides the published process",
  "A guaranteed escalation after Google leaves the review live",
]

const routes = [
  [
    "Review-policy appeal",
    "Google found no policy violation and the eligible review has a defensible policy appeal.",
    "An endless repeat-removal process.",
  ],
  [
    "User-profile report",
    "The user profile or wider contribution activity itself raises a genuine profile-level policy problem.",
    "A second appeal because one review stayed live.",
  ],
  [
    "Review extortion",
    "There is a direct demand for money, goods, services or favours in exchange for removing negative review content.",
    "A replacement route for an ordinary review Google left online.",
  ],
  [
    "Legal removal",
    "There is a genuine allegation that content violates applicable local law.",
    "A way to relabel an ordinary policy disagreement as a legal case.",
  ],
] as const

const profileReportNotBecause = [
  "The review appeal failed",
  "The business dislikes the reviewer",
  "One policy-compliant contribution remains live",
]

const responseCan = [
  "acknowledge the concern",
  "avoid admitting claims the business disputes",
  "avoid publishing private information",
  "provide relevant public context where appropriate",
  "invite genuine customer-service follow-up through a private channel",
]

const stopIf = [
  "The original report failed",
  "The one-time appeal has been used",
  "Google left the review live",
  "No genuine user-profile issue exists",
  "No review-extortion issue exists",
  "No separate legal-removal issue exists",
  "No other defensible policy route exists",
]

const nextSteps = [
  [
    "Genuine separate issue exists",
    "Use the specific route that matches that issue.",
  ],
  [
    "No further removal route, but a response is appropriate",
    "Consider a professional public response.",
  ],
  [
    "No useful action is required",
    "Keep monitoring and focus on genuine customer experience and authentic future reviews.",
  ],
] as const

const mistakes: [string, string][] = [
  [
    "Treating Decision pending as a rejection",
    "The original report has not yet been evaluated. There is no rejection to appeal.",
  ],
  [
    "Repeating the initial report instead of using the appeal",
    "Once Google shows Report reviewed - no policy violation, use the one-time appeal where eligible and justified rather than repeatedly recreating the first report.",
  ],
  [
    "Appealing commercial harm instead of a policy issue",
    "The removal decision is policy-based. Explain the policy issue rather than mainly the commercial damage.",
  ],
  [
    "Changing the story after the first decision",
    "A different policy category is appropriate only when genuine facts support the changed analysis.",
  ],
  [
    "Selecting weak reviews merely because Google allows up to 10",
    "Every selected review should still have a defensible individual policy basis.",
  ],
  [
    "Reading Escalated as removal approved",
    "Escalated means wait for the email result.",
  ],
  [
    "Promising that the appeal will succeed",
    "Google makes the final moderation decision.",
  ],
  [
    "Inventing a second standard appeal",
    "Google's merchant review appeal is one-time.",
  ],
  [
    "Reporting the reviewer profile because the appeal failed",
    "User-profile reporting requires its own policy basis.",
  ],
  [
    "Using every separate route as another appeal",
    "Extortion, legal removal and profile reporting address different issues and should only be used when those facts genuinely exist.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "The status still says Decision pending",
    [
      "The original report has not yet reached the no-policy-violation decision.",
      "Keep the review evidence and original report date.",
      "Monitor the existing case.",
      "Do not submit an appeal that is not yet available and do not repeatedly report the same review while you are waiting.",
    ],
  ],
  [
    "Google says Report reviewed - no policy violation",
    [
      "This is the point to decide whether the one-time appeal is justified.",
      "Read the review again.",
      "Read the policy again.",
      "Identify the strongest genuine issue.",
      "Prepare the factual explanation before using the appeal.",
      "If all you have is disagreement with the reviewer, recognise that before using the one-time opportunity.",
    ],
  ],
  [
    "Several related reviews were rejected",
    [
      "Google currently allows up to 10 eligible reviews in an appeal.",
      "That may help where several contributions genuinely belong to the same policy issue.",
      "Keep every review individually identifiable.",
      "Explain the policy basis for each selected review and use the shared pattern only where it genuinely matters.",
      "Do not add unrelated negative reviews just to make the incident look larger.",
    ],
  ],
  [
    "We appealed and Google still left the review live",
    [
      "Treat the email result as the outcome of the published one-time review appeal.",
      "Do not promise a second ordinary appeal.",
      "Check whether there is genuinely another issue, such as a policy-violating user profile, direct review extortion or a separate legal-removal question.",
      "If none applies, consider professional response and ongoing reputation management rather than another removal attempt.",
    ],
  ],
  [
    "The reviewer is now posting other abusive content",
    [
      "That may create a separate issue.",
      "Preserve the new contributions.",
      "Assess them against Google's policies.",
      "Where the user profile or broader contribution activity genuinely violates policy, the user-profile reporting process may be relevant.",
      "Do not report the whole profile merely because the original review appeal failed.",
    ],
  ],
]

const readinessChecks = [
  "I have opened the Reviews Management Tool.",
  "I know the exact status Google shows.",
  "I am not treating Decision pending as a rejection.",
  "I have saved the review link, text, reviewer name, rating and date.",
  "I know what reporting reason I used originally.",
  "I have re-read the relevant Google policy.",
  "I can identify the strongest genuine policy issue.",
  "I have separated facts from suspicion.",
  "I have preserved genuine supporting evidence without altering it.",
  "I am not repeatedly submitting the same initial report.",
  "The review is actually eligible for Google's one-time appeal.",
  "Every review I intend to select has its own defensible policy basis.",
  "I understand Google currently allows up to 10 eligible reviews in the appeal.",
  "I know Escalated does not mean removal approved.",
  "I understand Google sends the appeal result by email.",
  "I understand the review may remain live.",
  "I am not expecting an undocumented second ordinary appeal.",
  "I will use user-profile, extortion or legal routes only if genuinely separate facts support them.",
  "I understand when a professional response may be more appropriate than another removal attempt.",
  "I understand Google makes the final policy decision.",
]

const googlePoints = [
  "Only reviews that violate Google's policies are eligible for policy-based removal.",
  "The Reviews Management Tool can show Decision pending while an initial report has not yet been evaluated.",
  "Google can show Report reviewed - no policy violation after it evaluates a report and finds no violation.",
  "Eligible reviews with that decision can currently use Google's one-time appeal.",
  "Google currently permits up to 10 eligible reviews to be selected in an appeal.",
  "After the appeal is assessed, Google sends the result by email.",
  "The Reviews Management Tool may show Escalated - check your email for updates while the appeal is being handled.",
  "If Google determines a review violates its policies, the review is removed.",
  "If Google determines the review complies with its policies, the review remains live.",
  "Google provides a separate process for reporting inappropriate user profiles.",
  "Google provides a separate merchant route for direct negative-review extortion.",
  "Google provides a separate legal-removal process for content believed to violate local law.",
  "Those separate routes are not additional ordinary review appeals.",
  "Google makes the final review-policy decision.",
]

const relatedCopy: Record<string, string> = {
  "can-a-google-review-be-removed":
    "How Google's review-removal rules work, what can qualify for removal and how the normal reporting process fits together.",
  "false-or-defamatory-google-reviews":
    "How to distinguish Google's review-policy process from a genuinely separate legal-removal question.",
}

const SOURCE_GROUP_ORDER = [
  "Google Business Profile Help",
  "Maps User Contributed Content Policy Help",
]

const sourceGroups = SOURCE_GROUP_ORDER.map((label) => ({
  label,
  sources: googleRejectedMyReviewReportSources.filter((source) => source.name === label),
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

export function RejectedReviewReportPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.rejectedPage}`}>
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
            Google leaving a reported review online does not always mean you have reached the same stage.
            The Reviews Management Tool can show that the original report is still pending, that Google
            found no policy violation, or that an appeal has been escalated and the result will arrive by
            email.
          </p>
          <p>
            Check the exact status before doing anything else. If Google has found no policy violation and
            the review is eligible, its current process provides a one-time appeal. Use that opportunity to
            make the policy case clearer — not simply to repeat that the review is damaging or unfair.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Start with the status Google actually shows</h2>
        <p>The next step depends on where the case is in Google&apos;s published review process.</p>
        <div className={styles.threeOutcome}>
          {statuses.map(([title, meaning, next], index) => (
            <div key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Meaning</span>
              <p>{meaning}</p>
              <span className={styles.statusKicker}>Next step</span>
              <p>{next}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Do not call every live review a rejected appeal</h3>
          <p>A review can still be live while the original report is pending.</p>
          <p>A review can still be live while an appeal is being assessed.</p>
          <p>Confirm the stage before choosing the next action.</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether Google has actually rejected the case yet?"
        body="Tell us what status the Reviews Management Tool shows, what you originally reported and which policy you believe applies. We can help you identify the correct stage before you use another step."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Decision pending is not a rejection</h2>
        <p>
          If the Reviews Management Tool still says Decision pending, Google has not finished the initial
          review.
        </p>
        <p>Keep:</p>
        <div className={styles.checkGrid}>
          {pendingKeep.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Monitor the existing case.</p>
        <p>Do not repeatedly submit the same report because the result has not arrived yet.</p>
        <p>There is no appeal decision to challenge while the original report is still pending.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;Report reviewed - no policy violation&quot; is the decision that opens the appeal question</h2>
        <p>If Google shows:</p>
        <p>Report reviewed - no policy violation</p>
        <p>
          it has evaluated the review and did not find a policy violation under the reporting process.
        </p>
        <p>That does not mean:</p>
        <ul className={styles.proseList}>
          {noViolationDoesNotMean.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          It means Google did not identify a policy violation that qualified the contribution for removal
          through that review process.
        </p>
        <h3>Your next question</h3>
        <p>
          <strong>Is there a defensible policy reason to use the one-time appeal?</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not appeal only because the review is damaging</h2>
        <p>A one-star review can cause real commercial frustration.</p>
        <p>That does not replace the Google policy question.</p>
        <p>Before appealing, ask:</p>
        <ul className={styles.proseList}>
          {beforeAppealQuestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>&quot;This review is hurting our reputation&quot;</p>
        <p>does not, by itself, explain why Google should remove the contribution under its policies.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Read the policy again before using the appeal</h2>
        <p>Reassess the actual review against Google&apos;s current prohibited and restricted content rules.</p>
        <p>Possible areas can include:</p>
        <div className={styles.checkGrid}>
          {policyAreas.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not choose a new reporting category merely because the first category failed.</p>
        <p>Change the policy analysis only when the facts genuinely support a different issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes new facts genuinely change the policy case</h2>
        <p>A business may originally report a review as fake engagement because it does not recognise the reviewer.</p>
        <p>Later, reliable evidence may establish something different.</p>
        <div className={styles.signalGrid}>
          {policyChanges.map(([title, evidence, issue]) => (
            <div className={styles.signalItem} key={title}>
              <h3>{title}</h3>
              <p>{evidence}</p>
              <span className={styles.statusKicker}>Possible issue</span>
              <p>{issue}</p>
            </div>
          ))}
        </div>
        <p>If the facts genuinely change the analysis, explain the new issue accurately.</p>
        <p>Do not manufacture a different category merely to obtain another attempt.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Prepare the one-time appeal before you submit it</h2>
        <p>
          Google&apos;s current process provides a one-time appeal for eligible reported reviews after it
          finds no policy violation.
        </p>
        <p>Treat one-time seriously.</p>
        <p>Before submitting, organise:</p>
        <div className={styles.checkGrid}>
          {appealPrepare.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not rely on memory.</p>
        <p>Do not alter the underlying evidence.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google currently allows up to 10 eligible reviews in an appeal</h2>
        <p>Google&apos;s current process allows up to 10 eligible reviews to be selected in one appeal.</p>
        <p>That can be useful where several reviews genuinely belong to the same policy problem.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Related eligible reviews</h3>
            <p>Several reviews belong to the same genuine incident, conflict or manipulation pattern.</p>
            <span className={styles.decisionNext}>
              Pattern evidence may help explain the shared issue.
            </span>
          </div>
          <div>
            <h3>Unrelated negative reviews</h3>
            <p>The reviews concern different customers, events or policy questions.</p>
            <span className={styles.decisionNext}>
              Do not add them merely because the tool allows multiple selections.
            </span>
          </div>
        </div>
        <p>
          For every selected review, be able to explain why that individual contribution raises a Google
          policy issue.
        </p>
        <p>Ten weak cases do not automatically become stronger than one well-supported case.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Make the appeal easier to evaluate</h2>
        <p>The appeal should make three things clear:</p>
        <div className={styles.threeOutcome}>
          {appealParts.map(([title, body], index) => (
            <div key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>Avoid building the appeal mainly around:</p>
        <ul className={styles.proseList}>
          {appealAvoid.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Those points do not replace the policy analysis.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep facts separate from suspicion</h2>
        <p>Say what you can establish.</p>
        <p>Do not turn an inference into a fact.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Supportable statement</h3>
            <p>&quot;We cannot identify this reviewer in our records.&quot;</p>
          </div>
          <div>
            <h3>Unsupported leap</h3>
            <p>&quot;This person definitely never interacted with the business.&quot;</p>
          </div>
        </div>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Supportable statement</h3>
            <p>&quot;We have records showing this person previously worked for the business.&quot;</p>
          </div>
          <div>
            <h3>Unsupported leap</h3>
            <p>&quot;This must be an ex-employee because the review is hostile.&quot;</p>
          </div>
        </div>
        <p>A careful appeal is stronger when its factual claims can be supported.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A rejected report is not a reason to manufacture a stronger story</h2>
        <div className={styles.warning}>
          <p>Do not:</p>
          <ul>
            {inventDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>A weak truthful case is better than a fabricated one.</p>
        <p>ProfileRelaunch should never improve an appeal by inventing facts.</p>
      </section>

      <ContextualCta
        heading="Preparing the one-time appeal and want the policy case checked first?"
        body="We can review the original report, the review itself and the evidence you already have before you use the one-time appeal."
        ctaLabel="Get your appeal checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not repeatedly flag the same review while preparing the appeal</h2>
        <p>Once Google has reached:</p>
        <p>Report reviewed - no policy violation</p>
        <p>use the published appeal route where appropriate.</p>
        <p>
          Do not keep creating the same initial report in the hope that repetition changes the policy
          result.
        </p>
        <p>Keep one clean case record showing:</p>
        <div className={styles.checkGrid}>
          {caseRecord.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;Escalated&quot; does not mean removal approved</h2>
        <p>After an appeal is submitted, the Reviews Management Tool may show:</p>
        <p>Escalated - check your email for updates</p>
        <p>Google says the result is sent by email.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>What Escalated means</h3>
            <p>The appeal has moved into the escalated review process.</p>
          </div>
          <div>
            <h3>What it does not mean</h3>
            <p>The review has already been approved for removal.</p>
          </div>
        </div>
        <p>Wait for the actual email decision.</p>
        <p>Do not promise an outcome while the appeal is still being assessed.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The appeal has two basic policy outcomes</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Google finds a policy violation</h3>
            <p>Google says the review will be removed.</p>
            <p>Keep a record of the decision.</p>
          </div>
          <div>
            <h3>Google finds the review compliant</h3>
            <p>The review remains live.</p>
            <p>That can happen even when the business:</p>
            <ul>
              {compliantEvenWhen.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>
          A decision to leave a review live is not the same as Google endorsing every statement made by
          the reviewer.
        </p>
        <p>It means Google did not remove the contribution under that policy process.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not invent a second standard review appeal</h2>
        <div className={styles.warning}>
          <p>Google describes the merchant review appeal as a one-time appeal.</p>
          <p>Do not tell a customer:</p>
          <p>&quot;We&apos;ll just appeal it again.&quot;</p>
          <p>Do not claim:</p>
          <ul>
            {secretAppealClaims.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>A separate Google route should be used only when a genuinely different issue exists.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A separate Google route needs a separate issue</h2>
        <div className={styles.signalGrid}>
          {routes.map(([title, useWhen, not], index) => (
            <div className={styles.signalItem} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Use when</span>
              <p>{useWhen}</p>
              <span className={styles.statusKicker}>Not</span>
              <p>{not}</p>
            </div>
          ))}
        </div>
        <p>Do not shop between Google processes until one produces the desired commercial result.</p>
        <p>Use the route that matches the facts.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reporting the reviewer profile is not a second review appeal</h2>
        <p>Google provides a separate process for reporting inappropriate user profiles.</p>
        <p>
          That may be relevant when the user&apos;s profile or broader contribution activity itself violates
          Google&apos;s policies.
        </p>
        <p>It is not appropriate simply because:</p>
        <ul className={styles.proseList}>
          {profileReportNotBecause.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Base a profile report on an actual profile-level or wider contribution-policy problem.</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Review extortion is a different process</h2>
        <p>
          If somebody directly demands money, goods, services or favours in exchange for removing negative
          reviews, Google provides a dedicated merchant route.
        </p>
        <p>That is a separate issue from:</p>
        <p>&quot;Google rejected my normal review report.&quot;</p>
        <p>
          Do not retroactively call an ordinary rejected review extortion merely to obtain another
          submission path.
        </p>
        <Link className={styles.inlineLink} href="/resources/google-review-extortion">
          Read the Google review extortion guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Legal removal is separate from Google&apos;s review-policy appeal</h2>
        <p>
          Google also provides a separate process for content somebody believes violates local law.
        </p>
        <p>That route is different from the ordinary Maps and review-policy process.</p>
        <p>A claim such as:</p>
        <p>&quot;This contribution violates Google&apos;s fake-engagement policy.&quot;</p>
        <p>is different from:</p>
        <p>&quot;This content is unlawful under applicable law.&quot;</p>
        <p>Do not turn a rejected policy report into an unsupported legal claim.</p>
        <p>Where a genuine legal issue exists, appropriate independent legal advice may be needed.</p>
        <p>ProfileRelaunch does not provide legal advice.</p>
        <Link className={styles.inlineLink} href="/resources/false-or-defamatory-google-reviews">
          Read our false or defamatory Google reviews guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the final appeal leaves the review live, reassess the objective</h2>
        <p>After Google&apos;s final published policy decision, ask:</p>
        <p>
          <strong>Is there still a genuine separate removal route?</strong>
        </p>
        <p>Sometimes the answer is no.</p>
        <p>A real customer may have posted negative feedback that remains within Google&apos;s policies.</p>
        <p>
          If no genuine user-profile, extortion, legal or other policy issue exists, repeatedly paying for
          new &quot;removal attempts&quot; may not be appropriate.
        </p>
        <div className={styles.threeOutcome}>
          {nextSteps.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A professional response may be the better next step</h2>
        <p>
          If the review remains live and there is no further legitimate removal route, consider whether a
          public response would help future customers understand the business&apos;s approach.
        </p>
        <p>A concise response can:</p>
        <ul className={styles.proseList}>
          {responseCan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not use the reply to restart the dispute publicly.</p>
        <p>Do not attack the reviewer.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the responsible recommendation is to stop pursuing paid removal</h2>
        <p>
          ProfileRelaunch should not keep selling removal attempts when the evidence no longer supports a
          legitimate route.
        </p>
        <p>If:</p>
        <ul className={styles.proseList}>
          {stopIf.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>then the correct recommendation may be:</p>
        <p>
          <strong>
            Do not spend more money trying to force a removal case that is no longer defensible.
          </strong>
        </p>
        <p>That protects the customer from paying for false hope.</p>
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
        <h2>What if my rejected-review case is different?</h2>
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
        <h2>Before using the one-time appeal</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>If one of these points is unclear, resolve it before using the one-time appeal.</p>
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
            Use the one-time appeal carefully and know when the process ends. Check the exact status,
            strengthen only the policy case the evidence genuinely supports, and do not turn separate
            Google processes into an endless series of removal attempts.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review the case before you use the one-time appeal?</h2>
        <p>
          You don&apos;t need to repeat the original report or invent a stronger story.
        </p>
        <p>
          Tell us what Google decided, what you originally reported and what evidence you have now.
          We&apos;ll review the policy case and help you understand whether the one-time appeal or a
          genuinely separate route is appropriate.
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
          This guide is based on Google&apos;s publicly available review and Maps content guidance and was
          last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
