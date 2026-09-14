import {
  sourceAllPolicies,
  sourceAppealRestrictions,
  sourceEditBusinessProfile,
  sourceFixSuspended,
  sourceOverviewBusinessProfilePolicies,
  sourceRepresentBusinessGuidelines,
} from "@/lib/resource-sources/google-business-profile"

export const googleBusinessProfileNameRulesSlug = "google-business-profile-name-rules"

export const googleBusinessProfileNameRulesSources = [
  sourceRepresentBusinessGuidelines,
  sourceEditBusinessProfile,
  sourceOverviewBusinessProfilePolicies,
  sourceAllPolicies,
  sourceFixSuspended,
  sourceAppealRestrictions,
]

export const googleBusinessProfileNameRulesBody = {
  intro: (
    <>
      <p>
        Your Google Business Profile name is not a place to describe everything your business does.
      </p>
      <p>Google&apos;s rule is based on your real-world business identity.</p>
      <p>
        The name on the profile should reflect the name the business consistently uses and is recognised by
        in the real world.
      </p>
      <p>Google specifically points to places such as:</p>
      <p>your storefront,</p>
      <p>your website,</p>
      <p>your stationery,</p>
      <p>and your other branding.</p>
      <p>That means a business called:</p>
      <p>Oakfield Plumbing</p>
      <p>should not automatically become:</p>
      <p>Oakfield Plumbing Emergency Boiler Repair Leeds Best Plumber</p>
      <p>simply because those extra words describe services, location or search terms.</p>
      <p>Google provides separate fields for information such as:</p>
      <p>address,</p>
      <p>service area,</p>
      <p>hours,</p>
      <p>and business category.</p>
      <p>The Business Profile name should identify the business itself.</p>
      <p>That sounds simple.</p>
      <p>The difficult cases are where:</p>
      <p>the legal company name differs from the trading name,</p>
      <p>a city genuinely forms part of the brand,</p>
      <p>a business has recently rebranded,</p>
      <p>the profile already contains extra keywords,</p>
      <p>or Google rejects a legitimate-looking name change.</p>
      <p>In those situations, start with real-world evidence rather than search keywords.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>
        Google says your Business Profile name should reflect your business&apos;s real-world name as it is
        consistently represented and recognised.
      </p>
      <p>Before changing the name:</p>
      <ul>
        <li>check the signage customers actually see</li>
        <li>check the business website</li>
        <li>check stationery and established branding</li>
        <li>identify the name customers genuinely know the business by</li>
        <li>separate the business name from its services</li>
        <li>separate the business name from its address or service area</li>
        <li>separate the business name from opening hours</li>
        <li>separate the business name from marketing slogans</li>
        <li>do not add search keywords simply because competitors do it</li>
        <li>
          do not add a city merely to target local searches unless that city is genuinely part of the
          recognised real-world name
        </li>
        <li>
          do not add legal suffixes merely because they appear on company registration documents
        </li>
        <li>
          if special characters or legal terms genuinely form part of the real-world name, preserve evidence
          showing that consistent use
        </li>
        <li>
          remember that changing a verified Business Profile name may require verification again
        </li>
        <li>
          if Google rejects the edit, identify the actual reason and use the appropriate current Google
          process rather than repeatedly changing the name
        </li>
      </ul>
      <p>A compliant name is about identity.</p>
      <p>It is not an advertising headline.</p>
    </>
  ),
  main: (
    <>
      <h2>Start with the name customers recognise in the real world</h2>
      <p>
        Google&apos;s central rule is that the Business Profile should accurately represent the business as
        it is recognised in the real world.
      </p>
      <p>For the business name specifically, Google refers to consistent use across:</p>
      <ul>
        <li>storefront signage</li>
        <li>website</li>
        <li>stationery</li>
        <li>other branding</li>
        <li>the name known to customers</li>
      </ul>
      <p>Do not start with:</p>
      <p>“What keywords do we want to rank for?”</p>
      <p>Start with:</p>
      <p>“What is this business actually called?”</p>
      <p>That distinction prevents many naming problems.</p>

      <h2>Your Business Profile name is not your service description</h2>
      <p>Google gives businesses separate fields for information such as:</p>
      <ul>
        <li>category</li>
        <li>address</li>
        <li>service area</li>
        <li>opening hours</li>
        <li>website</li>
        <li>phone number</li>
      </ul>
      <p>Do not try to force that information into the business name.</p>
      <p>If the business is called:</p>
      <p>Greenline Heating</p>
      <p>the profile does not automatically become:</p>
      <p>Greenline Heating Boiler Repair Emergency Gas Engineer</p>
      <p>because those are services the business provides.</p>
      <p>Describe services in the appropriate areas of the profile.</p>
      <p>Keep the name for the business identity.</p>

      <h2>Marketing taglines do not belong in the name</h2>
      <p>
        Google&apos;s published examples specifically exclude marketing taglines from Business Profile
        names.
      </p>
      <p>A slogan may be legitimate marketing.</p>
      <p>That does not automatically make it part of the business name.</p>
      <p>For example, a company may use:</p>
      <p>Fast service. Fair prices.</p>
      <p>on advertising material.</p>
      <p>That does not mean the Google name should become:</p>
      <p>Company Name - Fast Service Fair Prices</p>
      <p>
        unless the longer wording genuinely forms part of the recognised real-world business name.
      </p>
      <p>Keep promotional language separate from identity.</p>

      <h2>Do not add opening hours or status information to the name</h2>
      <p>
        Google also says business-hours information does not belong in the Business Profile name.
      </p>
      <p>Do not add phrases such as:</p>
      <ul>
        <li>Open 24 Hours</li>
        <li>Open Late</li>
        <li>Closed</li>
        <li>Open Sundays</li>
      </ul>
      <p>to the name merely to communicate availability.</p>
      <p>Use the hours fields for that information.</p>
      <p>
        The same principle applies when a business temporarily changes its opening pattern.
      </p>
      <p>Do not repeatedly rewrite the business identity to describe operating status.</p>

      <h2>Phone numbers and website addresses normally belong elsewhere</h2>
      <p>Google&apos;s name guidance also addresses phone numbers and website URLs.</p>
      <p>
        In ordinary cases, those details belong in the dedicated phone and website fields.
      </p>
      <p>Do not convert the Business Profile name into:</p>
      <p>Business Name - 01234 567890</p>
      <p>or:</p>
      <p>BusinessNameExample.com</p>
      <p>merely because you want the contact information to be more visible.</p>
      <p>
        Google&apos;s policy recognises that unusual exceptions can exist where something that looks like a
        phone number or web-style name is genuinely the recognised real-world business name.
      </p>
      <p>The principle remains the same:</p>
      <p>real-world identity first.</p>

      <h2>Legal company name and customer-facing business name are not always identical</h2>
      <p>A company may be legally registered as:</p>
      <p>Oakfield Services Limited</p>
      <p>while customers consistently know it as:</p>
      <p>Oakfield Services</p>
      <p>Do not assume that:</p>
      <p>Limited,</p>
      <p>Ltd,</p>
      <p>LLC,</p>
      <p>Inc,</p>
      <p>PLC,</p>
      <p>
        or another legal term must automatically be added to the Business Profile merely because it appears
        in corporate records.
      </p>
      <p>
        Google&apos;s published name guidance treats irrelevant legal terms as unnecessary information.
      </p>
      <p>
        Where a legal term genuinely forms part of the business&apos;s consistent real-world
        representation, preserve evidence showing that.
      </p>
      <p>The question is not simply:</p>
      <p>“What does the incorporation certificate say?”</p>
      <p>The question is:</p>
      <p>“How is this business consistently represented to customers?”</p>

      <h2>Special characters need real-world justification</h2>
      <p>Google&apos;s guidance also addresses special characters.</p>
      <p>Do not add decorative symbols merely to make the listing stand out.</p>
      <p>
        At the same time, Google recognises that special characters can genuinely form part of a real-world
        brand.
      </p>
      <p>
        If the business consistently uses the character as part of its recognised name, preserve evidence
        such as:
      </p>
      <ul>
        <li>signage</li>
        <li>business cards</li>
        <li>invoices</li>
        <li>established branding</li>
      </ul>
      <p>Do not remove a genuine brand character merely because it looks unusual.</p>
      <p>And do not invent one only for Google.</p>

      <h2>Do not convert the name into a list of products or services</h2>
      <p>
        Service or product information should not normally be appended to the Business Profile name.
      </p>
      <p>For example, a business whose recognised name is:</p>
      <p>Parkside Motors</p>
      <p>should not automatically become:</p>
      <p>Parkside Motors MOT Tyres Servicing Used Cars</p>
      <p>just because it provides those services.</p>
      <p>
        Google&apos;s guidance allows for situations where service or product wording genuinely forms part
        of the real-world business identity or is needed to identify an eligible department.
      </p>
      <p>That is different from adding keywords after the fact.</p>
      <p>Ask whether customers actually recognise the longer wording as the business name.</p>

      <h2>A city or neighbourhood is not automatically part of the business name</h2>
      <p>Location information creates a common problem.</p>
      <p>A business serving Leeds is not automatically named:</p>
      <p>Business Name Leeds.</p>
      <p>A business operating in Manchester is not automatically:</p>
      <p>Business Name Manchester.</p>
      <p>
        Google says location information such as a neighbourhood, city or street name should not be added
        unless it is genuinely part of the business&apos;s consistently used and recognised real-world
        representation.
      </p>
      <p>
        Street-address or direction information should not be inserted into the name as a navigation aid.
      </p>
      <p>Use the address and service-area fields for location information.</p>
      <p>
        A genuine location-based brand name is different from a keyword added to target local searches.
      </p>

      <h2>Do not copy a competitor&apos;s keyword-stuffed name</h2>
      <p>You may see competitors using names such as:</p>
      <p>Best Emergency Plumber Leeds 24 Hour Boiler Repair</p>
      <p>That does not prove the format complies with Google&apos;s rules.</p>
      <p>
        Do not make a profile less accurate merely because another listing appears to be doing it.
      </p>
      <p>Competitor behaviour is not your evidence.</p>
      <p>Your own real-world business identity is.</p>

      <h2>A registered trading name can help — but context still matters</h2>
      <p>Formal records can help establish business identity.</p>
      <p>
        They are especially useful when Google asks for evidence during an appeal or verification process.
      </p>
      <p>
        But one document should not be treated as permission to ignore the rest of the real-world evidence.
      </p>
      <p>Consider the complete picture:</p>
      <ul>
        <li>public signage</li>
        <li>website</li>
        <li>stationery</li>
        <li>invoices where relevant</li>
        <li>established branding</li>
        <li>legal or trading-name documents</li>
      </ul>
      <p>The evidence should tell a consistent story.</p>
      <p>
        Do not register or alter a name on paper merely to justify search keywords on the Business Profile.
      </p>

      <h2>The website should support the name you are asking Google to trust</h2>
      <p>
        Google specifically names the website as one place where the real-world business name should be
        represented.
      </p>
      <p>If the Business Profile says:</p>
      <p>Citywide Roofing Leeds Emergency Roof Repair</p>
      <p>but the website, logo and customer documents all say:</p>
      <p>Citywide Roofing</p>
      <p>
        that inconsistency weakens the argument that the longer phrase is the genuine name.
      </p>
      <p>
        Likewise, changing one website heading immediately before an appeal does not necessarily establish
        longstanding real-world use.
      </p>
      <p>Aim for genuine consistency, not evidence manufactured for the submission.</p>

      <h2>Permanent signage can be important evidence</h2>
      <p>
        For businesses with customer-facing premises, physical signage can be strong evidence of the
        business identity customers encounter.
      </p>
      <p>Make sure the sign belongs to the actual business and location.</p>
      <p>Do not create a temporary sign purely for a screenshot.</p>
      <p>Do not digitally alter photographs.</p>
      <p>
        Do not place temporary keyword-heavy wording on a door simply to support an appeal.
      </p>
      <p>
        Evidence should document the real business rather than create a new one for Google.
      </p>

      <h2>Capitalisation should reflect the real name rather than advertising emphasis</h2>
      <p>
        Google&apos;s examples prohibit fully capitalised words merely for emphasis, while recognising
        normal acronyms and brands where capitalisation genuinely belongs to the name.
      </p>
      <p>Do not change:</p>
      <p>Oakfield Plumbing</p>
      <p>to:</p>
      <p>OAKFIELD PLUMBING</p>
      <p>simply to make the listing more visible.</p>
      <p>
        At the same time, do not incorrectly rewrite a genuine acronym into ordinary title case.
      </p>
      <p>The useful question remains:</p>
      <p>How is the recognised brand actually written?</p>

      <h2>Store numbers and internal codes are not usually part of the public name</h2>
      <p>
        Google&apos;s published examples also exclude store codes added to business names.
      </p>
      <p>An internal branch number may be useful operationally.</p>
      <p>
        It does not automatically belong in the customer-facing Business Profile name.
      </p>
      <p>
        For multi-location businesses, Google provides separate guidance on consistent chain naming.
      </p>
      <p>
        Use Google&apos;s location and management tools rather than inventing branch identifiers inside the
        public business name.
      </p>

      <h2>Multi-location brands should keep naming consistent</h2>
      <p>
        Google&apos;s chain guidance says locations within the same country should generally use the same
        name where the real-world representation is the same.
      </p>
      <p>Do not independently rename each branch with local keywords such as:</p>
      <p>Brand Leeds,</p>
      <p>Brand York,</p>
      <p>Brand Manchester</p>
      <p>
        unless those variations genuinely reflect how those locations are represented in the real world.
      </p>
      <p>
        Google recognises limited situations where real-world sub-brands or location-specific recognised
        names differ.
      </p>
      <p>Consistency should follow the actual brand structure, not a local-search experiment.</p>

      <h2>A genuine rebrand is different from keyword stuffing</h2>
      <p>Businesses do change names.</p>
      <p>A real rebrand may involve:</p>
      <ul>
        <li>new signage</li>
        <li>new website branding</li>
        <li>new stationery</li>
        <li>customer communications</li>
        <li>updated commercial materials</li>
        <li>updated legal or trading records where appropriate</li>
      </ul>
      <p>That is different from changing only the Google name.</p>
      <p>
        If the business has genuinely rebranded, make the Business Profile reflect the new real-world
        identity.
      </p>
      <p>
        Do not invent a “rebrand” merely because you want to add services or locations to the listing
        title.
      </p>

      <h2>Changing a verified name may trigger verification again</h2>
      <p>
        Google says that if you change the business name after the profile has been verified, you might
        need to verify the business again.
      </p>
      <p>The word:</p>
      <p>might</p>
      <p>matters.</p>
      <p>Do not promise that every name edit will trigger verification.</p>
      <p>And do not promise that no verification will be required.</p>
      <p>
        Before making a significant name change, make sure the business can support its real-world identity
        if Google asks.
      </p>

      <h2>A major identity change may not be an ordinary name edit</h2>
      <p>
        Google&apos;s current Business Profile policy overview distinguishes ordinary edits from changes
        that significantly alter the identity of the business.
      </p>
      <p>
        Google may reject edits that appear to transform the profile into a materially different business.
      </p>
      <p>
        Do not use an established Business Profile as a container for an unrelated new business simply
        because the existing profile already has visibility or reviews.
      </p>
      <p>
        A genuine rename of the same continuing business is different from replacing one business with
        another.
      </p>

      <h2>A rejected name edit is not automatically a suspension</h2>
      <p>Google reviews edits before publishing them.</p>
      <p>A business-name change can therefore be:</p>
      <p>accepted,</p>
      <p>pending,</p>
      <p>or not approved.</p>
      <p>
        A rejected edit does not automatically mean the entire Business Profile has been suspended.
      </p>
      <p>Check what Google has actually restricted.</p>
      <p>Do not create a second profile merely because a name edit did not publish.</p>

      <h2>Correct the underlying name issue before a suspension appeal</h2>
      <p>
        If the Business Profile is actually suspended or disabled, Google&apos;s reinstatement guidance
        tells businesses to make sure the profile follows the guidelines before appealing.
      </p>
      <p>
        That means a name problem should be corrected before asking Google to restore the profile.
      </p>
      <p>
        Do not keep the keyword-stuffed name and submit an appeal arguing only that the business itself is
        legitimate.
      </p>
      <p>Business legitimacy and profile compliance are separate questions.</p>
      <p>A real business can still have a non-compliant Business Profile name.</p>

      <h2>Use evidence that supports the name actually shown on the profile</h2>
      <p>
        If Google asks for evidence, make sure the documents and real-world materials support the business
        identity you are asking Google to accept.
      </p>
      <p>Depending on the case, useful evidence may include:</p>
      <ul>
        <li>permanent signage</li>
        <li>website branding</li>
        <li>stationery</li>
        <li>invoices</li>
        <li>business cards</li>
        <li>official registration documents</li>
        <li>licences</li>
        <li>other legitimate commercial records</li>
      </ul>
      <p>Different documents serve different purposes.</p>
      <p>
        Do not assume a registration certificate by itself proves that every word on the Google listing
        belongs in the customer-facing name.
      </p>

      <h2>The appeal route for a rejected name edit can vary by region</h2>
      <p>
        Google&apos;s current appeals guidance distinguishes between businesses in the UK or EEA and
        businesses elsewhere for some rejected Business Profile information edits.
      </p>
      <p>
        For businesses in the UK or EEA, Google&apos;s current guidance allows rejected business-information
        edits such as name changes to be appealed through the Business Profile appeals tool.
      </p>
      <p>
        For businesses outside that region, Google&apos;s current guidance can direct rejected
        information-edit cases through Google&apos;s contact route instead.
      </p>
      <p>ProfileRelaunch serves businesses in multiple countries.</p>
      <p>
        Do not give every customer the same appeal instructions without checking the current Google route
        for that business and decision.
      </p>

      <h2>Do not repeatedly rename the profile while a decision is being reviewed</h2>
      <p>
        Repeatedly trying slightly different keyword combinations can make the profile history harder to
        understand.
      </p>
      <p>Once you have identified the correct real-world name:</p>
      <p>use that name consistently,</p>
      <p>preserve your evidence,</p>
      <p>and follow the appropriate Google process.</p>
      <p>Do not cycle through:</p>
      <p>Business Name Leeds,</p>
      <p>Business Name Leeds UK,</p>
      <p>Business Name Plumbing Leeds,</p>
      <p>Best Business Name Leeds</p>
      <p>hoping one version survives review.</p>
      <p>
        The objective is compliance, not finding the keyword variation that happens to be accepted.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says a Business Profile name should accurately represent the business&apos;s real-world
          name.
        </p>
        <p>
          Google says the name should reflect how the business is consistently represented on its
          storefront, website, stationery and other branding and how it is known to customers.
        </p>
        <p>
          Google tells businesses to put information such as address, service area, business hours and
          category in the appropriate Business Profile fields rather than adding unnecessary information to
          the name.
        </p>
        <p>
          Its published examples restrict additions such as marketing taglines, store codes, unnecessary
          capitalisation, business-hours information, phone numbers, website addresses, service or product
          wording and location information when those elements are not genuinely part of the recognised
          real-world name.
        </p>
        <p>
          Google also says special characters or legal terms may require real-world proof when they
          genuinely form part of the business name.
        </p>
        <p>
          Google warns that unnecessary information in a Business Profile name can result in suspension.
        </p>
        <p>
          Google says that changing the business name after verification might require the business to
          verify again.
        </p>
        <p>
          Google may also reject edits that appear to change the business&apos;s identity significantly
          rather than simply update its information.
        </p>
      </>
    ),
    sources: [
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
      sourceOverviewBusinessProfilePolicies,
    ],
  },
  interpretation: (
    <>
      <p>
        The safest Business Profile name is the name you can prove without inventing a search-marketing
        explanation.
      </p>
      <p>Ask:</p>
      <p>What does the sign say?</p>
      <p>What does the website say?</p>
      <p>What does the established branding say?</p>
      <p>What name do customers actually know?</p>
      <p>Then compare that answer with the Google Business Profile.</p>
      <p>
        If the Google name contains additional services, cities, slogans or other descriptors that the real
        business does not consistently use, those additions deserve scrutiny.
      </p>
      <p>
        If the longer wording genuinely is the recognised real-world name, preserve the evidence that
        demonstrates that.
      </p>
      <p>The goal is not to make the name artificially short.</p>
      <p>The goal is to make it accurate.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not add services merely because customers search for them.</p>
      <p>Do not add a city merely because you want to rank in that city.</p>
      <p>Do not copy keyword-heavy competitor names.</p>
      <p>Do not assume your legal suffix must appear on the Business Profile.</p>
      <p>
        Do not remove genuine characters or wording that really form part of the recognised brand without
        checking the evidence.
      </p>
      <p>Do not create temporary signage merely to support a Google appeal.</p>
      <p>Do not digitally alter evidence.</p>
      <p>
        Do not treat one registration document as proof of an otherwise inconsistent public-facing name.
      </p>
      <p>
        Do not make a major identity change to an established profile merely to reuse its reviews or
        history.
      </p>
      <p>Do not assume every name edit requires re-verification.</p>
      <p>Do not assume a rejected name edit means the entire profile is suspended.</p>
      <p>If the profile is suspended, correct the real policy issue before appealing.</p>
      <p>Use the name the business genuinely uses in the real world.</p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile name compliance checklist",
    items: [
      "Write down the name currently shown on the Business Profile.",
      "Write down the name displayed on permanent customer-facing signage where applicable.",
      "Check the business website branding.",
      "Check stationery and established customer-facing materials.",
      "Identify the name customers genuinely know the business by.",
      "Mark any extra service or product terms currently added to the Google name.",
      "Mark any city, neighbourhood or street wording currently added to the name.",
      "Mark any opening-hours or status wording.",
      "Mark any slogan or marketing tagline.",
      "Mark any phone number or website wording included in the name.",
      "Check whether legal suffixes genuinely form part of the recognised real-world name.",
      "Check whether special characters genuinely form part of the established brand.",
      "Check whether unusual capitalisation is genuine branding or merely emphasis.",
      "For a multi-location business, check whether location names genuinely form part of each location's recognised branding.",
      "If the business has rebranded, preserve evidence showing the real-world change.",
      "Make sure the Google name reflects the real business rather than a list of search terms.",
      "Before changing a verified name, be prepared for the possibility that Google may require verification again.",
      "If an edit is rejected, record the exact Google status or decision before taking another action.",
      "If the profile is suspended, bring the name into compliance before submitting the suspension appeal.",
      "Keep the real-world evidence used to support the final name.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Treating the business name as an SEO field.",
        body: "Google's naming rule is based on real-world identity. Services, categories and locations have their own Business Profile fields.",
      },
      {
        title: "Adding a city because competitors do it.",
        body: "Location wording belongs in the name only when it genuinely forms part of the consistently used and recognised real-world business name.",
      },
      {
        title: "Adding every important service.",
        body: "A list of services is not automatically the business name. Use categories and other appropriate fields for what the business does.",
      },
      {
        title: "Assuming the registered company name settles the question.",
        body: "Legal documents can support identity, but Google's rule also looks at how the business is consistently represented and recognised in the real world.",
      },
      {
        title: "Adding Ltd, LLC or Inc automatically.",
        body: "Google's guidance restricts irrelevant legal terms. Include them where they genuinely form part of the recognised real-world name and can be supported.",
      },
      {
        title: "Removing a legitimate special character without checking.",
        body: "Google allows real-world evidence to support special characters that genuinely form part of the recognised business name.",
      },
      {
        title: "Creating temporary signage for an appeal.",
        body: "Evidence should document the real business. Do not manufacture a physical identity merely to justify the Google listing.",
      },
      {
        title: "Renaming an old profile into a different business.",
        body: "A significant identity change is not necessarily an ordinary edit. Google may reject edits that appear to transform the profile into another business.",
      },
      {
        title: "Assuming a rejected edit means suspension.",
        body: "A business-information edit can be rejected while the profile itself remains active. Check the actual Google decision before choosing the next process.",
      },
      {
        title: "Appealing before fixing the name.",
        body: "If the profile is suspended because it does not follow Google's guidelines, correct the underlying compliance issue before asking Google to reinstate it.",
      },
    ],
  },
  scenarios: [
    {
      heading: "Our company is legally “Oakfield Plumbing Ltd” but our signs say “Oakfield Plumbing”",
      body: (
        <>
          <p>Start with the real-world representation.</p>
          <p>If customers, signage, website and branding consistently use:</p>
          <p>Oakfield Plumbing</p>
          <p>do not assume:</p>
          <p>Ltd</p>
          <p>must be added merely because it appears on the incorporation record.</p>
          <p>Keep the legal record as legitimate business evidence.</p>
          <p>
            But evaluate the customer-facing Google name against Google&apos;s real-world naming rule.
          </p>
        </>
      ),
    },
    {
      heading: "We want to add “Leeds Boiler Repair” to our name",
      body: (
        <>
          <p>Ask whether:</p>
          <p>Leeds Boiler Repair</p>
          <p>is genuinely part of the recognised business name.</p>
          <p>If the real business is simply:</p>
          <p>Oakfield Heating</p>
          <p>
            do not append location and service keywords merely because they describe the market you want to
            reach.
          </p>
          <p>Use the service-area and category features for those facts.</p>
          <p>
            If the full location-based wording genuinely is the established brand, preserve the real-world
            evidence.
          </p>
        </>
      ),
    },
    {
      heading: "We genuinely rebranded the business",
      body: (
        <>
          <p>Make sure the rebrand exists outside Google.</p>
          <p>Look for consistent evidence across:</p>
          <ul>
            <li>signage</li>
            <li>website</li>
            <li>stationery</li>
            <li>customer communications</li>
            <li>commercial materials</li>
            <li>relevant formal records</li>
          </ul>
          <p>Then update the Business Profile to reflect the genuine new identity.</p>
          <p>Be prepared for Google to request verification again.</p>
          <p>Do not use “rebrand” as a label for a Google-only keyword change.</p>
        </>
      ),
    },
    {
      heading: "Google rejected our legitimate name edit",
      body: (
        <>
          <p>First confirm the exact Google decision.</p>
          <p>Check whether:</p>
          <ul>
            <li>the edit is still pending</li>
            <li>the edit was not approved</li>
            <li>the profile itself is restricted</li>
            <li>verification is required</li>
          </ul>
          <p>Then organise the evidence showing the real-world name.</p>
          <p>Use Google&apos;s current route for that decision and the business&apos;s region.</p>
          <p>
            Do not keep submitting slightly different names while the original issue remains unresolved.
          </p>
        </>
      ),
    },
    {
      heading: "Our profile is suspended and the name contains several keywords",
      body: (
        <>
          <p>Compare the current Google name with the business&apos;s real-world identity.</p>
          <p>Remove unsupported service, location, marketing or other additions.</p>
          <p>Make the profile compliant before appealing.</p>
          <p>
            Then prepare legitimate evidence supporting the actual business name and other profile details.
          </p>
          <p>
            Do not create a replacement profile while the suspension appeal is being handled.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Make the Google name match the business — not the search query</h2>
      <p>
        A Google Business Profile name should identify the business customers actually deal with.
      </p>
      <p>
        It should not become a compressed advertisement containing every service, location and search
        phrase the business wants to target.
      </p>
      <p>Start with the real world.</p>
      <p>Check the sign.</p>
      <p>Check the website.</p>
      <p>Check the stationery.</p>
      <p>Check the established brand.</p>
      <p>Use formal records where they genuinely help establish identity.</p>
      <p>
        Then remove anything from the Google name that exists only to describe, promote or target searches
        rather than identify the business.
      </p>
      <p>
        If the business genuinely changed its name, document the real-world rebrand and update the profile
        carefully.
      </p>
      <p>If Google rejects the edit, identify the exact moderation decision before appealing.</p>
      <p>
        And if the profile is suspended, correct the naming issue before asking for reinstatement.
      </p>
      <p>
        ProfileRelaunch can help compare the profile name with the available real-world evidence, identify
        likely policy problems and organise the strongest appropriate Google process.
      </p>
      <p>
        We cannot promise that a particular name will be accepted or that correcting a name alone will
        automatically reinstate a suspended profile.
      </p>
      <p>The objective is simpler:</p>
      <p>make the profile tell the truth about what the business is actually called.</p>
    </>
  ),
  sourcesUsed: googleBusinessProfileNameRulesSources,
}
