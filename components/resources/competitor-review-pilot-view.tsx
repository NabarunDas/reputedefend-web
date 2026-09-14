import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { competitorOrExEmployeeReviewSources } from "@/lib/resource-articles/can-a-competitor-or-ex-employee-leave-a-google-review"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const relationshipRoutes = [
  [
    "Current or former employee",
    "The reviewer works or previously worked for the business.",
    "Establish the employment relationship accurately and assess the conflict-of-interest issue.",
  ],
  [
    "Industry competitor",
    "The reviewer owns, works for or is genuinely connected with a competing business.",
    "Preserve reliable evidence of the competitor relationship.",
  ],
  [
    "Other professional or personal connection",
    "The reviewer may be a contractor, consultant, supplier, business partner, relative or otherwise connected person.",
    "Work out whether the relationship genuinely demonstrates a conflict rather than assuming every connection does.",
  ],
  [
    "Independent customer",
    "No relevant employment, competitor, professional or personal conflict can be established.",
    "Assess the review as ordinary customer feedback and check whether some other Google content policy genuinely applies.",
  ],
] as const

const employmentEvidence = [
  "Employment dates",
  "Role",
  "Workplace location",
  "Business email history",
  "Legitimate HR records",
  "Publicly available professional information",
  "Other reliable records that accurately establish the relationship",
]

const formerEmployeeAsk = [
  "Is the content connected with the employment relationship?",
  "Does that relationship create the type of conflict Google describes?",
  "Is the person publicly rating the business from a position that is not independent?",
]

const competitorEvidence = [
  "The competing business they own or work for",
  "An official company page",
  "A professional profile",
  "A business website",
  "Other reliable information establishing the connection",
]

const relationshipQuestions = [
  "Is the person a current or former employee?",
  "Are they connected with a competing business?",
  "Is there a contractual or consultancy relationship?",
  "Is there another professional or personal affiliation?",
  "When did that relationship exist?",
  "What reliable evidence establishes it?",
  "Why is the relationship relevant to Google's conflict rules?",
]

const realAccountFacts = [
  "Use their real name",
  "Have years of Google contribution history",
  "Have a normal-looking profile",
  "Have genuinely visited the business",
]

const googleRelationshipExamples = [
  "Contractual relationships",
  "Consultancy relationships",
  "Professional affiliations",
  "Personal affiliations",
  "Familial relationships",
]

const otherReviewerTypes = [
  "A contractor",
  "A consultant",
  "A supplier",
  "A business partner",
  "A close relative of somebody involved",
  "Professionally connected to a competing organisation",
]

const reviewEvidence = [
  "Direct review link",
  "Reviewer display name",
  "Rating",
  "Review text",
  "Date shown",
  "Screenshots",
]

const relationshipEvidence = [
  "Who you believe the reviewer is",
  "How you established that identity",
  "The relationship with the business",
  "Relevant dates",
  "Reliable evidence establishing the relationship",
  "Competitor connection where applicable",
]

const relationshipRecord = [
  ["Reviewer", "Who is the person?"],
  ["Identification basis", "How do you know?"],
  [
    "Relationship",
    "Employee, former employee, competitor, contractor, consultant or another connection?",
  ],
  ["Dates", "When did the relationship exist?"],
  ["Evidence", "What reliable information establishes it?"],
  ["Review connection", "Why is that relationship relevant to this contribution?"],
] as const

const privateDonts = [
  "Salary information",
  "Disciplinary information",
  "Home addresses",
  "Private phone numbers",
  "Medical information",
  "Confidential HR correspondence",
  "Other sensitive personal information",
]

const retaliatoryPeople = [
  "Employees",
  "Friends",
  "Contractors",
  "Family members",
  "Other connected people",
]

const reportExplain = [
  "Which review you are reporting",
  "Who the reviewer is, where genuinely established",
  "What relationship exists",
  "Relevant dates or context",
  "What evidence establishes the relationship",
  "Why that relationship is relevant under Google's conflict-of-interest rules",
]

const rmtStatuses = [
  ["Decision pending", "Google has not yet finished assessing the report."],
  [
    "Report reviewed - no policy violation",
    "Google reviewed the contribution and did not find a policy violation.",
  ],
  [
    "Escalated - check your email for updates",
    "Google has escalated the case and will communicate the result.",
  ],
] as const

const appealExplain = [
  "Who the reviewer is",
  "What relationship exists",
  "Which Google conflict-of-interest rule is relevant",
  "What reliable evidence supports the relationship",
]

const mistakes: [string, string][] = [
  [
    "Calling the review fake when the real issue is conflict of interest",
    "A real person using a real account can still have a relationship that raises a bias or conflict issue.",
  ],
  [
    "Saying \"former employee\" without evidence",
    "Preserve reliable information establishing the employment relationship.",
  ],
  [
    "Calling every hostile reviewer a competitor",
    "A competitor relationship can be highly relevant, but it should be established before being reported as fact.",
  ],
  [
    "Trying to prove the former employee was never a customer",
    "Where an employment relationship already exists, conflict of interest may be the more accurate policy issue.",
  ],
  [
    "Publishing HR evidence in the review reply",
    "Private relationship evidence does not automatically belong in a public response.",
  ],
  [
    "Focusing entirely on revenge or motive",
    "The documented relationship is usually easier to support than assumptions about private motivation.",
  ],
  [
    "Assuming every past relationship guarantees removal",
    "Google makes the final policy decision.",
  ],
  [
    "Asking staff to post positive reviews in response",
    "Creating more conflicted contributions is not an appropriate countermeasure.",
  ],
  [
    "Reporting the entire user profile automatically",
    "A profile-level report needs its own genuine policy basis.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "A former employee left a one-star review about working here",
    [
      "Preserve the review and establish the employment relationship.",
      "Google's conflict-of-interest guidance includes current and former employment.",
      "Do not reframe the review as an unidentified fake customer.",
      "The employment relationship is the important fact.",
      "Report the review using the relevant conflict or rating-manipulation policy and keep private employment evidence out of the public reply.",
    ],
  ],
  [
    "A former employee also bought something from us as a customer",
    [
      "Do not hide the customer interaction.",
      "The person may have had a genuine customer experience while also having a former-employment relationship with the business.",
      "Preserve both facts.",
      "Explain the established relationship accurately and let Google assess whether the contribution falls within its conflict-of-interest policy.",
      "Do not claim the customer interaction never happened if it did.",
    ],
  ],
  [
    "The owner of a competing business reviewed us",
    [
      "Establish the competitor relationship first.",
      "Preserve reliable evidence connecting the reviewer with the competing business.",
      "Google's policies address competitor activity and conflicts of interest.",
      "Report the review using the policy that actually applies.",
      "Do not add unsupported allegations about fake accounts or coordinated behaviour unless separate evidence exists.",
    ],
  ],
  [
    "A relative of a former employee posted the review",
    [
      "Do not assume the relationship automatically proves a violation.",
      "Google's conflict examples can include personal and familial relationships.",
      "Establish the relationship accurately and assess whether the facts genuinely show a conflict.",
      "If the relationship itself is uncertain, do not present it to Google as proven.",
    ],
  ],
  [
    "We suspect the reviewer works for a competitor but cannot prove it",
    [
      "Treat that as suspicion.",
      "Do not state that the reviewer is a competitor as though it is established fact.",
      "Preserve the review and investigate using legitimate information available to the business.",
      "If you cannot establish the competitor relationship, assess whether some other Google policy genuinely applies to the actual review content.",
      "If no defensible policy issue can be supported, recognise that before making a stronger allegation.",
    ],
  ],
]

const readinessChecks = [
  "I have saved the direct review link, rating, text and date.",
  "I have identified who I believe the reviewer is.",
  "I can explain how that identity was established.",
  "I know what relationship exists or existed.",
  "I have recorded relevant dates.",
  "I have reliable evidence establishing the relationship.",
  "I have separated conflict-of-interest evidence from any separate fake-engagement allegation.",
  "I have not hidden a genuine customer interaction.",
  "I am not guessing the reviewer's motive.",
  "I am not publishing private HR or personal information.",
  "I am not asking connected people to retaliate with positive reviews.",
  "I know which Google policy actually matches the case.",
  "I have recorded the report date and status.",
  "I understand a reviewer-profile report requires its own policy basis.",
  "I understand Google makes the final removal decision.",
]

const googlePoints = [
  "Google says reviews and ratings should reflect genuine and unbiased experiences.",
  "Google's rating-manipulation guidance covers content based on conflicts of interest.",
  "Google's examples can include current or former employment.",
  "Google's examples can include contractual and consultancy relationships.",
  "Google's examples can include other professional and personal affiliations.",
  "Google's examples can include industry competitors and familial relationships.",
  "Google separately prohibits content posted on a competitor's business to undermine its reputation.",
  "Businesses can report reviews they believe violate Google's policies.",
  "Google says businesses should not report reviews merely because they disagree with or dislike them.",
  "Reported reviews can be monitored through the Reviews Management Tool.",
  "Eligible reviews assessed as having no policy violation can currently use Google's one-time appeal.",
  "Google provides a separate process for reporting inappropriate user profiles.",
  "Google makes the final policy decision.",
]

const relatedCopy: Record<string, { title: string; description: string }> = {
  "can-a-google-review-be-removed": {
    title: "Can a Google Review Be Removed? What Google's Policy Actually Allows",
    description:
      "How Google's review-removal policies work, what kinds of content can qualify for removal and when an appeal may be available.",
  },
  "false-or-defamatory-google-reviews": {
    title: "False or Defamatory Google Reviews: Policy Removal vs Legal Options",
    description:
      "How to separate an ordinary Google policy report from a legal claim about false or defamatory content.",
  },
}

const SOURCE_GROUP_ORDER = [
  "Maps User Contributed Content Policy Help",
  "Google Business Profile Help",
]

const sourceGroups = SOURCE_GROUP_ORDER.map((label) => ({
  label,
  sources: competitorOrExEmployeeReviewSources.filter((source) => source.name === label),
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

export function CompetitorReviewPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.conflictPage}`}>
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
            A review does not have to come from a fake account to raise a Google policy issue. Sometimes
            the important fact is the reviewer&apos;s relationship with the business.
          </p>
          <p>
            Google&apos;s current Maps policies include conflict-of-interest rules covering relationships
            such as current or former employment, professional or contractual connections and industry
            competitors. Start by establishing that relationship accurately rather than simply calling
            the review fake.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Start with the relationship</h2>
        <p>
          The right policy analysis depends on who the reviewer is and how they are connected with the
          business.
        </p>
        <div className={`${styles.process} ${styles.fourProcess}`}>
          {relationshipRoutes.map(([title, meaning, matters], index) => (
            <div className={styles.processStep} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Meaning</span>
              <p>{meaning}</p>
              <span className={styles.statusKicker}>What matters</span>
              <p>{matters}</p>
            </div>
          ))}
        </div>
        <p>
          A real person, a real Google account and even a real interaction with the business do not
          automatically remove the conflict-of-interest question.
        </p>
      </section>

      <ContextualCta
        heading="Know who the reviewer is but aren't sure whether the relationship creates a policy issue?"
        body="Tell us what the review says and what relationship you can genuinely establish. We can help you assess the conflict without turning it into a fake-review claim that the evidence does not support."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Conflict of interest is different from fake engagement</h2>
        <p>Fake engagement is one Google review-policy issue.</p>
        <p>Conflict of interest is another.</p>
        <p>
          Google says reviews and ratings should reflect genuine and unbiased experiences, and its
          rating-manipulation guidance covers content based on certain conflicted relationships.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Fake-engagement question</h3>
            <p>Did a genuine experience occur?</p>
          </div>
          <div>
            <h3>Conflict-of-interest question</h3>
            <p>
              Does the reviewer have a relationship that makes the contribution non-independent or biased
              under Google&apos;s policy?
            </p>
          </div>
        </div>
        <p>A reviewer can use their real identity and still raise a conflict-of-interest issue.</p>
        <p>
          Do not force the report into &quot;fake review&quot; when the established relationship is the
          stronger policy fact.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Current and former employment can be relevant</h2>
        <p>Google&apos;s conflict-of-interest guidance includes current and former employment.</p>
        <p>
          If the reviewer genuinely works or previously worked for the business, preserve the facts that
          establish that relationship.
        </p>
        <p>Useful information can include:</p>
        <div className={styles.checkGrid}>
          {employmentEvidence.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not fabricate employment evidence.</p>
        <p>Do not alter records.</p>
        <p>Do not publish sensitive HR information simply to prove the relationship publicly.</p>
        <p>The evidence is for establishing the policy issue, not embarrassing the reviewer.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A former employee is not best analysed as &quot;we can&apos;t find this customer&quot;</h2>
        <p>If you already know the reviewer was an employee, use that known fact.</p>
        <p>Ask:</p>
        <ul className={styles.proseList}>
          {formerEmployeeAsk.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>That is cleaner than trying to prove that the reviewer had absolutely no customer interaction.</p>
        <p>Keep the case truthful.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The same standard applies to positive staff reviews</h2>
        <p>Conflict-of-interest rules should not be used only when a review hurts the business.</p>
        <p>Current employment can also create a conflict when staff post positive customer-style reviews.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Negative conflicted review</h3>
            <p>Do not ignore the relationship merely because the review is hostile.</p>
          </div>
          <div>
            <h3>Positive conflicted review</h3>
            <p>Do not treat a staff review as acceptable merely because it improves the rating.</p>
          </div>
        </div>
        <p>
          A business should not respond to a suspected conflicted review by asking employees or other
          connected people to post favourable reviews.
        </p>
        <p>Review policy should work in both directions.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Competitor relationships can be especially relevant</h2>
        <p>
          Google&apos;s fake-engagement guidance says merchants and users must not post content on a
          competitor&apos;s place or business to undermine that business&apos;s or product&apos;s
          reputation.
        </p>
        <p>
          Google&apos;s rating-manipulation guidance also identifies industry competitors as a relationship
          that may demonstrate a conflict of interest.
        </p>
        <p>
          If you can genuinely establish that the reviewer is connected with a competing business, preserve
          that connection.
        </p>
        <p>Useful evidence can include:</p>
        <div className={styles.checkGrid}>
          {competitorEvidence.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not call somebody a competitor simply because the review is hostile.</p>
        <p>Establish the relationship first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Facts about the relationship are stronger than guesses about motive</h2>
        <p>
          A business may believe the reviewer is angry, jealous, retaliating or trying to cause commercial
          harm.
        </p>
        <p>That can be context, but private motive is often difficult to prove.</p>
        <div className={styles.compactCard}>
          <h3>Focus on questions you can evidence</h3>
          <ul>
            {relationshipQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>&quot;This reviewer worked for the business between these dates&quot;</p>
        <p>is more useful than:</p>
        <p>&quot;This is a bitter person trying to destroy us.&quot;</p>
        <p>Keep the case factual.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A conflicted reviewer can still use a real account</h2>
        <p>Do not confuse conflict of interest with identity fraud.</p>
        <p>The reviewer may:</p>
        <ul className={styles.proseList}>
          {realAccountFacts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Those facts do not automatically remove the conflict-of-interest question.</p>
        <p>
          Likewise, a competitor relationship does not justify unsupported accusations about fake
          identities, multiple accounts or fabricated profiles.
        </p>
        <p>Classify only what the evidence supports.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if the reviewer was also a genuine customer?</h2>
        <p>Real situations can overlap.</p>
        <p>A former employee may later buy a product.</p>
        <p>A contractor may also use the business personally.</p>
        <p>A competitor may have visited the premises.</p>
        <p>Do not hide a genuine customer interaction if it occurred.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Genuine interaction</h3>
            <p>Record it accurately.</p>
          </div>
          <div>
            <h3>Existing conflicted relationship</h3>
            <p>Record that accurately too.</p>
          </div>
        </div>
        <p>The useful question is not:</p>
        <p>&quot;Can we prove this person never interacted with us?&quot;</p>
        <p>It is:</p>
        <p>
          <strong>
            What relationship exists, and why is that relationship relevant to Google&apos;s
            conflict-of-interest rules?
          </strong>
        </p>
        <p>Let Google make the final policy assessment.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Employees and competitors are not the only possible conflicts</h2>
        <p>Google&apos;s examples are broader and can include relationships such as:</p>
        <div className={styles.checkGrid}>
          {googleRelationshipExamples.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>The same evidence-based approach can therefore matter when the reviewer is:</p>
        <div className={styles.checkGrid}>
          {otherReviewerTypes.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not assume every acquaintance creates a policy violation.</p>
        <p>The relationship should genuinely demonstrate a conflict.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Save the review before investigating the relationship</h2>
        <p>Keep the original review evidence separate from the relationship evidence.</p>
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
            <h3>Relationship evidence</h3>
            <ul>
              {relationshipEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Do not alter the review evidence.</p>
        <p>Do not create a new story about the reviewer after the fact.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Build a simple relationship record</h2>
        <ol className={styles.relationshipRecord}>
          {relationshipRecord.map(([title, body], index) => (
            <li key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p>Keep the description factual and narrow.</p>
        <p>Do not turn the evidence record into an argument about the person&apos;s character.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep private employment information out of the public reply</h2>
        <div className={styles.warning}>
          <p>A removal report and a public review reply have different purposes.</p>
          <p>Do not publish:</p>
          <ul>
            {privateDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>If a public response is appropriate, keep it professional and minimal.</p>
        <p>
          Private supporting records should remain private and only be used through an appropriate process
          where genuinely required and lawful.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not counter one conflicted review with several more</h2>
        <p>A hostile employee or competitor review can create pressure to &quot;rebalance&quot; the rating.</p>
        <p>Do not respond by asking:</p>
        <div className={styles.checkGrid}>
          {retaliatoryPeople.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>to post favourable customer-style reviews.</p>
        <p>That risks creating further biased or manipulated contributions.</p>
        <p>The response to one suspected conflict should not create several new conflicts.</p>
      </section>

      <ContextualCta
        heading="Have relationship evidence but aren't sure how strong the conflict case is?"
        body="We can review the contribution and the relationship evidence before you choose the reporting reason or use the one-time appeal."
        ctaLabel="Get your review checked"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Report the review against the conflict you can establish</h2>
        <p>Google tells businesses to report reviews that violate its policies.</p>
        <p>When the relationship is the issue, keep the report narrow.</p>
        <p>Explain:</p>
        <ul className={styles.proseList}>
          {reportExplain.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not add unsupported allegations simply because they sound more serious.</p>
        <p>If the reviewer is genuinely connected with a competitor, say so and support it.</p>
        <p>If they are a former employee, say that accurately.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Track Google&apos;s decision instead of repeatedly reporting</h2>
        <p>After reporting the review, use Google&apos;s Reviews Management Tool to check its status.</p>
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
        <p>Do not repeatedly submit the same report while the decision is still pending.</p>
        <p>Keep the relationship evidence organised.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If Google finds no violation, the one-time appeal may be the next step</h2>
        <p>
          Google&apos;s current process provides a one-time appeal for eligible reviews after the original
          report is assessed as having no policy violation.
        </p>
        <p>Use the appeal to make the conflict clearer.</p>
        <p>Explain:</p>
        <ul className={styles.proseList}>
          {appealExplain.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not spend most of the appeal describing commercial damage caused by the review.</p>
        <p>The removal question remains policy-based.</p>
        <Link className={styles.inlineLink} href="/resources/google-rejected-my-review-report">
          Read what to do when Google rejects a review report →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reporting the reviewer&apos;s whole profile is a separate decision</h2>
        <p>
          Google also allows inappropriate user profiles to be reported where the profile or its
          contribution activity itself violates policy.
        </p>
        <p>Do not automatically report the reviewer&apos;s whole profile because one review concerns your business.</p>
        <p>A profile report needs its own policy basis.</p>
        <p>Use it only when there is a genuine profile-level or repeated contribution-policy issue.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A genuine independent customer complaint is different</h2>
        <p>
          Conflict-of-interest rules should not become a shortcut for removing ordinary customer
          criticism.
        </p>
        <p>
          If no relevant employment, competitor, professional, contractual, personal or family conflict
          can be established, assess the review as ordinary customer feedback.
        </p>
        <p>Google says it does not get involved in ordinary disagreements between businesses and customers.</p>
        <p>The business disliking the review is not enough.</p>
        <p>If another review policy may apply, assess that policy honestly.</p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read what Google&apos;s review-removal policy actually allows →
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
        <h2>What if the relationship is more complicated?</h2>
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
        <h2>Before reporting a competitor or employee review</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is uncertain, resolve that uncertainty before turning it into a stronger
          claim.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review and Maps policies with
          ProfileRelaunch&apos;s practical relationship-evidence approach. These are the main points that
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
            Start with the relationship you can prove. Keep the review evidence and relationship evidence
            separate, avoid guessing motive, and report the conflict that the facts actually support.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review the relationship evidence before you report?</h2>
        <p>
          You don&apos;t need to call the review fake to explain why a competitor, employee or
          professionally connected reviewer may create a policy issue.
        </p>
        <p>
          Tell us what the review says and what relationship you can establish. We&apos;ll review the
          evidence and help you understand the strongest appropriate Google policy and reporting route.
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
              <strong>{relatedCopy[item.slug]?.title ?? item.title}</strong>
              <span>{relatedCopy[item.slug]?.description ?? item.excerpt}</span>
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
