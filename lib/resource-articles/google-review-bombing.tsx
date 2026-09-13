import {
  sourceConsumerAlerts,
  sourceFakeEngagement,
  sourcePostingRestrictions,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
  sourceReviewExtortion,
} from "@/lib/resource-sources/google-maps-reviews"

export const googleReviewBombingSlug = "google-review-bombing"

export const googleReviewBombingSources = [
  sourceProhibitedRestrictedContent,
  sourceFakeEngagement,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
  sourcePostingRestrictions,
  sourceConsumerAlerts,
  sourceReviewExtortion,
]

export const googleReviewBombingUrgentCallout =
  "If several suspicious reviews are arriving now, preserve the review links, screenshots, reviewer names and timing before you start reporting them. Do not accuse reviewers publicly and do not pay anyone who claims they can stop or remove the reviews."

export const googleReviewBombingBody = {
  urgentCallout: googleReviewBombingUrgentCallout,
  intro: (
    <>
      <p>Several one-star reviews arriving in a short period can feel like an attack.</p>
      <p>Sometimes it is.</p>
      <p>
        Sometimes a real event has caused several genuine customers to leave negative feedback at
        roughly the same time.
      </p>
      <p>The number of reviews alone does not tell you which situation you have.</p>
      <p>Google&apos;s policies focus on the underlying behaviour.</p>
      <p>
        Reviews should reflect genuine experiences. Google prohibits fake engagement, rating
        manipulation, repetitive content, conflicts of interest and other policy-violating
        contributions.
      </p>
      <p>
        Google specifically identifies unusual volumes or patterns of review activity as potentially
        relevant when they indicate an attempt to manipulate a place&apos;s rating.
      </p>
      <p>That makes the pattern important.</p>
      <p>But the pattern is evidence to investigate, not permission to label every new reviewer fake.</p>
      <p>When several suspicious reviews arrive together, preserve the whole event first.</p>
      <p>Then assess both levels of the case:</p>
      <p>the individual reviews,</p>
      <p>and the pattern connecting them.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If several suspicious Google reviews arrive in a short period:</p>
      <ul>
        <li>save a direct link to every review</li>
        <li>take screenshots before content changes</li>
        <li>record reviewer names, ratings, review text and dates</li>
        <li>create a simple timeline showing when the reviews arrived</li>
        <li>look for repeated wording, shared allegations and unusual timing</li>
        <li>check whether a real event could explain several genuine reviews</li>
        <li>assess each review against Google&apos;s policies</li>
        <li>distinguish fake engagement from genuine negative feedback</li>
        <li>preserve any evidence of coordination or conflicts of interest</li>
        <li>report policy-violating reviews through Google&apos;s normal review-reporting process</li>
        <li>track their status in the Reviews Management Tool</li>
        <li>
          use Google&apos;s one-time appeal where an eligible reported review is not removed and there
          is a defensible policy basis
        </li>
        <li>
          report a reviewer profile separately where the profile itself is being used for
          policy-violating activity
        </li>
      </ul>
      <p>
        Do not assume Google provides a separate merchant &quot;review bombing&quot; removal form.
      </p>
      <p>
        Google may independently use spam detection or impose posting restrictions when it detects
        suspicious or harmful contribution activity.
      </p>
      <p>Those protections are controlled by Google.</p>
      <p>
        If the review activity is followed by a direct demand for money, goods, services or favours
        in exchange for review removal, move that part of the case into Google&apos;s dedicated
        review-extortion process.
      </p>
    </>
  ),
  main: (
    <>
      <h2>
        “Review bombing” describes a pattern, not a single Google status
      </h2>
      <p>
        Businesses often use the term review bombing when many negative or suspicious reviews arrive
        together.
      </p>
      <p>Google&apos;s published policies are more specific about the behaviour underneath the label.</p>
      <p>Relevant policy areas can include:</p>
      <ul>
        <li>fake engagement</li>
        <li>rating manipulation</li>
        <li>repetitive content</li>
        <li>conflicts of interest</li>
        <li>off-topic content</li>
        <li>harassment</li>
        <li>other prohibited contributions</li>
      </ul>
      <p>Do not spend the case trying to prove that the phrase &quot;review bombing&quot; applies.</p>
      <p>Identify which actual Google policies the reviews may violate.</p>
      <p>That is what Google&apos;s review-removal process evaluates.</p>

      <h2>A sudden spike tells you to investigate — it does not prove manipulation</h2>
      <p>Timing matters.</p>
      <p>
        Ten one-star reviews in an hour may be unusual for a business that normally receives two
        reviews a month.
      </p>
      <p>That difference is worth recording.</p>
      <p>But ask what happened around the same time.</p>
      <p>Was there:</p>
      <ul>
        <li>a major service failure</li>
        <li>an event involving many customers</li>
        <li>a delayed delivery affecting many orders</li>
        <li>a public dispute</li>
        <li>a viral social-media post</li>
        <li>media attention</li>
        <li>a campaign encouraging people with no genuine experience to review the business</li>
        <li>evidence of one person coordinating several accounts</li>
      </ul>
      <p>Several genuine customers can independently review the same real incident.</p>
      <p>Several non-customers can also participate in a coordinated rating attack.</p>
      <p>The spike itself cannot tell you which one occurred.</p>

      <h2>Preserve the whole cluster before analysing it</h2>
      <p>Do not investigate from memory.</p>
      <p>Create a simple incident record.</p>
      <p>For every review in the suspicious period, save:</p>
      <ul>
        <li>direct review link</li>
        <li>reviewer display name</li>
        <li>star rating</li>
        <li>full review text</li>
        <li>date shown</li>
        <li>screenshot</li>
        <li>when you first noticed it</li>
      </ul>
      <p>Keep each review separate.</p>
      <p>Then create one overall timeline showing the order in which the reviews appeared.</p>
      <p>This gives you both:</p>
      <p>individual evidence,</p>
      <p>and pattern evidence.</p>

      <h2>Record the normal baseline before calling the volume unusual</h2>
      <p>A pattern is easier to explain when you understand what is normal for that business.</p>
      <p>You do not need a complicated statistical model.</p>
      <p>Simply record useful context such as:</p>
      <ul>
        <li>roughly how often the business normally receives reviews</li>
        <li>how many appeared during the suspicious period</li>
        <li>how quickly they arrived</li>
        <li>whether they were concentrated around a particular event</li>
      </ul>
      <p>Do not invent a precise historical average if you have not calculated one.</p>
      <p>Use facts you can actually establish.</p>
      <p>The purpose is to explain why the activity stood out.</p>

      <h2>Assess every review individually as well as part of the pattern</h2>
      <p>A suspicious cluster can contain different kinds of reviews.</p>
      <p>Some may clearly describe genuine customer experiences.</p>
      <p>Some may contain obvious off-topic material.</p>
      <p>Some may appear to be repetitive.</p>
      <p>Some may have no apparent connection to the business.</p>
      <p>Some may contain a conflict of interest.</p>
      <p>Do not treat the whole group as one identical piece of content.</p>
      <p>For each review ask:</p>
      <p>What policy issue, if any, applies to this contribution?</p>
      <p>Then separately ask:</p>
      <p>What does the wider pattern tell us?</p>

      <h2>Fake engagement is one of the central policies</h2>
      <p>Google says Maps contributions should reflect genuine experiences.</p>
      <p>Its fake-engagement policy covers content that is not based on a real experience.</p>
      <p>It also prohibits content posted from multiple accounts by or at the request of one person.</p>
      <p>Those rules can be highly relevant to coordinated review activity.</p>
      <p>Look for evidence such as:</p>
      <ul>
        <li>reviews describing experiences that could not have happened</li>
        <li>communications showing people were asked to review without being customers</li>
        <li>one person claiming control of several review accounts</li>
        <li>direct evidence that contributions were purchased or coordinated</li>
        <li>multiple accounts repeating the same fabricated event</li>
      </ul>
      <p>Do not rely only on unfamiliar reviewer names.</p>
      <p>Article #6&apos;s principle still applies in substance:</p>
      <p>an unknown display name is a clue, not proof.</p>

      <h2>Rating manipulation can involve unusual volumes or patterns</h2>
      <p>
        Google&apos;s current policy specifically identifies unusual volumes or patterns of review
        contributions that indicate attempts to manipulate a place&apos;s rating.
      </p>
      <p>This is important for a multi-review incident.</p>
      <p>Useful pattern evidence may include:</p>
      <ul>
        <li>a sudden concentration of ratings</li>
        <li>several contributions within a very narrow period</li>
        <li>reviews linked to the same coordinated request</li>
        <li>multiple accounts making substantially the same claim</li>
        <li>activity associated with a known conflict</li>
        <li>
          contributions that appear designed to change the rating rather than describe genuine
          experiences
        </li>
      </ul>
      <p>Do not translate:</p>
      <p>&quot;unusual&quot;</p>
      <p>into:</p>
      <p>&quot;automatically prohibited.&quot;</p>
      <p>Google&apos;s wording focuses on patterns that indicate efforts to manipulate the rating.</p>

      <h2>Repeated wording can strengthen the pattern evidence</h2>
      <p>
        Google prohibits repetitive content, including the same content posted multiple times from
        the same or multiple accounts.
      </p>
      <p>Compare the reviews carefully.</p>
      <p>Record repeated:</p>
      <ul>
        <li>sentences</li>
        <li>unusual phrases</li>
        <li>spelling errors</li>
        <li>formatting</li>
        <li>allegations</li>
        <li>calls to action</li>
        <li>descriptions</li>
      </ul>
      <p>Do not claim two reviews were written by the same person simply because they sound similar.</p>
      <p>Describe the similarity you can observe.</p>
      <p>If the wording is identical, preserve that exact evidence.</p>

      <h2>A viral post can produce genuine reviews, fake reviews or both</h2>
      <p>Social-media attention can complicate the analysis.</p>
      <p>Suppose somebody posts:</p>
      <p>&quot;Everyone go and give this business one star.&quot;</p>
      <p>People who have never dealt with the business may then contribute ratings.</p>
      <p>That can raise fake-engagement, off-topic or rating-manipulation concerns.</p>
      <p>
        But the same viral event may also reach real customers who independently decide to describe
        genuine experiences.
      </p>
      <p>Do not assume every review arriving after the post has the same origin.</p>
      <p>Preserve the public campaign where lawful and appropriate.</p>
      <p>Then assess the individual reviews.</p>

      <h2>Off-topic political or social commentary may be a separate policy issue</h2>
      <p>
        Google says contributions should be based on experiences at the specific location or
        business.
      </p>
      <p>
        Its policies do not allow general political commentary, social commentary or personal rants
        that are not about an experience with the place.
      </p>
      <p>
        This can matter when a business becomes the target of an online controversy unrelated to
        customer service.
      </p>
      <p>
        A reviewer reacting to a social-media argument without describing a genuine experience may
        raise an off-topic issue as well as a possible fake-engagement issue.
      </p>
      <p>Choose the policy reason that best matches the actual content.</p>

      <h2>Conflicts of interest still matter during a review surge</h2>
      <p>A cluster may involve people connected to:</p>
      <ul>
        <li>a competitor</li>
        <li>current employees</li>
        <li>former employees</li>
        <li>contractors</li>
        <li>consultants</li>
        <li>personal relationships</li>
        <li>other professional affiliations</li>
      </ul>
      <p>Google recognises certain conflicts of interest in its rating-manipulation policy.</p>
      <p>If such a relationship genuinely exists, preserve evidence of it.</p>
      <p>
        Do not accuse every hostile reviewer of being a competitor merely because several reviews
        arrived together.
      </p>

      <h2>Harassment or personal attacks should be classified separately</h2>
      <p>
        Some coordinated campaigns focus on attacking an owner or staff member rather than reviewing
        the business experience.
      </p>
      <p>Google&apos;s content policies restrict harassment and certain offensive content.</p>
      <p>Preserve the exact review text.</p>
      <p>
        If the content contains threats, doxxing, targeted abuse or another prohibited category,
        report the policy issue that actually appears.
      </p>
      <p>Do not reduce everything to:</p>
      <p>&quot;fake review.&quot;</p>
      <p>One contribution can raise more than one concern.</p>

      <h2>Report policy-violating reviews through Google&apos;s normal review process</h2>
      <p>Google tells businesses to report reviews that violate its policies.</p>
      <p>Use the Business Profile or Reviews Management Tool.</p>
      <p>Report the individual review.</p>
      <p>Choose the reporting reason that best fits the content.</p>
      <p>Then keep a record of what was submitted.</p>
      <p>Google&apos;s tool can show statuses including:</p>
      <ul>
        <li>Decision pending</li>
        <li>Report reviewed - no policy violation</li>
        <li>Escalated - check your email for updates</li>
      </ul>
      <p>
        Do not repeatedly flag the same review simply because several other reviews are also
        suspicious.
      </p>

      <h2>There is no published merchant “review bombing” shortcut</h2>
      <p>Do not search for a special bulk-removal button that Google does not document.</p>
      <p>
        Google&apos;s published merchant guidance directs businesses to report policy-violating
        reviews through the review-reporting process.
      </p>
      <p>A coordinated pattern is useful context.</p>
      <p>But the reviews still need to be assessed against Google&apos;s content rules.</p>
      <p>
        ProfileRelaunch should not promise access to a secret escalation or special removal channel.
      </p>

      <h2>Use the one-time appeal carefully</h2>
      <p>
        If Google evaluates a reported review and finds no policy violation, Google&apos;s current
        process provides a one-time appeal for eligible reviews.
      </p>
      <p>
        The Reviews Management Tool currently allows up to 10 eligible reviews to be selected in an
        appeal.
      </p>
      <p>That can be useful where several reported reviews belong to the same suspicious event.</p>
      <p>Use the appeal to explain:</p>
      <ul>
        <li>the relevant policy</li>
        <li>the individual review issue</li>
        <li>the wider pattern where it genuinely matters</li>
        <li>the factual evidence connecting the contributions</li>
      </ul>
      <p>Do not appeal simply because the cluster lowered the business&apos;s rating.</p>
      <p>The policy case still matters.</p>

      <h2>A reviewer profile can be reported separately when appropriate</h2>
      <p>
        Google also provides a process for reporting user profiles that contribute policy-violating
        content.
      </p>
      <p>That is different from reporting an individual review.</p>
      <p>
        A user profile may be relevant where the profile itself is being used for false information,
        abusive activity or other policy violations.
      </p>
      <p>
        Google specifically warns not to report a user simply because you dislike their content when
        the contributions remain relevant and policy-compliant.
      </p>
      <p>
        Use the profile-reporting route only when there is an actual profile or contribution-policy
        issue.
      </p>

      <h2>Google also uses automated spam detection</h2>
      <p>Google says it uses automated spam detection to remove reviews identified as spam.</p>
      <p>
        That means some suspicious review activity may be detected without the business successfully
        reporting every contribution first.
      </p>
      <p>Do not rely on automation as your evidence strategy.</p>
      <p>Preserve and report the reviews that you genuinely believe violate policy.</p>
      <p>
        Also recognise that Google&apos;s automated systems, not ProfileRelaunch, determine whether
        other activity is detected and removed.
      </p>

      <h2>Google may temporarily restrict review posting during abuse</h2>
      <p>
        Google&apos;s Maps policy says it may temporarily turn off user-generated content for a place
        to protect it from a spike in irrelevant or offensive contributions.
      </p>
      <p>
        Google monitors the situation and can lift the restriction when the abuse attempt and risk of
        policy-violating content subside.
      </p>
      <p>This is useful context for review-bombing incidents.</p>
      <p>But it is important not to overpromise it.</p>
      <p>A business cannot simply switch this protection on.</p>
      <p>Do not tell a customer that ProfileRelaunch can arrange a review freeze.</p>
      <p>Google controls whether and when a posting restriction is applied.</p>

      <h2>Consumer alerts and hidden reviews are Google-controlled protections</h2>
      <p>
        Google also says that when it detects suspicious review activity, users may encounter
        protections such as:
      </p>
      <ul>
        <li>a banner saying suspicious reviews were removed</li>
        <li>temporary restrictions on posting reviews or ratings</li>
        <li>reviews being hidden for a period of time</li>
      </ul>
      <p>Those measures are Google&apos;s platform decisions.</p>
      <p>
        Do not interpret their absence as proof that the suspicious activity is legitimate.
      </p>
      <p>And do not promise that reporting a cluster will automatically trigger them.</p>

      <h2>If a demand follows the review attack, separate the extortion case</h2>
      <p>A coordinated review attack and review extortion can overlap.</p>
      <p>If somebody later demands:</p>
      <ul>
        <li>money</li>
        <li>goods</li>
        <li>services</li>
        <li>favours</li>
      </ul>
      <p>
        in exchange for removing or stopping the negative reviews, preserve that demand immediately.
      </p>
      <p>
        Google has a dedicated merchant extortion reporting process for direct review-removal
        demands.
      </p>
      <p>Do not use the extortion route merely because the reviews feel malicious.</p>
      <p>The direct demand is what distinguishes that process.</p>

      <h2>Do not publicly fight every suspicious reviewer</h2>
      <p>
        When ten negative reviews appear together, replying to all of them in anger can amplify the
        situation.
      </p>
      <p>Do not publish:</p>
      <ul>
        <li>unsupported accusations</li>
        <li>private customer data</li>
        <li>employee information</li>
        <li>reviewer contact information</li>
        <li>threats</li>
        <li>evidence you intended to preserve privately</li>
      </ul>
      <p>If you choose to reply publicly, keep the response professional and proportionate.</p>
      <p>You do not need to conduct the investigation in the review replies.</p>

      <h2>Keep monitoring the pattern after you report</h2>
      <p>A coordinated incident may continue after the first reports are submitted.</p>
      <p>Keep the incident record open.</p>
      <p>Add genuinely new reviews to the timeline.</p>
      <p>Preserve any new repeated wording or coordination evidence.</p>
      <p>Record report and appeal statuses.</p>
      <p>Do not continually rewrite the original evidence.</p>
      <p>
        A clean timeline makes it easier to distinguish new activity from material you have already
        reported.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says Maps reviews and ratings should reflect genuine and unbiased experiences with
          businesses.
        </p>
        <p>
          Its fake-engagement policy prohibits content that is not based on a real experience and
          content posted from multiple accounts by or at the request of one person.
        </p>
        <p>
          Google&apos;s rating-manipulation rules also cover unusual volumes or patterns of review
          contributions that indicate attempts to manipulate a place&apos;s rating.
        </p>
        <p>
          Google separately prohibits repetitive content and certain off-topic, conflicted,
          harassing or otherwise prohibited contributions.
        </p>
        <p>
          Businesses can report individual policy-violating reviews through Google&apos;s
          review-removal process and monitor them in the Reviews Management Tool.
        </p>
        <p>
          If Google finds no policy violation, a one-time appeal is currently available for eligible
          reviews, with up to 10 reviews selectable in that appeal.
        </p>
        <p>Google also uses automated spam detection.</p>
        <p>
          Separately, Google may impose temporary posting restrictions when a place experiences a
          spike in irrelevant or offensive content and may display consumer alerts when it detects
          suspicious review activity.
        </p>
        <p>Those protective measures are controlled by Google.</p>
      </>
    ),
    sources: [sourceProhibitedRestrictedContent, sourceReportInappropriateReviews],
  },
  interpretation: (
    <>
      <p>A suspected review-bombing case has two layers.</p>
      <p>The first is individual:</p>
      <p>Does this specific review violate a Google policy?</p>
      <p>The second is collective:</p>
      <p>
        Does the timing, wording, relationship or coordination across several reviews create
        meaningful evidence of rating manipulation or fake engagement?
      </p>
      <p>You need both views.</p>
      <p>If you only look at the star ratings, you may call genuine criticism fake.</p>
      <p>
        If you only look at every review in isolation, you may miss a clear coordinated pattern.
      </p>
      <p>Build the case from facts:</p>
      <p>individual review evidence,</p>
      <p>plus genuine pattern evidence.</p>
      <p>Do not rely on the label &quot;review bombing&quot; to do the policy analysis for you.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>
        Do not call several simultaneous negative reviews fake simply because they arrived together.
      </p>
      <p>Do not assume every review in a suspicious cluster came from the same person.</p>
      <p>Do not claim similar writing proves common ownership of the accounts.</p>
      <p>
        Do not ignore the possibility that a real incident affected several genuine customers.
      </p>
      <p>Do not create fake records to prove reviewers were never customers.</p>
      <p>
        Do not publicly accuse reviewers of participating in a coordinated attack without evidence.
      </p>
      <p>
        Do not repeatedly report the same review when its status is already visible in Google&apos;s
        tool.
      </p>
      <p>
        Do not use the extortion reporting route unless there is a direct demand tied to review
        removal.
      </p>
      <p>
        Do not promise that Google will freeze reviews, display a consumer alert or bulk-remove the
        cluster.
      </p>
      <p>
        Preserve the individual reviews and the wider pattern before deciding what Google policy
        applies.
      </p>
    </>
  ),
  checklist: {
    heading: "Google review bombing first-response checklist",
    items: [
      "Save the direct link to every review in the suspicious cluster.",
      "Record the reviewer display name, rating, review text and date shown for each one.",
      "Take screenshots before any review text or account details change.",
      "Record when you first noticed each review.",
      "Create a timeline showing the order and speed of the review activity.",
      "Record the business's ordinary review pattern so you can explain why the activity appeared unusual.",
      "Check whether a real customer event could explain several genuine reviews arriving together.",
      "Assess every review individually against Google's policies.",
      "Look for repeated wording, shared allegations and other observable similarities.",
      "Preserve any direct evidence that people were asked to review the business without a genuine experience.",
      "Preserve any evidence of competitor, employment or other relevant conflicts of interest.",
      "Check whether some contributions are off-topic or aimed at a controversy rather than a business experience.",
      "Report genuinely policy-violating reviews through Google's normal review-reporting process.",
      "Record each report date and status.",
      "Use the one-time appeal only where an eligible review has a defensible policy case.",
      "Report a reviewer profile separately only when there is a genuine user-profile or contribution-policy issue.",
      "If a direct demand for money, goods, services or favours appears, preserve it and use Google's separate extortion process.",
      "Continue recording genuinely new review activity while Google assesses the reports.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Calling every sudden review spike fake.",
        body: "Several genuine customers can review a business after the same real event. Unusual timing is a reason to investigate, not automatic proof of manipulation.",
      },
      {
        title: "Reporting the group without assessing the individual reviews.",
        body: "Each review still needs a defensible policy basis even when the wider pattern is relevant.",
      },
      {
        title: "Ignoring the wider pattern completely.",
        body: "Google's rating-manipulation policy specifically recognises unusual volumes or patterns that indicate efforts to manipulate a place's rating.",
      },
      {
        title: "Assuming similar wording proves one person controls the accounts.",
        body: "Preserve repeated wording as pattern evidence, but do not claim common account ownership without evidence.",
      },
      {
        title: "Treating a viral controversy as proof every reviewer is fake.",
        body: "A viral event can attract non-customers, genuine customers or both. Assess the contributions individually.",
      },
      {
        title: "Looking only for fake engagement.",
        body: "A cluster may also involve off-topic content, repetitive content, conflicts of interest, harassment or other Google policy issues.",
      },
      {
        title: "Searching for a secret review-bombing removal route.",
        body: "Google's published merchant process remains policy-based review reporting and the available appeal process. Do not build the case around an invented bulk-removal shortcut.",
      },
      {
        title: "Expecting Google to activate a review freeze on request.",
        body: "Google may impose posting restrictions during abuse, but the decision and timing are controlled by Google.",
      },
      {
        title: "Using the extortion form when nobody demanded anything.",
        body: "Google's dedicated extortion channel is for direct demands tied to review removal, not every malicious-looking review cluster.",
      },
      {
        title: "Replying publicly while angry.",
        body: "Public accusations can create additional problems and may expose information that belongs in the evidence record instead.",
      },
    ],
  },
  scenarios: [
    {
      heading: "Ten one-star reviews arrived overnight",
      body: (
        <>
          <p>Preserve all ten before deciding what happened.</p>
          <p>Record their timing, wording, reviewer names and direct links.</p>
          <p>Then check whether anything genuine affected multiple customers.</p>
          <p>
            Look for pattern evidence such as repeated claims, identical wording, obvious off-topic
            commentary or evidence that people were coordinated.
          </p>
          <p>Report the individual reviews that have a defensible policy basis.</p>
          <p>Do not tell Google:</p>
          <p>&quot;Ten one-star reviews means review bombing.&quot;</p>
          <p>Explain what makes the contributions suspicious under Google&apos;s actual policies.</p>
        </>
      ),
    },
    {
      heading: "A social-media post told people to leave us one-star reviews",
      body: (
        <>
          <p>Preserve the post if it is publicly available and relevant.</p>
          <p>Record when it appeared and compare that timing with the review cluster.</p>
          <p>Then assess the reviewers individually.</p>
          <p>
            People who never had a genuine experience but joined a campaign to manipulate the rating
            may raise fake-engagement, off-topic or rating-manipulation concerns.
          </p>
          <p>
            Real customers who saw the post and then chose to describe genuine experiences are a
            different category.
          </p>
          <p>Do not treat both groups as identical.</p>
        </>
      ),
    },
    {
      heading: "Several reviews use almost exactly the same wording",
      body: (
        <>
          <p>Preserve each review separately.</p>
          <p>Highlight the exact repeated phrases in your internal evidence record.</p>
          <p>
            Google prohibits repetitive content and content posted from multiple accounts by or at
            the request of one person.
          </p>
          <p>The similarities can therefore be relevant.</p>
          <p>
            But do not tell Google that the accounts definitely belong to one person unless you have
            evidence for that claim.
          </p>
        </>
      ),
    },
    {
      heading: "One reviewer profile appears to be posting abusive content repeatedly",
      body: (
        <>
          <p>Report the individual policy-violating reviews where appropriate.</p>
          <p>
            If the user profile itself is contributing false information, offensive content or other
            policy-violating activity, Google also provides a separate profile-reporting process.
          </p>
          <p>Do not report the profile simply because you dislike its rating.</p>
          <p>The user or contributions need a genuine policy basis.</p>
        </>
      ),
    },
    {
      heading: "The review surge was followed by a demand for money",
      body: (
        <>
          <p>
            Preserve the review cluster exactly as you would for a suspected coordinated attack.
          </p>
          <p>Then preserve the demand separately.</p>
          <p>Save:</p>
          <ul>
            <li>messages</li>
            <li>sender details</li>
            <li>dates and times</li>
            <li>payment instructions</li>
            <li>review links</li>
            <li>the wording connecting payment to review removal</li>
          </ul>
          <p>Do not pay.</p>
          <p>
            The direct demand means Google&apos;s dedicated review-extortion process may now apply in
            addition to the ordinary content-policy assessment.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Treat the pattern as evidence, not as the verdict</h2>
      <p>A wave of suspicious Google reviews can damage confidence very quickly.</p>
      <p>That makes it tempting to label the whole event before examining it.</p>
      <p>Resist that shortcut.</p>
      <p>Preserve every review.</p>
      <p>Build the timeline.</p>
      <p>Check whether a real event explains the activity.</p>
      <p>Assess each contribution against Google&apos;s policies.</p>
      <p>
        Then look across the group for meaningful evidence of coordination, fake engagement or rating
        manipulation.
      </p>
      <p>Sometimes the pattern will become much clearer.</p>
      <p>Sometimes several genuine customers really did complain at once.</p>
      <p>And sometimes the evidence will remain uncertain.</p>
      <p>
        ProfileRelaunch can help organise the individual reviews and the wider pattern, identify the
        Google policies that genuinely apply and explain the strongest appropriate reporting or
        appeal route.
      </p>
      <p>
        We cannot promise that Google will remove the reviews, freeze review posting or treat every
        contribution in the cluster the same way.
      </p>
      <p>The aim is to give Google a factual, policy-based case rather than simply saying:</p>
      <p>&quot;We have been review bombed.&quot;</p>
    </>
  ),
  sourcesUsed: googleReviewBombingSources,
}
