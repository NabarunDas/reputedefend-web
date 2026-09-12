export const howDescription =
  "See how ProfileRelaunch works: share your Google Business Profile or review issue, receive a human evidence-led assessment, understand the recommended route, and choose whether you want help carrying it through."

export const howHero = {
  eyebrow: "How ProfileRelaunch works",
  titleBefore: "A clear process for situations that ",
  titleAccent: "rarely feel clear.",
  lead:
    "You don't need to diagnose the issue before contacting us. Tell us what happened, what Google has told you and what you have already tried. A human reviews the situation, identifies what matters and helps you understand the strongest appropriate route forward.",
  primaryCta: "Tell us what happened",
  secondaryCta: "See what happens next",
  note: "Human case review • Evidence-led assessment • Clear next steps",
}

export const howVisualSteps = [
  { n: "01", title: "You share the situation" },
  { n: "02", title: "We review & clarify" },
  { n: "03", title: "You understand the options" },
  {
    n: "04",
    title: "You decide how to proceed",
    support: "Act on the recommendation yourself or ask us to help carry it through.",
  },
] as const

export const howVisualCaption =
  "A clear route from uncertainty to an informed next step."

export const howTrustStrip = [
  "Human-reviewed enquiries",
  "No payment to submit",
  "No passwords or verification codes",
  "Independent of Google",
] as const

export const howJourney = {
  id: "what-happens-next",
  eyebrow: "What happens next",
  title: "From your enquiry to a clearer decision.",
  lead:
    "The first stage is about understanding the situation and identifying the next step that makes sense. If you later want help carrying that recommendation through, the type of support depends on the problem.",
}

export const journeySteps = [
  {
    id: "tell-us",
    n: "01",
    title: "Tell us what happened",
    body: "Share the issue, when you noticed it, any relevant links or messages and what you have already tried. You do not need to diagnose the problem first.",
  },
  {
    id: "review",
    n: "02",
    title: "We review and clarify",
    body: "A human reviews what you send. If something important is missing or unclear, we'll explain what additional information may help and why.",
  },
  {
    id: "recommend",
    n: "03",
    title: "We explain the recommended next step",
    body: "We bring the facts, available evidence and relevant process together and explain the route we believe makes sense — and why.",
  },
  {
    id: "decide",
    n: "04",
    title: "You decide how to proceed",
    body: "You can act on the recommendation yourself or ask ProfileRelaunch to help carry the next stage through — organising the work so you do not have to piece the evidence, wording and process together alone.",
  },
] as const

export const howSend = {
  eyebrow: "What to send",
  title: "Start with what you have.",
  lead:
    "A useful enquiry usually starts with the basics. If something is missing, you can still contact us — we'll tell you if more information may help.",
  items: [
    "A short description of what happened",
    "When the issue started",
    "Business Profile or review link, if available",
    "Relevant Google messages or notices",
    "What you have already tried",
    "Useful screenshots or supporting information",
  ],
  safety: "Never send passwords, verification codes or account credentials.",
  safetyNote:
    "If an action needs to be taken inside your Google account, we'll explain what you need to do rather than asking you to hand over login details.",
}

export const howAssess = {
  eyebrow: "How we assess the situation",
  title: "We look at the whole position before recommending an action.",
  lead:
    "A useful review or profile-recovery assessment brings together what happened, the available evidence, the process that may apply and any gaps that could materially affect the recommendation.",
  items: [
    {
      n: "01",
      title: "What happened",
      body: "The event, timeline and relevant changes.",
    },
    {
      n: "02",
      title: "What can be supported",
      body: "Messages, links, records and other useful evidence.",
    },
    {
      n: "03",
      title: "Which route fits",
      body: "The recovery, verification, reporting, challenge, response or other process that appears relevant.",
    },
    {
      n: "04",
      title: "What could affect the route",
      body: "Any missing information, previous action or unresolved point that may materially change what should happen next.",
    },
  ],
}

export const howExpect = {
  eyebrow: "After we review your enquiry",
  title: "You should come away knowing what the next step is — and why.",
  lead:
    "The initial review is designed to turn a confusing situation into a clearer decision: what appears to be happening, what matters, and which next step makes sense from here.",
  items: [
    {
      title: "An initial view of the situation",
      body: "A clear explanation of how we understand the issue based on the information available.",
    },
    {
      title: "The information that matters",
      body: "If something is missing or could materially change the assessment, we'll explain what it is and why it matters.",
    },
    {
      title: "A recommended route",
      body: "We'll explain the next step we believe is appropriate rather than leaving you with a generic list of options.",
    },
    {
      title: "Why we recommend it",
      body: "You should understand what supports the recommendation and what would make us reconsider it.",
    },
  ],
}

export const howPaths = {
  eyebrow: "If you want further support",
  title: "What carrying the recommendation through can look like.",
  lead:
    "The initial review helps clarify the route. If you want ProfileRelaunch to carry more of the work forward, we can help organise the evidence, prepare the material and support the next stage rather than leaving you to piece the process together alone.",
  items: [
    {
      href: "/business-profile-recovery",
      cue: "Suspension • Access • Verification",
      title: "Business Profile Protection & Recovery",
      path: [
        "Organise relevant evidence",
        "Prepare recovery or appeal material",
        "Review previous recovery attempts",
        "Support the next stage",
      ],
      cta: "Explore Profile Recovery",
    },
    {
      href: "/review-protection",
      cue: "Suspicious or damaging reviews",
      title: "Review Protection",
      path: [
        "Organise the review evidence",
        "Prepare reporting or challenge material",
        "Shape a professional response where appropriate",
        "Support what happens next",
      ],
      cta: "Explore Review Protection",
    },
  ],
  note: "The exact work depends on the situation. If you want further paid support, we'll explain what we can help with and the fee before any paid work begins.",
}

export const howTrust = {
  eyebrow: "What you can expect from us",
  title: "Clear guidance from the first review to the next action.",
  lead:
    "We keep the work focused on the facts, the evidence and the route that appears strongest for the situation.",
  principles: [
    {
      title: "Human review",
      body: "We review the situation in context rather than automatically generating a generic answer.",
    },
    {
      title: "Facts before assumptions",
      body: "We distinguish what the information supports from what is possible, suspected or still unknown.",
    },
    {
      title: "Clear recommendations",
      body: "We explain what we think the next step should be and why.",
    },
    {
      title: "Practical support",
      body: "If you want help carrying the recommendation through, we focus on preparing and supporting the appropriate next stage rather than leaving you with generic advice.",
    },
  ],
  callout:
    "Google makes the final platform decision on matters such as Business Profile reinstatement and review removal. ProfileRelaunch focuses on what you can influence: understanding the issue, preparing relevant evidence clearly and approaching the appropriate process in a stronger position.",
}

export const howFaqs = [
  {
    q: "What happens after I submit a case?",
    a: "A human reviews what you send. If something important is missing or unclear, we may ask for clarification. We then explain how we understand the situation and the next step we believe makes sense.",
  },
  {
    q: "Do I need all my evidence before contacting you?",
    a: "No. Start with what you have: a short description, timing, any relevant links or notices, and what you have already tried. If more information would help, we'll explain what and why.",
  },
  {
    q: "Will you need access to my Google account?",
    a: "You should not send passwords, verification codes or account credentials. We work from the information you share. If an action needs to be taken inside your account, we'll explain what you need to do.",
  },
  {
    q: "What if you need more information from me?",
    a: "We'll explain what additional information may help and why it matters. You can still contact us if the picture is incomplete — a useful enquiry does not require a perfect file.",
  },
  {
    q: "What can further support include?",
    a: "Depending on the situation, further support may include organising evidence, preparing recovery, appeal, reporting or challenge material, reviewing previous attempts, helping shape a professional public response, or supporting the next stage after new information or a platform response. The exact scope and any fee are explained before you decide.",
  },
  {
    q: "Can you guarantee the outcome or how long Google will take?",
    a: "No. Google controls platform outcomes and timeframes, including profile reinstatement and review removal. We can help you understand the situation and take a clearer next step; we cannot guarantee what Google will decide or when.",
  },
]

export const howFaqIntro = {
  eyebrow: "Common questions",
  title: "Questions before you start.",
  lead: "A few practical answers about the initial review, what information helps and what further support may involve.",
}

export const howClose = {
  eyebrow: "Ready to start?",
  title: "You don't need to have the answer before you ask for help.",
  lead:
    "Tell us what happened, what changed and what you have already tried. We'll review the situation, explain the next step that appears strongest and, if you want further help, show you what carrying that recommendation through could involve.",
  notes: [
    "No payment is required to submit your enquiry.",
    "Please don't send passwords or verification codes.",
  ],
  panel:
    "Start with the situation as it stands. A human will review it, explain the next step that makes sense and help you understand what happens next.",
  cta: "Tell us what happened",
}
