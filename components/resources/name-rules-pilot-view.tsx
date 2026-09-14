import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleBusinessProfileNameRulesSources } from "@/lib/resource-articles/google-business-profile-name-rules"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const nameCategories = [
  [
    "Real-world name",
    "Generally supportable",
    "Wording consistently used as the actual business identity across customer-facing branding.",
    [
      "Oakfield Plumbing",
      "A genuine registered trading name that customers actually see",
      "A location word that genuinely belongs to the established brand",
      "A genuine acronym or special character used consistently",
    ],
    "Can the business show real-world use without creating new evidence for Google?",
  ],
  [
    "Needs context and evidence",
    "Check carefully",
    "Wording that can be legitimate in some businesses but should not be assumed automatically.",
    [
      "Ltd, LLC, Inc or another legal term",
      "Special characters",
      "Location-specific brand variations",
      "Department wording",
      "A genuine recent rebrand",
      "Unusual capitalisation that is genuinely part of the brand",
    ],
    "Does the evidence show that customers genuinely know the business by this version?",
  ],
  [
    "Extra descriptive or promotional wording",
    "Usually belongs elsewhere",
    "Information added to describe, promote or target the business rather than identify it.",
    [
      "Services",
      "Products",
      "City keywords added only for search targeting",
      "Marketing slogans",
      "Opening hours",
      "Phone numbers",
      "Website URLs",
      "Store codes used only internally",
    ],
    "Would this wording exist in the business name if Google Search did not exist?",
  ],
] as const

const realWorldCompare = [
  "Storefront signage where applicable",
  "Website",
  "Stationery",
  "Established branding",
  "The name customers actually know",
]

const profileFields = [
  ["Business name", "Who is the business?"],
  ["Category", "What kind of business is it?"],
  ["Address or service area", "Where does it operate?"],
  ["Hours", "When is it open?"],
  ["Website and phone", "How can customers contact it?"],
] as const

const hoursDonts = ["Open 24 Hours", "Open Late", "Open Sundays", "Closed"]

const legalSuffixes = ["Limited", "Ltd", "LLC", "Inc", "PLC", "another legal suffix"]

const characterEvidence = [
  "Signage",
  "Business cards",
  "Invoices",
  "Website branding",
  "Other established brand material",
]

const evidenceMap = [
  [
    "Permanent signage",
    "The identity customers encounter at a physical location.",
    "",
  ],
  [
    "Website branding",
    "How the business publicly presents itself online.",
    "",
  ],
  [
    "Stationery and commercial material",
    "Consistent day-to-day use of the business identity.",
    "",
  ],
  [
    "Invoices or business cards",
    "Established use in normal business activity.",
    "",
  ],
  [
    "Registration or trading-name records",
    "Legal or formal identity.",
    "Formal identity and customer-facing identity are related but not automatically identical.",
  ],
] as const

const signageDonts = [
  "Create a temporary sign for a screenshot",
  "Add keyword-heavy wording to a door solely for Google",
  "Digitally alter photographs",
  "Present signage from another location as evidence for this one",
]

const branchRenames = ["Brand Leeds", "Brand York", "Brand Manchester"]

const genuineRebrandItems = [
  "New signage",
  "New website branding",
  "New stationery",
  "Customer communications",
  "Updated commercial material",
  "Updated legal or trading records where appropriate",
]

const editStates = [
  ["Edit accepted", "The updated information publishes."],
  ["Edit pending or under review", "Google has not necessarily made the final decision yet."],
  ["Edit not approved", "Google rejected that information change."],
] as const

const appealEvidence = [
  "Permanent signage",
  "Website branding",
  "Stationery",
  "Invoices",
  "Business cards",
  "Official registration documents",
  "Licences",
  "Other legitimate commercial records",
]

const renameCycle = [
  "Business Name Leeds",
  "Business Name Leeds UK",
  "Business Name Plumbing Leeds",
  "Best Business Name Leeds",
]

const onceIdentified = [
  "Use that name consistently",
  "Preserve the supporting evidence",
  "Follow the appropriate Google process",
]

const profileAlreadyHas = ["Reviews", "Visibility", "History"]

const mistakes: [string, string][] = [
  [
    "Treating the name as an SEO field",
    "Google's naming rule is based on real-world identity. Services, categories and locations have their own fields.",
  ],
  [
    "Adding a city because competitors do it",
    "Location wording belongs in the name only when it genuinely forms part of the consistently used real-world name.",
  ],
  [
    "Adding every important service",
    "A service list is not automatically the business name.",
  ],
  [
    "Assuming the registered company name settles everything",
    "Formal records help, but Google also looks at how the business is represented and recognised in the real world.",
  ],
  [
    "Adding Ltd, LLC or Inc automatically",
    "Legal suffixes should not be added solely because they appear on registration documents.",
  ],
  [
    "Removing a genuine special character without checking",
    "A real established brand may legitimately use special characters.",
  ],
  [
    "Creating temporary signage for an appeal",
    "Evidence should document the existing real business rather than manufacture an identity.",
  ],
  [
    "Renaming an established profile into another business",
    "A significant identity change is not necessarily an ordinary information edit.",
  ],
  [
    "Assuming a rejected name edit means suspension",
    "A name edit can be rejected while the Business Profile itself remains active.",
  ],
  [
    "Appealing before correcting the name problem",
    "If a suspended profile does not follow Google's naming rules, correct the compliance issue before requesting reinstatement.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    'Our company is legally "Oakfield Plumbing Ltd" but our signs say "Oakfield Plumbing"',
    [
      "Start with the real-world customer-facing representation.",
      "If signage, website and established branding consistently use Oakfield Plumbing, do not assume Ltd must be added solely because it appears in the company-registration record.",
      "Keep the legal document as legitimate business evidence.",
      "Assess the public Business Profile name against Google's real-world naming rule.",
    ],
  ],
  [
    'We want to add "Leeds Boiler Repair" to our name',
    [
      "Ask whether Leeds Boiler Repair genuinely forms part of the recognised business name.",
      "If the business is actually known as Oakfield Heating, do not append location and service wording merely because those terms describe the market you want to reach.",
      "Use Google's service-area and category features for those facts.",
      "If the full wording genuinely is the established brand, preserve the real-world evidence.",
    ],
  ],
  [
    "We genuinely rebranded the business",
    [
      "Make sure the rebrand exists outside Google.",
      "Check consistent evidence across signage, website, stationery, customer communications, commercial materials and relevant formal records.",
      "Then update the Business Profile to reflect the genuine new identity.",
      "Be prepared for the possibility of verification.",
      'Do not use "rebrand" as a label for a Google-only keyword change.',
    ],
  ],
  [
    "Google rejected our legitimate name edit",
    [
      "First confirm the exact Google state.",
      "Check whether:",
      "The edit is still pending",
      "The edit was not approved",
      "The profile itself is restricted",
      "Verification is required",
      "Then organise the real-world evidence supporting the requested name.",
      "Use Google's current route for that decision and business location.",
      "Do not repeatedly submit slightly different names while the issue is unresolved.",
    ],
  ],
  [
    "Our profile is suspended and the name contains several keywords",
    [
      "Compare the current Google name with the business's genuine real-world identity.",
      "Remove unsupported service, location, marketing or other additions.",
      "Make the profile compliant before appealing.",
      "Prepare genuine evidence supporting the real business name and other relevant profile facts.",
      "Do not create a replacement profile while the suspension appeal is being handled.",
    ],
  ],
]

const readinessChecks = [
  "I have written down the name currently shown on Google.",
  "I know the name customers genuinely recognise.",
  "I have checked genuine permanent signage where applicable.",
  "I have checked the business website branding.",
  "I have checked established stationery and commercial materials.",
  "I have marked any added service or product terms.",
  "I have marked any added city, neighbourhood or street wording.",
  "I have marked any marketing slogan.",
  "I have marked any opening-hours or status wording.",
  "I have marked any phone number or website wording in the name.",
  "I know whether a legal suffix genuinely forms part of the public brand.",
  "I know whether special characters genuinely belong to the brand.",
  "I know whether unusual capitalisation is genuine branding.",
  "For multiple locations, I know whether the branches genuinely use different names.",
  "If this is a rebrand, the new identity exists outside Google.",
  "I am not creating signage or documents merely to justify the Google name.",
  "I understand a verified profile might require verification after a name change.",
  "I understand a rejected edit is not automatically a suspension.",
  "If the profile is suspended, I will correct the naming issue before appealing.",
  "I have kept genuine evidence supporting the final name.",
]

const googlePoints = [
  "A Business Profile name should accurately represent the business's real-world name.",
  "Google refers to consistent representation on storefronts, websites, stationery and other branding and to the name known to customers.",
  "Information such as address, service area, hours and category belongs in the appropriate Business Profile fields.",
  "Google's naming examples restrict unnecessary marketing taglines.",
  "Google's naming examples restrict store codes that are not part of the public name.",
  "Google's naming examples restrict unnecessary capitalisation.",
  "Google's naming examples restrict business-hours information in the name.",
  "Phone numbers and website addresses normally belong in their dedicated fields.",
  "Service or product wording should not be added merely because the business offers those services or products.",
  "Location information should not be added merely to target searches when it is not part of the real-world name.",
  "Legal terms or special characters can require real-world support when they genuinely form part of the business name.",
  "Google warns that unnecessary information in the Business Profile name can result in suspension.",
  "Changing a verified Business Profile name might require verification again.",
  "Google may reject edits that significantly change the identity of the business.",
  "A rejected business-information edit is not automatically a suspension.",
  "Google tells suspended businesses to make sure the profile follows its guidelines before appealing.",
  "Google's current route for certain rejected Business Profile information edits can differ by region.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-address-and-service-area-rules":
    "How Google's storefront, service-area, home-address, virtual-office and location rules affect the information shown on a Business Profile.",
  "google-business-profile-categories":
    "How to choose a primary category, use additional categories and keep service keywords out of the wrong Business Profile fields.",
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

export function NameRulesPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.namePage}`}>
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
            Your Google Business Profile name is not a place to describe everything the business does.
            Google&apos;s rule is based on real-world identity: the profile name should reflect the name the
            business consistently uses and is recognised by outside Google.
          </p>
          <p>
            Start with what appears on genuine signage, the business website, established stationery and
            branding, and the name customers actually know. Services, locations and search phrases should
            not be added simply because they may describe the business or attract searches.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Which kind of name wording are you dealing with?</h2>
        <p>
          Do not judge a Business Profile name by length alone. Ask why each word is there and whether the
          real business actually uses it.
        </p>
        <div className={styles.threeOutcome}>
          {nameCategories.map(([title, label, body, examples, question]) => (
            <div key={title}>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>{label}</span>
              <p>{body}</p>
              <span className={styles.statusKicker}>Examples</span>
              <ul>
                {examples.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
            </div>
          ))}
        </div>
        <div className={styles.warning}>
          <h3>Start with identity, not SEO</h3>
          <p>Do not ask:</p>
          <p>&quot;What keywords do we want to rank for?&quot;</p>
          <p>Ask:</p>
          <p>&quot;What is this business actually called?&quot;</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure whether the current name reflects the real business or has extra wording?"
        body="Tell us what the Business Profile says and what appears on the business's genuine signage, website and established branding. We can help you identify where the name may differ from Google's real-world naming rule."
        ctaLabel="Start your Profile Recovery assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Start with the name customers recognise in the real world</h2>
        <p>
          Google says the Business Profile should accurately represent the business as it is recognised in
          the real world.
        </p>
        <p>For the business name, compare the profile with genuine use across:</p>
        <div className={styles.checkGrid}>
          {realWorldCompare.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>One item does not always settle the question by itself.</p>
        <p>Look for a consistent real-world identity across the available evidence.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Keep information in the field designed for it</h2>
        <p>Google provides separate Business Profile fields for information such as:</p>
        <ul className={styles.proseList}>
          <li>Category</li>
          <li>Address</li>
          <li>Service area</li>
          <li>Opening hours</li>
          <li>Website</li>
          <li>Phone number</li>
        </ul>
        <p>The business name should identify the business.</p>
        <div className={styles.signalGrid}>
          {profileFields.map(([title, question]) => (
            <div className={styles.signalItem} key={title}>
              <h3>{title}</h3>
              <p>{question}</p>
            </div>
          ))}
        </div>
        <p>Do not compress the whole Business Profile into the name field.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Services and products do not automatically belong in the name</h2>
        <p>If the recognised business name is:</p>
        <p>
          <strong>Greenline Heating</strong>
        </p>
        <p>the profile does not automatically become:</p>
        <p>
          <strong>Greenline Heating Boiler Repair Emergency Gas Engineer</strong>
        </p>
        <p>simply because the business provides those services.</p>
        <p>Likewise:</p>
        <p>
          <strong>Parkside Motors</strong>
        </p>
        <p>does not automatically become:</p>
        <p>
          <strong>Parkside Motors MOT Tyres Servicing Used Cars</strong>
        </p>
        <p>because those are products or services the company offers.</p>
        <p>
          Service or product wording may legitimately form part of a real-world business identity in some
          cases.
        </p>
        <p>
          The test is whether the longer wording is actually the recognised business name, not whether the
          services are relevant.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A marketing slogan is not automatically part of the business name</h2>
        <p>A business may legitimately advertise with a phrase such as:</p>
        <p>
          <strong>Fast service. Fair prices.</strong>
        </p>
        <p>That does not automatically make the Google name:</p>
        <p>
          <strong>Company Name - Fast Service Fair Prices</strong>
        </p>
        <p>Marketing language and business identity are different things.</p>
        <p>
          Use promotional wording in appropriate marketing material rather than attaching it to the Business
          Profile name unless it genuinely forms part of the recognised name.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Opening hours and status belong in the hours fields</h2>
        <p>Do not add wording such as:</p>
        <ul className={styles.proseList}>
          {hoursDonts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>to the Business Profile name merely to communicate availability.</p>
        <p>Use Google&apos;s hours features for operating information.</p>
        <p>A temporary change in opening pattern is not a reason to rewrite the business identity.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Phone numbers and website addresses normally belong elsewhere</h2>
        <p>In ordinary cases, use Google&apos;s dedicated phone and website fields.</p>
        <p>Do not convert:</p>
        <p>
          <strong>Business Name</strong>
        </p>
        <p>into:</p>
        <p>
          <strong>Business Name - 01234 567890</strong>
        </p>
        <p>or:</p>
        <p>
          <strong>BusinessNameExample.com</strong>
        </p>
        <p>simply to make contact information more visible.</p>
        <p>
          Google&apos;s policy recognises that unusual real-world brands can sometimes contain wording that
          resembles a web address or other unusual format.
        </p>
        <p>Keep the same test:</p>
        <p>Is that genuinely the recognised business name?</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The legal company name and customer-facing name may differ</h2>
        <p>A company might legally be registered as:</p>
        <p>
          <strong>Oakfield Services Limited</strong>
        </p>
        <p>while customers consistently know it as:</p>
        <p>
          <strong>Oakfield Services</strong>
        </p>
        <p>Do not assume that:</p>
        <ul className={styles.proseList}>
          {legalSuffixes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>must automatically appear on the Business Profile because it exists in corporate records.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Legal record</h3>
            <p>Useful evidence of the business entity.</p>
          </div>
          <div>
            <h3>Customer-facing real-world name</h3>
            <p>The name consistently represented to customers.</p>
          </div>
        </div>
        <p>
          Where the legal term genuinely forms part of the recognised public name, keep evidence showing
          that consistent use.
        </p>
        <p>The question is not only:</p>
        <p>&quot;What is written on the incorporation certificate?&quot;</p>
        <p>It is:</p>
        <p>
          <strong>How is the business consistently represented to customers?</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Special characters are not automatically wrong</h2>
        <p>Do not add decorative symbols purely to make the listing stand out.</p>
        <p>But do not remove a genuine brand character merely because it looks unusual.</p>
        <p>Where a special character genuinely forms part of the established name, evidence can include:</p>
        <div className={styles.checkGrid}>
          {characterEvidence.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Do not invent a special character for Google.</p>
        <p>Do not remove a genuine one without checking the real-world evidence.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A city or neighbourhood belongs in the name only when it genuinely belongs to the brand</h2>
        <p>Serving a city does not automatically make that city part of the business name.</p>
        <p>A business serving Leeds is not automatically:</p>
        <p>
          <strong>Business Name Leeds</strong>
        </p>
        <p>and a business operating in Manchester is not automatically:</p>
        <p>
          <strong>Business Name Manchester</strong>
        </p>
        <p>just because those locations are commercially important.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Genuine location-based brand</h3>
            <p>The location wording is consistently part of the real-world business identity.</p>
          </div>
          <div>
            <h3>Search-targeting addition</h3>
            <p>The location wording was added to Google because the business wants to rank in that area.</p>
          </div>
        </div>
        <p>
          Use the address and service-area fields for location information that is not genuinely part of
          the business name.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-address-and-service-area-rules"
        >
          Read our address and service-area guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A competitor&apos;s listing is not evidence for your own name</h2>
        <p>You may see competing profiles using names such as:</p>
        <p>
          <strong>Best Emergency Plumber Leeds 24 Hour Boiler Repair</strong>
        </p>
        <p>That does not prove that the format follows Google&apos;s rules.</p>
        <p>Do not make your Business Profile less accurate because another listing appears to be doing it.</p>
        <p>Your evidence is your own real-world business identity.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Build the name from evidence, not from one document</h2>
        <p>
          A registration document can help establish identity, but it does not automatically prove that
          every word belongs in the customer-facing Business Profile name.
        </p>
        <div className={styles.signalGrid}>
          {evidenceMap.map(([title, help, important], index) => (
            <div className={styles.signalItem} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>What it helps show</span>
              <p>{help}</p>
              {important ? (
                <>
                  <span className={styles.statusKicker}>Important</span>
                  <p>{important}</p>
                </>
              ) : null}
            </div>
          ))}
        </div>
        <p>The strongest picture is genuine consistency across the relevant materials.</p>
        <p>
          Do not change one website heading or create temporary evidence purely to support a Google
          submission.
        </p>
      </section>

      <ContextualCta
        heading="Have several versions of the business name and aren't sure which one the evidence supports?"
        body="We can compare the Business Profile name with the genuine signage, website, trading records and established branding before you edit the profile or prepare an appeal."
        ctaLabel="Get your profile name reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Permanent signage can be useful evidence</h2>
        <p>
          For a customer-facing location, physical signage can help show the identity customers actually
          encounter.
        </p>
        <p>Use genuine existing signage.</p>
        <div className={styles.warning}>
          <p>Do not:</p>
          <ul>
            {signageDonts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p>Evidence should document the real business rather than create a new identity for the submission.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Capitalisation should follow the genuine brand</h2>
        <p>Do not change:</p>
        <p>
          <strong>Oakfield Plumbing</strong>
        </p>
        <p>to:</p>
        <p>
          <strong>OAKFIELD PLUMBING</strong>
        </p>
        <p>simply for visual emphasis.</p>
        <p>At the same time, genuine acronyms or brands may legitimately use unusual capitalisation.</p>
        <p>The question remains:</p>
        <p>
          <strong>How is the recognised brand actually written?</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Internal store numbers do not automatically belong in the public name</h2>
        <p>An internal branch code can be useful operationally.</p>
        <p>That does not automatically make it part of the name customers recognise.</p>
        <p>
          Do not insert internal identifiers into the Business Profile name merely to distinguish locations
          inside your own organisation.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Multi-location businesses should follow the real brand structure</h2>
        <p>
          Where locations within the same country use the same real-world business name, Google expects
          naming to remain consistent.
        </p>
        <p>Do not independently rename branches:</p>
        <ul className={styles.proseList}>
          {branchRenames.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>simply to target separate local searches.</p>
        <p>
          If location-specific wording genuinely forms part of a recognised branch, sub-brand or real-world
          identity, preserve the evidence showing that.
        </p>
        <p>Consistency should follow the actual brand, not a local-search experiment.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A genuine rebrand is different from a Google-only keyword change</h2>
        <p>Real businesses change names.</p>
        <p>A genuine rebrand can involve:</p>
        <div className={styles.checkGrid}>
          {genuineRebrandItems.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Genuine rebrand</h3>
            <p>
              The business identity changed outside Google and the Business Profile is being updated to
              reflect it.
            </p>
          </div>
          <div>
            <h3>Google-only rename</h3>
            <p>
              The real-world business stayed the same but extra services or locations were inserted into
              the Google name.
            </p>
          </div>
        </div>
        <p>Do not use &quot;rebrand&quot; as a label for keyword stuffing.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A verified profile might need verification again after a name change</h2>
        <p>
          Google says changing a business name after verification might require the business to verify
          again.
        </p>
        <p>The word:</p>
        <p>
          <strong>might</strong>
        </p>
        <p>matters.</p>
        <p>Do not promise that every name edit triggers verification.</p>
        <p>Do not promise that verification will never be required.</p>
        <p>
          Before a significant name change, make sure the business can support the genuine new identity if
          Google asks.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Read our verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A materially different business may not be an ordinary name edit</h2>
        <p>
          A genuine rename of the same continuing business is different from turning an established Business
          Profile into another business.
        </p>
        <p>Google may reject edits that appear to change the business&apos;s identity significantly.</p>
        <p>Do not reuse an established profile simply because it already has:</p>
        <ul className={styles.proseList}>
          {profileAlreadyHas.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>if the business itself has materially changed into something else.</p>
        <p>Keep ordinary naming updates separate from replacement-business questions.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A rejected name edit is not automatically a suspended profile</h2>
        <div className={styles.threeOutcome}>
          {editStates.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>
          A rejected business-name edit does not automatically mean the entire Business Profile has been
          suspended.
        </p>
        <p>Check what Google has actually restricted.</p>
        <p>Do not create another profile merely because the name edit did not publish.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>If the profile is suspended, correct the naming issue before appealing</h2>
        <p>
          Google&apos;s reinstatement guidance tells businesses to make sure the Business Profile follows
          the guidelines before appealing a suspension or disablement.
        </p>
        <p>A real business can still have a non-compliant Business Profile name.</p>
        <p>If unsupported service, location, marketing or other wording is present:</p>
        <p>bring the name into line with the real business before asking Google to restore the profile.</p>
        <p>Do not keep a keyword-stuffed name and argue only that the underlying business is legitimate.</p>
        <p>Business legitimacy and profile compliance are separate questions.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Read what to do before a suspension appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>
          If Google asks for evidence, make sure it supports the name you are asking Google to accept
        </h2>
        <p>Depending on the case, relevant evidence can include:</p>
        <div className={styles.checkGrid}>
          {appealEvidence.map((item) => (
            <span key={item}>
              <Check size={16} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <p>Different documents prove different things.</p>
        <p>
          Do not assume a registration certificate by itself proves that every descriptor on the Google
          listing belongs in the customer-facing business name.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-appeal-evidence-checklist"
        >
          Read our Business Profile appeal evidence checklist →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The route for a rejected name edit can depend on the business location</h2>
        <p>
          Google&apos;s current appeals guidance distinguishes between some rejected Business Profile
          information edits in the UK or EEA and businesses elsewhere.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>UK or EEA</h3>
            <p>
              Google&apos;s current guidance allows certain rejected business-information edits, including
              name changes, to use the Business Profile appeals tool.
            </p>
          </div>
          <div>
            <h3>Outside the UK or EEA</h3>
            <p>
              Google&apos;s current guidance can direct rejected information-edit cases through Google&apos;s
              contact route instead.
            </p>
          </div>
        </div>
        <p>Do not give every customer the same appeal instructions.</p>
        <p>Check the Google route that applies to the actual business location and decision.</p>
        <p>Do not describe this as legal advice.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not cycle through keyword variations while a decision is unresolved</h2>
        <p>Once you have identified the correct real-world name:</p>
        <ul className={styles.proseList}>
          {onceIdentified.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Do not cycle through variations such as:</p>
        <ul className={styles.proseList}>
          {renameCycle.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>hoping one version survives moderation.</p>
        <p>The objective is compliance, not finding the keyword combination that happens to be accepted.</p>
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
        <h2>What if my business-name situation is different?</h2>
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
        <h2>Before changing the Business Profile name</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>If one of these points is unclear, resolve it before making another name change.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile naming and appeal guidance
          with ProfileRelaunch&apos;s practical evidence-review approach. These are the main points that
          come directly from Google&apos;s current guidance:
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
            Build the Google name from the business that already exists in the real world. If a word needs
            a search-marketing explanation rather than a real-world identity explanation, check carefully
            whether it belongs in the name at all.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to compare your Google name with the real-world evidence?</h2>
        <p>
          You don&apos;t need to guess whether every word should stay or remove legitimate branding simply
          because the name looks unusual.
        </p>
        <p>
          Tell us what the Business Profile says and what the business genuinely uses on its signage,
          website and established materials. We&apos;ll help you identify likely naming issues and the
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
          {googleBusinessProfileNameRulesSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile naming, editing and
          appeal guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of
          Google.
        </p>
      </section>
    </article>
  )
}
