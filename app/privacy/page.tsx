import type { Metadata } from "next"
import Link from "next/link"
import { LegalCallout, LegalPage, type LegalSection } from "@/components/legal-page"
import { feeWording, hasLegalValue, legalIdentity } from "@/lib/legal"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

const title = "Privacy notice | ReputeDefend"
const description = "How ReputeDefend handles information submitted through this website, including general enquiries and case-intake submissions."

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
        <p>This notice explains how {legalIdentity.tradingName} handles information that visitors may submit through this website. It reflects the current site: public information pages and enquiry forms. It is not an account product, a customer dashboard or a payment system.</p>
        <p>Submitting a form does not, by itself, create a client or paid-service relationship. Any later support, and any associated fees, are explained before you decide how to proceed.</p>
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
        <p>The short homepage form may include your name, email address, optional business name, the type of help you select, and a description of what happened or what you need.</p>
        <h3>Contact form</h3>
        <p>A general message may include your name, email address, optional business name, a subject (such as a general question, service question, partnership or media enquiry), and your message. Older contact submissions may instead include a service type rather than a subject.</p>
        <h3>Get Help case intake</h3>
        <p>A case submission may include:</p>
        <ul>
          <li>the type of help needed</li>
          <li>your name and email address</li>
          <li>optional phone number</li>
          <li>business name and country</li>
          <li>optional website, Business Profile or review URLs</li>
          <li>an account of what happened, including dates, messages or steps already taken</li>
          <li>confirmation that the information is accurate to the best of your knowledge</li>
          <li>confirmation that you have read this privacy information</li>
        </ul>
        <p>We also record which form you used, so that a general question and a case submission can be handled appropriately.</p>
        <h3>Technical information</h3>
        <p>The systems used to operate this website may automatically record ordinary technical details, such as IP address, browser type and the time of a request, as part of running the site securely and reducing abuse. This website does not run advertising, profiling or analytics products.</p>
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
          <li>respond to an enquiry</li>
          <li>assess a case you have asked us to look at</li>
          <li>communicate about requested support</li>
          <li>ask for clarification where the information is incomplete</li>
          <li>maintain reasonable security and reduce automated or abusive submissions</li>
        </ul>
        <p>We do not sell the information you submit. We do not use it for advertising, profiling or analytics. We do not use it to create an account or take payment, because this website does not collect payments or provide a customer login.</p>
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
        <p>On Get Help, the accuracy and privacy confirmations record that you have checked the information and have read this notice. They are not used as marketing consent.</p>
      </>
    ),
  },
  {
    id: "what-not-to-send",
    title: "What not to send",
    content: (
      <>
        <p>Please do not include passwords, verification codes, account credentials or unnecessary sensitive personal information. A useful enquiry can be based on public links, the wording of platform messages and a factual account of what happened.</p>
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
        <p>This website does not use advertising cookies, analytics cookies or a cookie banner, because it does not run advertising or analytics tracking. There is no account registration, customer dashboard or payment collection.</p>
        <p>Typefaces used on the site are prepared during the website build and served from this site. We do not load a separate advertising or analytics script.</p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Service providers",
    content: (
      <>
        <p>ReputeDefend reviews submissions. Enquiry messages are delivered by email using Resend so that we can receive and review them. Resend processes that information only to provide that email delivery service. This notice does not describe Resend’s hosting locations, retention rules or other contractual terms.</p>
        {hasLegalValue(legalIdentity.enquiryProcessorName) || hasLegalValue(legalIdentity.hostingProvider) ? (
          <ul>
            {hasLegalValue(legalIdentity.hostingProvider) ? <li>Website hosting: {legalIdentity.hostingProvider}</li> : null}
            {hasLegalValue(legalIdentity.enquiryProcessorName) ? <li>Enquiry email delivery: {legalIdentity.enquiryProcessorName}</li> : null}
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
      </>
    ),
  },
  {
    id: "international-processing",
    title: "Where information may be processed",
    content: (
      <>
        <p>If a technical provider is used to host the website or receive messages, information may be processed in more than one country. We do not describe a specific country-to-country transfer in this notice.</p>
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
        {hasLegalValue(legalIdentity.contactEmail) ? <p>You can also write to {legalIdentity.contactEmail}.</p> : null}
        {hasLegalValue(legalIdentity.postalAddress) ? <p>Postal correspondence: {legalIdentity.postalAddress}.</p> : null}
        {hasLegalValue(legalIdentity.legalName) ? <p>The organisation responsible for this website is {legalIdentity.legalName}{hasLegalValue(legalIdentity.registrationNumber) ? `, registration number ${legalIdentity.registrationNumber}` : ""}.</p> : null}
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
      eyebrow="Privacy"
      title="Privacy notice"
      lead="This notice describes the information visitors may submit through ReputeDefend, why it is used, and the limits of what this website collects."
      currentPath="/privacy"
      sections={sections}
    />
  )
}
