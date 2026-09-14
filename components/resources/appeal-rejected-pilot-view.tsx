import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import type { ResourceRecord } from "@/lib/resources"
import { appealRejectedWhatNextSources } from "@/lib/resource-articles/google-business-profile-appeal-rejected-what-next"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const statuses = [
  [
    "Submitted",
    "Google has not yet shown a final decision.",
    "Wait for the decision. Do not submit another appeal for the same issue.",
  ],
  [
    "Approved",
    "Google has approved the appeal.",
    "Follow the status of the Business Profile and any instructions Google provides.",
  ],
  [
    "Not approved",
    "The reinstatement request has been denied.",
    "Review the first appeal before considering the additional-review route.",
  ],
  [
    "Can't be appealed",
    "Google lists this separately from Not approved.",
    "Follow the instructions Google provides for that restriction. Do not assume the additional-review route applies.",
  ],
  [
    "Eligible for appeal",
    "Google is showing that an appeal route is available.",
    "Prepare the case before submitting it.",
  ],
]

const decisionSaves = [
  "the status shown in the appeals tool",
  "Google's decision email",
  "the moderation reason",
  "the policy link",
  "the affected Business Profile",
  "the date of the decision",
]

const firstAppealRecord = [
  "the explanation you gave Google",
  "the documents you uploaded",
  "the business name shown on those documents",
  "the addresses shown",
  "the profile information you were trying to support",
  "anything important that was missing",
]

const profileRechecks = [
  "Is the business eligible for a Business Profile?",
  "Does the business name reflect the real-world business?",
  "Is the address or service-area setup correct?",
  "Are the categories accurate?",
  "Is the website correct?",
  "Is the phone number correct?",
  "Are the opening hours accurate?",
  "Is there another profile or duplicate creating confusion?",
  "Could the issue involve the Google Account rather than one profile?",
]

const usefulChanges = [
  "a relevant document that was missing",
  "clearer evidence connecting the business to its location",
  "better evidence of the real-world business name",
  "clarification of a genuine legal-name or trading-name difference",
  "a real profile inaccuracy that has now been corrected where appropriate",
  "clearer information about how the business operates",
  "evidence that directly addresses the policy Google identified",
]

const evidenceQuestions = [
  "What fact does this document prove?",
  "Was that fact weak or missing in the first appeal?",
  "Is the document genuinely connected to this business or location?",
  "Does it add something useful rather than duplicate evidence already submitted?",
]

const consistencyChecks = [
  "Business name",
  "Legal entity name",
  "Trading name",
  "Address",
  "Service-area setup",
  "Website",
  "Phone number",
  "Category",
  "Ownership",
  "Business location",
]

const mistakes = [
  [
    "Sending the same appeal again",
    "If nothing in the case is clearer, corrected or better supported, repeating the same submission may not address the reason it failed.",
  ],
  [
    "Treating Not approved as a full diagnosis",
    "The decision tells you the result. Do not invent a more specific cause than Google has shown you.",
  ],
  [
    "Changing several profile fields at random",
    "Only make changes where the existing information is genuinely inaccurate.",
  ],
  [
    "Uploading more documents without knowing what they prove",
    "New evidence should add useful information, not just increase the file count.",
  ],
  [
    "Creating a replacement Business Profile",
    "Do not create a duplicate profile as a workaround for the rejected appeal.",
  ],
  [
    "Ignoring an account-level restriction",
    "If several profiles were affected together, check whether the Google Account itself is restricted.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "My appeal still says Submitted",
    [
      "You do not yet have a final rejection if the appeals tool still shows Submitted.",
      "Google says appeal reviews and decisions can take up to five working days. Do not submit another appeal for the same issue while you are waiting.",
      "Save the current status and monitor the existing appeal.",
    ],
  ],
  [
    "I forgot to include useful evidence",
    [
      "Do not submit an overlapping appeal simply because evidence was missed.",
      "Keep the additional evidence ready and wait for the decision on the existing appeal.",
      "If the reinstatement request is denied and Google's additional-review route is available, assess whether that evidence genuinely adds something that was missing from the original case.",
    ],
  ],
  [
    "I found incorrect information on the profile after the rejection",
    [
      "Work out whether the information is genuinely inaccurate and whether Google's current process allows it to be corrected.",
      "Do not change the profile simply to make the next submission look different.",
      "The Business Profile should represent the real business accurately.",
    ],
  ],
  [
    "Several profiles I manage were rejected or suspended",
    [
      "Check whether the issue may involve the Google Account rather than several separate profile problems.",
      "If Google has restricted the account, follow the account-level appeal route first.",
      "Repeatedly appealing individual profiles may not address the underlying restriction.",
    ],
  ],
]

const readinessChecks = [
  "I have confirmed Google's actual appeal status.",
  "I have saved the decision and policy information.",
  "I know what I submitted in the first appeal.",
  "I have checked the profile against the real business.",
  "I understand any name, address or ownership differences.",
  "I know what was missing, unclear or inaccurate the first time.",
  "Any additional evidence adds useful information.",
  "I am not creating a duplicate Business Profile.",
  "I have checked whether the issue could be at Google Account level.",
  "Google's additional-review route is actually available for my case.",
]

const googlePoints = [
  "Google's appeals tool can show statuses including Submitted, Approved, Not approved, Can't be appealed and Eligible for appeal.",
  "Google says appeal reviews and decisions can take up to five working days.",
  "Google says not to submit multiple appeals for the same issue before receiving a decision.",
  "Google says not to create another Business Profile for the same business while an appeal is under review.",
  "Before appealing, the Business Profile should follow Google's guidelines.",
  "If a reinstatement request is denied, Google says an additional review may be available.",
  "Google says additional evidence not included with the original appeal can be provided during that additional review.",
  "Google says an account restriction can affect Business Profiles managed by that Google Account.",
  "Businesses in the EEA may have additional redress options.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-suspended-before-appeal":
    "What to check before the first appeal, including eligibility, profile accuracy, evidence and Google's appeal process.",
  "google-business-profile-appeal-evidence-checklist":
    "How to organise relevant records, check name and address consistency and prepare before Google's timed evidence step.",
}

function ContextualCta({
  heading,
  body,
  ctaLabel = "Start your Profile Recovery assessment",
}: {
  heading: string
  body: string
  ctaLabel?: string
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

export function AppealRejectedPilotView({
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
        <p className={styles.eyebrow}>Profile Recovery</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            If Google has marked your Business Profile appeal as not approved, don&apos;t immediately
            send the same case again. First confirm the decision, look again at the policy Google
            linked, and work out what the first appeal failed to establish.
          </p>
          <p>
            Google says an additional review may be available after a denied reinstatement request,
            and you may be able to provide evidence that was not included with the original appeal.
            Treat that as an opportunity to improve the case, not simply repeat it.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 10 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>First, check what status Google actually shows</h2>
        <p>The next step depends on the status shown in Google&apos;s appeals tool.</p>
        <div className={styles.statusBoard}>
          {statuses.map(([status, meaning, action]) => (
            <div className={styles.statusRow} key={status}>
              <strong className={styles.statusName}>{status}</strong>
              <div className={styles.statusMeta}>
                <span className={styles.statusKicker}>Meaning</span>
                <p>{meaning}</p>
              </div>
              <div className={styles.statusMeta}>
                <span className={styles.statusKicker}>Action</span>
                <p>{action}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <strong>If your status still says Submitted</strong>
          <p>Google says appeal reviews and decisions can take up to five working days.</p>
          <p>Do not submit another appeal for the same issue while you are waiting for the decision.</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure what Google's decision means for your case?"
        body="Tell us what status Google shows, which policy it linked and what you submitted the first time. We can help you work out what needs attention before you take another step."
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Save the decision before you change anything</h2>
        <p>
          Do not rely only on memory, an email subject line or the fact that the profile is still
          unavailable. Open Google&apos;s appeals tool using the Google Account connected to the
          affected Business Profile.
        </p>
        <div className={styles.compactCard}>
          <h3>Save</h3>
          <ul>
            {decisionSaves.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          A status such as Not approved tells you the result of the appeal. It does not necessarily
          tell you every underlying problem with the profile.
        </p>
        <p>Do not fill the gaps with guesses.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reconstruct what you submitted the first time</h2>
        <p>
          Before looking for new evidence, rebuild the first appeal as accurately as you can. You
          need to know what Google was asked to review before deciding what could genuinely improve
          the case.
        </p>
        <h3>Record what you submitted</h3>
        <div className={styles.compactCard}>
          <ul>
            {firstAppealRecord.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <h3>Which situation are you dealing with?</h3>
        <div className={styles.decisionSplit}>
          <div>
            <b>Option A</b>
            <p>The profile was accurate, but the first appeal did not clearly support an important fact.</p>
            <span className={styles.decisionNext}>
              → Look for genuinely useful additional evidence or clearer context.
            </span>
          </div>
          <div>
            <b>Option B</b>
            <p>The first appeal was defending information that itself needed correcting.</p>
            <span className={styles.decisionNext}>
              → Deal with the underlying accuracy or policy issue first.
            </span>
          </div>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check the profile again before asking for another review</h2>
        <p>
          A denied appeal does not remove the need for the Business Profile to follow Google&apos;s
          guidelines. Go back to the policy Google linked and compare the profile with the business
          as it actually operates.
        </p>
        <div className={styles.checkGrid}>
          {profileRechecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>The aim is not to find a random edit that might trigger reinstatement.</p>
        <p>Only change profile information when there is a factual reason to change it.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What would make the next review genuinely stronger?</h2>
        <p>
          Google says additional evidence that was not included with the original appeal can be
          provided during an additional review. Before adding anything, identify what was missing,
          unclear or inconsistent the first time.
        </p>
        <h3>Useful changes might include</h3>
        <ul className={styles.tickList}>
          {usefulChanges.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className={styles.keyQuestion}>
          <span className={styles.statusKicker}>Ask one question</span>
          <strong>What important fact is clearer now than it was in the first appeal?</strong>
          <p>
            If you cannot answer that question, simply sending more of the same material may not
            improve the case.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>New evidence should add information, not just volume</h2>
        <p>
          More documents do not automatically make a stronger case. Additional evidence is useful
          when it establishes something important that the first appeal did not establish clearly
          enough.
        </p>
        <h3>Before adding a document, ask:</h3>
        <div className={styles.questionGrid}>
          {evidenceQuestions.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
        <p>Use relevant, genuine evidence rather than repetition.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-appeal-evidence-checklist"
        >
          See the Google Business Profile appeal evidence checklist →
        </Link>
      </section>

      <ContextualCta
        heading="Have new evidence but aren't sure whether it changes the case?"
        body="We can review the original appeal, the profile setup and the additional evidence before you decide whether another review request is the right next step."
        ctaLabel="Get your case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Compare the profile and evidence side by side</h2>
        <p>
          A genuine difference is not automatically a policy violation, but it should be understood
          before another review.
        </p>
        <div className={styles.checkGrid}>
          {consistencyChecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          For example, a legal company name and a public trading name may legitimately differ.
          Understand the reason and present the business accurately rather than editing records or
          profile information simply to make them look identical.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Were several profiles affected at the same time?</h2>
        <p>
          If several Business Profiles managed through the same Google Account were affected
          together, check whether the restriction may be at account level.
        </p>
        <div className={styles.accountSplit}>
          <div>
            <h3>One profile affected</h3>
            <p>Continue reviewing the affected profile and appeal.</p>
          </div>
          <div>
            <h3>Several profiles affected together</h3>
            <p>Check whether Google has restricted the account managing them.</p>
          </div>
        </div>
        <p>
          Google says an account restriction can suspend Business Profiles managed by that account
          and prevent the account from creating or claiming other profiles. Its guidance says the
          account restriction should be appealed and lifted before appealing the affected Business
          Profile suspension.
        </p>
        <p>
          Do not repeatedly appeal individual profiles if the underlying restriction is at account
          level.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <div className={styles.warning}>
          <strong>Don&apos;t create another profile as a workaround</strong>
          <p>
            Google tells businesses not to create a new Business Profile for the same business while
            an appeal is under review.
          </p>
          <p>
            A rejected appeal also does not automatically mean you should abandon the existing
            profile and create a duplicate.
          </p>
          <p>Keep the case within Google&apos;s official reinstatement and review routes.</p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What does &quot;additional review&quot; mean?</h2>
        <p>
          Google&apos;s current suspension guidance says that if a reinstatement request is denied,
          it may be able to perform an additional review.
        </p>
        <p>
          That wording matters. An additional review should not be presented as guaranteed in every
          case, and it is different from repeatedly submitting the original appeal while a decision
          is still pending.
        </p>
        <div className={styles.reviewPath}>
          <div className={styles.reviewPathStep}>Denied reinstatement request</div>
          <div className={styles.reviewPathArrow} aria-hidden="true">
            ↓
          </div>
          <div className={styles.reviewPathStep}>Review what was missing, inaccurate or weak</div>
          <div className={styles.reviewPathArrow} aria-hidden="true">
            ↓
          </div>
          <div className={styles.reviewPathStep}>
            If Google&apos;s additional-review route is available, submit a clearer case with
            genuinely useful new information
          </div>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if Google says &quot;Can&apos;t be appealed&quot;?</h2>
        <p>
          Google lists Can&apos;t be appealed separately from Not approved. Do not treat the two
          statuses as though they mean the same thing.
        </p>
        <p>
          Google&apos;s additional-review guidance refers to a reinstatement request that has been
          denied. If the appeals tool says Can&apos;t be appealed, follow the instructions Google
          provides for that restriction and use Google&apos;s support route where appropriate.
        </p>
        <p>Do not invent an additional-review entitlement that Google has not shown you.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the business is in the EEA</h2>
        <p>
          Google&apos;s current guidance says businesses located in a European Economic Area member
          state or territory may have additional redress options. Its broader appeal guidance also
          refers to out-of-court dispute settlement options in the EEA.
        </p>
        <p>
          These options are location-specific and separate from the normal Business Profile appeal
          process.
        </p>
        <p>Follow Google&apos;s current regional guidance for the business location.</p>
        <p className={styles.eeaNote}>
          This section explains Google&apos;s published process. It is not legal advice.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Where businesses commonly go wrong after a rejected appeal</h2>
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
        <h2>What if my rejected appeal situation is different?</h2>
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
        <h2>Before requesting another review</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If you cannot confidently answer one of these points, resolve it before sending another
          review request.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile rules with
          ProfileRelaunch&apos;s practical case-review advice. These are the main points that come
          directly from Google&apos;s current Help pages:
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
            A rejected appeal is a reason to reassess the case, not simply repeat it. Confirm the
            decision, understand what the first submission did and did not establish, and only add
            information that genuinely improves the case.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review the rejected appeal before you try again?</h2>
        <p>You don&apos;t need to guess what was missing from the first submission.</p>
        <p>
          Tell us what Google decided, what you submitted and what evidence you now have. We&apos;ll
          review the situation and help you understand the appropriate next step.
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
          {appealRejectedWhatNextSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile guidance and was
          last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}

export const appealRejectedPilotSlug = "google-business-profile-appeal-rejected-what-next"
