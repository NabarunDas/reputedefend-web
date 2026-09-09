export const allHomepageFaqs = [
  {
    q: "My Business Profile has been suspended. Where should I start?",
    a: "Keep a copy of the notification and note when the suspension appeared. Gather the profile link, recent changes and any steps you have already taken. Avoid making repeated speculative changes. We can help you understand the issue and organise information for an appropriate next step.",
  },
  {
    q: "Can you help if I cannot access or verify my profile?",
    a: "Access and verification issues need to be understood before deciding on a recovery route. Tell us what you can access, what message you see and whether ownership or business details have changed. Do not send passwords or verification codes.",
  },
  {
    q: "Can you remove a negative review?",
    a: "A negative review is not automatically a policy violation. We help assess whether the content may breach platform policy and what evidence could support a report or challenge. Google decides whether a review is removed; we cannot guarantee removal.",
  },
  {
    q: "What if several suspicious reviews appear at once?",
    a: "Record the review links, dates and the pattern you have noticed. Separate verifiable facts from assumptions about who posted them. We can help organise that information and consider whether there is a policy-based reason to challenge the reviews.",
  },
  {
    q: "What information should I include in my enquiry?",
    a: "Describe what happened, when it started and what you have already tried. Include relevant public profile or review links and the wording of any platform message. A short factual summary is enough to start. Do not include passwords, verification codes or unnecessary personal information.",
  },
  {
    q: "I have already submitted an appeal. Can I still get in touch?",
    a: "Yes. Explain what you submitted, when you submitted it and any response you received. This helps us understand the current position and consider appropriate next steps without assuming that another submission is the right approach.",
  },
  {
    q: "How long does reinstatement or a review decision take?",
    a: "There is no fixed outcome or timeframe we can promise. Timing depends on the issue, the available information and the platform process. We explain the practical next steps and uncertainties rather than promise a deadline we do not control.",
  },
  {
    q: "Is ReputeDefend affiliated with Google?",
    a: "No. ReputeDefend is an independent support service, not Google or an official Google representative. We do not have control over platform decisions and cannot guarantee profile reinstatement, verification or review removal.",
  },
  {
    q: "What happens after I send an enquiry?",
    a: "Our team reviews the information you share to understand the situation. We contact you with our assessment and recommended next steps, which may include asking for more context. Any proposed support should be clear before you decide how to proceed.",
  },
]

const homepageFaqIndices = new Set([0, 1, 2, 4, 7, 8])
export const homepageFaqs = allHomepageFaqs.filter((_, index) => homepageFaqIndices.has(index))
export const serviceFaqsForLater = allHomepageFaqs.filter((_, index) => !homepageFaqIndices.has(index))
