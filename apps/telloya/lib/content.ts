/**
 * Telloya marketing website content configuration.
 * 
 * All customer-facing copy, CTAs, and page metadata are defined here
 * to enable consistent content management and testing.
 * 
 * Pricing data is imported from pricing.ts as the single source of truth.
 */

import { brandName } from "@/lib/brand"
import { getCustomerPortalHref } from "@/lib/customer-portal"
import { telloyaPlans, relaunchGuardAddon, overagePolicy, calculateCombinedPrice, formatGbpPrice, formatMinutes, standardEntitlement, commercialCopy } from "./pricing"

// Homepage content
export const homepageContent = {
  seo: {
    title: "AI Receptionist for Tradespeople & Local Services",
    description:
      "When you're on a job and can't pick up, Telloya can help handle missed-call enquiries, collect useful details and make it easier to follow up.",
  },
  hero: {
    eyebrow: "AI receptionist · by ProfileRelaunch Ltd",
    headlineLead: "Don't Let Missed Calls",
    headlineEmphasis: "Cost You Customers.",
    supporting:
      "Busy on a job? Telloya helps answer your missed calls, speaks with potential customers and captures the details you need to follow up.",
    primaryCta: "See how Telloya works",
    primaryHref: "/how-it-works",
    secondaryCta: "Enquire about Telloya",
    secondaryHref: "/enquire",
  },
  problem: {
    eyebrow: "The missed-call challenge",
    title: "Customers call while you're working",
    lead:
      "When you're on a job, answering the phone isn't always possible. But missed calls can mean missed opportunities.",
    points: [
      "Calls come in while you're working on site",
      "Voicemail often captures too little information",
      "Following up without context wastes time",
      "Customers may not call back",
    ],
  },
  howItWorks: {
    eyebrow: "How Telloya works",
    title: "Four simple steps",
    lead: "Telloya is designed to fit around your working day",
    steps: [
      {
        number: "01",
        title: "Customer calls your business",
        description: "A customer tries to reach you during a job",
      },
      {
        number: "02",
        title: "Missed call forwarded to Telloya",
        description: "When configured, your missed calls can be forwarded to Telloya",
      },
      {
        number: "03",
        title: "Telloya speaks with the caller",
        description: "Our AI receptionist collects the enquiry details in a natural conversation",
      },
      {
        number: "04",
        title: "You receive the details",
        description: "Get a clear summary with the information you need to follow up",
      },
    ],
    note:
      "Telloya is designed to help with missed-call enquiries. It does not automatically confirm appointments or guarantee callbacks.",
  },
  benefits: {
    eyebrow: "Benefits",
    title: "Spend more time on the job",
    items: [
      {
        title: "Fewer interruptions",
        description: "Stay focused on the work without constant phone calls",
      },
      {
        title: "Better enquiry collection",
        description: "Capture useful details from missed calls",
      },
      {
        title: "Professional experience",
        description: "Give more callers a helpful response when you're unavailable.",
      },
      {
        title: "Designed for tradespeople",
        description: "Built around the realities of working on site",
      },
    ],
  },
  example: {
    eyebrow: "Illustrative example",
    title: "What you receive",
    lead: "Telloya provides clear summaries of each enquiry",
    card: {
      label: "Illustrative example only",
      caller: "Sarah Mitchell",
      service: "Boiler service and repair",
      location: "Caller's local area",
      problem: "Boiler not heating properly, pressure gauge showing low",
      callback: "Weekday mornings preferred",
      time: "11:23 AM",
    },
    demoLink: { label: "See a Sample Conversation", href: "/demo" },
  },
  audience: {
    eyebrow: "Who Telloya is for",
    title: "Local service businesses",
    lead: "Telloya is designed for tradespeople and service businesses who work on site",
    industries: [
      "Plumbers",
      "Heating engineers",
      "Electricians",
      "Property maintenance",
      "Local service businesses",
    ],
  },
  plans: {
    eyebrow: "Service plans",
    title: "Four plans to fit your business",
    lead:
      `Choose from Basic, Growth, Pro or Custom. A standard plan includes one operating location and one receptionist telephone number. ${commercialCopy.extraReceptionist} Optional Relaunch Guard is priced separately.`,
    tiers: telloyaPlans.map(p => ({
      name: p.name,
      price: p.monthlyPriceGbp !== null ? formatGbpPrice(p.monthlyPriceGbp) : "By quotation",
      minutes: p.minutesPerMonth !== null ? formatMinutes(p.minutesPerMonth) : "By quotation",
      description: p.tier === "basic"
        ? "Essential AI receptionist for smaller call volumes. Includes one operating location and one receptionist number."
        : p.tier === "growth"
        ? "Recommended plan for growing businesses. Includes one operating location and one receptionist number."
        : p.tier === "pro"
        ? "Higher included minutes for busier call volumes. Includes one operating location and one receptionist number."
        : "A separate quotation when you need more than one operating location or receptionist number.",
      popular: p.popular ?? false,
      cta: "View pricing",
      href: "/pricing",
    })),
    guard: {
      name: relaunchGuardAddon.name,
      description: relaunchGuardAddon.description,
      price: `${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} per paid Guard location / month`,
      note: `${commercialCopy.guardPriceBasis} ${commercialCopy.guardOnly}`,
    },
  },
  faq: {
    eyebrow: "Common questions",
    title: "Frequently asked questions",
    questions: [
      {
        q: "How does call forwarding work?",
        a: "Telloya is designed to use conditional forwarding of unanswered calls. Whether a provider offers that feature depends on the customer's telephone provider and location. Compatibility is checked before a service is agreed. An enquiry does not start forwarding.",
      },
      {
        q: "Do I need to change my phone number?",
        a: "A standard plan is designed to keep your existing business number when your provider supports conditional forwarding. It includes one receptionist telephone number. Extra receptionist numbers need a separate Custom quotation.",
      },
      {
        q: "How many locations and numbers are included?",
        a: `${commercialCopy.standardEntitlement} ${commercialCopy.extraReceptionist} ${commercialCopy.guardOnly}`,
      },
      {
        q: "What information does Telloya collect?",
        a: "Telloya asks for caller contact details, the service they need, their location, a description of the problem, and their preferred callback time. The exact conversation adapts to the enquiry.",
      },
      {
        q: "Does Telloya confirm appointments?",
        a: "No. Telloya collects enquiry details so you can follow up. It does not automatically book appointments or guarantee callbacks.",
      },
      {
        q: "What happens to the call recordings?",
        a: "Call handling, recording retention and data processing details will be covered in our service terms. These are being finalised before public launch.",
      },
    ],
  },
  finalCta: {
    title: "Spend more time on the job, less time worrying about missed calls",
    cta: "Enquire about Telloya",
    href: "/enquire",
  },
} as const

// How It Works page
export const howItWorksContent = {
  seo: {
    title: "How Telloya Works – AI Receptionist for Missed Calls",
    description:
      "Learn how Telloya handles missed-call enquiries through call forwarding, natural conversation and clear lead summaries for tradespeople.",
  },
  hero: {
    eyebrow: "How it works",
    title: "From missed call to useful lead",
    lead:
      "When you're busy, Telloya helps you stay responsive. It can speak with callers, collect what they need and prepare a summary so you can follow up.",
  },
  journey: {
    title: "The customer journey",
    steps: [
      {
        number: "01",
        title: "Customer calls your business",
        description:
          "A potential customer tries to reach your business during working hours. You're on a job and can't pick up.",
        detail: "This is the starting point — a genuine enquiry that would otherwise go to voicemail or be missed entirely.",
      },
      {
        number: "02",
        title: "Missed call forwarding activates",
        description:
          "When configured with your telephone provider, unanswered calls can be forwarded to Telloya's service number.",
        detail:
          "Conditional forwarding depends on the customer's telephone provider and location. It is not offered by every provider or in every country. Compatibility is checked before a service is agreed. An enquiry does not start forwarding.",
      },
      {
        number: "03",
        title: "Telloya answers and engages",
        description:
          "Our AI receptionist greets the caller, explains you're currently unavailable, and offers to help collect their enquiry details.",
        detail:
          "The conversation is natural and conversational. Telloya adapts to how the customer explains their needs.",
      },
      {
        number: "04",
        title: "Information collection",
        description:
          "Telloya asks for their contact details, the service they need, their location, a description of the problem, and when they'd prefer a callback.",
        detail:
          "The questions adapt to the enquiry. If something isn't clear, Telloya asks follow-up questions. If the caller needs to end the call, we save what we've captured.",
      },
      {
        number: "05",
        title: "Lead summary delivered",
        description:
          "You receive a clear summary of the information Telloya collected. Lead summaries are delivered through the method agreed for your service.",
        detail:
          "A customer dashboard for reviewing summaries and usage is planned and is not operational. The summary is designed to give you what you need to follow up.",
      },
      {
        number: "06",
        title: "You follow up",
        description:
          "With the details the caller shared, you can decide how and when to follow up.",
        detail: "Following up is still your responsibility. Telloya captures the enquiry — you close it.",
      },
    ],
  },
  experience: {
    eyebrow: "Customer experience",
    title: "What the caller hears",
    lead:
      "We've designed Telloya to feel professional and helpful, not robotic. Here's an illustrative example of how a call might sound.",
    example: {
      greeting: "Hello, thank you for calling. I'm the AI receptionist for [Business Name]. They're currently on a job and can't take your call right now. I can help collect some details so they can call you back — would that work for you?",
      flow: [
        "If yes, Telloya continues: 'Great. Can I start with your name?'",
        "Then: 'And the best number to reach you on?'",
        "Followed by service-specific questions based on your business type",
        "Ending with: 'Thank you. I will pass on your preferred time. The business decides when to call you back. Is there anything else you would like me to pass on?'",
      ],
      note: "This is an illustrative example. The actual conversation adapts to how the caller responds.",
    },
    demoLink: { label: "See a Sample Conversation", href: "/demo" },
  },
  setup: {
    eyebrow: "Getting started",
    title: "Call forwarding setup",
    lead:
      "Telloya is designed to use conditional missed-call forwarding. Availability and the setup steps depend on the customer's telephone provider and location.",
    steps: [
      {
        title: "Check provider compatibility",
        description:
          "Support varies by provider and country. We can help check whether your current provider can forward unanswered calls. This page does not list carriers as supported.",
      },
      {
        title: "Configure forwarding rules",
        description:
          "You'll set your phone to forward unanswered calls to Telloya's service number. This typically involves a provider-specific code or online setting.",
      },
      {
        title: "Test the service",
        description:
          "A test call can be arranged before a service is treated as ready. Sending an enquiry does not start the service or that test.",
      },
    ],
    note:
      "We provide setup guidance, but the forwarding configuration itself depends on your telephone provider. If forwarding isn't supported or doesn't work reliably, Telloya may not be suitable for your setup.",
  },
  limitations: {
    eyebrow: "Before you start",
    heading: "Good to know",
    headingEmphasis: "before you begin.",
    lead:
      "Telloya helps with missed-call enquiries when forwarding is set up, the service is active and the caller is happy to share details.",
    points: [
      "Unanswered calls can be forwarded where the telephone provider and location support it. Compatibility is checked before a service starts.",
      "A caller can decline to leave details, or choose to try again later.",
      "Telloya records what the caller reports. It does not decide whether a job is urgent, diagnose a fault, book an appointment or send an engineer.",
      "You decide whether and when to follow up.",
      "Sending an enquiry does not start the service, take payment or create a subscription.",
    ],
  },
  cta: {
    title: "Ready to see if Telloya fits your business?",
    description: "Enquire about the service and we'll help you understand if it's right for your setup.",
    cta: "Enquire now",
    href: "/enquire",
  },
} as const

export const featureStageLabels = {
  demonstrated: "Tested in demonstration",
  planned: "Planned",
} as const

export type FeatureStage = keyof typeof featureStageLabels

export function featureStatusPresentation(stage: FeatureStage) {
  return { stage, label: featureStageLabels[stage] }
}

// Features page
export const featuresContent = {
  seo: {
    title: "Features – Telloya AI Receptionist",
    description:
      "Missed-call assistance, conversational enquiry collection, lead summaries, callback preferences and business-specific configuration.",
  },
  hero: {
    eyebrow: "Features",
    title: "Every Missed Call Could Be a New Opportunity.",
    lead:
      "When you're busy, Telloya helps speak with callers, capture what they need and prepare useful enquiry details so you can follow up.",
  },
  workflow: [
    { label: "Missed Call", description: "Customer calls while you're unavailable" },
    { label: "AI Conversation", description: "Telloya asks useful questions and records the details the caller shares." },
    { label: "Lead Summary", description: "A summary can be prepared for follow-up" },
  ],
  features: [
    {
      kicker: "Feature 01",
      title: "Missed-call assistance",
      description:
        "Give callers a helpful response while you're busy. With supported call forwarding and an active service, Telloya can offer to collect their enquiry.",
      stage: "demonstrated",
      points: [
        "Natural greeting and explanation",
        "Professional tone without sounding robotic",
        "Adapts to how customers respond",
      ],
    },
    {
      kicker: "Feature 02",
      title: "Conversational enquiry collection",
      description:
        "Know what the caller needs before you ring them back. Telloya asks useful questions and records the details they share.",
      stage: "demonstrated",
      points: [
        "Contact details (name and phone number)",
        "Service requested",
        "Location",
        "Problem description",
        "Preferred callback time",
      ],
    },
    {
      kicker: "Feature 03",
      title: "Lead summaries",
      description:
        "Get useful context for your follow-up. Details collected during a conversation can be prepared as a summary and shared through the agreed delivery method.",
      stage: "demonstrated",
      points: [
        "Structured format for quick review",
        "Key details highlighted",
        "Timestamp and call duration",
      ],
    },
    {
      kicker: "Feature 04",
      title: "Callback preferences",
      description:
        "Find out when a caller would prefer to hear from you, without automatically booking an appointment.",
      stage: "demonstrated",
      points: [
        "Morning, afternoon or evening preference",
        "The caller can say how soon they would like to hear back",
        "Any-time option for flexible customers",
      ],
    },
    {
      kicker: "Feature 05",
      title: "Business-specific configuration",
      description:
        "Get questions that fit the work you do. Telloya can use your business name, your services and the details your customers usually need to share.",
      stage: "demonstrated",
      points: [
        "Business name and service description",
        "Industry-specific question flow",
        "Custom greeting message",
      ],
    },
  ],
  technical: {
    eyebrow: "Technical foundation",
    title: "Voice AI technology",
    lead:
      `${commercialCopy.voicePreference} ${commercialCopy.voiceProvider} The voice provider is confirmed with the customer before a service starts.`,
    points: [
      "Enquiry conversations have been demonstrated",
      "Number provisioning depends on the provider and the customer's location",
      "Call routing depends on the customer's telephone provider",
      "Voice, accent and language combinations are requests, not a guaranteed catalogue",
    ],
  },
  future: {
    eyebrow: "Roadmap",
    title: "Planned enhancements",
    lead: "The items below are under consideration. They are not current features and they are not included in a plan price.",
    items: [
      {
        title: "CRM integration",
        description: "Send leads directly to your existing tools",
        timeline: "Under consideration",
      },
      {
        title: "SMS notifications",
        description: "Alerts when a new enquiry comes in",
        timeline: "Under consideration",
      },
      {
        title: "Customer call history",
        description: "See past calls, lead summaries and minute use in one place. A customer dashboard is planned and is not live.",
        timeline: "Planned, not live",
      },
      {
        title: "Advanced call routing",
        description: "Different handling based on call time or type",
        timeline: "Under consideration",
      },
    ],
    note:
      `These items are not current features. ${commercialCopy.voicePreference} ${commercialCopy.voiceProvider}`,
  },
  cta: {
    title: "Want to see how Telloya could work for you?",
    cta: "Get in touch",
    href: "/enquire",
  },
} as const

// Industries page
export const industriesContent = {
  seo: {
    title: "Industries – Telloya for Tradespeople & Local Services",
    description:
      "Telloya AI receptionist for plumbers, heating engineers, electricians, property maintenance and other local service businesses.",
  },
  hero: {
    eyebrow: "Industries",
    title: "Built for tradespeople",
    lead:
      "Telloya is for local service businesses where a missed call can mean a missed job. These examples show details a caller can share. Telloya records what they report. You assess the enquiry and decide what happens next.",
  },
  industries: [
    {
      name: "Plumbing",
      tagline: "Collect the job details callers describe while you are on site",
      description:
        "When you are already with a customer, Telloya can help collect what the next caller describes. It does not send an engineer or provide an emergency response.",
      scenarios: [
        {
          title: "Emergency burst pipe",
          situation: "Customer has a burst pipe and needs someone urgently",
          telletoyaHelps:
            "Telloya can record the location the caller describes, access details, and how serious they say the leak is. You decide how to follow up. Telloya does not dispatch anyone.",
        },
        {
          title: "Boiler breakdown",
          situation: "No hot water, family home, heating engineer needed",
          telletoyaHelps:
            "Records the boiler details, the symptoms the caller describes, when they say it stopped, and whether they say it is under warranty.",
        },
        {
          title: "Quote requests",
          situation: "Bathroom refurbishment, needs a quote",
          telletoyaHelps:
            "Asks about the proposed work, records the scope the caller describes and notes when they would prefer to discuss a quote.",
        },
      ],
      benefits: [
        "See how urgent the caller said the job is",
        "Collect the location and access details they provide before you travel",
        "Separate urgent descriptions from quote requests",
      ],
    },
    {
      name: "Heating Engineers",
      tagline: "Collect boiler callout details while you are on another job",
      description:
        "Heating problems are often time-sensitive. Telloya can help collect the details the caller gives, so you can decide which jobs to follow up. It does not provide an emergency response.",
      scenarios: [
        {
          title: "No heating in winter",
          situation: "Boiler stopped working, cold house, elderly resident",
          telletoyaHelps:
            "Telloya can record how urgent the caller says the job is, who is at the property, the boiler type, any error code they can see, and how long the heating has been off.",
        },
        {
          title: "Annual service",
          situation: "Customer wants to book their yearly boiler service",
          telletoyaHelps:
            "The caller can describe a routine service, the address, and a preferred time. Telloya does not book the appointment.",
        },
        {
          title: "Radiator issues",
          situation: "One radiator cold, others working fine",
          telletoyaHelps:
            "Asks which radiator is affected and records the symptoms and information the caller provides.",
        },
      ],
      benefits: [
        "See the urgency the caller described before you call back",
        "Collect error codes and symptoms the caller can provide",
        "Keep routine work separate from urgent descriptions",
      ],
    },
    {
      name: "Electricians",
      tagline: "Review callout enquiries with useful details.",
      description:
        "Electrical work ranges from safety concerns to planned installations. Telloya records what the caller describes so you can decide the next step.",
      scenarios: [
        {
          title: "Power cut",
          situation: "Partial power loss, some circuits not working",
          telletoyaHelps:
            "The caller can describe which circuits are affected, whether the consumer unit has tripped, and the type of property. Telloya does not decide whether the job is safe to attend.",
        },
        {
          title: "New installation",
          situation: "Customer wants additional sockets installed",
          telletoyaHelps:
            "Records the work requested, the rooms involved and when the caller would prefer to discuss an assessment.",
        },
        {
          title: "Faulty appliance",
          situation: "Oven not working properly",
          telletoyaHelps:
            "Records which appliance the caller mentioned, the symptoms described and whether the caller reports any circuit tripping.",
        },
      ],
      benefits: [
        "See what the caller said about safety before you decide the next step",
        "Understand the scope they described before quoting",
        "See when the caller says the problem is with an appliance rather than the wiring",
      ],
    },
    {
      name: "Property Maintenance",
      tagline: "Manage multiple enquiry types efficiently",
      description:
        "Property maintenance covers everything from leaks to lockouts. Telloya collects what the caller reports, so you can tell an urgent description from routine work.",
      scenarios: [
        {
          title: "Landlord emergency",
          situation: "Tenant-reported leak, property damage risk",
          telletoyaHelps:
            "The caller can describe a leak, the address, and who to contact. Telloya does not dispatch anyone or decide that a job is an emergency.",
        },
        {
          title: "Planned maintenance",
          situation: "Quarterly property inspection needed",
          telletoyaHelps:
            "Records the caller's description of a planned inspection, the property address, how many units they mention and the access details they provide.",
        },
        {
          title: "Cosmetic work",
          situation: "Painting and decorating quote",
          telletoyaHelps:
            "Collects the proposed work, approximate scope and preferred time for the business to discuss an assessment.",
        },
      ],
      benefits: [
        "See which jobs the caller described as urgent",
        "Collect the landlord and tenant details the caller provides",
        "Keep routine work separate from urgent descriptions",
      ],
    },
  ],
  universal: {
    eyebrow: "Works for other trades too",
    title: "Local service businesses",
    lead:
      "If your business involves on-site work and missed calls cost you enquiries, Telloya can help.",
    examples: [
      "Locksmiths",
      "Glaziers",
      "Roofers",
      "Carpenters",
      "Decorators",
      "Garden maintenance",
      "Appliance repair",
      "And more",
    ],
  },
  cta: {
    title: "See how Telloya works for your trade",
    cta: "Enquire now",
    href: "/enquire",
  },
} as const

// Pricing page
export const pricingContent = {
  seo: {
    title: "Pricing – Telloya AI Receptionist",
    description:
      `Telloya AI receptionist plans from ${formatGbpPrice(telloyaPlans[0].monthlyPriceGbp!)}/month. Basic, Growth, Pro and Custom plans with optional Relaunch Guard profile monitoring add-on.`,
  },
  hero: {
    eyebrow: "Pricing",
    title: "Choose your plan",
    lead:
      `Standard plans share the same core receptionist capabilities. The main difference is included monthly call minutes. A standard plan covers one operating location and one receptionist telephone number. Custom is for requirements outside a standard plan. ${commercialCopy.extraReceptionist}`,
  },
  currency: {
    note: "Published prices are in GBP. Settlement currency and other payment terms are confirmed before you proceed. This page does not offer local-currency checkout or conversion.",
  },
  plans: telloyaPlans.map((plan) => ({
    tier: plan.tier,
    name: plan.name,
    monthlyPriceGbp: plan.monthlyPriceGbp,
    minutesPerMonth: plan.minutesPerMonth,
    popular: plan.popular ?? false,
    tagline: plan.tier === "basic" 
      ? "Essential AI receptionist"
      : plan.tier === "growth"
      ? "Recommended"
      : plan.tier === "pro"
      ? "Maximum included usage"
      : "Tailored to your requirements",
    description: plan.tier === "basic"
      ? "Everything you need to handle missed-call enquiries professionally while you're working on site."
      : plan.tier === "growth"
      ? "Ideal for growing businesses with higher call volumes. Same core features with increased monthly minutes."
      : plan.tier === "pro"
      ? "For established businesses with consistent high call volumes. Same core features with substantial monthly minutes."
      : "A separate quotation for more than one operating location or receptionist number, or for a minute allowance outside the standard plans.",
    features: plan.tier === "custom"
      ? [
          "Operating locations by quotation",
          "Receptionist numbers by quotation",
          "Minute allowance by quotation",
          "Voice, accent and language preferences, subject to the voice provider",
          "Configuration by quotation",
        ]
      : [
          "One operating location",
          "One receptionist telephone number",
          "Missed-call answering when forwarding is available",
          "Conversational enquiry collection",
          "Lead summaries, including callback preferences, by the agreed delivery method",
          "Business-specific configuration",
          "Voice, accent and language preferences, subject to the voice provider",
        ],
    cta: plan.tier === "custom" ? "Request a tailored quote" : `Enquire about ${plan.name}`,
    href: `/enquire?plan=${plan.tier}`,
  })),
  guard: {
    eyebrow: "Optional add-on",
    title: relaunchGuardAddon.name,
    lead:
      `Add Google Business Profile monitoring to any Telloya plan. Relaunch Guard is a separate optional service. ${commercialCopy.guardPriceBasis} ${commercialCopy.guardOnly}`,
    pricePerLocationGbp: relaunchGuardAddon.pricePerLocationGbp,
    infoUrl: relaunchGuardAddon.infoUrl,
    features: [
      "Profile observation and reporting",
      "Charged per paid Guard location",
      "Does not add a receptionist location or number",
      "Subject to technical eligibility",
    ],
    examples: telloyaPlans
      .filter(p => p.monthlyPriceGbp !== null)
      .map(p => ({
        plan: p.name,
        locations: 1,
        telloyaPrice: p.monthlyPriceGbp!,
        guardPrice: relaunchGuardAddon.pricePerLocationGbp,
        combinedPrice: calculateCombinedPrice(p.monthlyPriceGbp!, 1),
      })),
    note:
      `Subscriptions, technical eligibility and Guard activation are subject to confirmation. ${commercialCopy.guardOnly} Relaunch Guard references the existing ProfileRelaunch Guard product. One-off ProfileRelaunch recovery services are not included in Guard.`,
    telloyaCompleteName: "Telloya Complete",
    telloyaCompleteNote:
      "\"Telloya Complete\" may be used as a descriptive name for Telloya plus Guard, but is not a competing fifth AI plan.",
    quantityNote:
      `More than one paid Guard location increases the Guard amount by ${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} per location. ${commercialCopy.guardOnly}`,
  },
  comparison: {
    eyebrow: "Compare plans",
    title: "Features and allowances",
    lead: `Standard plans share the same receptionist entitlement: ${commercialCopy.standardEntitlement} Choose a standard plan by the included monthly minutes. ${commercialCopy.extraReceptionist}`,
    table: {
      headers: ["Feature", "Basic", "Growth", "Pro", "Custom"],
      rows: [
        ["Monthly price", formatGbpPrice(telloyaPlans[0].monthlyPriceGbp!), formatGbpPrice(telloyaPlans[1].monthlyPriceGbp!), formatGbpPrice(telloyaPlans[2].monthlyPriceGbp!), "By quotation"],
        ["Included minutes/month", telloyaPlans[0].minutesPerMonth!.toString(), telloyaPlans[1].minutesPerMonth!.toString(), telloyaPlans[2].minutesPerMonth!.toString(), "Custom"],
        ["Missed-call answering", true, true, true, true],
        ["Enquiry collection", true, true, true, true],
        ["Lead summaries", true, true, true, true],
        ["Business configuration", true, true, true, true],
        ["Usage visibility", "Planned", "Planned", "Planned", "Planned"],
        ["Voice, accent and language", "Request", "Request", "Request", "Request"],
        ["Operating locations", String(standardEntitlement.operatingLocations), String(standardEntitlement.operatingLocations), String(standardEntitlement.operatingLocations), "Quotation"],
        ["Receptionist numbers", String(standardEntitlement.receptionistNumbers), String(standardEntitlement.receptionistNumbers), String(standardEntitlement.receptionistNumbers), "Quotation"],
      ],
    },
  },
  overage: {
    eyebrow: "Additional usage",
    title: "Extra minutes",
    lead:
      `If you need more AI call minutes beyond your monthly allowance, you can opt in to additional usage at ${formatGbpPrice(overagePolicy.pricePerMinuteGbp)} per minute.`,
    points: [
      "Only available after a separate explicit opt-in",
      "Requires a customer-defined monthly spending cap",
      commercialCopy.overageEnquiry,
      "No unapproved automatic billing",
    ],
    note:
      `${commercialCopy.overageOptIn} ${commercialCopy.overageEnquiry} Additional minute pricing must be confirmed during commercial acceptance. This form does not authorise usage billing.`,
  },
  setup: {
    title: "Setup and terms",
    points: [
      {
        title: "Standard setup included",
        description:
          commercialCopy.standardSetup + " Initial configuration and call-forwarding guidance are included with all plans.",
      },
      {
        title: "Complex setups quoted separately",
        description:
          commercialCopy.complexSetup + " Additional receptionist numbers, unusual carrier configurations and more than one receptionist location are quoted separately.",
      },
      {
        title: "Subscription terms",
        description:
          "Subscription terms, duration and cancellation policies will be confirmed during commercial acceptance.",
      },
      {
        title: "Provider-dependent compatibility",
        description:
          "Call forwarding, numbers, languages and activation depend on provider and location compatibility.",
      },
    ],
  },
  international: {
    title: "International availability",
    points: [
      "Published prices are in GBP",
      "Settlement currency and payment terms are confirmed before proceeding",
      commercialCopy.international,
      "This page does not offer local-currency checkout or currency conversion",
      "This page does not list countries, carriers or languages as currently available",
    ],
    note:
      "Telloya is marketed internationally. A service can proceed only where the customer's telephone provider, number provisioning and voice options are compatible. Compatibility is confirmed before a service starts.",
  },
  faq: {
    title: "Pricing questions",
    questions: [
      {
        q: "What's included in the monthly minutes?",
        a: "The minute allowance covers time Telloya spends actively handling calls. This includes greeting the caller, collecting enquiry details, and wrapping up the conversation. Time spent on hold or during call transfer is handled according to the agreed service terms.",
      },
      {
        q: "What happens if I exceed my minutes?",
        a: `By default, no additional minutes are charged. ${commercialCopy.overageOptIn} ${commercialCopy.overageEnquiry} This must be explicitly confirmed during commercial acceptance. This enquiry form does not authorise automatic billing.`,
      },
      {
        q: "Can I cancel my subscription?",
        a: "Cancellation terms and any applicable notice periods will be confirmed in your subscription agreement during commercial acceptance.",
      },
      {
        q: "What's included in the setup?",
        a: "Standard initial setup and call forwarding guidance are included. Complex setups, additional phone numbers, or unusual carrier configurations may need individual quotations.",
      },
      {
        q: "How does Relaunch Guard work with multiple locations?",
        a: `${commercialCopy.guardPriceBasis} A standard Telloya plan still includes one operating location and one receptionist number. Three paid Guard locations add ${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp * 3)}. ${commercialCopy.guardOnly} Subscriptions and technical eligibility are confirmed separately.`,
      },
      {
        q: "Is Relaunch Guard required?",
        a: "No. Relaunch Guard is an optional add-on. You can subscribe to any Telloya plan without Guard. Guard is a separate service for Google Business Profile monitoring.",
      },
      {
        q: "Where is Telloya available?",
        a: `Telloya is marketed internationally. ${commercialCopy.international} Compatibility is confirmed before a service starts. This page does not list countries or carriers as available.`,
      },
      {
        q: "What currencies are supported?",
        a: "Published plan prices are in GBP. Settlement currency and payment terms are confirmed before you proceed. This website does not offer local-currency checkout or conversion.",
      },
      {
        q: "Can I choose a voice, accent or language?",
        a: `${commercialCopy.voicePreference} ${commercialCopy.voiceProvider}`,
      },
    ],
  },
  cta: {
    title: "Ready to get started?",
    description: "Choose a plan to preselect it on the enquiry form. Sending an enquiry does not take payment, create a subscription, or start the service.",
    cta: "Enquire now",
    href: "/enquire",
  },
} as const

// The illustrative /demo script lives in demo-script.ts. It is not a live call.

// Navigation content
export const navigationContent = {
  main: [
    { label: "How It Works", href: "/how-it-works" },
    { label: "Features", href: "/features" },
    { label: "Industries", href: "/industries" },
    { label: "Pricing", href: "/pricing" },
    { label: "See Example", href: "/demo" },
  ],
  account: {
    label: "Customer Login",
    href: getCustomerPortalHref(),
  },
  cta: {
    label: "Enquire about Telloya",
    href: "/enquire",
  },
} as const

// Footer content
export const footerContent = {
  tagline: `${brandName} is an AI receptionist service operated by ProfileRelaunch Ltd.`,
  sections: [
    {
      title: "Telloya",
      links: [
        { label: "How It Works", href: "/how-it-works" },
        { label: "See Telloya in Action", href: "/demo" },
        { label: "Features", href: "/features" },
        { label: "Industries", href: "/industries" },
        { label: "Pricing", href: "/pricing" },
        { label: "Enquire", href: "/enquire" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Customer Login", href: getCustomerPortalHref() },
      ],
    },
    {
      title: "ProfileRelaunch",
      links: [
        { label: "Main Website", href: "https://profilerelaunch.com" },
        { label: "Relaunch Guard", href: "https://profilerelaunch.com/relaunch-guard" },
      ],
    },
  ],
  legal: [
    { label: "Cookies", href: "/cookies" },
    { label: "Privacy", href: "https://profilerelaunch.com/privacy" },
    { label: "Terms", href: "https://profilerelaunch.com/terms" },
  ],
  note:
    "The Cookies link describes storage on this Telloya website. Privacy and Terms are ProfileRelaunch Ltd's existing company-wide website notices. They are not Telloya service terms. Telloya-specific terms for voice services, call recording, transcripts, retention, VAT, cancellation and refunds are not published on this site. They still await approval and will be published before public launch.",
} as const
