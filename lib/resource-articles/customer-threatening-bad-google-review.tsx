import {
  sourceManageCustomerReviews,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReviewExtortion,
  sourceReviewRatingScams,
} from "@/lib/resource-sources/google-maps-reviews"

export const customerThreateningReviewSlug = "customer-threatening-bad-google-review"

export const customerThreateningReviewSources = [
  sourceReviewExtortion,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceManageCustomerReviews,
  sourceReviewRatingScams,
]

export const customerThreateningReviewBody = {
  intro: (
    <>
      <p>A customer dispute and a review threat can happen at the same time.</p>
      <p>That does not mean they are the same issue.</p>
      <p>A customer may genuinely believe they deserve a refund.</p>
      <p>They may also say:</p>
      <p>&quot;Refund me or I will leave a one-star review.&quot;</p>
      <p>Or:</p>
      <p>&quot;I will remove the review if you give me my money back.&quot;</p>
      <p>The business may strongly disagree with the underlying complaint.</p>
      <p>The mistake is jumping immediately to either extreme:</p>
      <p>&quot;This is definitely extortion.&quot;</p>
      <p>or:</p>
      <p>&quot;We have to pay because they can damage our rating.&quot;</p>
      <p>Start by separating the questions.</p>
      <p>Is there a genuine commercial dispute that needs to be resolved on its own merits?</p>
      <p>
        And is the customer making money, goods, services or another benefit a condition for posting,
        changing or removing Google review content?
      </p>
      <p>Preserve the exact wording before deciding which Google process applies.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        If a customer threatens a bad Google review unless you refund, pay or compensate them:
      </p>
      <ul>
        <li>preserve the exact message</li>
        <li>keep the surrounding conversation</li>
        <li>record the underlying transaction or service dispute</li>
        <li>do not alter screenshots</li>
        <li>separate the refund decision from the review decision</li>
        <li>
          do not offer money, discounts, free goods or services specifically in exchange for a review
          being revised or removed
        </li>
        <li>
          if a refund is genuinely due, make that decision because of the underlying customer issue, not
          as payment for review deletion
        </li>
        <li>if a review is posted, assess the actual review against Google&apos;s content policies</li>
        <li>
          if there is a direct demand for money, goods, services or favours in exchange for removing
          negative reviews, assess Google&apos;s dedicated review-extortion route
        </li>
        <li>do not call every refund disagreement extortion</li>
        <li>do not make public criminal accusations</li>
        <li>do not share private customer information in your response</li>
      </ul>
      <p>Google allows genuine negative reviews.</p>
      <p>Google does not remove reviews merely because a business disagrees with the customer.</p>
      <p>At the same time, Google&apos;s policies prohibit incentivised review manipulation.</p>
      <p>
        The safest approach is therefore to keep the customer-service decision and the Google-review
        decision separate.
      </p>
    </>
  ),
  main: (
    <>
      <h2>First separate the customer dispute from the review threat</h2>
      <p>Suppose a customer says a product was defective and asks for a refund.</p>
      <p>That is one issue.</p>
      <p>Now suppose they add:</p>
      <p>&quot;If you do not refund me, I will leave you one star.&quot;</p>
      <p>That introduces a second issue.</p>
      <p>Do not let the review threat replace your assessment of the underlying complaint.</p>
      <p>Ask separately:</p>
      <ul>
        <li>Was the product or service delivered?</li>
        <li>Was there a genuine problem?</li>
        <li>What was agreed?</li>
        <li>What refund, warranty or complaint process applies?</li>
        <li>What records exist?</li>
        <li>What exactly did the customer say about the review?</li>
      </ul>
      <p>
        The commercial dispute should be handled according to the facts, your legitimate business process
        and any legal obligations that apply.
      </p>
      <p>The review issue should be assessed against Google&apos;s policies.</p>
      <p>Do not merge the two into one emotional argument.</p>

      <h2>A genuine customer is still allowed to leave negative feedback</h2>
      <p>
        Google specifically says businesses should not report reviews merely because they disagree with
        them or dislike them.
      </p>
      <p>Google also says it does not get involved in ordinary conflicts between businesses and customers.</p>
      <p>That means a genuine customer can post a critical review about a real experience.</p>
      <p>The fact that they also asked for a refund does not automatically make the review fake.</p>
      <p>They may be wrong.</p>
      <p>They may exaggerate.</p>
      <p>The business may completely reject their account.</p>
      <p>But the removal question still depends on whether the review violates Google&apos;s policies.</p>
      <p>Do not report the review merely because the underlying refund dispute is unresolved.</p>

      <h2>A refund request by itself is not the same thing as review extortion</h2>
      <p>Customers ask businesses for refunds every day.</p>
      <p>A refund request may be reasonable, unreasonable or disputed.</p>
      <p>The existence of that request alone does not establish a Google review-extortion case.</p>
      <p>The important evidence is the connection between the benefit being demanded and the review activity.</p>
      <p>For example:</p>
      <p>&quot;I want a refund because the service was not completed.&quot;</p>
      <p>is different from:</p>
      <p>&quot;Give me a refund and I will remove the one-star review.&quot;</p>
      <p>Likewise:</p>
      <p>&quot;I am unhappy and I intend to tell people what happened.&quot;</p>
      <p>
        is different from a direct demand making review removal conditional on receiving money, goods,
        services or favours.
      </p>
      <p>
        Preserve the exact wording instead of forcing every difficult customer conversation into the same
        category.
      </p>

      <h2>Do not pay for review deletion</h2>
      <p>
        Google&apos;s policies prohibit merchants from offering incentives such as payment, discounts,
        free goods or services in exchange for posting, revising or removing a review.
      </p>
      <p>That creates an important boundary.</p>
      <p>Do not tell the customer:</p>
      <p>&quot;We will refund you if you delete the review.&quot;</p>
      <p>Do not offer:</p>
      <ul>
        <li>money</li>
        <li>discounts</li>
        <li>vouchers</li>
        <li>free products</li>
        <li>free services</li>
        <li>credits</li>
        <li>upgrades</li>
        <li>another benefit</li>
      </ul>
      <p>on the condition that they remove or change Google review content.</p>
      <p>Even when the business feels pressured, buying the disappearance of a review is not the right response.</p>

      <h2>If a refund is genuinely appropriate, keep it independent of the review</h2>
      <p>This distinction is extremely important.</p>
      <p>A business may decide that a refund is appropriate because:</p>
      <ul>
        <li>something went wrong</li>
        <li>the customer did not receive what was agreed</li>
        <li>the business wants to resolve a genuine complaint</li>
        <li>a contractual or legal obligation applies</li>
        <li>another legitimate commercial reason exists</li>
      </ul>
      <p>That decision should stand on its own.</p>
      <p>Do not make the refund conditional on:</p>
      <ul>
        <li>deleting a review</li>
        <li>increasing a star rating</li>
        <li>revising the wording</li>
        <li>agreeing not to review the business</li>
      </ul>
      <p>Resolve the customer issue because it should be resolved.</p>
      <p>Do not purchase a review outcome.</p>

      <h2>Preserve the exact threat or condition</h2>
      <p>Do not rely on memory.</p>
      <p>Save the original conversation.</p>
      <p>Depending on how the customer contacted you, preserve:</p>
      <ul>
        <li>email</li>
        <li>SMS</li>
        <li>WhatsApp messages</li>
        <li>platform messages</li>
        <li>written complaint correspondence</li>
        <li>voicemail details</li>
        <li>call notes made at the time</li>
      </ul>
      <p>Where possible, preserve:</p>
      <ul>
        <li>sender identity</li>
        <li>date</li>
        <li>time</li>
        <li>the complete relevant conversation</li>
        <li>the exact demand</li>
        <li>the exact statement about the review</li>
      </ul>
      <p>Do not crop material in a way that removes important context.</p>
      <p>Do not rewrite the customer&apos;s words to make them sound more threatening.</p>

      <h2>Create a simple timeline</h2>
      <p>A timeline can help separate a normal dispute from review pressure.</p>
      <p>Record:</p>
      <ul>
        <li>when the customer purchased or used the service</li>
        <li>when the complaint began</li>
        <li>when a refund or compensation was requested</li>
        <li>what the business replied</li>
        <li>when the review threat was made</li>
        <li>when any review was posted</li>
        <li>when the customer offered to change or remove it</li>
        <li>whether further demands followed</li>
      </ul>
      <p>Keep the sequence factual.</p>
      <p>Timing can help explain what happened without requiring you to speculate about motive.</p>

      <h2>If the review has already been posted, assess the review separately</h2>
      <p>Do not assume that a review becomes removable because there was a difficult refund conversation.</p>
      <p>Read the actual contribution.</p>
      <p>Ask:</p>
      <ul>
        <li>Does it describe a genuine experience?</li>
        <li>Does it contain fake engagement?</li>
        <li>Is it misleading in a way covered by Google&apos;s policies?</li>
        <li>Does it contain prohibited harassment?</li>
        <li>Does it expose personal information?</li>
        <li>Is it off-topic?</li>
        <li>Is there another identifiable policy issue?</li>
      </ul>
      <p>Report what the review actually violates.</p>
      <p>Do not replace policy analysis with:</p>
      <p>&quot;The customer demanded a refund.&quot;</p>

      <h2>A direct demand tied to review removal may require the extortion route</h2>
      <p>Google has a dedicated merchant reporting route for negative-review extortion.</p>
      <p>
        Google says that route is specifically for cases where a business has been directly subjected to
        an extortion attempt involving demands for money or favours in exchange for review removal.
      </p>
      <p>If a person explicitly says:</p>
      <p>&quot;Give me money and I will remove these reviews.&quot;</p>
      <p>
        or makes another direct demand for something of value in exchange for removing negative review
        content, preserve that evidence immediately.
      </p>
      <p>The dedicated route may be relevant.</p>
      <p>Do not promise yourself that Google will classify every refund dispute this way.</p>
      <p>Submit the facts and let Google investigate.</p>

      <h2>Do not make criminal-law conclusions</h2>
      <p>Words such as:</p>
      <p>extortion,</p>
      <p>blackmail,</p>
      <p>fraud,</p>
      <p>coercion</p>
      <p>can also have legal meanings that vary by jurisdiction.</p>
      <p>
        ProfileRelaunch should not tell a business that a customer has committed a crime simply because a
        review and refund request are connected.
      </p>
      <p>For Google-policy purposes, the practical question is narrower:</p>
      <p>
        Is there a documented demand for money, goods, services or favours in exchange for removing
        negative reviews?
      </p>
      <p>
        Where there are threats, safety concerns, fraud or potential criminal conduct beyond the Google
        review issue, appropriate independent legal or local-authority advice may be needed.
      </p>
      <p>ProfileRelaunch does not provide legal advice.</p>

      <h2>Do not prolong the dispute just to collect more evidence</h2>
      <p>Once you have clear written evidence, do not deliberately provoke the customer into becoming more threatening.</p>
      <p>Do not bait them.</p>
      <p>Do not pretend to agree to payment purely to create additional screenshots.</p>
      <p>Do not create a fake negotiation.</p>
      <p>Preserve what genuinely happened.</p>
      <p>
        Then move the customer issue through the appropriate complaint or refund process and the review
        issue through the appropriate Google process.
      </p>

      <h2>Do not threaten the customer in return</h2>
      <p>Do not respond with:</p>
      <p>&quot;Delete the review or we will sue you.&quot;</p>
      <p>&quot;Remove the review or we will publish your details.&quot;</p>
      <p>&quot;We will report you everywhere unless you take it down.&quot;</p>
      <p>Escalating the exchange can create a second problem.</p>
      <p>
        If legal action is genuinely being considered, obtain appropriate legal advice and handle it
        through the proper route.
      </p>
      <p>Do not use threats as a review-management strategy.</p>

      <h2>Do not publish private correspondence in the review reply</h2>
      <p>A public review response is visible to potential customers.</p>
      <p>It is not the place to publish:</p>
      <ul>
        <li>private email addresses</li>
        <li>phone numbers</li>
        <li>home addresses</li>
        <li>payment details</li>
        <li>order information that identifies the customer unnecessarily</li>
        <li>private messages</li>
        <li>screenshots of the conversation</li>
        <li>confidential complaint records</li>
      </ul>
      <p>If you reply publicly, keep it calm and proportionate.</p>
      <p>
        You can say that you take the concern seriously and invite the customer to continue through the
        appropriate private channel.
      </p>
      <p>Keep private evidence for the appropriate reporting or dispute process.</p>

      <h2>Do not assume the customer must remove the review after a refund</h2>
      <p>A refund does not purchase control over the customer&apos;s Google account.</p>
      <p>
        If you refund a customer because the refund is genuinely appropriate, do not assume they now owe
        you deletion of the review.
      </p>
      <p>Google&apos;s policies prohibit incentives for revision or removal of negative reviews.</p>
      <p>
        The customer may independently choose to update their review because their experience changed.
      </p>
      <p>That is different from the business making the refund conditional on review removal.</p>

      <h2>If the review changes after the dispute is resolved</h2>
      <p>A customer may independently revise their review after the business resolves the complaint.</p>
      <p>That can happen naturally.</p>
      <p>Do not pressure them to write a particular rating or wording.</p>
      <p>Do not say:</p>
      <p>&quot;We refunded you, so please change this to five stars.&quot;</p>
      <p>Do not dictate the text.</p>
      <p>The safest position is:</p>
      <p>resolve the genuine customer issue properly,</p>
      <p>then let the reviewer decide independently what they want to say.</p>

      <h2>Use ordinary review reporting when there is a separate policy violation</h2>
      <p>If the posted review independently violates Google&apos;s content policies, use the ordinary review-reporting process.</p>
      <p>Examples might include:</p>
      <ul>
        <li>fake engagement</li>
        <li>prohibited personal information</li>
        <li>certain harassment</li>
        <li>off-topic content</li>
        <li>conflicts of interest</li>
        <li>other prohibited contributions</li>
      </ul>
      <p>Track the report through the Reviews Management Tool.</p>
      <p>
        If Google finds no policy violation and the review is eligible, Google&apos;s current process
        provides a one-time appeal.
      </p>
      <p>
        Do not use the dedicated extortion form merely because the review is negative or the refund
        dispute is unpleasant.
      </p>

      <h2>If there is a direct review-removal demand, organise the evidence clearly</h2>
      <p>For a potential Google extortion report, keep the case narrow.</p>
      <p>Record:</p>
      <ul>
        <li>the affected Business Profile</li>
        <li>the review links</li>
        <li>the customer&apos;s contact details as actually provided</li>
        <li>the demand</li>
        <li>what they asked for</li>
        <li>what they said would happen to the review</li>
        <li>relevant screenshots</li>
        <li>dates and times</li>
        <li>the transaction or dispute context</li>
      </ul>
      <p>The goal is not to prove that the customer is a bad person.</p>
      <p>The goal is to show Google the relationship between the demand and the review activity.</p>

      <h2>A compliant review may still remain live</h2>
      <p>This can be frustrating.</p>
      <p>The business may resolve the complaint.</p>
      <p>The customer may keep the review.</p>
      <p>The business may disagree with most of what the customer wrote.</p>
      <p>If the review complies with Google&apos;s policies, Google may leave it live.</p>
      <p>At that point, a professional response may be more appropriate than repeatedly reporting the review.</p>
      <p>
        ProfileRelaunch should not promise removal merely because a refund dispute feels unfair.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says businesses should not report reviews merely because they disagree with them or
          dislike them, and Google does not get involved in ordinary conflicts between businesses and
          customers.
        </p>
        <p>
          Google&apos;s Maps policies separately prohibit merchants from offering incentives such as
          payment, discounts, free goods or services in exchange for posting, revising or removing a
          review.
        </p>
        <p>Google also provides a dedicated reporting route for negative-review extortion.</p>
        <p>
          Google says that route is specifically for cases where a merchant has been directly subjected
          to an extortion attempt involving a demand for money or favours in exchange for review removal.
        </p>
        <p>
          Google tells merchants facing such an extortion attempt not to pay or try to resolve it by
          offering money or services and to preserve the relevant evidence.
        </p>
        <p>Reviews that violate policy for other reasons should use the normal review-reporting process.</p>
        <p>Google makes the final decision about review removal and its investigation.</p>
      </>
    ),
    sources: [sourceReviewExtortion, sourceProhibitedRestrictedContent],
  },
  interpretation: (
    <>
      <p>There are two decisions to make, and they should not depend on each other.</p>
      <p>Decision one:</p>
      <p>
        Does the customer genuinely deserve a refund, repair, replacement, compensation or another
        commercial resolution?
      </p>
      <p>Decision two:</p>
      <p>Does the review behaviour create a defensible Google policy issue?</p>
      <p>A refund can be appropriate even when the customer&apos;s review behaviour is unacceptable.</p>
      <p>
        A refund can also be inappropriate even when the customer is allowed to post a genuine negative
        review.
      </p>
      <p>Keep those decisions separate.</p>
      <p>And never turn a legitimate customer resolution into payment for a particular Google review outcome.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not assume every customer asking for a refund is committing review extortion.</p>
      <p>Do not pay simply because somebody threatens a one-star review.</p>
      <p>
        Do not offer a refund, discount, product or service on the condition that the review is removed
        or changed.
      </p>
      <p>
        Do not deny a genuinely appropriate refund simply because the customer also mentioned a review.
      </p>
      <p>Do not delete the messages that show what happened.</p>
      <p>Do not edit screenshots.</p>
      <p>Do not deliberately provoke the customer to obtain stronger threats.</p>
      <p>Do not threaten the customer in return.</p>
      <p>Do not publish private complaint or payment information in a public review response.</p>
      <p>Do not call the customer a criminal publicly.</p>
      <p>
        Separate the underlying dispute from the Google review issue and deal with each on its own facts.
      </p>
    </>
  ),
  checklist: {
    heading: "Customer review threat assessment checklist",
    items: [
      "Save the customer's exact message about the review.",
      "Preserve the surrounding conversation so the wording remains in context.",
      "Record the original transaction, booking, service or purchase involved.",
      "Record what the customer says went wrong.",
      "Record what refund, payment, product, service or other benefit they are requesting.",
      "Determine whether the business has a legitimate reason to provide a refund or another remedy independent of the review.",
      "Do not make any refund or benefit conditional on the customer removing or changing Google review content.",
      "Record whether the customer has already posted a review.",
      "If a review exists, save its direct link, rating, text, reviewer name and date shown.",
      "Assess the review itself against Google's normal content policies.",
      "Record the exact wording connecting money, goods, services or favours to posting, changing or removing the review.",
      "Create a factual timeline of the dispute, review threat and any posted review.",
      "Keep private correspondence out of the public review response.",
      "Use ordinary review reporting where the review independently violates Google's content policies.",
      "Assess Google's dedicated extortion route where there is a direct demand for something of value in exchange for review removal.",
      "Keep a record of anything submitted to Google.",
      "Seek appropriate independent advice where the wider dispute involves legal, safety or fraud issues outside Google's review policies.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Calling every refund demand extortion.",
        body: "A genuine customer may legitimately dispute a charge or ask for a refund. The review condition and the underlying commercial dispute need to be assessed separately.",
      },
      {
        title: "Paying because the rating feels more urgent than the dispute.",
        body: "Pressure from a threatened review should not replace a proper assessment of whether any refund or compensation is genuinely due.",
      },
      {
        title: "Offering a refund only if the review is deleted.",
        body: "Google prohibits merchants from offering payment, discounts, free goods or services in exchange for revision or removal of a negative review.",
      },
      {
        title: "Refusing a justified remedy because the customer mentioned Google.",
        body: "If a refund or other resolution is genuinely appropriate, make that decision on the underlying customer issue rather than using the review as leverage in the opposite direction.",
      },
      {
        title: "Assuming a real customer review must be fake because the dispute is aggressive.",
        body: "A real customer can behave unreasonably and still have had a genuine experience. Assess the review against the actual Google policies.",
      },
      {
        title: "Using the extortion form for every hostile complaint.",
        body: "Google's dedicated route is for direct extortion attempts involving demands tied to review removal. Ordinary review-policy issues use the normal reporting process.",
      },
      {
        title: "Publishing the private conversation online.",
        body: "Evidence needed for a dispute or Google report does not automatically belong in a public review response.",
      },
      {
        title: "Threatening the customer back.",
        body: "Escalating the argument can create additional risk and does not improve the policy case.",
      },
      {
        title: "Assuming a refund means the customer now owes you a positive review.",
        body: "A legitimate commercial resolution should not purchase a star rating, revised wording or removal of a negative review.",
      },
    ],
  },
  scenarios: [
    {
      heading: "The customer says “Refund me or I will leave one star”",
      body: (
        <>
          <p>Preserve the exact message.</p>
          <p>Then assess the underlying refund dispute independently.</p>
          <p>
            If a refund is genuinely appropriate, resolve that issue because it should be resolved — not
            because you are purchasing silence.
          </p>
          <p>Do not reply:</p>
          <p>&quot;We will refund you only if you agree not to review us.&quot;</p>
          <p>
            If the customer later posts a review, assess the actual content under Google&apos;s normal
            policies.
          </p>
          <p>Keep the original threat as context without overstating what it proves.</p>
        </>
      ),
    },
    {
      heading: "The customer already posted the review and says they will remove it after a refund",
      body: (
        <>
          <p>Preserve both the review and the written condition.</p>
          <p>Do not promise payment in exchange for deletion.</p>
          <p>First determine whether a refund is independently due.</p>
          <p>
            Separately, assess whether the direct demand tying money or another benefit to review removal
            fits Google&apos;s dedicated extortion-reporting guidance.
          </p>
          <p>Provide the facts to Google without making criminal-law conclusions.</p>
          <p>Google decides how it treats the incident.</p>
        </>
      ),
    },
    {
      heading: "The customer deserves a refund, but they are also threatening a review",
      body: (
        <>
          <p>
            The review threat does not automatically cancel the business&apos;s genuine obligations to the
            customer.
          </p>
          <p>If the refund is appropriate, make the decision on that basis.</p>
          <p>Document that it is being provided to resolve the underlying transaction or service problem.</p>
          <p>Do not make the refund conditional on:</p>
          <ul>
            <li>deleting the review</li>
            <li>raising the star rating</li>
            <li>changing the wording</li>
            <li>agreeing not to post</li>
          </ul>
          <p>Keep the commercial resolution independent.</p>
        </>
      ),
    },
    {
      heading: "The customer wants far more money than they originally paid",
      body: (
        <>
          <p>Preserve the demand and the surrounding dispute.</p>
          <p>Do not automatically label the amount extortionate simply because it seems unreasonable.</p>
          <p>Record:</p>
          <ul>
            <li>what was purchased</li>
            <li>what was paid</li>
            <li>what is being demanded now</li>
            <li>why the customer says they are entitled to it</li>
            <li>what they have said about the Google review</li>
          </ul>
          <p>
            If the demand is directly tied to removal of negative reviews, that connection may be relevant
            to Google&apos;s extortion process.
          </p>
          <p>Questions about legal entitlement to compensation are outside ProfileRelaunch&apos;s role.</p>
        </>
      ),
    },
    {
      heading: "The customer posted a genuine negative review after we refused the refund",
      body: (
        <>
          <p>A refused refund does not automatically make the review removable.</p>
          <p>If the customer genuinely dealt with the business, assess what they actually wrote.</p>
          <p>
            The review may comply with Google&apos;s policies even if the business believes the refund
            refusal was justified.
          </p>
          <p>Report only a genuine policy violation.</p>
          <p>
            If the review remains compliant, consider a measured public response rather than repeatedly
            trying to remove it.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Resolve the dispute — do not buy the review outcome</h2>
      <p>A threatened Google review can make an ordinary customer complaint feel much more urgent.</p>
      <p>That urgency can lead businesses into bad decisions.</p>
      <p>Do not pay simply to protect the star rating.</p>
      <p>Do not promise a refund in exchange for deletion.</p>
      <p>
        And do not refuse a genuinely appropriate customer remedy merely because the customer mentioned
        Google.
      </p>
      <p>Separate the issues.</p>
      <p>Resolve the underlying complaint on its own facts.</p>
      <p>Preserve the review threat exactly as it happened.</p>
      <p>If a review is posted, assess the review itself against Google&apos;s policies.</p>
      <p>
        If the evidence shows a direct demand for something of value in exchange for review removal,
        assess Google&apos;s dedicated extortion process without making unsupported legal accusations.
      </p>
      <p>
        ProfileRelaunch can help organise the review evidence, separate the policy issue from the customer
        dispute and explain the strongest appropriate Google route.
      </p>
      <p>
        We cannot decide whether a customer is legally entitled to money, determine whether conduct is
        criminal or guarantee that Google will remove a review.
      </p>
      <p>
        The objective is to protect the business without buying, manipulating or overstating the review
        outcome.
      </p>
    </>
  ),
  sourcesUsed: customerThreateningReviewSources,
}
