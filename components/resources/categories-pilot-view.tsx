import Link from "next/link"
import { ArrowUpRight, Check, ChevronDown } from "lucide-react"
import { googleBusinessProfileCategoriesSources } from "@/lib/resource-articles/google-business-profile-categories"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import styles from "./resource-article.module.css"

const categoryLayers = [
  [
    "Primary category",
    "What kind of business is this fundamentally?",
    "Describe the business as a whole.",
    "A business whose core operation is plumbing should start with the most accurate available plumbing-related category rather than a category for one individual job it performs.",
    "Choose the most specific available category that truthfully describes the core business.",
  ],
  [
    "Additional categories",
    "Does the same business genuinely operate in another substantial way?",
    "Describe important secondary parts of the same business.",
    "A business may have another genuine operating function that is accurately described by an additional Google category.",
    "Add only categories that genuinely help explain what the same business is.",
  ],
] as const

const serviceExamples = ["Leak repair", "Boiler work", "Swimming pool", "ATM", "Individual products"]

const cannotInvent = [
  "Adding the missing phrase to the business name",
  "Selecting an inaccurate category",
  "Choosing a neighbouring industry that does not describe the business",
  "Creating another Business Profile with a different identity",
]

const plumbingServices = ["Leak repair", "Boiler work", "Pipe replacement", "Emergency call-outs"]

const hotelHas = ["A swimming pool", "An ATM", "A restaurant"]

const featureExamples = [
  "Hotels",
  "Restaurants",
  "Health and beauty businesses",
  "Other specialised business types",
]

const rankingFactors = [
  [
    "Relevance",
    "How well the Business Profile matches what somebody is searching for.",
    "Category can help Google understand the business.",
  ],
  [
    "Distance",
    "How far the potential result is from the location involved in the search.",
    "A category does not erase distance.",
  ],
  [
    "Prominence",
    "How well-known or established the business appears to Google.",
    "A category does not replace prominence.",
  ],
] as const

const rankingPromises = [
  "Change this category and you will rank number one.",
  "This additional category guarantees Maps visibility.",
]

const competitorMay = [
  "Operate a different business model",
  "Have a different core service",
  "Have a different location setup",
  "Use a category that is inaccurate for its own business",
  "Rank for reasons unrelated to category",
]

const genuineChange = [
  "Change its core service",
  "Stop one line of work",
  "Expand into another real business model",
  "Reorganise a department",
  "Rebrand around an actual operational change",
]

const statusStates = [
  ["Verification requested", "Google wants the business to verify again."],
  ["Category edit pending", "The information change is still being reviewed."],
  ["Category edit rejected", "Google did not accept that particular change."],
  ["Profile suspended or restricted", "The Business Profile itself has a broader policy restriction."],
] as const

const switchingExample = [
  "Plumber",
  "Heating contractor",
  "Boiler supplier",
  "Bathroom remodeler",
  "Emergency service",
]

const complianceFields = [
  "Business name",
  "Address or service area",
  "Eligibility",
  "Ownership",
  "Website and contact information",
  "Other profile details",
]

const rejectedChecks = [
  "Is the existing profile still active?",
  "Is Google requesting verification?",
  "Is the category edit simply not approved?",
  "Is the whole profile suspended or restricted?",
  "Does the existing profile already represent the same business?",
]

const worksheet = [
  [
    "Core business",
    "What does the business fundamentally do?",
    "Candidate primary category.",
  ],
  [
    "Google category availability",
    "What is the most specific available Google category that truthfully fits?",
    "Confirmed primary category or closest accurate general option.",
  ],
  [
    "Secondary business functions",
    "Which other substantial parts are genuinely operated by the same business?",
    "Possible additional categories.",
  ],
  [
    "Services and amenities",
    "Which items are merely services, products, facilities or amenities?",
    "Keep them out of the category list unless they genuinely represent a business classification.",
  ],
  [
    "Change risk",
    "Is the profile already under review, requesting verification or subject to another restriction?",
    "Choose the appropriate Google process before making further category changes.",
  ],
] as const

const mistakes: [string, string][] = [
  [
    "Treating categories as keywords",
    "Google says categories should describe the business and should not be used solely as search keywords.",
  ],
  [
    "Adding a category for every service",
    "Services and products do not automatically need separate categories.",
  ],
  [
    "Using all nine additional categories",
    "Nine is the current maximum, not a target.",
  ],
  [
    "Copying the highest-ranking competitor",
    "Their category may reflect a different business model or may itself be inaccurate.",
  ],
  [
    "Choosing an inaccurate category because the exact one is unavailable",
    "Use the closest accurate general category rather than an unrelated category.",
  ],
  [
    "Choosing a category solely to unlock a feature",
    "Category-specific features should follow the real business classification.",
  ],
  [
    "Promising a ranking result from a category edit",
    "Category can affect relevance, but local ranking involves other factors too.",
  ],
  [
    "Repeatedly switching the primary category",
    "Frequent experiments do not replace a truthful business classification.",
  ],
  [
    "Treating re-verification as suspension",
    "A verification request after a category edit is a different state from suspension.",
  ],
  [
    "Creating a duplicate after a rejected edit",
    "Use the existing profile's appropriate process rather than creating another listing for the same business.",
  ],
]

const scenarios: [string, string[]][] = [
  [
    "We are plumbers but also install bathrooms",
    [
      "Start with the core business.",
      "If the company is fundamentally a plumbing business, choose the most accurate available plumbing-related category as the primary category.",
      "A genuine secondary category may be appropriate only if another substantial business function accurately fits Google's available category list.",
      "Do not create categories for every individual plumbing service.",
    ],
  ],
  [
    "Our exact category does not exist",
    [
      "Do not invent one.",
      "Do not insert the missing category phrase into the business name merely to compensate.",
      "Choose the closest more general Google category that accurately describes the business.",
      "Use the closest defensible option from Google's actual list.",
    ],
  ],
  [
    "A competitor ranks above us with a different primary category",
    [
      "Do not change categories merely to copy the competitor.",
      "Compare the real business models first.",
      "They may operate differently, or their category may not be appropriate for your business.",
      "Ranking is influenced by more than category alone.",
      "Choose the category that accurately describes your own operation.",
    ],
  ],
  [
    "We changed the primary category and Google asks us to verify again",
    [
      "Do not assume the profile is suspended.",
      "Google says adding or editing a category might lead to a verification request.",
      "Check the exact state.",
      "Complete the verification method Google provides if required.",
      "Do not create another profile merely to avoid re-verification.",
    ],
  ],
  [
    "Our Business Profile has ten different categories",
    [
      "Review them one by one.",
      "Keep the primary category that best describes the core business.",
      "Then assess each additional category against a simple test: Does this genuinely describe a substantial part of the same business?",
      "Remove categories that are merely individual services, amenities, loosely related industries or search targets.",
      "The maximum available number is not a target.",
    ],
  ],
]

const readinessChecks = [
  "I have recorded the current primary category.",
  "I have recorded every current additional category.",
  "I can describe the business's actual core activity in plain English.",
  "I have identified the most specific available Google category that accurately fits the core business.",
  "If the exact category does not exist, I have chosen the closest accurate general category.",
  "I have not invented a category.",
  "I have separated business categories from individual services and products.",
  "I have separated business categories from amenities and features.",
  "Each additional category describes a genuine substantial part of the same business.",
  "I am not filling additional category slots merely because they are available.",
  "I understand Google currently allows up to nine additional categories.",
  "I am not copying a competitor's category solely because they rank above me.",
  "I am not choosing a category solely to unlock a feature.",
  "I understand category can affect relevance but does not guarantee ranking.",
  "If the core business genuinely changed, I can explain the real operational change.",
  "I understand a category edit might require verification again.",
  "I understand a verification request is not automatically suspension.",
  "I am not repeatedly switching categories while Google is reviewing an edit.",
  "Comparable locations use category logic that reflects their real operating model.",
  "If the profile is suspended, I am reviewing category together with the other compliance fields.",
  "I am not creating a duplicate profile merely to obtain another category.",
]

const googlePoints = [
  "Businesses should choose a primary category that best describes the business.",
  "Google advises businesses to choose a specific available category when it accurately fits.",
  "If an exact category is unavailable, Google says to choose a more general category that still accurately describes the business.",
  "Businesses cannot create their own custom Business Profile category.",
  "Additional categories can describe other genuine parts of the same business.",
  "Google currently allows up to nine additional categories.",
  "Businesses do not need to use all available additional-category slots.",
  "Google tells businesses not to select a category for every product or service.",
  "Categories should describe what the business is rather than everything it has or offers.",
  "Separately operated businesses should not automatically be represented as categories of the host business.",
  "Some Business Profile features depend on business category.",
  "Categories can affect local ranking.",
  "Google says local results are mainly based on relevance, distance and prominence.",
  "Selecting or changing a category does not guarantee a particular local ranking.",
  "Adding or editing a category might require the business to verify again.",
  "A verification request is different from a suspension.",
  "Comparable locations representing the same type of business should use appropriate consistent category classification.",
  "A rejected category edit does not itself justify creating a duplicate Business Profile.",
]

const relatedCopy: Record<string, string> = {
  "google-business-profile-name-rules":
    "How to keep the business name aligned with the real-world brand rather than turning it into a list of services and search terms.",
  "google-business-profile-address-and-service-area-rules":
    "How storefront, service-area and hybrid Business Profiles should represent where the business genuinely operates and serves customers.",
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

export function CategoriesPilotView({
  resource,
  related,
}: {
  resource: ResourceRecord
  related: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)

  return (
    <article className={`${styles.page} ${styles.pilotPage} ${styles.categoryPage}`}>
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
            Your Google Business Profile category tells Google what kind of business you are. It is not a list
            of every product, service or search phrase you would like the profile to appear for.
          </p>
          <p>
            Start with the primary category that best describes the business as a whole. Then add other
            categories only where they genuinely describe substantial secondary parts of the same business.
            Keep detailed services, products and amenities in the parts of the profile designed for them.
          </p>
        </div>
        <p className={styles.pilotMeta}>Last reviewed 14 September 2026 · 11 min read</p>
      </header>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Put each business fact in the right category layer</h2>
        <p>
          Before adding another category, decide whether you are describing the business itself, a genuine
          secondary part of it, or simply something it sells or provides.
        </p>
        <div className={styles.threeOutcome}>
          {categoryLayers.map(([title, question, purpose, example, rule]) => (
            <div key={title}>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
              <span className={styles.statusKicker}>Purpose</span>
              <p>{purpose}</p>
              <span className={styles.statusKicker}>Example</span>
              <p>{example}</p>
              <span className={styles.statusKicker}>Rule</span>
              <p>{rule}</p>
            </div>
          ))}
          <div>
            <h3>Services, products and amenities</h3>
            <span className={styles.statusKicker}>Question</span>
            <p>Is this something the business offers or contains rather than what the business itself is?</p>
            <span className={styles.statusKicker}>Purpose</span>
            <p>Describe the detailed offering in the appropriate Business Profile features.</p>
            <span className={styles.statusKicker}>Examples</span>
            <ul>
              {serviceExamples.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className={styles.statusKicker}>Rule</span>
            <p>Do not turn every service, product or amenity into a business category.</p>
          </div>
        </div>
        <div className={styles.warning}>
          <h3>Ask &quot;what is the business?&quot;, not &quot;what searches do we want?&quot;</h3>
          <p>A category should make the business easier to classify accurately.</p>
          <p>Do not treat each category slot as an SEO keyword field.</p>
        </div>
      </section>

      <ContextualCta
        heading="Not sure which category should be primary and which ones are unnecessary?"
        body="Tell us what the business actually does, which categories are currently selected and which change you are considering. We can help you review the structure before you edit the profile."
        ctaLabel="Start your Profile Recovery assessment"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Choose the primary category for what the business actually is</h2>
        <p>Google says the primary category should best describe the business.</p>
        <p>Start with the core business model.</p>
        <p>Ask:</p>
        <p>
          <strong>What kind of business would a customer say this is?</strong>
        </p>
        <p>A restaurant should not choose its primary category merely because it sells one particular product.</p>
        <p>A hotel should not choose its primary category merely because it contains one particular amenity.</p>
        <p>A garage should not need a primary category for every repair it performs.</p>
        <p>The primary category should describe the business as a whole.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Be specific when the specific category genuinely fits</h2>
        <p>
          Google advises businesses to choose a specific category from its available list where that category
          accurately describes the business.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Specific category exists and genuinely fits</h3>
            <p>Use it.</p>
          </div>
          <div>
            <h3>Exact category does not exist</h3>
            <p>Choose the closest more general Google category that still accurately describes the business.</p>
          </div>
        </div>
        <p>Specific does not mean: &quot;pick the category containing the search phrase we most want.&quot;</p>
        <p>It means:</p>
        <p>
          <strong>choose the most precise available category that truthfully describes the business.</strong>
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>You cannot create your own Google category</h2>
        <p>Business Profile categories come from Google&apos;s available category list.</p>
        <p>If the exact wording you want does not exist, do not try to solve that by:</p>
        <ul className={styles.proseList}>
          {cannotInvent.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Use the closest defensible Google category.</p>
        <Link className={styles.inlineLink} href="/resources/google-business-profile-name-rules">
          Read our Business Profile name-rules guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>The primary category carries a different job from additional categories</h2>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Primary category</h3>
            <p>Represents the main business.</p>
            <span className={styles.statusKicker}>Question</span>
            <p>
              If you could choose only one category, which one would best explain what this business
              fundamentally is?
            </p>
          </div>
          <div>
            <h3>Additional categories</h3>
            <p>Add genuine secondary context.</p>
            <span className={styles.statusKicker}>Question</span>
            <p>
              What other substantial parts of this same business are accurately described by Google&apos;s
              categories?
            </p>
          </div>
        </div>
        <p>Do not treat all available category positions as equal keyword slots.</p>
        <p>Start with the strongest primary classification.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Google currently allows up to nine additional categories</h2>
        <p>Google&apos;s current Business Profile guidance allows:</p>
        <p>
          <strong>up to nine additional categories</strong>
        </p>
        <p>beyond the primary category.</p>
        <p>That is a maximum.</p>
        <p>It is not a target.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Two accurate additional categories</h3>
            <p>Can be enough when they describe the real business well.</p>
          </div>
          <div>
            <h3>Nine loosely related categories</h3>
            <p>Do not become more accurate simply because every slot is filled.</p>
          </div>
        </div>
        <p>Use only categories that genuinely help explain what the business is.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not add a category for every service</h2>
        <p>Google tells businesses not to select a category for every product or service.</p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Category</h3>
            <p>Describes what the business is.</p>
          </div>
          <div>
            <h3>Service</h3>
            <p>Describes what the business provides.</p>
          </div>
        </div>
        <p>A plumbing business may offer:</p>
        <ul className={styles.proseList}>
          {plumbingServices.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Those services do not automatically require four separate business categories.</p>
        <p>
          Use the most accurate category structure and the relevant Business Profile service features for the
          detailed offering.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>&quot;What the business has&quot; is different from &quot;what the business is&quot;</h2>
        <p>A hotel may contain:</p>
        <ul className={styles.proseList}>
          {hotelHas.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Those facts do not automatically mean each item belongs as a category on the hotel&apos;s Business
          Profile.
        </p>
        <p>Products, features and amenities should not automatically become business identities.</p>
        <p>The same principle applies across industries.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Additional categories can describe genuine secondary parts of the same business</h2>
        <p>Additional categories are useful when one business genuinely operates in more than one substantial way.</p>
        <p>
          Google&apos;s guidance gives examples where an overall business can contain genuine secondary
          departments or functions that are part of that same business.
        </p>
        <p>The primary category describes the overall business.</p>
        <p>Additional categories can describe genuine secondary parts.</p>
        <p>The relationship must be real.</p>
        <p>Do not add loosely related categories merely to widen search coverage.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A separately operated business is not simply another category</h2>
        <p>Suppose a health club contains a cafe run by a separate business.</p>
        <p>
          The health club should not automatically add <strong>Cafe</strong> as one of its own categories when
          the cafe is independently owned or operated.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Same business</h3>
            <p>A genuine secondary part may be represented by an appropriate additional category.</p>
          </div>
          <div>
            <h3>Separate business</h3>
            <p>A separately operated and independently eligible business may need its own Business Profile.</p>
          </div>
        </div>
        <p>Do not use another business&apos;s category to make the host profile appear broader.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Categories can affect which Business Profile features appear</h2>
        <p>Google says some Business Profile features depend on the selected category.</p>
        <p>Examples can include category-specific features for businesses such as:</p>
        <ul className={styles.proseList}>
          {featureExamples.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>That is another reason to classify the business accurately.</p>
        <p>
          Do not choose an inaccurate category merely to unlock a feature that does not belong to the real
          business.
        </p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Categories can affect relevance, but they are not the whole local-ranking system</h2>
        <p>Google says the categories you select can affect local ranking.</p>
        <p>Google also explains that local results are mainly based on:</p>
        <ul className={styles.proseList}>
          <li>Relevance</li>
          <li>Distance</li>
          <li>Prominence</li>
        </ul>
        <div className={styles.threeOutcome}>
          {rankingFactors.map(([title, body, note]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
              <p>{note}</p>
            </div>
          ))}
        </div>
        <p>Selecting a category does not guarantee a particular Maps position.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not promise a ranking increase from a category change</h2>
        <p>
          A category correction can make the Business Profile more accurate and help Google understand the
          business.
        </p>
        <p>Do not turn that into promises such as:</p>
        <p>&quot;{rankingPromises[0]}&quot;</p>
        <p>or:</p>
        <p>&quot;{rankingPromises[1]}&quot;</p>
        <p>Google does not provide a way to request or pay for a better organic local ranking.</p>
        <p>Use categories for accuracy and relevance.</p>
        <p>Treat ranking as Google&apos;s algorithmic result.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A top-ranking competitor does not choose your category for you</h2>
        <p>A competitor may:</p>
        <ul className={styles.proseList}>
          {competitorMay.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Their ranking does not make their category correct for you.</p>
        <p>Competitor research can provide context.</p>
        <p>It should not replace factual classification of your own business.</p>
      </section>

      <ContextualCta
        heading="Considering a category change because rankings changed or a competitor uses something different?"
        body="We can compare the existing category structure with the business's real operation before you change the primary category, fill additional slots or trigger another profile review."
        ctaLabel="Get your category setup reviewed"
      />

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Changing the primary category can be a meaningful profile edit</h2>
        <p>The primary category tells Google what the business fundamentally is.</p>
        <p>
          Changing <strong>Plumber</strong> to <strong>Electrician</strong> is not the same kind of edit as
          adding a small piece of descriptive information.
        </p>
        <p>Before changing the primary category, confirm that the new category genuinely represents the current business.</p>
        <p>Do not make repeated primary-category changes merely to test ranking positions.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A genuine operational change can justify a category change</h2>
        <p>Businesses evolve.</p>
        <p>A company may genuinely:</p>
        <ul className={styles.proseList}>
          {genuineChange.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Where the real business has changed, the Business Profile should reflect the current operation.</p>
        <p>Document the genuine change.</p>
        <p>Do not invent an operational change merely to justify a category wanted for search.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Adding or editing a category might require verification again</h2>
        <p>Google&apos;s current category guidance says that if a business adds or edits a category, it:</p>
        <p>
          <strong>might</strong>
        </p>
        <p>be asked to verify again.</p>
        <p>The word matters.</p>
        <p>Do not say:</p>
        <ul className={styles.proseList}>
          <li>Every category change triggers verification</li>
          <li>Verification can never happen after a category change</li>
        </ul>
        <p>
          Make the accurate category change and be prepared to complete whichever verification process Google
          provides.
        </p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-verification-stuck-or-rejected"
        >
          Read our verification troubleshooting guide →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>A verification request is not the same as a suspension</h2>
        <div className={styles.signalGrid}>
          {statusStates.map(([title, body]) => (
            <div className={styles.signalItem} key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <p>Those are different states.</p>
        <p>Do not start a suspension appeal merely because verification was requested.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not keep switching categories while Google is reviewing changes</h2>
        <p>Avoid cycling through categories simply to see which one appears to rank best.</p>
        <p>For example:</p>
        <ul className={styles.proseList}>
          {switchingExample.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>should not be swapped repeatedly without a genuine business reason.</p>
        <p>Choose the defensible category structure.</p>
        <p>Save the change.</p>
        <p>Then respond to the actual Google status.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Comparable locations should usually follow the same real business classification</h2>
        <p>
          Google&apos;s edit guidance says locations representing the same type of business should use an
          appropriate shared primary category.
        </p>
        <p>
          A multi-location brand should not give otherwise comparable branches different primary categories
          merely to target different local searches.
        </p>
        <div className={styles.decisionSplit}>
          <div>
            <h3>Same core operation</h3>
            <p>Use consistent category logic.</p>
          </div>
          <div>
            <h3>Genuinely different operation</h3>
            <p>A different category structure may be appropriate when the actual business function differs.</p>
          </div>
        </div>
        <p>Document real operational differences rather than inventing local category variations.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Category is only one part of Business Profile compliance</h2>
        <p>
          If a profile is suspended and an obviously inaccurate category is present, correct it as part of the
          wider compliance review.
        </p>
        <p>But do not automatically assume:</p>
        <p>
          <strong>the category caused the suspension.</strong>
        </p>
        <p>Review the whole profile, including where relevant:</p>
        <ul className={styles.proseList}>
          {complianceFields.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>A compliant category is one part of a compliant Business Profile.</p>
        <Link
          className={styles.inlineLink}
          href="/resources/google-business-profile-suspended-before-appeal"
        >
          Read what to do before a suspension appeal →
        </Link>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Do not create a new profile because a category edit was rejected</h2>
        <p>A rejected category edit does not automatically justify another Business Profile.</p>
        <p>First determine:</p>
        <ul className={styles.proseList}>
          {rejectedChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Handle the issue through the existing profile&apos;s appropriate edit, verification, support or
          appeal process.
        </p>
        <p>Do not create a duplicate merely to obtain a different category.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>Review the category structure in this order</h2>
        <div className={styles.signalGrid}>
          {worksheet.map(([title, question, output], index) => (
            <div className={styles.signalItem} key={title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <span className={styles.statusKicker}>Question</span>
              <p>{question}</p>
              <span className={styles.statusKicker}>Output</span>
              <p>{output}</p>
            </div>
          ))}
        </div>
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
        <h2>What if my category situation is different?</h2>
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
        <h2>Before changing the Business Profile categories</h2>
        <ul className={styles.tickList}>
          {readinessChecks.map((item) => (
            <li key={item}>
              <Check size={18} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p>If one of these points is unclear, resolve it before making another category change.</p>
      </section>

      <section className={`${styles.pilotSection} ${styles.wide}`}>
        <h2>What comes directly from Google</h2>
        <p>
          The guidance above combines Google&apos;s published Business Profile category, editing and
          local-ranking guidance with ProfileRelaunch&apos;s practical profile-review approach. These are the
          main points that come directly from Google&apos;s current guidance:
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
            Start with the core business, not the search query. Use the primary category for what the business
            fundamentally is, additional categories for genuine secondary parts of that same business, and keep
            individual services, products and amenities out of the category structure unless they genuinely
            represent a business classification.
          </p>
        </div>
      </section>

      <section className={`${styles.pilotConversion} ${styles.wide}`}>
        <h2>Want someone to check your category structure before you change it?</h2>
        <p>
          You don&apos;t need to fill every available category slot or copy the category used by the business
          ranking above you.
        </p>
        <p>
          Tell us what the business actually does, which categories are selected now and what change you are
          considering. We&apos;ll help you identify likely category issues and the appropriate next Google
          process.
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
          {googleBusinessProfileCategoriesSources.map((source) => (
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
          This guide is based on Google&apos;s publicly available Business Profile category, editing and
          local-ranking guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of
          Google.
        </p>
      </section>
    </article>
  )
}
