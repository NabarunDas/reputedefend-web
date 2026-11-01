/**
 * Telloya marketing website content configuration.
 * 
 * All customer-facing copy, CTAs, and page metadata are defined here
 * to enable consistent content management and testing.
 */

import { brandName, brandSiteUrl } from "@/lib/brand"
import { getCustomerPortalHref } from "@/lib/customer-portal"
import { legalIdentity } from "../../../lib/legal"

// Homepage content
export const homepageContent = {
  seo: {
    title: "AI Receptionist for Tradespeople & Local Services",
    description:
      "When you're on a job and can't pick up, Telloya can help handle missed-call enquiries, collect useful details and make it easier to follow up.",
  },
  hero: {
    headline: "You focus on the job. Telloya helps answer your missed calls.",
    supporting:
      "When you're on a job and can't pick up, Telloya can help handle missed-call enquiries, collect useful details and make it easier to follow up.",
    primaryCta: "See how it works",
    primaryHref: "/how-it-works",
    secondaryCta: "Enquire about Telloya",
    secondaryHref: "/demo",
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
        description: "Customers get a helpful response even when you're unavailable",
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
      location: "Richmond, SW London",
      problem: "Boiler not heating properly, pressure gauge showing low",
      callback: "Weekday mornings preferred",
      time: "11:23 AM",
    },
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
    title: "Telloya and Complete",
    lead:
      "Choose standalone Telloya for AI receptionist service, or the proposed Complete package for Telloya plus Relaunch Guard profile monitoring. Final pricing and Complete package details are being confirmed.",
    telloya: {
      name: "Telloya",
      description: "AI receptionist for missed-call enquiries",
      features: [
        "Missed-call assistance",
        "Enquiry collection",
        "Lead summaries",
        "Usage visibility",
      ],
      cta: "View pricing",
      href: "/pricing",
    },
    complete: {
      name: "Complete",
      description: "Telloya plus Relaunch Guard (proposed package)",
      features: [
        "Everything in Telloya",
        "Google Business Profile monitoring",
        "Review alerts",
        "Profile change detection",
      ],
      cta: "View pricing",
      href: "/pricing",
      note: "Combines two distinct services in one subscription",
    },
  },
  faq: {
    eyebrow: "Common questions",
    title: "Frequently asked questions",
    questions: [
      {
        q: "How does call forwarding work?",
        a: "Telloya uses missed-call forwarding, which depends on your telephone provider and configuration. We'll help you set this up during onboarding. Compatibility varies by provider.",
      },
      {
        q: "Do I need to change my phone number?",
        a: "No. Telloya works with your existing business number through call forwarding.",
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
    href: "/demo",
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
      "Telloya is designed to help when you can't answer the phone. Here's how the service works from start to finish.",
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
          "Call forwarding setup depends on your provider. Most UK providers support this feature, but compatibility varies. We'll help you check during onboarding.",
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
          "You receive a clear summary with all the information Telloya collected. This appears in your dashboard and can be sent via notification.",
        detail:
          "The summary is designed to give you what you need to follow up confidently — no guessing what the customer wanted.",
      },
      {
        number: "06",
        title: "You follow up",
        description:
          "With the full context in hand, you can call the customer back at the right time with the right preparation.",
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
        "Ending with: 'Thank you. [Business Name] will call you back as soon as they can. Is there anything else you'd like me to pass on?'",
      ],
      note: "This is an illustrative example. The actual conversation adapts to how the caller responds.",
    },
  },
  setup: {
    eyebrow: "Getting started",
    title: "Call forwarding setup",
    lead:
      "Telloya works through missed-call forwarding. This is a standard feature offered by most UK telephone providers, but configuration varies.",
    steps: [
      {
        title: "Check provider compatibility",
        description:
          "Most landline and mobile providers support call forwarding. We'll help you confirm this works with your current setup.",
      },
      {
        title: "Configure forwarding rules",
        description:
          "You'll set your phone to forward unanswered calls to Telloya's service number. This typically involves a provider-specific code or online setting.",
      },
      {
        title: "Test the service",
        description:
          "Before going live, we'll run test calls to make sure forwarding works correctly and Telloya captures enquiries as expected.",
      },
    ],
    note:
      "We provide setup guidance, but the forwarding configuration itself depends on your telephone provider. If forwarding isn't supported or doesn't work reliably, Telloya may not be suitable for your setup.",
  },
  limitations: {
    eyebrow: "Important to know",
    title: "What Telloya doesn't do",
    points: [
      "Telloya does not automatically confirm appointments or booking times",
      "It does not guarantee that every caller will leave their details",
      "It cannot replace a human receptionist for complex enquiries",
      "Call forwarding depends on your telephone provider's capabilities",
      "Some callers may prefer to try again later rather than speak with an AI",
    ],
    lead: "Telloya is designed to help with straightforward missed-call enquiries. It's not a complete replacement for all call handling.",
  },
  cta: {
    title: "Ready to see if Telloya fits your business?",
    description: "Enquire about the service and we'll help you understand if it's right for your setup.",
    cta: "Enquire now",
    href: "/demo",
  },
} as const

// Features page
export const featuresContent = {
  seo: {
    title: "Features – Telloya AI Receptionist",
    description:
      "Missed-call assistance, conversational enquiry collection, lead summaries, callback preferences and business-specific configuration.",
  },
  hero: {
    eyebrow: "Features",
    title: "Designed for tradespeople",
    lead: "Telloya focuses on the features that matter when you're working on site and can't answer the phone.",
  },
  features: [
    {
      kicker: "Feature 01",
      title: "Missed-call assistance",
      description:
        "When you can't pick up, Telloya can answer the forwarded call and help the customer. Our AI receptionist explains you're unavailable and offers to collect their enquiry details.",
      status: "POC-tested",
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
        "Telloya asks for the information you need to follow up effectively. The conversation feels natural, not like filling out a form over the phone.",
      status: "POC-tested",
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
        "Every enquiry Telloya captures is delivered as a clear, structured summary. You get the context you need without listening to the full call.",
      status: "POC-tested",
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
        "Telloya asks when the customer prefers to be called back. This helps you follow up at a time that works for them.",
      status: "POC-tested",
      points: [
        "Morning, afternoon or evening preference",
        "Urgent vs routine enquiries",
        "Any-time option for flexible customers",
      ],
    },
    {
      kicker: "Feature 05",
      title: "Business-specific configuration",
      description:
        "Telloya is configured for your business type and services. The questions adapt to what your customers typically need.",
      status: "POC-tested",
      points: [
        "Business name and service description",
        "Industry-specific question flow",
        "Custom greeting message",
      ],
    },
    {
      kicker: "Feature 06",
      title: "Usage visibility",
      description:
        "See how many calls Telloya has handled, review lead summaries, and track your usage. Transparency matters.",
      status: "Planned",
      points: [
        "Dashboard with call history",
        "Lead status tracking",
        "Usage and minute consumption",
      ],
      note: "Dashboard features are being built. Initial subscribers will receive lead summaries via the agreed delivery method.",
    },
  ],
  technical: {
    eyebrow: "Technical foundation",
    title: "Voice AI technology",
    lead:
      "Telloya is built using established voice AI platforms. Implementation details and provider partnerships are subject to final technical architecture decisions.",
    points: [
      "Real-time conversation processing",
      "Natural language understanding",
      "UK-based phone numbers (provider dependent)",
      "Telephony routing and call handling",
    ],
  },
  future: {
    eyebrow: "Roadmap",
    title: "Planned enhancements",
    lead: "We're actively building additional features based on early user feedback.",
    items: [
      {
        title: "CRM integration",
        description: "Send leads directly to your existing tools",
        timeline: "Under consideration",
      },
      {
        title: "SMS notifications",
        description: "Instant alerts when a new enquiry comes in",
        timeline: "Under consideration",
      },
      {
        title: "Multi-language support",
        description: "Handle calls in languages beyond English",
        timeline: "Under consideration",
      },
      {
        title: "Advanced call routing",
        description: "Different handling based on call time or type",
        timeline: "Under consideration",
      },
    ],
    note:
      "These are potential future enhancements, not current features. Availability and timeline depend on development priorities and user demand.",
  },
  cta: {
    title: "Want to see how Telloya could work for you?",
    cta: "Get in touch",
    href: "/demo",
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
      "Telloya is designed for local service businesses where missing a call can mean missing an opportunity. Here's how it works for different trades.",
  },
  industries: [
    {
      name: "Plumbing",
      tagline: "Handle emergency calls while you're on site",
      description:
        "Plumbing emergencies don't wait. When you're fixing one urgent job, Telloya can capture details from the next caller — so you know what you're walking into.",
      scenarios: [
        {
          title: "Emergency burst pipe",
          situation: "Customer has a burst pipe and needs someone urgently",
          telletoyaHelps:
            "Telloya captures the exact location of the leak, property access details, and severity. You know it's urgent before calling back.",
        },
        {
          title: "Boiler breakdown",
          situation: "No hot water, family home, heating engineer needed",
          telletoyaHelps:
            "Telloya collects boiler make and model, symptoms, when it stopped working, and whether it's under warranty.",
        },
        {
          title: "Quote requests",
          situation: "Bathroom refurbishment, needs a quote",
          telletoyaHelps:
            "Tells you it's not urgent, gets rough scope (full bathroom, shower room, etc.), and preferred visit times for assessment.",
        },
      ],
      benefits: [
        "Know which calls need immediate response",
        "Get location and access details before travelling",
        "Distinguish between emergencies and quote requests",
      ],
    },
    {
      name: "Heating Engineers",
      tagline: "Never miss a boiler callout",
      description:
        "Heating breakdowns are time-sensitive. Telloya helps you prioritise urgent callouts and collect the technical details you need before arriving.",
      scenarios: [
        {
          title: "No heating in winter",
          situation: "Boiler stopped working, cold house, elderly resident",
          telletoyaHelps:
            "Telloya captures urgency, resident vulnerability, boiler type, error codes showing, and how long it's been off.",
        },
        {
          title: "Annual service",
          situation: "Customer wants to book their yearly boiler service",
          telletoyaHelps:
            "Confirms it's routine, gets address, asks if anything's changed since last service, and preferred appointment windows.",
        },
        {
          title: "Radiator issues",
          situation: "One radiator cold, others working fine",
          telletoyaHelps:
            "Assesses it's not urgent, captures which radiator, system type, and whether customer has tried bleeding it.",
        },
      ],
      benefits: [
        "Understand urgency before calling back",
        "Capture error codes and symptoms",
        "Schedule routine work efficiently",
      ],
    },
    {
      name: "Electricians",
      tagline: "Respond to callouts with full context",
      description:
        "Electrical work ranges from urgent safety issues to planned installations. Telloya helps you understand what each job involves before you commit.",
      scenarios: [
        {
          title: "Power cut",
          situation: "Partial power loss, some circuits not working",
          telletoyaHelps:
            "Tells you it's urgent, captures which circuits, whether consumer unit has tripped, and property type.",
        },
        {
          title: "New installation",
          situation: "Customer wants additional sockets installed",
          telletoyaHelps:
            "Confirms it's not urgent, gets rough scope (how many, which rooms), property age, and availability for assessment.",
        },
        {
          title: "Faulty appliance",
          situation: "Oven not working properly",
          telletoyaHelps:
            "Determines it's appliance-specific, captures symptoms, whether it's tripping the circuit, and appliance age.",
        },
      ],
      benefits: [
        "Identify safety-critical callouts immediately",
        "Understand scope before quoting",
        "Avoid unnecessary site visits for non-electrical issues",
      ],
    },
    {
      name: "Property Maintenance",
      tagline: "Manage multiple enquiry types efficiently",
      description:
        "Property maintenance covers everything from leaks to lockouts. Telloya helps you sort urgent work from routine jobs and collect the details that matter.",
      scenarios: [
        {
          title: "Landlord emergency",
          situation: "Tenant-reported leak, property damage risk",
          telletoyaHelps:
            "Identifies it as urgent, captures property address, tenant contact, leak location, and landlord details.",
        },
        {
          title: "Planned maintenance",
          situation: "Quarterly property inspection needed",
          telletoyaHelps:
            "Logs it as routine, gets property address, number of units, access requirements, and scheduling preferences.",
        },
        {
          title: "Cosmetic work",
          situation: "Painting and decorating quote",
          telletoyaHelps:
            "Confirms not urgent, captures rooms, condition, timescale, and arranges convenient assessment time.",
        },
      ],
      benefits: [
        "Prioritise genuine emergencies",
        "Collect landlord and tenant details correctly",
        "Schedule routine work without phone tag",
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
    href: "/demo",
  },
} as const

// Pricing page
export const pricingContent = {
  seo: {
    title: "Pricing – Telloya AI Receptionist",
    description:
      "Telloya standalone or Complete with Relaunch Guard. Pricing being finalised for launch.",
  },
  hero: {
    eyebrow: "Pricing",
    title: "Two options to fit your needs",
    lead:
      "Choose standalone Telloya for AI receptionist service, or Complete for Telloya plus Google Business Profile monitoring with Relaunch Guard.",
  },
  plans: [
    {
      name: "Telloya",
      tagline: "AI receptionist for missed calls",
      description:
        "Everything you need to handle missed-call enquiries professionally while you're working on site.",
      status: "Pricing being finalised",
      features: [
        "Missed-call answering",
        "Conversational enquiry collection",
        "Lead summaries with callback preferences",
        "Business-specific configuration",
        "Usage visibility",
        "UK-based phone number",
      ],
      notes: [
        "Minute allowance and overage rates to be confirmed",
        "Call forwarding setup depends on your telephone provider",
      ],
      cta: "Contact us for details",
      href: "/demo",
    },
    {
      name: "Complete",
      tagline: "Telloya plus Relaunch Guard",
      description:
        "Combines Telloya AI receptionist with Relaunch Guard Google Business Profile monitoring in one subscription.",
      status: "Pricing being finalised",
      features: [
        "Everything included in Telloya",
        "Google Business Profile monitoring",
        "Review alerts (new reviews, suspicious activity)",
        "Profile change detection",
        "Monthly monitoring reports",
        "Early warning of potential issues",
      ],
      notes: [
        "Complete includes two distinct services from ProfileRelaunch",
        "Each service operates independently with its own features",
        "Minute allowance and subscription terms to be confirmed",
      ],
      cta: "Contact us for details",
      href: "/demo",
      highlight: true,
    },
  ],
  comparison: {
    eyebrow: "What's the difference?",
    title: "Telloya vs Complete",
    lead: "Both plans include full Telloya AI receptionist features. Complete adds ongoing profile monitoring.",
    table: {
      headers: ["Feature", "Telloya", "Complete"],
      rows: [
        ["Missed-call answering", true, true],
        ["Enquiry collection", true, true],
        ["Lead summaries", true, true],
        ["Business configuration", true, true],
        ["Profile monitoring", false, true],
        ["Review alerts", false, true],
        ["Change detection", false, true],
      ],
    },
  },
  commercial: {
    eyebrow: "Important to know",
    title: "Pricing and terms",
    points: [
      {
        title: "Pricing not finalised",
        description:
          "We're finalising pricing, minute allowances, and subscription terms before public launch. Contact us for current details.",
      },
      {
        title: "No purchase available yet",
        description:
          "Telloya is not currently available for self-service purchase. Early access is by enquiry only.",
      },
      {
        title: "Not unlimited",
        description:
          "Both plans will include a monthly minute allowance. Overage handling and rates are being confirmed.",
      },
      {
        title: "Proposed package structure",
        description:
          "Complete is a proposed package combining Telloya and Relaunch Guard. Final package terms, feature scope, and pricing are being confirmed before launch.",
      },
    ],
  },
  faq: {
    title: "Pricing questions",
    questions: [
      {
        q: "When will pricing be confirmed?",
        a: "We're finalising pricing and packaging before public launch. If you're interested in Telloya, enquire now and we'll share details as soon as they're available.",
      },
      {
        q: "Can I sign up now?",
        a: "Not yet. We're in the final stages before launch. Use the enquiry form to express interest and we'll contact you when subscriptions open.",
      },
      {
        q: "What's included in the minute allowance?",
        a: "The minute allowance covers time Telloya spends on calls. We'll provide full details on how minutes are calculated and what happens if you exceed your allowance.",
      },
      {
        q: "Is there a contract?",
        a: "Subscription terms, minimum commitment and cancellation policies will be confirmed before launch.",
      },
      {
        q: "Do I need Relaunch Guard to use Telloya?",
        a: "No. Telloya is available as a standalone service. Complete is a proposed package option for businesses that want both AI receptionist and profile monitoring, subject to final terms.",
      },
    ],
  },
  cta: {
    title: "Interested in Telloya?",
    description: "Enquire now and we'll keep you informed as we approach launch.",
    cta: "Get in touch",
    href: "/demo",
  },
} as const

// Demo/Enquiries page
export const demoContent = {
  seo: {
    title: "Enquire About Telloya – AI Receptionist Demo",
    description:
      "Get in touch to learn more about Telloya AI receptionist for tradespeople and local service businesses.",
  },
  hero: {
    eyebrow: "Get in touch",
    title: "Enquire about Telloya",
    lead:
      "We're in the final stages before public launch. Let us know you're interested and we'll be in touch with details.",
  },
  contact: {
    title: "Send us an enquiry",
    lead:
      "Email us at the address below with 'Telloya Enquiry' in the subject line.",
    email: legalIdentity.contactEmail ?? "contact@profilerelaunch.com",
    subject: "Telloya Enquiry",
    whatToInclude: [
      "Your business name and type of work",
      "Rough location (town or region)",
      "How many calls you typically miss per week",
      "Whether you're interested in Telloya standalone or the proposed Complete package",
      "Any questions about how the service works",
    ],
  },
  future: {
    title: "Real demonstrations coming soon",
    description:
      "We're building a proper demonstration experience where you can hear how Telloya handles calls. This will be available before public launch.",
    note:
      "We will not create fake AI demonstrations or pretend to have live call integration until the real service is ready.",
  },
  alternative: {
    eyebrow: "Already a ProfileRelaunch customer?",
    title: "Access your account",
    lead: "Existing customers can log in to the ProfileRelaunch customer portal.",
    cta: "Customer login",
    href: getCustomerPortalHref(),
  },
  cta: {
    title: "We'll be in touch soon",
    description: "Thank you for your interest in Telloya. We're excited to launch this service.",
  },
} as const

// Navigation content
export const navigationContent = {
  main: [
    { label: "How It Works", href: "/how-it-works" },
    { label: "Features", href: "/features" },
    { label: "Industries", href: "/industries" },
    { label: "Pricing", href: "/pricing" },
    { label: "Demo", href: "/demo" },
  ],
  cta: {
    label: "Customer Login",
    href: getCustomerPortalHref(),
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
        { label: "Features", href: "/features" },
        { label: "Industries", href: "/industries" },
        { label: "Pricing", href: "/pricing" },
        { label: "Demo", href: "/demo" },
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
    { label: "Privacy", href: "https://profilerelaunch.com/privacy" },
    { label: "Terms", href: "https://profilerelaunch.com/terms" },
  ],
  note:
    "Privacy and Terms links above are company-wide website notices. Telloya-specific terms covering AI voice services, call recording, transcripts and data retention will be published before public launch.",
} as const
