import {
  sourceAppealRestrictions,
  sourceBusinessAddress,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceFixSuspended,
  sourceServiceAreas,
} from "@/lib/resource-sources/google-business-profile"

export const appealEvidenceChecklistSlug = "google-business-profile-appeal-evidence-checklist"

export const appealEvidenceChecklistSources = [
  sourceFixSuspended,
  sourceAppealRestrictions,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceServiceAreas,
  sourceBusinessAddress,
]

export const appealEvidenceChecklistBody = {
  intro: (
    <>
      <p>Good appeal evidence is not the same thing as a large pile of documents.</p>
      <p>
        Google gives businesses the option to add supporting evidence when appealing certain Business
        Profile restrictions. Its current guidance describes that evidence as optional, while also
        saying that submitting relevant evidence can strengthen an appeal.
      </p>
      <p>The important word is relevant.</p>
      <p>
        The purpose of an evidence pack is not to overwhelm the reviewer. It is to make the important
        facts about the business easier to verify.
      </p>
      <p>
        Google specifically gives examples such as official business registration, a business
        licence, tax certificates and business utility bills. It also tells businesses to check that
        the business name and address on submitted documents match the profile being appealed.
      </p>
      <p>
        That means the preparation work should happen before you enter Google&apos;s time-limited
        evidence step.
      </p>
      <p>
        Collect the records, compare them with the profile, identify any genuine inconsistencies and
        decide what each document actually proves before you submit the appeal.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        Google says supporting evidence for a Business Profile appeal is optional, but it highly
        recommends adding evidence where it can strengthen the appeal.
      </p>
      <p>The evidence types Google explicitly names include:</p>
      <ul>
        <li>official business registration</li>
        <li>a business licence</li>
        <li>tax certificates</li>
        <li>business utility bills</li>
      </ul>
      <p>
        Google&apos;s current help pages give examples of utilities such as electricity, phone and
        internet, with some examples varying slightly between the relevant Help pages.
      </p>
      <p>
        You do not need to assume that every business must provide every document on that list.
        Google presents them as examples of evidence that can strengthen an appeal.
      </p>
      <p>
        What matters is that the evidence genuinely relates to the business and supports the profile
        you are asking Google to restore.
      </p>
      <p>
        Google also tells businesses to check that the business name and address on submitted
        documents match the Business Profile being appealed.
      </p>
      <p>
        Prepare the evidence before beginning the appeal. Google&apos;s evidence step is time-limited
        to 60 minutes.
      </p>
      <p>A useful evidence pack should therefore answer:</p>
      <ul>
        <li>Which business does this document belong to?</li>
        <li>Which location does it support?</li>
        <li>Which profile information does it help verify?</li>
        <li>Is the information consistent with the real business?</li>
        <li>Is this document relevant to the issue being appealed?</li>
      </ul>
      <p>Do not alter genuine documents to manufacture consistency.</p>
      <p>
        If the profile and the business records do not agree, understand why before submitting the
        appeal.
      </p>
    </>
  ),
  main: (
    <>
      <h2>Start with the evidence Google actually names</h2>
      <p>
        Google&apos;s current suspension and appeal guidance names four broad types of evidence that
        can help strengthen an appeal:
      </p>
      <ul>
        <li>official business registration</li>
        <li>a business licence</li>
        <li>tax certificates</li>
        <li>utility bills for the business</li>
      </ul>
      <p>These are examples, not a statement that every business must possess or submit all four.</p>
      <p>That distinction matters.</p>
      <p>
        A sole trader, regulated company, restaurant, plumber and professional practice may hold very
        different combinations of official records.
      </p>
      <p>Do not create documents simply because an item appears in Google&apos;s examples.</p>
      <p>
        Use genuine records that actually exist for the business and that help support the facts
        relevant to the profile.
      </p>

      <h2>Build the evidence pack before you submit the appeal</h2>
      <p>Google recommends preparing documents before submitting an appeal.</p>
      <p>There is a practical reason for that.</p>
      <p>
        Google&apos;s suspension guidance says that once the evidence form is opened, it must be
        submitted within 60 minutes or the evidence will not be attached to the appeal.
      </p>
      <p>
        Its broader appeals guidance also places the evidence step immediately after the appeal and
        tells businesses to prepare their documents in advance.
      </p>
      <p>You should therefore treat the deadline conservatively.</p>
      <p>Do not begin the appeal and then start searching for:</p>
      <ul>
        <li>registration records</li>
        <li>licence documents</li>
        <li>tax certificates</li>
        <li>utility bills</li>
        <li>the correct Business Profile</li>
        <li>the correct business address</li>
        <li>or an explanation for inconsistent information</li>
      </ul>
      <p>Have the evidence pack ready first.</p>

      <h2>1. Official business registration</h2>
      <p>
        Google lists official business registration as an example of evidence that can strengthen an
        appeal.
      </p>
      <p>
        From a practical evidence perspective, registration documents can help establish that the
        business exists and identify the business details recorded by the relevant authority.
      </p>
      <p>Before using the document, compare it with the profile.</p>
      <p>Check:</p>
      <ul>
        <li>the business name shown on the document</li>
        <li>the address shown on the document, if one appears</li>
        <li>the entity the document belongs to</li>
        <li>whether it relates to the business being appealed</li>
        <li>whether you are looking at the correct location or branch</li>
      </ul>
      <p>
        Do not assume that having a registration document automatically proves every field on the
        Business Profile.
      </p>
      <p>Use it for the facts it genuinely supports.</p>

      <h2>2. Business licence</h2>
      <p>Google also lists a business licence as a possible supporting document.</p>
      <p>
        A licence may be particularly useful where the business or activity genuinely requires one
        and the document identifies the business being operated.
      </p>
      <p>Check whether the licence identifies:</p>
      <ul>
        <li>the same business</li>
        <li>the relevant location</li>
        <li>the correct licence holder</li>
        <li>and information that connects clearly to the profile</li>
      </ul>
      <p>Not every business requires a licence.</p>
      <p>
        Google&apos;s evidence guidance does not say that a business without a licence must obtain
        one merely to appeal.
      </p>
      <p>
        If your business is not required to have one, do not invent a requirement that does not
        exist.
      </p>

      <h2>3. Tax certificates</h2>
      <p>Tax certificates are another evidence type Google explicitly names.</p>
      <p>
        They may help support registered business details where those details are relevant to the
        appeal.
      </p>
      <p>Again, the existence of a tax document is not the important point by itself.</p>
      <p>Ask what the document establishes.</p>
      <p>Does it identify the business?</p>
      <p>Does it contain the relevant address?</p>
      <p>Does it relate to the entity connected with the Business Profile?</p>
      <p>
        If it supports a useful fact, include it because of that connection — not simply because it
        has an official logo or government heading.
      </p>

      <h2>4. Business utility bills</h2>
      <p>Google also identifies business utility bills as potential supporting evidence.</p>
      <p>
        Its current Help pages give examples including electricity, phone and internet bills; the
        precise utility examples vary slightly between Google&apos;s suspension and broader appeal
        pages.
      </p>
      <p>
        A utility bill can be useful because it may connect a business with an address or service.
      </p>
      <p>Before including one, check:</p>
      <ul>
        <li>whose name appears on it</li>
        <li>which address appears on it</li>
        <li>which business or location it relates to</li>
        <li>whether that information is relevant to the Business Profile being appealed</li>
      </ul>
      <p>
        Google specifically advises checking that the business name and address on evidence match the
        profile you want to appeal.
      </p>
      <p>
        If the bill relates to another location, another company or an unrelated person, do not
        assume that it strengthens the case simply because it is a utility bill.
      </p>

      <h2>The name on the evidence matters</h2>
      <p>
        Google advises businesses to check that the business name on submitted evidence matches the
        profile being appealed.
      </p>
      <p>
        Google&apos;s wider Business Profile guidance also says that the profile&apos;s business name
        should reflect the business&apos;s real-world name as used on signage, stationery and other
        branding.
      </p>
      <p>Those two ideas should be considered together.</p>
      <p>Do not change an official document to make it resemble the profile.</p>
      <p>And do not change the profile purely to manufacture a superficial match with one document.</p>
      <p>Instead, ask:</p>
      <ul>
        <li>What is the business genuinely called in the real world?</li>
        <li>Does the Business Profile follow Google&apos;s naming guidance?</li>
        <li>Which genuine records support that business identity?</li>
      </ul>
      <p>
        If a legal entity name and a public-facing trading name differ, treat that as something to
        understand and document accurately rather than something to hide.
      </p>

      <h2>The address on the evidence matters too</h2>
      <p>
        Google also tells businesses to check that the address on evidence matches the profile being
        appealed.
      </p>
      <p>But address consistency must be understood in the context of the business type.</p>
      <p>
        A storefront business, service-area business and hybrid business do not all display their
        addresses in the same way.
      </p>
      <p>
        Google says that businesses that do not serve customers at their business address should not
        display that address publicly on the Business Profile and should use the appropriate
        service-area setup.
      </p>
      <p>
        So do not make a private service-area address public simply because a utility bill contains
        that address.
      </p>
      <p>Instead, check whether:</p>
      <ul>
        <li>the underlying business location is genuine</li>
        <li>the profile is configured for the correct business type</li>
        <li>the submitted document belongs to that business</li>
        <li>and the evidence is consistent with the real operating setup</li>
      </ul>
      <p>The objective is truthful consistency, not visual similarity at any cost.</p>

      <h2>Match each document to a fact</h2>
      <p>Before uploading anything, give every document a job.</p>
      <p>For each file, write down:</p>
      <ul>
        <li>the fact you want it to support</li>
        <li>the business name it shows</li>
        <li>the address it shows</li>
        <li>the entity or location it belongs to</li>
        <li>why it is relevant to this appeal</li>
      </ul>
      <p>This evidence map is for your own preparation.</p>
      <p>You do not need to turn the appeal into a complicated dossier.</p>
      <p>The exercise simply forces you to answer an important question:</p>
      <p>Why am I submitting this document?</p>
      <p>
        If there is no clear answer, reconsider whether the file belongs in the evidence pack.
      </p>

      <h2>More files do not automatically mean stronger evidence</h2>
      <p>Google says certain evidence can help strengthen an appeal.</p>
      <p>It does not say that the appeal with the largest number of attachments wins.</p>
      <p>
        A focused evidence pack is easier to understand than a random archive of business paperwork.
      </p>
      <p>ProfileRelaunch&apos;s practical approach is:</p>
      <p>
        use the smallest useful set of genuine documents that clearly supports the important facts.
      </p>
      <p>That might still involve several records.</p>
      <p>But every record should have a reason for being there.</p>
      <p>
        Do not add unrelated invoices, screenshots, correspondence or documents merely to make the
        submission look substantial.
      </p>

      <h2>Do not confuse verification with appeal evidence</h2>
      <p>
        Google&apos;s broader appeals guidance tells businesses to check their verification status
        before submitting an appeal.
      </p>
      <p>
        Verification and appeal evidence are related concepts, but they are not the same process.
      </p>
      <p>
        Google has separate verification methods and may decide which method is available to a
        particular business.
      </p>
      <p>
        Do not assume that something required for a particular verification method is automatically
        required as appeal evidence.
      </p>
      <p>
        For the appeal, follow the evidence request actually presented to you and use documents that
        support the facts relevant to the restriction.
      </p>
      <p>
        If Google separately asks you to verify or re-verify the profile, follow that verification
        process on its own terms.
      </p>

      <h2>Check the profile before trying to prove it</h2>
      <p>Evidence cannot turn inaccurate profile information into accurate information.</p>
      <p>Before building the evidence pack, compare the Business Profile with the real business.</p>
      <p>Check the important fields that are relevant to the restriction, including:</p>
      <ul>
        <li>business name</li>
        <li>address or service-area setup</li>
        <li>business category</li>
        <li>website</li>
        <li>phone number</li>
        <li>opening hours</li>
        <li>ownership or management context</li>
      </ul>
      <p>
        If something is genuinely inaccurate and can appropriately be corrected, deal with the
        underlying accuracy issue.
      </p>
      <p>
        Do not build an evidence pack whose only purpose is to defend information that you already
        know is wrong.
      </p>

      <h2>Prepare the files so the evidence is easy to follow</h2>
      <p>
        This is ProfileRelaunch practical preparation rather than a separate Google evidence
        requirement.
      </p>
      <p>Before the appeal:</p>
      <ul>
        <li>make sure you have the correct document</li>
        <li>make sure it belongs to the correct business or location</li>
        <li>make sure the relevant information is readable</li>
        <li>avoid duplicate copies of the same evidence</li>
        <li>give files clear, neutral names so you can identify them quickly</li>
        <li>keep the original records available</li>
        <li>note any genuine mismatch you need to understand before submission</li>
      </ul>
      <p>
        Do not edit a document to change the business name, address, date or other substantive
        information.
      </p>
      <p>
        Evidence should describe the business that exists, not a version created for the appeal.
      </p>

      <h2>If you already submitted the appeal without evidence</h2>
      <p>
        Do not immediately submit another appeal for the same issue simply because you forgot a
        document.
      </p>
      <p>
        Google&apos;s appeal guidance says not to submit multiple appeals for the same issue before
        receiving a decision.
      </p>
      <p>Monitor the existing appeal.</p>
      <p>
        If a reinstatement request is denied, Google&apos;s current suspension guidance says an
        additional review may be available and that additional evidence not included with the
        original appeal can be provided.
      </p>
      <p>
        At that stage, assess what genuinely new evidence strengthens the case rather than simply
        resubmitting the same material.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google&apos;s current Business Profile suspension guidance says that supporting evidence
          may be added to an appeal and describes that evidence as optional.
        </p>
        <p>
          Google also says it highly recommends submitting evidence where it can strengthen the
          appeal.
        </p>
        <p>
          Examples Google explicitly names include official business registration, a business
          licence, tax certificates and business utility bills.
        </p>
        <p>
          Google tells businesses to check that the business name and address on submitted evidence
          match the Business Profile being appealed.
        </p>
        <p>Google recommends preparing evidence before submitting an appeal.</p>
        <p>
          The evidence step is time-limited. Google&apos;s suspension guidance says that once the
          evidence form is opened, it must be submitted within 60 minutes or the evidence will not
          be attached to the appeal.
        </p>
        <p>
          Google&apos;s broader appeal guidance also says businesses should prepare the documents in
          advance and provides the optional evidence step after the appeal is submitted.
        </p>
        <p>
          Google says not to submit multiple appeals for the same issue before receiving a decision.
        </p>
        <p>
          If a reinstatement request is denied, Google&apos;s suspension guidance says an additional
          review may be available and businesses can provide additional evidence that was not
          included in the original appeal.
        </p>
      </>
    ),
    sources: [sourceFixSuspended, sourceAppealRestrictions],
  },
  interpretation: (
    <>
      <p>A useful evidence pack has three jobs.</p>
      <p>First, it identifies the genuine business.</p>
      <p>Second, it connects the relevant business information to the Business Profile being appealed.</p>
      <p>Third, it supports the facts that matter to the restriction.</p>
      <p>That is why the strongest preparation is not simply:</p>
      <p>&quot;What documents do I have?&quot;</p>
      <p>It is:</p>
      <p>
        &quot;What fact does Google need to be able to verify, and which genuine document helps
        establish that fact?&quot;
      </p>
      <p>
        You may have every document Google names and still need to correct inaccurate profile
        information.
      </p>
      <p>
        You may also have a legitimate business without possessing every example document on
        Google&apos;s list.
      </p>
      <p>
        Google presents the documents as evidence examples, not as a universal four-document
        admission test.
      </p>
      <p>The aim is a coherent case:</p>
      <p>an eligible real business,</p>
      <p>an accurate Business Profile,</p>
      <p>
        and evidence that supports the important facts without exaggeration or invention.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not open Google&apos;s evidence step until your files are ready.</p>
      <p>Do not alter genuine records to make the name or address appear to match.</p>
      <p>Do not submit documents belonging to a different business or unrelated location.</p>
      <p>Do not assume that every document Google lists is mandatory for every business.</p>
      <p>Do not upload large numbers of irrelevant files simply to create volume.</p>
      <p>
        Do not make a service-area business display an address merely so it resembles a utility
        bill.
      </p>
      <p>
        Do not treat verification requirements as automatically identical to appeal evidence
        requirements.
      </p>
      <p>
        Do not submit another appeal for the same issue while the existing appeal is still awaiting
        a decision.
      </p>
      <p>
        Before submitting, make sure you can explain in one sentence what each document is there to
        prove.
      </p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile appeal evidence checklist",
    items: [
      "Save Google's restriction or suspension notice and the policy information shown in the appeals tool.",
      "Confirm that you are working with the correct Business Profile and the Google Account associated with it.",
      "Check that the profile itself follows Google's current Business Profile guidelines before trying to prove the existing information.",
      "Check your verification status if Google's appeal process indicates that verification is relevant.",
      "Write down the specific business facts your evidence needs to support.",
      "Collect official business registration if the business has it and it is relevant to the appeal.",
      "Collect the appropriate business licence if one genuinely applies to the business.",
      "Collect relevant tax certificates if they help establish the business details being appealed.",
      "Collect relevant business utility bills where they help support the business or location.",
      "Compare the business name on every document with the Business Profile.",
      "Compare the address on every relevant document with the business location and the profile's correct storefront or service-area setup.",
      "Remove duplicate or irrelevant files from the evidence pack.",
      "Keep genuine mismatches visible and understand them rather than altering documents to hide them.",
      "Make sure the relevant information is readable and that you can identify each file quickly.",
      "Decide what fact each document proves.",
      "Only then begin the appeal and Google's time-limited evidence step.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Treating Google's examples as four mandatory documents.",
        body: "Google describes registration, licences, tax certificates and utility bills as examples of evidence that can strengthen an appeal. Not every legitimate business will possess every example.",
      },
      {
        title: "Uploading everything you can find.",
        body: "A large archive of unrelated paperwork can make the important evidence harder to understand. Each document should have a clear purpose.",
      },
      {
        title: "Ignoring a business-name mismatch.",
        body: "Google specifically tells businesses to check that the name on evidence matches the profile being appealed. A genuine difference should be understood rather than hidden.",
      },
      {
        title: "Ignoring the business's real address model.",
        body: "A service-area business should not expose an address to customers simply to make the profile look like a utility bill. The profile should accurately represent how the business operates.",
      },
      {
        title: "Using documents for the wrong entity or location.",
        body: "A genuine document can still be irrelevant if it belongs to another company, branch or address.",
      },
      {
        title: "Changing evidence to create a match.",
        body: "Do not alter genuine business records to change names, addresses, dates or other substantive information for an appeal.",
      },
      {
        title: "Confusing verification evidence with appeal evidence.",
        body: "Google's verification processes have their own requirements. Do not assume that every item used in a verification method is automatically required for an appeal.",
      },
      {
        title: "Starting the evidence step before the files are ready.",
        body: "Google's evidence stage is time-limited. Searching for documents after the process has started creates unnecessary pressure.",
      },
      {
        title: "Submitting another appeal because evidence was missed.",
        body: "Google says not to submit multiple appeals for the same issue before receiving a decision. If the request is later denied, an additional review may allow genuinely new evidence.",
      },
    ],
  },
  scenarios: [
    {
      heading: "My legal company name is different from the name on my Business Profile",
      body: (
        <>
          <p>
            Do not edit either the document or the profile simply to force an artificial match.
          </p>
          <p>
            First determine whether the Business Profile name follows Google&apos;s guidance for the
            business&apos;s real-world name.
          </p>
          <p>Then identify which genuine records support the way the business actually trades.</p>
          <p>
            A difference between a legal entity name and a trading name may require explanation and
            supporting context.
          </p>
          <p>The important thing is not to pretend that two different names are identical.</p>
          <p>Make the relationship clear and keep the underlying records genuine.</p>
        </>
      ),
    },
    {
      heading: "I run a service-area business and my address is hidden",
      body: (
        <>
          <p>
            A hidden public address does not mean you should turn the profile into a storefront for
            the appeal.
          </p>
          <p>
            Google says that if you do not serve customers at your business address, the address
            should not be displayed publicly.
          </p>
          <p>Keep the correct service-area setup.</p>
          <p>
            Then use genuine business records that relate to the actual business and operating
            location where relevant.
          </p>
          <p>
            The evidence and the profile should describe the same real business even when customers
            do not see the underlying address on the public profile.
          </p>
        </>
      ),
    },
    {
      heading: "I do not have a business licence",
      body: (
        <>
          <p>
            Do not obtain or invent a licence merely because Google lists a business licence as an
            evidence example.
          </p>
          <p>
            Google&apos;s appeal guidance gives examples of documents that may strengthen an appeal;
            it does not say that every business must provide every example.
          </p>
          <p>Use the genuine records that apply to your business.</p>
          <p>
            If a particular licence is legally required for the activity you carry out, that is a
            different question and may need appropriate professional or regulatory advice.
          </p>
          <p>ProfileRelaunch does not determine licensing obligations.</p>
        </>
      ),
    },
    {
      heading: "I submitted the appeal and missed the evidence window",
      body: (
        <>
          <p>Do not immediately submit another appeal for the same issue.</p>
          <p>
            Google says not to submit multiple appeals while the existing appeal is awaiting a
            decision.
          </p>
          <p>Keep the evidence you have prepared and monitor the current appeal.</p>
          <p>
            If Google later denies the reinstatement request, its current guidance says an additional
            review may be available and that additional evidence not included with the original
            appeal can be provided.
          </p>
          <p>
            Use that opportunity for genuinely useful new evidence rather than duplicating the
            original submission.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>A good evidence pack tells one consistent story</h2>
      <p>The strongest evidence pack is not necessarily the biggest one.</p>
      <p>
        It is the one in which the Business Profile, the real business and the supporting records
        make sense together.
      </p>
      <p>Before you appeal, be able to answer:</p>
      <ul>
        <li>What business am I asking Google to restore?</li>
        <li>Is the profile accurate?</li>
        <li>What important fact does each document support?</li>
        <li>Do the names and addresses make sense together?</li>
        <li>Is anything inconsistent that I need to understand first?</li>
      </ul>
      <p>
        Then organise the genuine records before starting Google&apos;s time-limited evidence step.
      </p>
      <p>
        If you are unsure which documents are relevant, you do not need to send everything you own
        and hope that something works.
      </p>
      <p>
        ProfileRelaunch can review the restriction, the profile information and the evidence you
        already have, then help you identify the clearest appropriate evidence set and next step.
      </p>
    </>
  ),
  sourcesUsed: appealEvidenceChecklistSources,
}
