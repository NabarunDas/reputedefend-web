export const getHelpHref = "/get-help"

export const getHelpSeo = {
  titlePage: "Start Your Assessment — Google Business Profile & Review Help",
  description:
    "Tell ProfileRelaunch about a Google Business Profile or review issue. A human assesses the situation and explains the strongest appropriate next step for recovery or review support.",
} as const

export const getHelpHero = {
  eyebrow: "Start your assessment",
  titleLines: ["Tell us what happened.", "We'll help make the next step clear."] as const,
  lead:
    "You don't need to diagnose the problem first. Start with what changed, what Google has told you and what you have already tried. A human will review the situation and explain the strongest appropriate next step.",
  supportLine: "Human-reviewed • Evidence-led • No need for a perfect case file",
} as const

export const getHelpRoutes = {
  live: {
    status: "Available now",
    title: "Tell us what happened",
    copy: "Complete the assessment below.",
  },
  future: {
    status: "Not available yet",
    title: "Connect your Google Business Profile",
    copy: "Google connection is not available yet. Use the assessment form below to request help without connecting your account.",
    note: "There is no confirmed date for Google connection. Never share your Google password or verification codes.",
  },
} as const

export const getHelpTrustStrip = [
  "Human-reviewed assessment",
  "Start with what you have",
  "No passwords or verification codes",
  "Clear recommendation before paid support",
] as const

export const getHelpProcess = {
  title: "What happens next",
  steps: [
    { n: "01", title: "We review the information" },
    { n: "02", title: "We clarify anything important if needed" },
    { n: "03", title: "We explain the recommended route" },
    { n: "04", title: "If paid support makes sense, you decide whether to use Guided or Managed" },
  ],
} as const

export const getHelpOutcome = {
  title: "What the recommendation may be",
  copy: "The recommendation may be to proceed, gather more information, use a different route, or not pay for support yet.",
} as const

export const getHelpSecurity = {
  title: "Keep your account secure",
  copy: "Never send passwords, OTPs, verification codes, security answers or unnecessary sensitive personal information. Owner-only and security actions stay with you.",
} as const
