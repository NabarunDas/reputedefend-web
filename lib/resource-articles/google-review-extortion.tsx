import {
  sourceFakeEngagement,
  sourceReportInappropriateReviews,
  sourceReviewExtortion,
  sourceReviewRatingScams,
} from "@/lib/resource-sources/google-maps-reviews"

export const googleReviewExtortionSlug = "google-review-extortion"

export const googleReviewExtortionSources = [
  sourceReviewExtortion,
  sourceReviewRatingScams,
  sourceReportInappropriateReviews,
  sourceFakeEngagement,
]

export const googleReviewExtortionUrgentCallout =
  "If someone is demanding money, goods, services or favours in exchange for removing negative reviews, do not pay or bargain for removal. Preserve the messages and review links, then use Google's dedicated merchant extortion reporting route."

export const googleReviewExtortionBody = {
  urgentCallout: googleReviewExtortionUrgentCallout,
  intro: (
    <>
      <p>Google review extortion is different from an ordinary negative review.</p>
      <p>The important feature is the demand.</p>
      <p>
        Someone posts or controls negative review activity and then asks for money, goods, services
        or favours in exchange for making the reviews disappear.
      </p>
      <p>Google has a dedicated reporting route for this situation.</p>
      <p>
        If this is happening to your business, the immediate objective is not to negotiate a better
        price or persuade the person to be reasonable.
      </p>
      <p>
        It is to preserve the evidence, protect the business and report the connection between the
        demand and the reviews clearly.
      </p>
      <p>Do not pay simply to make the problem go away.</p>
      <p>
        Payment does not give you control over the reviews, and it may encourage further demands.
      </p>
      <p>Keep the case factual:</p>
      <p>what appeared,</p>
      <p>who contacted you,</p>
      <p>what they demanded,</p>
      <p>when they demanded it,</p>
      <p>and which reviews are connected to that demand.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        If somebody demands money, goods, services or favours in exchange for removing negative
        Google reviews:
      </p>
      <ul>
        <li>do not pay them</li>
        <li>do not offer money or services to settle the demand</li>
        <li>preserve the messages exactly as received</li>
        <li>save direct links to the suspicious reviews</li>
        <li>record names, usernames, email addresses, phone numbers or social accounts used to contact you</li>
        <li>record when the negative reviews appeared</li>
        <li>record when the demand arrived</li>
        <li>keep screenshots showing dates, times and sender details where possible</li>
        <li>use Google&apos;s dedicated merchant extortion reporting route</li>
        <li>provide the relevant communications and evidence</li>
      </ul>
      <p>Do not rely only on:</p>
      <p>&quot;These reviews are fake.&quot;</p>
      <p>Show the connection between the review activity and the demand.</p>
      <p>
        Google&apos;s dedicated extortion route is specifically for direct attempts involving a demand
        in exchange for review removal.
      </p>
      <p>
        If a review is simply spam, fake, off-topic or otherwise policy-violating without an
        extortion demand, use Google&apos;s ordinary review-reporting process instead.
      </p>
      <p>Do not expect an instant result or promise yourself that every review will be removed.</p>
      <p>Google investigates and makes the final decision.</p>
    </>
  ),
  main: (
    <>
      <h2>Start with the demand, not the star rating</h2>
      <p>A one-star review is not proof of extortion.</p>
      <p>Several one-star reviews are not proof of extortion.</p>
      <p>
        What changes the situation is evidence that somebody is demanding something of value in
        exchange for removing, stopping or controlling the negative review activity.
      </p>
      <p>Write down the exact demand.</p>
      <p>Do not translate it into stronger language.</p>
      <p>For example:</p>
      <ul>
        <li>money</li>
        <li>goods</li>
        <li>free services</li>
        <li>favours</li>
        <li>another form of compensation</li>
      </ul>
      <p>Then record what the person says they will do in return.</p>
      <p>
        The clearer the connection between the demand and the review activity, the clearer the case
        becomes.
      </p>

      <h2>Do not pay to make the reviews disappear</h2>
      <p>The pressure to pay can be intense.</p>
      <p>
        A business may be watching its rating fall while somebody claims the problem can disappear
        immediately.
      </p>
      <p>Do not let that urgency take control of the decision.</p>
      <p>Paying does not give you control over the scammer.</p>
      <p>It does not guarantee that reviews will be removed.</p>
      <p>It does not guarantee that new reviews will not appear.</p>
      <p>
        And it can show the person making the demand that the business is willing to pay under
        pressure.
      </p>
      <p>
        Keep the response focused on evidence and the appropriate reporting process rather than
        negotiation.
      </p>

      <h2>Do not try to bargain for review removal</h2>
      <p>Do not respond with:</p>
      <ul>
        <li>a smaller payment</li>
        <li>free products</li>
        <li>free work</li>
        <li>discounts</li>
        <li>credit</li>
        <li>vouchers</li>
        <li>another service</li>
        <li>another favour</li>
      </ul>
      <p>in an attempt to make the reviews disappear.</p>
      <p>You do not need to improve the scammer&apos;s offer before reporting the conduct.</p>
      <p>If communications already exist, preserve them.</p>
      <p>Do not deliberately prolong the conversation simply to manufacture additional evidence.</p>
      <p>Use what genuinely happened.</p>

      <h2>Preserve the demand before messages or accounts disappear</h2>
      <p>Digital evidence can change quickly.</p>
      <p>Accounts can be deleted.</p>
      <p>Messages can disappear.</p>
      <p>Review text can be edited.</p>
      <p>Usernames can change.</p>
      <p>Before submitting the report, preserve the material you already have.</p>
      <p>Keep:</p>
      <ul>
        <li>screenshots</li>
        <li>original messages where available</li>
        <li>emails</li>
        <li>chat conversations</li>
        <li>review links</li>
        <li>reviewer names</li>
        <li>contact details</li>
        <li>dates and times</li>
        <li>payment instructions</li>
        <li>account names</li>
        <li>relevant attachments</li>
      </ul>
      <p>Do not alter screenshots to make them more dramatic.</p>
      <p>Do not rewrite messages.</p>
      <p>Keep the original material wherever possible.</p>

      <h2>Save direct links to every review connected to the demand</h2>
      <p>A screenshot shows what you saw.</p>
      <p>A direct review link helps identify the actual Google contribution.</p>
      <p>Record each review that you genuinely believe is connected to the extortion attempt.</p>
      <p>For each review, keep:</p>
      <ul>
        <li>the direct link</li>
        <li>reviewer display name</li>
        <li>star rating</li>
        <li>text</li>
        <li>date shown</li>
        <li>screenshot</li>
        <li>when you first noticed it</li>
      </ul>
      <p>If several reviews appeared together, keep them separated in your evidence record.</p>
      <p>Do not assume every negative review on the profile belongs to the extortion campaign.</p>
      <p>Include the ones you have a reasonable basis to connect to the incident.</p>

      <h2>Preserve information about the person making the demand</h2>
      <p>Keep whatever identifiers the person actually used.</p>
      <p>Examples can include:</p>
      <ul>
        <li>name</li>
        <li>username</li>
        <li>email address</li>
        <li>phone number</li>
        <li>WhatsApp account</li>
        <li>Telegram account</li>
        <li>social-media profile</li>
        <li>payment account</li>
        <li>website</li>
        <li>company name they claimed to represent</li>
      </ul>
      <p>Do not guess their real identity.</p>
      <p>Do not claim two accounts belong to the same person unless you have evidence for that.</p>
      <p>
        Your job is to preserve the identifiers you received, not conduct your own undercover
        investigation.
      </p>

      <h2>Create a simple timeline</h2>
      <p>A short timeline can make a complicated incident much easier to understand.</p>
      <p>Record:</p>
      <ul>
        <li>when the first suspicious review appeared</li>
        <li>when additional reviews appeared</li>
        <li>when the first message or call arrived</li>
        <li>when the demand was made</li>
        <li>what was requested</li>
        <li>what the person promised to do in return</li>
        <li>whether further reviews appeared afterwards</li>
        <li>when you reported the incident</li>
      </ul>
      <p>Use actual dates and times where available.</p>
      <p>Do not invent precision you do not have.</p>
      <p>
        If you only know that something happened &quot;around Tuesday morning&quot;, record that
        honestly rather than creating an exact timestamp.
      </p>

      <h2>Connect the reviews to the demand without overstating the evidence</h2>
      <p>This is one of the most important parts of the case.</p>
      <p>Ask:</p>
      <p>Why do I believe these reviews and this demand are connected?</p>
      <p>Strong connections can include:</p>
      <ul>
        <li>the person identifies the reviews directly</li>
        <li>the person sends links or screenshots of them</li>
        <li>the demand refers to removing specific reviews</li>
        <li>the timing closely links the reviews and the demand</li>
        <li>the same contact claims control over the review activity</li>
        <li>communications describe what will happen if you do or do not comply</li>
      </ul>
      <p>Weak suspicion should not be presented as certainty.</p>
      <p>Describe the actual connection.</p>
      <p>Let Google assess the evidence.</p>

      <h2>Use Google&apos;s dedicated merchant extortion route</h2>
      <p>
        Google provides a specific reporting route for businesses that are directly subjected to
        negative-review extortion.
      </p>
      <p>
        Use Google&apos;s official negative-review extortion Help page and the merchant extortion
        report form linked from it.
      </p>
      <p>Prepare the evidence before submitting.</p>
      <p>The report should identify:</p>
      <ul>
        <li>the affected business</li>
        <li>the suspicious review activity</li>
        <li>the person or group making the demand</li>
        <li>how they contacted you</li>
        <li>what they demanded</li>
        <li>the evidence connecting the demand to review removal</li>
      </ul>
      <p>Provide accurate information to the best of your ability.</p>
      <p>Do not embellish the incident to make it sound more serious.</p>

      <h2>Do not confuse the extortion form with ordinary review reporting</h2>
      <p>
        Google&apos;s dedicated extortion route is not the general removal route for every suspicious
        review.
      </p>
      <p>If a review appears to violate policy because it is:</p>
      <ul>
        <li>fake engagement</li>
        <li>spam</li>
        <li>off-topic</li>
        <li>conflicted</li>
        <li>abusive</li>
        <li>otherwise prohibited</li>
      </ul>
      <p>
        but nobody has directly demanded money or favours in exchange for review removal, use the
        ordinary review-reporting process.
      </p>
      <p>A review can be policy-violating without being part of an extortion attempt.</p>
      <p>
        Likewise, an extortion incident can involve reviews that also need to be assessed under
        Google&apos;s normal content policies.
      </p>
      <p>Keep the two questions separate:</p>
      <p>What policy issue does the review raise?</p>
      <p>And:</p>
      <p>Is there a direct demand tied to review removal?</p>

      <h2>A sudden review spike is a warning sign, not the whole case</h2>
      <p>
        Google gives a sudden increase in low-star reviews followed by a demand as an example of how
        review-extortion scams may appear.
      </p>
      <p>The sequence can therefore be important.</p>
      <p>But a review spike on its own does not prove extortion.</p>
      <p>
        A real incident involving several customers can also generate a sudden wave of negative
        feedback.
      </p>
      <p>The demand is the critical evidence.</p>
      <p>
        Preserve the pattern, but do not skip the step of establishing the connection between the
        review activity and the person asking for payment or favours.
      </p>

      <h2>A genuine customer dispute needs careful classification</h2>
      <p>Not every dispute involving money and a review is automatically the same situation.</p>
      <p>A real customer might genuinely dispute:</p>
      <ul>
        <li>a refund</li>
        <li>a bill</li>
        <li>workmanship</li>
        <li>a cancellation</li>
        <li>a deposit</li>
        <li>another commercial issue</li>
      </ul>
      <p>
        Do not automatically describe an ordinary customer complaint as extortion simply because
        money is involved.
      </p>
      <p>Look at the exact wording and behaviour.</p>
      <p>
        If somebody directly makes removal of negative reviews conditional on receiving money, goods,
        services or favours, preserve that demand and assess the appropriate Google route.
      </p>
      <p>
        If the situation is primarily a genuine commercial dispute, separate that dispute from the
        review-policy assessment.
      </p>
      <p>
        ProfileRelaunch does not determine whether conduct amounts to a criminal offence under local
        law.
      </p>

      <h2>
        Be cautious when the demand comes through WhatsApp, Telegram, email or social media
      </h2>
      <p>
        The platform used for the demand does not make the claim stronger or weaker by itself.
      </p>
      <p>What matters is the content and the connection to the reviews.</p>
      <p>Preserve the account details visible on the platform.</p>
      <p>Where available, keep:</p>
      <ul>
        <li>username</li>
        <li>phone number</li>
        <li>email</li>
        <li>profile name</li>
        <li>date</li>
        <li>time</li>
        <li>full conversation context</li>
      </ul>
      <p>Avoid sharing sensitive account credentials or verification codes in response.</p>

      <h2>Watch for broader review scams</h2>
      <p>Some review scams go beyond a single demand.</p>
      <p>The person may:</p>
      <ul>
        <li>request payment through unusual methods</li>
        <li>offer to create positive reviews</li>
        <li>threaten additional one-star reviews</li>
        <li>claim they can control Google reviews</li>
        <li>claim to represent Google or another company</li>
        <li>create urgency around payment</li>
      </ul>
      <p>Do not treat those claims as proof of special access to Google&apos;s systems.</p>
      <p>
        Preserve the communication and keep control of your own accounts and credentials.
      </p>
      <p>
        Never give somebody your Google password, one-time passcode or security credentials because
        they claim they can solve a review problem.
      </p>

      <h2>If you already paid, preserve that evidence too</h2>
      <p>If money or something else of value has already been transferred, do not hide that fact.</p>
      <p>Preserve:</p>
      <ul>
        <li>payment records</li>
        <li>transaction references</li>
        <li>invoices</li>
        <li>wallet addresses</li>
        <li>bank details shown to you</li>
        <li>messages around the payment</li>
        <li>what the person promised in return</li>
        <li>what happened afterwards</li>
      </ul>
      <p>
        Do not make further payments simply because the first payment failed to solve the problem.
      </p>
      <p>
        You may also need to consider appropriate payment-provider, fraud-reporting or local-authority
        options depending on the circumstances and jurisdiction.
      </p>
      <p>ProfileRelaunch does not provide legal or criminal-law advice.</p>

      <h2>Avoid public accusations while the case is being assessed</h2>
      <p>
        It can be tempting to reply publicly to the suspicious reviews with accusations such as:
      </p>
      <p>&quot;Scammer.&quot;</p>
      <p>&quot;Extortionist.&quot;</p>
      <p>&quot;Criminal.&quot;</p>
      <p>Do not use a public review response as your investigation.</p>
      <p>
        A public response can create additional conflict and may expose information you intended to
        keep as evidence.
      </p>
      <p>
        If you choose to reply publicly, keep it professional and avoid publishing private contact
        details, payment information or unsupported accusations.
      </p>
      <p>Preserve the evidence for the appropriate reporting route.</p>

      <h2>What happens after the report is Google&apos;s decision</h2>
      <p>Once the report is submitted, Google assesses the information provided.</p>
      <p>ProfileRelaunch cannot control:</p>
      <ul>
        <li>whether Google accepts the evidence</li>
        <li>whether individual reviews are removed</li>
        <li>how Google treats the accounts involved</li>
        <li>how long an investigation takes</li>
      </ul>
      <p>Do not promise a removal date.</p>
      <p>Do not promise that every review associated with the incident will disappear.</p>
      <p>
        Keep your records so that you know what was submitted and can recognise any genuinely new
        activity.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>Google describes negative-review extortion scams as a serious policy violation.</p>
        <p>
          Its current guidance says these scams may involve a sudden increase in low-star reviews
          followed by somebody demanding money, goods or services in exchange for removing the
          negative reviews.
        </p>
        <p>
          Google tells merchants not to engage with or pay the malicious individuals and not to try
          to resolve the demand by offering money or services.
        </p>
        <p>
          Google provides a dedicated merchant extortion reporting route and asks businesses to
          preserve relevant communications, suspicious review links, available contact information
          and the timeline around the incident.
        </p>
        <p>
          Google says the dedicated channel is specifically for direct extortion attempts involving
          demands in exchange for review removal.
        </p>
        <p>
          Reviews that appear to violate policy for other reasons, such as spam or off-topic content,
          should use the ordinary review-reporting process.
        </p>
        <p>
          Google Maps separately warns about review scams involving financial demands and threats of
          negative reviews.
        </p>
      </>
    ),
    sources: [sourceReviewExtortion, sourceReviewRatingScams],
  },
  interpretation: (
    <>
      <p>An extortion case should be built around the connection between two things:</p>
      <p>the review activity,</p>
      <p>and the demand.</p>
      <p>Do not spend most of the case trying to prove that the star rating is unfair.</p>
      <p>Ask instead:</p>
      <p>Who contacted us?</p>
      <p>What did they demand?</p>
      <p>What did they say would happen to the reviews?</p>
      <p>Which reviews are connected?</p>
      <p>What evidence preserves that connection?</p>
      <p>That structure makes it easier to distinguish review extortion from:</p>
      <p>ordinary negative feedback,</p>
      <p>a fake review with no demand,</p>
      <p>a genuine refund dispute,</p>
      <p>or another type of review abuse.</p>
      <p>The objective is not to out-negotiate the person making the demand.</p>
      <p>It is to preserve a clear factual record and use the correct reporting route.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not pay somebody to remove the reviews.</p>
      <p>Do not offer goods, free services or favours as an alternative payment.</p>
      <p>Do not deliberately continue the conversation simply to provoke more threats.</p>
      <p>Do not delete the messages after taking one screenshot.</p>
      <p>Do not edit screenshots or rewrite the person&apos;s words.</p>
      <p>Do not assume every negative review on the profile belongs to the extortion attempt.</p>
      <p>Do not publish private contact or payment information in a public review reply.</p>
      <p>
        Do not call an ordinary customer refund dispute extortion without examining the actual
        demand.
      </p>
      <p>Do not give the person your Google password, one-time passcodes or security credentials.</p>
      <p>Do not promise yourself that submitting Google&apos;s form guarantees removal.</p>
      <p>Preserve what happened and report what you can actually establish.</p>
    </>
  ),
  checklist: {
    heading: "Google review extortion evidence checklist",
    items: [
      "Save direct links to every suspicious review genuinely connected to the incident.",
      "Record each reviewer's display name, rating, text and date shown.",
      "Preserve the first message, email, call record or other contact connected with the demand.",
      "Save clear screenshots of written demands.",
      "Preserve dates and times shown in the communications where available.",
      "Record the email addresses, phone numbers, usernames or social profiles used to contact you.",
      "Write down exactly what was demanded.",
      "Write down what the person said would happen to the reviews in exchange.",
      "Create a simple timeline from the first suspicious review to the first demand.",
      "Preserve any payment instructions or transaction information you received.",
      "Keep original evidence where possible and do not alter it.",
      "Separate reviews clearly connected to the demand from unrelated negative feedback.",
      "Use Google's dedicated merchant extortion reporting route for the direct extortion incident.",
      "Use the ordinary review-reporting process for separate policy-violating reviews that are not part of a direct extortion demand.",
      "Keep a copy of what you submitted.",
      "Do not make further payments or promises in an attempt to force a particular review outcome.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Paying because the business is under pressure.",
        body: "Payment does not give the business control over the reviews and does not guarantee that the person will stop making demands.",
      },
      {
        title: "Negotiating a cheaper settlement.",
        body: "Offering a smaller payment, discount, product or free service still turns the response into negotiation rather than evidence preservation and reporting.",
      },
      {
        title: "Saving screenshots but not the review links.",
        body: "Keep direct links to the suspicious reviews as well as screenshots so the actual Google contributions can be identified.",
      },
      {
        title: "Reporting every negative review as part of the scam.",
        body: "Only connect reviews to the extortion incident where you have a reasonable factual basis for doing so.",
      },
      {
        title: "Deleting the conversation after reporting it.",
        body: "Keep the original communications and your evidence record in case you need to understand or document the incident later.",
      },
      {
        title: "Treating every refund dispute as extortion.",
        body: "A genuine customer dispute can involve money and a negative review. Examine whether there is actually a direct demand tied to review removal.",
      },
      {
        title: "Publicly accusing the reviewer of a crime.",
        body: "Keep public responses professional. The review page is not the place to publish private evidence or make unsupported legal accusations.",
      },
      {
        title: "Using the extortion form for ordinary spam.",
        body: "Google's dedicated extortion route is for direct extortion attempts. Reviews that are simply spam, fake or off-topic use the ordinary policy-reporting route.",
      },
      {
        title: "Assuming the report guarantees removal.",
        body: "Google assesses the evidence and makes the final decision. ProfileRelaunch cannot promise the outcome or investigation time.",
      },
    ],
  },
  scenarios: [
    {
      heading: "Several one-star reviews appeared and then we received a WhatsApp demand",
      body: (
        <>
          <p>Preserve both sides of the incident.</p>
          <p>Save the review links and screenshots.</p>
          <p>
            Save the WhatsApp conversation with the visible sender details, dates and times where
            available.
          </p>
          <p>
            Write down exactly what was demanded and what the sender said would happen to the
            reviews.
          </p>
          <p>Do not pay them.</p>
          <p>
            Use Google&apos;s dedicated merchant extortion reporting route and provide the connection
            between the review activity and the demand.
          </p>
        </>
      ),
    },
    {
      heading: "A customer says they will remove their review only if we refund them",
      body: (
        <>
          <p>Do not jump immediately to a legal label.</p>
          <p>First establish whether this is a genuine customer dispute.</p>
          <p>Preserve the exact wording.</p>
          <p>Separate any legitimate refund or service issue from the Google review question.</p>
          <p>
            If there is a direct demand making review removal conditional on money, goods, services
            or favours, that is important evidence to assess against Google&apos;s dedicated
            extortion guidance.
          </p>
          <p>
            But ProfileRelaunch does not determine whether the conduct is criminal extortion under
            local law.
          </p>
        </>
      ),
    },
    {
      heading: "The person wants cryptocurrency or gift cards",
      body: (
        <>
          <p>Do not pay simply because the requested payment method is difficult to reverse.</p>
          <p>Preserve the payment instructions together with the demand and review evidence.</p>
          <p>
            Google Maps warns that demands involving gift cards, vouchers or cryptocurrency can be
            indicators of review-related scams.
          </p>
          <p>Keep the case focused on the demand and the linked review activity.</p>
        </>
      ),
    },
    {
      heading: "The person claims they work for Google or can control Google reviews",
      body: (
        <>
          <p>Do not give them account credentials or verification codes.</p>
          <p>Preserve the claim as part of the communication.</p>
          <p>
            Do not assume that somebody has special access to Google because they know information
            about your Business Profile.
          </p>
          <p>
            Use Google&apos;s official reporting and support routes rather than links or payment
            instructions supplied by the person making the demand.
          </p>
        </>
      ),
    },
    {
      heading: "We already paid and the reviews are still there",
      body: (
        <>
          <p>Do not make another payment simply because the first one did not work.</p>
          <p>
            Preserve the payment record, the original demand, later communications and the review
            links.
          </p>
          <p>Document what was promised and what actually happened.</p>
          <p>Submit the available evidence through the appropriate Google route.</p>
          <p>
            Depending on how payment was made and the wider conduct involved, you may also need to
            consider appropriate payment-provider or local fraud-reporting options.
          </p>
          <p>
            ProfileRelaunch can help with the Google-policy side of the case but does not provide
            legal advice.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Do not let urgency turn into payment</h2>
      <p>Review extortion works by creating pressure.</p>
      <p>The reviews are visible.</p>
      <p>The business fears losing customers.</p>
      <p>Then somebody offers a quick way to make the problem disappear.</p>
      <p>That pressure is exactly why the response needs to stay structured.</p>
      <p>Do not pay.</p>
      <p>Preserve the demand.</p>
      <p>Save the review links.</p>
      <p>Record the sender details and timeline.</p>
      <p>Keep the original evidence.</p>
      <p>Then use Google&apos;s dedicated reporting route.</p>
      <p>
        If you are unsure whether what happened is review extortion, ordinary fake-review activity
        or a genuine customer dispute, ProfileRelaunch can review the facts and help identify the
        appropriate Google process.
      </p>
      <p>
        We cannot guarantee that Google will remove the reviews or take a particular action against
        the accounts involved.
      </p>
      <p>
        We can help make sure the case is organised around the evidence that actually exists rather
        than fear, guesswork or negotiation.
      </p>
    </>
  ),
  sourcesUsed: googleReviewExtortionSources,
}
