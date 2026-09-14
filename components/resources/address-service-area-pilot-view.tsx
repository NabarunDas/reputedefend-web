import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { addressAndServiceAreaRulesSources } from "@/lib/resource-articles/google-business-profile-address-and-service-area-rules"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const operatingModels = [
  [
    "Storefront",
    "Can customers genuinely visit this address during the stated business hours and receive the normal products or services there?",
    "Show the genuine qualifying business address.",
    "The location should be a real customer-facing business presence and meet Google's storefront requirements.",
  ],
  [
    "Service-area business",
    "Does the business travel or deliver directly to customers without serving customers at its business address?",
    "Hide the non-customer-facing address from public display and use accurate service areas.",
    "Having a physical base does not make that base a customer-facing storefront.",
  ],
  [
    "Hybrid",
    "Do customers genuinely visit the business location AND does the business also travel or deliver to customers?",
    "Use the genuine storefront address and accurate service areas.",
    "The storefront still has to qualify as a real customer-facing location.",
  ],
] as const

const classifyNotFrom = [
  "where the company is registered",
  "where post arrives",
  "where the owner happens to live",
  "which city the business wants to appear in",
]

const storefrontNotBecause = [
  "The company is registered there",
  "Mail arrives there",
  "The owner can occasionally meet somebody there",
  "The address is in an attractive city",
  "The business can book a meeting room there occasionally",
]

const serviceAreaExamples = [
  "Plumbers",
  "Cleaners",
  "Mobile trades",
  "Home-service businesses",
  "Other businesses that travel directly to customers",
]

const addressInclude = ["Building number", "Suite number", "Floor", "Unit information"]

const addressDonts = ["URLs", "Search keywords", "Service descriptions", "Marketing language"]

const mailboxItems = [
  ["PO box", "A postal collection point is not the operating business location."],
  ["Remote mailbox", "Receiving business mail does not establish customer-facing operations."],
  [
    "Mail-handling address",
    "A commercial mail service does not create a storefront simply because the business can receive post there.",
  ],
] as const

const virtualNotBecause = [
  "Rent is paid",
  "Post can be collected",
  "A suite number is provided",
  "The building looks prestigious",
  "The location is in a commercially attractive area",
]

const coworkingNeeds = [
  "Maintains clear signage",
  "Receives customers at the location during business hours",
  "Is staffed during business hours by the business's own staff",
]

const temporarySignageFor = ["Verification", "An appeal", "A photograph", "A short inspection"]

const signageDonts = [
  "Digitally add signage to a photograph",
  "Tape temporary keyword-heavy wording to a door",
  "Use signage from another business or location",
]

const pinDonts = [
  "A city centre",
  "A busier road",
  "A target neighbourhood",
  "A more commercially attractive area",
]

const geographicAreas = ["Cities", "Postal codes", "Other supported geographic areas"]

const townProfiles = ["Company Leeds", "Company Bradford", "Company York", "Company Wakefield"]

const fakeLocations = [
  "Renting mailboxes",
  "Using employees' home addresses without a genuine qualifying operation",
  "Purchasing virtual-office addresses",
  "Creating artificial map pins",
]

const editStates = [
  ["Edit submitted", "The business changed the location information."],
  [
    "Edit under review or awaiting further action",
    "Google may still be assessing the edit or may request verification.",
  ],
  ["Edit not accepted or profile restricted", "Respond to the actual Google decision shown."],
] as const

const editRecord = [
  "Old address",
  "New address",
  "Date the edit was submitted",
  "Any verification prompt",
  "Any Google decision",
]

const rankingDonts = [
  "Expose a home address merely because you think ranking will improve",
  "Rent a virtual office simply to appear in another city",
  "Create extra Business Profiles for service areas",
  "Move the map pin toward a target neighbourhood",
  "Claim a co-working storefront customers cannot genuinely visit",
  "Invent branches to occupy additional cities",
]

const suspensionProblems = [
  "Virtual office used as a business location",
  "Service-area home address shown as a storefront",
  "Fake branch",
  "Mail-only location",
  "Customer-facing claim where customers are not genuinely served",
  "Inaccurate map location",
]

const mistakes: [string, string][] = [
  [
    "Showing a home address because the owner works there",
    "If customers are not served there, use the service-area model rather than presenting the home as a storefront.",
  ],
  [
    "Renting a virtual office for another city",
    "A mailing address where the business does not genuinely operate does not create an eligible location.",
  ],
  [
    "Assuming a co-working membership is enough",
    "Customer access, signage and staffing by the business matter.",
  ],
  [
    "Using a PO box as the location",
    "Receiving post does not establish a storefront.",
  ],
  [
    "Creating one profile for every service area",
    "Coverage does not automatically create separate physical business locations.",
  ],
  [
    "Using all 20 areas just because they are available",
    "The maximum is not a target.",
  ],
  [
    "Treating two hours as an exact mileage law",
    "Google describes approximate driving-time guidance, not a universal mileage rule.",
  ],
  [
    "Moving the pin toward the target market",
    "The pin should identify the real physical location.",
  ],
  [
    "Creating a new profile after moving",
    "Update the existing profile for the continuing business and complete any required verification.",
  ],
  [
    "Appealing without correcting the location issue",
    "Fix the underlying compliance problem before asking Google to restore the profile.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "I run a plumbing business from home and customers never visit me",
    [
      "This is a typical service-area situation.",
      "Use truthful underlying business information, but do not present the home as a public walk-in storefront when customers are not served there.",
      "Hide the address from public display and set service areas that accurately reflect where the business travels to customers.",
      "Do not rent another address merely to look more commercial.",
    ],
  ],
  [
    "We rent a desk in a co-working building",
    [
      "A desk rental alone does not establish storefront eligibility.",
      "Check whether the business itself maintains clear signage, receives customers there during business hours and has its own staff there during those hours.",
      "If those facts are not genuinely present, do not present the co-working address as a storefront.",
      "Assess whether the business should instead use a service-area setup.",
    ],
  ],
  [
    "We have a real workshop and also travel to customers",
    [
      "That may be a genuine hybrid business.",
      "If customers visit the workshop during the stated hours and the storefront satisfies Google's requirements, the profile can show the address.",
      "If the business also serves customers at their locations, add accurate service areas.",
      "Do not hide a genuine storefront merely because the business also travels.",
    ],
  ],
  [
    "We serve six cities from one base",
    [
      "One business base serving several towns does not automatically justify six profiles.",
      "Use the real qualifying Business Profile and add the towns or supported areas that genuinely describe normal service coverage.",
      "Create additional profiles only for genuinely separate qualifying operations.",
    ],
  ],
  [
    "We moved the business to a new address",
    [
      "Update the existing Business Profile with the genuine new address.",
      "Do not create another profile merely because the business moved.",
      "Be prepared to verify the new location using the method Google provides.",
      "Keep real evidence of the location and signage where relevant.",
    ],
  ],
]

const readinessChecks = [
  "I know the address currently stored on the Business Profile.",
  "I have confirmed whether it is the actual operating location.",
  "I know whether customers genuinely visit that location.",
  "I know whether the business travels or delivers directly to customers.",
  "I have classified the real model as storefront, service-area or hybrid.",
  "If the address is public, I have checked the genuine storefront requirements.",
  "The location is not a PO box or remote mailbox.",
  "The location is not merely a virtual office where the business does not operate.",
  "If using a co-working location, I have checked signage, customer access and staffing.",
  "If customers are not served at the address, I am not presenting it as a storefront.",
  "My service areas describe normal real-world operations.",
  "I am not using more than Google's current maximum of 20 service areas.",
  "I am not treating the service area as a radius.",
  "I have checked whether the overall service coverage is operationally realistic.",
  "I am not creating one profile for each town served.",
  "Every separate Business Profile represents a genuinely separate qualifying location.",
  "If the business moved, I am updating the existing profile rather than creating a duplicate.",
  "I am prepared for verification after a move.",
  "The map pin identifies the genuine location.",
  "I have preserved genuine location and signage evidence where relevant.",
  "I know the current status of any address edit already submitted.",
  "If the profile is suspended, I will correct the location issue before appealing.",
]

const googlePoints = [
  "Businesses should use a precise and accurate address or service area representing the real business.",
  "Businesses showing an address should maintain permanent fixed signage at that location.",
  "Service-area businesses that do not serve customers at their address should hide the address and use service areas.",
  "Hybrid businesses can use both an address and service areas when the storefront is genuinely customer-facing.",
  "PO boxes and remote mailboxes are not acceptable Business Profile addresses.",
  "A rented mailing address where the business does not actually operate is not an eligible virtual-office location.",
  "A co-working office needs clear signage, customer access during business hours and staffing by the business's own staff to qualify under Google's published rule.",
  "Google allows the map pin to be adjusted when necessary to identify the real physical location.",
  "Service areas use supported geographic areas such as cities and postal codes rather than a current radius setting.",
  "Google currently allows up to 20 service areas.",
  "Google currently advises that the overall service area generally should not extend farther than about two hours of driving time from the business base, while recognising some businesses may appropriately serve larger areas.",
  "A service area does not create a separate physical business location.",
  "Multiple profiles require genuinely separate qualifying locations rather than town-by-town service coverage.",
  "Some age-restricted businesses have additional service-area eligibility limits.",
  "A verified business moving to a new address may need to verify the new location.",
  "Google reviews Business Profile edits for accuracy and compliance.",
  "A legitimate business can still have a location setup that does not comply with Business Profile rules.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-name-rules":
    "How to separate a genuine real-world business name from service, location and marketing wording that belongs elsewhere in the profile.",
  "google-business-profile-categories":
    "How to choose the primary and additional categories without treating categories as a list of local-search keywords.",
}

function ContextualCta({
  heading,
  body,
  ctaLabel,
}: {
  heading: string
  body: string
  ctaLabel: string
}) {
  return (
    <aside className={styles.pilotCta}>
      <h2>{heading}</h2>
      <p>{body}</p>
      <Link className={styles.primaryAction} href="/get-help?service=profile-recovery">
        {ctaLabel}
      </Link>
      <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
    </aside>
  )
}

export function AddressServiceAreaPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.addressPage}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resourceArticleJsonLd(resource)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(resourceBreadcrumbJsonLd(resource, category.title)),
        }}
      />
      <ResourceBreadcrumbs resource={resource} />
      <header className={`${styles.hero} ${styles.wide}`}>
        <p className={styles.eyebrow}>Profile Recovery</p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          <p>
            A Google Business Profile address is not simply the place where a business receives post. It
            should describe where the business genuinely operates and, when the address is shown publicly,
            where customers can actually visit the business.
          </p>
          <p>
            Start with the customer experience. If customers come to the business, you may have a storefront.
            If the business goes to customers and does not serve them at its base, you are dealing with a
            service-area setup. If both happen, the business may be hybrid.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 12 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Which location model matches the real business?</h2>
        <p>
          Choose the model based on how customers actually receive the service, not on which setup looks more
          attractive in local search.
        </p>
        <div className={styles.threeOutcome}>
          {operatingModels.map(([title, question, setup, important]) => (
            <div key={title}>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
              <span className={styles.statusKicker}>Typical setup</span>
              <p>{setup}</p>
              <span className={styles.statusKicker}>Important</span>
              <p>{important}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>The location model should follow the business</h3>
          <p>
            Do not turn a service-area business into a storefront on paper because displaying an address feels
            more valuable.
          </p>
          <p>Do not hide a genuine storefront merely because the business also travels to customers.</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether the business should be storefront, service-area or hybrid?"
        body="Tell us where the business operates, whether customers visit that location and whether the business travels to customers. We can help you identify the location model before you change the profile."
        ctaLabel="Start your Profile Recovery assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>First decide whether customers genuinely visit the location</h2>
        <p>Ask one practical question:</p>
        <p>
          <strong>
            Can a customer genuinely come to this address during the stated business hours and receive the
            business&apos;s normal products or services there?
          </strong>
        </p>
        <p>If yes: the business may have a storefront or hybrid setup.</p>
        <p>
          If no: and the business instead travels or delivers directly to customers, the service-area model is
          usually the relevant starting point.
        </p>
        <p>Do not classify the business from:</p>
        <ul className={styles.proseList}>
          {classifyNotFrom.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Classify it from the real operating model.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A storefront needs a genuine customer-facing location</h2>
        <p>A storefront is not simply an address the business is allowed to use.</p>
        <p>It should be a real place where customers can receive the business&apos;s normal products or services.</p>
        <p>
          Google&apos;s current guidance says businesses showing their address should maintain permanent fixed
          signage of the business name at that address.
        </p>
        <p>Do not show an address merely because:</p>
        <ul className={styles.proseList}>
          {storefrontNotBecause.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Customer-facing operation matters.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A service-area business goes to the customer</h2>
        <p>
          A service-area business visits or delivers to customers directly but does not serve customers at its
          business address.
        </p>
        <p>Common examples can include:</p>
        <ul className={styles.proseList}>
          {serviceAreaExamples.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A service-area business can still have a genuine physical base.</p>
        <p>The difference is:</p>
        <p>
          <strong>customers are not served there.</strong>
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>The business has an address</h3>
            <p>This tells you where the business is based.</p>
          </div>
          <div>
            <h3>The business has a storefront</h3>
            <p>This means customers genuinely receive the business&apos;s normal service at that address.</p>
          </div>
        </div>
        <p>Those statements are not interchangeable.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If customers are not served at the address, do not present it as a storefront</h2>
        <p>
          Google&apos;s current service-area guidance says that businesses which do not serve customers at
          their business address should remove the address from public display and use a service area.
        </p>
        <p>A plumber may legitimately operate from a residential base.</p>
        <p>That does not mean the home needs to be shown publicly as a walk-in plumbing shop.</p>
        <p>The underlying business location can still be genuine.</p>
        <p>The public profile should reflect how customers actually receive the service.</p>
        <p>Use the service-area settings to describe where the business travels to customers.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A home-based business is not automatically ineligible</h2>
        <p>The word:</p>
        <p>
          <strong>home</strong>
        </p>
        <p>is not the policy test.</p>
        <p>The question is how the business operates.</p>
        <p>A legitimate service-area business may be based at the owner&apos;s home and travel to customers.</p>
        <p>
          Where customers are not served at that address, use the service-area model rather than inventing a
          customer-facing storefront.
        </p>
        <p>
          Do not tell a genuine home-based service business that it must rent a shop merely to have a Business
          Profile.
        </p>
        <p>Do not expose the home address simply because somebody believes an address will rank better.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A genuine hybrid business does both</h2>
        <p>A hybrid business:</p>
        <ul className={styles.proseList}>
          <li>Serves customers at its business location</li>
          <li>Also visits or delivers directly to customers</li>
        </ul>
        <p>
          For example, an auto repair business may receive customers at its garage and also provide roadside
          assistance.
        </p>
        <p>A genuine hybrid Business Profile can show:</p>
        <ul className={styles.proseList}>
          <li>Its qualifying storefront address</li>
          <li>Its genuine service area</li>
        </ul>
        <p>The storefront still needs to be real.</p>
        <p>Do not use the hybrid model to preserve an address that customers cannot genuinely visit.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use the real physical business address</h2>
        <p>Google tells businesses to use a precise and accurate address for the actual business location.</p>
        <p>Where appropriate, include genuine:</p>
        <div className={styles.checkGrid}>
          {addressInclude.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not insert unrelated material into the address fields.</p>
        <p>Do not add:</p>
        <ul className={styles.proseList}>
          {addressDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The address should identify the actual physical location.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Receiving post somewhere does not make it a business location</h2>
        <div className={styles.threeOutcome}>
          {mailboxItems.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>Do not use a PO box or remote mailbox merely to obtain a listing in another area.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A virtual office is not a shortcut into another city</h2>
        <p>
          Google&apos;s published guidelines say a rented physical mailing address where the business does not
          actually operate — commonly described as a virtual office — is not an eligible Business Profile
          location.
        </p>
        <p>Do not rent an address in another city merely to create a local profile there.</p>
        <p>An address is not eligible solely because:</p>
        <ul className={styles.proseList}>
          {virtualNotBecause.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The real operation at the location is what matters.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A co-working space needs more than a membership</h2>
        <p>A co-working location is not automatically prohibited.</p>
        <p>It is not automatically eligible either.</p>
        <p>Google&apos;s current guidance says an office in a co-working space can qualify only when the office:</p>
        <div className={styles.checkGrid}>
          {coworkingNeeds.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>
          A hot desk, occasional meeting-room booking or mail-only arrangement does not automatically meet that
          standard.
        </p>
        <p>Assess what the business genuinely does at the location.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the address is shown, permanent signage matters</h2>
        <p>
          Google&apos;s guidelines say businesses showing their address should maintain permanent fixed signage
          of the business name at the location.
        </p>
        <p>Do not create temporary signage merely for:</p>
        <ul className={styles.proseList}>
          {temporarySignageFor.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className={styles.warning}>
          <p>Do not:</p>
          <ul>
            {signageDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Evidence should document what customers genuinely encounter.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Use the map pin to identify the real location</h2>
        <p>Some legitimate addresses are difficult for mapping systems.</p>
        <p>
          Google&apos;s address guidance allows businesses to adjust the map pin when the address does not have
          a street number or when Google cannot identify the correct location.
        </p>
        <p>Use the pin to show the genuine physical location.</p>
        <p>Do not move the pin toward:</p>
        <ul className={styles.proseList}>
          {pinDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>simply for visibility.</p>
        <p>The map marker should help people find the actual business.</p>
      </section>

      <ContextualCta
        heading="Using a home, co-working or unusual business location and not sure whether it qualifies?"
        body="We can compare the current profile with the way the business actually operates before you expose an address, hide one, move the pin or prepare an appeal."
        ctaLabel="Get your location setup reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Service areas describe where the business travels to customers</h2>
        <p>A service area describes the places where the business can visit or deliver to customers.</p>
        <p>Google currently allows service areas to be selected using supported geographic areas such as:</p>
        <ul className={styles.proseList}>
          {geographicAreas.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Use areas the business genuinely serves as part of normal operations.</p>
        <p>
          Do not add every nearby place simply because the business might accept an occasional job there.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google currently allows up to 20 service areas</h2>
        <p>The current limit is:</p>
        <p>
          <strong>up to 20 service areas</strong>
        </p>
        <p>That is a configuration maximum.</p>
        <p>It is not a recommendation to use all 20.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Good use</h3>
            <p>Areas that accurately describe normal service coverage.</p>
          </div>
          <div>
            <h3>Poor use</h3>
            <p>Filling every available slot simply to add more geographic terms.</p>
          </div>
        </div>
        <p>Accuracy matters more than using the maximum number.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Current service areas are not configured as a radius</h2>
        <p>
          Google&apos;s current service-area setup uses supported geographic areas rather than a radius
          distance around the business.
        </p>
        <p>Older profiles may have been configured differently.</p>
        <p>If an old radius setup needs to be edited, use the current supported-area approach.</p>
        <p>Do not build current advice around an obsolete radius-setting workflow.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep the overall service area operationally realistic</h2>
        <p>
          Google currently advises that the boundaries of the overall service area generally should not extend
          farther than about two hours of driving time from where the business is based.
        </p>
        <p>The words:</p>
        <p>
          <strong>generally</strong>
        </p>
        <p>and:</p>
        <p>
          <strong>about</strong>
        </p>
        <p>matter.</p>
        <p>Google also recognises that a larger area may make sense for some businesses.</p>
        <p>Do not turn this guidance into:</p>
        <ul className={styles.proseList}>
          <li>A fixed mileage rule</li>
          <li>A universal maximum distance</li>
          <li>A guarantee that every area within two hours is appropriate</li>
        </ul>
        <p>Ask whether the selected areas genuinely reflect the business&apos;s normal operational reach.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A service area does not create a physical office</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Physical location</h3>
            <p>Where the business actually operates.</p>
          </div>
          <div>
            <h3>Service area</h3>
            <p>Where the business travels or delivers to customers.</p>
          </div>
        </div>
        <p>
          Adding <strong>York</strong> to the service area does not create a York storefront.
        </p>
        <p>
          Adding <strong>Leeds</strong> does not create a Leeds office.
        </p>
        <p>The service area describes coverage.</p>
        <p>It does not establish another physical location.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>One business base does not justify a profile for every town served</h2>
        <p>A single service-area business may serve several towns from one genuine base.</p>
        <p>That does not automatically justify:</p>
        <ul className={styles.proseList}>
          {townProfiles.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>as separate Business Profiles.</p>
        <p>Use the qualifying Business Profile and genuine service areas.</p>
        <p>Do not turn coverage areas into fictional branches.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Genuinely separate staffed locations can be different</h2>
        <p>Some service businesses genuinely operate from more than one location.</p>
        <p>
          Where separate locations genuinely exist with appropriate staff and service areas, separate profiles
          may be appropriate under Google&apos;s rules.
        </p>
        <p>The key point is:</p>
        <p>
          <strong>each claimed location must be a real qualifying operation.</strong>
        </p>
        <p>Do not manufacture separate locations by:</p>
        <ul className={styles.proseList}>
          {fakeLocations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Each location should stand on its own facts.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Some age-restricted businesses have additional service-area limits</h2>
        <p>
          Google&apos;s current service-area guidance includes additional restrictions for businesses
          associated with products or services that require customers to meet a minimum age.
        </p>
        <p>Do not apply ordinary service-area assumptions automatically to those categories.</p>
        <p>Check the current Google eligibility rules for the business involved.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Moving a verified business can require verification again</h2>
        <p>
          Google says that when a verified business moves to a new address, the new location must be verified
          again.
        </p>
        <p>Do not treat the need for verification as proof that the move itself is suspicious.</p>
        <p>Before changing the address, make sure the business can support:</p>
        <ul className={styles.proseList}>
          <li>The genuine new physical location</li>
          <li>Permanent signage where applicable</li>
          <li>Its actual operating presence</li>
          <li>The verification method Google makes available</li>
        </ul>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Read our verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A move usually does not require a second Business Profile</h2>
        <p>If the same continuing business relocates, the normal objective is to update the existing Business Profile.</p>
        <p>Do not create a duplicate merely because:</p>
        <ul className={styles.proseList}>
          <li>The address changed</li>
          <li>Verification is required again</li>
          <li>The edit is taking time</li>
          <li>The old profile already has history attached to it</li>
        </ul>
        <p>Keeping the existing legitimate profile helps avoid unnecessary duplicate and ownership problems.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>An address edit can be under review without the profile being suspended</h2>
        <div className={styles.threeOutcome}>
          {editStates.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>Record:</p>
        <ul className={styles.proseList}>
          {editRecord.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not repeatedly submit different addresses while the first change is still being assessed.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Hiding an address does not mean inventing a location-free business</h2>
        <p>
          A service-area Business Profile can hide its address from customers while still having truthful
          underlying business information.
        </p>
        <p>Hiding the address reflects:</p>
        <p>
          <strong>customers are served at their locations rather than at the business base.</strong>
        </p>
        <p>It does not mean:</p>
        <ul className={styles.proseList}>
          <li>The business has no real base</li>
          <li>The business should invent a location</li>
          <li>Google no longer needs accurate underlying information</li>
        </ul>
        <p>Keep the underlying business information truthful.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not redesign the location setup purely for ranking</h2>
        <p>Do not:</p>
        <ul className={styles.proseList}>
          {rankingDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>The Business Profile should follow the business.</p>
        <p>Do not redesign the business on paper solely for Google Maps.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Correct location problems before a suspension appeal</h2>
        <p>A legitimate business can still have a non-compliant location configuration.</p>
        <p>Possible problems can include:</p>
        <ul className={styles.proseList}>
          {suspensionProblems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>If the profile is suspended or disabled:</p>
        <p>correct the actual address or service-area issue before asking Google to restore the profile.</p>
        <p>
          Do not leave the location problem unchanged and appeal only on the basis that the business itself is
          legitimate.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Read what to do before a suspension appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Where businesses commonly go wrong</h2>
        <div className={styles.mistakeGrid}>
          {mistakes.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What if my business operates differently?</h2>
        <div className={styles.accordion}>
          {scenarios.map(([title, paragraphs]) => (
            <details key={title}>
              <summary>
                {title}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Before changing the address or service area</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>If one of these points is unclear, resolve it before making another location change.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile location and service-area rules
          with ProfileRelaunch&apos;s practical profile-review approach. These are the main points that come
          directly from Google&apos;s current guidance:
        </p>
        <ul className={styles.tickList}>
          {googlePoints.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className={styles.practical}>
          <strong>Our practical view</strong>
          <p>
            Start with how customers actually receive the service. Show a real storefront when customers
            genuinely visit it, hide a non-customer-facing base for a service-area business, use both only for
            a genuine hybrid operation, and treat service coverage as coverage rather than a way to manufacture
            extra locations.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to check the location setup before you change it?</h2>
        <p>
          You don&apos;t need to expose a private home address, rent a virtual office or create another
          Business Profile just to make the location structure look more convincing.
        </p>
        <p>
          Tell us where the business genuinely operates, whether customers visit and where the business
          normally travels. We&apos;ll help you identify likely address or service-area issues and the
          appropriate next Google process.
        </p>
        <div className={styles.pilotConversionActions}>
          <Link className={styles.primaryAction} href="/get-help?service=profile-recovery">
            Start your Profile Recovery assessment
          </Link>
          <Link className={styles.secondaryAction} href="/business-profile-recovery">
            See how Profile Recovery works
          </Link>
        </div>
        <small>No fee to submit • Human-reviewed • No passwords or verification codes</small>
      </section>

      <section className={`${styles.related} ${styles.wide}`}>
        <h2>Useful next guides</h2>
        <div>
          {related.map((item) => (
            <Link className={styles.relatedPilotCard} key={item.slug} href={`/resources/${item.slug}`}>
              <strong>{item.title}</strong>
              <span>{relatedCopy[item.slug] ?? item.excerpt}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${styles.sourcesPilot} ${styles.wide}`}>
        <h2>Official Google sources</h2>
        <p>Google Business Profile Help</p>
        <ul>
          {addressAndServiceAreaRulesSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.aboutPilot} ${styles.wide}`}>
        <h2>About this guide</h2>
        <p>
          This guide is based on Google&apos;s publicly available Business Profile address, service-area,
          eligibility and verification guidance and was last reviewed on 14 September 2026. ProfileRelaunch is
          independent of Google.
        </p>
      </section>
    </article>
  )
}
