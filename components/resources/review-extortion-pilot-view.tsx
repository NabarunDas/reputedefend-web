import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleReviewExtortionSources } from "@/lib/resource-articles/google-review-extortion"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const urgentSteps = [
  [
    "Do not pay or bargain",
    "Do not offer money, goods, services, discounts or favours in exchange for making the reviews disappear.",
  ],
  [
    "Preserve the demand",
    "Save the messages, emails, chats, screenshots and other communications exactly as received.",
  ],
  [
    "Save the review evidence",
    "Keep direct review links, reviewer names, ratings, text, dates and screenshots for the reviews you reasonably believe are connected.",
  ],
  [
    "Use Google's dedicated extortion route",
    "Prepare the evidence and report the incident through Google's negative-review extortion process for merchants.",
  ],
] as const

const demandTypes = [
  "Money",
  "Goods",
  "Free services",
  "Discounts",
  "Credit",
  "Vouchers",
  "Favours",
  "Another form of compensation",
]

const doNotOffer = [
  "a smaller payment",
  "free products",
  "free work",
  "discounts",
  "credit",
  "vouchers",
  "another service",
  "another favour",
]

const preserveComms = [
  "Screenshots",
  "Original messages where available",
  "Emails",
  "Chat conversations",
  "Contact details",
  "Dates and times",
  "Payment instructions",
  "Account names",
  "Relevant attachments",
  "Full conversation context where available",
]

const reviewRecord = [
  "Direct review link",
  "Reviewer display name",
  "Star rating",
  "Review text",
  "Date shown",
  "Screenshot",
  "When you first noticed it",
]

const identifiers = [
  "Name",
  "Username",
  "Email address",
  "Phone number",
  "WhatsApp account",
  "Telegram account",
  "Social-media profile",
  "Payment account",
  "Website",
  "Company name they claimed to represent",
]

const timelinePoints = [
  "First suspicious review appears",
  "Additional reviews appear, if applicable",
  "First message or contact arrives",
  "Demand is made",
  "Person says what they want and what they will do in return",
  "Further review activity occurs, if applicable",
  "Incident is reported",
]

const strongerConnections = [
  "The person identifies the reviews directly",
  "They send links or screenshots of the reviews",
  "The demand refers to removing specific reviews",
  "Timing closely connects the review activity and demand",
  "The same contact claims control over the reviews",
  "The communication describes what will happen if you comply or refuse",
]

const caseShouldMakeClear = [
  "Which business is affected",
  "Which review activity you believe is connected",
  "Who contacted you, using the identifiers you actually have",
  "How they contacted you",
  "What they demanded",
  "What they offered or threatened in relation to the reviews",
  "What evidence connects the demand to the review activity",
]

const commercialDisputes = [
  "A refund",
  "A bill",
  "Workmanship",
  "A cancellation",
  "A deposit",
  "Another commercial issue",
]

const channelPreserve = [
  "Username",
  "Phone number",
  "Email",
  "Profile name",
  "Date",
  "Time",
  "Full conversation context",
]

const scamSignals = [
  "Requests for payment through unusual methods",
  "Offers to create positive reviews",
  "Threats of additional one-star reviews",
  "Claims that the person can control Google's review system",
  "Offers to remove reviews for payment",
  "Requests for Business Profile access",
  "Requests for passwords or verification codes",
  "Pressure to act immediately before more reviews appear",
]

const cannotGuarantee = [
  "that every review will be removed",
  "how long Google's investigation will take",
  "that a report will produce a particular outcome",
]

const mistakes: [string, string][] = [
  [
    "Paying because the business is under pressure",
    "Payment does not give the business control over the reviews and does not guarantee that the demands will stop.",
  ],
  [
    "Bargaining for a lower price",
    "Do not offer money, goods, discounts or services in an attempt to negotiate review removal.",
  ],
  [
    "Saving screenshots but not direct review links",
    "Keep both. Screenshots preserve what was visible; direct links identify the actual Google contributions.",
  ],
  [
    "Treating every bad review as part of the extortion incident",
    "Connect only the reviews you have a reasonable basis to associate with the demand.",
  ],
  [
    "Guessing the person's identity",
    "Record the identifiers actually used. Do not claim more than the evidence supports.",
  ],
  [
    "Failing to record the timeline",
    "The sequence of reviews, contact and demand may help explain the incident.",
  ],
  [
    "Calling a review spike proof of extortion",
    "A sudden cluster can also follow a real event involving genuine customers.",
  ],
  [
    "Using the extortion form for ordinary fake or spam reviews",
    "Google has a separate ordinary review-reporting process for policy issues without a direct demand.",
  ],
  [
    "Sharing account credentials",
    "Review assistance does not require handing over passwords, OTPs or verification codes.",
  ],
  [
    "Assuming the report guarantees removal",
    "Google investigates and makes the final decision.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "Several one-star reviews appeared and then we received a WhatsApp demand",
    [
      "Preserve both parts of the incident.",
      "Save direct links and screenshots for the reviews.",
      "Preserve the full WhatsApp conversation, including the phone number, profile name, dates and times.",
      "Record exactly what was demanded and what the sender said would happen to the reviews in return.",
      "The timing can support the connection, but describe what the sender actually said rather than relying only on the review spike.",
    ],
  ],
  [
    "A customer says they will remove their review if we refund them",
    [
      "Look carefully at the underlying dispute and the exact wording.",
      "A genuine customer may legitimately ask for a refund or dispute a transaction.",
      "Do not automatically label every refund dispute involving a review as extortion.",
      "The relevant question is whether review removal is being made conditional on receiving money, goods, services or favours in a way that fits Google's dedicated extortion process.",
      "Preserve the communication and keep the commercial dispute separate from the review-policy assessment.",
    ],
  ],
  [
    "The person says they can also add positive reviews if we pay",
    [
      "Preserve that offer.",
      "Google's review policies prohibit fake engagement and manipulated review activity.",
      "Do not buy positive reviews as a way to offset the negative ones.",
      "Use the appropriate Google reporting route for the conduct and preserve the evidence connecting the offer to the incident.",
    ],
  ],
  [
    "The person is threatening more reviews if we do not pay",
    [
      "Preserve the threat exactly as received.",
      "Record when it arrived, the account or contact used and what the person demanded.",
      "Save any reviews already posted and any later reviews that you reasonably believe are connected.",
      "Do not pay or bargain for the threats to stop.",
    ],
  ],
  [
    "We have suspicious reviews but nobody has demanded anything",
    [
      "That is not the dedicated extortion scenario described in Google's merchant extortion guidance.",
      "Assess the reviews under Google's ordinary review and Maps content policies.",
      "If they appear fake, spammy, conflicted or otherwise prohibited, use the normal review-reporting process.",
    ],
  ],
]

const readinessChecks = [
  "I have preserved the original demand.",
  "I have recorded exactly what was requested.",
  "I have recorded what the person said would happen to the reviews in return.",
  "I have saved direct links to the reviews I reasonably believe are connected.",
  "I have saved relevant screenshots.",
  "I have preserved the identifiers used to contact the business.",
  "I have built a simple timeline.",
  "I can explain why I believe the demand and review activity are connected.",
  "I am not including unrelated negative reviews without evidence.",
  "I have not altered messages or screenshots.",
  "I have not paid or bargained for review removal.",
  "I am not sharing passwords, OTPs or verification codes.",
  "I am using Google's dedicated extortion route rather than an unrelated reporting process.",
]

const googlePoints = [
  "Google has a dedicated reporting route for merchants directly subjected to negative-review extortion.",
  "Google's guidance tells businesses not to engage with or pay malicious individuals.",
  "Google tells businesses not to offer money or services to resolve the demand.",
  "Google advises businesses to gather evidence immediately.",
  "Google advises preserving communications and review links.",
  "A sudden increase in low-star reviews followed by a demand is one example Google gives of how an extortion scam may appear.",
  "Google's ordinary review-reporting process remains separate from the dedicated extortion route.",
  "Google's fake-engagement policy covers non-genuine and manipulated review activity.",
  "Google investigates reports and makes the final decision.",
]

const relatedCopy: Record<string, string> = {
  "google-review-bombing":
    "How to preserve and assess a sudden cluster of suspicious reviews without assuming that timing alone proves manipulation.",
  "customer-threatening-bad-google-review":
    "How to distinguish an ordinary customer dispute from coercive review behaviour and preserve the communication accurately.",
  "offered-to-remove-google-reviews-for-money":
    "How to assess a paid review-removal offer without confusing legitimate policy support with guarantees, impersonation or unsafe access requests.",
}

const businessProfileSources = googleReviewExtortionSources.filter(
  (source) => source.name === "Google Business Profile Help",
)
const mapsHelpSources = googleReviewExtortionSources.filter((source) => source.name === "Google Maps Help")
const mapsPolicySources = googleReviewExtortionSources.filter(
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

export function ReviewExtortionPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.extortionPage}`}>
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
            If somebody posts or controls negative review activity and then demands money, goods,
            services or favours in exchange for making it disappear, treat that differently from an
            ordinary bad review. Google has a dedicated reporting route for negative-review extortion
            affecting merchants.
          </p>
          <p>
            Do not pay or bargain for review removal. Preserve the demand, the review links and the
            connection between them before messages, accounts or review content change.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If this is happening now, do these four things first</h2>
        <div className={`${styles.process} ${styles.fourProcess}`}>
          {urgentSteps.map(([title, body], index) => (
            <div className={styles.processStep} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>The demand is the key fact</h3>
          <p>A one-star review is not proof of extortion.</p>
          <p>Several one-star reviews are not proof of extortion.</p>
          <p>
            What changes the situation is evidence that somebody is demanding something of value in
            exchange for removing, stopping or controlling the negative review activity.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Dealing with a review demand and need help organising the case?"
        body="Tell us what appeared, what the person demanded and what evidence you already have. We can help you organise the information without needing your password or verification codes."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Start with the demand, not the star rating</h2>
        <p>Write down exactly what the person asked for and what they said would happen in return.</p>
        <p>The demand may involve:</p>
        <div className={styles.checkGrid}>
          {demandTypes.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div className={styles.decisionSplit}>
          <div>
            <h3>What are they asking for?</h3>
            <p>Record the thing of value being demanded.</p>
          </div>
          <div>
            <h3>What are they promising or threatening in return?</h3>
            <p>Record what they say will happen to the reviews if you comply or refuse.</p>
          </div>
        </div>
        <p>Use the person&apos;s actual wording where possible.</p>
        <p>Do not translate an unclear message into a stronger accusation than the evidence supports.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not pay to make the reviews disappear</h2>
        <p>
          The pressure to pay can be intense, especially when a business can see its rating falling.
        </p>
        <p>Payment does not give you control over the person making the demand.</p>
        <p>It does not guarantee that reviews will be removed.</p>
        <p>It does not guarantee that more reviews will not appear.</p>
        <p>Do not respond by offering:</p>
        <ul className={styles.proseList}>
          {doNotOffer.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If communications already exist, preserve them.</p>
        <p>Do not deliberately prolong the conversation simply to manufacture more evidence.</p>
        <p>Use what genuinely happened.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve the demand before messages or accounts change</h2>
        <p>
          Digital evidence can change quickly. Accounts can disappear, messages can be deleted and
          usernames or review text can change.
        </p>
        <div className={styles.compactCard}>
          <h3>Keep</h3>
          <ul>
            {preserveComms.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Do not alter screenshots.</p>
        <p>Do not rewrite messages.</p>
        <p>Keep the original material wherever possible.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Save direct links to the reviews connected to the demand</h2>
        <p>A screenshot records what you saw. A direct review link helps identify the actual Google contribution.</p>
        <p>For each review you reasonably believe is connected, record:</p>
        <div className={styles.checkGrid}>
          {reviewRecord.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>If several reviews appeared together, keep them as separate entries in your evidence record.</p>
        <p>Do not automatically include every negative review on the profile.</p>
        <p>Include the reviews you have a reasonable basis to connect to the incident.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve the identifiers the person actually used</h2>
        <p>Keep whatever identifiers appeared in the real communication.</p>
        <p>Examples:</p>
        <div className={styles.compactCard}>
          <ul>
            {identifiers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Do not guess the person&apos;s real identity.</p>
        <p>Do not claim that two accounts belong to the same person unless you have evidence for that.</p>
        <p>Preserve what you received rather than trying to conduct your own undercover investigation.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Put the incident into a simple timeline</h2>
        <p>
          A short timeline can make the connection between review activity and the demand much easier
          to understand.
        </p>
        <ol className={styles.extortionTimeline}>
          {timelinePoints.map((item, index) => (
            <li key={item}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <p>Use actual dates and times where available.</p>
        <p>
          If you only know something happened around a particular morning or day, record that honestly
          rather than inventing an exact timestamp.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Explain why you believe the demand and reviews are connected</h2>
        <p>This is the centre of the case.</p>
        <p>Ask:</p>
        <p className={styles.keyQuestion}>
          <strong>Why do I believe these reviews and this demand are connected?</strong>
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Stronger connections can include</h3>
            <ul>
              {strongerConnections.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Weaker evidence</h3>
            <p>
              A cluster of bad reviews appeared and an unrelated suspicious message also arrived, but
              there is no clear connection between them.
            </p>
          </div>
        </div>
        <p>Weak suspicion should not be presented as certainty.</p>
        <p>Describe the actual connection and let Google assess the evidence.</p>
      </section>

      <ContextualCta
        heading="Have the messages and review links but aren't sure how to organise them?"
        body="We can help you separate the demand, the review evidence and the timeline so the case is easier to understand before you submit it."
        ctaLabel="Get your case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use Google&apos;s dedicated merchant extortion route</h2>
        <p>
          Google provides a specific reporting route for businesses directly subjected to
          negative-review extortion.
        </p>
        <p>
          Use Google&apos;s official negative-review extortion Help page and the merchant reporting
          process linked from it.
        </p>
        <p>Prepare the evidence before submitting.</p>
        <p>Your case should make clear:</p>
        <ul className={styles.proseList}>
          {caseShouldMakeClear.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Provide accurate information to the best of your ability.</p>
        <p>Do not embellish the incident to make it sound more serious.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Extortion reporting and ordinary review reporting are different routes</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Use the extortion route when</h3>
            <p>
              Somebody directly demands money, goods, services or favours in exchange for removing,
              stopping or controlling negative review activity.
            </p>
          </div>
          <div>
            <h3>Use ordinary review reporting when</h3>
            <p>
              A review appears fake, spammy, off-topic, conflicted, abusive or otherwise
              policy-violating, but there is no direct demand tied to review removal.
            </p>
          </div>
        </div>
        <p>A policy-violating review is not automatically extortion.</p>
        <p>
          An extortion incident can also involve reviews that need separate assessment under Google&apos;s
          normal content policies.
        </p>
        <p>Keep the questions separate:</p>
        <p className={styles.keyQuestion}>
          <strong>What policy issue does the review raise?</strong>
        </p>
        <p>and</p>
        <p className={styles.keyQuestion}>
          <strong>Is there a direct demand tied to review removal?</strong>
        </p>
        <Link className={styles.inlineLink} href="/resources/can-a-google-review-be-removed">
          Read the normal Google review-removal process →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A sudden review spike is a warning sign, not the whole case</h2>
        <p>
          Google gives a sudden increase in low-star reviews followed by a demand as an example of how
          review-extortion scams may appear.
        </p>
        <p>The sequence can therefore be useful evidence.</p>
        <p>But a review spike on its own does not prove extortion.</p>
        <p>
          A real incident involving several genuine customers can also create a sudden wave of negative
          feedback.
        </p>
        <p>
          Preserve the pattern, but establish the connection between the review activity and the person
          asking for payment or favours.
        </p>
        <Link className={styles.inlineLink} href="/resources/google-review-bombing">
          Multiple suspicious reviews at once? Read the review bombing guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Money being mentioned does not automatically make a customer dispute extortion</h2>
        <p>A genuine customer may have a real dispute about:</p>
        <ul className={styles.proseList}>
          {commercialDisputes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Do not automatically describe an ordinary customer complaint as extortion simply because
          money is involved.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Ordinary commercial dispute</h3>
            <p>A customer is arguing about payment, refund, service or another part of a genuine transaction.</p>
          </div>
          <div>
            <h3>Possible review extortion</h3>
            <p>
              The person directly makes removal, stopping or control of negative review activity
              conditional on receiving money, goods, services or favours.
            </p>
          </div>
        </div>
        <p>Look at the exact wording and behaviour.</p>
        <p>
          ProfileRelaunch does not determine whether conduct amounts to a criminal offence under local
          law.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The messaging platform does not decide whether the case is genuine</h2>
        <p>A demand may arrive through WhatsApp, Telegram, email, social media or another channel.</p>
        <p>The platform itself does not make the case stronger or weaker.</p>
        <p>Preserve:</p>
        <div className={styles.checkGrid}>
          {channelPreserve.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Keep account credentials out of the conversation</h3>
          <p>
            Do not send Google Account passwords, verification codes, one-time passcodes or other
            security credentials in response to a review demand.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Watch for signs that the incident is part of a wider review scam</h2>
        <p>Possible warning signs include:</p>
        <div className={styles.compactCard}>
          <ul>
            {scamSignals.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Treat these as warning signs to preserve and assess.</p>
        <p>
          Do not hand over account credentials or profile control simply because somebody claims they
          can fix the reviews.
        </p>
        <Link className={styles.inlineLink} href="/resources/google-business-profile-scams">
          Read our Google Business Profile scams guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Reporting the incident does not guarantee a particular review outcome</h2>
        <p>Google investigates the evidence and makes the final decision.</p>
        <p>
          ProfileRelaunch can help a business organise the case, preserve the relevant information and
          understand which Google route applies.
        </p>
        <p>We cannot guarantee:</p>
        <ul className={styles.proseList}>
          {cannotGuarantee.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not make promises that depend on Google&apos;s decision.</p>
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
        <h2>What if my situation is slightly different?</h2>
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
        <h2>Before submitting the extortion report</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is missing, preserve or organise what you genuinely have before
          submitting the report.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published review-extortion and review-policy
          guidance with ProfileRelaunch&apos;s practical evidence-organisation advice. These are the
          main points that come directly from Google&apos;s current guidance:
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
            Make the connection easy to understand without exaggerating it. Preserve the demand,
            preserve the reviews, record the timeline and explain exactly why you believe the review
            activity is tied to what the person asked for.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want help organising the evidence before you report it?</h2>
        <p>
          You don&apos;t need to hand over your Google Account or negotiate with the person making the
          demand.
        </p>
        <p>
          Tell us what happened, what was demanded and what evidence you have. We&apos;ll review the
          material and help you understand how to organise the case and which Google route applies.
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
        <p>Google Maps Help</p>
        <ul>
          {mapsHelpSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available review-extortion, review and Maps
          content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent
          of Google.
        </p>
      </section>
    </article>
  )
}
