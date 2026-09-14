import {
  sourceDuplicateOwnershipIssues,
  sourceFindBusiness,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceRequestOwnership,
  sourceTransferPrimaryOwnership,
  sourceVerifyBusiness,
} from "@/lib/resource-sources/google-business-profile"

export const lostAccessToGoogleBusinessProfileSlug = "lost-access-to-google-business-profile"

export const lostAccessToGoogleBusinessProfileSources = [
  sourceRequestOwnership,
  sourceOwnersManagers,
  sourceTransferPrimaryOwnership,
  sourceDuplicateOwnershipIssues,
  sourceProtectBusinessProfile,
  sourceFindBusiness,
  sourceVerifyBusiness,
]

export const lostAccessToGoogleBusinessProfileBody = {
  intro: (
    <>
      <p>
        Losing access to a Google Business Profile does not always mean somebody has taken it over.
      </p>
      <p>Several different problems can look like “lost access”.</p>
      <p>You may be signed into the wrong Google Account.</p>
      <p>
        You may have forgotten the login details for the account that originally verified the business.
      </p>
      <p>A former employee or agency may still own the profile.</p>
      <p>You may still have manager access but no longer have owner permissions.</p>
      <p>Another Google Account may be the primary owner.</p>
      <p>
        Or the profile may need verification again before certain management features are available.
      </p>
      <p>The correct fix depends on which situation you actually have.</p>
      <p>
        Do not create a replacement Business Profile simply because the existing profile is difficult to
        access.
      </p>
      <p>
        Google says businesses should generally have only one profile for each business, and an existing
        verified profile owned by somebody else should be handled through the ownership process.
      </p>
      <p>Start by identifying:</p>
      <p>the profile,</p>
      <p>the Google Account you are using,</p>
      <p>and the access role that currently exists.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If you have lost access to a Google Business Profile:</p>
      <ul>
        <li>sign into the Google Account you believe was connected to the profile</li>
        <li>search Google for the business name and city or search “my business”</li>
        <li>check whether Google says you manage the profile</li>
        <li>check Business Profile settings and People and access if you can still open the profile</li>
        <li>identify whether you are a primary owner, owner or manager</li>
        <li>do not share passwords or verification codes with somebody offering to fix access</li>
        <li>if another verified owner controls the profile, use Google&apos;s ownership-request process</li>
        <li>
          for a storefront or hybrid business, Google&apos;s published process allows an authorised business
          owner to request access
        </li>
        <li>
          for a service-area business without a customer-facing location, Google directs ownership requests
          through Business Profile support
        </li>
        <li>after an ownership request, the current owner normally has three days to respond</li>
        <li>if approved, you can manage the profile</li>
        <li>if denied, Google says you can appeal the denial</li>
        <li>if there is no response after three days, an option to claim the profile may become available</li>
        <li>Google says that claim option is not always available</li>
        <li>
          if you forgot the login details for the original Google Account, use Google&apos;s
          account-recovery process rather than creating a duplicate profile
        </li>
        <li>
          new owners and managers must wait seven days before they can use some sensitive ownership
          features
        </li>
      </ul>
      <p>Do not confuse access recovery with creating a new business listing.</p>
      <p>
        The objective is to regain appropriate control of the existing profile wherever possible.
      </p>
    </>
  ),
  main: (
    <>
      <h2>First confirm that the Business Profile still exists</h2>
      <p>Search for the business on Google Search and Maps.</p>
      <p>Use:</p>
      <ul>
        <li>the business name</li>
        <li>the city</li>
        <li>the business address where appropriate</li>
      </ul>
      <p>
        Google also says that when you are signed into the associated Google Account, you can search:
      </p>
      <p>my business</p>
      <p>to find profiles you manage.</p>
      <p>
        Do not assume the profile disappeared simply because it is no longer visible inside the account you
        normally use.
      </p>
      <p>The first question is:</p>
      <p>Does the Business Profile still exist publicly?</p>
      <p>The second is:</p>
      <p>Which Google Account, if any, can manage it?</p>

      <h2>Check whether you are simply signed into the wrong Google Account</h2>
      <p>This is one of the simplest explanations.</p>
      <p>A business may have:</p>
      <ul>
        <li>a personal Gmail account</li>
        <li>a company Google Account</li>
        <li>an old agency account</li>
        <li>an account belonging to a director</li>
        <li>accounts belonging to several employees</li>
      </ul>
      <p>
        Google says you must be signed into the Google Account associated with the Business Profile to find
        and manage it.
      </p>
      <p>Check the legitimate accounts that may have been used historically.</p>
      <p>Do not share credentials between staff while testing accounts.</p>
      <p>Each person should use their own authorised Google Account.</p>

      <h2>Look for Google&apos;s management indicators</h2>
      <p>
        Google provides signs that can help you work out whether the signed-in account already manages the
        profile.
      </p>
      <p>Depending on where you look, you may see wording such as:</p>
      <ul>
        <li>You manage this Business Profile</li>
        <li>Manage your Business Profile</li>
      </ul>
      <p>
        If the profile shows those management indicators, you may already have access and the problem may
        instead concern:
      </p>
      <ul>
        <li>your role</li>
        <li>verification</li>
        <li>a particular management feature</li>
        <li>another owner</li>
      </ul>
      <p>
        Do not start an ownership dispute before checking whether you already manage the profile.
      </p>

      <h2>If you can open the profile, check People and access</h2>
      <p>If the current Google Account still manages the Business Profile, open:</p>
      <p>Business Profile settings</p>
      <p>and:</p>
      <p>People and access</p>
      <p>This can show the current users and their roles.</p>
      <p>Google uses owner and manager roles.</p>
      <p>A Business Profile can have multiple owners but only one primary owner.</p>
      <p>Knowing your role can explain why an action is unavailable.</p>

      <h2>Manager access is not the same as owner access</h2>
      <p>Google says managers can perform many normal profile-management tasks.</p>
      <p>They can manage information and use many Business Profile features.</p>
      <p>But managers cannot perform every ownership action.</p>
      <p>
        Google&apos;s current guidance says managers cannot add or remove users or remove the profile.
      </p>
      <p>Only owners can change access roles for other owners and managers.</p>
      <p>
        So if you can edit the business but cannot change who has access, you may not have “lost” the
        profile at all.
      </p>
      <p>You may simply have manager-level access.</p>

      <h2>Primary owner, owner and manager are different roles</h2>
      <p>Do not use the words interchangeably.</p>
      <p>Google allows multiple owners.</p>
      <p>But only one user is the primary owner.</p>
      <p>
        The primary-owner role matters especially when ownership itself needs to be transferred.
      </p>
      <p>Google says only the primary owner can transfer primary ownership.</p>
      <p>
        An ordinary owner can still have substantial control, including the ability to manage users.
      </p>
      <p>A manager has less administrative control.</p>
      <p>Record the role you actually have before deciding what needs to change.</p>

      <h2>If another legitimate owner still has access, use the existing access controls first</h2>
      <p>Sometimes the simplest recovery route is internal.</p>
      <p>
        For example, another director or authorised owner may still have access even though your own
        account does not.
      </p>
      <p>That owner may be able to add your current Google Account through:</p>
      <p>People and access</p>
      <p>using the appropriate owner or manager role.</p>
      <p>
        Do not create a new Business Profile when an authorised existing owner can restore access to the
        current one.
      </p>

      <h2>Do not share the old owner&apos;s password to regain access</h2>
      <p>
        Google specifically supports separate owner and manager accounts so people do not need to share
        passwords.
      </p>
      <p>Do not solve an access problem by asking:</p>
      <p>“Can you give me the login?”</p>
      <p>The correct model is:</p>
      <p>each authorised person uses their own Google Account,</p>
      <p>and the Business Profile grants the appropriate role.</p>
      <p>This is safer when employees, agencies or contractors change.</p>

      <h2>If you forgot the original Google Account login, recover the account first</h2>
      <p>Sometimes nobody else controls the profile.</p>
      <p>
        The business simply lost access to the Google Account that originally claimed it.
      </p>
      <p>
        Google&apos;s ownership guidance points businesses with forgotten login information to
        Google&apos;s account-recovery tools.
      </p>
      <p>That is different from an ownership dispute.</p>
      <p>
        If the legitimate Google Account can be recovered, recovering it may restore access to the existing
        Business Profile.
      </p>
      <p>Do not create another profile merely because the password or username was forgotten.</p>

      <h2>If another person owns the verified profile, use the ownership-request process</h2>
      <p>
        Google provides a specific process for a business owner when a verified Business Profile is
        controlled by somebody else.
      </p>
      <p>
        For storefront and hybrid businesses, Google&apos;s current process starts by finding the existing
        business and selecting the option to request access.
      </p>
      <p>The current owner is then notified.</p>
      <p>This is the appropriate route when, for example:</p>
      <ul>
        <li>a former employee owns the profile</li>
        <li>an old agency owns the profile</li>
        <li>a previous contractor verified it</li>
        <li>a former business partner still controls it</li>
        <li>nobody at the current business recognises the managing account</li>
      </ul>
      <p>Do not create a competing duplicate listing as the first response.</p>

      <h2>Storefront and hybrid businesses use the normal ownership request</h2>
      <p>
        For a storefront or hybrid Business Profile, Google&apos;s published flow allows an authorised
        business owner to:
      </p>
      <ul>
        <li>find the existing profile</li>
        <li>select Request access</li>
        <li>complete the ownership request</li>
        <li>submit it</li>
      </ul>
      <p>Google then emails the current owner.</p>
      <p>You also receive confirmation of the request.</p>
      <p>Keep that confirmation email.</p>
      <p>
        It is part of the ownership process and can provide the link needed to check what happens next.
      </p>

      <h2>Service-area businesses use a different ownership route</h2>
      <p>
        Google gives different instructions for a service-area business that goes to customers and does not
        have a physical shop or office customers visit.
      </p>
      <p>Google currently tells businesses in that situation to contact Business Profile support.</p>
      <p>Its ownership guidance says to use:</p>
      <p>Transfer ownership of listing</p>
      <p>as the issue description.</p>
      <p>
        Do not assume every Business Profile has exactly the same ownership-request interface.
      </p>
      <p>Use the route Google publishes for the business type involved.</p>

      <h2>The current owner normally has three days to respond</h2>
      <p>
        After an ownership request is submitted, Google says the current profile owner has three days to
        respond.
      </p>
      <p>The request can be:</p>
      <p>approved,</p>
      <p>denied,</p>
      <p>or unanswered.</p>
      <p>Do not tell a customer that ownership automatically transfers after three days.</p>
      <p>That is not what Google&apos;s guidance says.</p>

      <h2>If the ownership request is approved</h2>
      <p>
        Google says an approved ownership request results in an approval email and the requester can then
        manage the Business Profile.
      </p>
      <p>Once access is restored:</p>
      <p>check your role,</p>
      <p>check People and access,</p>
      <p>and confirm who else still manages the profile.</p>
      <p>
        Do not immediately remove legitimate users before understanding why they have access.
      </p>

      <h2>If the ownership request is denied</h2>
      <p>Google says a denied request results in a rejection email.</p>
      <p>Its current guidance says the requester can appeal the denial.</p>
      <p>A denied request does not mean you should:</p>
      <ul>
        <li>create a duplicate profile</li>
        <li>impersonate the existing owner</li>
        <li>submit false business documents</li>
        <li>repeatedly send identical requests</li>
      </ul>
      <p>
        Preserve the rejection email and follow the ownership process Google makes available.
      </p>

      <h2>If there is no response after three days</h2>
      <p>
        Google says that if the current owner does not respond after three days, you may have the option to
        claim the profile.
      </p>
      <p>The word:</p>
      <p>may</p>
      <p>matters.</p>
      <p>Google explicitly says the option to claim the profile is not always available.</p>
      <p>
        If the option appears, follow the confirmation email or the instructions shown in the Business
        Profile and complete any verification Google requires.
      </p>
      <p>
        Do not promise that silence from the existing owner guarantees automatic ownership.
      </p>

      <h2>Verification can still be required during ownership recovery</h2>
      <p>
        Regaining the ability to claim a profile does not necessarily mean Google will hand over management
        without verification.
      </p>
      <p>Google may require the business to verify that it is entitled to manage the profile.</p>
      <p>Verification methods are controlled by Google.</p>
      <p>Do not promise a particular verification method.</p>
      <p>Use the verification options Google provides for that profile.</p>

      <h2>Do not create a duplicate profile as an access workaround</h2>
      <p>Google says there should generally be only one Business Profile for each business.</p>
      <p>
        If a verified profile already exists, creating another profile for the same business can create
        duplicate and ownership problems.
      </p>
      <p>A duplicate may not show on Search or Maps.</p>
      <p>
        If the existing profile belongs to the same business, work through ownership and access rather than
        starting again.
      </p>
      <p>
        This is especially important because the existing profile may already contain:
      </p>
      <ul>
        <li>reviews</li>
        <li>photos</li>
        <li>history</li>
        <li>customer recognition</li>
        <li>existing business information</li>
      </ul>

      <h2>Do not remove the existing profile simply to rebuild it</h2>
      <p>Removing profile content and managers is not an access-recovery technique.</p>
      <p>It can have significant consequences.</p>
      <p>
        Google&apos;s removal guidance says removing profile content and managers is permanent for that
        content and may require the profile to be verified again if the business later wants to manage it.
      </p>
      <p>User-generated content such as reviews can remain.</p>
      <p>
        Do not perform destructive profile actions merely because the ownership structure is inconvenient.
      </p>

      <h2>If ownership needs to move permanently, transfer primary ownership</h2>
      <p>
        A permanent change of control is different from simply adding another manager.
      </p>
      <p>Examples can include:</p>
      <ul>
        <li>the business has been sold</li>
        <li>the previous owner is leaving</li>
        <li>the person originally responsible no longer works there</li>
        <li>management responsibility has formally moved to another authorised owner</li>
      </ul>
      <p>Google provides a primary-ownership transfer process.</p>
      <p>
        The existing primary owner selects an existing owner or manager and transfers the primary-owner
        role.
      </p>
      <p>
        Using the transfer process helps preserve the existing Business Profile and its information.
      </p>

      <h2>New owners and managers have a seven-day limitation</h2>
      <p>
        Google currently says new owners and managers must wait seven days before they can use certain
        sensitive features.
      </p>
      <p>During that period, they can encounter errors if they try to:</p>
      <ul>
        <li>delete or undelete the profile</li>
        <li>remove other owners or managers</li>
        <li>transfer primary ownership</li>
      </ul>
      <p>This is important after access recovery.</p>
      <p>
        Do not interpret one of those temporary restrictions as proof that the recovery failed.
      </p>
      <p>Check when the user was added.</p>

      <h2>Do not rush to remove every previous user</h2>
      <p>Once access returns, review the access list carefully.</p>
      <p>
        Remove users who genuinely should no longer manage the business, such as an ex-employee with no
        continuing role.
      </p>
      <p>But first establish:</p>
      <p>who each user is,</p>
      <p>what role they have,</p>
      <p>and whether they still have a legitimate reason for access.</p>
      <p>Google recommends limiting access to people who actually need it.</p>
      <p>Clean access deliberately, not emotionally.</p>

      <h2>Be careful with agency and third-party access</h2>
      <p>
        Google advises businesses to retain access when a third party manages a Business Profile.
      </p>
      <p>An agency does not need your personal Google password.</p>
      <p>Where management access is genuinely required, use Google&apos;s roles.</p>
      <p>The business should understand:</p>
      <ul>
        <li>who owns the profile</li>
        <li>who is primary owner</li>
        <li>which third parties are managers or owners</li>
        <li>how access will be removed when the relationship ends</li>
      </ul>
      <p>
        Access should not depend on an agency keeping the business&apos;s login credentials.
      </p>

      <h2>Unknown ownership requests can be a security warning</h2>
      <p>
        Google advises businesses not to approve owner or manager requests from people they do not
        recognise.
      </p>
      <p>If you still control the profile and receive an unexpected access request:</p>
      <p>do not approve it automatically.</p>
      <p>Confirm the identity and reason first.</p>
      <p>
        Likewise, if you regain access after a suspected compromise, review People and access for accounts
        that should not be there.
      </p>

      <h2>Do not give anyone an OTP, PIN or security code</h2>
      <p>
        Google&apos;s Business Profile security guidance says Google will never ask businesses for an OTP or
        PIN.
      </p>
      <p>
        A person offering to recover profile access does not need your one-time security code as proof that
        they are legitimate.
      </p>
      <p>Do not provide:</p>
      <ul>
        <li>Google Account passwords</li>
        <li>OTPs</li>
        <li>verification PINs</li>
        <li>two-factor codes</li>
        <li>backup codes</li>
      </ul>
      <p>ProfileRelaunch should never request those credentials from a customer.</p>

      <h2>Lost access and suspended access are different problems</h2>
      <p>An ownership or login problem is not automatically a suspension.</p>
      <p>
        Likewise, restoring ownership does not automatically resolve a suspended or disabled profile.
      </p>
      <p>
        If Google has restricted the Business Profile for a policy reason, the suspension or appeal process
        may also need to be addressed.
      </p>
      <p>Identify the state separately:</p>
      <p>Who can access the profile?</p>
      <p>And:</p>
      <p>Is Google allowing the profile itself to operate normally?</p>
      <p>Do not treat one problem as proof of the other.</p>

      <h2>Keep an access record after the problem is resolved</h2>
      <p>Once control is restored, record:</p>
      <ul>
        <li>the primary owner</li>
        <li>other owners</li>
        <li>managers</li>
        <li>business-controlled Google Accounts</li>
        <li>third-party access</li>
        <li>when access was granted</li>
        <li>who should remove access when a role ends</li>
      </ul>
      <p>You do not need to store anybody&apos;s password.</p>
      <p>
        The goal is simply to prevent the business from discovering years later that nobody knows who
        controls its own profile.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says Business Profiles can have multiple owners but only one primary owner.
        </p>
        <p>
          Managers can perform many profile-management tasks, but Google says managers cannot add or remove
          users or remove the Business Profile.
        </p>
        <p>
          Google provides an ownership-request process when a verified Business Profile is owned by
          somebody else.
        </p>
        <p>
          For storefront and hybrid businesses, an authorised business owner can request access to the
          existing profile.
        </p>
        <p>
          For service-area businesses without a customer-facing physical location, Google directs
          businesses to contact support and use the transfer-ownership route.
        </p>
        <p>After an ownership request, Google says the current owner has three days to respond.</p>
        <p>If approved, the requester can manage the profile.</p>
        <p>If denied, Google says the requester can appeal the denial.</p>
        <p>
          If there is no response after three days, Google says an option to claim the profile may be
          available, but that option is not always offered.
        </p>
        <p>
          Google also says new owners and managers must wait seven days before they can use some sensitive
          ownership features.
        </p>
        <p>
          Google recommends that each authorised user use their own Google Account instead of sharing
          passwords and advises businesses to retain access when a third party manages the profile.
        </p>
      </>
    ),
    sources: [sourceRequestOwnership, sourceOwnersManagers, sourceProtectBusinessProfile],
  },
  interpretation: (
    <>
      <p>“Lost access” is a symptom, not a diagnosis.</p>
      <p>Work out which of these situations you actually have:</p>
      <ol>
        <li>
          The correct Business Profile exists, but you are signed into the wrong Google Account.
        </li>
        <li>
          The original Google Account belongs to the business, but its login needs to be recovered.
        </li>
        <li>You still manage the profile, but only as a manager rather than an owner.</li>
        <li>Another authorised owner can add you back.</li>
        <li>
          Another person or organisation owns the verified profile and you need Google&apos;s
          ownership-request process.
        </li>
        <li>The ownership process succeeds, but Google still requires verification.</li>
        <li>Access is restored, but the profile has a separate suspension or policy problem.</li>
      </ol>
      <p>Each situation has a different next step.</p>
      <p>Do not create a second Business Profile before identifying which one applies.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>
        Do not create a duplicate Business Profile simply because you cannot access the existing one.
      </p>
      <p>Do not ask an old employee or agency for their Google Account password.</p>
      <p>Do not share your own password.</p>
      <p>Do not share OTPs, PINs, two-factor codes or backup codes.</p>
      <p>Do not assume manager access gives you permission to add or remove users.</p>
      <p>Do not claim that ownership automatically transfers after three days.</p>
      <p>
        Do not ignore Google&apos;s warning that the post-request claim option is not always available.
      </p>
      <p>
        Do not transfer primary ownership to a third party merely because they are helping with the
        profile.
      </p>
      <p>Do not remove profile content and managers as a shortcut to rebuilding access.</p>
      <p>
        Do not treat a seven-day new-owner restriction as evidence that ownership recovery failed.
      </p>
      <p>Identify the existing profile, account and role first.</p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile access recovery checklist",
    items: [
      "Find the existing Business Profile on Google Search or Maps.",
      "Confirm that it represents the correct business.",
      "Check every legitimate Google Account that may already be associated with the profile.",
      "Search for the business name and city or “my business” while signed into the likely account.",
      "Look for Google's management indicators showing that the account already manages the profile.",
      "If you can access the profile, open People and access.",
      "Record whether you are primary owner, owner or manager.",
      "Identify the other legitimate owners and managers.",
      "If an authorised existing owner can restore your access, use Google's People and access controls.",
      "Do not exchange passwords between users.",
      "If the original business-owned Google Account login was forgotten, use Google's account-recovery process.",
      "If another person owns the verified profile, use Google's ownership-request process.",
      "For a service-area business without a customer-facing location, use Google's published support route for transfer of ownership.",
      "Save the ownership-request confirmation email.",
      "Record the date the ownership request was submitted.",
      "Allow the current owner the three-day response period described by Google.",
      "If approved, check the role granted and review People and access.",
      "If denied, preserve the rejection and use Google's available ownership-denial process where appropriate.",
      "If there is no response, check whether Google offers the option to claim and verify the profile.",
      "Do not assume the claim option will always appear.",
      "Complete any verification Google requires.",
      "Remember that new owners and managers may have seven-day restrictions on sensitive ownership actions.",
      "Remove obsolete or unauthorised access only when you have the appropriate owner permissions.",
      "Keep the business as an owner when using third-party management support.",
      "Keep a simple internal record of current owners and managers after recovery.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Creating a new profile because the old login is unavailable.",
        body: "If the existing profile represents the same business, use account recovery or Google's ownership process. A duplicate can create additional visibility and ownership problems.",
      },
      {
        title: "Assuming the profile was hacked before checking the Google Account.",
        body: "Being signed into the wrong account can look like lost ownership. First identify the profile and the account that is actually connected to it.",
      },
      {
        title: "Treating manager access as owner access.",
        body: "Managers can handle many profile tasks, but Google does not give them the same user-management and ownership permissions as owners.",
      },
      {
        title: "Sharing an old owner's password.",
        body: "Google supports separate owners and managers so authorised people can use their own accounts. Password sharing creates unnecessary security risk.",
      },
      {
        title: "Promising automatic ownership after three days.",
        body: "Google says a claim option may appear after an unanswered ownership request, but explicitly says that option is not always available.",
      },
      {
        title: "Using the storefront ownership flow for every service-area business.",
        body: "Google currently directs service-area businesses without a customer-facing location to contact support for the transfer-ownership process.",
      },
      {
        title: "Creating another profile after an ownership request is denied.",
        body: "Google provides an ownership process for denial. Creating a duplicate does not resolve who should control the existing verified profile.",
      },
      {
        title: "Thinking a seven-day restriction means access recovery failed.",
        body: "Google limits some sensitive actions for new owners and managers during their first seven days.",
      },
      {
        title: "Giving an agency primary ownership by default.",
        body: "Third-party help does not automatically require surrendering primary ownership. Google advises businesses to retain access to their profile.",
      },
      {
        title: "Leaving former employees on the access list indefinitely.",
        body: "Google recommends limiting owners and managers to people who actually need access. Review the access list when roles change.",
      },
    ],
  },
  scenarios: [
    {
      heading: "Our old employee created the Business Profile and has left",
      body: (
        <>
          <p>First check whether any current authorised owner still has access.</p>
          <p>
            If another owner exists, that owner may be able to add the correct business-controlled Google
            Account.
          </p>
          <p>
            If the former employee is the person controlling the verified profile and nobody at the business
            has ownership access, use Google&apos;s ownership-request process.
          </p>
          <p>
            Do not ask the former employee to hand over their personal Google Account password.
          </p>
          <p>
            The goal is to give the business its own legitimate access to the existing profile.
          </p>
        </>
      ),
    },
    {
      heading: "Our old marketing agency is still the primary owner",
      body: (
        <>
          <p>Check whether the business itself is already an owner or manager.</p>
          <p>
            If the agency is cooperating, the clean route may be to add the business-controlled account as
            an owner and transfer primary ownership appropriately.
          </p>
          <p>Google says businesses using third-party managers should retain access.</p>
          <p>Do not leave long-term ownership dependent entirely on the agency.</p>
          <p>
            If the agency no longer cooperates and the business cannot regain control through existing
            access, use Google&apos;s ownership-request process rather than creating another profile.
          </p>
        </>
      ),
    },
    {
      heading: "Nobody knows which Google Account owns the profile",
      body: (
        <>
          <p>Start with the legitimate accounts historically used by the business.</p>
          <p>Search for the business while signed into each likely Google Account.</p>
          <p>Check for management indicators.</p>
          <p>
            If the original account appears to belong to the business but the login has been forgotten, use
            Google Account recovery.
          </p>
          <p>
            If Google instead shows that somebody else manages the verified profile, move to the
            ownership-request process.
          </p>
        </>
      ),
    },
    {
      heading: "The ownership request was ignored for three days",
      body: (
        <>
          <p>Open Google&apos;s confirmation email or check the ownership request.</p>
          <p>
            Google says an option to claim the profile may become available after three days without a
            response.
          </p>
          <p>Do not promise that it will.</p>
          <p>Google explicitly says that claim option is not always available.</p>
          <p>If it appears, follow the verification instructions Google provides.</p>
          <p>
            If it does not appear, continue through Google&apos;s published support process rather than
            creating a duplicate.
          </p>
        </>
      ),
    },
    {
      heading: "We regained access but cannot remove the old owner yet",
      body: (
        <>
          <p>Check when your account became an owner or manager.</p>
          <p>Google applies a seven-day limitation to some sensitive actions for newly added users.</p>
          <p>
            During that period, removing owners or managers and transferring primary ownership can produce
            an error.
          </p>
          <p>Do not assume the access recovery failed.</p>
          <p>
            Preserve control of the profile, wait for the applicable restriction to expire and then use the
            proper People and access controls.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Recover the existing profile before you create anything new</h2>
      <p>
        Losing access to a Business Profile can feel as though the business has lost control of its
        presence on Google.
      </p>
      <p>But the safest response is not to start again.</p>
      <p>Find the existing profile.</p>
      <p>Find the Google Account.</p>
      <p>Check the access role.</p>
      <p>See whether another legitimate owner can restore access.</p>
      <p>
        If somebody else owns the verified profile, use Google&apos;s ownership-request process.
      </p>
      <p>If the original business account simply cannot be opened, use account recovery.</p>
      <p>
        If Google requires verification, complete the verification Google makes available.
      </p>
      <p>
        And once access is restored, clean up the ownership structure so the problem is less likely to
        happen again.
      </p>
      <p>
        ProfileRelaunch can help identify which access situation you are dealing with, organise the
        ownership evidence and explain the appropriate Google route.
      </p>
      <p>
        We should never ask for a customer&apos;s Google password, OTP, PIN or security code.
      </p>
      <p>
        And we should not create a replacement Business Profile simply because ownership of the existing
        one is inconvenient.
      </p>
      <p>The objective is to restore legitimate control of the profile the business already has.</p>
    </>
  ),
  sourcesUsed: lostAccessToGoogleBusinessProfileSources,
}
