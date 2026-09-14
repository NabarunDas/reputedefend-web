import {
  sourceFakeEngagement,
  sourceManageCustomerReviews,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
} from "@/lib/resource-sources/google-maps-reviews"

export const fakeOrGenuineNegativeFeedbackSlug = "fake-google-review-or-genuine-negative-feedback"

export const fakeOrGenuineNegativeFeedbackSources = [
  sourceProhibitedRestrictedContent,
  sourceFakeEngagement,
  sourceMapsUgcPolicy,
  sourceReportInappropriateReviews,
  sourceManageCustomerReviews,
]

export const fakeOrGenuineNegativeFeedbackBody = {
  intro: (
    <>
      <p>A suspicious Google review is not automatically a fake Google review.</p>
      <p>That distinction matters.</p>
      <p>
        Google&apos;s current Maps policy says reviews and ratings should reflect genuine experiences
        with businesses. Content that does not represent a genuine experience can fall under
        Google&apos;s fake-engagement rules.
      </p>
      <p>But businesses rarely have access to Google&apos;s internal signals about a reviewer.</p>
      <p>
        You may see an unfamiliar name, a one-star rating, vague wording or details you disagree
        with. Those things can make a review worth investigating, but they do not individually prove
        that the reviewer had no genuine experience.
      </p>
      <p>The opposite is also true.</p>
      <p>
        A detailed review is not automatically genuine simply because it contains names, dates or
        specific allegations. Details can be inaccurate or fabricated.
      </p>
      <p>The useful approach is therefore not to label the reviewer first.</p>
      <p>Start with the evidence.</p>
      <p>
        Ask what the review claims, what your legitimate business records can establish, whether
        there is a plausible connection to a real experience, and whether any wider pattern points
        toward fake engagement, rating manipulation or a conflict of interest.
      </p>
      <p>Then decide what you can responsibly say to Google.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        Google defines fake engagement as content that does not represent a genuine experience.
      </p>
      <p>A negative review can still be genuine.</p>
      <p>An unfamiliar reviewer can still be genuine.</p>
      <p>
        A reviewer who is not listed under the same name in your customer records can still be
        genuine.
      </p>
      <p>Likewise, a detailed review can still be fabricated.</p>
      <p>Do not decide from one signal.</p>
      <p>Assess the whole picture.</p>
      <p>Useful questions include:</p>
      <ul>
        <li>Does the review describe a service, product or location that your business actually provides?</li>
        <li>Can you connect the described event to a genuine interaction?</li>
        <li>Are important factual details impossible or materially inconsistent with the business?</li>
        <li>Could the reviewer reasonably have used another name or been connected to another customer?</li>
        <li>Is there evidence of a competitor, employment or other conflict of interest?</li>
        <li>Did several unusual reviews arrive in a pattern that may indicate rating manipulation?</li>
        <li>Is the same or very similar content appearing from multiple accounts?</li>
        <li>Is there direct evidence of payment, incentives, coordination or fabrication?</li>
      </ul>
      <p>Treat those as evidence questions, not shortcuts.</p>
      <p>
        If the review appears to be genuine negative feedback, a professional response may be more
        appropriate than a removal report.
      </p>
      <p>
        If the evidence supports fake engagement, rating manipulation or another Google policy
        violation, use the appropriate reporting route.
      </p>
      <p>If the evidence is inconclusive, do not turn suspicion into certainty.</p>
    </>
  ),
  main: (
    <>
      <h2>Start with Google&apos;s definition, not your instinct</h2>
      <p>
        Google describes fake engagement as content that does not represent a genuine experience.
      </p>
      <p>
        Its broader policy says reviews and ratings should reflect actual experiences with businesses
        and should be genuine and unbiased.
      </p>
      <p>That gives you the correct starting question:</p>
      <p>Is there a reasonable basis to believe this review does not represent a genuine experience?</p>
      <p>That is different from:</p>
      <p>Do I recognise the reviewer&apos;s name?</p>
      <p>Do I agree with the review?</p>
      <p>Is the rating unfair?</p>
      <p>Would I prefer the review to disappear?</p>
      <p>
        Those questions may explain why a review feels suspicious or damaging, but they do not
        establish fake engagement.
      </p>

      <h2>An unfamiliar reviewer name is only one piece of information</h2>
      <p>Many businesses begin with:</p>
      <p>&quot;We have never had a customer called this.&quot;</p>
      <p>That can be useful information.</p>
      <p>It is not a complete investigation.</p>
      <p>A Google display name may not match the name stored by the business.</p>
      <p>The person posting the review may have:</p>
      <ul>
        <li>booked under another name</li>
        <li>attended with another customer</li>
        <li>been a passenger, guest or family member</li>
        <li>communicated through another person</li>
        <li>used a different email address</li>
        <li>used a nickname or pseudonym</li>
        <li>interacted in a way that did not create a normal customer record</li>
      </ul>
      <p>None of those possibilities proves the review is genuine.</p>
      <p>They simply explain why:</p>
      <p>&quot;I cannot find this name&quot;</p>
      <p>should not automatically become:</p>
      <p>&quot;This person definitely never experienced our business.&quot;</p>
      <p>Keep the distinction clear.</p>

      <h2>Check whether the experience described is even possible</h2>
      <p>Read the review slowly.</p>
      <p>Separate the reviewer&apos;s opinion from factual details that can legitimately be checked.</p>
      <p>For example:</p>
      <ul>
        <li>service mentioned</li>
        <li>product mentioned</li>
        <li>business location</li>
        <li>operating hours</li>
        <li>staff role</li>
        <li>appointment type</li>
        <li>delivery method</li>
        <li>facilities described</li>
        <li>approximate date or period</li>
        <li>sequence of events</li>
      </ul>
      <p>Ask whether those details are compatible with the real business.</p>
      <p>A review describing a service you have never offered may deserve closer scrutiny.</p>
      <p>
        So may a review describing a physical visit to a business that only operates remotely or as a
        service-area business.
      </p>
      <p>But avoid overclaiming.</p>
      <p>A single incorrect detail does not automatically prove the entire experience was invented.</p>
      <p>People can make mistakes.</p>
      <p>Look for the weight of the evidence.</p>

      <h2>Look for a plausible connection to a genuine interaction</h2>
      <p>
        Where lawful and appropriate, compare the review with ordinary business records you already
        hold.
      </p>
      <p>That might include:</p>
      <ul>
        <li>appointment records</li>
        <li>bookings</li>
        <li>invoices</li>
        <li>orders</li>
        <li>support conversations</li>
        <li>delivery records</li>
        <li>complaint records</li>
        <li>staff recollections</li>
      </ul>
      <p>The purpose is not to build a surveillance file on the reviewer.</p>
      <p>It is to answer a narrow question:</p>
      <p>Can the experience described reasonably be connected to a real interaction?</p>
      <p>
        If you find a plausible match, take that seriously even if the reviewer&apos;s account is
        unfair or incomplete.
      </p>
      <p>
        A genuine customer dispute is not transformed into fake engagement merely because the
        business disagrees with the customer&apos;s interpretation.
      </p>

      <h2>Specific detail is useful, but it is not proof of authenticity</h2>
      <p>A detailed review can be easier to investigate because it gives you facts to compare.</p>
      <p>But detail alone does not prove that the reviewer had a genuine experience.</p>
      <p>A fabricated review can contain:</p>
      <ul>
        <li>staff names</li>
        <li>plausible dates</li>
        <li>industry terminology</li>
        <li>copied details</li>
        <li>information found on the business website</li>
        <li>claims designed to sound credible</li>
      </ul>
      <p>Use specific details as things to check.</p>
      <p>Do not treat them as an authenticity certificate.</p>

      <h2>Vagueness is suspicious context, not proof of fakery</h2>
      <p>The same caution applies in reverse.</p>
      <p>A review such as:</p>
      <p>&quot;Terrible. Avoid.&quot;</p>
      <p>contains very little information.</p>
      <p>That makes it difficult to connect to a genuine event.</p>
      <p>But some real customers leave short reviews.</p>
      <p>A vague review does not automatically violate Google&apos;s fake-engagement policy.</p>
      <p>Treat lack of detail as limited evidence, not proof.</p>

      <h2>A factual disagreement is not the same as a fake experience</h2>
      <p>
        Suppose you identify the reviewer as a genuine customer but believe several statements are
        wrong.
      </p>
      <p>That is a different problem.</p>
      <p>The person may have had a genuine experience and still:</p>
      <ul>
        <li>misunderstand what happened</li>
        <li>remember a conversation differently</li>
        <li>omit important context</li>
        <li>exaggerate</li>
        <li>express an opinion the business considers unreasonable</li>
      </ul>
      <p>
        Google says it does not get involved in ordinary conflicts between businesses and customers.
      </p>
      <p>
        Do not report a genuine customer as fake merely because you believe their account is
        inaccurate.
      </p>
      <p>Assess whether a separate Google content policy genuinely applies.</p>

      <h2>Conflict-of-interest evidence can materially change the assessment</h2>
      <p>
        Google&apos;s current policies say content based on a conflict of interest can constitute
        rating manipulation.
      </p>
      <p>Google gives examples including:</p>
      <ul>
        <li>current employment</li>
        <li>former employment</li>
        <li>contractual relationships</li>
        <li>consultancy relationships</li>
        <li>professional affiliations</li>
        <li>personal affiliations that demonstrate a conflict</li>
        <li>industry competitors</li>
      </ul>
      <p>
        Google also prohibits posting content on a competitor&apos;s business to undermine its
        reputation.
      </p>
      <p>
        If you can establish that the reviewer is a competitor, employee, former employee or
        otherwise conflicted, preserve the factual basis for that relationship.
      </p>
      <p>
        Do not merely assume a reviewer must be a competitor because the review is hostile.
      </p>
      <p>The relationship should be real and supportable.</p>

      <h2>Patterns across several reviews can matter</h2>
      <p>
        Google&apos;s rating-manipulation policy specifically refers to unusual volumes or patterns of
        review contributions that indicate attempts to manipulate a place&apos;s rating.
      </p>
      <p>That means context can matter beyond one individual review.</p>
      <p>Examples worth investigating can include:</p>
      <ul>
        <li>several reviews arriving in an unusually short period</li>
        <li>repeated or highly similar wording</li>
        <li>several accounts making closely related claims</li>
        <li>a cluster appearing around the same external event</li>
        <li>multiple reviews connected to the same known dispute</li>
        <li>evidence that one person requested or coordinated reviews from several accounts</li>
      </ul>
      <p>A pattern does not automatically prove manipulation.</p>
      <p>
        A genuine event can also cause several real customers to review a business at the same time.
      </p>
      <p>Record the pattern and the surrounding facts before drawing a conclusion.</p>

      <h2>Identical or repeated content deserves closer scrutiny</h2>
      <p>Google does not allow repetitive content that dilutes useful information.</p>
      <p>
        Its fake-engagement policy also prohibits content posted from multiple accounts by or at the
        request of one person.
      </p>
      <p>
        If several reviews contain identical or unusually similar wording, preserve that information.
      </p>
      <p>Compare:</p>
      <ul>
        <li>wording</li>
        <li>timing</li>
        <li>rating</li>
        <li>allegations</li>
        <li>account behaviour visible on Google</li>
        <li>any direct evidence of coordination</li>
      </ul>
      <p>Do not claim the accounts belong to the same person unless you actually have evidence for that.</p>
      <p>Describe what you can observe.</p>

      <h2>A sudden cluster is not automatically review bombing</h2>
      <p>Several negative reviews appearing together can be alarming.</p>
      <p>Do not label the event &quot;review bombing&quot; before checking what happened.</p>
      <p>Ask whether there was:</p>
      <ul>
        <li>a real service failure affecting several customers</li>
        <li>a public incident</li>
        <li>a change in opening or delivery</li>
        <li>a widely shared customer complaint</li>
        <li>an external campaign unrelated to genuine customer experiences</li>
        <li>evidence of coordinated posting</li>
      </ul>
      <p>A legitimate event can create a genuine spike in negative feedback.</p>
      <p>An organised campaign can create a fake or manipulated spike.</p>
      <p>The timing tells you to investigate.</p>
      <p>It does not give you the answer by itself.</p>

      <h2>Do not use the reviewer&apos;s profile as a shortcut</h2>
      <p>A reviewer profile can provide context, but avoid simplistic rules.</p>
      <p>A person with only one visible review is not automatically fake.</p>
      <p>A Local Guide is not automatically genuine.</p>
      <p>A long review history is not proof that every contribution is legitimate.</p>
      <p>A new-looking account is not proof of manipulation.</p>
      <p>Google uses its own systems and signals to assess suspicious user activity.</p>
      <p>
        Your assessment should stay focused on the evidence available for the review and the policy
        issue you can support.
      </p>

      <h2>Direct evidence is stronger than suspicion</h2>
      <p>Some cases contain much clearer evidence.</p>
      <p>Examples can include:</p>
      <ul>
        <li>a message admitting the reviewer never used the business</li>
        <li>a competitor relationship you can genuinely establish</li>
        <li>evidence that reviews were purchased</li>
        <li>an offer to post or remove reviews for payment</li>
        <li>a request asking several people to post reviews despite having no genuine experience</li>
        <li>identical content coordinated across multiple accounts</li>
        <li>communications connecting the reviews to a manipulation campaign</li>
      </ul>
      <p>Preserve that evidence carefully.</p>
      <p>Do not edit screenshots.</p>
      <p>Keep original messages where possible.</p>
      <p>Record dates, account names and direct review links.</p>
      <p>
        Direct evidence can make the policy issue much clearer than assumptions based only on a star
        rating or unfamiliar username.
      </p>

      <h2>Do not contact the reviewer just to manufacture evidence</h2>
      <p>There can be legitimate reasons to contact a real customer about a complaint.</p>
      <p>
        But do not confront somebody purely to provoke a statement that you hope will strengthen a
        removal request.
      </p>
      <p>Do not threaten them.</p>
      <p>Do not impersonate somebody else.</p>
      <p>Do not offer an incentive for changing or removing the review.</p>
      <p>
        Google specifically prohibits incentives in exchange for posting, revising or removing
        reviews.
      </p>
      <p>If communication already exists, preserve it.</p>
      <p>Do not manufacture a dispute around the reporting process.</p>

      <h2>If the review appears genuine, treat it as customer feedback</h2>
      <p>Sometimes the investigation leads to an uncomfortable but useful answer:</p>
      <p>the reviewer probably did have a genuine experience.</p>
      <p>That does not mean everything they wrote is correct.</p>
      <p>It means fake engagement is probably not the strongest policy argument.</p>
      <p>Google allows businesses to reply publicly to reviews.</p>
      <p>
        Google&apos;s current guidance recommends keeping responses professional, relevant, clear and
        helpful.
      </p>
      <p>A measured response can:</p>
      <ul>
        <li>acknowledge the concern</li>
        <li>correct important context without exposing private information</li>
        <li>explain what the business can do next</li>
        <li>show future customers that the business responds constructively</li>
      </ul>
      <p>
        Do not use the public reply to attack the reviewer or publish their private information.
      </p>

      <h2>If the evidence supports fake engagement, report the policy issue clearly</h2>
      <p>
        If your assessment points strongly toward a non-genuine experience, use Google&apos;s
        review-reporting process.
      </p>
      <p>Focus on what you can establish.</p>
      <p>For example:</p>
      <ul>
        <li>the review describes an impossible service or location</li>
        <li>there is direct evidence the reviewer never had the claimed experience</li>
        <li>the review is linked to coordinated activity</li>
        <li>several accounts were used at one person&apos;s request</li>
        <li>the reviewer has a genuine conflict of interest</li>
        <li>there is evidence of paid or incentivised review activity</li>
      </ul>
      <p>Choose the reporting reason that most closely fits the actual policy issue.</p>
      <p>
        Do not add claims you cannot support simply to make the case sound stronger.
      </p>

      <h2>If the evidence is inconclusive, say so</h2>
      <p>Not every suspicious review can be classified with confidence.</p>
      <p>You may end up with:</p>
      <ul>
        <li>no customer match</li>
        <li>no direct proof of fabrication</li>
        <li>no identifiable conflict</li>
        <li>no wider pattern</li>
        <li>very little detail in the review</li>
      </ul>
      <p>That is uncertainty.</p>
      <p>Do not turn it into certainty because the review is damaging.</p>
      <p>
        You can preserve the case, monitor for additional related activity and reassess if new
        evidence appears.
      </p>
      <p>If you report it, keep the explanation proportionate to what you actually know.</p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says contributions to Maps should reflect genuine experiences with places or
          businesses.
        </p>
        <p>
          Google defines fake engagement as content that does not represent a genuine experience.
        </p>
        <p>
          Its current policies prohibit content that is not based on a real experience, paid or
          incentivised reviews, content posted from multiple accounts by or at the request of one
          person and other attempts to manipulate genuine engagement.
        </p>
        <p>
          Google&apos;s rating-manipulation policy also covers unusual volumes or patterns of review
          activity that indicate efforts to manipulate a business&apos;s rating.
        </p>
        <p>
          Content based on conflicts of interest can also violate policy. Google&apos;s examples
          include current or former employment and certain contractual, professional, personal or
          competitor relationships.
        </p>
        <p>
          Google separately says businesses should not report reviews merely because they disagree
          with them or dislike them.
        </p>
        <p>
          A genuine negative review can therefore remain live when it complies with Google&apos;s
          policies.
        </p>
      </>
    ),
    sources: [sourceProhibitedRestrictedContent, sourceFakeEngagement],
  },
  interpretation: (
    <>
      <p>The goal is not to decide whether you trust the reviewer emotionally.</p>
      <p>The goal is to classify the evidence.</p>
      <p>Think in three possible outcomes.</p>
      <p>First:</p>
      <p>There is a plausible genuine experience.</p>
      <p>
        The review may be unfair, exaggerated or factually disputed, but fake engagement is not the
        strongest explanation.
      </p>
      <p>Second:</p>
      <p>The evidence is genuinely uncertain.</p>
      <p>
        You cannot connect the review to a customer, but you also cannot responsibly establish that
        the experience was fabricated.
      </p>
      <p>Third:</p>
      <p>
        There is meaningful evidence of fake engagement, rating manipulation, coordination or a
        conflict of interest.
      </p>
      <p>
        Only the third category gives you a strong basis for saying that the review may violate
        Google&apos;s authenticity rules.
      </p>
      <p>The uncertain middle category matters.</p>
      <p>Responsible review protection sometimes means saying:</p>
      <p>&quot;We do not have enough evidence yet.&quot;</p>
      <p>
        That is better than building a removal request around claims that cannot be supported.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not call a review fake solely because it is negative.</p>
      <p>
        Do not call a review fake solely because you do not recognise the reviewer&apos;s Google name.
      </p>
      <p>Do not assume a short or vague review is fabricated.</p>
      <p>Do not assume a detailed review is genuine.</p>
      <p>Do not assume a new-looking reviewer account proves manipulation.</p>
      <p>Do not assume a Local Guide badge proves authenticity.</p>
      <p>
        Do not label a sudden group of negative reviews as review bombing before checking whether a
        real event affected several customers.
      </p>
      <p>
        Do not accuse a competitor, employee or former employee unless you can establish the
        relationship.
      </p>
      <p>Do not contact a reviewer simply to provoke evidence for a removal request.</p>
      <p>
        Do not offer money, discounts, goods or services for changing or removing a review.
      </p>
      <p>
        Write down what you know, what you can verify and what remains uncertain before deciding
        which Google policy applies.
      </p>
    </>
  ),
  checklist: {
    heading: "Fake review or genuine feedback assessment checklist",
    items: [
      "Save the direct review link, text, rating, reviewer display name and date shown.",
      "Separate the reviewer's opinions from factual claims you can legitimately check.",
      "Identify the service, product, location or event the review says occurred.",
      "Check whether that experience is possible for your real business.",
      "Look for a plausible connection to ordinary business records you already hold.",
      "Consider whether the reviewer could have used another name or been connected to another genuine customer.",
      "Record any important details that materially conflict with how the business actually operates.",
      "Check whether there is genuine evidence of a competitor, employment, contractual, professional or other conflict of interest.",
      "Check whether several reviews arrived in an unusual pattern.",
      "Preserve any repeated or closely coordinated wording across reviews.",
      "Preserve direct evidence of payment, incentives, coordination or fabrication if it exists.",
      "Do not treat account age, Local Guide status or review count as automatic proof either way.",
      "Decide whether the evidence points toward a genuine experience, an uncertain case or a likely policy violation.",
      "If the experience appears genuine, consider an appropriate professional response instead of a fake-engagement report.",
      "If the evidence supports a policy violation, report the review using the most accurate Google policy reason.",
      "If the evidence is inconclusive, preserve the case and avoid claiming certainty you do not have.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "“We cannot find this name, so the review is fake.”",
        body: "An unfamiliar Google display name is useful context, but the reviewer may have booked under another name, attended with somebody else or interacted without creating the record you expect.",
      },
      {
        title: "Assuming detail proves the review is genuine.",
        body: "Specific names, dates or industry terminology can be checked, but they are not proof by themselves that a genuine experience occurred.",
      },
      {
        title: "Assuming vagueness proves the review is fake.",
        body: "Some genuine customers leave very short reviews. Lack of detail limits what can be verified but does not automatically establish fake engagement.",
      },
      {
        title: "Treating a factual dispute as proof of fabrication.",
        body: "A real customer can misunderstand, exaggerate or remember events differently. That is not automatically the same thing as inventing the entire experience.",
      },
      {
        title: "Calling a reviewer a competitor without evidence.",
        body: "Conflict-of-interest rules can be powerful when a real relationship exists. Unsupported accusations weaken the assessment.",
      },
      {
        title: "Treating every sudden review spike as coordinated abuse.",
        body: "Google's policy recognises suspicious patterns, but real events can also prompt several genuine customers to review a business at the same time.",
      },
      {
        title: "Judging authenticity from the reviewer's profile alone.",
        body: "Account age, review count and Local Guide status can provide context but are not reliable authenticity tests by themselves.",
      },
      {
        title: "Ignoring direct evidence while focusing on weak clues.",
        body: "Messages, proven relationships, coordinated wording and evidence of incentives can be more meaningful than assumptions based on usernames or star ratings.",
      },
      {
        title: "Confronting the reviewer to create a stronger case.",
        body: "Preserve existing evidence. Do not provoke, threaten or incentivise somebody merely to manufacture evidence for a removal request.",
      },
      {
        title: "Forcing an uncertain case into a fake-review conclusion.",
        body: "Sometimes the evidence does not establish whether the experience was genuine. Uncertainty should be recorded as uncertainty.",
      },
    ],
  },
  scenarios: [
    {
      heading: "The reviewer name is not in our system",
      body: (
        <>
          <p>Start by treating that as a clue, not a conclusion.</p>
          <p>Check whether the review describes:</p>
          <ul>
            <li>a real service</li>
            <li>a real location</li>
            <li>a plausible date</li>
            <li>a recognisable staff interaction</li>
            <li>a genuine complaint already known to the business</li>
          </ul>
          <p>Consider whether another person booked or paid.</p>
          <p>If nothing connects the review to a real experience, record that.</p>
          <p>
            But do not tell Google that the reviewer definitely was never a customer unless the
            evidence genuinely supports that statement.
          </p>
        </>
      ),
    },
    {
      heading: "The review contains detailed claims, but they are impossible",
      body: (
        <>
          <p>Specific details give you something to investigate.</p>
          <p>
            If the review describes a branch that does not exist, a service you have never offered or
            circumstances that were genuinely impossible, preserve the evidence that establishes
            that.
          </p>
          <p>
            Then consider whether the inconsistencies are substantial enough to support fake
            engagement or misrepresentation.
          </p>
          <p>Do not rely only on:</p>
          <p>&quot;This sounds wrong.&quot;</p>
          <p>Explain the real-world facts that make the claimed experience implausible.</p>
        </>
      ),
    },
    {
      heading: "Several one-star reviews arrived overnight",
      body: (
        <>
          <p>Do not immediately call it review bombing.</p>
          <p>Record:</p>
          <ul>
            <li>exact arrival times</li>
            <li>reviewer names</li>
            <li>wording</li>
            <li>ratings</li>
            <li>similarities</li>
            <li>any shared allegation</li>
            <li>any external event that may explain the spike</li>
          </ul>
          <p>Then check whether a real incident affected multiple customers.</p>
          <p>
            Google&apos;s policy recognises unusual review patterns as potentially relevant to rating
            manipulation.
          </p>
          <p>
            The pattern matters most when it is combined with evidence that the activity is not based
            on genuine experiences.
          </p>
        </>
      ),
    },
    {
      heading: "The reviewer is a former employee",
      body: (
        <>
          <p>A real former-employment relationship is important.</p>
          <p>Google&apos;s conflict-of-interest examples currently include former employment.</p>
          <p>Preserve information that legitimately establishes the relationship.</p>
          <p>
            Then assess the review under the relevant conflict-of-interest policy rather than trying
            to prove the person was never connected to the business.
          </p>
          <p>Do not publish private employment information unnecessarily in a public reply.</p>
        </>
      ),
    },
    {
      heading: "We think the review is suspicious, but we cannot prove why",
      body: (
        <>
          <p>Do not invent a reason.</p>
          <p>Save the review and document what made it unusual.</p>
          <p>Check for relevant records, patterns and conflicts.</p>
          <p>If no meaningful evidence emerges, recognise that the case remains uncertain.</p>
          <p>You can reassess if related activity appears later.</p>
          <p>
            ProfileRelaunch should not convert uncertainty into a confident fake-review claim simply
            because the review is harmful.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Suspicion starts the investigation — evidence decides the case</h2>
      <p>Businesses are often right to notice when a review feels unusual.</p>
      <p>The mistake is treating that instinct as the final answer.</p>
      <p>An unfamiliar name may be fake.</p>
      <p>It may also be a real customer using a different Google identity.</p>
      <p>A detailed story may be genuine.</p>
      <p>It may also be fabricated.</p>
      <p>A sudden review spike may be coordinated manipulation.</p>
      <p>It may also follow a real event involving several customers.</p>
      <p>The useful work is in between:</p>
      <p>preserve the review,</p>
      <p>check the facts,</p>
      <p>look for a plausible real interaction,</p>
      <p>identify genuine conflicts or patterns,</p>
      <p>and separate what you know from what you suspect.</p>
      <p>
        If the evidence supports fake engagement or another Google policy violation, use the
        reporting process.
      </p>
      <p>
        If the review appears to represent a genuine experience, treat it as feedback even if you
        dispute parts of it.
      </p>
      <p>And if the evidence is genuinely uncertain, say so.</p>
      <p>
        ProfileRelaunch can help assess the review, the available business records and the relevant
        Google policy and explain the strongest appropriate next step.
      </p>
      <p>The aim is not to label every bad review fake.</p>
      <p>
        It is to identify the cases where the evidence gives you a defensible reason to ask Google
        to act.
      </p>
    </>
  ),
  sourcesUsed: fakeOrGenuineNegativeFeedbackSources,
}
