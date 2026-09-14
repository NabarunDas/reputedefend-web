import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import type { ResourceRecord } from "@/lib/resources"
import { verificationStuckOrRejectedSources } from "@/lib/resource-articles/google-business-profile-verification-stuck-or-rejected"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const diagnosticStates = [
  [
    "Verification is still under review",
    "You completed verification recently and Google is still reviewing it.",
    "Google says review can take up to five working days. Record when you submitted it and wait for the current review.",
  ],
  [
    "Get verified has appeared again",
    "Google could not completely verify the business.",
    "Use one of the verification methods currently offered and prepare to verify again.",
  ],
  [
    "Your video says Review issues",
    "Google reviewed the video and did not accept it.",
    "Open Review issues, read what was missing and prepare a new video that addresses those points.",
  ],
  [
    "Google is asking you to re-verify",
    "Google may request verification again, including after business information changes.",
    "Check that the current Business Profile information is accurate, then follow the verification method Google provides.",
  ],
  [
    "No workable verification method appears",
    "The available workflow does not let you complete verification.",
    "Try the verification methods Google currently offers first. If you still cannot verify, use Google's support route.",
  ],
  [
    "Someone else already owns the profile",
    "This may be an ownership problem rather than a verification failure.",
    "Use Google's ownership-request process instead of creating another Business Profile.",
  ],
]

const offeredMethods = ["Video recording", "Phone or text", "Email", "Live video call", "Mail"]

const videoIssueExamples = [
  "Business name not visible on the shop front",
  "Nearby area not shown",
  "Missing proof that you are authorised to operate or manage the business",
]

const videoMustBe = [
  "captured live",
  "unedited",
  "unique",
  "complete, with no breaks",
  "at least 30 seconds long",
  "recorded and uploaded from a mobile device through the Business Profile",
]

const locationExamples = ["street signs", "building numbers", "nearby businesses", "recognisable locations around the business"]
const existenceExamples = [
  "shop front or permanent signage",
  "workspace",
  "professional tools or equipment",
  "products",
  "business cards",
  "branded work items",
]
const controlExamples = [
  "accessing an employee-only area",
  "using business equipment",
  "opening a cash register or point-of-sale system",
  "performing the service",
  "unlocking a branded work vehicle",
  "other genuine proof of operational control",
]

const reverifyChecks = [
  "Business name",
  "Address",
  "Service-area setup",
  "Business category",
  "Website",
  "Phone number",
]

const mailDonts = [
  "changing the business name",
  "changing the address",
  "changing the category",
  "requesting another code",
]

const codeRules = [
  "keep verification codes secure",
  "Google will never ask you for your verification code",
  "do not share the code with anyone, including people who manage the Business Profile",
]

const supportSaves = [
  "the exact verification methods offered",
  "the exact error or blocker",
  "screenshots where appropriate",
  "when you attempted verification",
  "whether the problem is upload, review, ownership or method availability",
]

const mistakes = [
  [
    'Calling a normal review period "stuck"',
    "Google says verification review can take up to five working days. A recent submission that is still being reviewed is not automatically a failed verification.",
  ],
  [
    "Trying to force a different verification method",
    "Google determines which methods are available for the profile.",
  ],
  [
    "Recording the same rejected video again",
    "If Google shows Review issues, use the reasons provided to improve the next recording.",
  ],
  [
    "Turning a service-area business into a fake storefront",
    "The public profile should continue to represent how the business actually operates.",
  ],
  [
    "Repeatedly changing profile information",
    "Do not keep changing names, addresses, categories or other details simply to experiment with verification.",
  ],
  [
    "Sharing a verification code",
    "Google says verification codes should be kept secure and not shared.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "My verification has been pending for three days",
    [
      "Google says verification review can take up to five working days after the verification steps are completed.",
      "If Google still shows the verification as under review, three days does not by itself mean the process has failed.",
      "Record when you submitted it and wait for the current review unless Google shows a specific problem.",
    ],
  ],
  [
    "Get verified appeared again after I already submitted verification",
    [
      "Google says the return of the Get verified button means the business could not be completely verified.",
      "Check the Business Profile information against the real business, then use one of the verification methods Google currently offers.",
      "Do not assume you can request a preferred method that is not shown.",
    ],
  ],
  [
    "Google rejected my verification video",
    [
      "Open Review issues and read the reasons Google provides.",
      "Plan the next video around those missing requirements rather than simply recording the same video again.",
      "Make sure the new recording still includes the useful information shown in the first video as well as what Google says was missing.",
    ],
  ],
  [
    "The profile is already verified but I cannot access it",
    [
      "That is likely an ownership or access problem rather than an ordinary verification problem.",
      "Do not create a duplicate Business Profile.",
      "Use Google's ownership-request or access-recovery process for the existing profile.",
    ],
  ],
]

const readinessChecks = [
  "I know exactly what verification state Google shows.",
  "I know which verification methods Google currently offers.",
  "The Business Profile accurately represents the real business.",
  "I am not restarting a review that is still within Google's normal review period.",
  "If a video was rejected, I have read the Review issues feedback.",
  "My video meets Google's current recording requirements.",
  "My public address setup matches how the business actually serves customers.",
  "I am not sharing passwords or verification codes.",
  "I have checked whether this is actually an ownership problem.",
  "If the workflow cannot be completed, I have recorded the exact blocker before contacting support.",
]

const googlePoints = [
  "Google automatically determines which verification methods are available and says they cannot be manually changed.",
  "Available methods can depend on the business type, public information, region and opening hours.",
  "In some cases Google may require more than one verification method.",
  "Verification review can take up to five working days.",
  "If Get verified appears again, Google says the business could not be completely verified and should try to verify again using the available methods.",
  "If a video shows Review issues, Google says the video was not accepted and provides reasons to use when preparing another recording.",
  "Verification videos must be live, unedited, unique, complete and at least 30 seconds long.",
  "Google says videos must be recorded and uploaded from a mobile device through the Business Profile.",
  "Google says businesses may be asked to re-verify after business information changes.",
  "Google says verification codes must be kept secure and should not be shared.",
  "If the available verification methods still cannot be completed, Google directs businesses to support.",
  "If another owner controls the existing verified profile, use Google's ownership process instead of creating another profile.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-suspended-before-appeal":
    "How to check eligibility, profile accuracy and evidence when the problem is a suspension rather than verification.",
  "lost-access-to-google-business-profile":
    "What to do when the Business Profile already exists but another account controls it or your access has been lost.",
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

export function VerificationStuckPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.verificationPage}`}>
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
            A verification problem can mean several different things. Your profile may still be under
            review, Google may be asking you to verify again, a video may not have been accepted, or
            the real issue may be ownership rather than verification.
          </p>
          <p>
            Start with what the Business Profile actually shows you. The correct next step depends on
            that state, and repeatedly restarting verification can make a simple problem harder to
            diagnose.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What is Google actually showing you?</h2>
        <p>Choose the situation that most closely matches what you see on the Business Profile.</p>
        <div className={styles.diagnosticGrid}>
          {diagnosticStates.map(([heading, meaning, next], index) => (
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
        heading="Not sure which verification problem you actually have?"
        body="Tell us what Google is showing, which verification options are available and what you have already tried. We can help you identify the right next step before you start again."
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>You cannot choose any verification method you want</h2>
        <p>
          Google automatically determines which verification methods are available for a Business
          Profile and says those methods cannot be manually changed.
        </p>
        <p>
          The options can depend on the business type, public information, region and opening hours.
          In some cases Google may require more than one verification method.
        </p>
        <h3>Methods Google may offer</h3>
        <div className={styles.checkGrid}>
          {offeredMethods.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          A method available to another business is not automatically available to yours. Start with
          the options Google actually shows on your Business Profile.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A recent verification may simply still be under review</h2>
        <p>
          After you complete Google&apos;s verification steps, Google reviews the information you
          provided. It says this review can take up to five working days, although some profiles are
          verified sooner.
        </p>
        <div className={styles.warning}>
          <strong>Submitted less than five working days ago?</strong>
          <p>
            If the profile still shows that verification is under review, avoid repeatedly restarting
            the process simply because the result was not immediate.
          </p>
          <p>Record when you submitted it and monitor the current state.</p>
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If your verification video was not accepted</h2>
        <p>
          If Google shows Review issues, the video was reviewed but did not meet all the
          requirements.
        </p>
        <p>Open Review issues and use Google&apos;s reasons as the checklist for your next recording.</p>
        <h3>Google gives examples such as</h3>
        <ul className={styles.tickList}>
          {videoIssueExamples.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>Do not simply record the same unsuccessful video again.</p>
        <p>
          Google says the next video should include the information shown previously as well as the
          missing information identified during review.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Before recording another video</h2>
        <p>
          Plan what you need to show before you start. Google&apos;s current video-verification
          guidance requires the recording to meet some basic conditions.
        </p>
        <p>The video must be:</p>
        <div className={styles.checkGrid}>
          {videoMustBe.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div className={styles.warning}>
          <strong>Keep sensitive information out of the video</strong>
          <p>
            Google says verification videos must not include sensitive information such as
            bank-account, tax or ID numbers, private information about you or other people, or other
            people&apos;s faces.
          </p>
        </div>
        <p>
          The purpose is to prove the business and your relationship to it, not to create a
          promotional video.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A useful video proves three different things</h2>
        <div className={styles.decisionGrid}>
          <div>
            <h3>1. Where the business operates</h3>
            <span>Examples may include:</span>
            <ul>
              {locationExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>2. That the business genuinely exists</h3>
            <span>Depending on the business, this may include:</span>
            <ul>
              {existenceExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>3. That you manage or represent it</h3>
            <span>Examples can include:</span>
            <ul>
              {controlExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>Showing only the street may not prove that the business exists. Showing only a logo may not prove that you manage it.</p>
        <p>Your video needs to make the whole picture understandable.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The proof looks different for different business types</h2>
        <div className={styles.decisionGrid}>
          <div>
            <h3>Storefront</h3>
            <span>Customers visit the business at a physical location.</span>
            <p>
              Show the location, permanent business presence and evidence that you manage or
              represent the business.
            </p>
          </div>
          <div>
            <h3>Hybrid business</h3>
            <span>Customers visit the location and the business also travels or delivers to them.</span>
            <p>
              Show the customer-facing location as well as evidence that the business genuinely
              operates there.
            </p>
          </div>
          <div>
            <h3>Service-area business</h3>
            <span>The business travels to customers rather than serving them at its address.</span>
            <p>
              Show the operating context, business tools/equipment and evidence that you manage or
              represent the business.
            </p>
          </div>
        </div>
        <div className={styles.warning}>
          <strong>Do not expose a private address just to pass verification</strong>
          <p>
            If customers do not receive the service at the business address, Google&apos;s
            service-area guidance says the address should not be displayed publicly.
          </p>
          <p>
            Google may need to understand where the business operates from during verification. That
            does not mean customers should see a private service-area address on the public profile.
          </p>
        </div>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-address-and-service-area-rules"
        >
          Read our Google Business Profile address and service-area guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Did the video fail to upload, or did Google reject it?</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>The video did not upload</h3>
            <p>Google&apos;s video guidance says videos can sometimes fail to upload on the first attempt.</p>
            <p>Try the upload again.</p>
            <p>
              If the upload workflow continues to fail after you have followed the available process,
              treat that as a technical/support problem.
            </p>
          </div>
          <div>
            <h3>The video uploaded but was not accepted</h3>
            <p>Open Review issues.</p>
            <p>Read the reasons Google provides.</p>
            <p>Record a new video that includes the missing information.</p>
          </div>
        </div>
        <p>These are different problems. Keep a record of the exact message Google shows you.</p>
      </section>

      <ContextualCta
        heading="Tried video verification and still can't work out what's failing?"
        body="We can review the Business Profile setup, the verification state and what Google has asked you to show before you try again."
        ctaLabel="Get your case reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google may ask you to verify again after profile changes</h2>
        <p>
          Google says a previously verified business may be asked to provide additional information
          or verify again, including after business details have changed.
        </p>
        <p>
          That does not automatically mean the change was wrong. It means Google wants to confirm
          the current business information.
        </p>
        <p>Before re-verifying, check:</p>
        <div className={styles.checkGrid}>
          {reverifyChecks.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          Do not keep changing these fields simply to see which version gets through verification.
          The profile should reflect the real business.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If Google offers phone, email or mail</h2>
        <div className={styles.decisionGrid}>
          <div>
            <h3>Phone or text</h3>
            <p>Use the phone number shown in Google&apos;s verification flow.</p>
            <p>Make sure you can answer the business phone or receive the text message.</p>
            <p>
              Follow the method Google presents rather than trying to substitute a different number.
            </p>
          </div>
          <div>
            <h3>Email</h3>
            <p>If Email is offered, use the email address shown in Google&apos;s verification screen.</p>
            <p>Follow the verification email Google sends.</p>
            <p>Do not assume an unrelated email address can be substituted.</p>
          </div>
          <div>
            <h3>Mail</h3>
            <p>Mail verification is not available to every business.</p>
            <p>Where Google offers it, most verification codes arrive within 14 days.</p>
            <p>While waiting for the code, Google warns against:</p>
            <ul>
              {mailDonts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>
          Google says requesting another code invalidates the code already in the mail and can make
          the process longer.
        </p>
        <p>Verification codes expire after 30 days.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep verification codes and account access private</h2>
        <div className={styles.warning}>
          <strong>Google says:</strong>
          <ul>
            {codeRules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>
          A legitimate adviser can explain the verification requirements and help you prepare.
        </p>
        <p>
          They do not need your Google Account password, verification code, one-time passcode or
          other security credentials to do that.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A third party cannot replace the business owner in verification</h2>
        <p>
          Google&apos;s ownership guidance says Business Profiles should be verified and managed by
          the business owner or an authorised representative.
        </p>
        <p>
          A third party can help explain requirements or prepare evidence, but owner-controlled
          verification steps and security credentials should stay with the appropriate business owner
          or authorised person.
        </p>
        <p>Do not hand over passwords, OTPs or verification codes.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if none of the available methods work?</h2>
        <p>
          First use the verification methods Google currently offers and make sure you have followed
          their requirements.
        </p>
        <p>
          For video verification, Google says to check that the recording meets the requirements and
          try again where appropriate.
        </p>
        <p>If you are still unable to complete verification, Google&apos;s verification guidance directs businesses to support.</p>
        <p>Before contacting support, save:</p>
        <div className={styles.compactCard}>
          <ul>
            {supportSaves.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>A precise description of the blocker is more useful than simply saying the profile is &quot;stuck&quot;.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Check whether this is really an ownership problem</h2>
        <p>
          Sometimes the profile is already verified but controlled by another Google Account.
        </p>
        <p>
          If the correct Business Profile already exists and another owner controls it, do not create
          another profile simply to get around verification.
        </p>
        <p>Use Google&apos;s ownership-request process.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Profile is not yet controlled by another owner</h3>
            <p>Continue with the verification route Google offers.</p>
          </div>
          <div>
            <h3>Existing verified profile is owned by somebody else</h3>
            <p>Use Google&apos;s ownership-request process.</p>
          </div>
        </div>
        <Link className={styles.inlineLink} href="/resources/lost-access-to-google-business-profile">
          Lost access to the profile? Read our ownership and manager options guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Verification and suspension are different problems</h2>
        <p>A Business Profile needing verification is not automatically suspended.</p>
        <p>
          A rejected verification video also does not mean Google has rejected a suspension appeal.
        </p>
        <p>Use the process that matches the state Google actually shows.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Profile suspended instead? Read what to do before you appeal →
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
        <h2>What if my verification situation is different?</h2>
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
        <h2>Before you try verification again</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>
          If one of these is unclear, resolve that point before starting another verification
          attempt.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile rules with
          ProfileRelaunch&apos;s practical troubleshooting advice. These are the main points that
          come directly from Google&apos;s current Help pages:
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
            Start with the state Google actually shows you. A waiting review, rejected video,
            unavailable method and ownership conflict are different problems and should not be
            troubleshot in the same way.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Still stuck on verification?</h2>
        <p>You don&apos;t need to keep retrying every option.</p>
        <p>
          Tell us what Google is showing, which verification methods are available and what happened
          when you tried them. We&apos;ll review the situation and help you understand the
          appropriate next step.
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
          {verificationStuckOrRejectedSources.map((source) => (
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

export const verificationStuckPilotSlug = "google-business-profile-verification-stuck-or-rejected"
