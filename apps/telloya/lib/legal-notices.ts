/**
 * Telloya marketing-site legal copy.
 *
 * Draft for legal review. It is not a completed legal assessment and it is
 * not the agreement for a paid Telloya subscription.
 */

export const legalReviewDate = "11 November 2026"

export const vatStatement =
  "ProfileRelaunch Ltd is not currently registered for VAT. VAT is not charged on the published prices."

export const legalReviewBanner =
  "Draft for legal review. This page explains the Telloya marketing website. It is not a completed legal assessment, and it is not the agreement for a paid Telloya subscription."

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: readonly string[] }
  | { kind: "link"; before: string; href: string; label: string; after?: string }

export type LegalSection = {
  id: string
  title: string
  blocks: readonly LegalBlock[]
}

export const websiteTerms = {
  eyebrow: "Terms",
  title: "Website terms",
  lead: "These terms cover use of the Telloya marketing website, including an enquiry or a request for a personalised demonstration.",
  sections: [
    {
      id: "operator",
      title: "Who operates this website",
      blocks: [
        { kind: "p", text: "Telloya is an AI receptionist service operated by ProfileRelaunch Ltd, company number 17520826. The company is registered in England and Wales. The registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom." },
        { kind: "link", before: "Questions about these terms can be sent to ", href: "mailto:contact@profilerelaunch.com", label: "contact@profilerelaunch.com", after: "." },
      ],
    },
    {
      id: "purpose",
      title: "What this website is for",
      blocks: [
        { kind: "p", text: "This website explains Telloya for businesses that miss calls while they are working. It describes how an enquiry can be handled, shows published prices, and gives you a way to ask for a conversation." },
        { kind: "p", text: "The film and the browser walkthrough are illustrations. They do not place a telephone call, save an enquiry, or show a recording of a customer." },
      ],
    },
    {
      id: "enquiries",
      title: "Enquiries and demonstration requests",
      blocks: [
        { kind: "p", text: "Sending the enquiry form asks ProfileRelaunch to review what you have sent. A request for a personalised demonstration asks us to review your requirements and, if we can support them, arrange a time for you to call a demonstration number." },
        { kind: "p", text: "Submitting the form does not take payment, start a subscription, or create a client relationship. It does not confirm a demonstration appointment. We arrange a demonstration manually after reviewing the enquiry, and a particular time is not guaranteed." },
        { kind: "p", text: "A confirmation email, when it is sent, means the message was handed to the email provider. That does not confirm the message has arrived in your inbox." },
      ],
    },
    {
      id: "prices",
      title: "Published prices",
      blocks: [
        { kind: "p", text: "Prices on this website are information. They are in GBP. Choosing a plan on the enquiry form does not accept that plan, take payment, or start the service." },
        { kind: "p", text: vatStatement },
        { kind: "p", text: "This statement describes the current position. It does not say that registration can never become necessary." },
        { kind: "p", text: "A standard plan is shown as one operating location and one receptionist telephone number. Extra locations or numbers, and complex setup, are quoted separately. Saying that you are interested in extra minutes does not authorise a charge. This website does not offer local-currency checkout or conversion." },
      ],
    },
    {
      id: "your-information",
      title: "Information you send",
      blocks: [
        { kind: "p", text: "You are responsible for the accuracy of what you send, and for having authority to send it. Do not include passwords, verification codes, or payment card details." },
        { kind: "p", text: "You may not use this website to interfere with its security or availability, send automated or abusive messages, attempt to gain unauthorised access, send harmful code, or misuse another person's information. We may refuse a submission that appears to do so." },
      ],
    },
    {
      id: "availability",
      title: "Availability and other websites",
      blocks: [
        { kind: "p", text: "We aim to keep this website available, but it may be interrupted or unavailable. These terms do not promise a response time or that every submission will be delivered." },
        { kind: "p", text: "Links to ProfileRelaunch, a telephone provider, or another site leave this website. Those destinations have their own terms. ProfileRelaunch is responsible for the Telloya pages it operates, not for a third party's site." },
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      blocks: [
        { kind: "p", text: "The design, text, film and other content of this website belong to ProfileRelaunch Ltd or its licensors, unless a page says otherwise. You may view the pages for your own business. You may not copy the site and present it as your own service, or use the Telloya name to suggest a partnership that does not exist." },
      ],
    },
    {
      id: "privacy",
      title: "Privacy and cookies",
      blocks: [
        { kind: "link", before: "The ", href: "/privacy", label: "privacy notice", after: " explains what the enquiry form collects and where an accepted enquiry goes." },
        { kind: "link", before: "The ", href: "/cookies", label: "cookie notice", after: " explains necessary storage and optional analytics on this website." },
      ],
    },
    {
      id: "paid-service",
      title: "A future paid service",
      blocks: [
        { kind: "p", text: "These website terms are not the agreement for a paid Telloya subscription. A paid service would need a separate agreement, accepted for a stated price, before it starts. That agreement is a separate piece of work and is not published here." },
        { kind: "p", text: "Governing law, jurisdiction, liability and service credits are not set out in these terms. They remain for legal review and must not be inferred from this page." },
      ],
    },
  ],
} as const satisfies { eyebrow: string; title: string; lead: string; sections: readonly LegalSection[] }

export const privacyNotice = {
  eyebrow: "Privacy",
  title: "Privacy notice",
  lead: "This notice explains what the Telloya marketing website collects when you enquire, and what is confirmed about the systems that handle that enquiry.",
  sections: [
    {
      id: "status",
      title: "Status of this notice",
      blocks: [
        { kind: "p", text: legalReviewBanner },
        { kind: "p", text: "The description of the enquiry form, email, storage, hosting, film delivery and optional analytics follows the current marketing site. Lawful basis, processor contracts, international transfers and automatic deletion have not had a completed legal assessment. Where a control is not yet operating, this notice says so." },
      ],
    },
    {
      id: "operator",
      title: "Who is responsible",
      blocks: [
        { kind: "p", text: "ProfileRelaunch Ltd operates this website. The company number is 17520826. The registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom." },
        { kind: "link", before: "Privacy questions can be sent to ", href: "mailto:contact@profilerelaunch.com", label: "contact@profilerelaunch.com", after: "." },
        { kind: "p", text: "ProfileRelaunch also publishes a company privacy notice for its other website. That notice does not, by itself, describe Telloya voice calls." },
        { kind: "link", before: "The company notice is at ", href: "https://profilerelaunch.com/privacy", label: "profilerelaunch.com/privacy", after: "." },
      ],
    },
    {
      id: "collected",
      title: "Information from an enquiry",
      blocks: [
        { kind: "p", text: "You do not need an account to send an enquiry. The form asks for your business name, country, trade, contact name, email address and phone number, and for confirmation that you have read this notice." },
        { kind: "p", text: "Depending on the choices you make, it may also include:" },
        {
          kind: "list",
          items: [
            "the plan you are asking about, or a request for help choosing one",
            "whether you are interested in optional Relaunch Guard, and how many Guard locations",
            "questions you would like the receptionist to ask",
            "your phone setup, missed-call situation, website, and the best time to contact you",
            "a preferred voice, accent, language or speaking style",
            "for a quotation, the locations, numbers, minutes, languages or other requirements you describe",
            "whether you are interested in extra minutes, and a proposed monthly spending cap",
            "the fact that you asked for a personalised demonstration, when that is the enquiry you sent",
          ],
        },
        { kind: "p", text: "The form does not ask for payment card details. A personalised-demonstration request is stored as that request. It is not stored as a confirmed appointment." },
        { kind: "p", text: "If the enquiry is accepted, you receive a reference beginning with TY. The saved record also includes the time it was received and whether an acknowledgement email was requested, sent, skipped or unavailable." },
      ],
    },
    {
      id: "purpose",
      title: "Why an enquiry is used",
      blocks: [
        { kind: "p", text: "An accepted enquiry is used to reply to you, to understand the plan and setup you described, and, when you asked for one, to consider a personalised demonstration. It is also used to send the messages described below and to reduce abusive submissions." },
        { kind: "p", text: "A proposed basis for review, which is not a completed legal assessment, is that the enquiry is handled because you asked us to respond, and that a record is kept so we can answer you and protect the form. Optional analytics, described below, is used only after you accept it. Do not treat this paragraph as a legal conclusion." },
      ],
    },
    {
      id: "where",
      title: "Where an enquiry goes",
      blocks: [
        { kind: "p", text: "An accepted enquiry is stored in Supabase so the team can read it and keep its reference. Staff who handle Telloya enquiries can read that record." },
        { kind: "p", text: "Resend sends an internal notification to the Telloya team. When acknowledgements are enabled, Resend also sends a confirmation to the email address on the form. Acceptance of that message by the email provider does not confirm it reached your inbox." },
        { kind: "p", text: "This website is hosted on Vercel. Ordinary operation of the host may include technical request details such as an IP address, browser type and the time of a request. This notice does not list any host log that has not been confirmed field by field." },
        { kind: "p", text: "If you press play on the illustrative film, your browser loads that film from Cloudflare Stream. The film is not a recording of a customer. This notice does not describe every detail Cloudflare may process when the player loads." },
        { kind: "p", text: "These names describe the systems used by the current marketing site. This notice does not set out a signed processor contract, and it does not promise a particular security outcome." },
      ],
    },
    {
      id: "analytics",
      title: "Optional analytics",
      blocks: [
        { kind: "p", text: "Telloya can use its own Google Analytics 4 property, separate from the ProfileRelaunch website. Analytics stays off until you accept it. Browsing the site is not treated as consent. If no measurement ID is configured, no analytics script is loaded." },
        { kind: "p", text: "Analytics is used to understand how this public website is used. It is not used for advertising. Page measurement uses the page path only. The enquiry form's answers, your name, email, phone number, business name and enquiry reference are not sent to Google Analytics." },
        { kind: "p", text: "If you have accepted analytics and an enquiry is newly saved, one lead event can include the plan name and whether you were interested in Relaunch Guard. It does not include your contact details or reference." },
        { kind: "link", before: "The ", href: "/cookies", label: "cookie notice", after: " explains how to reject analytics or withdraw an earlier choice. Withdrawal stops later measurement from this site. It does not delete information Google may already have received." },
      ],
    },
    {
      id: "demonstrations",
      title: "Personalised demonstration calls",
      blocks: [
        { kind: "p", text: "The film and the on-screen walkthrough do not place a telephone call. A personalised demonstration, when one is arranged, is a live telephone conversation with an AI receptionist." },
        { kind: "p", text: "During that conversation, audio and speech are processed temporarily so the AI can respond." },
        { kind: "p", text: "The current demonstration agent is configured so that its normal call history does not keep the full call audio or a full transcript. A telephone test of this demonstration showed basic call metadata in that history. A full recording, a full transcript and a post-call extracted summary were not available there. Basic operational call metadata may still be kept by the voice provider." },
        { kind: "p", text: "No agent-level or account-level webhook destination is configured for this demonstration. The demonstration does not currently provide a persisted structured enquiry summary through the Telloya application. Post-call extraction fields are set on the demonstration agent, but this notice does not confirm that those fields are stored or delivered." },
        { kind: "p", text: "ProfileRelaunch does not authorise the content of a demonstration call for AI training. An account-specific contractual opt-out with the voice provider has not been confirmed, so this notice does not guarantee that the voice provider excludes caller content from training." },
        { kind: "p", text: "These points describe the current demonstration agent. They do not describe every agent a future paid subscription might use. Recording, retention and transfer practices for a future subscription are covered separately." },
      ],
    },
    {
      id: "retention",
      title: "How long an enquiry is kept",
      blocks: [
        { kind: "p", text: "The business target for an ordinary marketing enquiry is 90 days, unless the law requires it to be kept for longer or it is needed to deal with a request you have made." },
        { kind: "p", text: "A deletion function for those enquiries has been prepared. Destructive deletion is switched off, and no scheduled job runs the function. Automatic deletion after 90 days is not operating. The saved enquiry, its event history, and the record of whether an email was accepted may therefore remain for longer than 90 days. This notice does not claim that a copy held by the email provider, or a backup held by a provider, is deleted on that timetable." },
        { kind: "p", text: "This 90-day target covers an ordinary marketing enquiry on this website. It does not set retention for a future paid subscription, including call audio, transcripts, summaries or billing records." },
      ],
    },
    {
      id: "international",
      title: "Where information may be processed",
      blocks: [
        { kind: "p", text: "The providers named on this page may process information in more than one country. This notice does not promise that every copy stays in the United Kingdom, and it does not describe a completed international-transfer arrangement. That remains for legal review." },
        { kind: "p", text: "The current personalised demonstration uses Retell as the voice provider. This notice does not state a processing country for that demonstration, because one has not been confirmed for publication." },
      ],
    },
    {
      id: "rights",
      title: "Your privacy rights",
      blocks: [
        { kind: "p", text: "Where data-protection law gives you these rights, you can ask for access to personal information, correction, deletion, restriction of processing, or objection, or for a copy of information you provided. The rights that apply depend on your situation." },
        { kind: "p", text: "To make a request, email the address above. We may ask for enough information to find the enquiry and to check that we are dealing with the right person. You may also be able to complain to a supervisory authority where you live, work, or where you believe a problem occurred." },
        { kind: "p", text: "Asking for deletion does not, by itself, show that the 90-day deletion control described above is already running." },
      ],
    },
    {
      id: "changes",
      title: "Changes",
      blocks: [
        { kind: "p", text: `This notice may be updated when the website changes. The review date is ${legalReviewDate}.` },
      ],
    },
  ],
} as const satisfies { eyebrow: string; title: string; lead: string; sections: readonly LegalSection[] }

export const demonstrationPrivacyNote =
  "How that demonstration call is handled is explained in the privacy notice."
