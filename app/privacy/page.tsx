import type { Metadata } from "next"
import Link from "next/link"
import { pageTitle } from "@/lib/brand"
import { LegalCallout, LegalPage, type LegalSection } from "@/components/legal-page"
import { feeWording, hasLegalValue, legalIdentity, showsCompanyRegistration, tradingAsLine } from "@/lib/legal"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  privacyAnalytics,
  privacyCaseFields,
  privacyContactFields,
  privacyCovers,
  privacyHero,
  privacyHomepageFields,
  privacyMarketing,
  privacyNoPayment,
  privacyNoUpload,
  privacySeo,
  privacyUses,
} from "./content"

const title = pageTitle(privacySeo.titlePage)
const description = privacySeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/privacy" },
  openGraph: socialOpenGraph({ title, description, path: "/privacy" }),
  twitter: socialTwitter({ title, description }),
}

const sections: LegalSection[] = [
  {
    id: "what-this-notice-covers",
    title: "What this notice covers",
    content: (
      <>
        {privacyCovers.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </>
    ),
  },
  {
    id: "information-collected",
    title: "Information you may submit",
    content: (
      <>
        <p>We do not ask you to create an account. Information reaches us only if you choose to send a form. What we receive depends on which form you use.</p>
        <h3>Homepage enquiry</h3>
        <p>The short homepage form may include {privacyHomepageFields.join(", ")}.</p>
        <h3>Contact form</h3>
        <p>A general message may include {privacyContactFields.join("; ")}. Older contact submissions may instead include a service type rather than a subject.</p>
        <h3>Get Help case intake</h3>
        <p>A case submission may include:</p>
        <ul>
          {privacyCaseFields.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p>{privacyNoUpload}</p>
        <p>We also record which form you used, so that a general question and a case submission can be handled appropriately.</p>
        <h3>Technical information</h3>
        <p>The systems used to operate this website may automatically record ordinary request-level technical details as part of running the site securely and reducing abuse. That can include information such as IP address, browser type and the time of a request where the hosting or security systems provide it. We do not list fields a hosting platform has not been confirmed to record.</p>
      </>
    ),
  },
  {
    id: "how-information-is-used",
    title: "How information is used",
    content: (
      <>
        <p>If a submission is received, we use it to:</p>
        <ul>
          {privacyUses.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p>{privacyNoPayment}</p>
        <p>{feeWording}</p>
      </>
    ),
  },
  {
    id: "legal-basis",
    title: "Legal basis",
    content: (
      <>
        <p>Where data protection law requires a legal basis, we process a submission because you have asked us to look at a question or a case. That is usually necessary to take steps at your request, or because we have a legitimate interest in responding to a business enquiry, assessing the information you sent and protecting the service against abuse.</p>
        <p>Optional analytics, when configured, is used only after you accept it. Consent is the model this website uses for that analytics. We do not invent a different lawful basis to avoid asking.</p>
        <p>{privacyMarketing}</p>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Optional analytics",
    content: (
      <>
        {privacyAnalytics.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <p>The <Link href="/cookies">Cookie &amp; analytics notice</Link> explains the preference storage and how to change your choice.</p>
      </>
    ),
  },
  {
    id: "what-not-to-send",
    title: "What not to send",
    content: (
      <>
        <p>Please do not include passwords, OTPs, verification codes, account credentials or unnecessary sensitive personal information. A useful enquiry can be based on public links, the wording of platform messages and a factual account of what happened.</p>
        <p>If a situation later requires you to take an action inside your own account, that will be explained rather than handled through shared login details.</p>
        <LegalCallout>We may reject or ignore submissions that appear automated, abusive, or that include credentials or other information that should not be sent through this website.</LegalCallout>
      </>
    ),
  },
  {
    id: "cookies-and-tracking",
    title: "Cookies, accounts and tracking",
    content: (
      <>
        <p>This website does not use advertising cookies, session replay, heatmaps, Google Ads or social-media advertising tags. There is no account registration, customer dashboard or payment collection.</p>
        <p>If analytics is configured, a first-visit choice is shown so you can accept or reject it. Necessary storage can remember that choice. Typefaces used on the site are prepared during the website build and served from this site.</p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Service providers",
    content: (
      <>
        <p>{legalIdentity.tradingName} reviews submissions. Enquiry messages are delivered by email using Resend so that we can receive and review them. Resend processes that information only to provide that email delivery service. This notice does not describe Resend’s hosting locations, retention rules or other contractual terms.</p>
        <p>If Google Analytics is configured and you have accepted analytics, Google processes usage and technical information as the analytics provider. This notice does not invent processor contractual clauses.</p>
        {hasLegalValue(legalIdentity.enquiryProcessorName) || hasLegalValue(legalIdentity.hostingProvider) ? (
          <ul>
            {hasLegalValue(legalIdentity.hostingProvider) ? <li>Website hosting: {legalIdentity.hostingProvider}</li> : null}
            {hasLegalValue(legalIdentity.enquiryProcessorName) ? <li>Enquiry email delivery: {legalIdentity.enquiryProcessorName}</li> : null}
            <li>Optional website analytics: Google Analytics 4, only if configured and accepted</li>
          </ul>
        ) : null}
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention",
    content: (
      <>
        {hasLegalValue(legalIdentity.retentionPeriod) ? (
          <p>Enquiry information is kept for {legalIdentity.retentionPeriod}, unless a longer period is required to complete a request you have made or to meet a legal obligation.</p>
        ) : (
          <p>We keep enquiry information only for as long as it is needed to respond, assess the situation, communicate about requested support and meet any legal obligations that apply. There is no single published retention period that applies to every submission.</p>
        )}
        <p>We do not publish a Google Analytics retention duration. Any such period is determined by the configured Google property and is not established in this notice.</p>
      </>
    ),
  },
  {
    id: "international-processing",
    title: "Where information may be processed",
    content: (
      <>
        <p>If a technical provider is used to host the website, receive messages or provide optional analytics, information may be processed in more than one country. We do not promise that all information stays in the United Kingdom, and we do not describe a specific country-to-country transfer mechanism in this notice.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <>
        <p>We take reasonable steps to protect information submitted through this website, including validation of submissions and measures intended to reduce automated abuse. No method of sending or storing information is completely secure, and we do not promise that a submission cannot be intercepted or misused.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your privacy rights",
    content: (
      <>
        <p>Where applicable data protection law provides these rights, you may be able to ask for access to personal information, correction, erasure, restriction of processing, objection, or a copy of information you provided. The rights that apply depend on the law that covers your situation.</p>
        <p>To make a request, use the <Link href="/contact">Contact</Link> page. We may need to ask for enough information to understand the request and to confirm that we are dealing with the right person.</p>
      </>
    ),
  },
  {
    id: "contact-and-complaints",
    title: "Contact and complaints",
    content: (
      <>
        <p>Questions about this notice can be sent through the <Link href="/contact">Contact</Link> page or, if you already have an active case, through <Link href="/get-help">Get Help</Link>.</p>
        {hasLegalValue(legalIdentity.contactEmail) ? (
          <p>
            You can also write to{" "}
            <a href={`mailto:${legalIdentity.contactEmail}`}>{legalIdentity.contactEmail}</a>.
          </p>
        ) : null}
        <p>This website is operated by {tradingAsLine()}.</p>
        {hasLegalValue(legalIdentity.postalAddress) ? (
          <p>Correspondence may be sent to the business address shown below.</p>
        ) : null}
        {showsCompanyRegistration() ? (
          <p>Company number {legalIdentity.registrationNumber}.</p>
        ) : null}
        {hasLegalValue(legalIdentity.vatNumber) ? <p>VAT number {legalIdentity.vatNumber}.</p> : null}
        {hasLegalValue(legalIdentity.phone) ? <p>Telephone: {legalIdentity.phone}.</p> : null}
        <p>If data protection law gives you a right to complain to a supervisory authority, you may do so in the country where you live, work, or where you believe a problem occurred.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    content: (
      <>
        <p>We may update this notice when the website or our handling of information changes. The date at the top of this page shows when it was last revised.</p>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow={privacyHero.eyebrow}
      title={privacyHero.title}
      lead={privacyHero.lead}
      currentPath="/privacy"
      sections={sections}
    />
  )
}
