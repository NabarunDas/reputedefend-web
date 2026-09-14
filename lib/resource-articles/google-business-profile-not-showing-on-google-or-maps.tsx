import {
  sourceDuplicateOwnershipIssues,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceFindBusiness,
  sourceFixSuspended,
  sourceLocalRanking,
  sourceRepresentBusinessGuidelines,
  sourceVerifyBusiness,
} from "@/lib/resource-sources/google-business-profile"

export const googleBusinessProfileNotShowingSlug =
  "google-business-profile-not-showing-on-google-or-maps"

export const googleBusinessProfileNotShowingSources = [
  sourceFindBusiness,
  sourceLocalRanking,
  sourceVerifyBusiness,
  sourceFixSuspended,
  sourceEligibility,
  sourceRepresentBusinessGuidelines,
  sourceEditBusinessProfile,
  sourceDuplicateOwnershipIssues,
]

export const googleBusinessProfileNotShowingBody = {
  intro: (
    <>
      <p>
        If you cannot see your Google Business Profile, do not immediately assume Google has suspended
        it.
      </p>
      <p>Several very different situations can look like:</p>
      <p>“My business has disappeared from Google.”</p>
      <p>The profile may be unverified.</p>
      <p>It may be suspended or disabled.</p>
      <p>You may be signed into the wrong Google Account.</p>
      <p>A recent edit may still be working through Google&apos;s systems.</p>
      <p>
        The profile may exist when you search the exact business name but not rank for a broad search
        such as:
      </p>
      <p>plumber near me</p>
      <p>or:</p>
      <p>accountant Leeds.</p>
      <p>
        A new business may also need time before its ranking appears in search results.
      </p>
      <p>Those situations need different fixes.</p>
      <p>The first job is not to improve the ranking.</p>
      <p>The first job is to identify what Google is actually showing.</p>
      <p>Separate:</p>
      <p>profile existence,</p>
      <p>profile verification,</p>
      <p>profile access,</p>
      <p>profile restriction,</p>
      <p>and local ranking.</p>
      <p>
        Once you know which problem you have, the next step becomes much clearer.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If your Google Business Profile does not seem to be showing:</p>
      <ul>
        <li>search the exact business name and location first</li>
        <li>check both Google Search and Google Maps</li>
        <li>sign into the Google Account that should manage the profile</li>
        <li>search “my business” while signed into that account</li>
        <li>check whether Google says you manage the profile</li>
        <li>check whether verification is still required</li>
        <li>check for any suspension, disabled-profile or restriction notice</li>
        <li>check whether you recently changed important business information</li>
        <li>
          remember that Google says some business-information changes can take up to three days to appear
          in search results
        </li>
        <li>
          remember that Google says rankings for new businesses can take up to a month to appear
        </li>
        <li>
          if the profile appears for the exact business name but not for broad searches, investigate local
          ranking rather than assuming the listing has disappeared
        </li>
        <li>
          Google says local results are mainly based on relevance, distance and prominence
        </li>
        <li>
          there is no way to request or pay Google for a better organic local ranking
        </li>
        <li>make sure the profile information is complete, accurate and compliant</li>
        <li>do not add keywords to the business name merely to force visibility</li>
        <li>do not create a duplicate profile because you cannot find the existing one</li>
        <li>
          if the profile is suspended or disabled, correct the compliance problem and use Google&apos;s
          appeal process
        </li>
        <li>
          if you cannot access the profile but it remains publicly visible, treat that as an access or
          ownership issue rather than a disappearance
        </li>
      </ul>
      <p>Diagnose the state before you try to fix it.</p>
    </>
  ),
  main: (
    <>
      <h2>First separate “not showing” from “not ranking”</h2>
      <p>These are not the same problem.</p>
      <p>
        A Business Profile may exist and be publicly visible while still not appearing for the search
        phrase you hoped to rank for.
      </p>
      <p>For example:</p>
      <p>Oakfield Plumbing</p>
      <p>may appear when somebody searches:</p>
      <p>Oakfield Plumbing Leeds</p>
      <p>but not when the same person searches:</p>
      <p>plumber near me.</p>
      <p>That does not mean the Business Profile has disappeared.</p>
      <p>It means you need to investigate local search visibility.</p>
      <p>
        Before treating the issue as suspension, verification failure or removal, check whether the
        profile can still be found directly.
      </p>

      <h2>Search the exact business name first</h2>
      <p>Start with the most specific search.</p>
      <p>Use:</p>
      <ul>
        <li>the exact business name</li>
        <li>the business name plus town or city</li>
        <li>Google Maps</li>
      </ul>
      <p>If the profile appears there, record what you find.</p>
      <p>Check:</p>
      <ul>
        <li>business name</li>
        <li>category</li>
        <li>address or service area</li>
        <li>phone number</li>
        <li>website</li>
        <li>reviews</li>
      </ul>
      <p>That gives you evidence that the public profile still exists.</p>
      <p>
        A profile that exists but does not appear for a generic search requires a different investigation
        from a profile that cannot be found at all.
      </p>

      <h2>Check Google Search and Google Maps separately</h2>
      <p>Do not rely on one search result from one screen.</p>
      <p>Check the business on:</p>
      <p>Google Search</p>
      <p>and:</p>
      <p>Google Maps.</p>
      <p>The presentation can differ.</p>
      <p>Use the correct business name and location.</p>
      <p>
        The purpose is not to run dozens of ranking tests.
      </p>
      <p>
        It is to establish whether Google still has a public Business Profile for the business.
      </p>

      <h2>Sign into the Google Account that should manage the profile</h2>
      <p>
        Google&apos;s guidance says that when you are signed into an associated Google Account, you can
        search for the business or search:
      </p>
      <p>my business</p>
      <p>to find Business Profiles you manage.</p>
      <p>Check the legitimate Google Accounts historically used by the business.</p>
      <p>
        If one account shows management controls and another does not, the problem may simply be account
        access.
      </p>
      <p>
        Do not create another profile before checking which account actually manages the existing one.
      </p>

      <h2>Management access and public visibility are different questions</h2>
      <p>You can lose management access to a profile that customers can still see.</p>
      <p>
        And you can still have management access to a profile that Google has restricted from public
        display.
      </p>
      <p>Ask separately:</p>
      <p>Can customers find the Business Profile?</p>
      <p>And:</p>
      <p>Can the business manage the Business Profile?</p>
      <p>
        If the public profile exists but the business cannot access it, use the ownership and access
        process.
      </p>
      <p>Do not describe that automatically as the listing disappearing.</p>

      <h2>Check whether the Business Profile is verified</h2>
      <p>
        Google&apos;s current guidance says only verified businesses can show their business information
        on Maps and Search.
      </p>
      <p>
        If verification is incomplete, failed or required again, resolve the verification state.
      </p>
      <p>Check the actual verification options Google provides for that profile.</p>
      <p>Do not promise a particular verification method.</p>
      <p>Google controls which methods are available.</p>

      <h2>A verification problem is not automatically a suspension</h2>
      <p>Google may ask the business to verify or re-verify information.</p>
      <p>
        That is different from Google suspending or disabling the profile for a policy issue.
      </p>
      <p>Look at the exact message.</p>
      <p>Ask:</p>
      <p>Is Google asking for verification?</p>
      <p>Or:</p>
      <p>Is Google saying the profile is suspended or disabled?</p>
      <p>Those states have different processes.</p>
      <p>
        Do not submit a suspension appeal merely because verification is incomplete.
      </p>

      <h2>Check for a suspension or disabled-profile notice</h2>
      <p>
        Google says Business Profiles that violate its guidelines can be suspended or disabled.
      </p>
      <p>
        Its “Find your business on Google” guidance says that when this happens, the profile will not show
        to other users until the issue is resolved.
      </p>
      <p>
        Google also says businesses receive a notification in the Google Account used to manage the
        profile.
      </p>
      <p>If you see a restriction:</p>
      <p>record the message,</p>
      <p>review the policy issue,</p>
      <p>correct the profile where necessary,</p>
      <p>and use Google&apos;s published appeal process.</p>

      <h2>Do not create a replacement profile while dealing with a suspension</h2>
      <p>
        Google&apos;s suspension guidance specifically warns businesses not to create a new Business
        Profile for the same business while an appeal is under review.
      </p>
      <p>A second listing can create:</p>
      <ul>
        <li>duplicate problems</li>
        <li>ownership confusion</li>
        <li>more verification work</li>
        <li>a harder recovery case</li>
      </ul>
      <p>Work on the existing legitimate profile.</p>
      <p>Do not use a duplicate as a visibility shortcut.</p>

      <h2>A new Business Profile may need time before ranking appears</h2>
      <p>
        Google&apos;s current “Find your business on Google” guidance says rankings for new businesses can
        take up to a month to appear in search results.
      </p>
      <p>That does not mean:</p>
      <p>every new business must wait exactly one month.</p>
      <p>And it does not mean:</p>
      <p>the business is guaranteed a particular ranking after one month.</p>
      <p>
        It means a brand-new profile should not automatically be diagnosed as broken because it does not
        immediately appear for competitive searches.
      </p>
      <p>Confirm verification and profile accuracy first.</p>

      <h2>Recent business-information edits can take time to affect search results</h2>
      <p>
        Google also says that when business information is edited, search-result changes can take up to
        three days to appear.
      </p>
      <p>
        Again, do not turn that into a universal promise that every visibility issue resolves within three
        days.
      </p>
      <p>The guidance applies to updates after edits.</p>
      <p>
        If the entire profile is suspended, unverified or otherwise restricted, waiting three days does not
        replace the appropriate process.
      </p>
      <p>Record what was changed and when.</p>

      <h2>Do not keep changing the profile while you are waiting for an edit</h2>
      <p>Repeatedly changing:</p>
      <ul>
        <li>name</li>
        <li>address</li>
        <li>category</li>
        <li>service area</li>
        <li>phone number</li>
        <li>website</li>
      </ul>
      <p>
        can make it difficult to understand which state Google is reviewing.
      </p>
      <p>If you submitted a legitimate accurate change:</p>
      <p>record it,</p>
      <p>allow the current process to complete,</p>
      <p>and respond to Google&apos;s actual status.</p>
      <p>
        Do not keep experimenting with different versions merely because the search result did not change
        immediately.
      </p>

      <h2>If the profile exists but not for generic searches, investigate local ranking</h2>
      <p>
        Suppose the business appears when searched by exact name but not for:
      </p>
      <p>dentist near me</p>
      <p>or:</p>
      <p>roofing company Bristol.</p>
      <p>That is primarily a local-ranking question.</p>
      <p>Google says local results are mainly based on:</p>
      <ul>
        <li>relevance</li>
        <li>distance</li>
        <li>prominence</li>
      </ul>
      <p>No single one of those factors guarantees visibility.</p>
      <p>
        And there is no published switch that forces a Business Profile into every relevant local result.
      </p>

      <h2>Relevance is about how well the profile matches the search</h2>
      <p>
        Google describes relevance as how well a Business Profile matches what someone is searching for.
      </p>
      <p>
        Complete and detailed business information can help Google understand the business.
      </p>
      <p>That includes accurate information about:</p>
      <ul>
        <li>category</li>
        <li>location</li>
        <li>hours</li>
        <li>services and other appropriate profile details</li>
      </ul>
      <p>
        Do not try to manufacture relevance by adding unsupported keywords to the business name.
      </p>
      <p>Use the proper Business Profile fields.</p>

      <h2>Distance changes what different searchers see</h2>
      <p>Google says distance is one of the main local-ranking factors.</p>
      <p>
        The result can therefore differ depending on where the searcher is located.
      </p>
      <p>A business owner searching from:</p>
      <p>home,</p>
      <p>an office,</p>
      <p>another town,</p>
      <p>or while travelling</p>
      <p>may not see exactly what a nearby customer sees.</p>
      <p>
        Do not use one manual search from one device as absolute proof that nobody can find the business.
      </p>

      <h2>Prominence also affects local visibility</h2>
      <p>Google describes prominence as how well known a business is.</p>
      <p>Its guidance says this can include information such as:</p>
      <ul>
        <li>links to the business</li>
        <li>reviews</li>
        <li>review scores</li>
        <li>other signals Google uses</li>
      </ul>
      <p>Prominence is one part of local ranking.</p>
      <p>
        Do not reduce the visibility problem to one field such as category or business name.
      </p>

      <h2>There is no way to request or pay Google for a better organic local ranking</h2>
      <p>
        Google explicitly says there is no way to request or pay for a better local ranking.
      </p>
      <p>A third party should not promise:</p>
      <p>“We can pay Google to put you first.”</p>
      <p>or:</p>
      <p>“We have an internal Google ranking switch.”</p>
      <p>
        Professional local-search work can improve profile quality and wider visibility factors.
      </p>
      <p>
        It cannot guarantee a particular organic Maps position through privileged access.
      </p>

      <h2>Complete and accurate information helps Google understand the business</h2>
      <p>
        Google says businesses with complete and accurate information are more likely to appear in
        relevant local search results.
      </p>
      <p>Review the profile for accuracy.</p>
      <p>Check:</p>
      <ul>
        <li>name</li>
        <li>category</li>
        <li>address or service area</li>
        <li>hours</li>
        <li>phone</li>
        <li>website</li>
        <li>other relevant information</li>
      </ul>
      <p>Do not interpret:</p>
      <p>“complete”</p>
      <p>as:</p>
      <p>“fill every field with as many keywords as possible.”</p>
      <p>Accuracy comes first.</p>

      <h2>Check whether the profile still follows Google&apos;s eligibility rules</h2>
      <p>Not every business is eligible for a Business Profile.</p>
      <p>
        A profile that no longer represents an eligible business can have a different problem from an
        ordinary ranking issue.
      </p>
      <p>
        Check whether the business still satisfies Google&apos;s current eligibility and representation
        rules.
      </p>
      <p>
        Do not build a ranking strategy around a profile that should not exist in its current form.
      </p>

      <h2>Policy compliance can affect whether the profile remains visible</h2>
      <p>A legitimate business can still have a non-compliant Business Profile.</p>
      <p>Potential issues can include:</p>
      <ul>
        <li>unsupported business-name additions</li>
        <li>ineligible locations</li>
        <li>virtual-office problems</li>
        <li>inaccurate categories</li>
        <li>duplicate profiles</li>
        <li>other policy violations</li>
      </ul>
      <p>
        If Google has restricted the profile, correct the underlying issue before appealing.
      </p>
      <p>
        Do not focus only on ranking while a compliance restriction remains unresolved.
      </p>

      <h2>A hidden service-area address does not mean the profile is missing</h2>
      <p>
        A service-area business that does not serve customers at its address should generally hide that
        address from public display.
      </p>
      <p>
        The profile can still appear without exposing the home or business base.
      </p>
      <p>Do not treat:</p>
      <p>“I cannot see the street address”</p>
      <p>as:</p>
      <p>“The Business Profile has disappeared.”</p>
      <p>
        Check whether the business name, service area and other public details remain visible.
      </p>

      <h2>Check for duplicate or ownership problems</h2>
      <p>Sometimes more than one profile exists for the same business.</p>
      <p>A duplicate or ownership conflict can create confusion about:</p>
      <ul>
        <li>which profile is current</li>
        <li>which account manages it</li>
        <li>which profile has the reviews</li>
        <li>which listing customers are seeing</li>
      </ul>
      <p>Use Google&apos;s duplicate and ownership processes.</p>
      <p>
        Do not create another profile simply because the situation is confusing.
      </p>

      <h2>Do not diagnose ranking from one search</h2>
      <p>Manual searching can provide clues.</p>
      <p>It is not a perfect measurement system.</p>
      <p>Local results can vary by:</p>
      <ul>
        <li>searcher&apos;s location</li>
        <li>search wording</li>
        <li>device context</li>
        <li>Google&apos;s current ranking systems</li>
        <li>other factors</li>
      </ul>
      <p>Check the profile state first.</p>
      <p>Then evaluate local visibility more broadly.</p>
      <p>
        Do not repeatedly search your own business and treat each position change as a new technical fault.
      </p>

      <h2>Do not keyword-stuff the business name to force visibility</h2>
      <p>If the profile is not ranking for:</p>
      <p>emergency plumber Leeds</p>
      <p>do not automatically rename:</p>
      <p>Oakfield Plumbing</p>
      <p>to:</p>
      <p>Oakfield Plumbing Emergency Plumber Leeds 24 Hour Boiler Repair.</p>
      <p>
        Google&apos;s naming rules require the Business Profile to reflect the real-world business name.
      </p>
      <p>
        A visibility problem should not be “fixed” by creating a new compliance problem.
      </p>

      <h2>Do not change category simply because one search did not show the profile</h2>
      <p>Category matters to relevance.</p>
      <p>But it is not a button that guarantees ranking.</p>
      <p>
        Choose the primary category that accurately describes the core business.
      </p>
      <p>Use additional categories only where they genuinely fit.</p>
      <p>
        Do not cycle categories merely to see which one produces the most attractive search result.
      </p>

      <h2>When the profile really is suspended, switch from ranking analysis to recovery</h2>
      <p>
        Once Google confirms that the profile is suspended or disabled, stop treating the issue as ordinary
        local SEO.
      </p>
      <p>Review:</p>
      <ul>
        <li>eligibility</li>
        <li>business name</li>
        <li>address or service area</li>
        <li>category</li>
        <li>ownership</li>
        <li>other Business Profile information</li>
      </ul>
      <p>Correct genuine policy problems.</p>
      <p>Prepare evidence.</p>
      <p>Then use Google&apos;s proper appeal route.</p>
      <p>Ranking work does not restore a suspended profile.</p>

      <h2>When the profile exists but you cannot manage it, switch to access recovery</h2>
      <p>
        If customers can still see the profile but nobody at the business can control it, investigate:
      </p>
      <ul>
        <li>the Google Account</li>
        <li>primary ownership</li>
        <li>owners</li>
        <li>managers</li>
        <li>former employee access</li>
        <li>former agency access</li>
      </ul>
      <p>That is an ownership/access problem.</p>
      <p>Recover control of the existing profile.</p>
      <p>
        Do not create a replacement merely because the correct Google Account is unclear.
      </p>

      <h2>
        When the profile is verified, compliant and public, the remaining issue may simply be visibility
      </h2>
      <p>If:</p>
      <ul>
        <li>the profile is verified</li>
        <li>the profile is public</li>
        <li>the business is eligible</li>
        <li>there is no suspension</li>
        <li>the information is accurate</li>
        <li>the exact business can be found</li>
      </ul>
      <p>then the problem may be ordinary local ranking.</p>
      <p>At that point, stop looking for a hidden suspension.</p>
      <p>
        Evaluate relevance, distance, prominence and the quality of the wider business presence.
      </p>
      <p>Not every low-ranking profile needs a reinstatement service.</p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says only verified businesses can show their business information on Google Maps and
          Search.
        </p>
        <p>
          Google&apos;s current guidance says rankings for new businesses can take up to a month to appear
          in search results.
        </p>
        <p>
          Google also says that after business information is edited, changes to search results can take
          up to three days to appear.
        </p>
        <p>
          If a Business Profile violates Google&apos;s guidelines and becomes suspended or disabled,
          Google says it will not show to other users until the issue is resolved.
        </p>
        <p>
          For ordinary local visibility, Google says results are mainly based on relevance, distance and
          prominence.
        </p>
        <p>
          Google says complete and accurate business information can help a profile appear in relevant
          local searches.
        </p>
        <p>
          Google also explicitly says there is no way to request or pay for a better organic local
          ranking.
        </p>
      </>
    ),
    sources: [sourceFindBusiness, sourceLocalRanking, sourceFixSuspended],
  },
  interpretation: (
    <>
      <p>Do not start with:</p>
      <p>“How do we rank higher?”</p>
      <p>Start with:</p>
      <p>“What state is the profile actually in?”</p>
      <p>There are five different questions:</p>
      <ol>
        <li>Does the public Business Profile exist?</li>
        <li>Is it verified?</li>
        <li>Can the business manage it?</li>
        <li>Has Google restricted it?</li>
        <li>If it is public and healthy, how visible is it for relevant searches?</li>
      </ol>
      <p>A business can answer:</p>
      <p>yes</p>
      <p>to some of those questions and:</p>
      <p>no</p>
      <p>to others.</p>
      <p>
        That is why “not showing on Google” needs diagnosis before action.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not assume every visibility problem is suspension.</p>
      <p>
        Do not assume a profile is missing because it does not rank for “near me”.
      </p>
      <p>Do not assume verification guarantees a particular ranking.</p>
      <p>
        Do not create a duplicate because you cannot immediately find the profile.
      </p>
      <p>Do not keyword-stuff the business name.</p>
      <p>Do not repeatedly change categories to test rankings.</p>
      <p>
        Do not repeatedly change the address or service area without a real business reason.
      </p>
      <p>Do not treat a hidden service-area address as a missing profile.</p>
      <p>Do not confuse lost management access with public disappearance.</p>
      <p>
        Do not promise a customer that waiting three days fixes every visibility issue.
      </p>
      <p>
        Do not promise that a new business will rank after exactly one month.
      </p>
      <p>Do not promise a particular Maps position.</p>
      <p>Check the actual profile state first.</p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile visibility checklist",
    items: [
      "Search the exact business name on Google.",
      "Search the exact business name plus the town or city.",
      "Search for the business in Google Maps.",
      "Record whether a public Business Profile appears.",
      "Sign into the Google Account that should manage the profile.",
      "Search “my business” while signed into that account.",
      "Check whether Google shows management controls.",
      "Check whether verification is complete.",
      "Record any verification request.",
      "Record any suspension, disabled-profile or restriction message.",
      "Check whether important business information was edited recently.",
      "Record the date of the most recent important edit.",
      "If the business is new, record when the profile was first verified.",
      "Check that the business name follows Google's real-world naming rule.",
      "Check the primary category.",
      "Check the address or service-area setup.",
      "Check business hours, phone number and website for accuracy.",
      "Check whether the business remains eligible for a Business Profile.",
      "Check for duplicate profiles.",
      "If the exact-name profile exists, test a small number of genuinely relevant generic searches.",
      "Separate ranking behaviour from suspension or verification state.",
      "Do not make repeated speculative edits while Google is reviewing a change.",
      "If suspended or disabled, correct compliance problems before appealing.",
      "If publicly visible but inaccessible to the business, use the ownership/access process.",
      "If verified, public and compliant, assess local ranking rather than reinstatement.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Assuming “not number one” means “not showing”.",
        body: "A profile can be public and healthy while ranking below other businesses for a generic search. Check exact-name visibility before diagnosing disappearance.",
      },
      {
        title: "Treating verification as a ranking guarantee.",
        body: "Verification allows the business to show information on Search and Maps, but Google still determines local ranking using multiple factors.",
      },
      {
        title: "Waiting three days for a suspension to fix itself.",
        body: "Google's up-to-three-day guidance concerns changes after business-information edits. A suspended or disabled profile requires the appropriate recovery process.",
      },
      {
        title: "Promising a new business will rank after exactly one month.",
        body: "Google says rankings for new businesses can take up to a month to appear. That is guidance about timing, not a ranking guarantee.",
      },
      {
        title: "Creating another Business Profile.",
        body: "If the legitimate profile already exists, a duplicate can create additional ownership, verification and visibility problems.",
      },
      {
        title: "Keyword-stuffing the name.",
        body: "Google's business-name rule is based on real-world identity. Adding search phrases to force relevance can create a policy problem.",
      },
      {
        title: "Changing categories repeatedly.",
        body: "Category can affect relevance, but repeated category experiments do not provide a guaranteed ranking result and can make the profile state harder to understand.",
      },
      {
        title: "Confusing hidden address with hidden profile.",
        body: "A legitimate service-area business can hide its address while the Business Profile itself remains visible.",
      },
      {
        title: "Confusing lost access with lost visibility.",
        body: "The public may still see a Business Profile that the business can no longer manage. Ownership recovery and public visibility are separate issues.",
      },
      {
        title: "Paying for a guaranteed Maps position.",
        body: "Google says there is no way to request or pay for a better organic local ranking. Third parties should not promise privileged control over Google's ranking.",
      },
    ],
  },
  scenarios: [
    {
      heading: "Our profile appears when we search our business name but not “plumber near me”",
      body: (
        <>
          <p>The Business Profile has not disappeared.</p>
          <p>You are primarily looking at a local-ranking issue.</p>
          <p>Check:</p>
          <ul>
            <li>profile accuracy</li>
            <li>primary category</li>
            <li>relevant business information</li>
            <li>where the searcher is located</li>
            <li>broader prominence signals</li>
          </ul>
          <p>
            Do not submit a suspension appeal when Google has not suspended the profile.
          </p>
          <p>
            And do not keyword-stuff the name simply to target the generic phrase.
          </p>
        </>
      ),
    },
    {
      heading: "Google says our profile needs verification",
      body: (
        <>
          <p>Treat this as a verification case first.</p>
          <p>Complete the verification method Google makes available.</p>
          <p>Do not assume:</p>
          <p>verification request = suspension.</p>
          <p>Once the business is verified, check public visibility again.</p>
          <p>
            Remember that verification itself does not guarantee a particular local-search position.
          </p>
        </>
      ),
    },
    {
      heading: "Google says the Business Profile is suspended",
      body: (
        <>
          <p>Stop treating this as ordinary ranking.</p>
          <p>Review the profile against Google&apos;s guidelines.</p>
          <p>Correct genuine compliance problems.</p>
          <p>Prepare legitimate evidence.</p>
          <p>Then use Google&apos;s suspension appeal process.</p>
          <p>
            Do not create a replacement Business Profile while the appeal is being handled.
          </p>
        </>
      ),
    },
    {
      heading: "Customers can find the profile but we cannot access it",
      body: (
        <>
          <p>This is not primarily a visibility problem.</p>
          <p>The public profile exists.</p>
          <p>Investigate:</p>
          <ul>
            <li>which Google Account owns it</li>
            <li>primary owner</li>
            <li>other owners</li>
            <li>managers</li>
            <li>former staff</li>
            <li>former agencies</li>
          </ul>
          <p>
            Use Google&apos;s ownership and access process to recover control of the existing profile.
          </p>
        </>
      ),
    },
    {
      heading: "We created and verified the profile recently but broad searches still do not show it",
      body: (
        <>
          <p>Check that the profile is genuinely verified and public.</p>
          <p>Make sure the information is accurate and complete.</p>
          <p>
            Google currently says rankings for new businesses can take up to a month to appear in search
            results.
          </p>
          <p>
            Do not interpret that as a promise of high ranking after one month.
          </p>
          <p>Avoid repeated speculative edits.</p>
          <p>
            Let the accurate profile establish itself while monitoring the actual visibility state.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Find out what “not showing” actually means before you fix it</h2>
      <p>
        A business disappearing from the search you tried can feel like an emergency.
      </p>
      <p>But the right response depends on what actually happened.</p>
      <p>The profile may need verification.</p>
      <p>It may be suspended.</p>
      <p>You may have lost access.</p>
      <p>A recent edit may still be updating.</p>
      <p>
        Or the profile may be perfectly public and simply not rank for the generic search you used.
      </p>
      <p>Those are not the same problem.</p>
      <p>Start with the exact business.</p>
      <p>Check Search.</p>
      <p>Check Maps.</p>
      <p>Check the managing Google Account.</p>
      <p>Check verification.</p>
      <p>Check for restrictions.</p>
      <p>Then separate profile health from local ranking.</p>
      <p>
        If Google has restricted the profile, fix the compliance issue and use the correct recovery
        process.
      </p>
      <p>If the profile exists but access is lost, recover ownership.</p>
      <p>
        If the profile is verified, public and compliant, treat the remaining visibility question as local
        ranking rather than a hidden suspension.
      </p>
      <p>
        ProfileRelaunch can help identify which state you are dealing with, review the profile for likely
        recovery issues and explain the strongest appropriate next step.
      </p>
      <p>
        We cannot guarantee a Maps position or sell privileged control over Google&apos;s local-ranking
        system.
      </p>
      <p>The first objective is simpler:</p>
      <p>
        work out whether the Business Profile is actually missing — or whether it is there and needs a
        different kind of help.
      </p>
    </>
  ),
  sourcesUsed: googleBusinessProfileNotShowingSources,
}
