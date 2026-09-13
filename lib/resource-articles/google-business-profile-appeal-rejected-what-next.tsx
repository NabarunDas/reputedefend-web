import {
  sourceAllPolicies,
  sourceAppealRestrictions,
  sourceEligibility,
  sourceFixSuspended,
  sourceRepresentBusinessGuidelines,
} from "@/lib/resource-sources/google-business-profile"

export const appealRejectedWhatNextSlug = "google-business-profile-appeal-rejected-what-next"

export const appealRejectedWhatNextSources = [
  sourceFixSuspended,
  sourceAppealRestrictions,
  sourceRepresentBusinessGuidelines,
  sourceEligibility,
  sourceAllPolicies,
]

export const appealRejectedWhatNextBody = {
  intro: (
    <>
      <p>
        A rejected Google Business Profile appeal is not the moment to start sending the same case
        again and again.
      </p>
      <p>It is the moment to work out what the first appeal failed to establish.</p>
      <p>
        Google&apos;s appeals tool can show an appeal as Submitted, Approved, Not approved, Can&apos;t
        be appealed or Eligible for appeal. If your reinstatement request has actually been denied,
        Google&apos;s current suspension guidance says an additional review may be available.
      </p>
      <p>
        Google also says that additional evidence that was not included with the original appeal can
        be provided during that additional review.
      </p>
      <p>That does not mean every rejected appeal should immediately be resubmitted with more files.</p>
      <p>
        First, confirm the decision. Then review the policy issue, the Business Profile itself, the
        evidence you already supplied and anything that has genuinely changed since the first appeal.
      </p>
      <p>The objective is not to make the second submission louder.</p>
      <p>It is to make the case clearer, more accurate and better supported.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        If your Google Business Profile appeal appears to have been rejected, first confirm the
        status in Google&apos;s appeals tool.
      </p>
      <p>Google currently lists these statuses:</p>
      <ul>
        <li>Submitted</li>
        <li>Approved</li>
        <li>Not approved</li>
        <li>Can&apos;t be appealed</li>
        <li>Eligible for appeal</li>
      </ul>
      <p>If the status is still Submitted, you do not yet have a rejection.</p>
      <p>
        Google says appeal reviews and decisions can take up to five working days and tells
        businesses not to submit multiple appeals for the same issue before receiving a decision.
      </p>
      <p>
        If your reinstatement request has been denied, Google&apos;s current suspension guidance
        says an additional review may be available.
      </p>
      <p>
        Google also says you can provide additional evidence that was not included with the original
        appeal.
      </p>
      <p>Before requesting that additional review:</p>
      <ul>
        <li>save the decision and appeal status</li>
        <li>revisit the policy Google identified</li>
        <li>check that the Business Profile accurately represents the real business</li>
        <li>review exactly what you submitted the first time</li>
        <li>identify what was missing, weak or inconsistent</li>
        <li>gather genuinely useful additional evidence</li>
        <li>correct genuine profile inaccuracies where Google&apos;s process allows</li>
        <li>and only then prepare the next review request</li>
      </ul>
      <p>Do not create a replacement Business Profile for the same business as a workaround.</p>
      <p>A denied appeal is a reason to reassess the case, not to start duplicating it.</p>
    </>
  ),
  main: (
    <>
      <h2>First confirm that the appeal was actually rejected</h2>
      <p>
        Do not rely only on your memory of an email or on the fact that the profile is still
        unavailable.
      </p>
      <p>
        Open Google&apos;s Business Profile appeals tool using the Google Account associated with the
        affected profile.
      </p>
      <p>Google currently lists appeal statuses including:</p>
      <ul>
        <li>Submitted</li>
        <li>Approved</li>
        <li>Not approved</li>
        <li>Can&apos;t be appealed</li>
        <li>Eligible for appeal</li>
      </ul>
      <p>
        A status of Submitted means Google has not yet given the final decision shown in the tool.
      </p>
      <p>Google says appeal reviews and decisions can take up to five working days.</p>
      <p>
        While the appeal is still awaiting a decision, Google says not to submit multiple appeals
        for the same issue.
      </p>
      <p>Record the status and save Google&apos;s decision email before deciding what to do next.</p>

      <h2>
        “Not approved” is a decision, not an explanation of every underlying problem
      </h2>
      <p>A denied appeal tells you that Google did not approve the reinstatement request.</p>
      <p>
        It does not necessarily give you a complete technical diagnosis of every profile field or
        every factor involved in the moderation decision.
      </p>
      <p>Do not fill that gap with guesses.</p>
      <p>Return to what Google actually showed you:</p>
      <ul>
        <li>the moderation reason</li>
        <li>the policy link</li>
        <li>the appeal decision</li>
        <li>the state of the Business Profile</li>
        <li>and the evidence that was submitted</li>
      </ul>
      <p>Treat those as established facts.</p>
      <p>Anything more specific should be investigated rather than assumed.</p>

      <h2>Re-read the policy before preparing another request</h2>
      <p>Google says that before appealing, the Business Profile should follow its guidelines.</p>
      <p>That requirement still matters after an appeal has been denied.</p>
      <p>
        Go back to the policy associated with the restriction and then review Google&apos;s wider
        Business Profile guidelines.
      </p>
      <p>Ask:</p>
      <ul>
        <li>Is the business eligible for a Business Profile?</li>
        <li>Does the profile represent the real business accurately?</li>
        <li>Is the business name the real-world name?</li>
        <li>Is the address or service-area setup correct?</li>
        <li>Are the category, website, phone and hours accurate?</li>
        <li>Is there a duplicate or another profile that creates confusion?</li>
        <li>Is the account itself restricted rather than only one profile?</li>
      </ul>
      <p>The goal is not to search for a random edit that might trigger reinstatement.</p>
      <p>
        The goal is to identify whether something substantive still needs to be corrected or better
        supported.
      </p>

      <h2>Review exactly what you submitted the first time</h2>
      <p>Before thinking about new evidence, reconstruct the original appeal.</p>
      <p>Write down:</p>
      <ul>
        <li>what Google said the restriction was</li>
        <li>what explanation you submitted</li>
        <li>which documents you supplied</li>
        <li>what business name appeared on those documents</li>
        <li>what addresses appeared</li>
        <li>which Business Profile information you were trying to support</li>
        <li>and whether anything important was missing</li>
      </ul>
      <p>This is your appeal post-mortem.</p>
      <p>It helps separate two very different situations:</p>
      <p>the original appeal was accurate but did not contain enough useful supporting information,</p>
      <p>or</p>
      <p>
        the original appeal was trying to defend information that itself needed attention.
      </p>
      <p>Those situations require different next steps.</p>

      <h2>Do not simply resubmit the same case</h2>
      <p>
        Google&apos;s current suspension guidance says an additional review may be available after a
        reinstatement request is denied.
      </p>
      <p>
        It also specifically says that additional evidence not included with the original appeal can
        be provided.
      </p>
      <p>
        That makes the additional-review stage an opportunity to improve the case, not merely
        duplicate it.
      </p>
      <p>Before requesting another review, ask:</p>
      <p>What is genuinely different or clearer now?</p>
      <p>That might be:</p>
      <ul>
        <li>a relevant document that was missing</li>
        <li>better evidence connecting the business to the location</li>
        <li>evidence supporting the real-world business name</li>
        <li>clarification of a legitimate trading-name relationship</li>
        <li>a genuine profile inaccuracy that has now been corrected where possible</li>
        <li>clearer context explaining how the business operates</li>
        <li>or evidence addressing the policy area Google identified</li>
      </ul>
      <p>Do not invent new facts just because the first appeal failed.</p>

      <h2>New evidence should add information, not just volume</h2>
      <p>More files are not automatically more persuasive.</p>
      <p>
        Google allows businesses to provide additional evidence that was not included in the original
        appeal.
      </p>
      <p>The useful question is therefore not:</p>
      <p>“How many more documents can I upload?”</p>
      <p>It is:</p>
      <p>“What important fact was not adequately demonstrated the first time?”</p>
      <p>For every additional document, decide what it contributes.</p>
      <p>
        If it proves nothing new or clarifies nothing that was previously weak, it may not improve
        the case.
      </p>
      <p>
        ProfileRelaunch&apos;s practical approach is to favour relevant, genuine evidence over
        repetition.
      </p>

      <h2>Check for inconsistencies before the additional review</h2>
      <p>Compare the Business Profile, the original evidence and the new evidence side by side.</p>
      <p>Look for differences involving:</p>
      <ul>
        <li>business name</li>
        <li>address</li>
        <li>service-area setup</li>
        <li>website</li>
        <li>phone number</li>
        <li>category</li>
        <li>ownership</li>
        <li>legal entity</li>
        <li>trading name</li>
        <li>location</li>
      </ul>
      <p>A mismatch is not automatically evidence of wrongdoing.</p>
      <p>There may be a legitimate explanation.</p>
      <p>For example, a legal company name and public trading name can differ.</p>
      <p>
        But a genuine difference should be understood and explained accurately rather than ignored
        or altered away.
      </p>

      <h2>Do not make speculative changes just because the first appeal failed</h2>
      <p>A rejected appeal can create pressure to change everything.</p>
      <p>That is dangerous.</p>
      <p>
        Do not change the business name, address, category, service-area setup and other information
        at random merely because the appeal was not approved.
      </p>
      <p>Every profile change should have a factual reason.</p>
      <p>Ask:</p>
      <p>Was the existing information actually wrong?</p>
      <p>If yes, correct the genuine inaccuracy where Google&apos;s process allows.</p>
      <p>
        If no, do not manufacture a different version of the business simply to make the next appeal
        look different.
      </p>
      <p>The profile should represent the business that exists in the real world.</p>

      <h2>Check whether the restriction is actually at account level</h2>
      <p>
        If several Business Profiles you manage were affected together, check whether the Google
        Account itself is restricted.
      </p>
      <p>
        Google says an account restriction can cause the Business Profiles managed by that account
        to be suspended and can prevent the account from creating or claiming other profiles.
      </p>
      <p>
        Google&apos;s current guidance says the account restriction should be appealed and lifted
        before the affected Business Profile suspension is appealed.
      </p>
      <p>
        If that is your situation, repeatedly appealing individual profiles may be addressing the
        wrong level of the problem.
      </p>

      <h2>Do not create a replacement Business Profile</h2>
      <p>
        Google specifically tells businesses not to create a new Business Profile for the same
        business while an appeal is under review.
      </p>
      <p>
        A rejection also does not automatically mean that the safest response is to abandon the
        existing profile and create a duplicate.
      </p>
      <p>Keep the case tied to Google&apos;s official reinstatement and review routes.</p>
      <p>
        Creating another profile can introduce another record for the same business and make the
        situation harder to understand.
      </p>

      <h2>Understand what “additional review” means</h2>
      <p>Google&apos;s current suspension guidance says:</p>
      <p>
        only if the reinstatement request is denied, Google may be able to perform an additional
        review to prove eligibility.
      </p>
      <p>That wording matters.</p>
      <p>An additional review is not something we should describe as guaranteed in every situation.</p>
      <p>And it is not the same as repeatedly submitting the original appeal before a decision.</p>
      <p>
        Treat it as a separate next-step route that may become available after a denied
        reinstatement request.
      </p>
      <p>Prepare for it carefully.</p>

      <h2>If the appeals tool says “Can&apos;t be appealed”</h2>
      <p>
        Do not treat “Can&apos;t be appealed” as though it means the same thing as “Not approved.”
      </p>
      <p>Google lists them as separate statuses.</p>
      <p>
        Google&apos;s additional-review guidance specifically refers to a reinstatement request that
        has been denied.
      </p>
      <p>
        If your tool says Can&apos;t be appealed rather than Not approved, do not invent an
        additional-review entitlement.
      </p>
      <p>
        Follow the instructions Google provides for that restriction and use Google&apos;s support
        route where appropriate.
      </p>
      <p>The wording shown in your account matters.</p>

      <h2>If you are in the EEA, additional redress options may exist</h2>
      <p>
        Google&apos;s current suspension guidance says that businesses located in a European Economic
        Area member state or territory may have additional redress options.
      </p>
      <p>
        Google&apos;s broader appeal guidance also refers to out-of-court dispute settlement options
        for businesses in the EEA.
      </p>
      <p>This is location-specific and separate from the normal Business Profile appeal process.</p>
      <p>Do not assume the same additional redress route applies in every country.</p>
      <p>Follow Google&apos;s current regional guidance for the business location.</p>
      <p>ProfileRelaunch does not provide legal advice about those mechanisms.</p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google&apos;s Business Profile appeals tool currently shows appeal statuses including
          Submitted, Approved, Not approved, Can&apos;t be appealed and Eligible for appeal.
        </p>
        <p>Google says appeal reviews and decisions can take up to five working days.</p>
        <p>
          It tells businesses not to submit multiple appeals for the same issue before receiving a
          decision.
        </p>
        <p>
          Google also tells businesses not to create a new Business Profile for the same business
          while an appeal is under review.
        </p>
        <p>
          If a reinstatement request is denied, Google&apos;s current suspension guidance says it
          may be able to perform an additional review.
        </p>
        <p>
          Google says businesses can provide additional evidence during that additional review that
          was not included with the original appeal.
        </p>
        <p>
          Google also says that before an appeal, the Business Profile should comply with its
          guidelines.
        </p>
        <p>
          For businesses in an EEA member state or territory, Google says additional redress options
          may be available.
        </p>
      </>
    ),
    sources: [sourceFixSuspended, sourceAppealRestrictions],
  },
  interpretation: (
    <>
      <p>A rejected appeal should trigger a diagnosis before it triggers another submission.</p>
      <p>There are four things to establish.</p>
      <p>First:</p>
      <p>What did Google actually decide?</p>
      <p>Second:</p>
      <p>Does the Business Profile currently represent an eligible real-world business accurately?</p>
      <p>Third:</p>
      <p>What did the original appeal already establish?</p>
      <p>Fourth:</p>
      <p>What useful information, correction or evidence can genuinely improve the case now?</p>
      <p>If you cannot answer the fourth question, simply repeating the appeal may add nothing.</p>
      <p>The purpose of an additional review is not to create a new story.</p>
      <p>
        It is to present the real business more clearly and address what the first appeal did not
        establish well enough.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not submit another appeal while the current appeal still shows as Submitted.</p>
      <p>Do not treat Not approved and Can&apos;t be appealed as interchangeable statuses.</p>
      <p>Do not guess the exact suspension cause if Google has not identified it.</p>
      <p>Do not create a replacement profile for the same business as a workaround.</p>
      <p>Do not upload the same documents again merely because they are available.</p>
      <p>Do not alter genuine evidence.</p>
      <p>Do not make multiple speculative profile edits at once.</p>
      <p>
        Do not ignore a possible Google Account restriction if several managed profiles were
        affected.
      </p>
      <p>Do not describe an additional review as guaranteed.</p>
      <p>
        Before asking for another review, be able to explain what is clearer, corrected or better
        supported than it was in the original appeal.
      </p>
    </>
  ),
  checklist: {
    heading: "Rejected appeal review checklist",
    items: [
      "Open Google's Business Profile appeals tool using the account associated with the affected profile.",
      "Confirm whether the status is Submitted, Approved, Not approved, Can't be appealed or Eligible for appeal.",
      "Save Google's decision email and the moderation reason shown in the tool.",
      "Re-read the policy Google associated with the restriction.",
      "Review the profile against Google's current Business Profile guidelines.",
      "Confirm that the business itself is eligible for a Business Profile.",
      "Check whether the restriction involves the profile or the wider Google Account.",
      "Write down exactly what explanation was submitted in the original appeal.",
      "List every document that was included with the original appeal.",
      "Identify any important fact the original evidence did not establish clearly.",
      "Check the profile, original evidence and new evidence for genuine inconsistencies.",
      "Correct real inaccuracies where Google's process allows, rather than making speculative changes.",
      "Gather additional genuine evidence that adds useful information to the case.",
      "Decide what each new document actually proves.",
      "Do not create a replacement Business Profile for the same business as a workaround.",
      "Request additional review only through the appropriate Google route when the denied case is eligible for that next step.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Treating a pending appeal as rejected.",
        body: "A Submitted status means the appeals tool has not yet reached one of the final outcomes shown by Google. Do not start overlapping appeals while a decision is still pending.",
      },
      {
        title: "Sending the same appeal again immediately.",
        body: "Google says not to submit multiple appeals for the same issue before receiving a decision. After a denial, reassess the case before using an additional-review route.",
      },
      {
        title: "Guessing what caused the suspension.",
        body: "A rejected appeal does not automatically reveal which individual profile field caused the moderation action. Work from Google's stated reason and policy rather than inventing a diagnosis.",
      },
      {
        title: "Assuming more documents automatically mean a stronger case.",
        body: "Additional evidence is useful when it supports a fact that was missing, unclear or weak in the first appeal. Repetition alone does not make the case clearer.",
      },
      {
        title: "Changing multiple profile fields without a factual reason.",
        body: "A second review should represent the real business more accurately, not present a randomly altered version of it.",
      },
      {
        title: "Ignoring inconsistencies in the original evidence.",
        body: "If the business name, address, entity or location information does not line up, understand the reason before submitting more evidence.",
      },
      {
        title: "Creating another Business Profile.",
        body: "A denied appeal is not a reason to create a duplicate profile for the same business instead of following Google's official review routes.",
      },
      {
        title: "Ignoring an account-level restriction.",
        body: "If several profiles were affected because the managing Google Account is restricted, the account restriction may need to be resolved before individual profile suspension appeals.",
      },
      {
        title: "Treating additional review as guaranteed.",
        body: "Google says an additional review may be available after a denied reinstatement request. The availability and outcome remain Google's decision.",
      },
    ],
  },
  scenarios: [
    {
      heading: "My appeal still says Submitted",
      body: (
        <>
          <p>Do not treat it as rejected yet.</p>
          <p>Google says appeal reviews and decisions can take up to five working days.</p>
          <p>
            It also tells businesses not to submit multiple appeals for the same issue before
            receiving a decision.
          </p>
          <p>Keep the appeal record and wait for the outcome shown through Google&apos;s process.</p>
          <p>
            If the status later changes to Not approved, then move into the rejected-appeal review
            described in this guide.
          </p>
        </>
      ),
    },
    {
      heading: "My appeal says Not approved",
      body: (
        <>
          <p>Save the decision and review the original case before requesting additional review.</p>
          <p>Compare:</p>
          <ul>
            <li>what Google said</li>
            <li>what the profile showed</li>
            <li>what you told Google</li>
            <li>what evidence you submitted</li>
            <li>what important fact remained unsupported</li>
            <li>and whether anything has genuinely been corrected or clarified</li>
          </ul>
          <p>
            Google says an additional review may be available after a denied reinstatement request
            and that additional evidence not included with the original appeal can be provided.
          </p>
          <p>Use that next step to improve the factual case, not simply repeat it.</p>
        </>
      ),
    },
    {
      heading: "I fixed something after my first appeal",
      body: (
        <>
          <p>First make sure the change was a genuine correction.</p>
          <p>
            Document what was wrong, what is now accurate and what evidence supports the corrected
            information.
          </p>
          <p>Do not describe a speculative edit as a correction.</p>
          <p>
            If the change directly addresses the policy area involved in the suspension, explain the
            factual change clearly during the appropriate additional-review process.
          </p>
          <p>Keep the evidence consistent with the real business.</p>
        </>
      ),
    },
    {
      heading: "I do not have any genuinely new evidence",
      body: (
        <>
          <p>Do not manufacture evidence simply to make the additional review look different.</p>
          <p>Re-read the policy, the profile and the original appeal.</p>
          <p>
            You may discover that the issue is not missing paperwork but an eligibility or
            profile-accuracy question.
          </p>
          <p>
            If nothing material has changed and no useful evidence was omitted, that is important to
            recognise before paying for help or submitting more information.
          </p>
          <p>
            ProfileRelaunch&apos;s role should be to assess whether there is a stronger legitimate
            case to make — not to invent one.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>A rejected appeal needs a better diagnosis, not a louder appeal</h2>
      <p>
        A rejected Google Business Profile appeal is frustrating, particularly when the profile
        affects how customers find and contact the business.
      </p>
      <p>But the next useful question is not:</p>
      <p>“How do I appeal again as quickly as possible?”</p>
      <p>It is:</p>
      <p>“What did the first appeal fail to establish?”</p>
      <p>Confirm the decision.</p>
      <p>Re-check Google&apos;s policy.</p>
      <p>Review the real business and the profile.</p>
      <p>Audit the first submission.</p>
      <p>Then identify what is genuinely clearer, corrected or better supported.</p>
      <p>
        If Google&apos;s process makes an additional review available, use it to present that
        stronger factual case.
      </p>
      <p>
        If you are not sure whether the case has actually improved since the original appeal,
        ProfileRelaunch can review the decision, the profile and the evidence you already submitted
        and explain whether there is a meaningful next step.
      </p>
      <p>Sometimes the right answer will be to prepare an additional review.</p>
      <p>Sometimes it will be to correct an underlying problem first.</p>
      <p>
        And sometimes the responsible recommendation is not to pay for further support until there
        is a stronger case to make.
      </p>
    </>
  ),
  sourcesUsed: appealRejectedWhatNextSources,
}
