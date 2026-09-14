import {
  sourceFakeEngagement,
  sourceLegalRemovals,
  sourceMapsPrivacy,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReviewExtortion,
} from "@/lib/resource-sources/google-maps-reviews"

export const canAGoogleReviewBeRemovedSlug = "can-a-google-review-be-removed"

export const canAGoogleReviewBeRemovedSources = [
  sourceReportInappropriateReviews,
  sourceProhibitedRestrictedContent,
  sourceMapsUgcPolicy,
  sourceFakeEngagement,
  sourceMapsPrivacy,
  sourceLegalRemovals,
  sourceReviewExtortion,
]

export const canAGoogleReviewBeRemovedBody = {
  intro: (
    <>
      <p>
        Yes, a Google review can be removed — but not simply because a business thinks it is unfair,
        inaccurate or damaging.
      </p>
      <p>Google&apos;s current rule is narrower.</p>
      <p>
        A review is eligible for policy-based removal when it violates Google&apos;s review or Maps
        content policies.
      </p>
      <p>
        Google specifically tells businesses not to report a review merely because they disagree with
        it or dislike it. Google says it does not get involved in ordinary conflicts between
        businesses and customers.
      </p>
      <p>
        That distinction matters because a genuine one-star review can remain live even when the
        business strongly disagrees with the customer&apos;s version of events.
      </p>
      <p>
        At the same time, Google&apos;s policies prohibit several types of review abuse, including
        fake engagement, paid or incentivised reviews, rating manipulation, conflicts of interest,
        off-topic content, certain personal attacks, personal information and other prohibited
        material.
      </p>
      <p>The useful question is therefore not:</p>
      <p>&quot;How negative is this review?&quot;</p>
      <p>It is:</p>
      <p>&quot;What specific Google policy, if any, does this review violate?&quot;</p>
      <p>That is the question a strong removal request should answer.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>Google will not remove a review simply because:</p>
      <ul>
        <li>it gives the business one star</li>
        <li>the business disagrees with it</li>
        <li>the reviewer is difficult</li>
        <li>the review feels unfair</li>
        <li>the business cannot immediately identify the reviewer</li>
        <li>the review damages the business&apos;s reputation</li>
      </ul>
      <p>
        Google says only reviews that violate its policies are eligible for policy-based removal.
      </p>
      <p>Potential policy issues can include:</p>
      <ul>
        <li>fake engagement or a review that does not represent a genuine experience</li>
        <li>paid, incentivised or manipulated reviews</li>
        <li>reviews posted to undermine a competitor</li>
        <li>conflicts of interest</li>
        <li>off-topic content</li>
        <li>personal attacks or certain offensive content</li>
        <li>personal or confidential information</li>
        <li>advertising or solicitation</li>
        <li>other content prohibited by Google&apos;s Maps policies</li>
      </ul>
      <p>
        If you believe a review violates policy, report the review through Google&apos;s
        review-removal process and choose the reason that most accurately describes the issue.
      </p>
      <p>
        The Reviews Management Tool can show whether the report is still pending or whether Google
        found no policy violation.
      </p>
      <p>
        If Google reports no policy violation and you disagree, Google currently provides a one-time
        appeal for eligible reviews.
      </p>
      <p>If the appeal finds a policy violation, Google says the review will be removed.</p>
      <p>
        If Google determines that the review complies with its policies, the review remains live.
      </p>
      <p>Separate routes exist for review extortion and for content you believe violates local law.</p>
    </>
  ),
  main: (
    <>
      <h2>Google removes policy violations, not ordinary negative feedback</h2>
      <p>This is the starting rule.</p>
      <p>
        Google tells businesses that they can report any review, but only reviews that violate
        Google policies are eligible for removal.
      </p>
      <p>
        Google also specifically tells businesses not to report reviews merely because they disagree
        with them or dislike them.
      </p>
      <p>That means a negative review is not automatically an inappropriate review.</p>
      <p>A customer can describe a genuinely poor experience.</p>
      <p>They can give a low rating.</p>
      <p>They can disagree with how the business handled a complaint.</p>
      <p>They can write something the business considers harsh.</p>
      <p>If the content remains within Google&apos;s policies, it may stay live.</p>
      <p>
        Removal should therefore be assessed against the policy, not against how damaging the review
        feels.
      </p>

      <h2>Fake engagement can qualify for removal</h2>
      <p>
        Google&apos;s Maps policies say contributions should reflect a genuine experience at a place
        or business.
      </p>
      <p>Google describes fake engagement as content that does not represent a genuine experience.</p>
      <p>Its prohibited-content guidance includes examples such as:</p>
      <ul>
        <li>content not based on a real experience</li>
        <li>reviews or ratings that were paid for, directly or in kind</li>
        <li>content posted from multiple accounts by or at the request of one person</li>
        <li>behaviour intended to manipulate genuine engagement</li>
      </ul>
      <p>
        Google also prohibits merchants and users from encouraging content that does not represent a
        genuine experience.
      </p>
      <p>
        So if there is a genuine basis to believe the review was fabricated rather than based on a
        real experience, fake engagement may be the relevant policy area.
      </p>
      <p>
        But &quot;I do not recognise this name&quot; is not, by itself, the same thing as proving fake
        engagement.
      </p>
      <p>Investigate before making that claim.</p>

      <h2>
        Not finding the reviewer in your records does not automatically prove the review is fake
      </h2>
      <p>This is one of the most important distinctions for businesses.</p>
      <p>A reviewer might:</p>
      <ul>
        <li>use a different Google display name</li>
        <li>have visited with another person</li>
        <li>have been a passenger, guest or family member</li>
        <li>have used a different email address or phone number</li>
        <li>have interacted without creating the type of record you normally expect</li>
        <li>be describing an experience connected to somebody else in their party</li>
      </ul>
      <p>That does not mean every unidentified reviewer is genuine.</p>
      <p>
        It means the absence of an obvious customer record should be treated as evidence to
        investigate, not as automatic proof that Google&apos;s fake-engagement policy has been
        violated.
      </p>
      <p>Look at the review itself.</p>
      <p>
        Check dates, services, locations, staff references and any factual detail you can
        legitimately verify.
      </p>
      <p>Then decide which policy issue you can actually support.</p>

      <h2>Paid and incentivised reviews are prohibited</h2>
      <p>
        Google&apos;s policies prohibit reviews and ratings posted because of incentives such as
        payment, discounts or free goods or services.
      </p>
      <p>
        Google also prohibits offering an incentive in exchange for revising or removing a negative
        review.
      </p>
      <p>The rule applies in both directions.</p>
      <p>Businesses should not buy positive reviews.</p>
      <p>They should not reward customers specifically for changing a negative review.</p>
      <p>
        And reviewers should not use paid or manipulated review activity to distort the rating of a
        business.
      </p>
      <p>
        If the evidence shows that a review is part of paid or incentivised review manipulation,
        describe that policy issue rather than simply describing the rating as suspicious.
      </p>

      <h2>Competitor attacks and conflicts of interest can violate policy</h2>
      <p>Google says content based on a conflict of interest is not allowed.</p>
      <p>Its current guidance says a conflict of interest may include:</p>
      <ul>
        <li>current employment</li>
        <li>former employment</li>
        <li>a contractual relationship</li>
        <li>a consultancy relationship</li>
        <li>other professional affiliations</li>
        <li>personal affiliations that demonstrate a conflict</li>
      </ul>
      <p>
        Google also specifically prohibits posting content on a competitor&apos;s business to
        undermine that competitor&apos;s reputation.
      </p>
      <p>
        This does not mean that every review from somebody who knows the business is automatically
        removable.
      </p>
      <p>The relationship and the reason it creates a conflict matter.</p>
      <p>
        If a former employee, competitor or professionally connected person posts a review, explain
        the actual relationship and why it falls within the relevant policy rather than relying only
        on the label &quot;competitor&quot; or &quot;ex-employee.&quot;
      </p>

      <h2>Off-topic reviews can be removed</h2>
      <p>
        Google says reviews should be based on experiences at the specific location or business.
      </p>
      <p>Its policy does not allow reviews that primarily become:</p>
      <ul>
        <li>general political commentary</li>
        <li>social commentary</li>
        <li>personal rants unrelated to the location</li>
        <li>other content that is not about an experience with the place</li>
      </ul>
      <p>A review does not become off-topic merely because the business dislikes the subject.</p>
      <p>Ask whether the content is actually describing an experience with the business.</p>
      <p>
        If most of the review is about something unrelated to that experience, off-topic may be the
        relevant reporting reason.
      </p>

      <h2>Personal attacks and offensive content can cross the policy line</h2>
      <p>Google allows people to describe negative experiences in a respectful manner.</p>
      <p>It does not give reviewers unlimited permission to attack people.</p>
      <p>Google&apos;s prohibited-content policy covers forms of offensive content and harassment.</p>
      <p>
        Its current guidance includes restrictions around personal attacks and certain unsubstantiated
        allegations of unethical behaviour or criminal wrongdoing.
      </p>
      <p>The distinction matters.</p>
      <p>&quot;This was the worst service I have received&quot; is criticism of an experience.</p>
      <p>
        A targeted abusive attack on an identifiable member of staff may raise a different policy
        issue.
      </p>
      <p>
        Report the content that actually violates the rule rather than treating every strongly worded
        complaint as harassment.
      </p>

      <h2>Reviews containing personal information may violate policy</h2>
      <p>
        Google restricts the publication of personal information without consent where disclosure
        could create a risk of harm or misuse.
      </p>
      <p>Examples of sensitive personal information can require separate privacy consideration.</p>
      <p>
        If a review exposes information such as private contact details or other protected personal
        information, do not focus the report only on whether the reviewer&apos;s experience was
        genuine.
      </p>
      <p>The privacy issue itself may be the relevant policy violation.</p>
      <p>
        Preserve the review link and a record of what was published before reporting it, without
        unnecessarily redistributing the personal information.
      </p>

      <h2>Advertising and solicitation do not belong in reviews</h2>
      <p>Google does not allow reviews to be used for advertising or solicitation.</p>
      <p>
        Its current policy includes promotional or commercial content and the posting of contact
        details or links for solicitation purposes.
      </p>
      <p>
        A review that is really an advertisement, lead-generation message or promotional pitch may
        therefore be a policy issue even if it happens to include a star rating.
      </p>
      <p>Identify the promotional purpose clearly when reporting it.</p>

      <h2>A factual dispute needs careful treatment</h2>
      <p>
        Google&apos;s policies prohibit misleading content and false or misleading accounts of goods
        or services.
      </p>
      <p>But that does not mean Google automatically removes a review whenever a business says:</p>
      <p>&quot;That statement is false.&quot;</p>
      <p>Customer reviews often contain:</p>
      <ul>
        <li>opinions</li>
        <li>incomplete recollections</li>
        <li>disagreements about conversations</li>
        <li>different interpretations of an event</li>
      </ul>
      <p>Google does not act as an ordinary mediator between a business and a customer.</p>
      <p>
        If you believe a review contains fabricated factual claims, identify the specific policy
        issue and preserve the evidence that makes the claim materially different from an ordinary
        disagreement.
      </p>
      <p>
        Do not tell Google that something is proven false when you cannot actually establish that.
      </p>

      <h2>Report the review against the most relevant policy</h2>
      <p>Google provides the Reviews Management Tool for businesses to report reviews for removal.</p>
      <p>Use the Google Account associated with the affected Business Profile.</p>
      <p>Select the business.</p>
      <p>Choose the review you want to report.</p>
      <p>Then select the reporting reason that most accurately matches the problem.</p>
      <p>Examples Google gives include reasons such as Spam or Profanity.</p>
      <p>
        Do not choose a dramatic category merely because you think it sounds more likely to get a
        review removed.
      </p>
      <p>
        A focused policy report is stronger when the review, the reason selected and the evidence all
        describe the same problem.
      </p>

      <h2>Keep a record before you report</h2>
      <p>Before submitting a report, save enough information to understand the case later.</p>
      <p>Record:</p>
      <ul>
        <li>the direct review link</li>
        <li>reviewer display name</li>
        <li>star rating</li>
        <li>review text</li>
        <li>date shown</li>
        <li>relevant screenshots</li>
        <li>the policy you believe applies</li>
        <li>why you believe it applies</li>
        <li>any legitimate supporting evidence</li>
        <li>the date you submitted the report</li>
      </ul>
      <p>Do not alter evidence.</p>
      <p>Do not create fake customer records.</p>
      <p>Do not contact a reviewer merely to manufacture material for the report.</p>
      <p>The purpose of the case record is to preserve what actually happened.</p>

      <h2>Understand the Reviews Management Tool statuses</h2>
      <p>Google currently gives businesses several useful reporting statuses.</p>
      <p>Decision pending means the review was reported but has not yet been evaluated.</p>
      <p>
        Report reviewed - no policy violation means Google evaluated the review and did not find a
        policy violation.
      </p>
      <p>Google says that if you disagree with that decision, you can submit a one-time appeal.</p>
      <p>
        Escalated - check your email for updates means the appeal has been escalated and Google will
        send the final result by email.
      </p>
      <p>These statuses are important because they tell you where the case actually is.</p>
      <p>
        Do not repeatedly create new reports because you have forgotten whether the first one was
        reviewed.
      </p>

      <h2>Google currently provides a one-time review appeal</h2>
      <p>
        If Google evaluates the reported review and finds no policy violation, its current process
        allows a one-time appeal for eligible reviews.
      </p>
      <p>Google&apos;s Reviews Management Tool lets you select eligible reported reviews for appeal.</p>
      <p>Google currently says you can select up to 10 reviews in that appeal.</p>
      <p>Use the appeal to explain the specific policy issue more clearly.</p>
      <p>Do not simply say:</p>
      <p>&quot;The review is unfair.&quot;</p>
      <p>Connect the review to the actual Google policy.</p>
      <p>If useful evidence exists, organise it around that policy issue.</p>

      <h2>What happens after the appeal</h2>
      <p>Google says it will send the result of the appeal by email.</p>
      <p>If Google determines that the review violates its policies, it will be removed.</p>
      <p>
        If Google determines that the review complies with its policies, it remains live.
      </p>
      <p>That is an important commercial boundary for ProfileRelaunch.</p>
      <p>
        We can help a business identify the relevant policy, organise the case and use the
        appropriate reporting route.
      </p>
      <p>We cannot decide Google&apos;s outcome.</p>
      <p>
        And we should never sell review support on the basis that every negative review can be
        removed.
      </p>

      <h2>A compliant negative review may stay live</h2>
      <p>This is sometimes the correct result.</p>
      <p>A genuine customer may have had a bad experience.</p>
      <p>The business may strongly disagree with their interpretation.</p>
      <p>The review may still comply with Google&apos;s policies.</p>
      <p>
        If there is no defensible policy violation, repeatedly reporting the review does not turn it
        into one.
      </p>
      <p>At that point, removal support may not be the right service.</p>
      <p>
        The business may be better served by responding professionally, correcting genuine
        operational issues and continuing to earn authentic customer feedback.
      </p>
      <p>
        ProfileRelaunch should not manufacture a removal case where the policy does not support one.
      </p>

      <h2>Review extortion has a separate Google reporting route</h2>
      <p>
        If somebody posts or threatens negative reviews and then demands money, goods, services or
        favours in exchange for removing them, do not treat that as an ordinary customer dispute.
      </p>
      <p>Google has a dedicated reporting process for negative-review extortion.</p>
      <p>Google tells merchants:</p>
      <ul>
        <li>do not engage with or pay the malicious individuals</li>
        <li>do not offer money or services to resolve the demand</li>
        <li>gather evidence immediately</li>
        <li>preserve communications and review links</li>
        <li>report the extortion through Google&apos;s dedicated form</li>
      </ul>
      <p>
        This route is specifically for direct extortion attempts involving demands for money or
        favours in exchange for review removal.
      </p>
      <p>
        Ordinary spam, fake or off-topic reviews should use the normal review-reporting process.
      </p>

      <h2>Legal removal is separate from policy removal</h2>
      <p>
        Google says its prohibited and restricted content policies apply to Maps content around the
        world.
      </p>
      <p>
        Google also provides a separate route for content that somebody believes violates local law.
      </p>
      <p>
        A legal-removal request is not the same thing as reporting a review for violating Google&apos;s
        ordinary review policies.
      </p>
      <p>
        For example, a business believing that content raises a legal defamation issue is making a
        different kind of claim from:
      </p>
      <p>&quot;This review is fake engagement.&quot;</p>
      <p>
        ProfileRelaunch does not determine whether a statement is legally defamatory or unlawful.
      </p>
      <p>
        Where the issue is genuinely legal rather than a Google-policy issue, appropriate independent
        legal advice may be needed.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says businesses can report reviews for removal, but only reviews that violate
          Google policies are eligible for policy-based removal.
        </p>
        <p>
          Google specifically says not to report a review merely because you disagree with it or
          dislike it, and says it does not get involved in ordinary conflicts between businesses and
          customers.
        </p>
        <p>
          Google&apos;s Maps policies require reviews to reflect genuine experiences and prohibit fake
          engagement, paid or incentivised reviews, rating manipulation and certain conflicts of
          interest.
        </p>
        <p>
          Google also restricts categories of content including off-topic material, certain offensive
          content, personal information, advertising and solicitation.
        </p>
        <p>
          After a review is reported, Google&apos;s Reviews Management Tool may show Decision pending
          or Report reviewed - no policy violation.
        </p>
        <p>
          If Google finds no policy violation and the business disagrees, Google currently provides a
          one-time appeal for eligible reviews.
        </p>
        <p>Google says up to 10 eligible reviews can be selected for that appeal.</p>
        <p>If the appeal finds that the review violates policy, Google removes it.</p>
        <p>
          If Google determines that the review complies with policy, it remains live.
        </p>
        <p>
          Google provides separate processes for negative-review extortion and for content believed
          to violate local law.
        </p>
      </>
    ),
    sources: [sourceReportInappropriateReviews, sourceProhibitedRestrictedContent],
  },
  interpretation: (
    <>
      <p>A review-removal case should begin with classification, not frustration.</p>
      <p>There are four useful questions.</p>
      <p>First:</p>
      <p>Is the review simply negative, or does it actually raise a policy issue?</p>
      <p>Second:</p>
      <p>Which Google policy most closely matches the problem?</p>
      <p>Third:</p>
      <p>What genuine information supports that classification?</p>
      <p>Fourth:</p>
      <p>
        Which Google process applies — ordinary review reporting, a one-time appeal, the extortion
        route or a legal-removal route?
      </p>
      <p>That framework prevents two opposite mistakes.</p>
      <p>
        It prevents businesses from giving up on genuinely abusive reviews that may violate policy.
      </p>
      <p>
        And it prevents businesses from spending money trying to remove legitimate negative feedback
        that Google is entitled to leave online.
      </p>
      <p>ProfileRelaunch&apos;s role is to help make that distinction clearly.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not report a review simply because it is one star.</p>
      <p>
        Do not assume a reviewer is fake only because you cannot immediately find their name in your
        records.
      </p>
      <p>Do not invent evidence that the reviewer was never a customer.</p>
      <p>Do not call every negative review harassment.</p>
      <p>Do not call every factual disagreement misinformation.</p>
      <p>
        Do not report a competitor or former employee without explaining the actual conflict of
        interest.
      </p>
      <p>
        Do not offer money, discounts, goods or services in exchange for changing or removing a
        review.
      </p>
      <p>
        Do not pay somebody who is demanding money or favours to remove negative reviews.
      </p>
      <p>Do not repeatedly submit the same report when Google&apos;s tool already shows its status.</p>
      <p>
        Before reporting, be able to identify the specific Google policy and the facts that make you
        believe it applies.
      </p>
    </>
  ),
  checklist: {
    heading: "Google review removal assessment checklist",
    items: [
      "Save the direct link to the review.",
      "Record the review text, rating, reviewer name and date shown.",
      "Decide whether the issue is genuinely about removal or simply disagreement with negative feedback.",
      "Read Google's current prohibited and restricted content policy.",
      "Identify the single strongest policy category that may apply.",
      "Check whether there is evidence that the review represents fake engagement rather than a genuine experience.",
      "Check for any relevant conflict of interest, including professional, employment, contractual or competitor relationships.",
      "Check whether the content is off-topic rather than about an experience with the business.",
      "Check for prohibited personal information, abusive content, advertising or solicitation.",
      "Preserve genuine supporting evidence without altering it.",
      "Report the review through Google's review-removal process using the most accurate reason.",
      "Record when the report was submitted.",
      "Check the status in the Reviews Management Tool rather than repeatedly reporting the same review.",
      "If Google reports no policy violation, decide whether there is a defensible basis for the one-time appeal.",
      "Use the appeal to explain the policy issue, not simply the commercial harm caused by the review.",
      "If the case involves a demand for money or favours in exchange for review removal, use Google's dedicated extortion process.",
      "If the issue is genuinely about alleged illegality rather than Google's ordinary review policies, consider the appropriate legal-removal route and independent legal advice where needed.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Treating every one-star review as removable.",
        body: "Google permits genuine negative reviews. The rating is not itself a policy violation.",
      },
      {
        title: "Assuming “not in our database” proves fake engagement.",
        body: "The absence of an obvious customer record can be useful context, but it does not by itself establish that no genuine experience occurred.",
      },
      {
        title: "Reporting the review without reading the policy.",
        body: "A report is easier to assess when the selected reason, review content and supporting facts all point to the same policy issue.",
      },
      {
        title: "Calling an ordinary customer disagreement harassment.",
        body: "Strong criticism and a policy-violating personal attack are not the same thing. Classify the actual content rather than the emotion it creates.",
      },
      {
        title: "Ignoring a real conflict of interest.",
        body: "Google's policies recognise conflicts including current or former employment and certain professional or personal relationships. Explain the relationship accurately when it genuinely applies.",
      },
      {
        title: "Submitting more reports instead of checking the existing status.",
        body: "Google's Reviews Management Tool shows whether a review is pending, has been assessed or has moved into the appeal process.",
      },
      {
        title: "Using the one-time appeal to repeat “this review is unfair.”",
        body: "The appeal should focus on the specific policy violation and the information that supports it.",
      },
      {
        title: "Promising that an appeal will remove the review.",
        body: "Google makes the final policy decision. A review remains live if Google determines that it complies with its policies.",
      },
      {
        title: "Treating extortion as an ordinary review complaint.",
        body: "Google has a dedicated reporting route when somebody demands money or favours in exchange for removing negative reviews.",
      },
      {
        title: "Treating a legal dispute as an ordinary policy flag.",
        body: "Google separates its Maps content policies from its process for content believed to violate local law.",
      },
    ],
  },
  scenarios: [
    {
      heading: "I cannot find the reviewer in my customer records",
      body: (
        <>
          <p>Do not jump directly from:</p>
          <p>&quot;I cannot find this name&quot;</p>
          <p>to:</p>
          <p>&quot;This review is definitely fake.&quot;</p>
          <p>Investigate the review first.</p>
          <p>Check the date, service described, location, staff references and other details.</p>
          <p>
            Consider whether the reviewer could have used another name or been connected to somebody
            else who interacted with the business.
          </p>
          <p>
            If the facts genuinely indicate that no real experience occurred, fake engagement may be
            the appropriate Google policy.
          </p>
          <p>
            If all you know is that the display name is unfamiliar, be careful not to claim more than
            the evidence supports.
          </p>
        </>
      ),
    },
    {
      heading: "The customer is real, but everything they wrote is wrong",
      body: (
        <>
          <p>Separate opinion from facts.</p>
          <p>
            A customer is allowed to describe a negative experience and may remember or interpret
            events differently from the business.
          </p>
          <p>
            Google&apos;s policies do prohibit misleading content, but Google also says it does not
            get involved in ordinary business-customer disputes.
          </p>
          <p>Identify any specific policy issue that goes beyond disagreement.</p>
          <p>
            If there is no defensible policy violation, the review may remain live even though you
            strongly disagree with it.
          </p>
        </>
      ),
    },
    {
      heading: "The review came from a former employee or competitor",
      body: (
        <>
          <p>
            Google&apos;s current policy says a conflict of interest may include current or former
            employment and other professional or personal affiliations.
          </p>
          <p>
            It also prohibits posting content on a competitor&apos;s business to undermine its
            reputation.
          </p>
          <p>Preserve the information that establishes the real relationship.</p>
          <p>Then report the review against the relevant policy.</p>
          <p>Do not exaggerate the relationship.</p>
          <p>The strongest case explains exactly why that reviewer has a conflicting interest.</p>
        </>
      ),
    },
    {
      heading: "The reviewer wants money to delete the review",
      body: (
        <>
          <p>Do not pay them.</p>
          <p>
            Google has a dedicated negative-review extortion process for cases where somebody
            directly demands money or favours in exchange for review removal.
          </p>
          <p>Preserve:</p>
          <ul>
            <li>the review links</li>
            <li>messages</li>
            <li>screenshots</li>
            <li>dates and times</li>
            <li>contact details</li>
            <li>the actual demand</li>
          </ul>
          <p>Use Google&apos;s extortion reporting route.</p>
          <p>Do not try to resolve the demand by offering money, goods or services.</p>
        </>
      ),
    },
    {
      heading: "The review contains personal information or potentially unlawful statements",
      body: (
        <>
          <p>First determine which issue you are actually dealing with.</p>
          <p>Google has privacy rules covering certain personal information.</p>
          <p>
            Google also provides a separate legal-removal route for content somebody believes
            violates local law.
          </p>
          <p>
            Those are different from a normal complaint that a review is negative or inaccurate.
          </p>
          <p>Use the route that matches the issue.</p>
          <p>
            ProfileRelaunch can help explain Google&apos;s policy process, but it does not determine
            whether content is legally defamatory or unlawful.
          </p>
          <p>
            Where legal rights are genuinely in question, independent legal advice may be
            appropriate.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>The right question is not “Can we get this review removed?”</h2>
      <p>A better first question is:</p>
      <p>“Does this review violate a Google policy?”</p>
      <p>Sometimes the answer is yes.</p>
      <p>
        A review may be fake, manipulated, conflicted, off-topic, abusive, privacy-invasive or
        otherwise prohibited.
      </p>
      <p>In those cases, Google&apos;s reporting and appeal processes exist for a reason.</p>
      <p>Sometimes the answer is no.</p>
      <p>
        A real customer may have posted genuine negative feedback that the business dislikes but that
        still falls within Google&apos;s rules.
      </p>
      <p>That review may remain live.</p>
      <p>
        Knowing the difference protects the business from wasting time, making weak reports or paying
        somebody who promises an outcome they cannot control.
      </p>
      <p>
        If you are unsure which side of that line a review falls on, ProfileRelaunch can review the
        content, the surrounding facts and the relevant Google policy and explain the strongest
        appropriate next step.
      </p>
      <p>That may be a removal report.</p>
      <p>It may be a one-time appeal.</p>
      <p>It may require the separate extortion or legal route.</p>
      <p>
        And sometimes the right recommendation is not to pursue paid removal support because the
        review does not present a strong policy case.
      </p>
    </>
  ),
  sourcesUsed: canAGoogleReviewBeRemovedSources,
}
