import {
  sourceBusinessProfileThirdPartyPolicies,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceWorkingWithThirdParties,
} from "@/lib/resource-sources/google-business-profile"
import {
  sourceFakeEngagement,
  sourceReportInappropriateReviews,
  sourceReviewRatingScams,
} from "@/lib/resource-sources/google-maps-reviews"

export const offeredToRemoveGoogleReviewsForMoneySlug = "offered-to-remove-google-reviews-for-money"

export const offeredToRemoveGoogleReviewsForMoneySources = [
  sourceReportInappropriateReviews,
  sourceBusinessProfileThirdPartyPolicies,
  sourceWorkingWithThirdParties,
  sourceProtectBusinessProfile,
  sourceOwnersManagers,
  sourceReviewRatingScams,
  sourceFakeEngagement,
]

export const offeredToRemoveGoogleReviewsForMoneyBody = {
  intro: (
    <>
      <p>
        Someone offering to help remove bad Google reviews for a fee is not automatically running a scam.
      </p>
      <p>Businesses legitimately pay agencies and specialists for professional work.</p>
      <p>
        Google itself recognises that third-party providers may charge management fees for services
        connected with Business Profile.
      </p>
      <p>The important question is what you are actually paying for.</p>
      <p>
        A responsible provider can assess reviews against Google&apos;s policies, organise evidence,
        explain the reporting process and help manage an appropriate case.
      </p>
      <p>
        A third party cannot independently force Google to remove somebody else&apos;s review simply
        because you paid them.
      </p>
      <p>Google&apos;s published removal process is policy-based.</p>
      <p>
        Only reviews that violate Google&apos;s policies are eligible for policy-based removal, and Google
        makes the decision.
      </p>
      <p>So before paying anyone, look beyond:</p>
      <p>&quot;We remove Google reviews.&quot;</p>
      <p>
        Ask what they will actually do, what they promise, what access they need, how they charge and what
        happens if Google leaves the review online.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>A paid review-removal service is not automatically illegitimate.</p>
      <p>
        Google acknowledges that third-party providers can charge businesses for professional management
        services.
      </p>
      <p>But there are important warning signs.</p>
      <p>Before paying a provider, ask:</p>
      <ul>
        <li>Which Google policy does this review allegedly violate?</li>
        <li>What exact Google process will you use?</li>
        <li>Are you reporting the review, preparing an appeal or doing something else?</li>
        <li>Are you guaranteeing removal?</li>
        <li>Are you claiming to work for Google?</li>
        <li>Are you claiming secret or privileged access to Google&apos;s review systems?</li>
        <li>What information or account access do you require?</li>
        <li>Why do you require that level of access?</li>
        <li>Will I remain the owner of my Business Profile?</li>
        <li>What exactly will I pay?</li>
        <li>Is the fee upfront, recurring or success-based?</li>
        <li>What happens if Google leaves the review live?</li>
        <li>Will you provide the scope and charges in writing?</li>
      </ul>
      <p>Do not share your Google password, one-time passcodes or verification codes.</p>
      <p>
        If a provider genuinely needs Business Profile access, use Google&apos;s owner and manager access
        controls rather than handing over your personal login credentials.
      </p>
      <p>A success-based fee is not automatically a scam.</p>
      <p>An upfront professional fee is not automatically a scam either.</p>
      <p>
        The concern is whether the provider is transparent about what it does and truthful about the fact
        that Google controls the final review-removal decision.
      </p>
    </>
  ),
  main: (
    <>
      <h2>Paying for professional help is not automatically the problem</h2>
      <p>Businesses pay third parties for many legitimate services.</p>
      <p>
        Google&apos;s own Business Profile policies recognise third-party providers such as agencies and
        SEO companies.
      </p>
      <p>Google also acknowledges that third parties may charge management fees.</p>
      <p>So:</p>
      <p>&quot;They charge money&quot;</p>
      <p>is not enough to conclude:</p>
      <p>&quot;This is a scam.&quot;</p>
      <p>The more useful question is:</p>
      <p>What professional work is the fee paying for?</p>
      <p>A legitimate fee might cover:</p>
      <ul>
        <li>policy assessment</li>
        <li>evidence organisation</li>
        <li>case preparation</li>
        <li>review monitoring</li>
        <li>reporting support</li>
        <li>appeal preparation</li>
        <li>authorised Business Profile management</li>
        <li>communication and case tracking</li>
      </ul>
      <p>You are paying for professional work.</p>
      <p>You are not purchasing authority over Google&apos;s moderation system.</p>

      <h2>Start by asking what the provider believes violates Google&apos;s policy</h2>
      <p>A credible review-removal assessment should begin with the review itself.</p>
      <p>Ask the provider:</p>
      <p>Which Google policy do you believe this review violates?</p>
      <p>They should be able to explain the issue in understandable terms.</p>
      <p>For example:</p>
      <ul>
        <li>fake engagement</li>
        <li>conflict of interest</li>
        <li>rating manipulation</li>
        <li>off-topic content</li>
        <li>prohibited personal information</li>
        <li>harassment or another prohibited-content category</li>
        <li>another relevant Google policy</li>
      </ul>
      <p>Be cautious when the entire explanation is:</p>
      <p>&quot;Don&apos;t worry. We can remove anything.&quot;</p>
      <p>A review-removal case should have a policy basis before it has a sales promise.</p>

      <h2>Ask what process they will actually use</h2>
      <p>The provider should be able to explain the work without pretending the process is secret.</p>
      <p>Ask whether they intend to:</p>
      <ul>
        <li>help you report the review</li>
        <li>organise supporting evidence</li>
        <li>monitor the Reviews Management Tool</li>
        <li>help prepare Google&apos;s available one-time appeal</li>
        <li>assess a separate extortion or scam route</li>
        <li>provide authorised Business Profile management</li>
        <li>do something else</li>
      </ul>
      <p>There may be professional know-how in assessing and presenting a case.</p>
      <p>
        That does not require pretending that Google&apos;s published policy process does not exist.
      </p>

      <h2>Nobody should sell you certainty that belongs to Google</h2>
      <p>Google decides whether a reported review violates its policies.</p>
      <p>That is the central commercial boundary.</p>
      <p>Be cautious of claims such as:</p>
      <ul>
        <li>guaranteed deletion</li>
        <li>100% removal</li>
        <li>every negative review can be removed</li>
        <li>we control Google&apos;s decision</li>
        <li>Google has already approved the removal</li>
        <li>we can override Google&apos;s policy</li>
        <li>our internal contact will delete it regardless of policy</li>
      </ul>
      <p>A provider can explain its experience or process.</p>
      <p>It can describe what it will do.</p>
      <p>It can charge according to an agreed commercial model.</p>
      <p>
        But the provider should not pretend that paying it transfers Google&apos;s moderation authority to
        the provider.
      </p>

      <h2>A success fee is not the same thing as a guaranteed outcome</h2>
      <p>This distinction matters.</p>
      <p>Some professional services charge only if a defined result is achieved.</p>
      <p>Others charge upfront for assessment or preparation.</p>
      <p>Others use a mixture of both.</p>
      <p>
        None of those fee structures is automatically proof that the service is legitimate or illegitimate.
      </p>
      <p>The real questions are:</p>
      <ul>
        <li>Is the fee clear?</li>
        <li>Is the success condition defined?</li>
        <li>Does the provider explain that Google makes the final decision?</li>
        <li>Does the provider avoid claiming that payment itself causes the removal?</li>
        <li>Are you told what happens if the review remains live?</li>
      </ul>
      <p>A commercial success fee can coexist with an honest statement:</p>
      <p>Google decides the outcome.</p>
      <p>Do not confuse the payment model with control over Google&apos;s systems.</p>

      <h2>Be very cautious of anyone claiming to be Google</h2>
      <p>
        Google warns businesses about people or companies claiming to be Google support or Google employees
        while asking for payment.
      </p>
      <p>If somebody says they work for Google, do not accept the claim merely because:</p>
      <ul>
        <li>their company name sounds official</li>
        <li>their email contains the word Google</li>
        <li>they use a Google logo</li>
        <li>they know public information about your Business Profile</li>
        <li>they mention details visible on Maps</li>
        <li>they say they are Google certified</li>
      </ul>
      <p>Google&apos;s guidance tells businesses to verify claims of Google employment carefully.</p>
      <p>
        A legitimate independent provider should be willing to describe itself as an independent third
        party.
      </p>
      <p>
        ProfileRelaunch, for example, must never imply that it is Google or that Google has authorised it
        to make moderation decisions.
      </p>

      <h2>Do not pay a supposed “Google review removal fee”</h2>
      <p>A third party may charge you for its own professional service.</p>
      <p>That is different from claiming:</p>
      <p>&quot;Google requires this payment to delete the review.&quot;</p>
      <p>Be cautious when somebody describes their private service fee as:</p>
      <ul>
        <li>a Google removal charge</li>
        <li>a Google administration fee</li>
        <li>a Google verification payment</li>
        <li>a mandatory Google support fee</li>
        <li>an internal moderation payment</li>
      </ul>
      <p>
        Google&apos;s own Business Profile guidance says Business Profile itself is provided without an
        extra charge and warns about people pretending to be Google while asking for money for Business
        Profile help.
      </p>
      <p>A legitimate third party should clearly distinguish:</p>
      <p>its fee,</p>
      <p>from Google&apos;s own service.</p>

      <h2>Never give a provider your password, OTP or verification code</h2>
      <p>
        A review-removal company does not need your personal Google Account password in order to
        demonstrate that it is legitimate.
      </p>
      <p>
        Google provides Business Profile owner and manager roles so authorised people can have appropriate
        access without sharing passwords.
      </p>
      <p>Google also explicitly warns businesses that it will never ask for One Time Passwords or PINs.</p>
      <p>Do not provide a third party with:</p>
      <ul>
        <li>your Google password</li>
        <li>one-time passcodes</li>
        <li>two-factor authentication codes</li>
        <li>verification PINs</li>
        <li>account-recovery answers</li>
        <li>backup security codes</li>
      </ul>
      <p>A provider asking for those credentials should trigger an immediate security review.</p>

      <h2>Keep control of your Business Profile</h2>
      <p>
        If a third party genuinely needs access to manage aspects of your Business Profile, use
        Google&apos;s access controls.
      </p>
      <p>Do not hand over your entire Google Account.</p>
      <p>
        Google&apos;s third-party policies say end customers should retain ownership or co-ownership of
        their Business Profile.
      </p>
      <p>Google also advises businesses to make sure they retain access when adding a third party.</p>
      <p>For review support, ask:</p>
      <p>Why does this provider need access?</p>
      <p>What role do they need?</p>
      <p>How long will they need it?</p>
      <p>Can the work be done with manager access instead?</p>
      <p>
        Do not transfer primary ownership merely because somebody says it is required to report a review.
      </p>

      <h2>Get the scope and pricing in writing</h2>
      <p>Before paying, ask for a written description of the service.</p>
      <p>It should make clear:</p>
      <ul>
        <li>which review or reviews are being assessed</li>
        <li>what work will be performed</li>
        <li>what Google process will be used</li>
        <li>what evidence you need to provide</li>
        <li>what access is required</li>
        <li>what the fee is</li>
        <li>when the fee becomes payable</li>
        <li>whether there are recurring charges</li>
        <li>whether there is a cancellation process</li>
        <li>what happens if Google refuses removal</li>
      </ul>
      <p>
        Google&apos;s third-party policies emphasise transparency and accurate information about services
        and fees.
      </p>
      <p>Vague pricing becomes more concerning when combined with pressure or unrealistic promises.</p>

      <h2>Be cautious of pressure to sign immediately</h2>
      <p>A bad review can create urgency.</p>
      <p>Some sellers use that urgency.</p>
      <p>Be cautious if somebody says:</p>
      <ul>
        <li>pay in the next hour or the review becomes permanent</li>
        <li>sign today or your profile will be suspended</li>
        <li>buy this package or more reviews will appear</li>
        <li>do not contact Google yourself</li>
        <li>do not speak to another provider</li>
        <li>transfer ownership now</li>
      </ul>
      <p>
        Google&apos;s third-party policies prohibit certain harassing, abusive and untrustworthy practices,
        including undue pressure and threats involving a Business Profile.
      </p>
      <p>Take enough time to understand the agreement.</p>

      <h2>Do not let a provider create fake positive reviews as the “solution”</h2>
      <p>A provider may say:</p>
      <p>
        &quot;We cannot remove the one-star review, but we can bury it with five-star reviews.&quot;
      </p>
      <p>That can create another Google policy problem.</p>
      <p>
        Google prohibits fake engagement and review activity that does not reflect genuine experiences.
      </p>
      <p>Do not buy:</p>
      <ul>
        <li>fabricated reviews</li>
        <li>batches of five-star ratings</li>
        <li>reviews from people who never used the business</li>
        <li>incentivised ratings designed to manipulate the score</li>
      </ul>
      <p>A legitimate review-protection service should not solve one policy problem by creating another.</p>

      <h2>Do not allow a provider to threaten reviewers on your behalf</h2>
      <p>A third party should not improve your case by harassing the person who posted the review.</p>
      <p>Do not authorise a provider to:</p>
      <ul>
        <li>threaten the reviewer</li>
        <li>expose private information</li>
        <li>impersonate somebody</li>
        <li>offer undisclosed payments for deletion</li>
        <li>provoke the reviewer</li>
        <li>submit fabricated evidence</li>
      </ul>
      <p>Professional support should improve the accuracy and organisation of the case.</p>
      <p>It should not manufacture misconduct around it.</p>

      <h2>Ask what happens when the review is policy-compliant</h2>
      <p>This is one of the best questions you can ask.</p>
      <p>Say:</p>
      <p>
        &quot;What happens if your assessment concludes that the review does not violate Google&apos;s
        policies?&quot;
      </p>
      <p>A responsible answer may be:</p>
      <p>we do not recommend pursuing paid removal,</p>
      <p>we recommend a professional response,</p>
      <p>we continue monitoring,</p>
      <p>or there is no defensible policy case at present.</p>
      <p>Be cautious if the answer is always:</p>
      <p>&quot;We can remove it anyway.&quot;</p>
      <p>
        A service that never concludes a review is compliant may not actually be performing a policy
        assessment.
      </p>

      <h2>Check the provider&apos;s identity and ordinary business details</h2>
      <p>Do basic commercial due diligence before sending money.</p>
      <p>Check information such as:</p>
      <ul>
        <li>business name</li>
        <li>website</li>
        <li>contact information</li>
        <li>written terms</li>
        <li>who you are contracting with</li>
        <li>what jurisdiction or address is shown where applicable</li>
        <li>invoicing details</li>
        <li>cancellation terms</li>
        <li>refund terms</li>
        <li>privacy information</li>
      </ul>
      <p>Do not treat a polished website or Google-looking logo as proof of authority.</p>
      <p>Likewise, do not assume a small consultancy is illegitimate merely because it is small.</p>
      <p>Look for consistency and transparency.</p>

      <h2>Unusual payment requests deserve extra caution</h2>
      <p>
        Google Maps warns users to be cautious about suspicious financial requests connected with review
        and rating scams.
      </p>
      <p>
        Requests involving gift cards, vouchers or cryptocurrency can be warning signs in scam contexts.
      </p>
      <p>The payment method alone does not prove fraud.</p>
      <p>But combine it with the wider picture.</p>
      <p>An irreversible payment request is more concerning when the same person also:</p>
      <ul>
        <li>applies extreme pressure</li>
        <li>refuses to identify the business</li>
        <li>claims to be Google</li>
        <li>guarantees removal</li>
        <li>refuses to provide written terms</li>
        <li>asks for account credentials</li>
      </ul>
      <p>Assess the entire interaction.</p>

      <h2>
        If the same person appears to control the reviews and sell the removal, stop
      </h2>
      <p>This is materially different from an independent consultant offering help.</p>
      <p>Suppose negative reviews appear and somebody then says:</p>
      <p>&quot;I control these reviews. Pay me and I will remove them.&quot;</p>
      <p>Preserve that communication.</p>
      <p>Do not pay them.</p>
      <p>
        Google has a dedicated process for negative-review extortion involving demands tied to review
        removal.
      </p>
      <p>
        Likewise, if somebody threatens to create additional reviews unless you purchase their service,
        preserve the threat.
      </p>
      <p>Do not confuse:</p>
      <p>a third party offering independent review-policy assistance,</p>
      <p>with:</p>
      <p>somebody claiming control over the harmful review activity and demanding payment.</p>

      <h2>Reporting a third-party policy problem is separate from reporting the review</h2>
      <p>
        Where a provider actually manages your Business Profile as a third party, Google&apos;s Business
        Profile third-party policies may apply to that relationship.
      </p>
      <p>Google provides a route for reporting third-party policy violations.</p>
      <p>
        That can be relevant where a Business Profile manager engages in conduct such as:
      </p>
      <ul>
        <li>misleading claims</li>
        <li>impersonation</li>
        <li>unauthorised profile changes</li>
        <li>holding profile access hostage</li>
        <li>abusive pressure</li>
        <li>phishing</li>
      </ul>
      <p>This is separate from reporting the original customer review.</p>
      <p>You may therefore have two different issues:</p>
      <p>the review itself,</p>
      <p>and the conduct of the company you hired to help manage the profile.</p>

      <h2>Use Google&apos;s normal review process as your baseline</h2>
      <p>Before paying anyone, understand the basic Google process.</p>
      <p>Policy-violating reviews can be reported through Google&apos;s review-removal process.</p>
      <p>The Reviews Management Tool shows the status.</p>
      <p>
        Where eligible and Google initially finds no policy violation, the current process provides a
        one-time appeal.
      </p>
      <p>A professional provider may help you understand and use that process more effectively.</p>
      <p>But you should know that the underlying route exists.</p>
      <p>
        That makes it much easier to recognise somebody pretending they possess a secret deletion button.
      </p>

      <h2>A provider can add value without pretending to control Google</h2>
      <p>Professional value can come from:</p>
      <ul>
        <li>diagnosing the policy issue correctly</li>
        <li>telling you when there is no strong case</li>
        <li>preserving evidence</li>
        <li>organising complex review patterns</li>
        <li>distinguishing fake engagement from genuine criticism</li>
        <li>identifying conflicts of interest</li>
        <li>preparing a clear appeal</li>
        <li>managing deadlines and records</li>
        <li>explaining what Google has decided</li>
        <li>helping you decide the next appropriate step</li>
      </ul>
      <p>Those are real services.</p>
      <p>
        They do not require a false claim that the provider owns Google&apos;s moderation decision.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google recognises that businesses may use third-party providers to help manage their Business
          Profile and says those providers may charge management fees.
        </p>
        <p>
          Google requires third parties that manage Business Profiles to be transparent about their
          services, costs and expected results and prohibits false, misleading or unrealistic claims.
        </p>
        <p>
          Google&apos;s third-party policies also require end customers to retain ownership or
          co-ownership of their Business Profile.
        </p>
        <p>
          Google says businesses can report reviews for removal, but only reviews that violate its
          policies are eligible for policy-based removal.
        </p>
        <p>
          Google warns businesses about impersonation scams involving people who claim to be Google
          support or Google employees while asking for money.
        </p>
        <p>
          Google says it will never ask businesses for One Time Passwords or PINs and advises businesses
          to retain access when a third party manages their Business Profile.
        </p>
        <p>
          Google Maps also warns about review and rating scams involving suspicious financial
          transactions.
        </p>
      </>
    ),
    sources: [
      sourceBusinessProfileThirdPartyPolicies,
      sourceReportInappropriateReviews,
      sourceProtectBusinessProfile,
    ],
  },
  interpretation: (
    <>
      <p>The question is not:</p>
      <p>&quot;Does this company charge money?&quot;</p>
      <p>The better questions are:</p>
      <p>What work are they charging for?</p>
      <p>What Google policy do they believe applies?</p>
      <p>What outcome are they promising?</p>
      <p>What account access do they require?</p>
      <p>Who retains ownership?</p>
      <p>What happens if Google says no?</p>
      <p>A trustworthy service should be able to explain the difference between:</p>
      <p>professional work it controls,</p>
      <p>and Google&apos;s moderation decision that it does not control.</p>
      <p>
        That distinction protects both the business and the credibility of legitimate review-protection
        services.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not assume every paid review-removal offer is fraudulent.</p>
      <p>Do not assume a provider is legitimate merely because it charges only after success.</p>
      <p>Do not pay somebody simply because they claim guaranteed access to Google.</p>
      <p>Do not accept a claim of Google employment or affiliation without verification.</p>
      <p>Do not share your Google password.</p>
      <p>Do not share OTPs, PINs or security codes.</p>
      <p>
        Do not transfer primary ownership merely because somebody says it is needed to report reviews.
      </p>
      <p>Do not buy fake positive reviews as a way to bury negative ones.</p>
      <p>Do not let a provider threaten or pay reviewers on your behalf.</p>
      <p>Do not accept unclear or changing fees without understanding the agreement.</p>
      <p>
        Do not confuse a provider&apos;s professional fee with a supposed mandatory Google removal charge.
      </p>
      <p>
        Pay for clearly defined professional work — not for a claim that somebody privately controls
        Google&apos;s decision.
      </p>
    </>
  ),
  checklist: {
    heading: "Paid Google review-removal service checklist",
    items: [
      "Save the provider's website, contact details and original offer.",
      "Record exactly what they promise about review removal.",
      "Ask which Google policy they believe the review violates.",
      "Ask which official Google reporting or appeal process they intend to use.",
      "Ask whether removal is guaranteed.",
      "Ask whether they claim to work for, represent or have privileged access to Google.",
      "Ask exactly what account or Business Profile access they require.",
      "Do not provide your password, OTP, PIN or backup security codes.",
      "Retain ownership of your Business Profile.",
      "Prefer appropriate Google owner or manager permissions where authorised access is actually necessary.",
      "Ask for the service scope and fees in writing.",
      "Confirm whether pricing is upfront, recurring, success-based or a combination.",
      "Confirm what happens if Google leaves the review online.",
      "Check that the provider does not propose fake positive reviews or other rating manipulation.",
      "Check that the provider does not ask you to misrepresent evidence.",
      "Preserve any threats or claims that the provider controls the negative reviews.",
      "If the same person demands money to remove reviews they claim to control, assess Google's dedicated extortion route.",
      "Where a Business Profile management provider violates Google's third-party policies, consider Google's third-party complaint route.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Assuming every paid provider is a scam.",
        body: "Google recognises legitimate third-party Business Profile services and allows third parties to charge management fees. The provider's conduct and claims matter more than the existence of a fee.",
      },
      {
        title: "Believing “no removal, no fee” means Google is guaranteed to act.",
        body: "A success-based commercial fee can be legitimate, but Google still controls the review-removal decision.",
      },
      {
        title: "Paying for a supposed Google deletion fee.",
        body: "A third party should distinguish its own professional charges from Google's Business Profile service and official review-reporting process.",
      },
      {
        title: "Sharing the Google Account password.",
        body: "Use Google's access roles where authorised management is genuinely required. Password and security-code sharing creates unnecessary account risk.",
      },
      {
        title: "Giving away primary ownership.",
        body: "Google says businesses using third parties should retain ownership or co-ownership. Review support normally should not require surrendering control of the profile.",
      },
      {
        title: "Trusting a Google-looking company name or logo.",
        body: "Branding does not establish Google affiliation. Be cautious of organisations that misrepresent themselves as Google or Google support.",
      },
      {
        title: "Accepting guaranteed removal without a policy explanation.",
        body: "Only policy-violating reviews qualify for Google's policy-based removal process. Ask what rule the provider believes actually applies.",
      },
      {
        title: "Buying positive reviews instead.",
        body: "Fake or incentivised positive reviews can create a separate fake-engagement and rating-manipulation problem.",
      },
      {
        title: "Ignoring threats because the company calls itself a reputation agency.",
        body: "Pressure, impersonation, phishing or holding Business Profile access hostage remain serious warning signs regardless of the provider's label.",
      },
      {
        title: "Assuming all review-removal offers and review extortion are the same.",
        body: "An independent professional offering policy support is different from somebody claiming control of harmful reviews and demanding payment to remove them.",
      },
    ],
  },
  scenarios: [
    {
      heading: "The company guarantees it can remove any one-star review",
      body: (
        <>
          <p>Ask them to explain the Google policy basis.</p>
          <p>Google does not make a review removable merely because it is one star.</p>
          <p>
            If the provider cannot explain what policy the review violates and relies only on a guaranteed
            outcome, treat that promise cautiously.
          </p>
          <p>Ask for the service scope and guarantee terms in writing.</p>
          <p>
            Do not assume the promise gives the company control over Google&apos;s moderation decision.
          </p>
        </>
      ),
    },
    {
      heading: "The company charges only if Google removes the review",
      body: (
        <>
          <p>That pricing model is not automatically suspicious.</p>
          <p>A success fee can be a legitimate commercial arrangement.</p>
          <p>Check the rest of the service.</p>
          <p>Ask:</p>
          <ul>
            <li>what policy analysis is performed</li>
            <li>what process is used</li>
            <li>what counts as success</li>
            <li>when payment becomes due</li>
            <li>whether there are additional fees</li>
            <li>whether the provider clearly acknowledges that Google decides removal</li>
          </ul>
          <p>
            The commercial model should not be confused with a guarantee of Google&apos;s decision.
          </p>
        </>
      ),
    },
    {
      heading: "The caller says they are from Google and wants payment",
      body: (
        <>
          <p>Do not rely on the caller&apos;s claim.</p>
          <p>Do not give them an OTP, PIN, password or security code.</p>
          <p>
            Google&apos;s Business Profile security guidance specifically warns about impersonation scams
            involving people asking for money.
          </p>
          <p>
            Use Google&apos;s official channels independently rather than links or phone numbers supplied
            by the caller.
          </p>
          <p>Preserve the communication if you believe the contact may be deceptive.</p>
        </>
      ),
    },
    {
      heading: "The provider says it needs to become primary owner",
      body: (
        <>
          <p>Ask why.</p>
          <p>
            Google&apos;s third-party policies say businesses should retain ownership or co-ownership of
            their Business Profile.
          </p>
          <p>Google also provides manager roles for authorised third parties.</p>
          <p>
            Do not surrender primary ownership merely because somebody says review reporting requires it.
          </p>
          <p>Use the minimum appropriate access needed for the legitimate work.</p>
        </>
      ),
    },
    {
      heading: "Bad reviews appeared and then someone offered to remove them for payment",
      body: (
        <>
          <p>Do not assume the timing proves the same person created the reviews.</p>
          <p>Preserve:</p>
          <ul>
            <li>the reviews</li>
            <li>the offer</li>
            <li>sender details</li>
            <li>timing</li>
            <li>messages</li>
            <li>any claim that the person controls the reviews</li>
          </ul>
          <p>
            If the person directly claims control of the harmful review activity and demands money, goods,
            services or favours for removal, Google&apos;s dedicated extortion process may be relevant.
          </p>
          <p>Do not pay simply to test whether they really control the reviews.</p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Pay for expertise — not a promise of control over Google</h2>
      <p>There are legitimate reasons to pay a specialist for Google review support.</p>
      <p>Policy analysis takes work.</p>
      <p>Evidence organisation takes work.</p>
      <p>Complex review patterns can take time to understand.</p>
      <p>Appeals and case management can benefit from experience.</p>
      <p>The warning sign is not the existence of a professional fee.</p>
      <p>
        It is a provider pretending that the fee purchases control over Google&apos;s moderation decision.
      </p>
      <p>Before paying:</p>
      <p>understand the policy case,</p>
      <p>understand the process,</p>
      <p>understand the access requested,</p>
      <p>understand the fee,</p>
      <p>and understand what happens if Google leaves the review live.</p>
      <p>Keep ownership and security credentials under your control.</p>
      <p>
        If the provider proposes fake reviews, impersonates Google, pressures you, asks for security codes
        or claims it can secretly override Google&apos;s policies, stop and reassess.
      </p>
      <p>ProfileRelaunch&apos;s own Review Protection service must follow the same standard.</p>
      <p>
        We can assess the review, organise the evidence and manage an appropriate policy-based case where
        authorised.
      </p>
      <p>We cannot guarantee Google&apos;s decision or sell access to an outcome we do not control.</p>
    </>
  ),
  sourcesUsed: offeredToRemoveGoogleReviewsForMoneySources,
}
