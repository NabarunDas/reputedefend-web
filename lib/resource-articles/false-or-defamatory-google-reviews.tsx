import {
  sourceLegalRemovals,
  sourceManageCustomerReviews,
  sourceMapsPrivacy,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
} from "@/lib/resource-sources/google-maps-reviews"

export const falseOrDefamatoryGoogleReviewsSlug = "false-or-defamatory-google-reviews"

export const falseOrDefamatoryGoogleReviewsSources = [
  sourceProhibitedRestrictedContent,
  sourceMapsUgcPolicy,
  sourceReportInappropriateReviews,
  sourceLegalRemovals,
  sourceMapsPrivacy,
  sourceReportUserProfiles,
  sourceManageCustomerReviews,
]

export const falseOrDefamatoryGoogleReviewsBody = {
  intro: (
    <>
      <p>
        A review can feel completely false to the business and still require careful classification before
        you report it.
      </p>
      <p>Businesses often use words such as:</p>
      <p>fake,</p>
      <p>false,</p>
      <p>defamatory,</p>
      <p>malicious,</p>
      <p>fraudulent,</p>
      <p>or illegal</p>
      <p>as though they all mean the same thing.</p>
      <p>They do not.</p>
      <p>
        Google has content policies that govern what may appear on Google Maps.
      </p>
      <p>Those policies can address issues such as:</p>
      <p>fake engagement,</p>
      <p>misrepresentation,</p>
      <p>certain unsubstantiated allegations,</p>
      <p>harassment,</p>
      <p>personal information,</p>
      <p>off-topic content,</p>
      <p>and other prohibited contributions.</p>
      <p>
        Separately, Google provides a legal-removal process for content that someone believes violates
        applicable law.
      </p>
      <p>Those are different questions.</p>
      <p>A Google policy report asks:</p>
      <p>Does this contribution violate Google&apos;s published content rules?</p>
      <p>A legal allegation asks a different question:</p>
      <p>
        Does this content violate the law that applies in the relevant jurisdiction?
      </p>
      <p>ProfileRelaunch can help with the Google policy analysis.</p>
      <p>We cannot decide whether a statement is legally defamatory.</p>
      <p>
        Start by preserving the exact review and identifying what is actually wrong with it.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>If you believe a Google review is false or defamatory:</p>
      <ul>
        <li>preserve the direct review link</li>
        <li>save the complete text, rating, reviewer name and date shown</li>
        <li>separate statements of fact from opinion or criticism</li>
        <li>identify whether the reviewer appears to describe a genuine experience</li>
        <li>
          do not assume that a name missing from your CRM proves there was no experience
        </li>
        <li>check whether the review contains a specific Google policy issue</li>
        <li>
          fake engagement may apply where the contribution is not based on a genuine experience
        </li>
        <li>
          Google&apos;s misrepresentation policy can apply to certain false or misleading accounts of a
          good or service
        </li>
        <li>
          Google&apos;s offensive-content rules prohibit certain unsubstantiated allegations of unethical
          behaviour or criminal wrongdoing
        </li>
        <li>
          harassment, doxxing and prohibited personal information have their own policy rules
        </li>
        <li>
          report the review through Google&apos;s normal review-removal process when a content-policy
          violation genuinely applies
        </li>
        <li>
          use the one-time appeal carefully if Google initially finds no policy violation
        </li>
        <li>do not call the reviewer a criminal or liar publicly</li>
        <li>do not expose private customer records to prove your case</li>
        <li>
          if there is a genuine legal question, Google&apos;s legal-removal process is separate from
          ordinary review policy reporting
        </li>
        <li>seek appropriate independent legal advice where you need a legal opinion</li>
      </ul>
      <p>
        Google may leave a review live even when the business strongly disputes what it says.
      </p>
      <p>Policy disagreement and legal defamation are not the same decision.</p>
    </>
  ),
  main: (
    <>
      <h2>“False”, “fake” and “defamatory” are not interchangeable</h2>
      <p>
        A fake review normally raises a question about whether the contribution is based on a genuine
        experience or whether engagement has been manipulated.
      </p>
      <p>A false statement can arise inside a real customer dispute.</p>
      <p>
        A defamatory statement is a legal characterisation that depends on applicable law.
      </p>
      <p>Do not automatically convert:</p>
      <p>“This statement is wrong”</p>
      <p>into:</p>
      <p>“This account is fake.”</p>
      <p>And do not automatically convert:</p>
      <p>“This review is damaging”</p>
      <p>into:</p>
      <p>“This review is legally defamatory.”</p>
      <p>Classify the actual issue first.</p>

      <h2>Google&apos;s first question is whether its content policies are violated</h2>
      <p>
        Google says only reviews that violate its policies are eligible for policy-based removal.
      </p>
      <p>
        That means the normal review-reporting process is not a general truth tribunal for every
        disagreement between a customer and a business.
      </p>
      <p>
        Google specifically tells businesses not to report reviews merely because they disagree with them
        or dislike them.
      </p>
      <p>
        A negative review can remain live when it reflects a genuine experience and stays within
        Google&apos;s rules.
      </p>
      <p>Focus on the specific policy problem.</p>

      <h2>Fake engagement is about genuine experience and manipulation</h2>
      <p>Google says Maps contributions should reflect a genuine experience.</p>
      <p>
        Fake engagement can include content that is not based on a real experience or does not accurately
        represent the place or product in question.
      </p>
      <p>That can be relevant where the evidence genuinely suggests:</p>
      <ul>
        <li>the reviewer did not have the claimed experience</li>
        <li>the contribution was fabricated</li>
        <li>multiple accounts were used to simulate genuine engagement</li>
        <li>reviews were bought or incentivised</li>
        <li>another fake-engagement pattern exists</li>
      </ul>
      <p>But:</p>
      <p>“We cannot find this name”</p>
      <p>is not automatically proof.</p>
      <p>The customer may have:</p>
      <ul>
        <li>used another name</li>
        <li>booked through somebody else</li>
        <li>visited with another customer</li>
        <li>used a company account</li>
        <li>interacted with staff without appearing in the record you checked</li>
      </ul>
      <p>Treat missing records as evidence to investigate, not a verdict.</p>

      <h2>A real customer can still make a false or misleading claim</h2>
      <p>
        The reviewer&apos;s identity and the accuracy of the review are separate questions.
      </p>
      <p>
        A real customer may make a statement the business believes is factually wrong.
      </p>
      <p>For example:</p>
      <p>“They never delivered the product.”</p>
      <p>when the business has delivery records.</p>
      <p>
        That does not automatically turn the entire account into fake engagement.
      </p>
      <p>Look at the relevant Google policy.</p>
      <p>
        Google&apos;s misrepresentation rules prohibit certain false or misleading accounts of the
        description or quality of a good or service.
      </p>
      <p>
        Preserve objective evidence that genuinely addresses the disputed statement.
      </p>

      <h2>Not every factual disagreement becomes a removable misrepresentation</h2>
      <p>Customer disputes often contain competing accounts.</p>
      <p>The customer may say:</p>
      <p>“The room was dirty.”</p>
      <p>The business may say:</p>
      <p>“Our inspection found it clean.”</p>
      <p>The customer may say:</p>
      <p>“The staff were rude.”</p>
      <p>The business may say:</p>
      <p>“Our staff were professional.”</p>
      <p>
        Those disagreements do not automatically establish a removable policy violation.
      </p>
      <p>Some statements involve subjective judgement.</p>
      <p>Some involve incomplete recollection.</p>
      <p>Some involve genuinely disputed facts.</p>
      <p>
        Do not promise removal simply because the business has another version of events.
      </p>

      <h2>Opinion and factual allegation should be separated</h2>
      <p>A review can contain both.</p>
      <p>For example:</p>
      <p>“I hated the service.”</p>
      <p>is different from:</p>
      <p>“They charged my card twice.”</p>
      <p>
        The first is primarily an expression of opinion about the experience.
      </p>
      <p>
        The second is a specific factual allegation that may potentially be checked against records.
      </p>
      <p>Another example:</p>
      <p>“This company is terrible.”</p>
      <p>is different from:</p>
      <p>“This company stole £500 from me.”</p>
      <p>
        Analyse the exact wording rather than labelling the entire review with one word.
      </p>

      <h2>Unsubstantiated allegations of criminal wrongdoing can raise a Google policy issue</h2>
      <p>
        Google&apos;s prohibited-content guidance includes rules against certain offensive content.
      </p>
      <p>
        Its examples include unsubstantiated allegations of unethical behaviour or criminal wrongdoing.
      </p>
      <p>
        That can be relevant where a review states or strongly alleges conduct such as:
      </p>
      <ul>
        <li>theft</li>
        <li>fraud</li>
        <li>criminal activity</li>
        <li>serious unethical conduct</li>
      </ul>
      <p>without support.</p>
      <p>
        Do not automatically conclude that every allegation qualifies.
      </p>
      <p>Preserve the wording.</p>
      <p>Preserve the factual records you legitimately hold.</p>
      <p>
        Then report the actual content against the relevant Google policy where the case is defensible.
      </p>

      <h2>Do not make a criminal accusation in return</h2>
      <p>A business should not answer:</p>
      <p>“You are committing fraud by posting this review.”</p>
      <p>or:</p>
      <p>“This reviewer is a criminal.”</p>
      <p>merely because the review contains a serious allegation.</p>
      <p>
        That can escalate the dispute and create another unsupported public claim.
      </p>
      <p>Keep the policy report factual.</p>
      <p>
        If genuinely serious legal or criminal issues exist outside the Google review process, obtain
        appropriate independent advice.
      </p>

      <h2>Harassment is a separate policy category</h2>
      <p>A review can also cross from criticism into prohibited harassment.</p>
      <p>
        Google&apos;s policies prohibit certain content that harasses people or businesses, including
        specific threats of harm and doxxing.
      </p>
      <p>If the review contains:</p>
      <ul>
        <li>threats</li>
        <li>targeted harassment</li>
        <li>doxxing</li>
        <li>unwanted sexualisation</li>
        <li>another harassment-policy issue</li>
      </ul>
      <p>preserve that content exactly.</p>
      <p>
        Report the harassment issue rather than simply describing the review as false.
      </p>

      <h2>Personal information can create a separate removal issue</h2>
      <p>A review may expose information that should not be published.</p>
      <p>
        Google&apos;s policies restrict certain personal information posted without consent.
      </p>
      <p>
        Examples can include sensitive personally identifiable, financial, medical or other personal
        information.
      </p>
      <p>Do not repeat that private material in your own public reply.</p>
      <p>Preserve the evidence privately and report the relevant content.</p>
      <p>
        The privacy issue can exist independently from whether the reviewer&apos;s broader complaint is
        true or false.
      </p>

      <h2>A review can contain one prohibited part and other ordinary criticism</h2>
      <p>
        Do not assume that every sentence must be false before you can identify a policy problem.
      </p>
      <p>A review may contain:</p>
      <ul>
        <li>ordinary criticism</li>
        <li>a genuine customer experience</li>
        <li>one prohibited allegation</li>
        <li>exposed personal information</li>
        <li>harassment</li>
        <li>another policy issue</li>
      </ul>
      <p>
        Google says it generally removes complete user-generated posts when one part violates policy.
      </p>
      <p>Your job is still to identify the specific violation accurately.</p>
      <p>Do not exaggerate the rest of the review.</p>

      <h2>Preserve the original review before building the case</h2>
      <p>Save:</p>
      <ul>
        <li>direct review URL</li>
        <li>reviewer display name</li>
        <li>star rating</li>
        <li>complete text</li>
        <li>date shown</li>
        <li>screenshots</li>
      </ul>
      <p>Do this before the review is edited or deleted.</p>
      <p>
        If you later submit evidence, make sure your records refer to the version you actually preserved.
      </p>
      <p>Do not alter screenshots.</p>
      <p>Do not crop away important context.</p>

      <h2>Separate review evidence from business records</h2>
      <p>Keep the public contribution and your supporting evidence distinct.</p>
      <p>For example:</p>
      <p>Review evidence:</p>
      <ul>
        <li>review text</li>
        <li>rating</li>
        <li>date</li>
        <li>reviewer profile</li>
        <li>review URL</li>
      </ul>
      <p>Business evidence:</p>
      <ul>
        <li>order record</li>
        <li>booking</li>
        <li>invoice</li>
        <li>delivery record</li>
        <li>correspondence</li>
        <li>service notes</li>
        <li>other legitimate records</li>
      </ul>
      <p>
        This makes it easier to explain what statement is disputed and why.
      </p>
      <p>
        It also reduces the temptation to publish private customer information in your response.
      </p>

      <h2>Use records carefully when identity is uncertain</h2>
      <p>Searching your records can be useful.</p>
      <p>But avoid claims stronger than the evidence.</p>
      <p>Say:</p>
      <p>
        “We found no record matching this display name for the period reviewed.”
      </p>
      <p>when that is what you actually know.</p>
      <p>Do not automatically say:</p>
      <p>“This person has never been a customer.”</p>
      <p>
        unless the evidence genuinely supports that much stronger claim.
      </p>
      <p>
        A careful statement is more credible than absolute certainty you cannot prove.
      </p>

      <h2>Do not manufacture evidence to make the review look false</h2>
      <p>Never:</p>
      <ul>
        <li>alter invoices</li>
        <li>create fake bookings</li>
        <li>delete inconvenient correspondence</li>
        <li>edit timestamps</li>
        <li>manufacture customer records</li>
        <li>stage conversations</li>
        <li>create screenshots that did not exist</li>
        <li>ask somebody to impersonate the reviewer</li>
        <li>pretend an employee is a customer</li>
      </ul>
      <p>Policy evidence needs to be genuine.</p>
      <p>
        ProfileRelaunch should reject a case rather than strengthen it with fabricated material.
      </p>

      <h2>Use Google&apos;s normal review-reporting process for content-policy violations</h2>
      <p>
        If the review violates a Google policy, report it through the normal review-removal process.
      </p>
      <p>Choose the reason that best matches the actual issue.</p>
      <p>Then keep a record of:</p>
      <ul>
        <li>the review</li>
        <li>the report date</li>
        <li>the reason used</li>
        <li>the evidence</li>
        <li>Google&apos;s status</li>
      </ul>
      <p>
        Do not submit several contradictory reasons merely to increase the chance of removal.
      </p>

      <h2>A first rejection can have a one-time policy appeal</h2>
      <p>If Google shows:</p>
      <p>Report reviewed - no policy violation</p>
      <p>
        its current process can provide a one-time appeal for eligible reviews.
      </p>
      <p>Use that appeal to clarify the genuine content-policy issue.</p>
      <p>Do not turn the appeal into:</p>
      <p>“Google must remove this because the statement is defamatory.”</p>
      <p>
        unless you are actually using an appropriate legal route supported by appropriate advice.
      </p>
      <p>The review-policy appeal remains a Google policy assessment.</p>

      <h2>A legal-removal request is a separate process</h2>
      <p>Google says its Maps content policies apply worldwide.</p>
      <p>
        It also allows users to report content they believe violates local law.
      </p>
      <p>Those are separate bases for review.</p>
      <p>
        A content-policy report asks whether the review violates Google&apos;s product rules.
      </p>
      <p>
        A legal-removal request asks Google to assess a legal-removal claim under the applicable process.
      </p>
      <p>
        Do not use the legal route merely because the ordinary review appeal failed.
      </p>
      <p>Use it when there is a genuine legal issue.</p>

      <h2>ProfileRelaunch does not determine whether a review is legally defamatory</h2>
      <p>Defamation law varies by jurisdiction.</p>
      <p>Whether a statement is legally defamatory can depend on:</p>
      <ul>
        <li>the exact words</li>
        <li>whether they are statements of fact or opinion</li>
        <li>publication</li>
        <li>meaning</li>
        <li>evidence</li>
        <li>available defences</li>
        <li>the applicable country&apos;s law</li>
        <li>other legal factors</li>
      </ul>
      <p>That analysis is outside ProfileRelaunch&apos;s role.</p>
      <p>We can distinguish:</p>
      <p>Google policy,</p>
      <p>from:</p>
      <p>a possible legal issue.</p>
      <p>
        Where a business needs a legal conclusion, it should obtain appropriate independent legal advice.
      </p>

      <h2>A legal claim does not automatically mean Google will remove content globally</h2>
      <p>
        Google&apos;s legal-removal framework reflects the fact that legal standards can differ between
        countries and regions.
      </p>
      <p>
        Content found to violate a particular local law may be restricted according to the applicable
        legal process rather than treated identically everywhere.
      </p>
      <p>Do not promise:</p>
      <p>
        “Once a lawyer calls it defamatory, Google will remove it worldwide.”
      </p>
      <p>Google makes its own decision under its legal process.</p>

      <h2>User-profile reporting is not a second review appeal</h2>
      <p>
        Google also allows reporting of user profiles that contribute false information, offensive
        material or other policy-violating content.
      </p>
      <p>
        Use that route when there is genuinely a profile-level or wider contribution issue.
      </p>
      <p>Do not report the reviewer profile merely because:</p>
      <ul>
        <li>the review report failed</li>
        <li>the business dislikes the reviewer</li>
        <li>the review is negative</li>
        <li>you want another removal attempt</li>
      </ul>
      <p>
        Google specifically warns against reporting users merely because their contributions are disliked
        but remain relevant and policy-compliant.
      </p>

      <h2>Do not threaten legal action as a review-removal tactic</h2>
      <p>A business may need legal advice in a genuinely serious case.</p>
      <p>
        That is different from using legal threats as a reputation-management script.
      </p>
      <p>Do not automatically reply:</p>
      <p>“Delete this review or we will sue.”</p>
      <p>Do not threaten to publish private information.</p>
      <p>
        Do not send aggressive demands simply to intimidate the reviewer into deletion.
      </p>
      <p>
        Where legal correspondence is genuinely appropriate, it should be handled through the proper
        professional route.
      </p>

      <h2>If the review remains live, a professional response may be the right next step</h2>
      <p>Sometimes:</p>
      <p>the review came from a genuine customer,</p>
      <p>Google found no policy violation,</p>
      <p>the one-time appeal was unsuccessful,</p>
      <p>and no separate legal issue is being pursued.</p>
      <p>
        At that point, continuing to invent removal routes may be worse than managing the review.
      </p>
      <p>A measured response can:</p>
      <ul>
        <li>acknowledge the concern</li>
        <li>avoid admitting facts that are genuinely disputed</li>
        <li>provide limited useful context</li>
        <li>invite the customer into a private resolution channel</li>
        <li>show future customers that the business responds professionally</li>
      </ul>
      <p>Do not turn the public reply into a courtroom submission.</p>

      <h2>Sometimes the responsible recommendation is not to sell removal</h2>
      <p>This principle matters for ProfileRelaunch.</p>
      <p>If the review is:</p>
      <p>negative,</p>
      <p>damaging,</p>
      <p>and frustrating,</p>
      <p>
        but still appears to reflect a genuine experience without a defensible Google policy violation,
      </p>
      <p>we should not sell the customer false certainty.</p>
      <p>Likewise, if somebody says:</p>
      <p>“This is defamatory”</p>
      <p>
        without obtaining the legal analysis necessary to support that conclusion,
      </p>
      <p>we should not present ourselves as the legal decision-maker.</p>
      <p>
        Our role is to identify the strongest legitimate route and say when the evidence does not support
        one.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says only reviews that violate its policies are eligible for policy-based removal.
        </p>
        <p>
          Google tells businesses not to report reviews merely because they disagree with them or dislike
          them.
        </p>
        <p>
          Google&apos;s Maps policies require reviews and other contributions to comply with rules
          covering issues such as fake engagement, misrepresentation, harassment, offensive content and
          personal information.
        </p>
        <p>
          Google&apos;s policy examples prohibit certain false or misleading accounts of the description
          or quality of a good or service.
        </p>
        <p>
          Google&apos;s offensive-content guidance also includes unsubstantiated allegations of unethical
          behaviour or criminal wrongdoing.
        </p>
        <p>
          Google says Maps user-generated content can also be reported where someone believes it violates
          applicable local law.
        </p>
        <p>
          That legal-removal process is separate from Google&apos;s ordinary product-policy review
          process.
        </p>
        <p>Google makes the final decision under the process being used.</p>
      </>
    ),
    sources: [sourceProhibitedRestrictedContent, sourceReportInappropriateReviews, sourceLegalRemovals],
  },
  interpretation: (
    <>
      <p>When a review feels false, ask three separate questions.</p>
      <p>First:</p>
      <p>Was there a genuine experience?</p>
      <p>Second:</p>
      <p>Does the actual wording violate a specific Google content policy?</p>
      <p>Third:</p>
      <p>
        Is there a separate legal issue that requires independent legal analysis?
      </p>
      <p>
        Sometimes the answer to the first question leads to a fake-engagement case.
      </p>
      <p>
        Sometimes the reviewer was genuine but one allegation raises misrepresentation, offensive-content,
        privacy or harassment concerns.
      </p>
      <p>
        Sometimes Google policy does not provide a strong removal case, but the business believes there is
        a genuine legal issue.
      </p>
      <p>
        And sometimes the review is simply a negative customer account that Google is likely to leave
        live.
      </p>
      <p>Do not force all four situations into the word:</p>
      <p>fake.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not call every disputed statement fake engagement.</p>
      <p>
        Do not assume a missing CRM record proves there was no customer experience.
      </p>
      <p>
        Do not call a review legally defamatory without appropriate legal analysis.
      </p>
      <p>Do not tell Google only that the review is unfair or damaging.</p>
      <p>Do not publicly call the reviewer a liar or criminal.</p>
      <p>Do not publish private customer records to disprove the review.</p>
      <p>Do not alter screenshots or business records.</p>
      <p>Do not manufacture evidence.</p>
      <p>
        Do not use the legal-removal process merely as another ordinary review appeal.
      </p>
      <p>
        Do not report the user&apos;s whole profile merely because one review remains live.
      </p>
      <p>Do not threaten legal action simply to pressure review deletion.</p>
      <p>Identify the actual Google policy issue first.</p>
      <p>Keep legal questions separate.</p>
    </>
  ),
  checklist: {
    heading: "False or defamatory Google review assessment checklist",
    items: [
      "Save the direct review URL.",
      "Save the complete review text, rating, reviewer display name and date shown.",
      "Separate factual allegations from opinions and general criticism.",
      "Identify whether the reviewer appears to describe a genuine experience.",
      "Search legitimate business records without assuming a missing display name proves no interaction occurred.",
      "Record exactly which factual statement the business disputes.",
      "Preserve the records that genuinely support the business's account.",
      "Check whether fake engagement actually applies.",
      "Check Google's misrepresentation policy against the specific statement.",
      "Check whether the review contains an unsubstantiated allegation of unethical behaviour or criminal wrongdoing.",
      "Check for harassment, threats or doxxing.",
      "Check for prohibited personal information.",
      "Keep private customer data out of the public review response.",
      "Choose the strongest genuine Google content-policy reason.",
      "Submit the normal review report and save the submission details.",
      "If Google finds no policy violation, assess the available one-time appeal carefully.",
      "Do not change your factual story simply because the first report failed.",
      "If a genuinely separate legal question exists, keep it separate from the ordinary policy appeal.",
      "Obtain independent legal advice where you need a legal conclusion.",
      "If no defensible removal route remains, consider a concise professional response.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Calling every false-feeling review fake engagement.",
        body: "A genuine customer can make a statement the business disputes. Fake engagement and factual disagreement are not automatically the same issue.",
      },
      {
        title: "Treating “not in our CRM” as absolute proof.",
        body: "A missing display name can be useful evidence, but people can interact through another customer, booking name or account. State only what the records genuinely establish.",
      },
      {
        title: "Using “defamatory” as a Google policy category.",
        body: "Legal defamation and Google's content policies are separate questions. Identify the actual Google policy violation where one exists.",
      },
      {
        title: "Calling the reviewer a criminal publicly.",
        body: "Do not answer an unsupported allegation with another unsupported allegation. Keep the public response restrained.",
      },
      {
        title: "Uploading private customer information into a public reply.",
        body: "Supporting records may be useful privately, but customer data should not automatically be exposed to prove the business's case.",
      },
      {
        title: "Treating every exaggeration as removable misrepresentation.",
        body: "Some review language is subjective, approximate or disputed. Use the misrepresentation policy only where the actual wording and evidence support it.",
      },
      {
        title: "Using the legal route because the review appeal failed.",
        body: "A legal-removal process is for a genuine legal issue, not merely another attempt at the same unsuccessful policy report.",
      },
      {
        title: "Reporting the entire user profile automatically.",
        body: "Profile reporting requires a real profile-level or contribution-policy issue. It is not a substitute for an unsuccessful review appeal.",
      },
      {
        title: "Threatening litigation as the first review response.",
        body: "Legal questions may require proper professional advice. Threats are not a general reputation-management technique.",
      },
      {
        title: "Selling another removal attempt when there is no defensible route.",
        body: "A damaging compliant review may need to be managed rather than repeatedly reported.",
      },
    ],
  },
  scenarios: [
    {
      heading: "The customer says we never delivered the order, but we have delivery records",
      body: (
        <>
          <p>Preserve the review and the delivery records.</p>
          <p>
            Do not automatically call the account fake if the customer genuinely placed an order.
          </p>
          <p>Identify the exact disputed statement.</p>
          <p>
            Assess whether the wording creates a defensible misrepresentation issue under Google&apos;s
            policy.
          </p>
          <p>
            Keep the customer&apos;s private address, payment and order information out of the public
            reply.
          </p>
          <p>
            If you report the review, explain the policy issue accurately rather than publishing the whole
            customer file.
          </p>
        </>
      ),
    },
    {
      heading: "The reviewer says “this company stole my money”",
      body: (
        <>
          <p>Preserve the exact wording and the underlying transaction records.</p>
          <p>
            Google&apos;s prohibited-content guidance includes certain unsubstantiated allegations of
            unethical behaviour or criminal wrongdoing.
          </p>
          <p>Assess that policy carefully.</p>
          <p>Do not respond:</p>
          <p>“You are a criminal for saying this.”</p>
          <p>Do not make your own legal finding.</p>
          <p>
            If the allegation also raises a genuine legal issue for the business, obtain appropriate
            independent legal advice separately.
          </p>
        </>
      ),
    },
    {
      heading: "The review contains the owner's home address and phone number",
      body: (
        <>
          <p>
            Treat the personal-information issue separately from the broader customer dispute.
          </p>
          <p>Preserve the review.</p>
          <p>
            Report the prohibited personal information under the appropriate Google policy.
          </p>
          <p>Do not repeat the address or phone number in your public response.</p>
          <p>
            The privacy issue may provide a policy basis even if other parts of the review describe a
            genuine experience.
          </p>
        </>
      ),
    },
    {
      heading: "The customer is real but we believe they exaggerated everything",
      body: (
        <>
          <p>Do not call the review fake merely because the reviewer was dramatic.</p>
          <p>Separate:</p>
          <p>opinion,</p>
          <p>from:</p>
          <p>specific checkable factual claims.</p>
          <p>Assess each relevant statement against Google&apos;s policies.</p>
          <p>
            If no policy violation can be supported, Google may leave the negative review live.
          </p>
          <p>Consider whether a calm professional response is more appropriate.</p>
        </>
      ),
    },
    {
      heading: "Google rejected the review appeal, but we believe the statement is legally defamatory",
      body: (
        <>
          <p>Do not invent a second ordinary review appeal.</p>
          <p>
            Google&apos;s legal-removal process is separate from the Business Profile review-policy
            process.
          </p>
          <p>
            If the business genuinely believes applicable law has been violated, obtain appropriate
            independent legal advice about that issue.
          </p>
          <p>
            ProfileRelaunch can help organise the Google policy history and evidence.
          </p>
          <p>
            It cannot decide the legal defamation question or guarantee Google&apos;s legal-removal
            outcome.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Separate the policy case from the legal accusation</h2>
      <p>A review does not become removable merely because the business says:</p>
      <p>“That is false.”</p>
      <p>
        And it does not become legally defamatory merely because it is damaging.
      </p>
      <p>Start with the exact words.</p>
      <p>
        Work out whether the reviewer appears to describe a genuine experience.
      </p>
      <p>Separate opinion from checkable factual allegations.</p>
      <p>
        Then identify whether Google&apos;s actual content policies address the problem.
      </p>
      <p>Fake engagement may apply in one case.</p>
      <p>Misrepresentation may apply in another.</p>
      <p>
        Harassment, offensive content or personal-information rules may apply somewhere else.
      </p>
      <p>And sometimes no strong Google policy violation exists.</p>
      <p>
        If there is a genuine legal question, keep it separate and obtain appropriate legal advice.
      </p>
      <p>
        Do not turn legal terminology into a sales tactic or a second review appeal.
      </p>
      <p>
        ProfileRelaunch can help assess the Google policy route, preserve the evidence, prepare an
        appropriate report or one-time appeal and explain when the issue appears to fall outside ordinary
        review policy.
      </p>
      <p>
        We cannot determine whether somebody has committed defamation, provide legal advice or guarantee
        that Google will remove the review.
      </p>
      <p>
        The objective is to make the strongest truthful case available — and to recognise when the right
        next step is management rather than removal.
      </p>
    </>
  ),
  sourcesUsed: falseOrDefamatoryGoogleReviewsSources,
}
