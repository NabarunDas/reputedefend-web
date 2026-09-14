import {
  sourceBusinessAddress,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceOverviewBusinessProfilePolicies,
  sourceRepresentBusinessGuidelines,
  sourceServiceAreas,
  sourceVerifyBusiness,
} from "@/lib/resource-sources/google-business-profile"

export const addressAndServiceAreaRulesSlug =
  "google-business-profile-address-and-service-area-rules"

export const addressAndServiceAreaRulesSources = [
  sourceRepresentBusinessGuidelines,
  sourceBusinessAddress,
  sourceServiceAreas,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceVerifyBusiness,
  sourceOverviewBusinessProfilePolicies,
]

export const addressAndServiceAreaRulesBody = {
  intro: (
    <>
      <p>
        A Google Business Profile address is not simply the place where you receive post.
      </p>
      <p>
        It represents where the business actually operates and, for storefront businesses, where customers
        can genuinely visit.
      </p>
      <p>That distinction matters because different businesses use location differently.</p>
      <p>A shop may serve customers at a fixed address.</p>
      <p>A plumber may operate from a home base but travel to customers.</p>
      <p>
        A garage may receive customers at its workshop and also provide roadside service.
      </p>
      <p>A business may rent office space inside a shared building.</p>
      <p>
        And another business may rent only a mailing address without operating there at all.
      </p>
      <p>Google does not treat those situations as identical.</p>
      <p>Its rules distinguish between:</p>
      <p>storefront businesses,</p>
      <p>service-area businesses,</p>
      <p>and hybrid businesses.</p>
      <p>
        If customers do not visit your business address, Google says a service-area business should remove
        that address from public display and use a service area instead.
      </p>
      <p>
        If customers do visit the address, the location should represent a genuine customer-facing business
        presence.
      </p>
      <p>The goal is not to show the address that looks best for local search.</p>
      <p>The goal is to describe how the real business actually serves customers.</p>
    </>
  ),
  quickAnswer: (
    <>
      <p>Before changing your Business Profile address or service area:</p>
      <ul>
        <li>decide whether customers genuinely visit your business location</li>
        <li>decide whether you travel or deliver directly to customers</li>
        <li>identify whether the business is storefront, service-area or hybrid</li>
        <li>use the actual real-world business location</li>
        <li>do not use a PO box or remote mailbox as the business location</li>
        <li>do not use a virtual office where the business does not actually operate</li>
        <li>do not assume a co-working address is automatically eligible</li>
        <li>
          if using a co-working location as a storefront, make sure it meets Google&apos;s customer-facing,
          signage and staffing requirements
        </li>
        <li>
          if customers do not visit your address, remove the address from public display and use a service
          area
        </li>
        <li>
          if customers do visit your location and you also travel to them, a hybrid profile can use both
          address and service area
        </li>
        <li>
          keep permanent fixed signage where Google requires a customer-facing storefront presence
        </li>
        <li>do not create extra profiles merely for every city you serve</li>
        <li>service-area businesses can currently set up to 20 service areas</li>
        <li>
          Google currently says the overall service area generally should not extend farther than about two
          hours&apos; driving time from the business base
        </li>
        <li>
          service areas are selected using cities, postal codes or other supported areas rather than a
          radius
        </li>
        <li>
          if the business moves after verification, be prepared to verify the new address again
        </li>
      </ul>
      <p>Address and service area should describe where the business actually operates.</p>
      <p>They are not interchangeable local-search targeting tools.</p>
    </>
  ),
  main: (
    <>
      <h2>First decide whether customers actually visit your location</h2>
      <p>This is the most important classification question.</p>
      <p>Ask:</p>
      <p>
        Can a customer genuinely come to this address during the stated business hours and receive the
        business&apos;s normal products or services there?
      </p>
      <p>If yes, you may have a storefront or hybrid location.</p>
      <p>
        If no, and the business instead travels or delivers directly to customers, you are generally dealing
        with a service-area business.
      </p>
      <p>
        Do not choose a storefront setup merely because displaying an address feels more valuable.
      </p>
      <p>The Business Profile should match how the business actually operates.</p>

      <h2>A storefront business needs a real customer-facing location</h2>
      <p>A storefront is not simply an address the business can use.</p>
      <p>It should be a genuine place where the business serves customers.</p>
      <p>
        Google&apos;s guidelines say businesses showing their address should maintain permanent fixed
        signage of the business name at that address.
      </p>
      <p>The location should represent the real-world business customers are trying to find.</p>
      <p>Do not show an address simply because:</p>
      <ul>
        <li>the company is registered there</li>
        <li>mail arrives there</li>
        <li>the owner can occasionally meet somebody there</li>
        <li>the address is in a commercially attractive city</li>
      </ul>
      <p>Customer-facing operation matters.</p>

      <h2>A service-area business goes to the customer</h2>
      <p>
        Google describes a service-area business as one that visits or delivers to customers directly but
        does not serve customers at its business address.
      </p>
      <p>Common examples can include:</p>
      <ul>
        <li>plumbers</li>
        <li>cleaners</li>
        <li>mobile trades</li>
        <li>home-service businesses</li>
        <li>other businesses that travel directly to customers</li>
      </ul>
      <p>A service-area business can still have a genuine physical base.</p>
      <p>The difference is that customers are not served there.</p>
      <p>Do not confuse:</p>
      <p>“the business has an address”</p>
      <p>with:</p>
      <p>“the business has a customer-facing storefront.”</p>

      <h2>If customers do not visit the address, hide it</h2>
      <p>Google&apos;s current service-area guidance is explicit.</p>
      <p>
        If you do not serve customers at your business address, remove the address from public display.
      </p>
      <p>
        For example, a plumber may legitimately operate from a residential address while travelling to
        customers.
      </p>
      <p>The underlying business location can still exist.</p>
      <p>
        But the home address should not be presented to customers as though it were a walk-in storefront.
      </p>
      <p>Use the service-area settings to show the areas the business serves.</p>

      <h2>A home-based business is not automatically ineligible</h2>
      <p>Do not treat the word:</p>
      <p>home</p>
      <p>as the policy problem.</p>
      <p>The question is how the business operates.</p>
      <p>
        A legitimate service-area business may be based at the owner&apos;s home while travelling to
        customers.
      </p>
      <p>
        In that situation, Google tells service-area businesses to hide the address from customers.
      </p>
      <p>Do not create storefront claims that do not exist.</p>
      <p>
        And do not tell a legitimate home-based service business that it needs to rent a shop merely to
        have a Business Profile.
      </p>

      <h2>A hybrid business does both</h2>
      <p>
        A hybrid business serves customers at its business location and also visits or delivers directly to
        customers.
      </p>
      <p>
        For example, an auto repair business may receive customers at its garage and also provide roadside
        assistance.
      </p>
      <p>
        A genuine hybrid business can show its storefront address and also define a service area.
      </p>
      <p>But the storefront still needs to be real.</p>
      <p>
        Google says that if the business does not have permanent on-site signage, it is not eligible as a
        storefront and should instead be listed as a service-area business.
      </p>
      <p>
        Do not use the hybrid label to preserve an address that customers cannot genuinely visit.
      </p>

      <h2>Use the actual real-world address</h2>
      <p>
        Google says businesses should use a precise and accurate address for the actual business location.
      </p>
      <p>Enter the complete street address.</p>
      <p>Where appropriate, include legitimate:</p>
      <ul>
        <li>building numbers</li>
        <li>suite numbers</li>
        <li>floor numbers</li>
        <li>unit information</li>
      </ul>
      <p>Do not add unrelated wording to the address lines.</p>
      <p>Do not insert:</p>
      <ul>
        <li>URLs</li>
        <li>keywords</li>
        <li>service descriptions</li>
        <li>marketing language</li>
      </ul>
      <p>into address fields.</p>
      <p>The address should describe the physical location.</p>

      <h2>PO boxes and remote mailboxes are not acceptable business locations</h2>
      <p>
        Google&apos;s guidelines do not accept PO boxes or mailboxes located at remote locations as
        Business Profile addresses.
      </p>
      <p>
        Receiving post somewhere does not establish a customer-facing business location.
      </p>
      <p>Do not use:</p>
      <ul>
        <li>a PO box</li>
        <li>a mailbox service</li>
        <li>a remote mail-handling address</li>
      </ul>
      <p>merely to obtain a listing in another area.</p>
      <p>Use the location where the real business actually operates.</p>

      <h2>A virtual office is not a shortcut into another city</h2>
      <p>
        Google says a rented physical mailing address where the business does not actually operate —
        commonly described as a virtual office — is not eligible as the business location for a Business
        Profile.
      </p>
      <p>Do not rent an address in:</p>
      <p>Leeds,</p>
      <p>London,</p>
      <p>Manchester,</p>
      <p>Birmingham,</p>
      <p>or another market simply to create a local profile there.</p>
      <p>An address is not eligible merely because:</p>
      <ul>
        <li>rent is paid</li>
        <li>post can be collected</li>
        <li>the provider gives you a suite number</li>
        <li>the address appears prestigious</li>
      </ul>
      <p>
        The business must actually operate in a way that meets Google&apos;s location rules.
      </p>

      <h2>Co-working spaces require more than a desk booking</h2>
      <p>A co-working location is not automatically prohibited.</p>
      <p>But it is not automatically eligible either.</p>
      <p>
        Google says a business cannot list an office at a co-working space unless the office:
      </p>
      <ul>
        <li>maintains clear signage</li>
        <li>receives customers at the location during business hours</li>
        <li>is staffed during business hours by the business&apos;s own staff</li>
      </ul>
      <p>
        A hot desk, occasional meeting-room booking or mail-only arrangement does not automatically meet
        that standard.
      </p>
      <p>Assess the real operation at the location.</p>

      <h2>Permanent signage matters when an address is shown</h2>
      <p>
        Google&apos;s guidelines say businesses showing their address should maintain permanent fixed
        signage of their business name at the location.
      </p>
      <p>Do not create temporary signage merely for:</p>
      <ul>
        <li>verification</li>
        <li>an appeal</li>
        <li>a photograph</li>
        <li>a short inspection</li>
      </ul>
      <p>Do not digitally add a sign to a photograph.</p>
      <p>
        Do not tape keyword-heavy branding to a door purely to support the listing.
      </p>
      <p>Evidence should document the real business that customers encounter.</p>

      <h2>Use the map pin when the address system cannot locate you accurately</h2>
      <p>Some legitimate addresses are difficult for mapping systems.</p>
      <p>
        Google&apos;s address guidance allows a business to adjust the map pin when the address does not
        have a street number or Google cannot find the correct location.
      </p>
      <p>Use the pin to identify the real physical location.</p>
      <p>
        Do not move the pin toward a busier road, city centre or more desirable neighbourhood merely for
        visibility.
      </p>
      <p>The map marker should help customers find the actual business.</p>

      <h2>Service areas describe where you serve customers</h2>
      <p>
        A service area tells customers where the business can visit or deliver to them.
      </p>
      <p>Google currently allows service areas to be selected using:</p>
      <ul>
        <li>cities</li>
        <li>postal codes</li>
        <li>other supported geographic areas</li>
      </ul>
      <p>Use areas the business genuinely serves.</p>
      <p>
        Do not add every nearby city merely because you would accept work there occasionally.
      </p>
      <p>Be specific and accurate.</p>

      <h2>Google currently allows up to 20 service areas</h2>
      <p>
        Google&apos;s current service-area guidance allows a business to set up to 20 service areas.
      </p>
      <p>That is a configuration limit.</p>
      <p>It is not a suggestion that every business should use all 20.</p>
      <p>Choose the areas that accurately describe normal operations.</p>
      <p>Do not fill every available slot solely to maximise geographic keywords.</p>

      <h2>Service areas are no longer configured as a radius</h2>
      <p>
        Google says you cannot currently set the service area as a radius distance around the business.
      </p>
      <p>Older profiles may have been configured differently in the past.</p>
      <p>
        If the old radius setup needs to be edited, Google says the service area must instead be defined
        through supported geographic areas such as cities or postal codes.
      </p>
      <p>Do not build current advice around an obsolete radius-setting process.</p>

      <h2>The overall service area should remain realistic</h2>
      <p>
        Google currently advises that the boundaries of the overall service area generally should not
        extend farther than about two hours of driving time from where the business is based.
      </p>
      <p>Google also recognises that larger areas may be appropriate for some businesses.</p>
      <p>Do not convert this guidance into an invented fixed mileage rule.</p>
      <p>
        Ask whether the selected area genuinely reflects the business&apos;s normal operational reach.
      </p>

      <h2>A service area does not create a physical office in that area</h2>
      <p>Adding:</p>
      <p>York</p>
      <p>to the service area does not mean the business has a York storefront.</p>
      <p>Adding:</p>
      <p>Leeds</p>
      <p>does not create a Leeds office.</p>
      <p>The service area describes where you travel to customers.</p>
      <p>It does not create separate physical locations.</p>
      <p>Do not represent service areas as additional branches.</p>

      <h2>One service-area base does not justify profiles for every town served</h2>
      <p>
        Google says service-area businesses can generally have one profile for the central office or
        business location with a designated service area.
      </p>
      <p>Do not create:</p>
      <p>Company Leeds,</p>
      <p>Company Bradford,</p>
      <p>Company York,</p>
      <p>Company Wakefield</p>
      <p>
        as separate Business Profiles when they are all the same single-base business without separate
        qualifying locations.
      </p>
      <p>
        Service coverage and physical-location eligibility are different questions.
      </p>

      <h2>Separate staffed locations can be different</h2>
      <p>Some service businesses genuinely have more than one operating location.</p>
      <p>
        Google says that where there are different locations with separate service areas and separate staff
        at each location, a profile may be allowed for each location.
      </p>
      <p>The key is that they are real operational locations.</p>
      <p>Do not manufacture separate locations simply by:</p>
      <ul>
        <li>renting mailboxes</li>
        <li>using employees&apos; home addresses</li>
        <li>purchasing virtual-office addresses</li>
        <li>creating map pins</li>
      </ul>
      <p>Each claimed location should independently satisfy Google&apos;s rules.</p>

      <h2>Age-restricted service businesses have additional limits</h2>
      <p>
        Google&apos;s current service-area guidance says businesses associated with products or services
        that require customers to meet a minimum age — including examples such as alcohol, cannabis or
        weapons — are not permitted as service-area businesses without a storefront.
      </p>
      <p>
        Do not apply ordinary service-area assumptions blindly to regulated or age-restricted business
        categories.
      </p>
      <p>Check the current eligibility rules for the business involved.</p>

      <h2>Moving a verified business can require verification again</h2>
      <p>
        Google says that if a verified business moves to a new address, the business must verify the new
        location again.
      </p>
      <p>Do not treat this as evidence that the move itself is suspicious.</p>
      <p>
        Re-verification is part of confirming that Google still has accurate business information.
      </p>
      <p>Before changing the address, make sure the business can support:</p>
      <ul>
        <li>the new physical location</li>
        <li>signage where applicable</li>
        <li>its operating presence</li>
        <li>any verification method Google makes available</li>
      </ul>

      <h2>Do not create a second profile just because the business moved</h2>
      <p>
        If the same continuing business relocates, the normal objective is to update the existing Business
        Profile rather than create a duplicate simply because the address changed.
      </p>
      <p>
        Preserving the correct existing profile avoids unnecessary duplicate and ownership problems.
      </p>
      <p>
        Do not abandon an established profile merely because re-verification is inconvenient.
      </p>

      <h2>Address edits can be reviewed</h2>
      <p>Google reviews Business Profile edits for accuracy and compliance.</p>
      <p>
        An address change may therefore take time to appear or may require further action.
      </p>
      <p>
        Do not repeatedly submit different addresses while an edit is being assessed.
      </p>
      <p>Record:</p>
      <ul>
        <li>the old address</li>
        <li>the new address</li>
        <li>when the edit was submitted</li>
        <li>any verification prompt</li>
        <li>any Google decision</li>
      </ul>
      <p>Then respond to the actual status.</p>

      <h2>A hidden address does not mean Google has no underlying business location</h2>
      <p>Businesses sometimes misunderstand address hiding.</p>
      <p>
        Hiding a service-area business&apos;s address from customers does not mean inventing a
        location-free business.
      </p>
      <p>Google still needs accurate information about the business itself.</p>
      <p>
        The public presentation simply reflects the fact that customers are served at their locations
        rather than at the business base.
      </p>
      <p>Keep the underlying information truthful.</p>

      <h2>Do not change location structure only for ranking</h2>
      <p>
        A Business Profile location should represent the operational reality of the business.
      </p>
      <p>Do not:</p>
      <ul>
        <li>expose a home address merely because you think Maps ranking will improve</li>
        <li>rent a virtual office merely to appear in another city</li>
        <li>create additional profiles for service areas</li>
        <li>move a map pin toward a target neighbourhood</li>
        <li>claim a co-working storefront that customers cannot actually visit</li>
      </ul>
      <p>The location strategy should follow the business.</p>
      <p>
        The business should not be redesigned on paper solely for Google Maps.
      </p>

      <h2>Correct address and service-area issues before a suspension appeal</h2>
      <p>
        If Google suspends or disables the Business Profile, make sure the location setup follows the
        guidelines before appealing.
      </p>
      <p>
        A legitimate business can still have a non-compliant location configuration.
      </p>
      <p>For example:</p>
      <ul>
        <li>a virtual office</li>
        <li>an exposed service-area home address</li>
        <li>a fake branch</li>
        <li>a mail-only location</li>
        <li>a storefront claim without qualifying customer access</li>
      </ul>
      <p>may need to be corrected before the appeal.</p>
      <p>
        Do not appeal first and leave the underlying location problem unchanged.
      </p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says businesses should use a precise and accurate address or service area that represents
          the real business.
        </p>
        <p>
          Google says PO boxes and mailboxes located at remote locations are not acceptable Business
          Profile addresses.
        </p>
        <p>
          Google says a business that rents a physical mailing address but does not actually operate there
          — commonly called a virtual office — is not eligible to use that location for a Business Profile.
        </p>
        <p>
          Google says an office in a co-working space can qualify only when it maintains clear signage,
          receives customers during business hours and is staffed during business hours by the
          business&apos;s own staff.
        </p>
        <p>
          Businesses showing an address should maintain permanent fixed signage of the business name at
          that address.
        </p>
        <p>
          Google says service-area businesses that do not serve customers at their address should hide that
          address and use a service area.
        </p>
        <p>
          Hybrid businesses that serve customers at their location and also travel or deliver to customers
          can use both an address and a service area when the storefront requirements are genuinely met.
        </p>
        <p>
          Google currently allows up to 20 service areas and advises that the overall service area
          generally should not extend farther than about two hours&apos; driving time from the business
          base.
        </p>
        <p>
          Google says current service areas are defined by cities, postal codes or other supported areas
          rather than a radius.
        </p>
      </>
    ),
    sources: [sourceRepresentBusinessGuidelines, sourceBusinessAddress, sourceServiceAreas],
  },
  interpretation: (
    <>
      <p>Your Business Profile location should answer two questions accurately.</p>
      <p>First:</p>
      <p>Where does the business genuinely operate?</p>
      <p>Second:</p>
      <p>Where do customers actually receive the service?</p>
      <p>If customers visit the business:</p>
      <p>the address may belong on the profile when the storefront requirements are met.</p>
      <p>If the business goes to customers:</p>
      <p>
        the public address should generally be hidden and the service area should describe where the
        business operates.
      </p>
      <p>If both happen:</p>
      <p>the business may be hybrid.</p>
      <p>Do not choose the model that appears most attractive for search.</p>
      <p>Choose the model that matches the real customer experience.</p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>Do not show an address merely because mail can be received there.</p>
      <p>Do not use a PO box or remote mailbox as the business location.</p>
      <p>Do not rent a virtual office simply to obtain another city listing.</p>
      <p>Do not assume every co-working space qualifies as a storefront.</p>
      <p>Do not show a home address when customers are not served there.</p>
      <p>
        Do not hide a genuine storefront address merely because the business also travels to customers.
      </p>
      <p>
        Do not create multiple profiles for the same single-base service-area business merely because it
        serves several towns.
      </p>
      <p>
        Do not use every available service-area slot simply because Google allows up to 20.
      </p>
      <p>Do not present the two-hour guidance as a fixed mileage rule.</p>
      <p>Do not move the map pin away from the actual business location.</p>
      <p>Do not create temporary signage for verification.</p>
      <p>Do not create a duplicate profile merely because the business relocated.</p>
      <p>Do not assume every address edit means the profile is suspended.</p>
      <p>If the profile is suspended, correct the location problem before appealing.</p>
      <p>Make the profile match the real operating model of the business.</p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile address and service-area checklist",
    items: [
      "Find the address currently stored on the Business Profile.",
      "Confirm whether that is the business's actual operating location.",
      "Decide whether customers genuinely visit that location during stated business hours.",
      "Decide whether the business travels or delivers directly to customers.",
      "Classify the business as storefront, service-area or hybrid based on the real operating model.",
      "If the address is shown publicly, confirm the business has the required permanent fixed signage.",
      "Confirm the address is not a PO box or remote mailbox.",
      "Confirm the location is not merely a virtual office where the business does not operate.",
      "If using a co-working location, check signage, customer access and staffing by the business during business hours.",
      "If customers do not visit the business address, remove it from public display.",
      "Add service areas that accurately describe where the business normally serves customers.",
      "Keep the service-area list to the current Google maximum of 20 or fewer.",
      "Check whether the overall service area is operationally realistic from the business base.",
      "Do not rely on an obsolete radius configuration.",
      "Check that each separate Business Profile represents a genuinely separate qualifying location.",
      "Do not create town-by-town profiles for one single-base service-area business.",
      "If the business has moved, update the existing profile rather than creating a duplicate.",
      "Be prepared to verify the new address after a move.",
      "Check the map pin against the actual physical location.",
      "Preserve real-world evidence of the location and signage where relevant.",
      "If Google is reviewing an address edit, record the current status before submitting another change.",
      "If the profile is suspended, fix any address or service-area policy issue before appealing.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Showing a home address because the owner works there.",
        body: "If customers are not served at that address, Google tells service-area businesses to hide the address and use a service area instead.",
      },
      {
        title: "Renting a virtual office for another city.",
        body: "Google says a physical mailing address where the business does not actually operate is not an eligible Business Profile location.",
      },
      {
        title: "Assuming a co-working membership is enough.",
        body: "Google's co-working rule also looks for clear signage, customer access during business hours and staffing by the business's own staff.",
      },
      {
        title: "Using a PO box as the location.",
        body: "Google does not accept PO boxes or remote mailboxes as Business Profile addresses.",
      },
      {
        title: "Creating one profile for every service area.",
        body: "Service areas describe coverage. They do not automatically create separate eligible business locations.",
      },
      {
        title: "Using all 20 areas just because they are available.",
        body: "Google allows up to 20 service areas, but the areas should still accurately reflect the business's normal operations.",
      },
      {
        title: "Treating two hours as an exact mileage law.",
        body: "Google describes the overall area as generally not extending farther than about two hours' driving time and recognises that some businesses may appropriately serve larger areas.",
      },
      {
        title: "Moving the pin toward the target market.",
        body: "The map pin should identify the real physical location, not the neighbourhood where the business hopes to rank.",
      },
      {
        title: "Creating a new profile after moving.",
        body: "A move of the same continuing business should normally be handled by updating the existing profile and completing any required re-verification.",
      },
      {
        title: "Appealing without correcting the location issue.",
        body: "If the profile was restricted because the location setup does not follow Google's rules, correct the underlying issue before asking for reinstatement.",
      },
    ],
  },
  scenarios: [
    {
      heading: "I run a plumbing business from home and customers never visit me",
      body: (
        <>
          <p>This is a typical service-area situation.</p>
          <p>
            Use the genuine business base information required by Google, but remove the home address from
            public display.
          </p>
          <p>Set service areas that accurately reflect where you travel to customers.</p>
          <p>
            Do not present the house as a walk-in plumbing shop simply because showing an address feels
            beneficial.
          </p>
        </>
      ),
    },
    {
      heading: "We rent a desk in a co-working building",
      body: (
        <>
          <p>A desk rental alone does not establish storefront eligibility.</p>
          <p>Check whether the business itself:</p>
          <ul>
            <li>maintains clear signage</li>
            <li>receives customers there during business hours</li>
            <li>has its own staff there during business hours</li>
          </ul>
          <p>
            If those requirements are not genuinely met, do not present the co-working address as a
            storefront.
          </p>
          <p>Assess whether the business should instead operate as a service-area profile.</p>
        </>
      ),
    },
    {
      heading: "We have a real workshop and also travel to customers",
      body: (
        <>
          <p>That may be a hybrid business.</p>
          <p>
            If customers genuinely visit the workshop during stated hours and the storefront satisfies
            Google&apos;s requirements, the profile can show the address.
          </p>
          <p>
            If the business also provides services at customer locations, add an accurate service area.
          </p>
          <p>Do not hide a genuine storefront simply because the business also travels.</p>
        </>
      ),
    },
    {
      heading: "We serve six cities from one base",
      body: (
        <>
          <p>One base serving several towns does not automatically justify six Business Profiles.</p>
          <p>
            Use one qualifying profile for the real business location and add the genuine service areas.
          </p>
          <p>
            Create additional profiles only where there are genuinely separate qualifying operating
            locations with the required staffing and other conditions.
          </p>
        </>
      ),
    },
    {
      heading: "We moved the business to a new address",
      body: (
        <>
          <p>Update the existing Business Profile with the genuine new address.</p>
          <p>Do not create another profile merely because the business moved.</p>
          <p>
            Google says a verified business that moves to a new address must verify again.
          </p>
          <p>
            Prepare the real location and signage evidence and complete the verification method Google
            makes available.
          </p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Show customers how the business really operates</h2>
      <p>Your Google Business Profile should not create a fictional storefront.</p>
      <p>And it should not hide a genuine one.</p>
      <p>
        The right location setup depends on how customers actually interact with the business.
      </p>
      <p>If customers come to you:</p>
      <p>use the real qualifying storefront address.</p>
      <p>If you go to customers:</p>
      <p>hide the non-customer-facing address and use an accurate service area.</p>
      <p>If you do both:</p>
      <p>use a genuine hybrid setup.</p>
      <p>
        Avoid PO boxes, mail-only addresses, fake branches and virtual offices where the business does not
        actually operate.
      </p>
      <p>
        Treat co-working locations according to Google&apos;s real signage, customer-access and staffing
        requirements.
      </p>
      <p>Keep service areas realistic.</p>
      <p>
        And do not create extra profiles merely to occupy more cities on Maps.
      </p>
      <p>
        ProfileRelaunch can help compare the existing profile with the business&apos;s real operating
        model, identify likely address or service-area policy problems and organise the strongest
        appropriate Google route.
      </p>
      <p>
        We cannot promise that a location change will be accepted automatically or that correcting an
        address alone will reinstate a suspended profile.
      </p>
      <p>
        The objective is to make Google&apos;s location information match the real business customers can
        actually deal with.
      </p>
    </>
  ),
  sourcesUsed: addressAndServiceAreaRulesSources,
}
