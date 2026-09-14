import {
  sourceFakeEngagement,
  sourceManageCustomerReviews,
  sourceMapsUgcPolicy,
  sourceMissingDelayedReviews,
  sourceMoveReviewsAcrossProfiles,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
} from "@/lib/resource-sources/google-maps-reviews"

export const googleReviewsMissingOrDisappearedSlug = "google-reviews-missing-or-disappeared"

export const googleReviewsMissingOrDisappearedSources = [
  sourceMissingDelayedReviews,
  sourceProhibitedRestrictedContent,
  sourceMoveReviewsAcrossProfiles,
  sourceReportInappropriateReviews,
  sourceMapsUgcPolicy,
  sourceFakeEngagement,
  sourceManageCustomerReviews,
]

export const googleReviewsMissingOrDisappearedBody = {
  intro: (
    <>
      <p>When Google reviews disappear, the first question is usually:</p>
      <p>“Can we get them back?”</p>
      <p>That is not always the first question Google can answer.</p>
      <p>A review may be:</p>
      <p>delayed,</p>
      <p>removed for a policy reason,</p>
      <p>temporarily unavailable,</p>
      <p>affected by a Business Profile merge,</p>
      <p>attached to another profile,</p>
      <p>missing after reinstatement,</p>
      <p>or caught incorrectly by Google&apos;s automated systems.</p>
      <p>Those situations are not the same.</p>
      <p>
        Google says reviews are checked against its policies and that, in some cases, this can delay a
        new review for a few days.
      </p>
      <p>
        Google also says reviews from recently merged profiles may take a few days to display together on
        Search and Maps.
      </p>
      <p>Reviews removed for policy violations are different.</p>
      <p>Google says those reviews will not be restored.</p>
      <p>
        At the same time, Google&apos;s own guidance acknowledges that automated spam detection can
        occasionally remove legitimate reviews by mistake.
      </p>
      <p>
        And if reviews disappear after a suspended or disabled Business Profile is reinstated, Google
        specifically tells businesses to contact support for assistance.
      </p>
      <p>So do not start by promising restoration.</p>
      <p>Start by identifying what changed.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If Google reviews are missing or have disappeared:</p>
      <ul>
        <li>record the current total review count</li>
        <li>record approximately how many reviews appear to be missing</li>
        <li>
          identify whether one review is missing or many reviews disappeared together
        </li>
        <li>ask when the missing review was originally posted</li>
        <li>
          remember that Google says policy checks can delay a new review for a few days
        </li>
        <li>check whether Business Profiles were recently merged</li>
        <li>
          Google says reviews from merged profiles can also take a few days to display together
        </li>
        <li>
          check whether the Business Profile was recently suspended, disabled and reinstated
        </li>
        <li>
          Google specifically says reviews can sometimes be removed after reinstatement and tells
          businesses to contact support if that happens
        </li>
        <li>
          check whether the business recently moved, merged profiles or unintentionally created another
          verified profile
        </li>
        <li>review Google&apos;s rules for moving reviews between eligible Business Profiles</li>
        <li>do not assume every missing review was removed for spam</li>
        <li>do not assume every missing review can be restored</li>
        <li>Google says reviews removed for policy violations will not be restored</li>
        <li>
          Google also says automated spam detection can occasionally remove legitimate reviews by mistake
        </li>
        <li>if you believe that happened, preserve the evidence and contact Google support</li>
        <li>
          do not ask customers to repeatedly repost or manipulate reviews to bypass moderation
        </li>
        <li>do not create a duplicate Business Profile merely to recover a review count</li>
        <li>do not pay anyone who guarantees they can force Google to restore reviews</li>
        <li>
          preserve screenshots, dates and other legitimate evidence before opening a support case
        </li>
      </ul>
      <p>
        First identify whether the problem is delay, policy enforcement, profile structure or a possible
        mistaken removal.
      </p>
    </>
  ),
  main: (
    <>
      <h2>First identify what actually went missing</h2>
      <p>Start by separating:</p>
      <p>one missing new review,</p>
      <p>one older review that disappeared,</p>
      <p>several reviews disappearing together,</p>
      <p>and:</p>
      <p>a large change in the overall review count.</p>
      <p>Those patterns can point to different causes.</p>
      <p>Also ask:</p>
      <p>Did the Business Profile change recently?</p>
      <p>Was it suspended?</p>
      <p>Was it reinstated?</p>
      <p>Was it merged?</p>
      <p>Did the business move?</p>
      <p>Was another profile created?</p>
      <p>Do not describe every situation simply as:</p>
      <p>“Google deleted our reviews.”</p>
      <p>Preserve the timeline first.</p>

      <h2>A delayed review is not the same as a removed review</h2>
      <p>
        Google says reviews are checked to make sure they comply with its policies.
      </p>
      <p>In some cases, that process can take a few days.</p>
      <p>
        That means a customer can genuinely submit a review without the review appearing immediately.
      </p>
      <p>Do not promise:</p>
      <p>“It will appear tomorrow.”</p>
      <p>
        And do not assume after a few hours that the review has been permanently removed.
      </p>
      <p>
        Record when the customer says they submitted it and check again later.
      </p>

      <h2>Google does not publish a guaranteed review-processing time</h2>
      <p>Google&apos;s current guidance says review checks can take:</p>
      <p>a few days.</p>
      <p>Do not convert that wording into:</p>
      <p>24 hours,</p>
      <p>72 hours,</p>
      <p>five days,</p>
      <p>seven days,</p>
      <p>or another guaranteed deadline.</p>
      <p>The correct guidance is that processing can create a delay.</p>
      <p>
        If the review remains absent beyond an ordinary processing period, investigate the other possible
        causes.
      </p>

      <h2>A recently merged Business Profile can temporarily show incomplete reviews</h2>
      <p>
        Google says that when Business Profiles have recently been merged, reviews from the profiles may
        take a few days to display together on Search and Maps.
      </p>
      <p>If the review count changes immediately after a merge:</p>
      <p>record the profiles involved,</p>
      <p>record the review counts,</p>
      <p>and allow for the merge process.</p>
      <p>Do not immediately create another profile.</p>
      <p>
        And do not assume every missing review after a merge has been permanently lost.
      </p>

      <h2>Reviews removed for policy violations will not be restored</h2>
      <p>Google is clear on this point.</p>
      <p>
        If a review was removed because it violated Google&apos;s policies, Google says it will not be
        restored.
      </p>
      <p>That can include reviews Google identifies as:</p>
      <p>spam,</p>
      <p>fake engagement,</p>
      <p>inappropriate content,</p>
      <p>or another prohibited contribution.</p>
      <p>
        A business cannot convert a genuine policy removal into a restoration simply by describing the
        review as valuable.
      </p>
      <p>The first question is whether the review was removed correctly.</p>

      <h2>Google uses automated systems to detect spam</h2>
      <p>
        Google says it uses automated spam detection to help remove reviews it identifies as spam.
      </p>
      <p>Automation is part of Google&apos;s review-moderation system.</p>
      <p>
        Do not tell customers that every removed review was manually assessed by a person.
      </p>
      <p>
        And do not assume automation proves the review was genuinely invalid.
      </p>

      <h2>Google acknowledges legitimate reviews can sometimes be removed by mistake</h2>
      <p>
        Google&apos;s review-reporting guidance specifically acknowledges that automated spam detection
        can occasionally remove legitimate reviews.
      </p>
      <p>Google tells businesses to contact support for assistance if that happens.</p>
      <p>That is an important distinction.</p>
      <p>Google is not promising restoration.</p>
      <p>
        It is recognising that an incorrect automated removal can be investigated.
      </p>
      <p>Preserve the evidence before contacting support.</p>

      <h2>Do not try to reverse-engineer Google&apos;s spam systems</h2>
      <p>
        If a genuine customer&apos;s review does not appear, do not coach them to repeatedly submit
        variations until one survives.
      </p>
      <p>Do not suggest:</p>
      <p>changing a few words,</p>
      <p>using another account,</p>
      <p>posting from another device solely to bypass moderation,</p>
      <p>or creating artificial engagement.</p>
      <p>
        That risks turning a legitimate review problem into a manipulation problem.
      </p>
      <p>Use the proper support route instead.</p>

      <h2>Missing reviews after reinstatement have their own clue</h2>
      <p>
        Google&apos;s missing-review guidance specifically says reviews can sometimes be removed after a
        Business Profile is reinstated.
      </p>
      <p>
        Google tells businesses to contact support for assistance when this happens.
      </p>
      <p>If reviews disappeared around the same time as:</p>
      <p>suspension,</p>
      <p>disablement,</p>
      <p>appeal,</p>
      <p>or reinstatement,</p>
      <p>preserve that timeline carefully.</p>
      <p>
        This is different from a single brand-new review that has not yet appeared.
      </p>

      <h2>Record the review count before and after reinstatement where possible</h2>
      <p>If the profile recently returned after suspension, record:</p>
      <ul>
        <li>the approximate review count before the restriction</li>
        <li>the current review count</li>
        <li>the reinstatement date</li>
        <li>the Business Profile involved</li>
        <li>screenshots you legitimately possess</li>
        <li>relevant Google case references</li>
        <li>reviewer names or dates where genuinely known</li>
      </ul>
      <p>
        Do not invent exact historical counts if you did not record them.
      </p>
      <p>An honest approximate count is better than fabricated precision.</p>

      <h2>A business move can affect which profile holds the reviews</h2>
      <p>
        When a business relocates, the correct objective is not to abandon reviews and start again.
      </p>
      <p>Google has specific rules for moving reviews across Business Profiles.</p>
      <p>
        For a business that moves to a new address while keeping the same business name, Google says
        reviews are generally transferred automatically.
      </p>
      <p>Google notes that some categories may not transfer automatically.</p>
      <p>
        Check the actual profile structure before concluding that the reviews were deleted.
      </p>

      <h2>Do not create a new profile merely because the business moved</h2>
      <p>
        Google&apos;s review-transfer guidance specifically warns against creating a new Business Profile
        simply because of a physical-location or ownership change.
      </p>
      <p>Creating another profile can produce:</p>
      <p>duplicate listings,</p>
      <p>split reviews,</p>
      <p>ownership confusion,</p>
      <p>and verification problems.</p>
      <p>
        Use the appropriate move, ownership or support process for the existing business.
      </p>

      <h2>An accidental duplicate can create a review-transfer problem</h2>
      <p>
        Sometimes a business unintentionally creates and verifies another Business Profile after:
      </p>
      <p>a move,</p>
      <p>an ownership change,</p>
      <p>or uncertainty about the existing listing.</p>
      <p>
        Google says businesses in that situation can contact it about transferring reviews from the old
        profile to the new one where the situation qualifies.
      </p>
      <p>
        Do not assume the reviews automatically belong to whichever profile was created most recently.
      </p>
      <p>Identify both profiles first.</p>

      <h2>Not every business change qualifies for moving every review</h2>
      <p>
        Google says not all business changes qualify for review movement or removal.
      </p>
      <p>
        If the business changes significantly, Google may treat some older reviews as no longer relevant
        to the current business.
      </p>
      <p>Do not promise:</p>
      <p>“All old reviews always follow every rebrand.”</p>
      <p>
        The question is whether Google treats the changed profile as the same continuing business.
      </p>

      <h2>A change of ownership does not automatically erase reviews</h2>
      <p>
        Google says that if a business gets a new owner or manager but keeps the same business name, the
        reviews remain.
      </p>
      <p>Do not tell a buyer:</p>
      <p>“Google deletes all reviews when ownership changes.”</p>
      <p>
        The Business Profile represents the business customers reviewed, not merely the individual account
        holder managing the profile.
      </p>

      <h2>A minor name change does not automatically erase reviews</h2>
      <p>Google also says reviews remain for minor business-name changes.</p>
      <p>
        A minor legitimate name update is different from transforming the profile into a materially
        different business.
      </p>
      <p>
        If the business identity changed significantly, review treatment can be different.
      </p>
      <p>
        Do not use an established review history as a shortcut for an unrelated new business.
      </p>

      <h2>Older phones or software can affect a customer&apos;s attempt to leave a review</h2>
      <p>
        Google&apos;s missing-review guidance also notes that customers using older phones or software may
        have trouble leaving reviews.
      </p>
      <p>Google recommends using the latest version of the Google Maps app.</p>
      <p>This can matter where:</p>
      <p>the customer believes they completed the review,</p>
      <p>but the business never sees it.</p>
      <p>
        Do not treat every customer-side submission problem as a Business Profile enforcement issue.
      </p>

      <h2>Some profiles can temporarily have user-created content restricted</h2>
      <p>
        Google says that in certain situations it may temporarily disable user-created content, including
        reviews, for particular Business Profiles or business categories.
      </p>
      <p>That means:</p>
      <p>reviews unavailable</p>
      <p>does not always mean:</p>
      <p>your individual customer review was singled out for removal.</p>
      <p>Check whether Google is applying a broader posting restriction.</p>

      <h2>Separate the missing-review problem from a negative-review removal case</h2>
      <p>
        The Review Management Tool is designed for businesses reporting reviews they believe violate
        policy.
      </p>
      <p>That is a different situation from:</p>
      <p>“A genuine positive review disappeared.”</p>
      <p>
        Do not flag another review for removal simply because you are trying to restore a missing one.
      </p>
      <p>Use the process that matches the problem.</p>

      <h2>Preserve evidence before contacting Google</h2>
      <p>Useful case evidence can include:</p>
      <ul>
        <li>the Business Profile URL</li>
        <li>Business Profile ID where available</li>
        <li>current review count</li>
        <li>earlier screenshots you legitimately possess</li>
        <li>review notification emails</li>
        <li>reviewer display names where known</li>
        <li>approximate posting dates</li>
        <li>dates of suspension and reinstatement</li>
        <li>merge or move dates</li>
        <li>relevant Google case IDs</li>
        <li>details of the old and new profiles where a transfer is involved</li>
      </ul>
      <p>Do not manufacture evidence.</p>
      <p>Do not ask customers for private account credentials.</p>

      <h2>Screenshots are useful context, not proof that Google must restore a review</h2>
      <p>A screenshot can show that a review previously appeared.</p>
      <p>It can help establish:</p>
      <p>review text,</p>
      <p>reviewer display name,</p>
      <p>date,</p>
      <p>rating,</p>
      <p>and timing.</p>
      <p>
        It does not determine whether the review currently complies with Google&apos;s policies.
      </p>
      <p>
        Google still decides whether the contribution qualifies to remain.
      </p>

      <h2>Do not promise support will restore the review</h2>
      <p>Google support can investigate appropriate missing-review cases.</p>
      <p>
        That does not mean every support case ends with restoration.
      </p>
      <p>Possible outcomes include:</p>
      <ul>
        <li>a delayed review eventually appearing</li>
        <li>reviews appearing after a profile merge finishes processing</li>
        <li>an eligible transfer being completed</li>
        <li>a mistakenly removed legitimate review being investigated</li>
        <li>Google determining that a policy-removed review will remain removed</li>
      </ul>
      <p>ProfileRelaunch should explain that range honestly.</p>

      <h2>Do not buy replacement reviews</h2>
      <p>
        If genuine reviews are missing, do not compensate by buying reviews or incentivising customers to
        create replacements.
      </p>
      <p>Google&apos;s policies require reviews to reflect genuine experiences.</p>
      <p>
        Fake engagement can create a larger reputation and policy problem than the original missing-review
        issue.
      </p>
      <p>Keep review generation legitimate.</p>

      <h2>Do not ask the same person to keep reposting until Google accepts it</h2>
      <p>
        A genuine customer may reasonably want to know why their review is missing.
      </p>
      <p>
        But repeated attempts designed to beat moderation are not the right strategy.
      </p>
      <p>Preserve the original details.</p>
      <p>Allow ordinary processing time.</p>
      <p>
        Then use support where the evidence points to an incorrect removal or another recognised
        missing-review issue.
      </p>

      <h2>Do not pay someone who claims they can force reviews back into Google</h2>
      <p>
        No independent provider controls Google&apos;s review database or moderation decisions.
      </p>
      <p>A professional provider can help:</p>
      <ul>
        <li>diagnose the likely cause</li>
        <li>organise evidence</li>
        <li>identify profile-merge or reinstatement context</li>
        <li>prepare a clear support request</li>
        <li>explain Google&apos;s policies</li>
      </ul>
      <p>It cannot guarantee that Google will restore a review.</p>

      <h2>Sometimes the correct conclusion is that the review cannot be restored</h2>
      <p>This matters commercially.</p>
      <p>
        If Google removed a review for a valid policy violation, Google&apos;s guidance says the review
        will not be restored.
      </p>
      <p>
        We should not sell a customer an invented escalation route in that situation.
      </p>
      <p>
        Likewise, if there is no evidence that the review ever successfully posted, we should not pretend
        we can prove Google deleted it.
      </p>
      <p>The right service is diagnosis first.</p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says there are several reasons why reviews might be missing from a Business Profile and
          that reviews are usually removed for policy violations such as spam or inappropriate content.
        </p>
        <p>
          Google says reviews are checked for compliance with its policies and that this process can
          sometimes take a few days, delaying a review&apos;s appearance.
        </p>
        <p>
          Google also says reviews from recently merged Business Profiles can take a few days to display
          together on Search and Maps.
        </p>
        <p>Reviews removed for policy violations will not be restored.</p>
        <p>
          Google separately acknowledges that automated spam detection can occasionally remove legitimate
          reviews and says businesses can contact support for assistance if that happens.
        </p>
        <p>
          Google also says reviews can sometimes be removed after a Business Profile is reinstated and
          tells businesses to contact support for assistance in that situation.
        </p>
        <p>
          For eligible business moves and duplicate-profile situations, Google provides a separate process
          for moving reviews across Business Profiles.
        </p>
      </>
    ),
    sources: [
      sourceMissingDelayedReviews,
      sourceProhibitedRestrictedContent,
      sourceMoveReviewsAcrossProfiles,
    ],
  },
  interpretation: (
    <>
      <p>A missing review needs classification before escalation.</p>
      <p>Ask:</p>
      <p>Is this a new review that has never appeared?</p>
      <p>Did an older visible review disappear?</p>
      <p>Did several reviews disappear together?</p>
      <p>Did the change happen after a merge?</p>
      <p>Did it happen after a move?</p>
      <p>Did it happen after reinstatement?</p>
      <p>Is the Business Profile itself still the same profile?</p>
      <p>Those answers matter more than the headline:</p>
      <p>“Our reviews are gone.”</p>
      <p>
        Once you know the pattern, you can choose the correct next step.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not assume every missing review was spam.</p>
      <p>Do not assume every missing review was a Google error.</p>
      <p>
        Do not promise that a delayed review will appear on a specific day.
      </p>
      <p>Do not promise that support can restore every review.</p>
      <p>
        Do not try to restore a review that Google validly removed for a policy violation.
      </p>
      <p>
        Do not ask customers to repeatedly repost reviews to evade moderation.
      </p>
      <p>Do not ask customers to create reviews from extra accounts.</p>
      <p>Do not incentivise replacement reviews.</p>
      <p>Do not manufacture screenshots or historic review counts.</p>
      <p>Do not create a duplicate Business Profile to recover reviews.</p>
      <p>
        Do not assume all reviews transfer automatically after every move or rebrand.
      </p>
      <p>
        Do not confuse an ordinary review-removal report with a missing-review support case.
      </p>
      <p>Preserve the timeline and evidence first.</p>
    </>
  ),
  checklist: {
    heading: "Google missing-review investigation checklist",
    items: [
      "Record the Business Profile URL.",
      "Record the current visible review count.",
      "Estimate how many reviews appear to be missing.",
      "Identify whether the issue affects one review or multiple reviews.",
      "Record when the missing review was originally submitted or last seen.",
      "Save any legitimate screenshot of the review.",
      "Save any Google review notification email you already have.",
      "Record the reviewer display name where genuinely known.",
      "Check whether the review may still be in ordinary policy processing.",
      "Check whether Business Profiles were recently merged.",
      "Record any recent business move.",
      "Record whether another Business Profile was created or verified.",
      "Check whether the profile was recently suspended or disabled.",
      "Record the reinstatement date where applicable.",
      "Compare the review count before and after reinstatement where you genuinely know it.",
      "Check whether Google may be applying a broader posting restriction.",
      "Check whether the missing review would violate Google's content policies.",
      "Do not assume absence automatically proves a policy removal.",
      "Preserve relevant Google support case IDs.",
      "For a move or duplicate situation, identify both the old and current profiles.",
      "Use Google's missing-review or review-transfer support route that matches the case.",
      "Do not promise the outcome before Google has assessed it.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Assuming a one-day delay means the review was deleted.",
        body: "Google says review policy checks can sometimes take a few days. A delayed review and a removed review are different states.",
      },
      {
        title: "Promising a fixed review-processing deadline.",
        body: "Google uses the wording “a few days”. Do not invent a guaranteed number of hours or days.",
      },
      {
        title: "Assuming every missing review was removed for spam.",
        body: "Missing reviews can also involve processing delay, profile merges, reinstatement, customer-device issues or other profile changes.",
      },
      {
        title: "Promising that every legitimate review can be restored.",
        body: "Google acknowledges mistaken automated removals can happen, but restoration remains Google's decision. Reviews removed for valid policy violations are not restored.",
      },
      {
        title: "Creating another profile after a move.",
        body: "Google has specific review-transfer rules. A duplicate profile can split reviews and make the situation harder to resolve.",
      },
      {
        title: "Asking customers to repeatedly repost.",
        body: "Do not turn a genuine missing-review problem into an attempt to evade Google's moderation systems.",
      },
      {
        title: "Buying reviews to replace missing ones.",
        body: "Paid, incentivised or otherwise manipulated reviews can violate Google's fake-engagement policies.",
      },
      {
        title: "Using the review-removal tool for the wrong problem.",
        body: "Reporting an inappropriate visible review is different from asking Google to investigate a missing genuine review.",
      },
      {
        title: "Inventing the old review count.",
        body: "If you only know that approximately ten reviews disappeared, say approximately ten. Do not manufacture precise evidence.",
      },
      {
        title: "Selling guaranteed restoration.",
        body: "A third party can diagnose, document and assist with the appropriate Google process. It cannot force Google's review system to restore content.",
      },
    ],
  },
  scenarios: [
    {
      heading: "A customer says they posted a review yesterday but we cannot see it",
      body: (
        <>
          <p>Do not immediately diagnose deletion.</p>
          <p>
            Google says review-policy checks can sometimes delay publication for a few days.
          </p>
          <p>Record:</p>
          <ul>
            <li>when the customer submitted it</li>
            <li>their display name where known</li>
            <li>any screenshot they voluntarily provide</li>
          </ul>
          <p>Do not ask them to keep reposting versions of the same review.</p>
          <p>
            Allow for ordinary processing before deciding whether a support investigation is justified.
          </p>
        </>
      ),
    },
    {
      heading: "Several old reviews disappeared after our profile was reinstated",
      body: (
        <>
          <p>This matches a situation Google specifically acknowledges.</p>
          <p>Record:</p>
          <ul>
            <li>the reinstatement date</li>
            <li>approximate review count before suspension</li>
            <li>current review count</li>
            <li>known missing reviews</li>
            <li>screenshots or notification emails</li>
            <li>relevant Google case IDs</li>
          </ul>
          <p>
            Then contact official Business Profile support about the missing reviews.
          </p>
          <p>Do not promise that every review will be restored.</p>
        </>
      ),
    },
    {
      heading: "Our review count changed after two Business Profiles were merged",
      body: (
        <>
          <p>
            Google says reviews from recently merged profiles may take a few days to display together.
          </p>
          <p>Preserve the details of both profiles.</p>
          <p>Record the counts.</p>
          <p>Allow the merge process to complete.</p>
          <p>
            If reviews remain missing after the expected processing period, use official support with the
            merge history and evidence.
          </p>
        </>
      ),
    },
    {
      heading: "We moved premises and our old reviews are not on the current profile",
      body: (
        <>
          <p>First determine whether this is the same continuing business.</p>
          <p>Identify the old and current Business Profiles.</p>
          <p>
            Google says that when a business moves and keeps the same business name, reviews are generally
            transferred automatically, although some categories can behave differently.
          </p>
          <p>
            If an extra profile was unintentionally created and verified, use Google&apos;s review-transfer
            support process.
          </p>
          <p>Do not create another profile.</p>
        </>
      ),
    },
    {
      heading: "A review definitely existed but Google no longer shows it",
      body: (
        <>
          <p>
            Preserve the screenshot, notification email or other legitimate record showing that it
            previously appeared.
          </p>
          <p>Check whether the content may violate Google&apos;s policies.</p>
          <p>
            If it was validly removed for a policy violation, Google says it will not be restored.
          </p>
          <p>
            If the evidence suggests a legitimate review was incorrectly removed by automated spam
            detection, Google says businesses can contact support for assistance.
          </p>
          <p>That is an investigation route, not a restoration guarantee.</p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Work out whether the review is delayed, removed or attached to the wrong profile</h2>
      <p>
        Missing Google reviews are frustrating because several different problems can look exactly the same
        from the business owner&apos;s side.
      </p>
      <p>A new review may still be processing.</p>
      <p>A merged profile may still be bringing reviews together.</p>
      <p>A genuine review may have been removed incorrectly.</p>
      <p>A policy-violating review may have been removed correctly.</p>
      <p>Reviews may disappear around reinstatement.</p>
      <p>
        Or a move or duplicate profile may leave review history attached to a different Business Profile.
      </p>
      <p>Those cases do not have one universal fix.</p>
      <p>Start with the timeline.</p>
      <p>Preserve the profile and review evidence.</p>
      <p>
        Check what changed immediately before the reviews disappeared.
      </p>
      <p>Then use the Google process that matches the actual situation.</p>
      <p>
        ProfileRelaunch can help organise that investigation, compare the profile history with
        Google&apos;s published review rules and prepare a clear support case where a legitimate
        restoration or transfer issue appears to exist.
      </p>
      <p>We cannot directly restore a Google review.</p>
      <p>We cannot override Google&apos;s spam-detection or policy decisions.</p>
      <p>
        And we should not charge a customer for an invented escalation when Google&apos;s own guidance says
        a valid policy removal will not be reversed.
      </p>
      <p>
        The goal is to identify the strongest truthful next step — including saying when waiting, support,
        transfer or accepting a valid removal is the correct answer.
      </p>
    </>
  ),
  sourcesUsed: googleReviewsMissingOrDisappearedSources,
}
