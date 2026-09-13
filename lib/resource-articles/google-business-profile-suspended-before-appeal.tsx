import {
  sourceAllPolicies,
  sourceAppealRestrictions,
  sourceBusinessAddress,
  sourceEligibility,
  sourceFixSuspended,
  sourceServiceAreas,
} from "@/lib/resource-sources/google-business-profile"

export {
  sourceAllPolicies,
  sourceAppealRestrictions,
  sourceBusinessAddress,
  sourceEligibility,
  sourceFixSuspended,
  sourceServiceAreas,
}

export const suspensionBeforeAppealSources = [
  sourceFixSuspended,
  sourceAppealRestrictions,
  sourceEligibility,
  sourceServiceAreas,
  sourceBusinessAddress,
  sourceAllPolicies,
]

export const suspensionBeforeAppealSlug = "google-business-profile-suspended-before-appeal"

export const suspensionBeforeAppealBody = {
  intro: (
    <>
      <p>
        A Google Business Profile suspension can feel urgent because the profile may stop being
        available to customers just when you depend on it for visibility, calls and enquiries.
      </p>
      <p>The natural reaction is to appeal immediately.</p>
      <p>That is not always the best first move.</p>
      <p>
        Google&apos;s own guidance says that before you submit an appeal, you should make sure the
        profile follows its Business Profile guidelines. Google also gives businesses the opportunity
        to provide supporting evidence, and that evidence is much easier to use well if it has been
        prepared before the appeal process begins.
      </p>
      <p>
        The objective before an appeal is therefore not to guess what wording Google wants to hear.
        It is to understand the restriction, check whether the profile accurately represents an
        eligible business, and prepare evidence that supports the information you are asking Google
        to restore.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        If your Google Business Profile is suspended or disabled, Google says you can submit an
        appeal if you believe the profile should be reinstated.
      </p>
      <p>
        Before appealing, check that the profile follows Google&apos;s Business Profile policies and
        accurately represents the real business.
      </p>
      <p>
        Open the appeals tool using the Google Account associated with the profile. Google&apos;s
        tool can show the restricted profile, the reason for the moderation action and a link to the
        relevant policy.
      </p>
      <p>
        Prepare supporting evidence before you reach the evidence stage. Google says useful evidence
        may include official business registration, a business licence, tax certificates and business
        utility bills. Where documents contain a business name and address, Google advises checking
        that they match the profile being appealed.
      </p>
      <p>
        If you choose to use Google&apos;s linked evidence form, the evidence must be submitted
        within the 60-minute window specified by Google.
      </p>
      <p>
        Do not create a replacement Business Profile for the same business while the appeal is under
        review. Google&apos;s appeal guidance also says not to submit multiple appeals for the same
        issue before receiving a decision.
      </p>
      <p>The most useful work before appealing is therefore:</p>
      <ul>
        <li>understand the restriction</li>
        <li>check eligibility</li>
        <li>check the profile against the real business</li>
        <li>prepare relevant evidence</li>
        <li>and only then submit the appeal</li>
      </ul>
    </>
  ),
  main: (
    <>
      <h2>Why you should not treat the appeal button as the first step</h2>
      <p>
        A suspension tells you that Google has restricted the profile. It does not automatically tell
        you everything that needs to be checked before the profile can be restored.
      </p>
      <p>
        Google says Business Profiles may be suspended or disabled when they do not follow its
        guidelines. Its appeals tool can show the moderation reason and a link to the policy
        associated with the decision.
      </p>
      <p>That information should be your starting point.</p>
      <p>Before writing an appeal, ask a more basic question:</p>
      <p>
        Does the Business Profile accurately represent a business that is eligible to have a profile,
        in the way Google&apos;s current rules require?
      </p>
      <p>
        If the answer is unclear, an appeal written immediately may simply defend information that
        still needs to be checked.
      </p>
      <p>ProfileRelaunch&apos;s practical approach is therefore:</p>
      <ul>
        <li>understand first</li>
        <li>verify the facts second</li>
        <li>prepare evidence third</li>
        <li>appeal after that</li>
      </ul>
      <p>
        This is not about delaying a legitimate appeal. It is about making the appeal reflect the
        strongest accurate version of the case.
      </p>

      <h2>Check what Google is actually restricting</h2>
      <p>
        Use the Google Account associated with the affected Business Profile when opening
        Google&apos;s appeals tool.
      </p>
      <p>Google says the tool can show:</p>
      <ul>
        <li>the restricted Business Profile</li>
        <li>the reason for the moderation action</li>
        <li>and a link to the policy connected to the restriction</li>
      </ul>
      <p>Read those details before changing the profile or preparing a long explanation.</p>
      <p>Save the information for your own case file.</p>
      <p>Keep:</p>
      <ul>
        <li>the suspension or restriction email</li>
        <li>the wording shown in the appeals tool</li>
        <li>the affected Business Profile</li>
        <li>the relevant dates</li>
        <li>and any policy link Google shows you</li>
      </ul>
      <p>Do not invent a more specific suspension reason than Google has actually provided.</p>
      <p>
        For example, if the tool identifies a policy area but does not say which individual field
        caused the problem, treat that policy area as something to investigate — not proof that you
        already know the exact cause.
      </p>

      <h2>Check that the business itself is eligible</h2>
      <p>
        Before looking at appeal wording, confirm that the business qualifies for a Google Business
        Profile.
      </p>
      <p>
        Google&apos;s current eligibility guidance says that, in general, an eligible business must
        make in-person contact with customers during its stated hours, subject to certain exceptions.
      </p>
      <p>
        Google also lists examples of businesses that are not eligible, including online-only
        businesses and lead-generation businesses.
      </p>
      <p>
        Eligibility matters because evidence cannot fix a business model that does not qualify for
        the product in the first place.
      </p>
      <p>Ask:</p>
      <ul>
        <li>Does the business genuinely serve customers in person?</li>
        <li>Is it a storefront, a service-area business or a hybrid business?</li>
        <li>Is the business itself responsible for providing the service represented by the profile?</li>
        <li>Is the location used by the profile genuinely connected to the business?</li>
      </ul>
      <p>
        If any of those answers are uncertain, resolve the eligibility question before treating the
        case as a simple appeal-writing exercise.
      </p>

      <h2>Check the profile against the real business</h2>
      <p>The next step is a consistency review.</p>
      <p>
        You are not trying to make the profile look more impressive. You are checking whether it
        accurately represents the business that exists in the real world.
      </p>
      <p>Review the important business information, including:</p>
      <ul>
        <li>business name</li>
        <li>location or service-area setup</li>
        <li>phone number</li>
        <li>website</li>
        <li>business category</li>
        <li>opening hours</li>
        <li>and ownership or management arrangements</li>
      </ul>
      <p>Look for information that is inaccurate, outdated, inconsistent or difficult to support.</p>
      <p>
        Do not make speculative edits simply because you have heard that changing a certain field
        sometimes fixes suspensions.
      </p>
      <p>
        If information genuinely needs correcting and Google allows you to correct it, make the
        profile reflect the real business. Avoid turning the recovery process into a series of
        experiments.
      </p>

      <h2>Pay special attention to the address</h2>
      <p>
        Address setup is one of the areas that deserves careful review because Google treats
        storefront and service-area businesses differently.
      </p>
      <p>
        Google says that if you do not serve customers at your business address, the address should
        not be displayed on the Business Profile. Instead, the business can use a service area where
        appropriate.
      </p>
      <p>
        A service-area business travels or delivers to customers and does not serve customers at its
        business address.
      </p>
      <p>
        A hybrid business both serves customers at its location and visits or delivers to customers.
      </p>
      <p>
        If your business operates from home, a workshop, office or other base but customers do not
        actually come there to receive the service, do not assume that displaying the address makes
        the profile stronger.
      </p>
      <p>
        Check whether the current profile setup correctly reflects how customers genuinely interact
        with the business.
      </p>
      <p>
        Likewise, do not change a genuine customer-facing storefront into a service-area business
        just because you are trying to solve a suspension.
      </p>
      <p>The goal is accuracy, not finding a configuration that appears easier to approve.</p>

      <h2>Prepare the evidence before you start the evidence form</h2>
      <p>This is one of the most important practical steps.</p>
      <p>
        Google says that supporting evidence may be offered as part of the appeal process and gives
        examples including:
      </p>
      <ul>
        <li>official business registration</li>
        <li>a business licence</li>
        <li>tax certificates</li>
        <li>and business utility bills such as electricity, phone, water or internet bills</li>
      </ul>
      <p>
        Google also advises checking that the business name and address on submitted documents match
        the Business Profile being appealed.
      </p>
      <p>Not every business will have every type of document Google lists.</p>
      <p>Do not manufacture evidence and do not submit documents simply to create volume.</p>
      <p>
        Instead, collect the strongest genuine records you already hold that help establish the
        business and support the profile information relevant to the appeal.
      </p>
      <p>Prepare those files before opening the evidence form.</p>

      <h2>The 60-minute evidence window matters</h2>
      <p>
        Google currently states that if you choose to submit evidence through the linked evidence
        form, it must be submitted within the 60-minute window.
      </p>
      <p>
        That is why evidence preparation should happen before you begin that part of the process.
      </p>
      <p>Do not wait until the timer is running to:</p>
      <ul>
        <li>search old emails</li>
        <li>download registration documents</li>
        <li>find utility bills</li>
        <li>decide which files are relevant</li>
        <li>or work out whether the names and addresses are consistent</li>
      </ul>
      <p>Create your evidence set first.</p>
      <p>Then begin the Google evidence step when you are ready to submit it.</p>

      <h2>Quality of evidence matters more than quantity</h2>
      <p>
        Google provides examples of documents that may strengthen an appeal. It does not say that
        uploading a large number of files guarantees reinstatement.
      </p>
      <p>Treat evidence as support for specific facts.</p>
      <p>For example:</p>
      <ul>
        <li>Does this document establish the legal or trading business?</li>
        <li>Does it support the address associated with the business?</li>
        <li>Does it support the business information being presented to Google?</li>
        <li>Does it relate to this business and this profile?</li>
      </ul>
      <p>
        If a document has no meaningful connection to the restriction or the profile, including it
        may add noise rather than clarity.
      </p>
      <p>ProfileRelaunch&apos;s interpretation is simple:</p>
      <p>use evidence to demonstrate facts, not to overwhelm the reviewer.</p>

      <h2>Do not create a replacement profile</h2>
      <p>
        Google specifically says not to create a new Business Profile for the same business while
        the appeal is under review.
      </p>
      <p>This is important.</p>
      <p>
        A suspension does not mean the correct response is to abandon the existing profile and start
        again.
      </p>
      <p>
        Keep the recovery work focused on the affected profile and Google&apos;s official appeal
        route unless Google specifically instructs otherwise.
      </p>

      <h2>Do not stack multiple appeals while one is pending</h2>
      <p>
        Google&apos;s appeal guidance says not to submit multiple appeals for the same issue before
        receiving a decision.
      </p>
      <p>
        Submitting again because you have not yet received the answer does not necessarily move the
        case forward.
      </p>
      <p>Keep a record of:</p>
      <ul>
        <li>when the appeal was submitted</li>
        <li>what evidence was provided</li>
        <li>the status shown in the appeals tool</li>
        <li>and any email Google sends</li>
      </ul>
      <p>
        Wait for the existing process to reach a decision before treating the case as a rejected
        appeal.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google&apos;s current Business Profile guidance says that suspended or disabled profiles
          that should be reinstated can be appealed.
        </p>
        <p>Before appeal, Google tells businesses to make sure the profile follows its guidelines.</p>
        <p>
          The appeals tool can show the restricted profile, the reason for the moderation action and
          a link to the relevant policy.
        </p>
        <p>
          Google may offer an optional evidence form. Examples of evidence Google says can strengthen
          an appeal include business registration, licences, tax certificates and business utility
          bills.
        </p>
        <p>
          Google advises that the business name and address on supporting documents should match the
          profile being appealed.
        </p>
        <p>
          If the evidence form is used, Google requires evidence to be submitted within the specified
          60-minute window.
        </p>
        <p>
          Google also says not to create another Business Profile for the same business while an
          appeal is being reviewed.
        </p>
        <p>
          Its broader appeals guidance says not to submit multiple appeals for the same issue before
          a decision has been received.
        </p>
        <p>
          If a reinstatement request is denied, Google&apos;s current suspension guidance says an
          additional review may be available, including the opportunity to provide additional
          evidence that was not supplied with the original appeal.
        </p>
      </>
    ),
    sources: [sourceFixSuspended, sourceAppealRestrictions],
  },
  interpretation: (
    <>
      <p>The appeal itself is only one part of the recovery process.</p>
      <p>A strong pre-appeal review should answer three questions.</p>
      <p>First:</p>
      <p>Is the business eligible for a Google Business Profile?</p>
      <p>Second:</p>
      <p>
        Does the profile accurately describe the real business and the way customers interact with
        it?
      </p>
      <p>Third:</p>
      <p>Can the important facts be supported with genuine evidence?</p>
      <p>
        If those three areas are clear, you are in a much better position to decide what should be
        sent to Google.
      </p>
      <p>
        If they are not clear, the right next step may be to investigate the profile and the business
        records before appealing.
      </p>
      <p>The goal is not to find a trick that makes Google reverse a suspension.</p>
      <p>
        The goal is to present an accurate, eligible business clearly through Google&apos;s official
        process.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not open the evidence form until the files you intend to submit are ready.</p>
      <p>
        Do not create another Business Profile for the same business while an appeal is pending.
      </p>
      <p>
        Do not submit multiple appeals for the same issue while waiting for Google&apos;s decision.
      </p>
      <p>
        Do not make speculative changes simply because somebody online says a particular edit
        usually fixes suspensions.
      </p>
      <p>Do not invent a suspension cause that Google has not given you.</p>
      <p>
        Do not alter documents or create evidence to make the business appear different from what it
        really is.
      </p>
      <p>Keep the case factual:</p>
      <ul>
        <li>what the business is</li>
        <li>what the profile says</li>
        <li>what Google has told you</li>
        <li>what changed</li>
        <li>and what the records can genuinely support</li>
      </ul>
    </>
  ),
  checklist: {
    heading: "Practical checklist",
    items: [
      "Save Google's suspension or restriction email.",
      "Open the appeals tool using the Google Account associated with the affected profile.",
      "Record the moderation reason and policy link shown by Google.",
      "Confirm that the business is eligible for a Business Profile.",
      "Check whether the profile is correctly configured as a storefront, service-area business or hybrid business.",
      "Review the business name, location setup, phone, website, category, hours and ownership information for genuine inaccuracies.",
      "Collect relevant supporting records before opening Google's evidence form.",
      "Check that names and addresses on evidence are consistent with the business and the profile where applicable.",
      "Decide which evidence actually supports the case instead of uploading everything available.",
      "Submit through Google's official appeal process only when the profile review and evidence set are ready.",
      "Keep a record of what you submitted and when.",
      "Do not create a replacement profile or submit overlapping appeals while Google's review is pending.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Appealing first and investigating afterwards.",
        body: "The appeal is submitted before anyone checks whether the underlying profile follows Google's rules.",
      },
      {
        title: "Guessing the suspension cause.",
        body: "A policy label or suspension notice is treated as proof of a specific problem that Google has not actually identified.",
      },
      {
        title: "Making multiple speculative edits.",
        body: "The business changes its name, address, category, hours and other fields together without being able to explain which changes were genuine corrections.",
      },
      {
        title: "Using the wrong location model.",
        body: "A service-area business displays an address even though customers are not actually served there, or a real storefront is changed unnecessarily because the owner assumes hiding the address will solve the suspension.",
      },
      {
        title: "Waiting until the evidence timer starts to collect documents.",
        body: "Useful evidence exists, but it cannot be organised properly inside the limited submission window.",
      },
      {
        title: "Uploading documents that do not support the profile.",
        body: "More files are treated as stronger evidence even when they do not establish anything relevant.",
      },
      {
        title: "Creating another Business Profile.",
        body: "The suspended profile is abandoned and a replacement is created even though Google specifically tells businesses not to do this while the appeal is under review.",
      },
      {
        title: "Submitting another appeal while one is already pending.",
        body: "An owner becomes anxious about the delay and starts another submission rather than waiting for the current decision.",
      },
    ],
  },
  scenarios: [
    {
      heading: "I don't know why Google suspended my profile",
      body: (
        <>
          <p>Start with what Google has actually provided.</p>
          <p>
            Open the appeals tool with the appropriate Google Account and record the moderation
            reason and policy link it shows.
          </p>
          <p>
            Then review the profile against that policy area and Google&apos;s wider Business
            Profile guidelines.
          </p>
          <p>
            Do not tell Google that you know exactly what triggered the suspension unless you
            genuinely do.
          </p>
          <p>
            A useful appeal is based on facts you can establish, not speculation about Google&apos;s
            internal enforcement systems.
          </p>
        </>
      ),
    },
    {
      heading: "I run a service-area business from home",
      body: (
        <>
          <p>
            If customers do not come to your address to receive the service, Google&apos;s
            service-area guidance says the address should not be displayed publicly.
          </p>
          <p>Use the real business setup, not a pretend storefront.</p>
          <p>
            That does not mean every home-based business is ineligible. Google specifically supports
            service-area businesses that travel or deliver to customers.
          </p>
          <p>The important distinction is how the business actually serves customers.</p>
        </>
      ),
    },
    {
      heading: "Several profiles I manage were suspended",
      body: (
        <>
          <p>
            Check whether the problem may involve the Google Account rather than only one individual
            Business Profile.
          </p>
          <p>
            Google says that an account restriction can cause the Business Profiles managed by that
            account to be suspended and can prevent the account from creating or claiming other
            profiles.
          </p>
          <p>
            Google&apos;s current guidance says the account restriction should be appealed and lifted
            before the affected Business Profile suspension is appealed.
          </p>
          <p>
            Do not assume that several simultaneous suspensions are simply several unrelated profile
            problems.
          </p>
        </>
      ),
    },
    {
      heading: "I have already submitted my appeal",
      body: (
        <>
          <p>Do not create a replacement Business Profile.</p>
          <p>
            Do not submit another appeal for the same issue while Google&apos;s first review is still
            pending.
          </p>
          <p>Keep your evidence and submission record together and monitor the appeal status.</p>
          <p>
            If Google denies the reinstatement request, its current guidance says an additional
            review may be available.
          </p>
          <p>
            At that point, review the denial and the original evidence before deciding what genuinely
            new information can strengthen the next request.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Before you appeal</h2>
      <p>
        A Google Business Profile suspension is stressful, but speed and haste are not the same
        thing.
      </p>
      <p>Before you appeal:</p>
      <ul>
        <li>understand what Google has shown you</li>
        <li>check that the business is eligible</li>
        <li>make sure the profile accurately represents the real business</li>
        <li>prepare the relevant evidence</li>
        <li>and know what you are going to submit before the evidence window begins</li>
      </ul>
      <p>Then use Google&apos;s official appeal process.</p>
      <p>
        If you are not sure what part of the profile needs attention, or which evidence is relevant,
        you do not need to diagnose the entire case before asking for help.
      </p>
      <p>
        ProfileRelaunch can review what happened, what Google has told you and what you already have,
        then explain the strongest appropriate next step.
      </p>
    </>
  ),
  sourcesUsed: suspensionBeforeAppealSources,
}
