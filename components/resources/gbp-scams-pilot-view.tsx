import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleBusinessProfileScamsSources } from "@/lib/resource-articles/google-business-profile-scams"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const gbpHelpSources = googleBusinessProfileScamsSources.filter(
  (source) => source.name === "Google Business Profile Help",
)
const accountHelpSources = googleBusinessProfileScamsSources.filter(
  (source) => source.name === "Google Account Help",
)

const relatedCopy: Record<string, string> = {
  "offered-to-remove-google-reviews-for-money":
    "How to assess a paid Google review or Business Profile service without treating every legitimate professional fee as a scam.",
  "lost-access-to-google-business-profile":
    "What to do when the real problem is an account, role or ownership issue and legitimate control of the existing Business Profile needs to be restored.",
}

const requestRoutes = [
  {
    heading: "Password, OTP or security code",
    examples: [
      "Google Account password",
      "One-time password",
      "PIN",
      "2-Step Verification code",
      "Backup code",
      "Business Profile verification code",
    ],
    risk: "These are authentication secrets.",
    action: "Do not provide them.",
  },
  {
    heading: "Owner or Manager access",
    question:
      "Do you know who the requester is, why they need access and which role the work actually requires?",
    risk: "Approving access gives another Google Account real Business Profile permissions.",
    action: "Verify the requester independently before approving anything.",
  },
  {
    heading: "Payment",
    question:
      "Are they charging for their own professional service, or claiming Google itself requires payment to maintain, verify or reinstate the profile?",
    risk: "Those are not the same thing.",
    action: "Get the service, fee and provider identity clear before paying.",
  },
  {
    heading: "Urgent Google warning",
    examples: [
      '"Your profile will disappear in one hour."',
      '"Send the code now or verification will fail."',
      '"Approve me as owner before the case expires."',
    ],
    risk: "Pressure can push a business into handing over access without checking the real profile state.",
    action: "Open the Business Profile independently and check what Google actually shows.",
  },
  {
    heading: "You already shared something",
    examples: ["Password", "OTP", "Verification code", "Suspicious Manager or Owner access"],
    risk: "This may now be an account-security or ownership incident.",
    action:
      "Secure the Google Account and inspect Business Profile access before attempting ordinary profile fixes.",
  },
] as const

const googleCallPurposes = [
  "Checking business information",
  "Confirming opening hours",
  "Helping with reservations",
  "Confirming prices or availability",
  "Scheduling appointments for Google users",
]

const judgeContactBy = [
  "Who is contacting you",
  "What they are asking for",
  "Whether the request matches the official process",
  "Whether you can verify the contact independently",
]

const publicFacts = [
  "Business name",
  "Category",
  "Phone number",
  "Public address",
  "Opening hours",
  "Reviews",
  "Other information visible on Google",
]

const officialLooking = [
  "An official-sounding company name",
  "A Google logo",
  "A local phone number",
  "A convincing display name",
  "Urgent language",
  "References to real Google products",
]

const otpSecrets = [
  "A one-time password",
  "A PIN",
  "A 2-Step Verification code",
  "A backup security code",
]

const otpChannels = ["Phone", "Email", "SMS", "WhatsApp", "Chat", "A form supplied by an unknown contact"]

const passwordTypes = [
  "Gmail password",
  "Google Account password",
  "Saved browser password",
  "Account-recovery password",
  "Temporary password",
]

const beforeApproving = [
  "Who requested access",
  "Which organisation they represent",
  "Why they need access",
  "Which role they need",
  "How long the access is expected to be required",
]

const unknownRequestSteps = [
  "Preserve the request",
  "Note the requesting account",
  "Check whether anybody inside the business authorised it",
  "Contact the known agency or provider through a trusted channel",
  "Leave the request unapproved if it cannot be verified",
]

const legitimateFees = [
  "Assessment",
  "Evidence preparation",
  "Case support",
  "Profile management",
  "Monitoring",
  "Other defined professional services",
]

const supposedGooglePayments = [
  "Keep the profile live",
  "Verify it",
  "Reinstate it",
  "Prevent immediate deletion",
]

const thirdPartyTransparency = [
  "Who it is",
  "What service it provides",
  "Its fees",
  "Expected results",
  "Changes it makes to the Business Profile",
]

const doNotRelyOn = [
  "Caller ID",
  "Display name",
  "Logo",
  "Email signature",
  "A Google-looking website",
  "Knowledge of public Business Profile information",
]

const urgencyLines = [
  '"Your listing will disappear in one hour."',
  '"Give me the code now or verification will fail."',
  '"Approve me as owner before the case expires."',
  '"Pay today or your profile will be permanently deleted."',
]

const checkProfileFor = [
  "Verification prompts",
  "Restrictions",
  "Current profile visibility",
  "People and access",
  "Pending invitations",
  "Recent edits",
]

const peopleAndAccess = ["Primary owner", "Other owners", "Managers", "Pending invitations"]

const agencyUnderstand = [
  "What role the agency has",
  "Why it needs that role",
  "Who can remove that access",
  "What happens when the relationship ends",
]

const recoverySteps = [
  [
    "Secure the Google Account",
    "Use Google's official account-security and recovery process.",
  ],
  [
    "Review security activity",
    "Check relevant recent security activity, signed-in devices and recovery information.",
  ],
  [
    "Strengthen authentication",
    "Review 2-Step Verification and account recovery settings where appropriate.",
  ],
  [
    "Check Business Profile access",
    "Inspect People and access after the Google Account itself is being secured.",
  ],
] as const

const afterOtpReview = [
  "Google Account security activity",
  "Business Profile access",
  "Recovery information",
  "Signed-in devices where appropriate",
]

const inspectAfterAccess = [
  "People and access",
  "Primary ownership",
  "Other owners",
  "Managers",
  "Business name",
  "Category",
  "Phone number",
  "Website",
  "Address or service area",
  "Opening hours",
  "Other important profile edits",
]

const roleLimitationChecks = [
  "Your current role",
  "The other account's role",
  "Who is primary owner",
  "When your own access was added",
]

const accountChecks = [
  "Password security",
  "2-Step Verification",
  "Recovery information",
  "Signed-in devices",
  "Suspicious account activity",
]

const profileChecks = [
  "Primary owner",
  "Owners",
  "Managers",
  "Pending invitations",
  "Recent profile edits",
]

const duplicateProblems = [
  "Duplicate-profile problems",
  "Ownership confusion",
  "Lost history",
  "Verification issues",
]

const usefulEvidence = [
  "Caller number shown",
  "Date and time",
  "Email address",
  "Message text",
  "Screenshots",
  "Access-request email",
  "Company name used",
  "Payment demand",
  "Suspicious URL recorded as text where safe",
  "Changes made to the Business Profile",
]

const doNotStore = [
  "Passwords",
  "OTPs",
  "PINs",
  "2-Step Verification codes",
  "Verification codes",
  "Backup codes",
]

const prMayNeed = [
  "Screenshots",
  "Google decision messages",
  "Business Profile information",
  "Review links",
  "Legitimate evidence",
  "Authorised Manager access in some managed cases where that role is genuinely appropriate",
]

const prNeverRequest = [
  "Google Account password",
  "One-time password",
  "PIN",
  "2-Step Verification code",
  "Backup code",
  "Business Profile verification code",
]

const afterControl = [
  "A verification problem",
  "A suspension",
  "An unauthorised profile edit",
  "A review problem",
  "Another Business Profile issue",
]

const mistakes = [
  [
    "Believing Google never calls businesses",
    "Google does make some legitimate automated and manual calls. Judge the interaction by what is requested.",
  ],
  [
    "Sharing an OTP because the caller already knows the business name",
    "Business Profile information is often public. Public knowledge does not prove authority to receive an authentication code.",
  ],
  [
    "Treating a Manager invitation as harmless",
    "Access requests grant real permissions. Verify the requester and role before approving.",
  ],
  [
    "Giving an agency the Google Account password",
    "Use Google's Owner and Manager roles instead of password sharing.",
  ],
  [
    "Giving away primary ownership by default",
    "Third-party help does not automatically require primary ownership.",
  ],
  [
    "Assuming every paid service is pretending to be Google",
    "Independent providers can legitimately charge for professional work. Misrepresentation about Google affiliation or mandatory Google fees is the problem.",
  ],
  [
    "Paying a caller who says Google requires a reinstatement fee",
    "Google says it will not try to persuade businesses to pay to maintain, verify or reinstate a Business Profile.",
  ],
  [
    "Clicking the caller's own link to verify them",
    "Reach an official Google route independently.",
  ],
  [
    "Changing profile details before securing a compromised account",
    "If unauthorised access remains, the changes may simply be altered again.",
  ],
  [
    "Creating another Business Profile after compromise",
    "Recover the existing legitimate profile where possible.",
  ],
] as const

const scenarios = [
  [
    "A caller says Google will suspend us unless we pay today",
    [
      "Do not pay during the call.",
      "Do not provide a password, OTP, PIN or verification code.",
      "Google says it does not charge businesses to maintain, verify or reinstate a Business Profile.",
      "End the interaction if necessary.",
      "Then independently open the Business Profile and check whether Google actually shows a restriction or verification problem.",
      "Preserve the caller details.",
    ],
  ],
  [
    "Someone asks for the verification code Google sent us",
    [
      "Do not share it.",
      "Google's Business Profile verification guidance says the verification code should be kept secure and not shared with anyone, including people who manage the profile.",
      "Complete the verification through the legitimate Google interface yourself.",
      "If a provider says it cannot assist unless you send the code, reassess the relationship.",
    ],
  ],
  [
    "We received an Owner or Manager request from an email we do not recognise",
    [
      "Do not approve it until the requester has been verified.",
      "Check whether an employee requested it, your legitimate agency requested it, or another authorised owner recognises it.",
      "Contact the known person or provider using a trusted contact route.",
      "If nobody authorised the request, leave it unapproved and preserve the details.",
    ],
  ],
  [
    "Our legitimate agency needs Business Profile access",
    [
      "That can be normal.",
      "Do not give the agency your personal Google Account password.",
      "Ask which role it needs and why.",
      "Use Google's Owner or Manager access controls.",
      "Keep a business-controlled account as an Owner.",
      "Do not transfer primary ownership unless there is a genuine, understood reason.",
    ],
  ],
  [
    "We gave a caller a password or code and now the profile has changed",
    [
      "Treat this as a security incident first.",
      "Secure the Google Account using official Google account-security and recovery processes.",
      "Then inspect People and access, ownership and recent Business Profile changes.",
      "Preserve evidence of unauthorised changes.",
      "Correct the Business Profile after legitimate control is being restored.",
      "Do not create a replacement listing merely because the existing profile was compromised.",
    ],
  ],
] as const

const readinessChecks = [
  "I have preserved the suspicious call, email or text details where appropriate.",
  "I am not sharing my Google Account password.",
  "I am not sharing an OTP or PIN.",
  "I am not sharing 2-Step Verification or backup codes.",
  "I am not sharing a Business Profile verification code.",
  "I know whether the contact claims to be Google or an independent third party.",
  "I understand that Google can genuinely make some automated or manual calls.",
  "I am judging the interaction by what is being requested.",
  "I have checked the Business Profile independently through Google Search or Maps.",
  "I have reviewed People and access.",
  "I know who the primary owner is.",
  "I know which Owners and Managers currently have access.",
  "I know who sent any pending access request.",
  "I understand why an external provider needs the requested role.",
  "I am using the minimum appropriate access.",
  "I am retaining business ownership or co-ownership.",
  "I am not transferring primary ownership merely because somebody says support requires it.",
  "I understand a legitimate independent provider may charge for its own professional services.",
  "I am not confusing a provider fee with a claimed mandatory Google payment.",
  "If somebody claims to work for Google, I am verifying that independently.",
  "I am not using the suspicious person's own link as my verification method.",
  "If credentials were exposed, I am securing the Google Account before ordinary profile troubleshooting.",
  "If suspicious Business Profile access was granted, I am checking what changed.",
  "I am not creating a duplicate profile because of the incident.",
  "I will not send authentication secrets to ProfileRelaunch.",
]

const googlePoints = [
  "Google advises businesses to limit Business Profile access to people who genuinely need it.",
  "Google tells businesses not to approve Owner or Manager requests from people they do not recognise.",
  "Google warns about fraudulent calls, emails and texts from people claiming to be Google support or Google employees.",
  "Google says it will never ask for a one-time password or PIN.",
  "Google's Business Profile verification guidance says verification codes should be kept secure and not shared with anyone, including people who manage the profile.",
  "Google does make some legitimate automated and manual calls to businesses.",
  "Google provides Owner and Manager roles so authorised users can manage a Business Profile using their own Google Accounts rather than sharing a password.",
  "Owners and Managers have different permissions.",
  "A Business Profile can have several Owners but only one Primary Owner.",
  "Only the Primary Owner can transfer primary ownership.",
  "Google says end customers using third-party Business Profile managers should retain ownership or co-ownership.",
  "Google's third-party policies require appropriate transparency from agencies and other providers.",
  "Google says it will not try to persuade a merchant to pay to maintain a Business Profile, including to verify or reinstate it.",
  "Independent third parties can separately charge for their own professional services.",
  "Google provides official processes for securing a hacked or compromised Google Account.",
  "Google Account security and Business Profile role access should both be checked when control may have been compromised.",
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

export function GbpScamsPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.scamsPage}`}>
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
            A suspicious Google Business Profile contact does not always begin with an obvious demand
            for money. It may begin with a phone call that sounds official, a warning about
            suspension, a request for a verification code, an unexpected manager invitation or
            somebody saying they need access to fix the profile.
          </p>
          <p>
            Do not assume every Google-related call or third-party provider is fraudulent. Instead,
            judge the interaction by what the person is asking you to hand over, approve or pay for.
            Protect authentication secrets, understand every access request and independently verify
            who you are dealing with before giving away control.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What is the person asking you to do?</h2>
        <p>
          The safest first check is not whether the caller sounds convincing. It is what action they
          want from you.
        </p>
        <div className={styles.fiveRoute}>
          {requestRoutes.map((route, index) => (
            <div key={route.heading}>
              <b className={styles.statusKicker}>Request {index + 1}</b>
              <h3>{route.heading}</h3>
              {"question" in route ? (
                <p>
                  <strong>Question.</strong> {route.question}
                </p>
              ) : null}
              {"examples" in route ? (
                <>
                  <p>
                    <strong>Examples.</strong>
                  </p>
                  <ul>
                    {route.examples.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                <strong>Risk.</strong> {route.risk}
              </p>
              <p>
                <strong>Action.</strong> {route.action}
              </p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Never trade account security for urgency</h3>
          <p>A genuine Business Profile issue can need attention.</p>
          <p>
            That does not make it safe to hand over passwords, codes or unverified access.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Received a suspicious Google-related call, message or access request?"
        body="Tell us what the person asked for, what access they requested and what the Business Profile currently shows. We can help you separate an ordinary Google or third-party interaction from a Business Profile security problem."
        ctaLabel="Start your Review Protection assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google can genuinely call businesses</h2>
        <p>Do not tell businesses that every Google-related phone call is fraudulent.</p>
        <p>
          Google&apos;s current guidance says it can use automated calls and, in some situations,
          manual operators for purposes such as:
        </p>
        <ul className={styles.proseList}>
          {googleCallPurposes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          A genuine type of call existing does not prove that the particular caller is genuine.
        </p>
        <p>Judge the contact by:</p>
        <ul className={styles.proseList}>
          {judgeContactBy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Public Business Profile knowledge does not prove Google access</h2>
        <p>A suspicious caller may know:</p>
        <ul className={styles.proseList}>
          {publicFacts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>They may also use:</p>
        <ul className={styles.proseList}>
          {officialLooking.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Much of that information can already be public.</p>
        <p>
          Knowing it does not prove that the person works for Google or has privileged access to the
          Business Profile.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google says it will never ask for your OTP or PIN</h2>
        <div className={styles.warning}>
          <p>Do not give somebody:</p>
          <ul>
            {otpSecrets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>through:</p>
          <ul>
            {otpChannels.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Treat authentication codes as account secrets.</p>
        <p>
          Do not read a code aloud merely because the caller already knows public information about
          the business.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep Business Profile verification codes private too</h2>
        <p>
          Google&apos;s Business Profile verification process can use verification codes in some
          situations.
        </p>
        <p>
          Google&apos;s guidance tells businesses to keep those codes secure and not to share them
          with anyone, including people who manage the Business Profile.
        </p>
        <p>
          A legitimate consultant can explain what verification step Google is requesting.
        </p>
        <p>The business should complete the secure verification step itself where required.</p>
        <p>Do not send a Business Profile verification code to ProfileRelaunch.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>
          A legitimate Business Profile provider should not need your Google Account password
        </h2>
        <p>
          Google provides Owner and Manager roles so authorised people can manage a Business Profile
          using their own Google Accounts.
        </p>
        <p>Do not send a provider:</p>
        <ul className={styles.proseList}>
          {passwordTypes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          A legitimate management relationship should use Google&apos;s Business Profile access
          controls rather than password sharing.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>An Owner or Manager request grants real access</h2>
        <p>An access invitation is not merely a notification.</p>
        <p>Before approving it, identify:</p>
        <ul className={styles.proseList}>
          {beforeApproving.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Google tells businesses not to approve Owner or Manager requests from people they do not
          recognise.
        </p>
        <p>If the requester is unfamiliar, verify them first.</p>
        <p>Do not approve the request &quot;just to see what happens.&quot;</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use the minimum appropriate Business Profile role</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Manager</h3>
            <p>Can perform many day-to-day Business Profile management tasks.</p>
            <p>Does not have the same user-management powers as an Owner.</p>
          </div>
          <div>
            <h3>Owner</h3>
            <p>
              Has broader administrative powers, including sensitive user-management capabilities.
            </p>
          </div>
        </div>
        <p>Do not grant Owner merely because somebody says:</p>
        <p>
          <strong>&quot;Manager will not work.&quot;</strong>
        </p>
        <p>Ask which exact task requires the higher role.</p>
        <p>Use the minimum legitimate access needed for the work.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Primary ownership should stay under deliberate business control</h2>
        <p>A Business Profile can have multiple owners but only one primary owner.</p>
        <p>Do not transfer primary ownership casually.</p>
        <p>
          An agency, consultant or support provider does not automatically need primary ownership
          merely to manage the Business Profile.
        </p>
        <p>
          Google&apos;s third-party guidance says end customers should retain ownership or
          co-ownership of their Business Profile.
        </p>
        <p>The business should always know:</p>
        <ul className={styles.proseList}>
          <li>Who the primary owner is</li>
          <li>Which business-controlled accounts are owners</li>
          <li>Which agencies or providers have access</li>
          <li>Why each external party has that role</li>
        </ul>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not test an unknown requester by granting access</h2>
        <p>If an access request arrives from an email address you do not recognise:</p>
        <ul className={styles.proseList}>
          {unknownRequestSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Security testing should not involve giving an unknown account real Business Profile
          permissions.
        </p>
      </section>

      <ContextualCta
        heading="Unsure whether an access request or provider role is legitimate?"
        body="We can help you check what role is being requested, whether the provider actually needs it and how to keep the business in control without sharing personal Google credentials."
        ctaLabel="Get the access request reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A private service fee is different from a supposed mandatory Google fee</h2>
        <p>
          Google warns about people claiming to be Google support or Google employees while asking
          businesses for money.
        </p>
        <p>
          Google says it will not try to convince a merchant to pay in order to maintain a Business
          Profile, including to have it verified or reinstated.
        </p>
        <p>That does NOT mean every paid Business Profile service is fraudulent.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Legitimate third-party commercial fee</h3>
            <p>
              An independent provider charges for its own clearly described professional work.
            </p>
            <p>Examples can include:</p>
            <ul>
              {legitimateFees.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Supposed mandatory Google payment</h3>
            <p>Somebody claims that Google itself requires a payment to:</p>
            <ul>
              {supposedGooglePayments.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Those are different claims.</p>
        <p>A third party may charge for its service.</p>
        <p>It should not misrepresent that private fee as a mandatory Google charge.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/offered-to-remove-google-reviews-for-money"
        >
          Read our paid review-removal provider guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A legitimate third party should identify itself as a third party</h2>
        <p>
          Google publishes requirements for agencies and other third parties that manage Business
          Profiles.
        </p>
        <p>A professional provider should be transparent about matters such as:</p>
        <ul className={styles.proseList}>
          {thirdPartyTransparency.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>It should not pretend to be Google.</p>
        <p>It should not make false, misleading or unrealistic claims.</p>
        <p>An independent provider should be comfortable saying:</p>
        <p>
          <strong>&quot;We are not Google.&quot;</strong>
        </p>
        <p>ProfileRelaunch must follow the same principle.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If somebody claims to work for Google, verify the claim independently</h2>
        <p>Do not rely only on:</p>
        <ul className={styles.proseList}>
          {doNotRelyOn.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Google&apos;s existing guidance for businesses working with third parties says businesses
          can ask somebody claiming to work for Google for their name and request communication from
          an @google.com email address.
        </p>
        <p>If the contact remains suspicious:</p>
        <p>end the interaction</p>
        <p>and use an official Google route reached independently.</p>
        <p>Do not use the caller&apos;s own link merely to authenticate the caller.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Urgency does not justify handing over credentials</h2>
        <p>Suspicious contacts may say:</p>
        <ul className={styles.proseList}>
          {urgencyLines.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A genuine Business Profile issue may need prompt attention.</p>
        <p>But urgency does not make an unsafe request safe.</p>
        <p>Record what was said.</p>
        <p>Open the Business Profile independently.</p>
        <p>Check the actual Google state.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check what Google actually shows instead of trusting the caller&apos;s description</h2>
        <p>Sign into a legitimate business-controlled Google Account.</p>
        <p>Open the Business Profile through Google Search or Maps.</p>
        <p>Check for:</p>
        <ul className={styles.proseList}>
          {checkProfileFor.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not assume the caller has described the problem accurately.</p>
        <p>
          A suspicious contact may claim there is a suspension or verification problem that is not
          actually shown on the Business Profile.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Review People and access regularly</h2>
        <p>Open:</p>
        <p>
          <strong>Business Profile settings → People and access</strong>
        </p>
        <p>Review:</p>
        <ul className={styles.proseList}>
          {peopleAndAccess.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Remove access that no longer has a legitimate business purpose when you have the
          appropriate permissions.
        </p>
        <p>
          Former employees and old agencies should not remain indefinitely simply because nobody
          reviewed the access list.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/lost-access-to-google-business-profile"
        >
          Read our lost-access and ownership guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A legitimate agency relationship should leave the business with control</h2>
        <p>
          If a third party manages the Business Profile, keep a business-controlled Google Account
          attached to it.
        </p>
        <p>Understand:</p>
        <ul className={styles.proseList}>
          {agencyUnderstand.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not let the Business Profile exist only inside the agency&apos;s Google Account.</p>
        <p>Do not give the agency your personal Google Account password.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If you already shared a password, secure the Google Account first</h2>
        <div className={`${styles.process} ${styles.fourProcess}`}>
          {recoverySteps.map(([heading, body], index) => (
            <div className={styles.processStep} key={heading}>
              <b>Step {index + 1}</b>
              <h3>{heading}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>Do this through official Google Account security routes.</p>
        <p>Do not ask the suspicious contact to &quot;undo&quot; the access.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>
          If you shared an OTP or code, do not assume the risk ended when the code expired
        </h2>
        <p>The important question is whether the code was used while it was valid.</p>
        <p>Review:</p>
        <ul className={styles.proseList}>
          {afterOtpReview.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          If control of the Google Account has been lost, use Google&apos;s official
          account-recovery and compromised-account processes.
        </p>
        <p>Do not keep sending fresh codes to the same person.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If suspicious Business Profile access was approved, inspect what changed</h2>
        <p>Once the Google Account itself is being secured, review the Business Profile.</p>
        <p>Check:</p>
        <ul className={styles.proseList}>
          {inspectAfterAccess.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Preserve evidence of unauthorised changes before correcting them where practical.</p>
        <p>
          Do not create a duplicate Business Profile merely because the existing profile was
          altered.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If you cannot remove suspicious access, check your own role first</h2>
        <p>Owners and Managers do not have identical user-management permissions.</p>
        <p>
          Google can also apply temporary restrictions to some sensitive actions for newly added
          Owners or Managers.
        </p>
        <p>Before assuming the profile is permanently lost, identify:</p>
        <ul className={styles.proseList}>
          {roleLimitationChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Use Google&apos;s appropriate ownership or access process.</p>
        <p>
          Do not abandon the existing Business Profile merely because the first removal attempt is
          unavailable.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google Account security and Business Profile access are related but separate</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Google Account</h3>
            <p>
              <strong>Question.</strong> Who can sign into the Google Account itself?
            </p>
            <p>
              <strong>Check:</strong>
            </p>
            <ul>
              {accountChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Business Profile</h3>
            <p>
              <strong>Question.</strong> Which Google Accounts have permission to manage the
              Business Profile?
            </p>
            <p>
              <strong>Check:</strong>
            </p>
            <ul>
              {profileChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>A person may have compromised:</p>
        <ul className={styles.proseList}>
          <li>The Google Account</li>
          <li>The Business Profile through their own authorised account</li>
          <li>Both</li>
        </ul>
        <p>Securing one does not automatically clean up the other.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create a replacement Business Profile after a security incident</h2>
        <p>
          If the existing profile represents the genuine business, recover control of it where
          possible.
        </p>
        <p>Creating another listing can introduce:</p>
        <ul className={styles.proseList}>
          {duplicateProblems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A security incident does not automatically make the existing profile unusable.</p>
        <p>Recover first.</p>
        <p>
          Only take a different structural route when Google&apos;s actual process requires it.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Preserve suspicious-contact evidence without preserving authentication secrets</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Useful evidence</h3>
            <ul>
              {usefulEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Do not store or forward as ordinary case evidence</h3>
            <ul>
              {doNotStore.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Authentication secrets are not evidence ProfileRelaunch needs customers to send.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>ProfileRelaunch should never request authentication secrets</h2>
        <div className={styles.warning}>
          <p>ProfileRelaunch may need material such as:</p>
          <ul>
            {prMayNeed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>ProfileRelaunch should never request:</p>
          <ul>
            {prNeverRequest.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>The customer remains in control of secure Google authentication steps.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Sometimes the first problem to solve is security, not reinstatement</h2>
        <p>If somebody has obtained account or profile access, the immediate priority may be:</p>
        <ol className={styles.numberedQuestions}>
          <li>Secure the Google Account.</li>
          <li>
            Remove or contain unauthorised Business Profile access through the appropriate Google
            controls.
          </li>
          <li>Re-establish legitimate ownership and control.</li>
        </ol>
        <p>Only after control is being restored should you decide whether there is also:</p>
        <ul className={styles.proseList}>
          {afterControl.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not treat every scam incident as an ordinary suspension appeal.</p>
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
        <h2>What if the suspicious contact looks different?</h2>
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
        <h2>Before giving somebody Business Profile access or following a support request</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before granting access, sending a code or
          making a payment.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile security, access,
          verification and third-party guidance with ProfileRelaunch&apos;s practical
          security-response approach. These are the main points that come directly from Google&apos;s
          current guidance:
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
            Judge the request, not the logo. Protect passwords and authentication codes, verify
            unexpected access independently, give legitimate providers only the access they actually
            need, keep the business in control of ownership and secure the Google Account before
            trying to repair secondary Business Profile problems.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to review a suspicious Business Profile contact or access request?</h2>
        <p>
          You don&apos;t need to send us a password, OTP, PIN or verification code.
        </p>
        <p>
          Tell us what the person claimed, what they asked you to approve or pay for and what the
          Business Profile currently shows. We&apos;ll help you separate a legitimate Business
          Profile process from a security or access problem and identify the appropriate next step.
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
        <p>Google Account Help</p>
        <ul>
          {accountHelpSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile security, access,
          verification, third-party and Google Account guidance and was last reviewed on 14 September
          2026. ProfileRelaunch is independent of Google.
        </p>
      </section>
    </article>
  )
}
