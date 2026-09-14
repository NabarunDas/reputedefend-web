import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { lostAccessToGoogleBusinessProfileSources } from "@/lib/resource-articles/lost-access-to-google-business-profile"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const accessRoutes = [
  [
    "Wrong Google Account",
    "The Business Profile still exists, but the account you are currently using does not manage it.",
    "Check the legitimate Google Accounts historically connected with the business.",
  ],
  [
    "Business account login lost",
    "The correct business-controlled Google Account may own the profile, but nobody can currently sign into it.",
    "Use Google's account-recovery process before treating this as an ownership dispute.",
  ],
  [
    "You still have manager access",
    "You can edit parts of the profile but cannot manage owners or perform certain ownership actions.",
    "Check People and access and identify your actual role.",
  ],
  [
    "Another owner controls the profile",
    "The correct existing profile is verified but controlled by another person, former employee, agency or other Google Account.",
    "Use the appropriate Google ownership-request process.",
  ],
  [
    "Access returned but Google asks for verification",
    "Ownership recovery has progressed but Google still needs to verify the business.",
    "Use the verification options Google provides for that profile.",
  ],
  [
    "Access works, but the profile is suspended or restricted",
    "Ownership and profile policy status are separate issues.",
    "Treat the access problem and suspension/restriction problem separately.",
  ],
] as const

const searchHints = ["Business name", "City", "Business address where appropriate"]

const historicAccounts = [
  "A personal Gmail account",
  "A company Google Account",
  "An account belonging to a director",
  "An old agency account",
  "Accounts belonging to different employees",
]

const managementIndicators = ["You manage this Business Profile", "Manage your Business Profile"]

const maybeInstead = ["Your role", "Verification", "Another owner", "A particular management feature"]

const roles = [
  [
    "Primary owner",
    "There can be only one primary owner.",
    "The primary-owner role is especially relevant when primary ownership needs to be transferred.",
  ],
  [
    "Owner",
    "A Business Profile can have multiple owners.",
    "Owners have substantial control, including user-management capabilities.",
  ],
  [
    "Manager",
    "Managers can perform many normal profile-management tasks but do not have the same ownership and user-management permissions.",
  ],
] as const

const authorisedOwners = ["Director", "Owner", "Business-controlled Google Account"]

const credentialDonts = [
  "Google Account passwords",
  "One-time passcodes",
  "Verification PINs",
  "Two-factor authentication codes",
  "Backup codes",
]

const ownershipApplies = [
  "A former employee controls the profile",
  "An old agency controls it",
  "A previous contractor verified it",
  "A former business partner retains access",
  "Nobody at the current business recognises the managing account",
]

const storefrontFlow = [
  "Find the existing Business Profile.",
  "Select Request access.",
  "Complete the ownership request.",
  "Submit it.",
  "Keep Google's confirmation email.",
]

const ownershipOutcomes = [
  [
    "Approved",
    "The requester receives approval and can manage the Business Profile.",
  ],
  [
    "Denied",
    "Google sends a rejection. Its current guidance provides an ownership-denial appeal route.",
  ],
  [
    "No response",
    "After three days, an option to claim the profile may become available.",
  ],
] as const

const afterApproved = [
  "Check your current role",
  "Open People and access",
  "Identify the primary owner",
  "Identify other owners",
  "Identify managers",
  "Confirm which accounts still have a legitimate reason for access",
]

const deniedDonts = [
  "Creating a duplicate Business Profile",
  "Impersonating the existing owner",
  "Submitting false business records",
  "Repeatedly sending identical requests",
]

const verificationPromises = [
  "Video verification",
  "Phone verification",
  "Email verification",
  "Mail verification",
  "Any other particular method",
]

const existingProfileContains = [
  "Reviews",
  "Photos",
  "Business history",
  "Customer recognition",
  "Existing profile information",
]

const permanentExamples = [
  "The business has been sold",
  "The previous owner is leaving",
  "The original responsible employee has left",
  "Management responsibility has moved to another authorised owner",
]

const sevenDayErrors = [
  "Removing owners or managers",
  "Transferring primary ownership",
  "Certain profile deletion or undeletion actions",
]

const beforeRemoving = [
  "Who the user is",
  "What role they hold",
  "Why they were given access",
  "Whether they still need it",
]

const agencyShouldKnow = [
  "Who the primary owner is",
  "Which business-controlled accounts are owners",
  "Which agencies are owners or managers",
  "Why each third party needs its role",
  "How access will be removed when the relationship ends",
]

const unexpectedConfirm = [
  "Who made the request",
  "Why they need access",
  "Whether the business authorised them",
]

const otpDonts = [
  "Google Account passwords",
  "OTPs",
  "Verification PINs",
  "Two-factor authentication codes",
  "Backup codes",
]

const accessRecord = [
  "Primary owner",
  "Other owners",
  "Managers",
  "Business-controlled Google Accounts",
  "Third-party access",
  "When access was granted",
  "Why access exists",
  "Who should remove access when somebody's role ends",
]

const mistakes: [string, string][] = [
  [
    "Creating a new profile because the old login is unavailable",
    "If the existing profile represents the same business, use account recovery or Google's ownership process rather than creating a duplicate.",
  ],
  [
    "Assuming the profile was hacked before checking the Google Account",
    "Being signed into the wrong account can look like lost ownership.",
  ],
  [
    "Treating manager access as owner access",
    "Managers can perform many tasks but do not have the same ownership and user-management permissions.",
  ],
  [
    "Sharing an old owner's password",
    "Use separate authorised Google Accounts and Business Profile roles.",
  ],
  [
    "Promising automatic ownership after three days",
    "Google says the claim option may appear after no response, but it is not always available.",
  ],
  [
    "Using the storefront ownership route for every service-area business",
    "Google publishes a different route for certain service-area businesses without a customer-facing location.",
  ],
  [
    "Creating another profile after an ownership request is denied",
    "Use the ownership-denial process rather than creating a competing duplicate.",
  ],
  [
    "Thinking the seven-day restriction means access recovery failed",
    "Some sensitive actions are restricted temporarily for new owners and managers.",
  ],
  [
    "Giving an agency primary ownership by default",
    "Professional help does not automatically require surrendering primary control.",
  ],
  [
    "Leaving former employees on the access list indefinitely",
    "Review access when people's roles change.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "Our old employee created the Business Profile and has left",
    [
      "First check whether another current authorised owner still has access.",
      "If one does, that owner may be able to add the correct business-controlled Google Account.",
      "If the former employee controls the verified profile and nobody at the business has ownership access, use Google's ownership-request process.",
      "Do not ask for the former employee's personal Google Account password.",
      "The aim is to give the business legitimate access to the existing profile.",
    ],
  ],
  [
    "Our old marketing agency is still the primary owner",
    [
      "Check whether the business already has owner or manager access.",
      "If the agency is cooperating, the clean route may be to add a business-controlled account as an owner and transfer primary ownership appropriately.",
      "Google advises businesses using third-party managers to retain access.",
      "If the agency no longer cooperates and the business cannot regain control through existing access, use Google's ownership process rather than creating another profile.",
    ],
  ],
  [
    "Nobody knows which Google Account owns the profile",
    [
      "Start with legitimate Google Accounts historically used by the business.",
      "Search for the Business Profile while signed into each likely account and look for management indicators.",
      "If the original business-controlled account exists but its login was forgotten, use account recovery.",
      "If Google shows that somebody else manages the verified profile, move to the ownership-request process.",
    ],
  ],
  [
    "The ownership request was ignored for three days",
    [
      "Check Google's confirmation email or the current ownership workflow.",
      "Google says an option to claim the profile may become available after the three-day response period.",
      "Do not promise that it will.",
      "If the option appears, follow Google's claim and verification steps.",
      "If it does not, continue through Google's published support process rather than creating a duplicate.",
    ],
  ],
  [
    "We regained access but cannot remove the old owner yet",
    [
      "Check when your Google Account became an owner or manager.",
      "Google applies a seven-day limitation to some sensitive actions for newly added users.",
      "During that period, removing users or transferring primary ownership may produce an error.",
      "Do not assume recovery failed.",
      "Wait for the applicable restriction to expire, then use the proper People and access controls.",
    ],
  ],
]

const readinessChecks = [
  "I have found the correct existing Business Profile.",
  "I have confirmed that it represents the correct business.",
  "I have checked legitimate Google Accounts historically used by the business.",
  "I know whether any of those accounts already manage the profile.",
  "If I can access the profile, I have checked People and access.",
  "I know whether I am primary owner, owner or manager.",
  "I know whether another authorised owner can restore my access directly.",
  "I have not asked anybody for their Google password.",
  "I have not shared my own password, OTP, PIN or backup code.",
  "If the original business account login is lost, I have considered account recovery first.",
  "I know whether another person actually controls the verified profile.",
  "I know whether the business is storefront, hybrid or service-area.",
  "I am using the ownership route Google publishes for that business type.",
  "I have preserved any ownership-request confirmation or rejection email.",
  "I understand the current owner normally has three days to respond.",
  "I understand a post-request claim option is not guaranteed.",
  "I understand verification may still be required.",
  "I am not creating a duplicate as a shortcut.",
  "I understand new owners and managers may face seven-day restrictions.",
  "I will retain appropriate business control if a third party helps manage the profile.",
  "I understand access recovery and suspension recovery are separate issues.",
]

const googlePoints = [
  "Business Profiles can have multiple owners but only one primary owner.",
  "Managers can perform many profile-management tasks but do not have the same ownership and user-management permissions as owners.",
  "Google provides an ownership-request process when a verified Business Profile is controlled by somebody else.",
  "Storefront and hybrid businesses can use Google's published request-access flow.",
  "Google publishes a different ownership-support route for certain service-area businesses without a customer-facing location.",
  "After an ownership request, the current owner normally has three days to respond.",
  "An approved request allows the requester to manage the profile.",
  "A denied ownership request can use Google's available denial process.",
  "After no response, an option to claim the profile may become available, but Google says that option is not always available.",
  "Google may still require verification during ownership recovery.",
  "Only the primary owner can transfer primary ownership.",
  "New owners and managers have a seven-day restriction on some sensitive ownership actions.",
  "Google supports separate owner and manager accounts instead of shared passwords.",
  "Google advises businesses to retain access when third parties manage the profile.",
  "Google advises businesses to protect passwords, OTPs, PINs and security credentials.",
  "Google generally expects one Business Profile for each business and provides processes for duplicate and ownership issues.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-verification-stuck-or-rejected":
    "What to check when ownership or access has been restored but Google still requires verification or a verification attempt is not accepted.",
}

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

export function LostAccessPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.accessPage}`}>
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
        <p className={styles.eyebrow}>Verification &amp; Access</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            Losing access to a Google Business Profile does not always mean somebody has taken it over. You
            may be signed into the wrong Google Account, the original business account may need recovery,
            you may still have manager access rather than owner access, or another person may control the
            verified profile.
          </p>
          <p>
            Do not create a replacement listing before you know which problem you actually have. Start with
            the existing Business Profile, the Google Account you are using and the role that account
            currently holds.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Which access problem do you actually have?</h2>
        <p>Work through the situation before starting an ownership request or creating anything new.</p>
        <div className={styles.providerCheck}>
          {accessRoutes.map(([title, meaning, next], index) => (
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
          <h3>Do not start by creating another profile</h3>
          <p>
            If the existing profile represents the same business, recover or transfer appropriate access to
            that profile wherever possible.
          </p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether this is an account, role or ownership problem?"
        body="Tell us what Business Profile you can see, which Google Account you are using and what management options are available. We can help you identify the correct recovery route before you create anything new."
        ctaLabel="Start your Profile Recovery assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>First confirm that the existing Business Profile still exists</h2>
        <p>Search for the business on Google Search and Maps.</p>
        <p>Use information such as:</p>
        <div className={styles.checkGrid}>
          {searchHints.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>When signed into a Google Account that may manage the profile, Google also allows you to search for:</p>
        <p>
          <strong>my business</strong>
        </p>
        <p>
          Do not assume the profile has disappeared simply because it is missing from the account you
          normally use.
        </p>
        <p>Answer two questions first:</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Question 1</h3>
            <p>Does the correct Business Profile still exist?</p>
          </div>
          <div>
            <h3>Question 2</h3>
            <p>Which Google Account, if any, currently manages it?</p>
          </div>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check the legitimate Google Accounts the business has used</h2>
        <p>Many access problems begin with the wrong account.</p>
        <p>A business may historically have used:</p>
        <ul className={styles.proseList}>
          {historicAccounts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Check only legitimate accounts the business is authorised to use.</p>
        <p>Do not exchange passwords between staff while testing accounts.</p>
        <p>Each authorised person should use their own Google Account.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Look for signs that the account already manages the profile</h2>
        <p>Depending on the Google interface, management indicators can include wording such as:</p>
        <ul className={styles.proseList}>
          {managementIndicators.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If those indicators appear, you may not have lost access completely.</p>
        <p>The problem may instead involve:</p>
        <div className={styles.checkGrid}>
          {maybeInstead.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not start an ownership dispute before checking whether the account already manages the profile.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If you can open the profile, check People and access</h2>
        <p>Open:</p>
        <p>Business Profile settings</p>
        <p>then:</p>
        <p>People and access</p>
        <p>where available.</p>
        <p>
          This can show which users currently manage the Business Profile and which role each one holds.
        </p>
        <div className={styles.threeOutcome}>
          {roles.map((role) => (
            <div key={role[0]}>
              <h3>{role[0]}</h3>
              {role.slice(1).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
        <p>Record the role you actually have before deciding that access has been lost.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Being a manager is not the same as being an owner</h2>
        <p>
          A manager may still be able to edit business information and use many Business Profile features.
        </p>
        <p>But Google&apos;s current guidance does not give managers every ownership permission.</p>
        <p>For example, managers cannot perform the same user-management actions as owners.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>You can edit the Business Profile</h3>
          </div>
          <div>
            <h3>You cannot change who has access</h3>
          </div>
        </div>
        <p>This may indicate a role limitation rather than complete loss of access.</p>
        <p>Do not use &quot;manager&quot;, &quot;owner&quot; and &quot;primary owner&quot; interchangeably.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If another legitimate owner still has access, use that route first</h2>
        <p>Sometimes ownership recovery does not require a dispute with Google at all.</p>
        <p>Another authorised:</p>
        <ul className={styles.proseList}>
          {authorisedOwners.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>may still manage the Business Profile.</p>
        <p>
          That owner may be able to add the correct current Google Account through People and access using
          the appropriate role.
        </p>
        <p>
          Do not create a new Business Profile when an authorised existing owner can restore access to the
          current one.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not recover access by sharing somebody else&apos;s Google login</h2>
        <div className={styles.warning}>
          <p>Do not ask:</p>
          <p>&quot;Can you just give me the login?&quot;</p>
          <p>
            Google supports separate owners and managers so authorised people can use their own Google
            Accounts.
          </p>
          <p>Do not share:</p>
          <ul>
            {credentialDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          ProfileRelaunch should never need those credentials to explain or prepare an ownership-recovery
          case.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the original business Google Account cannot be opened, recover the account first</h2>
        <p>Sometimes there is no ownership dispute.</p>
        <p>
          The Business Profile may still belong to the correct business-controlled Google Account, but the
          username, password or account access has been lost.
        </p>
        <p>That is an account-recovery problem.</p>
        <p>Use Google&apos;s account-recovery process before creating another Business Profile.</p>
        <p>
          Recovering the legitimate Google Account may restore access to the existing Business Profile
          without any ownership transfer.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If somebody else controls the verified profile, use Google&apos;s ownership process</h2>
        <p>
          Google provides an ownership-request process when an existing verified Business Profile is
          managed by somebody else.
        </p>
        <p>This can apply where:</p>
        <ul className={styles.proseList}>
          {ownershipApplies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not create a competing duplicate listing as the first response.</p>
        <p>Use the existing profile and the ownership route Google provides.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The ownership route depends on the business type</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Storefront or hybrid business</h3>
            <p>
              Google&apos;s published ownership flow allows an authorised business owner to find the existing
              profile and request access.
            </p>
            <p>Typical flow:</p>
            <ol>
              {storefrontFlow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3>Service-area business without a customer-facing location</h3>
            <p>Google gives different instructions.</p>
            <p>
              Its current ownership guidance directs these businesses to Business Profile support and the
              transfer-ownership route.
            </p>
          </div>
        </div>
        <p>Do not assume every Business Profile has exactly the same ownership-request interface.</p>
        <p>Use the route Google publishes for the actual business type.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-address-and-service-area-rules"
        >
          Read our address and service-area guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The current owner normally has three days to respond</h2>
        <p>
          After an ownership request is submitted, Google says the current owner normally has three days
          to respond.
        </p>
        <div className={styles.threeOutcome}>
          {ownershipOutcomes.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>&quot;May&quot; is important</h3>
          <p>
            Google explicitly says the option to claim the profile after no response is not always
            available.
          </p>
          <p>Do not promise automatic ownership after three days.</p>
        </div>
      </section>

      <ContextualCta
        heading="Another person or agency controls the profile and you're not sure which ownership route applies?"
        body="We can review the current profile, the business type, the access you still have and Google's ownership status before you send another request."
        ctaLabel="Get your access case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the ownership request is approved</h2>
        <p>Google says an approved request allows the requester to manage the Business Profile.</p>
        <p>Once access returns:</p>
        <div className={styles.checkGrid}>
          {afterApproved.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not immediately remove every existing user.</p>
        <p>Understand who they are and why they have access first.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the ownership request is denied</h2>
        <p>Preserve the rejection email and use the ownership-denial process Google makes available.</p>
        <p>Do not respond by:</p>
        <ul className={styles.proseList}>
          {deniedDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          A denied ownership request is not permission to build a competing copy of the same Business
          Profile.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the current owner does not respond</h2>
        <p>
          After Google&apos;s three-day response period, check the ownership-request confirmation or the
          Business Profile workflow.
        </p>
        <p>An option to claim the profile may appear.</p>
        <p>If Google offers it:</p>
        <ul className={styles.proseList}>
          <li>Follow the instructions provided</li>
          <li>Complete any verification Google requires</li>
          <li>Keep the ownership and verification records</li>
        </ul>
        <p>If the option does not appear:</p>
        <p>continue through Google&apos;s published support route.</p>
        <p>Do not create a duplicate simply because the claim option is unavailable.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Ownership recovery can still lead to verification</h2>
        <p>
          Being allowed to claim or manage a Business Profile does not guarantee that Google will skip
          verification.
        </p>
        <p>
          Google may still ask the business to verify that it is entitled to manage the profile.
        </p>
        <p>Verification methods are controlled by Google.</p>
        <p>Do not promise:</p>
        <div className={styles.checkGrid}>
          {verificationPromises.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Use whichever verification options Google provides for that Business Profile.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Read our verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create a duplicate profile as an access workaround</h2>
        <div className={styles.warning}>
          <p>Google says businesses should generally have one Business Profile for each business.</p>
          <p>
            If the correct verified profile already exists, creating another one can introduce duplicate
            and ownership problems.
          </p>
          <p>The existing profile may already contain:</p>
          <ul>
            {existingProfileContains.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          Recover the existing profile rather than starting over simply because the ownership structure is
          inconvenient.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Removing the existing profile is not an access-recovery technique</h2>
        <p>Do not remove profile content or managers merely because ownership is difficult.</p>
        <p>
          Google&apos;s removal guidance warns that removing profile content and managers can have
          permanent consequences for that content and may result in verification being required again
          later.
        </p>
        <p>User-generated content such as reviews may remain.</p>
        <p>Do not use destructive profile actions as a shortcut around an ownership problem.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A permanent ownership change is different from adding a manager</h2>
        <p>Sometimes control genuinely needs to move permanently.</p>
        <p>Examples can include:</p>
        <ul className={styles.proseList}>
          {permanentExamples.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Google provides a process for transferring primary ownership.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Temporary or operational access</h3>
            <p>Add an appropriate owner or manager.</p>
          </div>
          <div>
            <h3>Permanent primary control</h3>
            <p>Use the primary-ownership transfer process where appropriate.</p>
          </div>
        </div>
        <p>Only the existing primary owner can transfer primary ownership.</p>
        <p>Use Google&apos;s transfer process rather than handing over login credentials.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>New owners and managers can face a seven-day restriction</h2>
        <p>
          Google currently says newly added owners and managers must wait seven days before they can use
          some sensitive ownership features.
        </p>
        <p>During that period, actions such as these can produce an error:</p>
        <ul className={styles.proseList}>
          {sevenDayErrors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not interpret one of these temporary restrictions as proof that access recovery failed.</p>
        <p>Check when the user was added.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Once access returns, review the access list deliberately</h2>
        <p>Remove access that genuinely should no longer exist, such as an ex-employee with no continuing role.</p>
        <p>But first establish:</p>
        <ul className={styles.proseList}>
          {beforeRemoving.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Google recommends limiting access to people who genuinely need it.</p>
        <p>Clean up ownership carefully rather than removing users in anger or uncertainty.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep business control when an agency manages the profile</h2>
        <p>Google advises businesses to retain access when third parties manage Business Profiles.</p>
        <p>An agency does not need the business owner&apos;s personal Google password.</p>
        <p>Where management access is genuinely required, use Google&apos;s Business Profile roles.</p>
        <p>The business should know:</p>
        <ul className={styles.proseList}>
          {agencyShouldKnow.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Third-party management should not leave the business unable to control its own Business Profile.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>An unexpected ownership request can be a security warning</h2>
        <p>
          If you still control the Business Profile and receive an ownership or manager request from
          somebody you do not recognise, do not approve it automatically.
        </p>
        <p>Confirm:</p>
        <ul className={styles.proseList}>
          {unexpectedConfirm.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Likewise, after recovering a profile following a suspected compromise, review People and access
          for unknown accounts.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Never give an access-recovery provider your OTP or PIN</h2>
        <div className={styles.warning}>
          <p>Do not provide:</p>
          <ul>
            {otpDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Google&apos;s security guidance says these credentials should remain protected.</p>
        <p>ProfileRelaunch should never ask a customer for them.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Lost access and suspension are different problems</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Access problem</h3>
            <span className={styles.statusKicker}>Question</span>
            <p>Who can manage the Business Profile?</p>
            <span className={styles.statusKicker}>Examples</span>
            <p>Wrong account, ownership, manager role or login recovery.</p>
          </div>
          <div>
            <h3>Profile-policy problem</h3>
            <span className={styles.statusKicker}>Question</span>
            <p>Is Google allowing the Business Profile itself to operate normally?</p>
            <span className={styles.statusKicker}>Examples</span>
            <p>Suspension, disablement or another policy restriction.</p>
          </div>
        </div>
        <p>Restoring ownership does not automatically reinstate a suspended profile.</p>
        <p>Likewise, a suspension does not necessarily mean the business has lost ownership.</p>
        <p>Identify each issue separately.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Profile suspended? Read what to do before you appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep a simple ownership record after recovery</h2>
        <p>Once control is stable, record:</p>
        <div className={styles.checkGrid}>
          {accessRecord.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not store people&apos;s passwords.</p>
        <p>
          The purpose is to prevent the business from discovering years later that nobody knows who
          controls its own Business Profile.
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
        <h2>What if my access situation is different?</h2>
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
        <h2>Before starting an ownership request</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these points is unclear, resolve it before starting another ownership request or
          creating anything new.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile ownership, access and security
          guidance with ProfileRelaunch&apos;s practical recovery approach. These are the main points that
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
            Recover the existing profile before creating anything new. Identify the Google Account,
            identify the role, use an existing authorised owner where possible, and only move to
            Google&apos;s ownership-request process when somebody else genuinely controls the verified
            profile.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to help identify the right access-recovery route?</h2>
        <p>
          You don&apos;t need to hand over a Google password or create another Business Profile to work out
          what happened.
        </p>
        <p>
          Tell us which profile exists, which account you can access and what Google currently shows.
          We&apos;ll help you identify whether the problem is account recovery, role permissions, ownership,
          verification or a separate profile restriction.
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
          {lostAccessToGoogleBusinessProfileSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile ownership, access and
          security guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of
          Google.
        </p>
      </section>
    </article>
  )
}
