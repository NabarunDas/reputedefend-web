import {
  sourceDuplicateOwnershipIssues,
  sourceEligibility,
  sourceRequestOwnership,
  sourceServiceAreas,
  sourceVerifyBusiness,
  sourceVideoVerification,
} from "@/lib/resource-sources/google-business-profile"

export const verificationStuckOrRejectedSlug = "google-business-profile-verification-stuck-or-rejected"

export const verificationStuckOrRejectedSources = [
  sourceVerifyBusiness,
  sourceVideoVerification,
  sourceEligibility,
  sourceServiceAreas,
  sourceRequestOwnership,
  sourceDuplicateOwnershipIssues,
]

export const verificationStuckOrRejectedBody = {
  intro: (
    <>
      <p>
        A Google Business Profile that is “stuck in verification” can actually be in several very
        different situations.
      </p>
      <p>You may still be inside Google&apos;s normal review period.</p>
      <p>Google may have asked you to verify again.</p>
      <p>A video may have been reviewed and not accepted.</p>
      <p>The profile may have no usable verification method showing.</p>
      <p>
        Or what looks like a verification problem may actually be an ownership or duplicate-profile
        issue.
      </p>
      <p>Those situations should not all be treated the same way.</p>
      <p>
        Google automatically determines which verification methods are available to a Business
        Profile. Google says those methods cannot be manually changed, and the options can depend on
        the business type, public information, region and opening hours.
      </p>
      <p>
        The useful first step is therefore not to search for a trick that unlocks a preferred
        verification method.
      </p>
      <p>It is to identify exactly what Google is showing you now, then respond to that state.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        If your Google Business Profile verification appears stuck or has been rejected, first
        identify which of these situations applies.
      </p>
      <p>You submitted verification less than five working days ago:</p>
      <p>
        Google says verification review can take up to five working days. A profile still being
        reviewed is not necessarily stuck.
      </p>
      <p>The Get verified button has appeared again:</p>
      <p>
        Google says this means it could not completely verify the business. Try to re-verify using
        the methods currently offered on the profile.
      </p>
      <p>A video shows Review issues:</p>
      <p>
        Google says the video was not accepted. Open Review issues, read the reasons and prepare a
        new video that includes both the information shown previously and the missing information
        Google identifies.
      </p>
      <p>Google is asking for additional information or re-verification:</p>
      <p>
        Google says this can happen when business details have recently changed. Follow the
        re-verification flow and make sure the profile accurately reflects the real business.
      </p>
      <p>You want a different verification method:</p>
      <p>
        Google automatically determines the methods available to the profile and says they cannot be
        manually changed.
      </p>
      <p>No workable verification method is available:</p>
      <p>
        Use the methods Google currently offers first. If you are still unable to verify, Google&apos;s
        verification guidance directs businesses to support.
      </p>
      <p>Someone else already owns the verified profile:</p>
      <p>
        That is an ownership problem, not a reason to create another profile. Use Google&apos;s
        ownership-request process.
      </p>
      <p>
        Whatever the situation, do not share a verification code, password or security credential
        with somebody offering to “verify” the business for you.
      </p>
    </>
  ),
  main: (
    <>
      <h2>Start by identifying the exact verification state</h2>
      <p>
        “Verification stuck” is a useful description of how the situation feels, but it is not a
        single Google status.
      </p>
      <p>Look at the Business Profile itself and record exactly what it shows.</p>
      <p>For example:</p>
      <ul>
        <li>verification is under review</li>
        <li>Get verified is showing again</li>
        <li>Review issues is showing after a video</li>
        <li>Google is asking for additional information</li>
        <li>several verification methods are available</li>
        <li>only one verification method is available</li>
        <li>no usable method appears</li>
        <li>the profile is already verified but owned by somebody else</li>
      </ul>
      <p>Do not move to troubleshooting until you know which situation you actually have.</p>
      <p>
        A waiting review, a rejected video and an ownership conflict require different next steps.
      </p>

      <h2>You cannot choose any verification method you want</h2>
      <p>
        Google says verification methods are automatically determined and cannot be manually
        changed.
      </p>
      <p>The methods offered can depend on:</p>
      <ul>
        <li>the type of business</li>
        <li>public information about the business</li>
        <li>the region</li>
        <li>opening hours</li>
      </ul>
      <p>Google may offer methods such as:</p>
      <ul>
        <li>video recording</li>
        <li>phone or text</li>
        <li>email</li>
        <li>live video call</li>
        <li>mail</li>
      </ul>
      <p>In some situations Google may require more than one verification method.</p>
      <p>
        This means a method that another business received is not automatically available to you.
      </p>
      <p>
        Do not build a recovery plan around getting Google to provide a specific verification option
        that is not currently offered.
      </p>
      <p>Start with the options actually shown on your Business Profile.</p>

      <h2>A review taking several days is not necessarily stuck</h2>
      <p>After the verification steps are completed, Google reviews the information provided.</p>
      <p>Google says that review can take up to five working days.</p>
      <p>In some cases verification can happen sooner.</p>
      <p>
        If you have only recently submitted the required verification and Google still shows the
        process as under review, avoid repeatedly restarting the process simply because the result
        was not immediate.
      </p>
      <p>Record when the verification was submitted and monitor the current state.</p>
      <p>
        Troubleshooting should begin when Google tells you there is an issue, asks you to re-verify,
        or the available workflow itself prevents you from completing the required step.
      </p>

      <h2>If Get verified appears again</h2>
      <p>Google specifically explains this state.</p>
      <p>
        When the Get verified button appears again on a Business Profile, Google says it means the
        business could not be completely verified.
      </p>
      <p>Its recommended next step is to try to re-verify the business.</p>
      <p>
        If the profile offers multiple verification options, Google says you can try another option
        that is actually available to you.
      </p>
      <p>Before doing that, check the profile information against the real business.</p>
      <p>
        Make sure you are not repeatedly submitting verification for information that is inaccurate,
        outdated or inconsistent.
      </p>

      <h2>If a video says Review issues</h2>
      <p>For video verification, Review issues has a specific meaning.</p>
      <p>Google says it means the submitted verification video was not accepted.</p>
      <p>Select Review issues and read what Google says was missing.</p>
      <p>Google&apos;s video-verification guidance gives examples such as:</p>
      <ul>
        <li>the business name not being visible on the shop front</li>
        <li>not showing the nearby area</li>
        <li>missing proof that you are authorised to operate or manage the business</li>
      </ul>
      <p>Do not simply record the same unsuccessful video again.</p>
      <p>Google says a new video should include:</p>
      <ul>
        <li>all the information shown in the first video</li>
        <li>and the missing information needed to meet the requirements</li>
      </ul>
      <p>Treat the reasons shown by Google as the checklist for the next recording.</p>

      <h2>Know the basic video-verification rules before recording again</h2>
      <p>Google&apos;s current video-verification guidance says the recording must be:</p>
      <ul>
        <li>captured live</li>
        <li>unedited</li>
        <li>unique</li>
        <li>complete, with no breaks</li>
        <li>at least 30 seconds long</li>
        <li>recorded and uploaded from a mobile device through the Business Profile</li>
      </ul>
      <p>
        Google also says the video must not include sensitive information such as bank-account, tax
        or ID numbers, or private information about other people.
      </p>
      <p>Plan what you need to show before tapping Record.</p>
      <p>
        The aim is to demonstrate the business clearly in one continuous recording, not to create a
        promotional video.
      </p>

      <h2>Storefront and hybrid businesses need to prove three different things</h2>
      <p>For a storefront or hybrid business, Google&apos;s current video guidance focuses on three areas.</p>
      <p>First, show the location.</p>
      <p>Google gives examples such as:</p>
      <ul>
        <li>street signs</li>
        <li>building numbers</li>
        <li>nearby businesses</li>
        <li>recognisable places around the business</li>
      </ul>
      <p>Second, show that the business exists at that location.</p>
      <p>Google says to show the shop front, showroom or business signage.</p>
      <p>
        The business name should be clearly printed on a permanent fixture such as a signboard, wall
        or window, and the name in the video should match the Business Profile.
      </p>
      <p>Third, show that you manage or represent the business.</p>
      <p>Google gives examples of employee-only access such as:</p>
      <ul>
        <li>opening a cash register</li>
        <li>accessing a kitchen</li>
        <li>entering a storage room</li>
        <li>using a point-of-sale system</li>
      </ul>
      <p>A video that proves only the street exists may still fail to prove the business.</p>
      <p>A video that shows only a logo may still fail to prove management.</p>
      <p>Think about all three parts.</p>

      <h2>Service-area businesses need a different kind of video</h2>
      <p>
        A service-area business goes to customers rather than serving them at the business address.
      </p>
      <p>
        Google specifically says that if customers are not served at the business location, that
        address should not be added to the public Business Profile.
      </p>
      <p>
        Do not turn a genuine service-area business into a fake storefront just to make video
        verification easier.
      </p>
      <p>
        For a service-area business, Google&apos;s video guidance says the recording should help
        establish:
      </p>
      <ul>
        <li>where the business operates</li>
        <li>that the business genuinely exists</li>
        <li>that you manage or represent it</li>
      </ul>
      <p>
        For location, Google gives examples such as street signs, nearby landmarks or other
        identifiers around the business address.
      </p>
      <p>For business existence, examples include:</p>
      <ul>
        <li>professional tools</li>
        <li>equipment</li>
        <li>products</li>
        <li>workspace</li>
        <li>business cards</li>
        <li>branded clothing</li>
      </ul>
      <p>
        For management, Google gives examples such as performing a service, accessing business-only
        assets or unlocking a branded work vehicle.
      </p>
      <p>
        Google also says appropriate business documents can sometimes help demonstrate management,
        but sensitive information should not be exposed in the video.
      </p>

      <h2>Do not expose a private service-area address just to pass verification</h2>
      <p>This deserves separate emphasis.</p>
      <p>
        A verification process may need Google to understand where a service-area business operates
        from.
      </p>
      <p>That does not mean customers need to see that address on the public profile.</p>
      <p>
        Google&apos;s service-area guidance says businesses that do not serve customers at the
        business address should remove the address from the public Business Profile.
      </p>
      <p>The correct goal is:</p>
      <p>Google can verify the real business and its operating context,</p>
      <p>while the public profile continues to represent the business type accurately.</p>
      <p>Do not solve one compliance problem by creating another one.</p>

      <h2>If the video will not upload</h2>
      <p>
        A video that cannot be uploaded is different from a video that Google reviewed and
        rejected.
      </p>
      <p>
        Google&apos;s video-verification guidance says that videos can sometimes fail to upload on
        the first attempt and advises uploading again.
      </p>
      <p>Before assuming Google rejected the business, distinguish:</p>
      <p>the recording failed to upload,</p>
      <p>from:</p>
      <p>the recording uploaded, was reviewed and was not successful.</p>
      <p>Keep a record of the exact message you see.</p>
      <p>
        If the upload workflow continues to fail after you have followed the available process, that
        becomes a support issue rather than a reason to invent another Business Profile.
      </p>

      <h2>If Google asks you to re-verify after business information changed</h2>
      <p>
        Google says it may ask a previously verified business to provide additional information or
        re-verify.
      </p>
      <p>
        Its current guidance says this is likely when some business details have recently been
        updated.
      </p>
      <p>That does not automatically mean the update was wrong.</p>
      <p>It means Google wants to confirm the current business information.</p>
      <p>Before re-verifying, check that the changed information is genuinely correct.</p>
      <p>Be especially careful with significant identity or location information such as:</p>
      <ul>
        <li>business name</li>
        <li>address</li>
        <li>service-area setup</li>
        <li>business category</li>
        <li>website</li>
        <li>phone number</li>
      </ul>
      <p>
        Do not keep changing those fields simply to see which version gets through verification.
      </p>

      <h2>Phone and text verification have practical requirements</h2>
      <p>
        If Google offers phone or SMS verification, use the phone number shown in that verification
        flow.
      </p>
      <p>Google says you need to be able to answer the business phone or receive the text message.</p>
      <p>
        It also states that interactive voice response systems will not receive the verification
        code.
      </p>
      <p>
        If you are using a business phone system with automated routing, recognise that this can
        affect the ability to receive Google&apos;s automated verification call.
      </p>
      <p>Use the method exactly as Google presents it.</p>

      <h2>Email verification only works through the address Google offers</h2>
      <p>
        If Email appears as an available verification option, Google tells businesses to make sure
        they can use the email address shown in the verification screen.
      </p>
      <p>Follow the verification email Google sends.</p>
      <p>
        Do not assume you can substitute an unrelated email address simply because you prefer it.
      </p>
      <p>Again, the available verification route is determined by Google for that profile.</p>

      <h2>If Google offers verification by mail</h2>
      <p>Mail verification is not available to every business.</p>
      <p>Where Google offers it, Google mails a verification code to the business address.</p>
      <p>Google says most codes arrive within 14 days.</p>
      <p>While waiting for that code, Google specifically warns against:</p>
      <ul>
        <li>editing the business name</li>
        <li>editing the address</li>
        <li>editing the category</li>
        <li>requesting another code</li>
      </ul>
      <p>Changing the name, address or category can make the posted code stop working.</p>
      <p>
        Requesting another code invalidates the code already in the mail and can make the process
        longer.
      </p>
      <p>Google says verification codes expire after 30 days.</p>
      <p>
        If you are using mail verification, protect the active verification attempt instead of
        repeatedly resetting it.
      </p>

      <h2>Protect verification codes and account access</h2>
      <p>Google explicitly says to keep verification codes secure.</p>
      <p>It also says Google will never ask you for your verification code.</p>
      <p>
        Do not share a verification code with another person, even somebody who manages the Business
        Profile.
      </p>
      <p>Do not give a third-party provider:</p>
      <ul>
        <li>your Google password</li>
        <li>one-time passcodes</li>
        <li>security codes</li>
        <li>account-recovery answers</li>
      </ul>
      <p>
        A legitimate third party can explain the verification requirements and help you prepare what
        needs to be shown.
      </p>
      <p>They do not need to take over your Google Account credentials to do that.</p>

      <h2>A third party cannot replace the business owner in verification</h2>
      <p>Google&apos;s ownership guidance is important here.</p>
      <p>
        Google says only business owners or authorised representatives may verify and manage
        Business Profile information.
      </p>
      <p>
        For authorised representatives, Google&apos;s current guidance specifically says they should
        work directly with the business owner to complete verification.
      </p>
      <p>That fits ProfileRelaunch&apos;s operating boundary:</p>
      <p>we can help diagnose the verification problem,</p>
      <p>explain what Google is asking for,</p>
      <p>review the information you plan to show,</p>
      <p>and help you prepare.</p>
      <p>
        But owner-controlled verification steps, security codes and proof of real-world control must
        stay with the appropriate business owner or authorised person.
      </p>
      <p>Do not hand over passwords or one-time security credentials.</p>

      <h2>If no workable verification method is available</h2>
      <p>First check the verification options currently shown on the Business Profile.</p>
      <p>Google recommends trying the available verification methods.</p>
      <p>
        For video verification, Google says to make sure the recording meets the requirements and
        try again where appropriate.
      </p>
      <p>
        If another verification method is actually offered, you can try that available option.
      </p>
      <p>
        If you are still unable to verify the business, Google&apos;s verification guidance directs
        businesses to contact support.
      </p>
      <p>
        When asking for help, record the exact blocker rather than just saying “verification
        doesn&apos;t work.”
      </p>
      <p>For example:</p>
      <ul>
        <li>Get verified keeps returning after completion</li>
        <li>video shows Review issues</li>
        <li>video cannot be uploaded</li>
        <li>no usable verification method is displayed</li>
        <li>a verification method is present but cannot be completed</li>
        <li>the profile is asking for re-verification after a genuine business change</li>
      </ul>
      <p>
        That makes the problem easier to distinguish from an ordinary verification review that is
        still in progress.
      </p>

      <h2>Check whether this is really an ownership problem</h2>
      <p>Sometimes the profile is not waiting for verification at all.</p>
      <p>
        A verified Business Profile may already exist and be owned by another Google Account.
      </p>
      <p>
        Google says that if a verified profile for your business is owned by somebody else, you
        should request access from the current owner.
      </p>
      <p>That is an ownership process.</p>
      <p>Do not create a second profile merely because you cannot manage the existing one.</p>
      <p>
        Google says there should generally be only one Business Profile for each business and that
        duplicate profiles may not show on Search or Maps.
      </p>
      <p>
        If the existing verified profile is the correct business, resolve ownership through
        Google&apos;s ownership route.
      </p>

      <h2>Verification and suspension are not the same thing</h2>
      <p>A profile needing verification is not automatically a suspended profile.</p>
      <p>
        Likewise, a rejected verification video does not by itself mean Google has rejected a
        suspension appeal.
      </p>
      <p>Google has separate processes for:</p>
      <ul>
        <li>verifying a business</li>
        <li>re-verifying a business</li>
        <li>resolving ownership</li>
        <li>dealing with duplicate profiles</li>
        <li>appealing profile or content restrictions</li>
      </ul>
      <p>Use the process that matches the state actually shown on the account.</p>
      <p>
        If the profile is both suspended and unverified, or if an appeal specifically directs you
        into a verification step, keep those two parts of the case distinct when diagnosing what
        needs to happen next.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says Business Profile verification methods are automatically determined and cannot
          be manually changed.
        </p>
        <p>
          Available methods can depend on the business type, public information, region and opening
          hours, and some businesses may need to verify with more than one method.
        </p>
        <p>
          After verification information is submitted, Google says review can take up to five
          working days.
        </p>
        <p>
          If the Get verified button appears again, Google says it could not completely verify the
          business and the business should try to re-verify.
        </p>
        <p>
          If a video-verification attempt shows Review issues, Google says the video was not
          accepted. The business should review the issues and submit a new video that includes the
          information shown previously as well as the missing information.
        </p>
        <p>
          Google&apos;s video guidance requires a live, unedited, complete recording with no breaks
          that is at least 30 seconds long and is recorded and uploaded from a mobile device through
          the Business Profile.
        </p>
        <p>
          Google gives different video-verification evidence examples for storefront or hybrid
          businesses and for service-area businesses.
        </p>
        <p>
          Google also says that if a business remains unable to verify after trying the available
          methods, it can contact support.
        </p>
      </>
    ),
    sources: [sourceVerifyBusiness, sourceVideoVerification],
  },
  interpretation: (
    <>
      <p>
        A verification problem is easier to solve when you stop treating every delay or rejection as
        the same problem.
      </p>
      <p>There are four questions to answer.</p>
      <p>First:</p>
      <p>What verification state is Google actually showing?</p>
      <p>Second:</p>
      <p>Which verification method has Google made available?</p>
      <p>Third:</p>
      <p>
        What real-world fact is that method asking you to prove — location, business existence,
        management, ownership or current business information?
      </p>
      <p>Fourth:</p>
      <p>What exactly failed?</p>
      <p>The review may simply still be running.</p>
      <p>The video may have missed a required element.</p>
      <p>The upload may not have completed.</p>
      <p>Google may be asking for re-verification after a business change.</p>
      <p>Or another verified owner may already control the profile.</p>
      <p>The next action should follow the actual failure point.</p>
      <p>
        That is far more reliable than repeatedly changing the profile or searching for a way to
        force a different verification method.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not assume a verification still under Google&apos;s normal review window has failed.</p>
      <p>
        Do not expect Google to provide a verification method simply because another business
        received it.
      </p>
      <p>
        Do not record the same rejected verification video again without reviewing the issues Google
        identified.
      </p>
      <p>Do not turn a genuine service-area business into a storefront just for verification.</p>
      <p>Do not expose a service-area address publicly when customers are not served there.</p>
      <p>
        Do not make speculative changes to the business name, address or category while trying
        different verification attempts.
      </p>
      <p>
        Do not create a duplicate Business Profile because an existing profile is difficult to
        verify or access.
      </p>
      <p>Do not share verification codes, passwords, one-time passcodes or security credentials.</p>
      <p>
        Before trying again, write down the exact screen, message or verification state Google is
        showing you.
      </p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile verification troubleshooting checklist",
    items: [
      "Sign in to the Google Account associated with the Business Profile.",
      "Record the exact verification state or message currently shown.",
      "Check when the most recent verification attempt was submitted.",
      "If it is still inside Google's stated review period, avoid unnecessarily restarting it.",
      "Check which verification methods Google currently offers on the profile.",
      "Do not assume an unavailable verification method can be manually selected.",
      "Confirm the business itself is eligible for a Business Profile.",
      "Check that the business name, location and business type accurately reflect the real business.",
      "If video verification is required, plan the full recording before you begin.",
      "For storefront or hybrid verification, prepare to show location, permanent business identity and proof of management.",
      "For a service-area business, keep the correct service-area setup and prepare evidence appropriate to a business that goes to customers.",
      "If Review issues is shown, record the reasons Google gives before creating a new video.",
      "Make the next video include both the previously supplied information and the missing information Google identified.",
      "Keep sensitive personal, tax, banking and identification information out of the video.",
      "If phone, SMS, email or mail is offered, follow the requirements for that specific method rather than trying to substitute another route.",
      "Keep verification codes private.",
      "If the business is already verified under another owner, use Google's ownership process instead of creating a second profile.",
      "If the available verification process still cannot be completed after following Google's requirements, use Google's support route and describe the exact blocker.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Calling a normal review period “stuck.”",
        body: "Google says verification review can take up to five working days. A recent submission that is still being reviewed is not automatically a failed verification.",
      },
      {
        title: "Trying to force a preferred verification method.",
        body: "Google automatically determines the verification methods available to each Business Profile and says they cannot be manually changed.",
      },
      {
        title: "Recording the same rejected video again.",
        body: "When Google shows Review issues, use the stated problems to change the next recording. Google says the new video should include both the original information and the missing requirements.",
      },
      {
        title: "Showing only the storefront.",
        body: "For storefront and hybrid video verification, Google asks for evidence of location, business existence and management. A building alone may not establish all three.",
      },
      {
        title: "Pretending a service-area business is a storefront.",
        body: "If customers are not served at the business address, keep the correct service-area model instead of exposing an address simply to make verification look easier.",
      },
      {
        title: "Changing important profile fields between attempts without a factual reason.",
        body: "Repeated speculative changes can make it harder to understand what the real business information should be and may trigger further re-verification.",
      },
      {
        title: "Confusing an upload failure with a rejected video.",
        body: "A video that never uploads has not gone through the same process as a video Google reviewed and marked unsuccessful. Record the exact failure point.",
      },
      {
        title: "Requesting repeated mail codes.",
        body: "Google says requesting another mail code invalidates the code already sent and can make verification take longer.",
      },
      {
        title: "Creating another profile when the real issue is ownership.",
        body: "If the correct verified profile already exists under another owner, use Google's ownership-request process instead of creating a duplicate.",
      },
      {
        title: "Giving a third party the verification code.",
        body: "Google says verification codes should be kept secure and not shared, even with people who manage the profile.",
      },
    ],
  },
  scenarios: [
    {
      heading: "My verification has been pending for three days",
      body: (
        <>
          <p>
            Google says verification review can take up to five working days after the verification
            steps are completed.
          </p>
          <p>Three days can therefore still fall inside Google&apos;s stated review period.</p>
          <p>Keep the current attempt intact and monitor it.</p>
          <p>Do not restart verification merely because it was not approved immediately.</p>
          <p>
            If Google later asks you to re-verify or shows a specific issue, then troubleshoot that
            new state.
          </p>
        </>
      ),
    },
    {
      heading: "My video was rejected",
      body: (
        <>
          <p>Open Review issues.</p>
          <p>Google says that notification means the video was not accepted.</p>
          <p>Write down every reason shown.</p>
          <p>Then compare those reasons with Google&apos;s current video requirements.</p>
          <p>Your replacement video should include:</p>
          <ul>
            <li>what you successfully demonstrated before</li>
            <li>the information Google says was missing</li>
            <li>appropriate proof for your actual business type</li>
          </ul>
          <p>Do not simply make the same recording again and hope for a different result.</p>
        </>
      ),
    },
    {
      heading: "Google keeps showing Get verified again",
      body: (
        <>
          <p>
            Google says the return of the Get verified button means it could not completely verify
            the business.
          </p>
          <p>Check the available methods again.</p>
          <p>
            Before re-verifying, compare the profile with the real business and make sure important
            details are accurate.
          </p>
          <p>Then use one of the methods Google actually offers.</p>
          <p>
            If you repeatedly cannot complete any offered route after following the requirements,
            record the exact blocker and use Google&apos;s support option.
          </p>
        </>
      ),
    },
    {
      heading: "There are no useful verification options showing",
      body: (
        <>
          <p>Do not create a duplicate profile and do not invent a verification method.</p>
          <p>Google controls which methods are available.</p>
          <p>
            Check that you are signed into the correct account and looking at the correct Business
            Profile.
          </p>
          <p>Follow any available verification or re-verification instruction first.</p>
          <p>
            If you remain unable to verify after trying the available methods, Google&apos;s
            verification guidance directs businesses to contact support.
          </p>
          <p>
            Describe exactly what is missing or failing rather than simply saying the profile is
            stuck.
          </p>
        </>
      ),
    },
    {
      heading: "Google says somebody else already manages the business",
      body: (
        <>
          <p>Treat this as an ownership issue.</p>
          <p>
            If the existing verified Business Profile represents the same business, Google provides
            an ownership-request process.
          </p>
          <p>Request access from the existing owner through Google&apos;s route.</p>
          <p>Do not create another Business Profile merely to bypass the ownership problem.</p>
          <p>
            Google says duplicate profiles for the same business can violate its policies and may
            not appear on Search or Maps.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Fix the verification state you actually have</h2>
      <p>
        When Google Business Profile verification becomes frustrating, it is tempting to keep
        retrying everything at once.
      </p>
      <p>That usually makes the situation harder to diagnose.</p>
      <p>Instead, identify the exact point where the process is now:</p>
      <p>waiting for review,</p>
      <p>re-verification requested,</p>
      <p>video rejected,</p>
      <p>video upload failing,</p>
      <p>verification method unavailable,</p>
      <p>or ownership unresolved.</p>
      <p>Then follow the rules for that specific state.</p>
      <p>If Google tells you what was missing, use that information.</p>
      <p>
        If the profile information is inaccurate, correct the real problem rather than trying to
        prove inaccurate information.
      </p>
      <p>If the profile belongs to somebody else, resolve ownership rather than creating a duplicate.</p>
      <p>And keep account security and verification codes under the business owner&apos;s control.</p>
      <p>
        If you are still unsure why verification is failing, ProfileRelaunch can review what Google
        is showing you, the type of business and what you have already tried, then explain the
        strongest appropriate next step.
      </p>
      <p>
        We cannot choose Google&apos;s verification method or guarantee that Google will verify a
        profile.
      </p>
      <p>
        We can help you make sure the next step matches Google&apos;s current process and the real
        business.
      </p>
    </>
  ),
  sourcesUsed: verificationStuckOrRejectedSources,
}
