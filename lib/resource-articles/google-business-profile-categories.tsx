import {
  sourceAllPolicies,
  sourceEditBusinessProfile,
  sourceLocalRanking,
  sourceManageBusinessCategory,
  sourceOverviewBusinessProfilePolicies,
  sourceRepresentBusinessGuidelines,
} from "@/lib/resource-sources/google-business-profile"

export const googleBusinessProfileCategoriesSlug = "google-business-profile-categories"

export const googleBusinessProfileCategoriesSources = [
  sourceManageBusinessCategory,
  sourceRepresentBusinessGuidelines,
  sourceEditBusinessProfile,
  sourceLocalRanking,
  sourceOverviewBusinessProfilePolicies,
  sourceAllPolicies,
]

export const googleBusinessProfileCategoriesBody = {
  intro: (
    <>
      <p>Your Google Business Profile category tells Google what kind of business you are.</p>
      <p>It is not simply a list of search phrases you would like to appear for.</p>
      <p>
        Google asks businesses to choose a primary category that best describes the business as a whole.
      </p>
      <p>
        It also allows additional categories where they genuinely help describe other important parts of the
        business.
      </p>
      <p>The distinction matters.</p>
      <p>A plumbing company may provide:</p>
      <p>boiler repairs,</p>
      <p>bathroom installations,</p>
      <p>leak repairs,</p>
      <p>and emergency call-outs.</p>
      <p>
        That does not mean every service should become a Business Profile category.
      </p>
      <p>
        Google&apos;s own guidance says categories should describe what the business is, rather than list
        everything it has or offers.
      </p>
      <p>
        Categories can affect how Google understands the business and can affect local ranking.
      </p>
      <p>But changing a category is not a guaranteed ranking switch.</p>
      <p>
        Google says local results are mainly based on relevance, distance and prominence.
      </p>
      <p>Choose categories to make the profile accurate.</p>
      <p>
        Do not keep changing them simply because a competitor ranks above you.
      </p>
    </>
  ),
  quickAnswer: (
    <>
      <p>When reviewing your Business Profile categories:</p>
      <ul>
        <li>choose the primary category that best describes the business as a whole</li>
        <li>be as specific as Google&apos;s available category list allows</li>
        <li>if the exact category does not exist, choose the closest accurate general category</li>
        <li>you cannot create your own Google category</li>
        <li>
          use additional categories only where they genuinely describe important parts of the business
        </li>
        <li>do not add a category for every product, service or amenity</li>
        <li>Google currently allows up to nine additional categories</li>
        <li>you do not need to use all nine</li>
        <li>do not use categories merely as keywords</li>
        <li>
          do not copy a competitor&apos;s categories without checking whether they actually describe your
          business
        </li>
        <li>
          do not add the category of a separate independently operated business located inside or near
          yours
        </li>
        <li>
          remember that some categories enable category-specific Business Profile features
        </li>
        <li>
          remember that categories can affect local ranking, but ranking also depends on other factors
        </li>
        <li>
          if you add or change a category, Google says you might be asked to verify the business again
        </li>
        <li>
          do not interpret a verification request as proof that the profile has been suspended
        </li>
      </ul>
      <p>The right category describes the business customers actually deal with.</p>
    </>
  ),
  main: (
    <>
      <h2>Choose the primary category for what the business actually is</h2>
      <p>Google says the primary category should best describe the business.</p>
      <p>Start with the core business model.</p>
      <p>Ask:</p>
      <p>What kind of business would a customer say this is?</p>
      <p>
        A restaurant should not choose a category merely because it sells one particular product.
      </p>
      <p>A hotel should not choose a category merely because it has an ATM.</p>
      <p>A garage should not choose categories for every repair it performs.</p>
      <p>The primary category should describe the business as a whole.</p>

      <h2>Be specific when the specific category genuinely fits</h2>
      <p>
        Google advises businesses to choose a specific category from the available list.
      </p>
      <p>
        For example, where an accurate specialist category exists, it may describe the business better than
        a broad parent category.
      </p>
      <p>Specific does not mean:</p>
      <p>choose the category containing the most attractive search phrase.</p>
      <p>It means:</p>
      <p>
        choose the most precise available category that truthfully describes the business.
      </p>

      <h2>You cannot invent your own category</h2>
      <p>Business Profile categories come from Google&apos;s available list.</p>
      <p>
        If the exact wording you want is not available, Google says to choose a more general category that
        still accurately describes the business.
      </p>
      <p>Do not try to solve a missing category by:</p>
      <ul>
        <li>adding keywords to the business name</li>
        <li>selecting an inaccurate category</li>
        <li>choosing a neighbouring industry</li>
        <li>creating a new profile with a different identity</li>
      </ul>
      <p>Use the closest defensible category Google actually provides.</p>

      <h2>The primary category is more important than filling every slot</h2>
      <p>
        If several categories apply, the category in the primary position represents the main business.
      </p>
      <p>Additional categories can add context.</p>
      <p>Do not treat all available category positions as equal keyword slots.</p>
      <p>Begin with the strongest primary classification.</p>
      <p>
        Then ask whether any additional categories genuinely describe substantial parts of the same
        business.
      </p>

      <h2>Google currently allows up to nine additional categories</h2>
      <p>
        Google&apos;s current Business Profile guidance allows up to nine additional categories beyond the
        primary category.
      </p>
      <p>That is a maximum.</p>
      <p>It is not a target.</p>
      <p>
        A business with two accurate categories does not become better described simply because seven more
        are added.
      </p>
      <p>
        Use only the categories that genuinely help explain what the business is.
      </p>

      <h2>Do not add a category for every service</h2>
      <p>
        Google specifically tells businesses not to select a category for every product or service.
      </p>
      <p>A category describes the business.</p>
      <p>Services describe what the business provides.</p>
      <p>For example, a plumbing business might offer:</p>
      <ul>
        <li>leak repair</li>
        <li>boiler work</li>
        <li>pipe replacement</li>
        <li>emergency call-outs</li>
      </ul>
      <p>
        Those services do not automatically require four separate business categories.
      </p>
      <p>
        Use the most appropriate business category and the relevant service features for the detailed
        offering.
      </p>

      <h2>Think “what the business is”, not “what the business has”</h2>
      <p>
        Google&apos;s category guidance draws an important distinction between the identity of the business
        and things found within it.
      </p>
      <p>A hotel may have:</p>
      <ul>
        <li>a swimming pool</li>
        <li>an ATM</li>
        <li>a restaurant</li>
      </ul>
      <p>
        That does not automatically mean every amenity belongs as a category on the hotel&apos;s Business
        Profile.
      </p>
      <p>The same principle applies across industries.</p>
      <p>Do not turn features, products and amenities into business identities.</p>

      <h2>Additional categories can describe genuine secondary parts of the same business</h2>
      <p>
        Additional categories are useful when the business genuinely operates in more than one closely
        related way.
      </p>
      <p>
        For example, Google&apos;s own guidance gives the example of a grocery shop that also contains its
        own bakery and deli.
      </p>
      <p>The primary category can represent the overall business.</p>
      <p>
        Additional categories can describe genuine secondary parts of that same business.
      </p>
      <p>The relationship must be real.</p>
      <p>
        Do not add loosely related categories merely to increase search coverage.
      </p>

      <h2>An independently operated business needs to be treated separately</h2>
      <p>Suppose a health club contains a cafe operated by a separate business.</p>
      <p>Google&apos;s guidance says the host business should not simply add:</p>
      <p>Cafe</p>
      <p>as one of its own categories when the cafe is independently operated.</p>
      <p>
        Where a separately owned and operated public-facing department or business is independently
        eligible, it may need its own Business Profile.
      </p>
      <p>
        Do not use another business&apos;s category to make the host profile appear broader than it really
        is.
      </p>

      <h2>Categories can unlock category-specific features</h2>
      <p>Google says some Business Profile features depend on the category.</p>
      <p>Examples can include features for:</p>
      <ul>
        <li>hotels</li>
        <li>restaurants</li>
        <li>health and beauty businesses</li>
        <li>other category-specific business types</li>
      </ul>
      <p>That is another reason to choose the category accurately.</p>
      <p>
        An inaccurate category may change what Google believes the business is and which features it
        presents.
      </p>
      <p>
        Do not choose a category solely to unlock a feature that does not belong to the real business.
      </p>

      <h2>Categories affect relevance and local ranking — but they are not the whole ranking system</h2>
      <p>Google says the categories you select can affect local ranking.</p>
      <p>That is important.</p>
      <p>But Google separately explains that local results are mainly based on:</p>
      <ul>
        <li>relevance</li>
        <li>distance</li>
        <li>prominence</li>
      </ul>
      <p>Category helps Google understand relevance.</p>
      <p>It does not erase distance.</p>
      <p>It does not replace prominence.</p>
      <p>
        And it does not guarantee that selecting a category moves a profile to a particular position.
      </p>

      <h2>Do not promise a ranking increase from a category change</h2>
      <p>
        A category correction may make the profile more accurate and may help Google understand the
        business better.
      </p>
      <p>That does not justify promises such as:</p>
      <p>“Change this category and you will rank number one.”</p>
      <p>or:</p>
      <p>“This secondary category guarantees Maps visibility.”</p>
      <p>
        Google does not provide a way to request or pay for a better organic local ranking.
      </p>
      <p>Use categories for accuracy and relevance.</p>
      <p>Treat ranking outcomes as Google&apos;s algorithmic result.</p>

      <h2>Do not copy the category of the top-ranking competitor</h2>
      <p>A competitor may:</p>
      <ul>
        <li>operate a different business model</li>
        <li>offer a different core service</li>
        <li>have a different storefront setup</li>
        <li>have selected an inaccurate category</li>
        <li>rank for reasons unrelated to category</li>
      </ul>
      <p>Their ranking does not make their category correct for you.</p>
      <p>Start with your own real business.</p>
      <p>Competitor research can provide context.</p>
      <p>It should not replace factual classification.</p>

      <h2>Changing the primary category can be a meaningful profile edit</h2>
      <p>Do not change the primary category casually.</p>
      <p>The primary category tells Google what the business fundamentally is.</p>
      <p>A move from:</p>
      <p>Plumber</p>
      <p>to:</p>
      <p>Electrician</p>
      <p>
        is not the same kind of edit as adding a minor piece of descriptive information.
      </p>
      <p>
        Before changing the primary category, confirm that the new category genuinely represents the
        current business.
      </p>

      <h2>A genuine business change can justify a category change</h2>
      <p>Businesses evolve.</p>
      <p>A company may:</p>
      <ul>
        <li>change its core service</li>
        <li>stop one line of work</li>
        <li>expand into a different genuine business model</li>
        <li>reorganise a department</li>
        <li>rebrand around a real operational change</li>
      </ul>
      <p>
        Where the real business has changed, the Business Profile should accurately reflect the current
        operation.
      </p>
      <p>Document the genuine change.</p>
      <p>
        Do not create a fictional operational change merely to justify a category you want for search.
      </p>

      <h2>Adding or editing a category may require verification again</h2>
      <p>
        Google&apos;s current category guidance says that if you add or edit an existing category, you
        might be asked to verify your business again.
      </p>
      <p>The word:</p>
      <p>might</p>
      <p>matters.</p>
      <p>
        Do not tell customers that every category change triggers verification.
      </p>
      <p>Do not tell them verification can never happen.</p>
      <p>
        Make the accurate change and be prepared to complete any verification Google requests.
      </p>

      <h2>A verification request is not the same thing as a suspension</h2>
      <p>
        If Google asks the business to verify after a category edit, that does not automatically mean the
        Business Profile has been suspended.
      </p>
      <p>Check the actual state.</p>
      <p>Ask:</p>
      <p>Is Google requesting verification?</p>
      <p>Is the category edit pending?</p>
      <p>Was the edit rejected?</p>
      <p>Is the entire profile restricted?</p>
      <p>Those are different situations.</p>
      <p>
        Do not start a suspension appeal merely because verification was requested.
      </p>

      <h2>Do not repeatedly switch categories while Google is reviewing changes</h2>
      <p>
        Avoid cycling through categories simply to see which one appears to rank best.
      </p>
      <p>For example:</p>
      <p>Plumber,</p>
      <p>Heating contractor,</p>
      <p>Boiler supplier,</p>
      <p>Bathroom remodeler,</p>
      <p>Emergency service,</p>
      <p>should not be swapped repeatedly without a real business reason.</p>
      <p>Choose the defensible categories.</p>
      <p>Save the change.</p>
      <p>
        Then respond to the actual Google status rather than continuing to experiment while an edit is
        under review.
      </p>

      <h2>Multi-location businesses should classify comparable locations consistently</h2>
      <p>
        Google&apos;s edit guidance says business locations should share an appropriate primary category
        where they represent the same type of business.
      </p>
      <p>
        A multi-location brand should not give each branch a different primary category merely to target
        different local searches when the branches perform the same core business.
      </p>
      <p>If locations genuinely operate differently, document that difference.</p>
      <p>Category structure should follow the real operation.</p>

      <h2>A category problem may be part of a wider profile-compliance issue</h2>
      <p>
        If a suspended profile has an obviously inaccurate category, correct it as part of the wider
        compliance review.
      </p>
      <p>But do not assume category is always the suspension reason.</p>
      <p>Review:</p>
      <ul>
        <li>business eligibility</li>
        <li>name</li>
        <li>address or service area</li>
        <li>website</li>
        <li>category</li>
        <li>ownership</li>
        <li>other profile details</li>
      </ul>
      <p>A compliant category is one part of a compliant Business Profile.</p>

      <h2>Do not create a new profile just because a category edit was rejected</h2>
      <p>
        A rejected category edit does not automatically justify creating another Business Profile.
      </p>
      <p>First determine:</p>
      <ul>
        <li>whether the existing profile represents the correct business</li>
        <li>whether the selected category is available</li>
        <li>whether the new category genuinely fits</li>
        <li>whether verification is required</li>
        <li>whether Google has restricted the profile</li>
      </ul>
      <p>Use the appropriate edit, verification or support process.</p>
      <p>
        Do not create duplicate listings merely to obtain a preferred category.
      </p>

      <h2>Review categories when the real business changes — not on a fixed SEO schedule</h2>
      <p>
        There is no need to change categories simply because a month or quarter has passed.
      </p>
      <p>Review them when:</p>
      <ul>
        <li>the business genuinely changes</li>
        <li>the existing category is inaccurate</li>
        <li>Google adds a more accurate category</li>
        <li>a material secondary operation becomes relevant</li>
        <li>an old secondary category no longer describes the business</li>
      </ul>
      <p>Accuracy is the trigger.</p>
      <p>Not an artificial optimisation calendar.</p>
    </>
  ),
  googleSays: {
    paraphrase: (
      <>
        <p>
          Google says businesses should choose a primary category that best describes the business as a
          whole.
        </p>
        <p>
          Google advises businesses to choose a category that is as specific as possible while still
          accurately representing the main business.
        </p>
        <p>
          If the exact category is not available, Google says to choose a more general category that still
          describes the business.
        </p>
        <p>Businesses cannot create their own Business Profile category.</p>
        <p>
          Google says additional categories can describe genuine secondary parts of the business, but
          businesses should not add a category for every product or service.
        </p>
        <p>Google currently allows up to nine additional categories.</p>
        <p>
          Google&apos;s representation guidelines say businesses should use as few categories as possible
          to describe the overall core business and should not use categories solely as keywords.
        </p>
        <p>Google also says categories can affect local ranking.</p>
        <p>
          Its local-ranking guidance explains that local results are mainly based on relevance, distance
          and prominence.
        </p>
        <p>
          Google says that adding or editing an existing category might require the business to verify
          again.
        </p>
      </>
    ),
    sources: [sourceManageBusinessCategory, sourceRepresentBusinessGuidelines, sourceEditBusinessProfile],
  },
  interpretation: (
    <>
      <p>Treat categories as classification, not advertising.</p>
      <p>Start with:</p>
      <p>What kind of business is this?</p>
      <p>Then ask:</p>
      <p>
        What additional categories genuinely describe important secondary parts of the same business?
      </p>
      <p>
        Stop before the profile becomes a list of everything the business sells or does.
      </p>
      <p>
        A good category structure should make sense even if search rankings did not exist.
      </p>
      <p>That does not mean category is irrelevant to visibility.</p>
      <p>Google says categories can affect local ranking.</p>
      <p>
        It means accuracy should decide the category — not a promise that one category change will force a
        particular ranking result.
      </p>
    </>
  ),
  beforeYouAct: (
    <>
      <p>
        Do not choose the primary category simply because it has an attractive search phrase.
      </p>
      <p>Do not add a category for every service.</p>
      <p>
        Do not fill all nine additional category slots merely because they exist.
      </p>
      <p>Do not invent your own category.</p>
      <p>
        Do not choose an inaccurate neighbouring industry because the exact wording you want is
        unavailable.
      </p>
      <p>
        Do not copy a competitor&apos;s categories without checking the real business model.
      </p>
      <p>
        Do not add the category of an independently operated business inside your premises.
      </p>
      <p>
        Do not select a category merely to unlock a feature your business does not genuinely qualify for.
      </p>
      <p>
        Do not promise that a category change guarantees ranking improvement.
      </p>
      <p>Do not assume every category edit requires verification.</p>
      <p>Do not confuse re-verification with suspension.</p>
      <p>Do not repeatedly switch categories while an edit is being assessed.</p>
      <p>
        Do not create another Business Profile merely because a category edit was rejected.
      </p>
      <p>Make the category describe the business, not the keyword strategy.</p>
    </>
  ),
  checklist: {
    heading: "Google Business Profile category checklist",
    items: [
      "Record the current primary category.",
      "Record every current additional category.",
      "Write down the business's actual core activity.",
      "Identify the most specific available Google category that accurately describes that core activity.",
      "If the exact category does not exist, choose the closest accurate broader category.",
      "Check whether each additional category describes a genuine substantial part of the same business.",
      "Remove categories that represent only individual products, services or amenities.",
      "Remove categories selected solely for keywords.",
      "Check that no category actually belongs to a separate independently operated business.",
      "Do not exceed Google's current maximum of nine additional categories.",
      "Do not use extra categories merely to fill available slots.",
      "Check whether category-specific features shown on the profile genuinely fit the business.",
      "For multi-location businesses, compare the primary categories of locations performing the same core operation.",
      "Record the genuine business reason before changing the primary category.",
      "Be prepared for Google to request verification after a category edit.",
      "If verification is requested, check the verification state before assuming the profile is suspended.",
      "If an edit is rejected, record the exact Google status before submitting another category change.",
      "If the profile is suspended, review category alongside the other Business Profile compliance fields.",
      "Do not create a duplicate profile to obtain a different category.",
      "Keep the final category structure as simple as the real business allows.",
    ],
  },
  commonMistakes: {
    heading: "Where businesses commonly go wrong",
    items: [
      {
        title: "Treating categories as keywords.",
        body: "Google says categories should describe the business and should not be used solely as search keywords.",
      },
      {
        title: "Adding a category for every service.",
        body: "Services and products do not automatically need separate categories. Categories describe what the business is.",
      },
      {
        title: "Using all nine additional categories.",
        body: "Nine is the current maximum, not a target. Use only categories that genuinely help describe the business.",
      },
      {
        title: "Copying the highest-ranking competitor.",
        body: "A competitor's category may reflect a different business model or may itself be inaccurate. Your profile should describe your own business.",
      },
      {
        title: "Choosing an inaccurate category because the exact one is unavailable.",
        body: "Google says to choose a more general accurate category when the exact category is not available.",
      },
      {
        title: "Adding another business's category.",
        body: "An independently operated public-facing business should not simply become an additional category on the host business's profile.",
      },
      {
        title: "Promising a ranking jump.",
        body: "Google says categories can affect ranking, but local results are mainly based on relevance, distance and prominence together.",
      },
      {
        title: "Assuming re-verification means suspension.",
        body: "Google may ask a business to verify again after a category edit. Check the actual profile state before treating it as a restriction.",
      },
      {
        title: "Switching categories repeatedly.",
        body: "Repeated experiments make it harder to understand the true profile state. Choose accurate categories and respond to Google's actual decision.",
      },
      {
        title: "Creating a duplicate after a rejected edit.",
        body: "A category-edit problem should be handled through the existing profile's appropriate edit, verification or support process.",
      },
    ],
  },
  scenarios: [
    {
      heading: "We are plumbers but also install bathrooms",
      body: (
        <>
          <p>Start with the core business.</p>
          <p>
            If the company is fundamentally a plumbing business, choose the most accurate plumbing-related
            primary category Google provides.
          </p>
          <p>
            Then decide whether bathroom-remodelling work is a substantial genuine secondary business
            activity that warrants an additional category.
          </p>
          <p>Do not create categories for every individual plumbing service.</p>
        </>
      ),
    },
    {
      heading: "Our exact category does not exist",
      body: (
        <>
          <p>Do not invent one.</p>
          <p>Do not change the business name to contain the missing category phrase.</p>
          <p>
            Google says to choose a more general category that accurately describes the business when the
            exact option is unavailable.
          </p>
          <p>Use the closest defensible category from Google&apos;s list.</p>
        </>
      ),
    },
    {
      heading: "A competitor ranks above us with a different primary category",
      body: (
        <>
          <p>Do not change categories merely to copy them.</p>
          <p>Compare the actual business models first.</p>
          <p>
            If their category also accurately describes your core business better than your current one, a
            correction may be reasonable.
          </p>
          <p>If it does not, keep the accurate category.</p>
          <p>Ranking is influenced by more than category alone.</p>
        </>
      ),
    },
    {
      heading: "We changed the primary category and Google asks us to verify again",
      body: (
        <>
          <p>Do not assume the profile is suspended.</p>
          <p>
            Google says category additions or edits might trigger a request for verification.
          </p>
          <p>Check the verification method Google provides.</p>
          <p>Complete the legitimate verification process if appropriate.</p>
          <p>Do not create another profile merely to avoid re-verification.</p>
        </>
      ),
    },
    {
      heading: "Our Business Profile has ten different categories",
      body: (
        <>
          <p>Review them one by one.</p>
          <p>Keep the primary category that best describes the core business.</p>
          <p>
            Keep only additional categories that genuinely represent substantial parts of the same
            business.
          </p>
          <p>Remove categories that describe:</p>
          <ul>
            <li>isolated products</li>
            <li>individual services</li>
            <li>amenities</li>
            <li>unrelated activities</li>
            <li>other businesses</li>
          </ul>
          <p>The objective is not to maximise the category count.</p>
          <p>It is to describe the business accurately.</p>
        </>
      ),
    },
  ],
  closing: (
    <>
      <h2>Use categories to describe the business — not to chase every search</h2>
      <p>Google Business Profile categories matter.</p>
      <p>
        They help Google understand what the business is and can affect how the profile connects with
        relevant searches.
      </p>
      <p>That makes category selection important.</p>
      <p>It does not turn categories into a free-form SEO keyword list.</p>
      <p>Choose the primary category for the real core business.</p>
      <p>
        Add only the secondary categories that genuinely describe meaningful parts of the same operation.
      </p>
      <p>Use the most specific accurate option Google provides.</p>
      <p>
        If the exact wording is unavailable, choose a broader category rather than inventing one.
      </p>
      <p>Do not fill every slot.</p>
      <p>Do not copy competitors blindly.</p>
      <p>
        And do not promise that changing a category forces a ranking result.
      </p>
      <p>
        If Google asks the business to verify after the change, treat that as a verification state until
        the evidence shows something else.
      </p>
      <p>
        ProfileRelaunch can help review the profile&apos;s category structure alongside the business&apos;s
        real services, location model and other profile information.
      </p>
      <p>
        We can identify categories that appear inaccurate or excessive and help organise the appropriate
        next Google process.
      </p>
      <p>
        We cannot guarantee ranking changes or promise that a category edit alone will resolve a suspended
        profile.
      </p>
      <p>The objective is accuracy:</p>
      <p>make Google&apos;s classification match the business customers actually use.</p>
    </>
  ),
  sourcesUsed: googleBusinessProfileCategoriesSources,
}
