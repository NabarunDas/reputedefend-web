import {
  sourceBusinessProfileThirdPartyPolicies,
  sourceFraudulentCallsTexts,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceSecureCompromisedGoogleAccount,
  sourceTransferPrimaryOwnership,
  sourceVerifyBusiness,
  sourceWorkingWithThirdParties,
} from "@/lib/resource-sources/google-business-profile"

export const googleBusinessProfileScamsSlug = "google-business-profile-scams"

export const googleBusinessProfileScamsSources = [
  sourceProtectBusinessProfile,
  sourceFraudulentCallsTexts,
  sourceOwnersManagers,
  sourceVerifyBusiness,
  sourceWorkingWithThirdParties,
  sourceBusinessProfileThirdPartyPolicies,
  sourceSecureCompromisedGoogleAccount,
  sourceTransferPrimaryOwnership,
]

export const googleBusinessProfileScamsBody = {
  intro: (
    <>
      <p>
        A Google Business Profile scam does not always begin with an obvious request for money.
      </p>
      <p>Sometimes it begins with:</p>
      <p>a phone call that sounds official,</p>
      <p>an email saying your listing will be suspended,</p>
      <p>a text asking for a verification code,</p>
      <p>an unexpected owner or manager request,</p>
      <p>or somebody claiming they need access to “fix” the profile.</p>
      <p>The most dangerous requests are often framed as routine support.</p>
      <p>Google does sometimes contact businesses.</p>
      <p>
        Google also allows legitimate third-party agencies to manage Business Profiles.
      </p>
      <p>So the correct rule is not:</p>
      <p>“Never trust a phone call.”</p>
      <p>And it is not:</p>
      <p>“Never give anyone Business Profile access.”</p>
      <p>The safer rule is:</p>
      <p>understand what Google says it will never ask for,</p>
      <p>understand what access you are granting,</p>
      <p>
        and independently verify who you are dealing with before handing over control.
      </p>
      <p>Google says it will never ask for your one-time password or PIN.</p>
      <p>
        Google&apos;s Business Profile verification guidance also says verification codes should not be
        shared with anyone, including people who manage the profile.
      </p>
      <p>
        Google warns businesses not to approve owner or manager requests from people they do not
        recognise.
      </p>
      <p>
        And Google says it will not try to convince you to pay to maintain, verify or reinstate your
        Business Profile.
      </p>
      <p>Those are useful boundaries.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If somebody contacts you about your Google Business Profile:</p>
      <ul>
        <li>do not share your Google Account password</li>
        <li>do not share an OTP or PIN</li>
        <li>do not share 2-Step Verification codes</li>
        <li>do not share backup security codes</li>
        <li>do not share a Business Profile verification code</li>
        <li>
          do not approve an owner or manager request unless you know who is requesting access and why
        </li>
        <li>check People and access before granting permissions</li>
        <li>understand whether the person needs Manager or Owner access</li>
        <li>retain ownership of your Business Profile when using a legitimate third party</li>
        <li>
          do not transfer primary ownership merely because somebody says support requires it
        </li>
        <li>do not assume a Google logo or caller ID proves the caller works for Google</li>
        <li>
          Google does make some legitimate automated and manual calls, so do not classify every call as
          fraudulent
        </li>
        <li>if somebody claims to work for Google, verify that claim independently</li>
        <li>
          Google says it does not charge you to maintain, verify or reinstate a Business Profile
        </li>
        <li>an independent agency can legitimately charge for its own professional services</li>
        <li>those two facts are not contradictory</li>
        <li>
          if you already shared credentials or approved suspicious access, secure your Google Account and
          review Business Profile access immediately
        </li>
        <li>preserve suspicious emails, texts, phone details and access-request information</li>
      </ul>
      <p>Protect the account first.</p>
      <p>Then deal with any profile changes or recovery problem.</p>
    </>
  ),
  main: (
    <>
      <h2>Do not assume every call claiming to be Google is genuine</h2>
      <p>Scammers can use:</p>
      <ul>
        <li>official-sounding company names</li>
        <li>Google logos</li>
        <li>public information from your Business Profile</li>
        <li>local phone numbers</li>
        <li>urgent language</li>
        <li>references to real Google products</li>
      </ul>
      <p>None of those things proves who the caller is.</p>
      <p>
        A Business Profile already exposes useful public information such as the business name, category,
        phone number, address where shown and reviews.
      </p>
      <p>Knowing those details does not prove privileged Google access.</p>
      <p>Verify the identity independently before taking a sensitive action.</p>

      <h2>Google can genuinely call businesses</h2>
      <p>Do not overcorrect and tell businesses that Google never calls.</p>
      <p>
        Google&apos;s guidance says it uses automated calls and, in some cases, manual operators for
        purposes such as:
      </p>
      <ul>
        <li>checking business information</li>
        <li>confirming opening hours</li>
        <li>helping with reservations</li>
        <li>confirming prices or availability</li>
        <li>scheduling appointments for Google users</li>
      </ul>
      <p>A legitimate call existing does not make every caller legitimate.</p>
      <p>Judge the request by what the person is asking you to do.</p>
      <p>
        Requests for passwords, security codes or payment to maintain the Business Profile are strong
        warning signs.
      </p>

      <h2>Google says it will never ask for your OTP or PIN</h2>
      <p>Google&apos;s Business Profile security guidance is explicit.</p>
      <p>Google says it will never ask for:</p>
      <ul>
        <li>a one-time password</li>
        <li>a PIN</li>
      </ul>
      <p>Treat those as authentication secrets.</p>
      <p>Do not read them to somebody on a phone call.</p>
      <p>Do not send them through:</p>
      <ul>
        <li>email</li>
        <li>SMS</li>
        <li>WhatsApp</li>
        <li>chat</li>
        <li>a support form supplied by an unknown person</li>
      </ul>
      <p>
        A person who obtains a valid authentication code may be trying to gain access to your account
        rather than help your Business Profile.
      </p>

      <h2>Business Profile verification codes must also stay private</h2>
      <p>Business Profile verification can involve codes in some situations.</p>
      <p>
        Google&apos;s verification guidance tells businesses to keep those codes secure.
      </p>
      <p>Google says it will never ask for the Business Profile verification code.</p>
      <p>
        It also says not to share the verification code with anyone, including people who manage the
        Business Profile.
      </p>
      <p>A legitimate consultant can explain the verification process.</p>
      <p>
        The business should complete the secure verification step itself where Google requires it.
      </p>

      <h2>Never give a Business Profile provider your Google Account password</h2>
      <p>
        Google provides owner and manager roles so multiple authorised people can work on a Business
        Profile without sharing a password.
      </p>
      <p>Each user should use their own Google Account.</p>
      <p>Do not solve a management-access problem by sending somebody:</p>
      <ul>
        <li>your Gmail password</li>
        <li>your Google Account password</li>
        <li>a saved browser password</li>
        <li>an account recovery password</li>
        <li>a temporary password</li>
      </ul>
      <p>A legitimate management relationship should use Google&apos;s access controls.</p>

      <h2>An owner or manager request is an access grant</h2>
      <p>An invitation or access request is not merely a notification.</p>
      <p>
        It can give another Google Account the ability to manage the Business Profile.
      </p>
      <p>Before approving a request, identify:</p>
      <ul>
        <li>who requested access</li>
        <li>what organisation they represent</li>
        <li>why they need access</li>
        <li>what role they need</li>
        <li>how long they need it</li>
      </ul>
      <p>
        Google specifically tells businesses not to approve owner or manager requests from people they do
        not recognise.
      </p>
      <p>If you do not know who sent the request, stop and verify it first.</p>

      <h2>Owner access deserves more caution than manager access</h2>
      <p>Google distinguishes between Owners and Managers.</p>
      <p>
        Owners can perform sensitive administrative actions, including adding or removing users.
      </p>
      <p>
        Managers can perform many day-to-day profile tasks but cannot add or remove users or remove the
        Business Profile.
      </p>
      <p>Do not grant Owner merely because somebody says:</p>
      <p>“Manager will not work.”</p>
      <p>Ask what exact task requires the higher role.</p>
      <p>Use the minimum appropriate authorised access.</p>

      <h2>Primary ownership should remain under deliberate control</h2>
      <p>
        A Business Profile can have several owners but only one primary owner.
      </p>
      <p>Only the primary owner can transfer primary ownership.</p>
      <p>Do not transfer that role casually.</p>
      <p>
        A marketing agency, consultant or support provider does not automatically need primary ownership
        simply to help manage a profile.
      </p>
      <p>
        Google&apos;s third-party policies say end customers should retain ownership or co-ownership of
        their Business Profile.
      </p>
      <p>The business should understand who controls that role at all times.</p>

      <h2>Unknown manager requests should not be approved “just to see what happens”</h2>
      <p>Do not approve suspicious access as a test.</p>
      <p>
        Once access is granted, another account may be able to alter business information.
      </p>
      <p>Instead:</p>
      <ul>
        <li>preserve the request</li>
        <li>note the requesting email address</li>
        <li>confirm whether anyone in the business authorised it</li>
        <li>check with the legitimate provider through a known contact method</li>
        <li>reject or leave unapproved requests you cannot verify</li>
      </ul>
      <p>
        Security experiments should not involve giving an unknown person real access.
      </p>

      <h2>A caller demanding payment to maintain the profile is a major warning sign</h2>
      <p>
        Google warns about people claiming to be Google support or Google employees while asking for
        money.
      </p>
      <p>
        Google says it will never try to convince a merchant to pay in order to maintain a Business
        Profile.
      </p>
      <p>Its guidance specifically includes:</p>
      <ul>
        <li>verification</li>
        <li>reinstatement</li>
      </ul>
      <p>That does not mean every paid Business Profile service is fraudulent.</p>
      <p>
        Independent agencies can legitimately charge for their own professional work.
      </p>
      <p>The important distinction is:</p>
      <p>a third party charging for its service,</p>
      <p>versus:</p>
      <p>
        someone claiming that Google itself requires payment to maintain, verify or reinstate the profile.
      </p>

      <h2>A legitimate third-party service should identify itself as a third party</h2>
      <p>
        Google publishes rules for agencies and other third parties that manage Business Profiles.
      </p>
      <p>Those providers must be transparent about:</p>
      <ul>
        <li>who they are</li>
        <li>what service they provide</li>
        <li>their fees</li>
        <li>expected results</li>
        <li>changes made to the profile</li>
      </ul>
      <p>They should not pretend to be Google.</p>
      <p>They should not make false, misleading or unrealistic claims.</p>
      <p>A legitimate independent provider should be comfortable saying:</p>
      <p>“We are not Google.”</p>
      <p>ProfileRelaunch must follow the same principle.</p>

      <h2>If somebody claims to work for Google, verify independently</h2>
      <p>
        Google&apos;s guidance for businesses working with third parties says that when somebody claims to
        work for Google, businesses can ask for their name and request communication from an @google.com
        email address.
      </p>
      <p>Do not rely only on:</p>
      <ul>
        <li>caller ID</li>
        <li>display name</li>
        <li>logo</li>
        <li>email signature</li>
        <li>a website designed to look like Google</li>
      </ul>
      <p>
        If the contact is suspicious, end the interaction and use an official Google route you reached
        independently.
      </p>
      <p>Do not use the caller&apos;s own link merely to verify the caller.</p>

      <h2>Urgency is not proof that you must act immediately</h2>
      <p>Scammers often rely on pressure.</p>
      <p>Examples can include:</p>
      <p>“Your listing will disappear in one hour.”</p>
      <p>“Give me the code now or verification will fail.”</p>
      <p>“Approve me as owner before the case expires.”</p>
      <p>“Pay today or your profile will be permanently deleted.”</p>
      <p>A real Business Profile problem may genuinely need attention.</p>
      <p>But urgency does not justify giving away credentials.</p>
      <p>Record what was said.</p>
      <p>Then independently check the actual Business Profile state.</p>

      <h2>Check the profile itself instead of trusting the caller&apos;s description</h2>
      <p>Sign into the legitimate business-controlled Google Account.</p>
      <p>Open the Business Profile through Google Search or Maps.</p>
      <p>Check what Google actually shows.</p>
      <p>Look for:</p>
      <ul>
        <li>verification prompts</li>
        <li>restrictions</li>
        <li>current profile visibility</li>
        <li>People and access</li>
        <li>pending invitations</li>
        <li>recent edits</li>
      </ul>
      <p>Do not assume the caller accurately described the problem.</p>
      <p>A scammer may describe a suspension that does not exist.</p>

      <h2>Review People and access regularly</h2>
      <p>Google recommends limiting access to people who actually need it.</p>
      <p>Periodically check:</p>
      <p>Business Profile settings</p>
      <p>→ People and access</p>
      <p>Identify:</p>
      <ul>
        <li>primary owner</li>
        <li>other owners</li>
        <li>managers</li>
        <li>pending invitations</li>
      </ul>
      <p>Remove access that no longer has a legitimate business purpose.</p>
      <p>
        Former employees and old agencies should not remain indefinitely merely because nobody reviewed
        the list.
      </p>

      <h2>If you use an agency, keep your own business access</h2>
      <p>
        A legitimate agency relationship should not leave the customer locked out of its own Business
        Profile.
      </p>
      <p>
        Google&apos;s third-party policies require end customers to retain ownership or co-ownership.
      </p>
      <p>Keep a business-controlled Google Account attached to the profile.</p>
      <p>Understand:</p>
      <ul>
        <li>what role the agency has</li>
        <li>why it needs that role</li>
        <li>who can remove that access</li>
        <li>what happens when the contract ends</li>
      </ul>
      <p>
        Do not let profile control exist only inside the agency&apos;s Google Account.
      </p>

      <h2>If you accidentally shared a password, secure the Google Account first</h2>
      <p>
        If a password was disclosed to somebody you do not trust, treat that as a Google Account security
        problem.
      </p>
      <p>
        Google&apos;s compromised-account guidance tells users to secure the account and review
        suspicious activity.
      </p>
      <p>Depending on the situation, that can include:</p>
      <ul>
        <li>changing the Google Account password</li>
        <li>reviewing recent security activity</li>
        <li>reviewing signed-in devices</li>
        <li>checking recovery information</li>
        <li>strengthening 2-Step Verification</li>
      </ul>
      <p>Do this through your Google Account and official Google security pages.</p>
      <p>Do not ask the suspicious caller to “undo” the access.</p>

      <h2>If you shared an OTP or security code, do not assume it is harmless because it expired</h2>
      <p>
        The important question is whether the code was used before it expired.
      </p>
      <p>Review the Google Account for suspicious activity.</p>
      <p>Check Business Profile access.</p>
      <p>Check whether account recovery information changed.</p>
      <p>
        If you no longer control the Google Account, use Google&apos;s account-recovery and
        compromised-account processes.
      </p>
      <p>Do not continue sending new codes to the same person.</p>

      <h2>If you approved suspicious Business Profile access, inspect what changed</h2>
      <p>Once the Google Account itself is secure, inspect the Business Profile.</p>
      <p>Check:</p>
      <ul>
        <li>People and access</li>
        <li>primary ownership</li>
        <li>other owners</li>
        <li>managers</li>
        <li>business name</li>
        <li>category</li>
        <li>phone number</li>
        <li>website</li>
        <li>address or service area</li>
        <li>opening hours</li>
        <li>other important edits</li>
      </ul>
      <p>
        Preserve evidence of unauthorised changes before correcting them where practical.
      </p>
      <p>
        Do not create a duplicate Business Profile simply because the existing one was altered.
      </p>

      <h2>Removing suspicious access can depend on your current role</h2>
      <p>Only owners can remove other owners and managers.</p>
      <p>Managers do not have the same user-management permissions.</p>
      <p>
        Google also applies temporary restrictions to some sensitive actions for newly added owners and
        managers.
      </p>
      <p>If you cannot remove a suspicious user, first identify:</p>
      <ul>
        <li>your own role</li>
        <li>their role</li>
        <li>who is primary owner</li>
        <li>when access was added</li>
      </ul>
      <p>Then use Google&apos;s appropriate access or ownership process.</p>
      <p>
        Do not assume the only solution is to abandon the existing profile.
      </p>

      <h2>A compromised Google Account and a compromised Business Profile are related but different</h2>
      <p>Someone may have:</p>
      <ul>
        <li>your Google Account password</li>
        <li>access to the Business Profile through their own Google Account</li>
        <li>both</li>
      </ul>
      <p>Securing one does not automatically clean up the other.</p>
      <p>Review:</p>
      <p>Google Account security</p>
      <p>and:</p>
      <p>Business Profile People and access</p>
      <p>as separate checks.</p>
      <p>
        This is especially important when a legitimate third party previously had authorised access.
      </p>

      <h2>Do not create a replacement profile after a scam</h2>
      <p>
        If the existing Business Profile represents the real business, recover control of it where
        possible.
      </p>
      <p>Creating another listing can introduce:</p>
      <ul>
        <li>duplicate-profile problems</li>
        <li>ownership confusion</li>
        <li>lost history</li>
        <li>verification issues</li>
      </ul>
      <p>
        A security incident does not automatically make the existing Business Profile unusable.
      </p>
      <p>Recover first.</p>
      <p>Rebuild only where Google&apos;s actual process requires something different.</p>

      <h2>Preserve scam evidence without exposing credentials</h2>
      <p>Keep useful records such as:</p>
      <ul>
        <li>caller number shown</li>
        <li>date and time</li>
        <li>email address</li>
        <li>message text</li>
        <li>screenshots</li>
        <li>access-request email</li>
        <li>company name used by the caller</li>
        <li>payment demand</li>
        <li>suspicious URLs as text where safe</li>
        <li>changes made to the Business Profile</li>
      </ul>
      <p>Do NOT store or forward:</p>
      <ul>
        <li>passwords</li>
        <li>OTPs</li>
        <li>PINs</li>
        <li>verification codes</li>
        <li>backup codes</li>
      </ul>
      <p>as ordinary case evidence.</p>
      <p>
        Those are secrets, not evidence we need customers to send to ProfileRelaunch.
      </p>

      <h2>ProfileRelaunch should never request passwords or authentication codes</h2>
      <p>This is a product rule as well as a customer safety rule.</p>
      <p>ProfileRelaunch may need:</p>
      <ul>
        <li>screenshots</li>
        <li>Google decision messages</li>
        <li>profile information</li>
        <li>review links</li>
        <li>legitimate evidence</li>
        <li>authorised Manager access in some managed cases</li>
      </ul>
      <p>We should never request:</p>
      <ul>
        <li>Google Account passwords</li>
        <li>one-time passwords</li>
        <li>PINs</li>
        <li>2-Step Verification codes</li>
        <li>backup codes</li>
        <li>Business Profile verification codes</li>
      </ul>
      <p>A customer should remain in control of those authentication steps.</p>

      <h2>Sometimes the correct response is a security incident, not a reinstatement case</h2>
      <p>
        If somebody has obtained account access, the immediate priority may be:
      </p>
      <p>secure the Google Account,</p>
      <p>remove unauthorised access,</p>
      <p>and establish legitimate ownership.</p>
      <p>
        Only after control is restored should you decide whether there is also:
      </p>
      <ul>
        <li>a verification issue</li>
        <li>a suspension</li>
        <li>an unauthorised profile edit</li>
        <li>a review problem</li>
        <li>another Business Profile case</li>
      </ul>
      <p>
        Do not treat every scam incident as an ordinary suspension appeal.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google tells businesses to limit Business Profile access to owners and managers who genuinely
          need it and not to approve owner or manager requests from people they do not recognise.
        </p>
        <p>
          Google warns businesses about phone calls, emails and text messages from people who claim to be
          Google support or Google employees while asking for money.
        </p>
        <p>Google says it will never ask for a one-time password or PIN.</p>
        <p>
          Google also says it will never try to persuade a business to pay to maintain its Business
          Profile, including to have the profile verified or reinstated.
        </p>
        <p>
          Google&apos;s Business Profile verification guidance separately says verification codes should
          be kept secure and should not be shared with anyone, including people who manage the profile.
        </p>
        <p>
          Google does make some legitimate automated and manual calls to businesses, so the existence of
          a call itself does not establish fraud.
        </p>
        <p>
          Google provides Owner and Manager roles so authorised users can manage Business Profiles using
          their own Google Accounts without password sharing.
        </p>
      </>
    ),
    sources: [sourceProtectBusinessProfile, sourceFraudulentCallsTexts, sourceOwnersManagers],
  },
  interpretation: (
    <>
      <p>Think about Business Profile security in three layers.</p>
      <p>First:</p>
      <p>Who controls the Google Account?</p>
      <p>Second:</p>
      <p>Which Google Accounts have Business Profile access?</p>
      <p>Third:</p>
      <p>What is the person contacting you actually asking for?</p>
      <p>
        A legitimate support interaction should not require you to hand over authentication secrets.
      </p>
      <p>
        A legitimate third-party management relationship should be transparent and should preserve the
        business&apos;s own ownership or co-ownership.
      </p>
      <p>
        And an official-looking caller should still be judged by the request they make.
      </p>
      <p>Never trade security for urgency.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not share your Google Account password.</p>
      <p>Do not share an OTP or PIN.</p>
      <p>Do not share 2-Step Verification codes or backup codes.</p>
      <p>Do not share Business Profile verification codes.</p>
      <p>
        Do not approve an owner or manager request from somebody you do not recognise.
      </p>
      <p>
        Do not transfer primary ownership merely because somebody claims support requires it.
      </p>
      <p>
        Do not assume a Google logo, caller ID or email display name proves Google employment.
      </p>
      <p>Do not say Google never calls businesses.</p>
      <p>Do not assume every independent provider charging money is a scam.</p>
      <p>
        Do not confuse a third party&apos;s professional fee with a supposed mandatory Google fee.
      </p>
      <p>
        Do not click a suspicious link merely to check whether the message is genuine.
      </p>
      <p>Do not create a duplicate Business Profile after an access incident.</p>
      <p>
        If credentials or access were exposed, secure the account and inspect People and access before
        dealing with the wider profile problem.
      </p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile scam and access-security checklist",
    items: [
      "Save the suspicious email, text or call details.",
      "Do not send the contact your Google Account password.",
      "Do not send an OTP or PIN.",
      "Do not send 2-Step Verification or backup codes.",
      "Do not send a Business Profile verification code.",
      "Check the Business Profile through Google Search or Maps using a legitimate business-controlled Google Account.",
      "Open People and access.",
      "Record the current primary owner.",
      "Record other owners and managers.",
      "Review pending access requests.",
      "Do not approve a request until you know who sent it and why.",
      "Give a legitimate provider only the role genuinely required.",
      "Retain business ownership or co-ownership when using a third party.",
      "Verify claims of Google employment independently.",
      "Treat a demand for payment to maintain, verify or reinstate the profile as a serious warning sign.",
      "Distinguish Google's no-charge Business Profile service from fees charged by independent professional providers.",
      "If credentials were exposed, secure the Google Account immediately.",
      "Review recent Google Account security activity and devices where appropriate.",
      "If suspicious Business Profile access was granted, review the profile for unauthorised changes.",
      "Preserve evidence of unauthorised edits without preserving authentication secrets.",
      "Remove obsolete owners or managers when you have the legitimate permission to do so.",
      "Do not create a duplicate profile merely because access was compromised.",
      "Keep a simple internal record of who should currently have Business Profile access.",
      "Never send passwords, OTPs, PINs or verification codes to ProfileRelaunch.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Believing Google never calls businesses.",
        body: "Google does make some legitimate automated and manual calls. Judge the interaction by what is being requested rather than assuming every call is fraudulent.",
      },
      {
        title: "Sharing an OTP because the caller already knows the business name.",
        body: "Business Profile information is often public. Knowing public details does not prove the caller is authorised to receive an authentication code.",
      },
      {
        title: "Treating a manager invitation as harmless.",
        body: "Business Profile access requests grant real permissions. Verify the requester and the required role before approving them.",
      },
      {
        title: "Giving an agency the Google Account password.",
        body: "Google provides Owner and Manager roles so authorised providers can use their own Google Accounts without password sharing.",
      },
      {
        title: "Giving away primary ownership by default.",
        body: "Third-party help does not automatically require primary ownership. Google says businesses should retain ownership or co-ownership when using third-party managers.",
      },
      {
        title: "Assuming every paid service is pretending to be Google.",
        body: "Independent providers can legitimately charge for professional work. The warning sign is misrepresentation about Google affiliation, mandatory Google fees or control the provider does not have.",
      },
      {
        title: "Paying a caller who says Google requires a reinstatement fee.",
        body: "Google says it will not try to convince businesses to pay to maintain, verify or reinstate a Business Profile.",
      },
      {
        title: "Clicking the caller's link to verify the caller.",
        body: "Use an official route reached independently. A suspicious contact should not control the method you use to authenticate them.",
      },
      {
        title: "Changing profile details before securing a compromised account.",
        body: "If an attacker still has account or profile access, corrections may simply be changed again. Restore security and legitimate control first.",
      },
      {
        title: "Creating another Business Profile after a compromise.",
        body: "Recover the existing legitimate profile where possible. A duplicate can create additional ownership, verification and visibility problems.",
      },
    ],
  },
  scenarios: [
    {
      heading: "A caller says Google will suspend us unless we pay today",
      body: (
        <>
          <p>Do not pay during the call.</p>
          <p>Do not give them your password, OTP, PIN or verification code.</p>
          <p>
            Google says it does not charge businesses to maintain, verify or reinstate a Business Profile.
          </p>
          <p>End the interaction if necessary.</p>
          <p>
            Then independently open your Business Profile and check whether Google actually shows a
            restriction or verification problem.
          </p>
          <p>Preserve the caller details.</p>
        </>
      ),
    },
    {
      heading: "Someone asks for the verification code that Google sent us",
      body: (
        <>
          <p>Do not share it.</p>
          <p>
            Google&apos;s verification guidance says the verification code should be kept secure and not
            shared with anyone, including people who manage the Business Profile.
          </p>
          <p>Complete the verification through the legitimate Google interface yourself.</p>
          <p>
            If the person claims they cannot help without the code, stop and reassess the relationship.
          </p>
        </>
      ),
    },
    {
      heading: "We received an owner or manager request from an email we do not recognise",
      body: (
        <>
          <p>Do not approve it.</p>
          <p>Check whether:</p>
          <ul>
            <li>an employee requested it</li>
            <li>your legitimate agency requested it</li>
            <li>another authorised business owner recognises the email</li>
          </ul>
          <p>
            Contact the known person or provider through an independently verified channel.
          </p>
          <p>
            If nobody authorised the request, leave it unapproved and preserve the details.
          </p>
        </>
      ),
    },
    {
      heading: "Our legitimate agency needs Business Profile access",
      body: (
        <>
          <p>That can be normal.</p>
          <p>Do not give the agency your personal Google password.</p>
          <p>Ask what role it needs and why.</p>
          <p>Use Google&apos;s Owner or Manager access controls.</p>
          <p>Keep a business-controlled account as an owner.</p>
          <p>
            Do not transfer primary ownership unless there is a genuine, understood business reason for
            doing so.
          </p>
        </>
      ),
    },
    {
      heading: "We gave the caller a password or code and now the profile has changed",
      body: (
        <>
          <p>Treat this as a security incident first.</p>
          <p>
            Secure the Google Account using Google&apos;s official account-security and recovery
            processes.
          </p>
          <p>Then inspect:</p>
          <p>People and access,</p>
          <p>ownership,</p>
          <p>and recent Business Profile changes.</p>
          <p>Preserve evidence of unauthorised changes.</p>
          <p>
            Correct the profile only after legitimate control is being restored.
          </p>
          <p>
            Do not create a replacement listing simply because the existing profile was compromised.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Protect access first — then fix the Business Profile</h2>
      <p>
        Business Profile scams work because the request often sounds like part of a real Google process.
      </p>
      <p>Verification is real.</p>
      <p>Google calls can be real.</p>
      <p>Manager access is real.</p>
      <p>Third-party agencies are real.</p>
      <p>Business Profile problems are real.</p>
      <p>
        The scam appears when somebody uses that reality to obtain money, credentials or control they
        should not have.
      </p>
      <p>Keep the boundaries simple.</p>
      <p>Do not share passwords.</p>
      <p>Do not share OTPs, PINs or verification codes.</p>
      <p>Do not approve access you do not recognise.</p>
      <p>Keep the business in control of its ownership.</p>
      <p>Verify claims independently.</p>
      <p>
        And remember that Google says it does not charge businesses to maintain, verify or reinstate a
        Business Profile, while legitimate independent providers may charge for their own clearly
        described professional services.
      </p>
      <p>
        If access has already been exposed, secure the Google Account and Business Profile ownership
        before trying to solve secondary profile problems.
      </p>
      <p>
        ProfileRelaunch can help identify the Business Profile issue, review ownership and access
        information and explain the appropriate Google process.
      </p>
      <p>
        We should never ask a customer for their Google Account password, OTP, PIN, backup code or
        Business Profile verification code.
      </p>
      <p>The objective is not simply to restore a listing.</p>
      <p>
        It is to restore control without handing that control to the next person who asks for it.
      </p>
    </>
  ),
  sourcesUsed: googleBusinessProfileScamsSources,
}
