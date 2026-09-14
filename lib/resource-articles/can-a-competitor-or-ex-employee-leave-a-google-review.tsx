import {
  sourceFakeEngagement,
  sourceManageCustomerReviews,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
} from "@/lib/resource-sources/google-maps-reviews"

export const competitorOrExEmployeeReviewSlug = "can-a-competitor-or-ex-employee-leave-a-google-review"

export const competitorOrExEmployeeReviewSources = [
  sourceProhibitedRestrictedContent,
  sourceFakeEngagement,
  sourceMapsUgcPolicy,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
  sourceManageCustomerReviews,
]

export const competitorOrExEmployeeReviewBody = {
  intro: (
    <>
      <p>A review does not have to be completely fabricated to raise a Google policy issue.</p>
      <p>Sometimes the problem is bias.</p>
      <p>
        Google&apos;s current Maps policies say reviews and ratings should reflect genuine and unbiased
        experiences.
      </p>
      <p>Google also has specific rules around conflicts of interest.</p>
      <p>
        Its rating-manipulation guidance says a conflict of interest may include current or former
        employment, contractual or consultancy relationships, professional affiliations, personal
        affiliations and industry competitors.
      </p>
      <p>
        Google separately says people must not post content on a competitor&apos;s business to undermine
        that business&apos;s or product&apos;s reputation.
      </p>
      <p>
        That means a review from a competitor or former employee should not automatically be treated as
        an ordinary customer review.
      </p>
      <p>But the relationship still needs to be established accurately.</p>
      <p>Do not simply tell Google:</p>
      <p>&quot;This person is an ex-employee.&quot;</p>
      <p>
        Explain what the relationship was, preserve the evidence that supports it and identify the Google
        policy that genuinely applies.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>Google&apos;s policies do not allow biased review activity that involves a genuine conflict of interest.</p>
      <p>Google says a conflict of interest may include:</p>
      <ul>
        <li>current employment</li>
        <li>former employment</li>
        <li>a contractual relationship</li>
        <li>a consultancy relationship</li>
        <li>other professional affiliations</li>
        <li>personal affiliations that demonstrate a conflict</li>
        <li>industry competitors</li>
        <li>familial relationships</li>
      </ul>
      <p>
        Google also specifically prohibits posting content on a competitor&apos;s place or business to
        undermine its reputation.
      </p>
      <p>
        So if a competitor, employee or former employee has reviewed the business, the relationship can be
        highly relevant to a removal report.
      </p>
      <p>Do not automatically describe the review as fake.</p>
      <p>The better classification may be conflict of interest or rating manipulation.</p>
      <p>Before reporting:</p>
      <ul>
        <li>preserve the review</li>
        <li>establish the real relationship</li>
        <li>record why the relationship creates a conflict</li>
        <li>avoid publishing private employment information</li>
        <li>report the review against the most relevant Google policy</li>
        <li>track the report in the Reviews Management Tool</li>
      </ul>
      <p>
        If Google finds no policy violation and you disagree, Google&apos;s current process provides a
        one-time appeal for eligible reviews.
      </p>
      <p>Google still makes the final decision.</p>
    </>
  ),
  main: (
    <>
      <h2>Google&apos;s policy is about independence as well as authenticity</h2>
      <p>Fake engagement is one important review-policy issue.</p>
      <p>But it is not the only one.</p>
      <p>Google says reviews and ratings should reflect genuine and unbiased experiences.</p>
      <p>Its rating-manipulation policy separately covers reviews that are based on a conflict of interest.</p>
      <p>
        This matters because a person can be real, the account can be real and the relationship with the
        business can be real — while the review may still raise a conflict-of-interest issue.
      </p>
      <p>Do not force every suspicious review into:</p>
      <p>&quot;fake review.&quot;</p>
      <p>Use the policy that actually matches the problem.</p>

      <h2>Google specifically recognises current and former employment as potential conflicts</h2>
      <p>
        Google&apos;s current rating-manipulation guidance says a conflict of interest may include current
        or former employment.
      </p>
      <p>That wording is important.</p>
      <p>
        If the reviewer genuinely works or previously worked for the business, preserve the facts that
        establish that relationship.
      </p>
      <p>Useful information may include:</p>
      <ul>
        <li>employment dates</li>
        <li>role</li>
        <li>workplace location</li>
        <li>business email history</li>
        <li>legitimate HR records</li>
        <li>publicly available professional information</li>
        <li>other records that accurately establish the relationship</li>
      </ul>
      <p>Do not fabricate employment evidence.</p>
      <p>Do not alter records.</p>
      <p>And do not publish sensitive HR information in a public review response.</p>
      <p>The evidence is for establishing the policy issue, not for embarrassing the reviewer.</p>

      <h2>
        A former employee review is not best analysed as “we cannot find this customer”
      </h2>
      <p>
        If you already know the person was an employee, you do not need to pretend the main issue is that
        they are missing from the customer database.
      </p>
      <p>The known relationship is more useful.</p>
      <p>Ask:</p>
      <p>Is the content connected to the employment relationship?</p>
      <p>Does that relationship create the conflict Google describes?</p>
      <p>
        Is the review being used to rate the business publicly from a position that is not independent?
      </p>
      <p>
        That is a cleaner policy analysis than trying to prove the reviewer had absolutely no interaction
        with the business as a customer.
      </p>
      <p>Keep the argument truthful.</p>

      <h2>Current employees can create conflicts too</h2>
      <p>The same principle is not limited to hostile former employees.</p>
      <p>
        Google&apos;s policy also names current employment as a relationship that may demonstrate a
        conflict of interest.
      </p>
      <p>
        That means the business should not think of staff reviews as harmless simply because they are
        positive.
      </p>
      <p>Review policy should work in both directions.</p>
      <p>
        A business should not try to improve its rating by encouraging employees to post biased
        customer-style reviews.
      </p>
      <p>
        ProfileRelaunch should apply the same standard whether the conflicted review is one star or five
        stars.
      </p>

      <h2>Competitor reviews have an especially clear policy problem</h2>
      <p>Google goes further when discussing competitors.</p>
      <p>
        Its fake-engagement policy says merchants and users must not post content on a competitor&apos;s
        place or business to undermine that business&apos;s or product&apos;s reputation.
      </p>
      <p>
        Its rating-manipulation guidance also identifies industry competitors as an example of a
        relationship that may demonstrate a conflict of interest.
      </p>
      <p>
        If you can genuinely establish that the reviewer is connected to a competing business, preserve
        that relationship.
      </p>
      <p>Useful evidence may include:</p>
      <ul>
        <li>the competing business they own or work for</li>
        <li>an official company page</li>
        <li>a professional profile</li>
        <li>a business website</li>
        <li>other reliable information showing the relationship</li>
      </ul>
      <p>Do not call somebody a competitor simply because the review is hostile.</p>
      <p>Establish the relationship first.</p>

      <h2>The policy question is stronger than the motive question</h2>
      <p>
        Businesses often want to prove that the reviewer was angry, jealous or trying to take revenge.
      </p>
      <p>Motive can provide context.</p>
      <p>But it is often difficult to prove.</p>
      <p>The relationship itself may give you a clearer policy framework.</p>
      <p>Instead of building the entire report around:</p>
      <p>&quot;They hate us.&quot;</p>
      <p>focus on factual questions:</p>
      <ul>
        <li>Is this person a current or former employee?</li>
        <li>Are they connected to a competing business?</li>
        <li>Is there another professional relationship?</li>
        <li>Does the relationship create the conflict described in Google&apos;s policy?</li>
        <li>
          Is there evidence that the contribution is intended to manipulate the business&apos;s rating?
        </li>
      </ul>
      <p>Facts are easier to support than assumptions about someone&apos;s private motivation.</p>

      <h2>A competitor can still be a real person with a real Google account</h2>
      <p>Do not confuse conflict of interest with identity fraud.</p>
      <p>The reviewer may use their real name.</p>
      <p>Their profile may have years of contribution history.</p>
      <p>They may even have genuinely visited the business.</p>
      <p>None of those facts automatically removes the conflict-of-interest question.</p>
      <p>
        Likewise, the existence of a competitor relationship does not justify making unrelated accusations
        about fake identities or multiple accounts.
      </p>
      <p>Classify only what the evidence supports.</p>

      <h2>A former employee may also have interacted with the business as a customer</h2>
      <p>Real situations can be messy.</p>
      <p>A former employee might later buy a product.</p>
      <p>A contractor might also use the business&apos;s services personally.</p>
      <p>A competitor might have visited the premises.</p>
      <p>Do not hide those facts if they are relevant.</p>
      <p>
        Google&apos;s policy still allows you to explain the professional relationship and potential
        conflict accurately.
      </p>
      <p>The useful question is not:</p>
      <p>&quot;Can we prove this person never interacted with us?&quot;</p>
      <p>It is:</p>
      <p>
        &quot;What relationship exists, and why is that relationship relevant under Google&apos;s
        conflict-of-interest rules?&quot;
      </p>
      <p>Let Google make the final policy assessment.</p>

      <h2>Family, contractual and professional relationships can also matter</h2>
      <p>Google&apos;s examples are broader than employees and competitors.</p>
      <p>Its current guidance says conflicts may include:</p>
      <ul>
        <li>contractual relationships</li>
        <li>consultancy relationships</li>
        <li>professional affiliations</li>
        <li>personal affiliations</li>
        <li>familial relationships</li>
      </ul>
      <p>So the same evidence-based approach applies when the reviewer is:</p>
      <ul>
        <li>a contractor</li>
        <li>consultant</li>
        <li>supplier</li>
        <li>business partner</li>
        <li>close relative of somebody involved</li>
        <li>professionally connected to a competing organisation</li>
      </ul>
      <p>Do not assume every acquaintance creates a policy violation.</p>
      <p>The relationship should genuinely demonstrate a conflict.</p>

      <h2>Preserve the review before you investigate the relationship</h2>
      <p>Save the review first.</p>
      <p>Keep:</p>
      <ul>
        <li>direct review link</li>
        <li>reviewer display name</li>
        <li>rating</li>
        <li>review text</li>
        <li>date shown</li>
        <li>screenshots</li>
      </ul>
      <p>
        Then investigate the relationship using information the business legitimately holds or information
        that is lawfully available.
      </p>
      <p>Do not alter the review evidence.</p>
      <p>Do not create a new narrative around the reviewer after the fact.</p>
      <p>Keep:</p>
      <p>review evidence,</p>
      <p>and relationship evidence,</p>
      <p>as separate parts of the case.</p>

      <h2>Build a simple relationship evidence record</h2>
      <p>For your own case file, write down:</p>
      <ul>
        <li>who the reviewer is</li>
        <li>how you know</li>
        <li>what relationship they have or had with the business</li>
        <li>when that relationship existed</li>
        <li>what reliable evidence establishes it</li>
        <li>whether the reviewer is connected to a competitor</li>
        <li>whether the review content appears connected to that relationship</li>
      </ul>
      <p>Keep the explanation factual.</p>
      <p>For example:</p>
      <p>&quot;This reviewer worked for the business between these dates.&quot;</p>
      <p>is stronger than:</p>
      <p>&quot;This is a bitter person trying to destroy us.&quot;</p>
      <p>The first statement can potentially be evidenced.</p>
      <p>The second is largely a conclusion about motive.</p>

      <h2>Do not publish private employment information in your public response</h2>
      <p>A removal report and a public review reply have different purposes.</p>
      <p>You may hold legitimate records that establish former employment.</p>
      <p>That does not mean those records should be exposed publicly.</p>
      <p>Do not reply with:</p>
      <ul>
        <li>salary details</li>
        <li>disciplinary information</li>
        <li>home addresses</li>
        <li>private phone numbers</li>
        <li>medical information</li>
        <li>confidential HR correspondence</li>
        <li>other sensitive personal information</li>
      </ul>
      <p>
        If you choose to reply publicly while the report is being assessed, keep the response professional
        and minimal.
      </p>
      <p>
        Use private supporting evidence only through an appropriate process where it is genuinely required
        and lawful to do so.
      </p>

      <h2>Do not ask colleagues to retaliate with positive reviews</h2>
      <p>
        A hostile employee or competitor review can create an understandable desire to rebalance the
        rating.
      </p>
      <p>Do not respond by asking staff, friends or connected people to post positive reviews.</p>
      <p>That risks creating more conflicted or manipulated review activity.</p>
      <p>Google&apos;s policies prohibit rating manipulation and incentivised or biased contributions.</p>
      <p>The correct response to one suspected conflict is not to create several more.</p>

      <h2>Report the review against the actual policy issue</h2>
      <p>Google tells businesses to report reviews that violate its policies.</p>
      <p>When the relationship is the key problem, focus on the conflict.</p>
      <p>Describe:</p>
      <ul>
        <li>the review</li>
        <li>the established relationship</li>
        <li>the relevant dates or context</li>
        <li>why the relationship falls within Google&apos;s conflict-of-interest guidance</li>
      </ul>
      <p>
        Do not add unsupported claims merely because you think a more dramatic report will be taken more
        seriously.
      </p>
      <p>If the reviewer is genuinely connected to a competitor, say so and support it.</p>
      <p>If they are a former employee, say that accurately.</p>
      <p>Keep the case narrow.</p>

      <h2>Track the decision instead of repeatedly reporting the review</h2>
      <p>After reporting the review, use Google&apos;s Reviews Management Tool to check its status.</p>
      <p>Google currently uses statuses including:</p>
      <ul>
        <li>Decision pending</li>
        <li>Report reviewed - no policy violation</li>
        <li>Escalated - check your email for updates</li>
      </ul>
      <p>Do not submit the same report repeatedly because the first decision has not arrived yet.</p>
      <p>Keep your original relationship evidence organised while Google assesses the review.</p>

      <h2>If Google finds no violation, consider the one-time appeal</h2>
      <p>
        Google currently provides a one-time appeal for eligible reviews where the original report was
        assessed as not violating policy.
      </p>
      <p>Use that appeal to make the conflict clearer.</p>
      <p>Explain:</p>
      <ul>
        <li>who the reviewer is</li>
        <li>the relationship</li>
        <li>which Google conflict-of-interest rule applies</li>
        <li>what evidence supports that relationship</li>
      </ul>
      <p>Do not use most of the appeal explaining how much commercial damage the review has caused.</p>
      <p>The removal question remains policy-based.</p>

      <h2>Reporting the user profile is a separate decision</h2>
      <p>
        Google also allows user profiles to be reported where the profile contributes false information,
        offensive material or other content that violates policy.
      </p>
      <p>
        Do not automatically report a person&apos;s entire profile simply because one review concerns your
        business.
      </p>
      <p>
        Google specifically says not to report users merely because you dislike their contributions when
        the content remains relevant and policy-compliant.
      </p>
      <p>
        Use the profile-reporting process when there is a genuine profile-level or repeated
        contribution-policy problem.
      </p>

      <h2>A genuine independent customer complaint is different</h2>
      <p>The conflict-of-interest policy should not become a shortcut for removing ordinary customer criticism.</p>
      <p>
        If the person has no relevant employment, professional, competitor or personal conflict and the
        review represents a genuine customer experience, the fact that the business dislikes the review is
        not enough.
      </p>
      <p>Google says it does not get involved in ordinary conflicts between businesses and customers.</p>
      <p>
        The purpose of this policy is to identify biased or conflicted participation — not to prevent
        legitimate customers from criticising a business.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>Google says Maps reviews and ratings should reflect genuine and unbiased experiences.</p>
        <p>Its rating-manipulation policy says content based on a conflict of interest is not allowed.</p>
        <p>
          Google says a conflict of interest may include current or former employment, contractual or
          consultancy relationships, other professional affiliations, personal affiliations, industry
          competitors and familial relationships.
        </p>
        <p>
          Google separately says merchants and users must not post content on a competitor&apos;s place or
          business to undermine that business&apos;s or product&apos;s reputation.
        </p>
        <p>
          Businesses can report reviews that violate Google&apos;s policies through the normal
          review-reporting process.
        </p>
        <p>Google also says not to report a review simply because you disagree with it or dislike it.</p>
        <p>
          If a reported review is assessed as having no policy violation, Google&apos;s current process
          provides a one-time appeal for eligible reviews.
        </p>
        <p>Google makes the final removal decision.</p>
      </>
    ),
    sources: [sourceProhibitedRestrictedContent, sourceReportInappropriateReviews],
  },
  interpretation: (
    <>
      <p>When you know the reviewer has a relationship with the business, start with that relationship.</p>
      <p>Do not automatically ask:</p>
      <p>&quot;How do we prove this person was never a customer?&quot;</p>
      <p>Ask:</p>
      <p>&quot;What relationship do they have with the business, and does Google&apos;s conflict-of-interest policy apply?&quot;</p>
      <p>A strong case has three parts.</p>
      <p>First:</p>
      <p>the review itself.</p>
      <p>Second:</p>
      <p>reliable evidence of the employment, competitor or other professional relationship.</p>
      <p>Third:</p>
      <p>a clear explanation of why that relationship is relevant to Google&apos;s published policy.</p>
      <p>That is more defensible than guessing motive or labelling the account fake.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not call somebody a competitor without evidence.</p>
      <p>Do not claim somebody was never a customer simply because they are a former employee.</p>
      <p>Do not call a genuine account fake merely because the reviewer has a conflict of interest.</p>
      <p>Do not publish confidential employment records in a public review reply.</p>
      <p>Do not accuse the reviewer publicly of revenge or criminal conduct without evidence.</p>
      <p>Do not ask employees, friends or connected people to post positive reviews in retaliation.</p>
      <p>Do not repeatedly report the same review while Google&apos;s decision is pending.</p>
      <p>
        Do not assume every person who once had some connection with the business automatically creates a
        removable review.
      </p>
      <p>
        Establish the real relationship and connect it carefully to Google&apos;s actual conflict-of-interest
        policy.
      </p>
    </>
  ),
  checklist: {
    heading: "Competitor or former-employee review assessment checklist",
    items: [
      "Save the direct review link, reviewer name, rating, text and date shown.",
      "Identify exactly who you believe the reviewer is.",
      "Record how you established that identity.",
      "Determine whether the person is a current employee, former employee, competitor, contractor, consultant or otherwise professionally connected.",
      "Record the dates and nature of that relationship where they are relevant.",
      "Preserve legitimate evidence that establishes the relationship.",
      "If the person is connected to a competitor, record reliable evidence of that connection.",
      "Separate the conflict-of-interest issue from any separate fake-engagement allegation.",
      "Check whether the review appears to arise from the employment, competitor or professional relationship.",
      "Avoid exposing private HR, customer or personal information publicly.",
      "Report the review using the Google policy reason that best describes the actual conflict.",
      "Save the report date and check its status in the Reviews Management Tool.",
      "If Google finds no policy violation, decide whether the one-time appeal has a stronger factual explanation of the conflict.",
      "Report the wider reviewer profile only where there is a genuine profile-level or repeated policy issue.",
      "Do not create positive conflicted reviews to counterbalance the negative one.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Calling the review fake when the real issue is conflict of interest.",
        body: "A real person using a real account can still have a relationship that makes the review biased under Google's policies.",
      },
      {
        title: "Saying “former employee” without evidence.",
        body: "Preserve reliable information that establishes the employment relationship rather than relying only on an unsupported assertion.",
      },
      {
        title: "Calling every hostile reviewer a competitor.",
        body: "A competitor relationship can be highly relevant, but it should be genuinely established before you report it as fact.",
      },
      {
        title: "Trying to prove the former employee was never a customer.",
        body: "Where a genuine employment relationship already exists, conflict of interest may be the more accurate policy issue. Do not distort the case merely to call it fake engagement.",
      },
      {
        title: "Publishing HR evidence in the review reply.",
        body: "Private evidence used to establish a relationship does not belong automatically in a public response.",
      },
      {
        title: "Focusing entirely on revenge.",
        body: "Private motive can be difficult to prove. The documented relationship and Google's conflict rules are usually a clearer starting point.",
      },
      {
        title: "Assuming every past relationship guarantees removal.",
        body: "Google makes the policy decision. Present the actual relationship and evidence without promising the outcome.",
      },
      {
        title: "Asking staff to post positive reviews in response.",
        body: "Creating more biased or conflicted reviews is not an appropriate way to counter a suspected conflict-of-interest review.",
      },
      {
        title: "Reporting the entire user profile automatically.",
        body: "Google's user-profile report is for policy-violating profile or contribution activity, not simply because one reviewer posted content the business dislikes.",
      },
    ],
  },
  scenarios: [
    {
      heading: "A former employee left a one-star review about working here",
      body: (
        <>
          <p>Preserve the review and establish the employment relationship.</p>
          <p>
            Google&apos;s conflict-of-interest guidance specifically identifies current or former
            employment as a relationship that may demonstrate a conflict.
          </p>
          <p>Do not try to reframe the review as an unidentified fake customer.</p>
          <p>The employment relationship is the important fact.</p>
          <p>
            Report the review using the most relevant conflict or rating-manipulation policy and keep the
            supporting employment evidence private rather than publishing it in the review reply.
          </p>
        </>
      ),
    },
    {
      heading: "A former employee also bought something from us as a customer",
      body: (
        <>
          <p>Do not hide that fact.</p>
          <p>
            The person may have had a genuine customer interaction while also having a former-employment
            relationship with the business.
          </p>
          <p>Preserve the real context.</p>
          <p>
            Explain the established relationship accurately and let Google assess whether the contribution
            falls within its conflict-of-interest policy.
          </p>
          <p>Do not claim the customer interaction never happened if it did.</p>
        </>
      ),
    },
    {
      heading: "The owner of a competing business reviewed us",
      body: (
        <>
          <p>Establish the competitor relationship first.</p>
          <p>
            Google specifically prohibits posting content on a competitor&apos;s business to undermine its
            reputation and also lists industry competitors as a potential conflict of interest.
          </p>
          <p>Preserve reliable evidence connecting the reviewer to the competing business.</p>
          <p>Then report the review against the relevant policy.</p>
          <p>
            Do not add unsupported accusations about fake accounts or coordinated activity unless separate
            evidence exists.
          </p>
        </>
      ),
    },
    {
      heading: "A relative of a former employee posted the review",
      body: (
        <>
          <p>Do not assume the relationship automatically proves a violation.</p>
          <p>Google&apos;s conflict examples can include personal and familial relationships.</p>
          <p>Establish the relationship accurately.</p>
          <p>
            Then consider whether the available facts show a genuine conflict and whether the contribution
            appears connected to that relationship.
          </p>
          <p>If the relationship itself is uncertain, do not present it to Google as proven.</p>
        </>
      ),
    },
    {
      heading: "We suspect the reviewer works for a competitor but cannot prove it",
      body: (
        <>
          <p>Treat that as suspicion.</p>
          <p>Do not state:</p>
          <p>&quot;This is a competitor review.&quot;</p>
          <p>Preserve the review and investigate using legitimate information available to the business.</p>
          <p>
            If you cannot establish the relationship, assess the review against any other Google policy
            that the actual content may violate.
          </p>
          <p>
            If no defensible policy issue can be supported, recognise that before submitting stronger
            accusations.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Prove the relationship before you argue the conflict</h2>
      <p>
        Competitor and former-employee reviews are not best handled by guessing whether an account looks
        fake.
      </p>
      <p>Google has a specific policy concept for this situation:</p>
      <p>conflict of interest.</p>
      <p>Start there.</p>
      <p>Preserve the review.</p>
      <p>Establish the real relationship.</p>
      <p>Keep private evidence private.</p>
      <p>Then explain the conflict using Google&apos;s published rules.</p>
      <p>Sometimes the relationship will be clear.</p>
      <p>
        Sometimes the reviewer may have both a professional connection and a genuine customer interaction.
      </p>
      <p>And sometimes the suspected connection will not be strong enough to establish at all.</p>
      <p>
        ProfileRelaunch can help review the contribution, organise the relationship evidence and identify
        the strongest appropriate Google policy and reporting route.
      </p>
      <p>We cannot guarantee that Google will remove the review.</p>
      <p>
        The aim is to present the relationship accurately and give Google a policy-based reason to assess
        it — without inventing a fake-customer story that the evidence does not support.
      </p>
    </>
  ),
  sourcesUsed: competitorOrExEmployeeReviewSources,
}
